import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useMyReports } from '../hooks/useMyReports';
import { MyReportsCache } from '../adapters/MyReportsCache';
import { InMemoryKeyValueStore } from '@/shared/testing/InMemoryKeyValueStore';
import { aDraft } from '../testing/fakes';
import { deferred, syncHarness } from '../testing/syncHarness';
import type { RemoteReport } from '../domain/mergeMyReports';

const remote: RemoteReport = {
  id: 'server-1',
  clientReportId: 'client-1',
  hazardType: 'FLOOD',
  description: 'Delivered water report',
  capturedAt: '2026-10-09T03:30:00.000Z',
  status: 'PENDING',
};
function harness() {
  const h = syncHarness();
  const cache = new MyReportsCache(new InMemoryKeyValueStore());
  const reports = { list: jest.fn(async (): Promise<RemoteReport[]> => []) };
  return { ...h, cache, reports };
}
describe('UC-3 H10: journal and server status on My reports', () => {
  it('shows only the owner’s journal and updates when another report is saved', async () => {
    const h = harness();
    h.connectivity.isOnline.mockResolvedValue(false);
    await h.queue.enqueue('someone-else', aDraft({ description: 'Private' }));
    const hook = renderHook(() => useMyReports('citizen-1', h));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    await act(async () => {
      await h.queue.enqueue('citizen-1', aDraft());
    });
    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    expect(hook.result.current.items[0]).toMatchObject({
      description: 'Water rising',
      chip: 'PENDING_SYNC',
    });
    expect(h.reports.list).not.toHaveBeenCalled();
  });
  it('shows cached statuses offline and changes pending sync to pending review after manual delivery', async () => {
    const h = harness();
    h.connectivity.isOnline.mockResolvedValue(false);
    await h.cache.save('citizen-1', [
      { ...remote, clientReportId: 'older', id: 'older', status: 'VERIFIED' },
    ]);
    await h.queue.enqueue('citizen-1', aDraft());
    const hook = renderHook(() => useMyReports('citizen-1', h));
    await waitFor(() => expect(hook.result.current.items).toHaveLength(2));
    expect(hook.result.current.offline).toBe(true);
    h.connectivity.isOnline.mockResolvedValue(true);
    h.reports.list.mockResolvedValue([remote]);
    await act(async () => {
      await hook.result.current.refresh();
    });
    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    expect(hook.result.current.items[0].chip).toBe('PENDING_REVIEW');
    expect(await h.queue.list()).toEqual([]);
    expect(hook.result.current.lastRun).toMatchObject({ trigger: 'MANUAL', uploaded: 1 });
    expect(await h.cache.load('citizen-1')).toEqual([remote]);
  });
  it('keeps cached reports on server errors and exposes an error rather than a false empty state', async () => {
    const h = harness();
    await h.cache.save('citizen-1', [remote]);
    h.reports.list.mockRejectedValue(new Error('server down'));
    const hook = renderHook(() => useMyReports('citizen-1', h));
    await waitFor(() => expect(hook.result.current.problem).toBe('REMOTE'));
    expect(hook.result.current.items[0].description).toBe(remote.description);
  });
  it('never displays the old owner’s cache while a new owner is loading', async () => {
    const h = harness();
    h.reports.list.mockResolvedValue([remote]);
    const hook = renderHook(({ owner }: { owner: string }) => useMyReports(owner, h), {
      initialProps: { owner: 'citizen-1' },
    });
    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    const pending = deferred<RemoteReport[]>();
    h.reports.list.mockReturnValue(pending.promise);
    hook.rerender({ owner: 'citizen-2' });
    expect(hook.result.current.items).toEqual([]);
    await act(async () => {
      pending.resolve([]);
    });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
  });
  it('reports an unreadable journal without overwriting it', async () => {
    const h = harness();
    jest.spyOn(h.queue, 'list').mockRejectedValue(new Error('corrupt journal'));
    const hook = renderHook(() => useMyReports('citizen-1', h));
    await waitFor(() => expect(hook.result.current.problem).toBe('STORAGE'));
    expect(hook.result.current.items).toEqual([]);
  });
  it('waits for slow cache hydration before fetching fresh reports', async () => {
    const h = harness();
    const cached = deferred<RemoteReport[]>();
    jest.spyOn(h.cache, 'load').mockReturnValue(cached.promise);
    h.reports.list.mockResolvedValue([remote]);
    const hook = renderHook(() => useMyReports('citizen-1', h));
    await act(async () => {
      void hook.result.current.reload();
    });
    expect(h.reports.list).not.toHaveBeenCalled();
    await act(async () => {
      cached.resolve([]);
    });
    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
  });
  it('refreshes again when a delivery finishes during an in-flight server read', async () => {
    const h = harness();
    const saved = await h.queue.enqueue('citizen-1', aDraft());
    const request = deferred<RemoteReport[]>();
    h.reports.list.mockReturnValueOnce(request.promise).mockResolvedValue([remote]);
    const hook = renderHook(() => useMyReports('citizen-1', h));
    await waitFor(() => expect(h.reports.list).toHaveBeenCalledTimes(1));
    await act(async () => {
      await h.queue.remove(saved.clientReportId);
      request.resolve([]);
    });
    await waitFor(() => expect(hook.result.current.items[0]?.chip).toBe('PENDING_REVIEW'));
  });
});
