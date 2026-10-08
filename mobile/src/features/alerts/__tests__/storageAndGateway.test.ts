import type { ApiClient } from '@/shared/api/apiClient';
import { ApiError, NetworkError } from '@/shared/api/errors';
import { InMemoryKeyValueStore } from '@/shared/testing/InMemoryKeyValueStore';
import { HttpAlertsGateway } from '../api/HttpAlertsGateway';
import { REMEMBERED_IDS } from '../domain/AlertInboxPoller';
import { InboxUnavailable } from '../domain/types';
import { KeyValueInboxStorage, toStoredInbox } from '../storage/KeyValueInboxStorage';
import { anAlert, NOW } from '../testing/fakes';

function apiThatAnswers(answer: () => unknown) {
  const calls: Array<{ method: string; path: string }> = [];
  const api: ApiClient = {
    request: async <T>(method: string, path: string) => {
      calls.push({ method, path });
      return answer() as T;
    },
    send: async () => {
      throw new Error('not used');
    },
  };
  return { gateway: new HttpAlertsGateway(api), calls };
}

const wireAlert = (id: string) => ({ ...anAlert({ alertId: id }) });

describe('HttpAlertsGateway', () => {
  it('asks for the signed-in citizen’s alerts and reads the answer', async () => {
    const { gateway, calls } = apiThatAnswers(() => ({
      alerts: [wireAlert('N-1'), { nonsense: true }, wireAlert('N-2')],
      serverTime: NOW.toISOString(),
    }));

    const inbox = await gateway.fetchInbox();

    expect(calls).toEqual([{ method: 'GET', path: '/api/me/alerts' }]);
    expect(inbox.alerts.map((alert) => alert.alertId)).toEqual(['N-1', 'N-2']);
    expect(inbox.serverTime).toBe(NOW.toISOString());
  });

  it('says it is offline when the server cannot be reached', async () => {
    const { gateway } = apiThatAnswers(() => {
      throw new NetworkError();
    });

    await expect(gateway.fetchInbox()).rejects.toEqual(new InboxUnavailable('OFFLINE'));
  });

  it('says the session ended on a 401, which the API client could not repair', async () => {
    const { gateway } = apiThatAnswers(() => {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required.');
    });

    const failure = await gateway.fetchInbox().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(InboxUnavailable);
    expect((failure as InboxUnavailable).reason).toBe('SESSION_EXPIRED');
  });

  it.each([
    ['a server error', new ApiError(500, 'INTERNAL', 'oops')],
    ['a refusal', new ApiError(403, 'FORBIDDEN_ROLE', 'no')],
    ['something unexpected', new Error('odd')],
  ])('calls %s a server problem', async (_label, error) => {
    const { gateway } = apiThatAnswers(() => {
      throw error;
    });

    await expect(gateway.fetchInbox()).rejects.toMatchObject({ reason: 'SERVER' });
  });

  it.each([
    ['nothing', undefined],
    ['text', 'ok'],
    ['an object that is not an inbox', { hello: 'world' }],
  ])('calls %s in place of an inbox a server problem', async (_label, body) => {
    const { gateway } = apiThatAnswers(() => body);

    await expect(gateway.fetchInbox()).rejects.toMatchObject({ reason: 'SERVER' });
  });
});

describe('KeyValueInboxStorage', () => {
  const saved = {
    alerts: [anAlert({ alertId: 'A-1' })],
    skewMs: 1500,
    lastSyncedAt: NOW.toISOString(),
    announcedIds: ['A-1'],
    readIds: [],
  };

  it('gives back what was saved', async () => {
    const storage = new KeyValueInboxStorage(new InMemoryKeyValueStore(), 'usr-1');

    await storage.save(saved);

    expect(await storage.load()).toEqual(saved);
  });

  it('has nothing for a citizen who has not saved anything', async () => {
    expect(await new KeyValueInboxStorage(new InMemoryKeyValueStore(), 'usr-1').load()).toBeNull();
  });

  it('keeps each citizen’s inbox apart on a shared phone', async () => {
    const kv = new InMemoryKeyValueStore();
    await new KeyValueInboxStorage(kv, 'usr-1').save(saved);

    expect(await new KeyValueInboxStorage(kv, 'usr-2').load()).toBeNull();
    expect([...kv.values.keys()]).toEqual(['safezone.alerts.usr-1']);
  });

  it('treats damaged storage as nothing saved', async () => {
    const kv = new InMemoryKeyValueStore();
    kv.values.set('safezone.alerts.usr-1', '{not json');

    expect(await new KeyValueInboxStorage(kv, 'usr-1').load()).toBeNull();
  });

  it('survives storage that fails', async () => {
    const kv = new InMemoryKeyValueStore();
    const storage = new KeyValueInboxStorage(kv, 'usr-1');
    kv.breakWith();

    expect(await storage.load()).toBeNull();
    await expect(storage.save(saved)).resolves.toBeUndefined();
  });
});

describe('toStoredInbox: a saved inbox from an older or damaged file', () => {
  it.each([
    ['nothing', undefined],
    ['null', null],
    ['text', 'inbox'],
    ['a number', 7],
  ])('is nothing for %s', (_label, raw) => {
    expect(toStoredInbox(raw)).toBeNull();
  });

  it('repairs what it can: unusable alerts dropped, the rest defaulted', () => {
    expect(toStoredInbox({})).toEqual({ alerts: [], skewMs: 0, announcedIds: [], readIds: [] });
    expect(
      toStoredInbox({
        alerts: [anAlert({ alertId: 'A-1' }), { broken: true }, 'x'],
        skewMs: 'a lot',
        lastSyncedAt: 'tuesday',
        announcedIds: ['A-1', 7, null, 'A-2'],
        readIds: 'A-1',
      }),
    ).toEqual({
      alerts: [anAlert({ alertId: 'A-1' })],
      skewMs: 0,
      announcedIds: ['A-1', 'A-2'],
      readIds: [],
    });
  });

  it('refuses a skew that is not a finite number', () => {
    expect(toStoredInbox({ skewMs: Infinity })?.skewMs).toBe(0);
    expect(toStoredInbox({ skewMs: Number.NaN })?.skewMs).toBe(0);
    expect(toStoredInbox({ skewMs: -2500 })?.skewMs).toBe(-2500);
  });

  it('keeps only the most recent ids if the file holds too many', () => {
    const many = Array.from({ length: REMEMBERED_IDS + 5 }, (_, index) => `id-${index}`);

    const inbox = toStoredInbox({ announcedIds: many, readIds: many });

    expect(inbox?.announcedIds).toHaveLength(REMEMBERED_IDS);
    expect(inbox?.announcedIds[0]).toBe('id-5');
    expect(inbox?.readIds.at(-1)).toBe(`id-${REMEMBERED_IDS + 4}`);
  });
});
