import { act, renderHook } from '@testing-library/react-native';
import { useReportSubmission } from '../hooks/useReportSubmission';
import { aDraft } from '../testing/fakes';
import { syncHarness } from '../testing/syncHarness';

describe('UC-3 A1: phone submission uses the journal', () => {
  it('saves offline, survives reconstruction, and sends the same capture on reconnect', async () => {
    const h = syncHarness();
    h.connectivity.isOnline.mockResolvedValue(false);
    const hook = renderHook(() => useReportSubmission('citizen-1', h));
    await act(async () => {
      await hook.result.current.submit(aDraft());
    });
    expect(hook.result.current.outcome).toEqual({ kind: 'SAVED_OFFLINE' });
    const [saved] = await h.queue.list();
    expect(saved.ownerId).toBe('citizen-1');
    hook.unmount();
    h.connectivity.isOnline.mockResolvedValue(true);
    await h.restart().run('RECONNECT');
    expect(h.calls[0].entry).toMatchObject({
      clientReportId: saved.clientReportId,
      capturedAt: saved.capturedAt,
    });
    expect(await h.queue.list()).toEqual([]);
  });
  it('distinguishes a failed journal write from a safely saved report and can retry', async () => {
    const h = syncHarness();
    jest.spyOn(h.storage, 'save').mockRejectedValueOnce(new Error('disk full'));
    const hook = renderHook(() => useReportSubmission('citizen-1', h));
    await act(async () => {
      await hook.result.current.submit(aDraft());
    });
    expect(hook.result.current.outcome).toEqual({ kind: 'STORAGE_ERROR' });
    expect(h.calls).toEqual([]);
    await act(async () => {
      await hook.result.current.submit(aDraft());
    });
    expect(hook.result.current.outcome?.kind).toBe('DELIVERED');
  });
  it('retries a retained capture instead of creating a second offline journal entry', async () => {
    const h = syncHarness();
    h.connectivity.isOnline.mockResolvedValue(false);
    const hook = renderHook(() => useReportSubmission('citizen-1', h));
    await act(async () => {
      await hook.result.current.submit(aDraft());
      await hook.result.current.submit(aDraft());
    });
    expect(await h.queue.list()).toHaveLength(1);
  });
});
