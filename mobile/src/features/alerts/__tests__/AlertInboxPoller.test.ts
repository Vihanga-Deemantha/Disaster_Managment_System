import {
  AlertInboxPoller,
  MAX_BANNERS_PER_POLL,
  POLL_INTERVAL_MS,
  REMEMBERED_IDS,
} from '../domain/AlertInboxPoller';
import { InboxUnavailable, type Alert } from '../domain/types';
import {
  anAlert,
  at,
  FakeGateway,
  FixedClock,
  HOUR,
  ManualScheduler,
  MemoryInboxStorage,
  MINUTE,
  NOW,
  RecordingNotifier,
  settle,
  snapshotOf,
} from '../testing/fakes';
import type { StoredInbox } from '../domain/ports';

function build(options: { stored?: StoredInbox | null; intervalMs?: number } = {}) {
  const gateway = new FakeGateway();
  const notifier = new RecordingNotifier();
  const storage = new MemoryInboxStorage(options.stored ?? null);
  const scheduler = new ManualScheduler();
  const clock = new FixedClock();
  const poller = new AlertInboxPoller({
    gateway,
    notifier,
    storage,
    scheduler,
    clock,
    intervalMs: options.intervalMs,
  });
  const seen: number[] = [];
  poller.subscribe(() => seen.push(poller.getState().unreadCount));
  return { poller, gateway, notifier, storage, scheduler, clock, seen };
}

/** `count` alerts delivered one minute apart, A-1 the oldest. */
const alerts = (count: number, overrides: Partial<Alert> = {}): Alert[] =>
  Array.from({ length: count }, (_, index) =>
    anAlert({ alertId: `A-${index + 1}`, deliveredAt: at(index * MINUTE), ...overrides }),
  );

const stored = (overrides: Partial<StoredInbox> = {}): StoredInbox => ({
  alerts: [],
  skewMs: 0,
  announcedIds: [],
  readIds: [],
  ...overrides,
});

describe('AlertInboxPoller: polling every 15 seconds while the app is open', () => {
  it('fetches at once when started, then on every tick of the schedule', async () => {
    const { poller, gateway, scheduler } = build();

    poller.start();
    await settle();
    expect(gateway.calls).toBe(1);
    scheduler.tick();
    await settle();
    scheduler.tick();
    await settle();

    expect(gateway.calls).toBe(3);
    expect(scheduler.intervals).toEqual([POLL_INTERVAL_MS]);
    expect(POLL_INTERVAL_MS).toBe(15_000);
  });

  it('uses the interval it is given', () => {
    const { poller, scheduler } = build({ intervalMs: 5_000 });

    poller.start();

    expect(scheduler.intervals).toEqual([5_000]);
  });

  it('does not schedule twice when started twice', async () => {
    const { poller, gateway, scheduler } = build();

    poller.start();
    poller.start();
    await settle();

    expect(scheduler.intervals).toHaveLength(1);
    expect(gateway.calls).toBe(1);
  });

  it('stops asking when stopped, and can be started again', async () => {
    const { poller, gateway, scheduler } = build();
    poller.start();
    await settle();

    poller.stop();
    scheduler.tick();
    await settle();
    expect(scheduler.running).toBe(false);
    expect(gateway.calls).toBe(1);

    poller.start();
    await settle();
    expect(scheduler.running).toBe(true);
    expect(gateway.calls).toBe(2);
  });

  it('stop before start does nothing', () => {
    const { poller, scheduler } = build();

    expect(() => poller.stop()).not.toThrow();
    expect(scheduler.cancelled).toBe(0);
  });

  it('joins a fetch that is already under way instead of asking twice', async () => {
    const { poller, gateway } = build();
    gateway.hold();

    const first = poller.pollNow();
    const second = poller.pollNow();
    await settle();
    expect(poller.getState().syncing).toBe(true);
    gateway.letThrough();
    await Promise.all([first, second]);

    expect(gateway.calls).toBe(1);
    expect(poller.getState().syncing).toBe(false);
  });

  it('can fetch again once the last fetch has finished', async () => {
    const { poller, gateway } = build();

    await poller.pollNow();
    await poller.pollNow();

    expect(gateway.calls).toBe(2);
  });
});

