import { AlertNotification } from '../../domain/AlertNotification';
import { createWarningsHarness, type WarningsHarness } from '../../testing/harness';
import {
  aRecipient,
  aTargetArea,
  aWarning,
  citizens,
  MESSAGES,
  NOW,
  result,
} from '../../testing/builders';

const OFFICER = 'usr-dmc-1';
const OTHER_OFFICER = 'usr-dmc-2';

const issue = (
  h: WarningsHarness,
  officer = OFFICER,
  optionalChannels: ('WHATSAPP' | 'EMAIL')[] = [],
) => h.controller.issueWarning('W-1', officer, { optionalChannels });

const noTallies = { sent: 0, delivered: 0, failed: 0 };

describe('UC-1 steps 6 to 14: WarningController.issueWarning, the main flow', () => {
  it('UC-1 steps 8 to 14: alerts every citizen in the area on Push and SMS and summarises the delivery', async () => {
    const h = createWarningsHarness({ recipients: citizens(3) });
    await h.add();

    const view = await issue(h);

    expect(view.warning.status).toBe('ISSUED');
    expect(view.allChannelsUnavailable).toBe(false);
    expect(view.result).toEqual({
      targeted: 3,
      reached: 3,
      pendingRetry: 0,
      failed: 0,
      byChannel: {
        PUSH: { sent: 3, delivered: 3, failed: 0 },
        SMS: { sent: 3, delivered: 3, failed: 0 },
        WHATSAPP: noTallies,
        EMAIL: noTallies,
      },
    });
  });

  it('UC-1 step 9: creates one notification per citizen, in that citizen’s own language', async () => {
    const h = createWarningsHarness({
      recipients: [
        aRecipient({ citizenId: 'c-si', preferredLanguage: 'SI' }),
        aRecipient({ citizenId: 'c-ta', preferredLanguage: 'TA' }),
        aRecipient({ citizenId: 'c-en', preferredLanguage: 'EN' }),
      ],
    });
    await h.add();

    await issue(h);

    const stored = await h.notifications.findByWarning('W-1');
    expect(stored.map((n) => [n.citizenId, n.language, n.content])).toEqual(
      expect.arrayContaining([
        ['c-si', 'SI', MESSAGES.SI],
        ['c-ta', 'TA', MESSAGES.TA],
        ['c-en', 'EN', MESSAGES.EN],
      ]),
    );
    expect(stored).toHaveLength(3);
    expect(
      h.gateways.SMS.calls.map((c) => [c.recipient.citizenId, c.notification.content]),
    ).toEqual(expect.arrayContaining([['c-ta', MESSAGES.TA]]));
  });

  it('UC-1 steps 7 and 13: stores who approved, when, and when it was issued', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.add();
    h.clock.advance(60_000);

    await issue(h);

    expect(h.warnings.stored('W-1')).toMatchObject({
      status: 'ISSUED',
      approvedBy: OFFICER,
      approvedAt: new Date(NOW.getTime() + 60_000),
      issuedAt: new Date(NOW.getTime() + 60_000),
    });
  });

  it('UC-1 step 13: publishes WarningIssued with exactly the contracted payload', async () => {
    const h = createWarningsHarness({ recipients: citizens(3) });
    await h.add();

    await issue(h);

    expect(h.events.ofType('WarningIssued')).toEqual([
      {
        type: 'WarningIssued',
        warningId: 'W-1',
        hazardType: 'FLOOD',
        severity: 'HIGH',
        targetArea: { type: 'DISTRICT', id: 'GAMPAHA', name: 'Gampaha', district: 'GAMPAHA' },
        issuedAt: NOW.toISOString(),
        targetedCitizens: 3,
        reached: 3,
        pendingRetry: 0,
        failed: 0,
        byChannel: {
          PUSH: { sent: 3, delivered: 3, failed: 0 },
          SMS: { sent: 3, delivered: 3, failed: 0 },
          WHATSAPP: noTallies,
          EMAIL: noTallies,
        },
      },
    ]);
  });

  it('UC-1 BR4: audits the approval and the issue, by the officer, without message text or contact details', async () => {
    const h = createWarningsHarness({ recipients: citizens(2) });
    await h.add();

    await issue(h);

    expect(h.audit.actions()).toEqual(['warning.approved', 'warning.issued']);
    expect(h.audit.find('warning.issued')).toMatchObject({
      actorId: OFFICER,
      actorRole: 'DMC_OFFICER',
      subjectType: 'warning',
      subjectId: 'W-1',
      occurredAt: NOW,
      details: { targeted: 2, reached: 2 },
    });
    const everything = JSON.stringify(h.audit.entries);
    expect(everything).not.toContain('Flood warning');
    expect(everything).not.toContain('+94771234567');
    expect(everything).not.toContain('Citizen 1');
  });

  it('UC-1 SD1-05: the warning is not marked issued until the delivery attempts are recorded', async () => {
    const seen: string[] = [];
    const h: WarningsHarness = createWarningsHarness({
      recipients: [aRecipient()],
      gate: async () => {
        const warning = await h.warnings.findById('W-1');
        const saved = await h.notifications.findByWarning('W-1');
        seen.push(`${warning?.status}/${warning?.isApproved}/${saved.length}`);
      },
    });
    await h.add();

    await issue(h);

    // While Push and SMS were being sent: still pending, already claimed, notifications already saved.
    expect(seen).toEqual(['PENDING_APPROVAL/true/1', 'PENDING_APPROVAL/true/1']);
    expect(h.warnings.stored('W-1')?.status).toBe('ISSUED');
  });

  it('UC-1 step 11: sends WhatsApp and Email only when ticked and the citizen opted in', async () => {
    const h = createWarningsHarness({
      recipients: [
        aRecipient({
          citizenId: 'c-1',
          whatsappOptIn: true,
          emailOptIn: true,
          email: 'a@example.test',
        }),
        aRecipient({ citizenId: 'c-2', whatsappOptIn: false, emailOptIn: false }),
      ],
    });
    await h.add();

    const view = await issue(h, OFFICER, ['WHATSAPP', 'EMAIL']);

    expect(h.gateways.WHATSAPP.calls.map((c) => c.recipient.citizenId)).toEqual(['c-1']);
    expect(h.gateways.EMAIL.calls.map((c) => c.recipient.citizenId)).toEqual(['c-1']);
    expect(view.result.byChannel.WHATSAPP).toEqual({ sent: 1, delivered: 1, failed: 0 });
  });

  it('UC-1 step 11: leaves the optional channels alone when they are not ticked, even for opted-in citizens', async () => {
    const h = createWarningsHarness({
      recipients: [aRecipient({ whatsappOptIn: true, emailOptIn: true, email: 'a@example.test' })],
    });
    await h.add();

    await issue(h);

    expect(h.gateways.WHATSAPP.calls).toHaveLength(0);
    expect(h.gateways.EMAIL.calls).toHaveLength(0);
  });

  it('UC-1 step 8 (SD1-03): alerts the citizens of every target area, each one once even if the areas overlap', async () => {
    const h = createWarningsHarness({
      recipients: [
        aRecipient({ citizenId: 'in-both', riverBasinId: 'basin-kelani' }),
        aRecipient({ citizenId: 'district-only' }),
        aRecipient({ citizenId: 'basin-only', district: 'COLOMBO', riverBasinId: 'basin-kelani' }),
        aRecipient({ citizenId: 'elsewhere', district: 'KANDY' }),
      ],
    });
    await h.add(
      aWarning({
        targetAreas: [
          aTargetArea(),
          aTargetArea({ areaId: 'basin-kelani', type: 'RIVER_BASIN', name: 'Kelani Ganga' }),
        ],
      }),
    );

    const view = await issue(h);

    expect(view.result.targeted).toBe(3);
    expect(h.gateways.PUSH.calls.map((c) => c.recipient.citizenId).sort()).toEqual([
      'basin-only',
      'district-only',
      'in-both',
    ]);
  });

  it('UC-1 step 13: names the first target area in the event, but its totals cover every area', async () => {
    const h = createWarningsHarness({
      recipients: [
        aRecipient({ citizenId: 'a' }),
        aRecipient({ citizenId: 'b', district: 'COLOMBO', riverBasinId: 'basin-kelani' }),
      ],
    });
    await h.add(
      aWarning({
        targetAreas: [
          aTargetArea({ areaId: 'basin-kelani', type: 'RIVER_BASIN', name: 'Kelani Ganga' }),
          aTargetArea(),
        ],
      }),
    );

    await issue(h);

    const [event] = h.events.ofType('WarningIssued');
    expect(event?.targetArea).toEqual({
      type: 'RIVER_BASIN',
      id: 'basin-kelani',
      name: 'Kelani Ganga',
      district: 'GAMPAHA',
    });
    expect(event?.targetedCitizens).toBe(2);
  });
});

