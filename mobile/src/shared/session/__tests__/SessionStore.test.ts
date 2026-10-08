import { InMemoryKeyValueStore } from '@/shared/testing/InMemoryKeyValueStore';
import { SessionStore, toSessionUser } from '../SessionStore';

const user = { userId: 'usr-1', role: 'CITIZEN', displayName: 'Nimali Perera' } as const;
const KEY = 'safezone.session';

describe('SessionStore', () => {
  it('keeps the person and gives them back', async () => {
    const store = new SessionStore(new InMemoryKeyValueStore());

    await store.save(user);

    expect(await store.load()).toEqual(user);
  });

  it('has nobody when nothing was saved, and nobody again after clearing', async () => {
    const store = new SessionStore(new InMemoryKeyValueStore());
    expect(await store.load()).toBeNull();

    await store.save(user);
    await store.clear();

    expect(await store.load()).toBeNull();
  });

  it('saves three fields and nothing else, even if given more', async () => {
    const storage = new InMemoryKeyValueStore();
    const extra = { ...user, phone: '+94771234567', nicMasked: '*******89V', token: 'secret' };

    await new SessionStore(storage).save(extra);

    expect(JSON.parse(storage.values.get(KEY) as string)).toEqual(user);
  });

  it.each([
    ['not JSON', 'not json at all'],
    ['not an object', '"Nimali"'],
    ['null', 'null'],
    ['a missing id', '{"role":"CITIZEN","displayName":"x"}'],
    ['an empty id', '{"userId":"","role":"CITIZEN","displayName":"x"}'],
    ['a role that does not exist', '{"userId":"u","role":"WIZARD","displayName":"x"}'],
    ['a missing name', '{"userId":"u","role":"CITIZEN"}'],
    ['a name that is not text', '{"userId":"u","role":"CITIZEN","displayName":7}'],
  ])('treats %s as nobody signed in', async (_label, stored) => {
    const storage = new InMemoryKeyValueStore();
    storage.values.set(KEY, stored);

    expect(await new SessionStore(storage).load()).toBeNull();
  });

  it('copes with storage that fails', async () => {
    const storage = new InMemoryKeyValueStore();
    const store = new SessionStore(storage);
    await store.save(user);
    storage.breakWith();

    expect(await store.load()).toBeNull();
    await expect(store.save(user)).resolves.toBeUndefined();
    await expect(store.clear()).resolves.toBeUndefined();
  });
});

describe('toSessionUser', () => {
  it('picks the id, role and name', () => {
    expect(toSessionUser({ userId: 'u', role: 'COMMUNITY_VOLUNTEER', displayName: 'V' })).toEqual({
      userId: 'u',
      role: 'COMMUNITY_VOLUNTEER',
      displayName: 'V',
    });
  });
});