describe('AlertInboxPoller: which alerts are new, and the banner for each', () => {
  it('announces each new valid alert once, oldest first, so the newest ends on top', async () => {
    const { poller, gateway, notifier } = build();
    gateway.respondWith(snapshotOf(alerts(2)));

    await poller.pollNow();

    expect(notifier.ids).toEqual(['A-1', 'A-2']);
  });

  it('does not announce an alert again on the next poll', async () => {
    const { poller, gateway, notifier } = build();
    gateway.respondWith(snapshotOf(alerts(2)));

    await poller.pollNow();
    await poller.pollNow();
    await poller.pollNow();

    expect(notifier.ids).toEqual(['A-1', 'A-2']);
  });

  it('announces only what is new when another alert arrives', async () => {
    const { poller, gateway, notifier } = build();
    gateway.respondWith(snapshotOf(alerts(1)), snapshotOf(alerts(2)));

    await poller.pollNow();
    await poller.pollNow();

    expect(notifier.ids).toEqual(['A-1', 'A-2']);
  });

  it('tells a new alert from an old one by its id, not by its time', async () => {
    const { poller, gateway, notifier } = build();
    const old = anAlert({ alertId: 'A-old', deliveredAt: at(-5 * HOUR) });
    gateway.respondWith(snapshotOf([]), snapshotOf([old]));

    await poller.pollNow();
    await poller.pollNow();

    expect(notifier.ids).toEqual(['A-old']);
  });

  it('stays quiet about an alert that has already expired, and never announces it later', async () => {
    const { poller, gateway, notifier } = build();
    const expired = anAlert({ alertId: 'A-gone', validFrom: at(-3 * HOUR), validTo: at(-HOUR) });
    gateway.respondWith(snapshotOf([expired]));

    await poller.pollNow();
    await poller.pollNow();

    expect(notifier.ids).toEqual([]);
    expect(poller.getState().alerts.map((alert) => alert.alertId)).toEqual(['A-gone']);
  });

  it('announces an alert that has not started yet: it is on its way', async () => {
    const { poller, gateway, notifier } = build();
    gateway.respondWith(snapshotOf([anAlert({ validFrom: at(HOUR), validTo: at(3 * HOUR) })]));

    await poller.pollNow();

    expect(notifier.ids).toEqual(['A-1']);
  });

  it('treats the end of the validity period as expired', async () => {
    const { poller, gateway, notifier } = build();
    gateway.respondWith(snapshotOf([anAlert({ validFrom: at(-HOUR), validTo: at(0) })]));

    await poller.pollNow();

    expect(notifier.ids).toEqual([]);
  });

  it('puts at most three banners up for a burst, the newest three, and marks the rest as told', async () => {
    const { poller, gateway, notifier } = build();
    gateway.respondWith(snapshotOf(alerts(5)), snapshotOf(alerts(5)));

    await poller.pollNow();
    await poller.pollNow();

    expect(MAX_BANNERS_PER_POLL).toBe(3);
    expect(notifier.ids).toEqual(['A-3', 'A-4', 'A-5']);
  });

  it('keeps going when one banner cannot be shown, and does not retry it forever', async () => {
    const { poller, gateway, notifier } = build();
    notifier.failFor('A-2');
    gateway.respondWith(snapshotOf(alerts(3)));

    await poller.pollNow();
    await poller.pollNow();

    expect(notifier.ids).toEqual(['A-1', 'A-3']);
    expect(poller.getState().problem).toBeUndefined();
    expect(poller.getState().alerts).toHaveLength(3);
  });

  it('lists the newest alert first whatever order the server used', async () => {
    const { poller, gateway } = build();
    gateway.respondWith(snapshotOf([...alerts(3)].reverse().reverse()));

    await poller.pollNow();

    expect(poller.getState().alerts.map((alert) => alert.alertId)).toEqual(['A-3', 'A-2', 'A-1']);
  });

  it('orders alerts delivered at the same moment by id, so the list never flickers', async () => {
    const { poller, gateway } = build();
    gateway.respondWith(snapshotOf([anAlert({ alertId: 'A-b' }), anAlert({ alertId: 'A-a' })]));

    await poller.pollNow();

    expect(poller.getState().alerts.map((alert) => alert.alertId)).toEqual(['A-a', 'A-b']);
  });
});

describe('AlertInboxPoller: a phone whose clock is wrong', () => {
  it('judges validity by the server’s time: an alert that ended on the server is not announced', async () => {
    const { poller, gateway, notifier } = build();
    // The phone thinks it is 09:00; the server says 11:00. The alert ended at 10:00 server time.
    gateway.respondWith(
      snapshotOf([anAlert({ validFrom: at(-HOUR), validTo: at(HOUR) })], at(2 * HOUR)),
    );

    await poller.pollNow();

    expect(notifier.ids).toEqual([]);
    expect(poller.getState().skewMs).toBe(2 * HOUR);
  });

  it('announces an alert that is valid by the server’s time even if the phone thinks it ended', async () => {
    const { poller, gateway, notifier } = build();
    gateway.respondWith(
      snapshotOf([anAlert({ validFrom: at(-3 * HOUR), validTo: at(-HOUR) })], at(-2 * HOUR)),
    );

    await poller.pollNow();

    expect(notifier.ids).toEqual(['A-1']);
  });

  it('assumes the clocks agree when the server does not say its time', async () => {
    const { poller, gateway } = build();
    gateway.respondWith({ alerts: [anAlert()] });

    await poller.pollNow();

    expect(poller.getState().skewMs).toBe(0);
  });
});