describe('UC-1 A1: partial channel failure', () => {
  it('UC-1 A1: a citizen whose push fails but whose SMS arrives is still reached; the push is scheduled for retry', async () => {
    const h = createWarningsHarness({ recipients: citizens(4) });
    await h.add();
    h.gateways.PUSH.failFor('DEVICE_UNREACHABLE', 'c-2');

    const view = await issue(h);

    expect(view.warning.status).toBe('ISSUED');
    expect(view.result).toMatchObject({ targeted: 4, reached: 4, pendingRetry: 0, failed: 0 });
    expect(view.result.byChannel.PUSH).toEqual({ sent: 4, delivered: 3, failed: 1 });
    expect(view.result.byChannel.SMS).toEqual({ sent: 4, delivered: 4, failed: 0 });
    const stored = await h.notifications.findByWarning('W-1');
    const failed = stored.find((n) => n.citizenId === 'c-2');
    expect(failed?.nextRetryAt).toEqual(new Date(NOW.getTime() + 30_000));
  });

  it('UC-1 step 10: a gateway that crashes for one citizen does not stop the warning going to the rest', async () => {
    const h = createWarningsHarness({ recipients: citizens(3) });
    await h.add();
    h.gateways.SMS.throwFor('c-2');

    const view = await issue(h);

    expect(view.warning.status).toBe('ISSUED');
    expect(view.result).toMatchObject({ targeted: 3, reached: 3 });
    expect(view.result.byChannel.SMS).toEqual({ sent: 3, delivered: 2, failed: 1 });
  });
});

