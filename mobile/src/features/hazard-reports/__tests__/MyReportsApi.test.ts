import { MyReportsApi } from '../api/MyReportsApi';
import { MyReportsCache } from '../adapters/MyReportsCache';
import { fakeApiClient } from '@/shared/testing/renderWithApp';
import { InMemoryKeyValueStore } from '@/shared/testing/InMemoryKeyValueStore';

const report = {
  id: 'server-1',
  clientReportId: 'client-1',
  reporterId: 'citizen-1',
  hazardType: 'FLOOD' as const,
  description: 'Water rising',
  capturedAt: '2026-10-09T03:30:00.000Z',
  status: 'PENDING' as const,
};
describe('UC-3 H10: the reporter reads their delivered reports', () => {
  it('reads GET /api/hazard-reports and keeps only the current owner', async () => {
    const { api, calls } = fakeApiClient(() => [report, { ...report, reporterId: 'someone-else' }]);
    expect(await new MyReportsApi(api).list('citizen-1')).toEqual([report]);
    expect(calls).toEqual([{ method: 'GET', path: '/api/hazard-reports', body: undefined }]);
  });
  it('propagates a failed refresh so a screen keeps its cached list', async () => {
    const { api } = fakeApiClient(() => {
      throw new Error('offline');
    });
    await expect(new MyReportsApi(api).list('citizen-1')).rejects.toThrow('offline');
  });
  it('stores lists per owner, survives reconstruction and never leaks another owner’s reports', async () => {
    const storage = new InMemoryKeyValueStore();
    await new MyReportsCache(storage).save('citizen-1', [report]);
    expect(await new MyReportsCache(storage).load('citizen-1')).toEqual([report]);
    expect(await new MyReportsCache(storage).load('citizen-2')).toEqual([]);
  });
  it('treats a corrupt or inaccessible optional cache as empty', async () => {
    const storage = new InMemoryKeyValueStore();
    const cache = new MyReportsCache(storage);
    await cache.save('citizen-1', [report]);
    const key = [...storage.values.keys()][0];
    for (const raw of ['broken', 'null', '{}', '[{}]']) {
      storage.values.set(key, raw);
      expect(await cache.load('citizen-1')).toEqual([]);
    }
    storage.breakWith();
    expect(await cache.load('citizen-1')).toEqual([]);
    await expect(cache.save('citizen-1', [report])).resolves.toBeUndefined();
  });
});