describe('AlertInboxPoller: reading', () => {
  it('counts what has not been opened, and updates as alerts are opened', async () => {
    const { poller, gateway, seen } = build();
    gateway.respondWith(snapshotOf(alerts(3)));
    await poller.pollNow();
    expect(poller.getState().unreadCount).toBe(3);

    await poller.markRead('A-2');

    expect(poller.getState().unreadCount).toBe(2);
    expect(poller.getState().readIds.has('A-2')).toBe(true);
    expect(seen.at(-1)).toBe(2);
  });

  it('ignores opening the same alert twice, and says nothing the second time', async () => {
    const { poller, gateway, storage } = build();
    gateway.respondWith(snapshotOf(alerts(1)));
    await poller.pollNow();
    await poller.markRead('A-1');
    const saves = storage.saves.length;
    const notified = jest.fn();
    poller.subscribe(notified);

    await poller.markRead('A-1');

    expect(storage.saves).toHaveLength(saves);
    expect(notified).not.toHaveBeenCalled();
    expect(poller.getState().unreadCount).toBe(0);
  });

  it('keeps an alert read when the server sends it again', async () => {
    const { poller, gateway } = build();
    gateway.respondWith(snapshotOf(alerts(2)));
    await poller.pollNow();
    await poller.markRead('A-1');

    await poller.pollNow();

    expect(poller.getState().unreadCount).toBe(1);
  });

  it('does not count an alert that is gone from the inbox', async () => {
    const { poller, gateway } = build();
    gateway.respondWith(snapshotOf(alerts(2)), snapshotOf(alerts(1)));
    await poller.pollNow();
    await poller.markRead('A-2');

    await poller.pollNow();

    expect(poller.getState().unreadCount).toBe(1);
  });

  it('remembers reading an alert the inbox does not (yet) list', async () => {
    const { poller } = build();

    await poller.markRead('A-later');

    expect(poller.getState().readIds.has('A-later')).toBe(true);
    expect(poller.getState().unreadCount).toBe(0);
  });
});

describe('AlertInboxPoller: when the inbox cannot be fetched', () => {
  it('keeps showing the alerts it has and says it is offline', async () => {
    const { poller, gateway } = build();
    gateway.respondWith(snapshotOf(alerts(2)), new InboxUnavailable('OFFLINE'));
    await poller.pollNow();

    await poller.pollNow();

    const state = poller.getState();
    expect(state.problem).toBe('OFFLINE');
    expect(state.alerts).toHaveLength(2);
    expect(state.syncing).toBe(false);
    expect(state.lastSyncedAt).toBe(NOW.toISOString());
  });

  it('clears the problem when the next fetch works', async () => {
    const { poller, gateway } = build();
    gateway.respondWith(new InboxUnavailable('OFFLINE'), snapshotOf(alerts(1)));
    await poller.pollNow();

    await poller.pollNow();

    expect(poller.getState().problem).toBeUndefined();
    expect(poller.getState().alerts).toHaveLength(1);
  });

  it('reports a session that has ended, so the app can ask the person to sign in again', async () => {
    const { poller, gateway } = build();
    gateway.respondWith(new InboxUnavailable('SESSION_EXPIRED'));

    await poller.pollNow();

    expect(poller.getState().problem).toBe('SESSION_EXPIRED');
  });

  it('calls any other failure a server problem', async () => {
    const { poller, gateway } = build();
    gateway.respondWith(new InboxUnavailable('SERVER'), new Error('something odd'));

    await poller.pollNow();
    expect(poller.getState().problem).toBe('SERVER');
    await poller.pollNow();
    expect(poller.getState().problem).toBe('SERVER');
  });

  it('announces nothing and saves nothing when the fetch fails', async () => {
    const { poller, gateway, notifier, storage } = build();
    gateway.respondWith(new InboxUnavailable('OFFLINE'));

    await poller.pollNow();

    expect(notifier.ids).toEqual([]);
    expect(storage.saves).toEqual([]);
  });
});

