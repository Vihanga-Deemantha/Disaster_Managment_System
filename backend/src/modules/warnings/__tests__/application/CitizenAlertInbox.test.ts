import type { AlertNotification } from '../../domain/AlertNotification';
import type { Warning } from '../../domain/Warning';
import { CitizenAlertInbox, INBOX_LIMIT } from '../../application/CitizenAlertInbox';
import { createWarningsHarness } from '../../testing/harness';
import {
  aNotification,
  aRecipient,
  aTargetArea,
  aWarning,
  anIssuedWarning,
  citizens,
  HOUR,
  MESSAGES,
  MINUTE,
  NOW,
  result,
} from '../../testing/builders';

const OFFICER = 'usr-dmc-1';
const MAX = 3;

const inboxOf = (h: ReturnType<typeof createWarningsHarness>) =>
  new CitizenAlertInbox({ warnings: h.warnings, notifications: h.notifications, clock: h.clock });

/** A notification that reached the citizen on SMS at `NOW + minutes`. */
function delivered(id: string, warningId: string, citizenId = 'c-1', minutes = 0) {
  const notification = aNotification({ id, warningId, citizenId });
  notification.recordAttempts(
    [result('SMS', 'DELIVERED')],
    new Date(NOW.getTime() + minutes * MINUTE),
    MAX,
  );
  return notification;
}

/** The inbox over fixed answers, with spies on what it asked for. */
function stubbed(notifications: AlertNotification[], warnings: Warning[]) {
  const findDeliveredByCitizen = jest.fn(async () => notifications);
  const findByIds = jest.fn(async (ids: readonly string[]) =>
    warnings.filter((warning) => ids.includes(warning.warningId)),
  );
  const inbox = new CitizenAlertInbox({
    warnings: { findByIds },
    notifications: { findDeliveredByCitizen },
    clock: { now: () => NOW },
  });
  return { inbox, findDeliveredByCitizen, findByIds };
}