describe('UC-1 E2: gateways unavailable', () => {
  it('UC-1 E2: with every gateway down, the warning is still issued and every notification waits for a retry', async () => {
    const h = createWarningsHarness({ recipients: citizens(3) });
    await h.add();
    h.gateways.PUSH.goDown();
    h.gateways.SMS.goDown();

    const view = await issue(h);

    expect(view.warning.status).toBe('ISSUED');
    expect(view.allChannelsUnavailable).toBe(true);
    expect(view.result).toMatchObject({ targeted: 3, reached: 0, pendingRetry: 3, failed: 0 });
    expect(view.result.byChannel.PUSH).toEqual(noTallies);
    expect(h.gateways.PUSH.calls).toHaveLength(0);
    const stored = await h.notifications.findByWarning('W-1');
    expect(stored.every((n) => n.nextRetryAt?.getTime() === NOW.getTime() + 30_000)).toBe(true);
  });

  it('UC-1 E2: tells UC-4 what really happened, nobody reached yet', async () => {
    const h = createWarningsHarness({ recipients: citizens(2) });
    await h.add();
    h.gateways.PUSH.goDown();
    h.gateways.SMS.goDown();

    await issue(h);

    expect(h.events.ofType('WarningIssued')[0]).toMatchObject({
      targetedCitizens: 2,
      reached: 0,
      pendingRetry: 2,
      failed: 0,
    });
  });

  it('UC-1 E2: a citizen with no push token and no phone is counted as failed and kept for follow-up', async () => {
    const h = createWarningsHarness({
      recipients: [
        aRecipient({ citizenId: 'c-1' }),
        aRecipient({ citizenId: 'c-2', deviceToken: undefined, phone: undefined }),
      ],
    });
    await h.add();

    const view = await issue(h);

    expect(view.result).toMatchObject({ targeted: 2, reached: 1, pendingRetry: 0, failed: 1 });
    const stored = await h.notifications.findByWarning('W-1');
    expect(stored.find((n) => n.citizenId === 'c-2')?.isUnreachable).toBe(true);
    expect(h.gateways.PUSH.calls.map((c) => c.recipient.citizenId)).toEqual(['c-1']);
  });
});