describe('AlertInboxPoller: what survives closing the app', () => {
  it('saves the list, what was announced and what was read', async () => {
    const { poller, gateway, storage } = build();
    gateway.respondWith(snapshotOf(alerts(2), at(0)));
    await poller.pollNow();
    await poller.markRead('A-1');

    expect(storage.stored).toEqual({
      alerts: [alerts(2)[1], alerts(2)[0]],
      skewMs: 0,
      lastSyncedAt: NOW.toISOString(),
      announcedIds: ['A-1', 'A-2'],
      readIds: ['A-1'],
    });
  });

  it('shows the saved list before anything has been fetched, and keeps unread dots', async () => {
    const { poller, gateway } = build({
      stored: stored({
        alerts: alerts(2),
        readIds: ['A-1'],
        announcedIds: ['A-1', 'A-2'],
        lastSyncedAt: at(-MINUTE),
        skewMs: 5,
      }),
    });
    gateway.hold();

    void poller.pollNow();
    await settle();

    const state = poller.getState();
    expect(state.ready).toBe(true);
    expect(state.alerts.map((alert) => alert.alertId)).toEqual(['A-2', 'A-1']);
    expect(state.unreadCount).toBe(1);
    expect(state.lastSyncedAt).toBe(at(-MINUTE));
    expect(state.skewMs).toBe(5);
    gateway.letThrough();
    await settle();
  });

  it('does not announce again after a restart what it already announced', async () => {
    const first = build();
    first.gateway.respondWith(snapshotOf(alerts(2)));
    await first.poller.pollNow();

    const second = build({ stored: first.storage.stored });
    second.gateway.respondWith(snapshotOf(alerts(3)));
    await second.poller.pollNow();

    expect(first.notifier.ids).toEqual(['A-1', 'A-2']);
    expect(second.notifier.ids).toEqual(['A-3']);
  });

  it('starts empty and ready when nothing was saved', async () => {
    const { poller, gateway } = build();
    expect(poller.getState().ready).toBe(false);

    await poller.pollNow();

    expect(poller.getState()).toMatchObject({ ready: true, alerts: [], unreadCount: 0 });
    expect(gateway.calls).toBe(1);
  });

  it('reads the saved state only once, however many polls follow', async () => {
    const { poller, storage } = build();

    await poller.pollNow();
    await poller.pollNow();
    await poller.markRead('A-1');

    expect(storage.loads).toBe(1);
  });

  it('carries on, without calling it a server problem, when the inbox cannot be saved', async () => {
    const { poller, gateway, storage } = build();
    storage.save = async () => {
      throw new Error('storage is full');
    };
    gateway.respondWith(snapshotOf(alerts(1)));

    await poller.pollNow();
    await expect(poller.markRead('A-1')).resolves.toBeUndefined();

    expect(poller.getState().problem).toBeUndefined();
    expect(poller.getState().alerts).toHaveLength(1);
    expect(poller.getState().unreadCount).toBe(0);
  });

  it('carries on when the saved state cannot be read', async () => {
    const { poller, gateway, storage } = build();
    storage.load = async () => {
      throw new Error('storage is locked');
    };
    gateway.respondWith(snapshotOf(alerts(1)));

    await poller.pollNow();

    expect(poller.getState()).toMatchObject({ ready: true });
    expect(poller.getState().alerts).toHaveLength(1);
  });

  it('remembers at most the last 500 ids, forgetting the oldest first', async () => {
    const many = Array.from({ length: REMEMBERED_IDS + 20 }, (_, index) => `old-${index}`);
    const { poller, gateway, storage } = build({
      stored: stored({ announcedIds: many, readIds: many }),
    });
    gateway.respondWith(snapshotOf(alerts(1)));

    await poller.pollNow();
    await poller.markRead('A-1');

    const saved = storage.stored as StoredInbox;
    expect(saved.announcedIds).toHaveLength(REMEMBERED_IDS);
    expect(saved.announcedIds.at(-1)).toBe('A-1');
    expect(saved.announcedIds[0]).toBe('old-21');
    expect(saved.readIds).toHaveLength(REMEMBERED_IDS);
    expect(saved.readIds.at(-1)).toBe('A-1');
  });
});

describe('AlertInboxPoller: telling the screen', () => {
  it('lets every listener know about each change, and stops after unsubscribing', async () => {
    const { poller, gateway } = build();
    gateway.respondWith(snapshotOf(alerts(1)));
    const first = jest.fn();
    const second = jest.fn();
    const stopFirst = poller.subscribe(first);
    poller.subscribe(second);

    await poller.pollNow();
    const callsAfterFirstPoll = first.mock.calls.length;
    stopFirst();
    await poller.pollNow();

    expect(callsAfterFirstPoll).toBeGreaterThan(0);
    expect(first).toHaveBeenCalledTimes(callsAfterFirstPoll);
    expect(second.mock.calls.length).toBeGreaterThan(callsAfterFirstPoll);
  });

  it('hands out a new state object only when something changed', async () => {
    const { poller } = build();
    const before = poller.getState();

    expect(poller.getState()).toBe(before);
    await poller.pollNow();

    expect(poller.getState()).not.toBe(before);
  });
});
