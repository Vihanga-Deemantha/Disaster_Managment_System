import { OfflineReportQueue } from '../offline/OfflineReportQueue';
import {
  aDraft,
  FakePhotoStore,
  FixedClock,
  InMemoryQueueStorage,
  SequentialIds,
} from '../testing/fakes';

function setup() {
  const storage = new InMemoryQueueStorage();
  const photos = new FakePhotoStore();
  const clock = new FixedClock();
  const deps = { storage, photos, clock, ids: new SequentialIds() };
  return {
    ...deps,
    queue: new OfflineReportQueue(deps),
    restart: () => new OfflineReportQueue(deps),
  };
}

describe('UC-3 A1: durable offline report journal', () => {
  it('persists capture time, original owner and a stable client id across restart', async () => {
    const h = setup();
    const entry = await h.queue.enqueue('citizen-1', aDraft());
    expect(entry).toMatchObject({
      clientReportId: 'client-1',
      ownerId: 'citizen-1',
      capturedAt: h.clock.now().toISOString(),
      state: 'QUEUED',
      attempts: 0,
    });
    expect(await h.restart().list()).toEqual([entry]);
  });
  it('copies a photo before saving the entry and captures the timestamp before a slow copy', async () => {
    const h = setup();
    const capturedAt = h.clock.now().toISOString();
    const keep = h.photos.keep.bind(h.photos);
    jest.spyOn(h.photos, 'keep').mockImplementation(async (uri, name) => {
      h.clock.advance(1000);
      return keep(uri, name);
    });
    const entry = await h.queue.enqueue(
      'citizen-1',
      aDraft({
        photo: {
          uri: 'file:///cache/image.jpg',
          name: 'photo.jpg',
          mimeType: 'image/jpeg',
          bytes: 10,
        },
      }),
    );
    expect(entry.capturedAt).toBe(capturedAt);
    expect(entry.photo?.uri).toBe('file:///documents/client-1-photo.jpg');
    expect(h.photos.kept.get(entry.photo!.uri)).toBe('file:///cache/image.jpg');
  });
  it('a failed photo copy writes nothing, and a later enqueue succeeds', async () => {
    const h = setup();
    jest.spyOn(h.photos, 'keep').mockRejectedValueOnce(new Error('Storage full'));
    await expect(
      h.queue.enqueue(
        'citizen-1',
        aDraft({ photo: { uri: 'image', name: 'photo.jpg', mimeType: 'image/jpeg', bytes: 10 } }),
      ),
    ).rejects.toThrow('Storage full');
    expect(await h.queue.list()).toEqual([]);
    await h.queue.enqueue('citizen-1', aDraft());
    expect(await h.queue.list()).toHaveLength(1);
  });
  it('storage failure does not report success or notify subscribers, and the lane recovers', async () => {
    const h = setup();
    const listener = jest.fn();
    h.queue.subscribe(listener);
    jest.spyOn(h.storage, 'save').mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(h.queue.enqueue('citizen-1', aDraft())).rejects.toThrow('Storage unavailable');
    expect(listener).not.toHaveBeenCalled();
    expect(await h.queue.list()).toEqual([]);
    await h.queue.enqueue('citizen-1', aDraft());
    expect(await h.queue.list()).toHaveLength(1);
  });
  it('lists oldest capture first and does not retain references to a caller-owned draft', async () => {
    const h = setup();
    const draft = aDraft();
    const first = await h.queue.enqueue('citizen-1', draft);
    draft.location.lat = 0;
    h.clock.advance(-1000);
    const older = await h.queue.enqueue('citizen-2', aDraft());
    expect((await h.queue.list()).map((entry) => entry.clientReportId)).toEqual([
      older.clientReportId,
      first.clientReportId,
    ]);
    expect((await h.queue.get(first.clientReportId))?.location.lat).toBe(6.5854);
  });
  it('serializes concurrent changes without losing entries or attempts', async () => {
    const h = setup();
    const [a, b] = await Promise.all([
      h.queue.enqueue('one', aDraft()),
      h.queue.enqueue('two', aDraft()),
    ]);
    await Promise.all([
      h.queue.update(a.clientReportId, { attempts: 1 }),
      h.queue.update(b.clientReportId, { attempts: 2 }),
    ]);
    expect((await h.queue.list()).map((entry) => entry.attempts)).toEqual([1, 2]);
    expect(await h.queue.update('missing', { attempts: 3 })).toBeUndefined();
  });
  it('removes an acknowledged entry and its photo once; unknown ids are harmless', async () => {
    const h = setup();
    const entry = await h.queue.enqueue(
      'one',
      aDraft({ photo: { uri: 'image', name: 'photo.png', mimeType: 'image/png', bytes: 10 } }),
    );
    await h.queue.remove(entry.clientReportId);
    await h.queue.remove(entry.clientReportId);
    expect(await h.queue.list()).toEqual([]);
    expect(h.photos.discarded).toEqual([entry.photo!.uri]);
    expect(await h.queue.get('missing')).toBeUndefined();
  });
  it('a failed removal save leaves both journal entry and photo intact', async () => {
    const h = setup();
    const entry = await h.queue.enqueue(
      'one',
      aDraft({ photo: { uri: 'image', name: 'photo.png', mimeType: 'image/png', bytes: 10 } }),
    );
    jest.spyOn(h.storage, 'save').mockRejectedValueOnce(new Error('Storage full'));
    await expect(h.queue.remove(entry.clientReportId)).rejects.toThrow('Storage full');
    expect(await h.queue.get(entry.clientReportId)).toBeDefined();
    expect(await h.photos.exists(entry.photo!.uri)).toBe(true);
  });
  it('dropPhoto clears a refusal and requeues, including entries with no photo', async () => {
    const h = setup();
    const entry = await h.queue.enqueue(
      'one',
      aDraft({ photo: { uri: 'image', name: 'photo.png', mimeType: 'image/png', bytes: 10 } }),
    );
    await h.queue.update(entry.clientReportId, {
      state: 'NEEDS_ATTENTION',
      problem: { code: 'INVALID_PHOTO', message: 'Invalid photo' },
    });
    expect(await h.queue.dropPhoto(entry.clientReportId)).toMatchObject({
      state: 'QUEUED',
      photo: undefined,
      problem: undefined,
    });
    await h.queue.dropPhoto(entry.clientReportId);
    expect(h.photos.discarded).toHaveLength(1);
    expect(await h.queue.dropPhoto('missing')).toBeUndefined();
  });
  it('removes entries even if photo cleanup fails; listeners can unsubscribe or throw safely', async () => {
    const h = setup();
    const listener = jest.fn();
    const stop = h.queue.subscribe(listener);
    h.queue.subscribe(() => {
      throw new Error('Screen gone');
    });
    const entry = await h.queue.enqueue(
      'one',
      aDraft({ photo: { uri: 'image', name: 'photo.png', mimeType: 'image/png', bytes: 10 } }),
    );
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    jest.spyOn(h.photos, 'discard').mockRejectedValueOnce(new Error('File inaccessible'));
    await expect(h.queue.remove(entry.clientReportId)).resolves.toBeUndefined();
    expect(await h.queue.list()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it('cannot transfer ownership and can clear server refusal metadata', async () => {
    const h = setup();
    const entry = await h.queue.enqueue('one', aDraft());
    const patch = {
      ownerId: 'two',
      clientReportId: 'changed',
      capturedAt: 'changed',
      attempts: 1,
      problem: { code: 'REJECTED', message: 'Try again' },
    };
    await h.queue.update(entry.clientReportId, patch);
    await h.queue.update(entry.clientReportId, { problem: undefined });
    expect(await h.queue.get(entry.clientReportId)).toMatchObject({
      ownerId: 'one',
      capturedAt: entry.capturedAt,
      attempts: 1,
    });
    expect((await h.queue.get(entry.clientReportId))?.problem).toBeUndefined();
  });
  it('returns detached snapshots so callers cannot rewrite the stored report', async () => {
    const h = setup();
    const entry = await h.queue.enqueue('one', aDraft());
    entry.location.lat = 0;
    const listed = await h.queue.list();
    listed[0].ownerId = 'two';
    expect(await h.queue.get(entry.clientReportId)).toMatchObject({
      ownerId: 'one',
      location: { lat: 6.5854 },
    });
  });
});
