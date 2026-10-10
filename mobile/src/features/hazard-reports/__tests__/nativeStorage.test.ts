import { AsyncStorageQueueStorage } from '../adapters/AsyncStorageQueueStorage';
import { AsyncStorageRunLog } from '../adapters/AsyncStorageRunLog';
import { FileSystemPhotoStore } from '../adapters/FileSystemPhotoStore';
import { OfflineReportQueue } from '../offline/OfflineReportQueue';
import { aDraft, FixedClock, SequentialIds } from '../testing/fakes';

const mockFiles = new Map<string, string>();
const mockDirectories = new Set<string>();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents' },
  Directory: class {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri =
        parts.map((p) => (typeof p === 'string' ? p : p.uri).replace(/\/+$/, '')).join('/') + '/';
    }
    get exists() {
      return mockDirectories.has(this.uri);
    }
    create() {
      mockDirectories.add(this.uri);
    }
  },
  File: class {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts
        .map((p) => (typeof p === 'string' ? p : p.uri).replace(/\/+$/, ''))
        .join('/');
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    copy(target: { uri: string }) {
      const bytes = mockFiles.get(this.uri);
      if (bytes === undefined) throw new Error('Missing source');
      mockFiles.set(target.uri, bytes);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  },
}));
const store = () => {
  const values = new Map<string, string>();
  return {
    values,
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    remove: jest.fn(async (key: string) => {
      values.delete(key);
    }),
  };
};
beforeEach(() => {
  mockFiles.clear();
  mockDirectories.clear();
});
describe('UC-3 A1: durable native journal and photos', () => {
  it('restores a copied photo and original capture after cache deletion and runtime reconstruction', async () => {
    const kv = store();
    const photos = new FileSystemPhotoStore();
    const deps = {
      storage: new AsyncStorageQueueStorage(kv),
      photos,
      clock: new FixedClock(),
      ids: new SequentialIds(),
    };
    mockFiles.set('file:///cache/p.jpg', 'original bytes');
    const entry = await new OfflineReportQueue(deps).enqueue(
      'citizen-1',
      aDraft({
        photo: { uri: 'file:///cache/p.jpg', name: 'p.jpg', mimeType: 'image/jpeg', bytes: 14 },
      }),
    );
    mockFiles.delete('file:///cache/p.jpg');
    const restarted = new OfflineReportQueue({
      ...deps,
      storage: new AsyncStorageQueueStorage(kv),
      photos: new FileSystemPhotoStore(),
    });
    expect(await restarted.list()).toEqual([entry]);
    expect(mockFiles.get(entry.photo!.uri)).toBe('original bytes');
    await restarted.remove(entry.clientReportId);
    expect(await restarted.list()).toEqual([]);
    expect(await photos.exists(entry.photo!.uri)).toBe(false);
    await photos.discard(entry.photo!.uri);
  });
  it('does not claim a saved report when the native write fails', async () => {
    const kv = store();
    kv.set.mockRejectedValueOnce(new Error('disk full'));
    const queue = new OfflineReportQueue({
      storage: new AsyncStorageQueueStorage(kv),
      photos: new FileSystemPhotoStore(),
      clock: new FixedClock(),
      ids: new SequentialIds(),
    });
    await expect(queue.enqueue('citizen-1', aDraft())).rejects.toThrow('disk full');
    expect(await queue.list()).toEqual([]);
  });
  it.each(['invalid JSON', '{}', '[{}]'])(
    'preserves unreadable journal data instead of overwriting it: %s',
    async (raw) => {
      const kv = store();
      kv.get.mockResolvedValue(raw);
      const storage = new AsyncStorageQueueStorage(kv);
      await expect(storage.load()).rejects.toThrow();
      expect(kv.set).not.toHaveBeenCalled();
    },
  );
  it('confines photo filenames and deletions to the report photo directory', async () => {
    const photos = new FileSystemPhotoStore();
    mockFiles.set('source', 'bytes');
    await expect(photos.keep('source', '../escape.jpg')).rejects.toThrow();
    await expect(photos.discard('file:///documents/someone-else.jpg')).rejects.toThrow();
    const first = await photos.keep('source', 'first.jpg');
    const second = await photos.keep('source', 'second.jpg');
    expect(await photos.exists(first)).toBe(true);
    expect(await photos.exists(second)).toBe(true);
  });
  it('persists run diagnostics but treats unreadable diagnostics as absent', async () => {
    const kv = store();
    const log = new AsyncStorageRunLog(kv);
    expect(await log.last()).toBeUndefined();
    const result = {
      trigger: 'OS_TASK' as const,
      ranAt: '2026-10-09T06:00:00Z',
      uploaded: 1,
      remaining: 0,
    };
    await log.record(result);
    expect(await new AsyncStorageRunLog(kv).last()).toEqual(result);
    kv.get.mockResolvedValue('bad');
    expect(await log.last()).toBeUndefined();
    kv.get.mockRejectedValueOnce(new Error('unavailable'));
    expect(await log.last()).toBeUndefined();
    kv.set.mockRejectedValueOnce(new Error('full'));
    await expect(log.record(result)).resolves.toBeUndefined();
  });
});