describe('UC-1 E1: validation', () => {
  it('UC-1 E1: refuses an invalid warning, lists every bad field, and sends, saves and publishes nothing', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.add(aWarning({ messages: { ...MESSAGES, TA: '', EN: 'x'.repeat(161) } }));

    await expect(issue(h)).rejects.toMatchObject({
      kind: 'VALIDATION',
      code: 'WARNING_NOT_VALID',
      message: 'The warning cannot be issued as it stands.',
      fields: [
        { field: 'messages.TA', code: 'MESSAGE_REQUIRED' },
        { field: 'messages.EN', code: 'SMS_TOO_LONG' },
      ],
    });

    expect(h.warnings.stored('W-1')).toMatchObject({ version: 1, status: 'PENDING_APPROVAL' });
    expect(h.warnings.stored('W-1')?.approvedAt).toBeUndefined();
    expect(h.gateways.PUSH.calls).toHaveLength(0);
    expect(h.gateways.SMS.calls).toHaveLength(0);
    expect(h.events.published).toEqual([]);
    expect(h.audit.entries).toEqual([]);
    expect(await h.notifications.findByWarning('W-1')).toEqual([]);
  });

  it('UC-1 E1: refuses a warning whose validity has already ended', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.add(aWarning({ validFrom: new Date(NOW.getTime() - 7_200_000), validTo: NOW }));

    await expect(issue(h)).rejects.toMatchObject({
      code: 'WARNING_NOT_VALID',
      fields: [{ field: 'validTo', code: 'VALIDITY_EXPIRED' }],
    });
  });

  it('UC-1 E1: once the officer has fixed the problem, the same warning can be issued', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.add(aWarning({ messages: { ...MESSAGES, SI: '' } }));
    await expect(issue(h)).rejects.toMatchObject({ code: 'WARNING_NOT_VALID' });

    await h.controller.updateWarning('W-1', OFFICER, { messages: { SI: MESSAGES.SI } }, 1);

    await expect(issue(h)).resolves.toMatchObject({ warning: expect.anything() });
  });
});

describe('UC-1 BR2 and BR5: who may issue, and only once', () => {
  it('DMC policy: the submitting DMC officer can issue their own warning', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.add(aWarning({ submittedBy: OFFICER }));

    await issue(h, OFFICER);
    expect(h.warnings.stored('W-1')).toMatchObject({ status: 'ISSUED', approvedBy: OFFICER });
    expect(h.gateways.SMS.calls).toHaveLength(1);
  });

  it('UC-1 BR2: a second DMC Officer can issue what the first one submitted', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.add(aWarning({ submittedBy: OFFICER }));

    const view = await issue(h, OTHER_OFFICER);

    expect(view.warning.status).toBe('ISSUED');
    expect(h.warnings.stored('W-1')?.approvedBy).toBe(OTHER_OFFICER);
  });

  it('UC-1 BR5: issuing a warning that was already issued is refused as "not pending" and sends nothing again', async () => {
    const h = createWarningsHarness({ recipients: citizens(2) });
    await h.add();
    await issue(h);

    await expect(issue(h)).rejects.toMatchObject({ code: 'WARNING_NOT_PENDING', kind: 'CONFLICT' });

    expect(h.events.ofType('WarningIssued')).toHaveLength(1);
    expect(h.gateways.PUSH.calls).toHaveLength(2);
    expect(await h.notifications.findByWarning('W-1')).toHaveLength(2);
  });

  it('UC-1 BR5: a rejected warning cannot be issued, and says so rather than listing field errors', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.add();
    await h.controller.rejectWarning('W-1', OFFICER, 'Duplicate of W-9');

    await expect(issue(h)).rejects.toMatchObject({ code: 'WARNING_NOT_PENDING' });
  });

  it('UC-1 step 8: with nobody registered in the area it stops before claiming anything', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient({ district: 'KANDY' })] });
    await h.add();

    await expect(issue(h)).rejects.toMatchObject({
      code: 'NO_RECIPIENTS',
      kind: 'UNPROCESSABLE',
      message: 'Nobody is registered in the target area, so there is nobody to alert.',
    });

    expect(h.warnings.stored('W-1')).toMatchObject({ version: 1, status: 'PENDING_APPROVAL' });
    expect(h.warnings.stored('W-1')?.approvedAt).toBeUndefined();
    expect(h.audit.entries).toEqual([]);
    expect(h.events.published).toEqual([]);
  });

  it('UC-1 step 8: once someone registers in the area, the same warning can be issued', async () => {
    const h = createWarningsHarness();
    await h.add();
    await expect(issue(h)).rejects.toMatchObject({ code: 'NO_RECIPIENTS' });

    h.directory.add(aRecipient());

    await expect(issue(h)).resolves.toMatchObject({ result: { targeted: 1 } });
  });

  it('UC-1: reports an unknown warning as not found', async () => {
    const h = createWarningsHarness();

    await expect(issue(h)).rejects.toMatchObject({ code: 'WARNING_NOT_FOUND', kind: 'NOT_FOUND' });
  });
});