describe('UC-1 citizen inbox: CitizenAlertInbox.list', () => {
  it('starts empty, and says what time the server thinks it is', async () => {
    const h = createWarningsHarness({ recipients: citizens(1) });

    const inbox = await inboxOf(h).list('c-1');

    expect(inbox).toEqual({ alerts: [], serverTime: NOW });
  });

  it('lists the alert a citizen was sent, in their language, with its warning and the time it got through', async () => {
    const h = createWarningsHarness({
      recipients: [aRecipient({ citizenId: 'c-si', preferredLanguage: 'SI' })],
    });
    await h.add();
    await h.controller.issueWarning('W-1', OFFICER, { optionalChannels: [] });

    const { alerts } = await inboxOf(h).list('c-si');

    expect(alerts).toHaveLength(1);
    const [alert] = alerts;
    expect(alert?.notification.language).toBe('SI');
    expect(alert?.notification.content).toBe(MESSAGES.SI);
    expect(alert?.warning.warningId).toBe('W-1');
    expect(alert?.warning.status).toBe('ISSUED');
    expect(alert?.deliveredAt).toEqual(NOW);
  });

  it('shows each citizen their own alert only', async () => {
    const h = createWarningsHarness({ recipients: citizens(3) });
    await h.add();
    await h.controller.issueWarning('W-1', OFFICER, { optionalChannels: [] });
    const inbox = inboxOf(h);

    for (const citizenId of ['c-1', 'c-2', 'c-3']) {
      const { alerts } = await inbox.list(citizenId);
      expect(alerts.map((alert) => alert.notification.citizenId)).toEqual([citizenId]);
    }
    expect((await inbox.list('someone-else')).alerts).toEqual([]);
  });

  it('puts the newest alert first, whichever warning was issued first', async () => {
    const h = createWarningsHarness({ recipients: citizens(1) });
    await h.add(aWarning({ warningId: 'W-old' }));
    await h.add(aWarning({ warningId: 'W-new' }));
    await h.controller.issueWarning('W-old', OFFICER, { optionalChannels: [] });
    h.clock.advance(HOUR);
    await h.controller.issueWarning('W-new', OFFICER, { optionalChannels: [] });

    const { alerts } = await inboxOf(h).list('c-1');

    expect(alerts.map((alert) => alert.warning.warningId)).toEqual(['W-new', 'W-old']);
  });

  it('keeps the same order when two alerts got through at the same moment', async () => {
    const { inbox } = stubbed(
      [delivered('N-b', 'W-2'), delivered('N-a', 'W-1')],
      [anIssuedWarning({ warningId: 'W-1' }), anIssuedWarning({ warningId: 'W-2' })],
    );

    const { alerts } = await inbox.list('c-1');

    expect(alerts.map((alert) => alert.notification.notificationId)).toEqual(['N-a', 'N-b']);
  });

  it('orders by when the alert got through, not by the order the store returned them in', async () => {
    const { inbox } = stubbed(
      [delivered('N-1', 'W-1', 'c-1', 1), delivered('N-2', 'W-2', 'c-1', 9)],
      [anIssuedWarning({ warningId: 'W-1' }), anIssuedWarning({ warningId: 'W-2' })],
    );

    const { alerts } = await inbox.list('c-1');

    expect(alerts.map((alert) => alert.notification.notificationId)).toEqual(['N-2', 'N-1']);
  });

  it('does not show an alert until something got through to the citizen', async () => {
    const h = createWarningsHarness({ recipients: citizens(2) });
    await h.add();
    h.gateways.PUSH.failFor('TIMEOUT', 'c-1');
    h.gateways.SMS.failFor('TIMEOUT', 'c-1');
    await h.controller.issueWarning('W-1', OFFICER, { optionalChannels: [] });
    const inbox = inboxOf(h);

    expect((await h.notifications.findByWarning('W-1')).map((n) => n.overallStatus)).toEqual([
      'PENDING_RETRY',
      'DELIVERED',
    ]);
    expect((await inbox.list('c-1')).alerts).toEqual([]);
    expect((await inbox.list('c-2')).alerts).toHaveLength(1);
  });

  it('shows the alert once the retry gets through, stamped with the time of the retry', async () => {
    const h = createWarningsHarness({ recipients: citizens(1) });
    await h.add();
    h.gateways.PUSH.failFor('TIMEOUT', 'c-1');
    h.gateways.SMS.failFor('TIMEOUT', 'c-1');
    await h.controller.issueWarning('W-1', OFFICER, { optionalChannels: [] });
    h.gateways.PUSH.respond(() => ({ status: 'DELIVERED' }));
    h.gateways.SMS.respond(() => ({ status: 'DELIVERED' }));
    h.clock.advance(5 * MINUTE);

    await h.controller.retryFailed('W-1', OFFICER);

    const { alerts } = await inboxOf(h).list('c-1');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.deliveredAt).toEqual(new Date(NOW.getTime() + 5 * MINUTE));
  });

  it('still shows an alert that reached the citizen on SMS only, because they were reached', async () => {
    const h = createWarningsHarness({
      recipients: [
        aRecipient({ citizenId: 'c-1' }),
        aRecipient({ citizenId: 'c-2', deviceToken: undefined }),
      ],
    });
    await h.add();
    await h.controller.issueWarning('W-1', OFFICER, { optionalChannels: [] });

    const stored = await h.notifications.findByWarning('W-1');
    expect(
      stored
        .find((n) => n.citizenId === 'c-2')
        ?.latestAttempts()
        .map((a) => a.channel),
    ).toEqual(['SMS']);
    expect((await inboxOf(h).list('c-2')).alerts).toHaveLength(1);
  });

  it('hides an alert whose warning is not issued (still being sent, or rejected)', async () => {
    const pending = aWarning({ warningId: 'W-1' });
    const { inbox } = stubbed([delivered('N-1', 'W-1')], [pending]);

    expect((await inbox.list('c-1')).alerts).toEqual([]);
  });

  it('hides an alert whose warning no longer exists', async () => {
    const { inbox } = stubbed([delivered('N-1', 'W-gone')], []);

    expect((await inbox.list('c-1')).alerts).toEqual([]);
  });

  it('hides a notification that has nothing delivered on it, even if the store handed it over', async () => {
    const waiting = aNotification({ id: 'N-1', warningId: 'W-1' });
    const { inbox } = stubbed([waiting], [anIssuedWarning({ warningId: 'W-1' })]);

    expect((await inbox.list('c-1')).alerts).toEqual([]);
  });

  it('keeps the good alerts when others in the same list are hidden', async () => {
    const { inbox } = stubbed(
      [
        delivered('N-1', 'W-1', 'c-1', 3),
        delivered('N-2', 'W-gone', 'c-1', 2),
        delivered('N-3', 'W-3', 'c-1', 1),
      ],
      [anIssuedWarning({ warningId: 'W-1' }), anIssuedWarning({ warningId: 'W-3' })],
    );

    const { alerts } = await inbox.list('c-1');

    expect(alerts.map((alert) => alert.notification.notificationId)).toEqual(['N-1', 'N-3']);
  });

  it('asks the store for this citizen’s alerts only, and for no more than the inbox limit', async () => {
    const { inbox, findDeliveredByCitizen } = stubbed([], []);

    await inbox.list('citizen-42');

    expect(findDeliveredByCitizen).toHaveBeenCalledTimes(1);
    expect(findDeliveredByCitizen).toHaveBeenCalledWith('citizen-42', INBOX_LIMIT);
    expect(INBOX_LIMIT).toBe(100);
  });

  it('looks each warning up once, in a single request, however many alerts mention it', async () => {
    const { inbox, findByIds } = stubbed(
      [
        delivered('N-1', 'W-1', 'c-1', 2),
        delivered('N-2', 'W-1', 'c-1', 1),
        delivered('N-3', 'W-2', 'c-1', 0),
      ],
      [anIssuedWarning({ warningId: 'W-1' }), anIssuedWarning({ warningId: 'W-2' })],
    );

    await inbox.list('c-1');

    expect(findByIds).toHaveBeenCalledTimes(1);
    expect(findByIds).toHaveBeenCalledWith(['W-1', 'W-2']);
  });

  it('carries the warning’s own target area through, for the phone to name', async () => {
    const h = createWarningsHarness({
      recipients: [aRecipient({ citizenId: 'c-k', district: 'KALUTARA' })],
    });
    const kalutara = aTargetArea({ areaId: 'KALUTARA', name: 'Kalutara', district: 'KALUTARA' });
    await h.add(aWarning({ targetAreas: [kalutara] }));
    await h.controller.issueWarning('W-1', OFFICER, { optionalChannels: [] });

    const { alerts } = await inboxOf(h).list('c-k');

    expect(alerts[0]?.warning.targetAreas.map((area) => area.name)).toEqual(['Kalutara']);
  });
});