describe('UC-1 BR5: two issue attempts at once, and an interrupted one', () => {
  it('UC-1 BR5: loses the claim cleanly when someone else saved the warning first, and sends nothing', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.add();
    jest.spyOn(h.warnings, 'save').mockResolvedValueOnce(false);

    await expect(issue(h)).rejects.toMatchObject({ code: 'VERSION_CONFLICT', kind: 'CONFLICT' });

    expect(h.gateways.PUSH.calls).toHaveLength(0);
    expect(h.audit.entries).toEqual([]);
  });

  it('UC-1 BR5: after a crash between claiming and sending, the same officer can run it again and nobody is alerted twice', async () => {
    const h = createWarningsHarness({ recipients: citizens(3) });
    await h.add();
    jest.spyOn(h.notifications, 'insertMany').mockRejectedValueOnce(new Error('database is down'));

    await expect(issue(h)).rejects.toThrow('database is down');
    expect(h.warnings.stored('W-1')).toMatchObject({
      status: 'PENDING_APPROVAL',
      approvedBy: OFFICER,
    });
    expect(h.gateways.PUSH.calls).toHaveLength(0);

    const view = await issue(h);

    expect(view.warning.status).toBe('ISSUED');
    expect(await h.notifications.findByWarning('W-1')).toHaveLength(3);
    expect(h.gateways.PUSH.calls).toHaveLength(3);
    expect(h.events.ofType('WarningIssued')).toHaveLength(1);
  });

  it('UC-1 BR5: while one officer is issuing, another cannot take it over', async () => {
    const h = createWarningsHarness({ recipients: [aRecipient()] });
    await h.add();
    jest.spyOn(h.notifications, 'insertMany').mockRejectedValueOnce(new Error('database is down'));
    await expect(issue(h, OFFICER)).rejects.toThrow();

    await expect(issue(h, OTHER_OFFICER)).rejects.toMatchObject({ code: 'WARNING_NOT_PENDING' });
  });

  it('UC-1 BR5: an interrupted run reuses the notifications it already made and sends only to those not yet sent', async () => {
    const h = createWarningsHarness({ recipients: citizens(3) });
    await h.add();
    const made = (id: string, citizenId: string) =>
      AlertNotification.create(
        { notificationId: id, warningId: 'W-1', citizenId, language: 'EN', content: MESSAGES.EN },
        NOW,
      );
    const alreadySent = made('N-old-1', 'c-1');
    alreadySent.recordAttempts([result('PUSH', 'DELIVERED'), result('SMS', 'DELIVERED')], NOW, 3);
    await h.notifications.insertMany([alreadySent, made('N-old-2', 'c-2')]);

    const view = await issue(h);

    expect(await h.notifications.findByWarning('W-1')).toHaveLength(3);
    expect(h.gateways.PUSH.calls.map((c) => c.recipient.citizenId).sort()).toEqual(['c-2', 'c-3']);
    expect(view.result).toMatchObject({ targeted: 3, reached: 3 });
  });
});
