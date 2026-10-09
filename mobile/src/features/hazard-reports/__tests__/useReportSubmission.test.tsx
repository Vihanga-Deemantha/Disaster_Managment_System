import { act, renderHook } from '@testing-library/react-native';
import { useReportSubmission } from '../hooks/useReportSubmission';
import { aDraft, FixedClock, SequentialIds } from '../testing/fakes';
import type { QueuedReport, UploadOptions, UploadOutcome } from '../offline/types';

function setup(
  outcomes: UploadOutcome[] = [{ kind: 'DELIVERED', via: 'CREATED', reportId: 'r-1' }],
) {
  const calls: Array<{ entry: QueuedReport; options: UploadOptions }> = [];
  const deps = {
    clock: new FixedClock(),
    ids: new SequentialIds(),
    uploader: {
      upload: async (entry: QueuedReport, options: UploadOptions) => {
        calls.push({ entry, options });
        return outcomes.shift()!;
      },
    },
  };
  return { ...renderHook(() => useReportSubmission('user-1', deps)), calls, deps };
}
describe('UC-3 steps 6–7: interactive report submission', () => {
  it('keeps an explicit duplicate choice when delivery confirmation is lost', async () => {
    const h = setup([
      { kind: 'DUPLICATE_SUSPECTED', existingReportId: 'old' },
      { kind: 'RETRY' },
      { kind: 'DELIVERED', via: 'UPDATED_EXISTING', reportId: 'old' },
    ]);
    await act(async () => {
      await h.result.current.submit(aDraft());
    });
    await act(async () => {
      await h.result.current.submit(aDraft(), 'UPDATE');
    });
    await act(async () => {
      await h.result.current.submit(aDraft());
    });
    expect(h.calls[2].options.duplicateAction).toBe('UPDATE');
    expect(h.calls[2].entry.clientReportId).toBe(h.calls[0].entry.clientReportId);
  });
  it('validates before sending and builds the entry from the signed-in identity and capture time', async () => {
    const h = setup();
    await act(async () => {
      await h.result.current.submit({ description: '' });
    });
    expect(h.calls).toEqual([]);
    expect(h.result.current.problems).toEqual(['HAZARD_TYPE_REQUIRED', 'LOCATION_REQUIRED']);
    await act(async () => {
      await h.result.current.submit(aDraft());
    });
    expect(h.calls[0]).toMatchObject({
      entry: {
        ownerId: 'user-1',
        clientReportId: 'client-1',
        capturedAt: h.deps.clock.now().toISOString(),
        state: 'QUEUED',
        attempts: 0,
      },
      options: { syncedFromOffline: false },
    });
    expect(h.result.current.outcome?.kind).toBe('DELIVERED');
  });
  it('reuses the id and capture time when a connection fails and a retry could duplicate a server commit', async () => {
    const h = setup([
      { kind: 'RETRY' },
      { kind: 'DELIVERED', via: 'ALREADY_RECEIVED', reportId: 'r-1' },
    ]);
    await act(async () => {
      await h.result.current.submit(aDraft());
    });
    h.deps.clock.advance(30000);
    await act(async () => {
      await h.result.current.submit(aDraft());
    });
    expect(h.calls[1].entry).toEqual(h.calls[0].entry);
  });
  it('preserves the capture for an explicit duplicate choice, and gives edited/new reports a fresh id', async () => {
    const h = setup([
      { kind: 'DUPLICATE_SUSPECTED', existingReportId: 'old' },
      { kind: 'DELIVERED', via: 'UPDATED_EXISTING', reportId: 'old' },
      { kind: 'RETRY' },
    ]);
    await act(async () => {
      await h.result.current.submit(aDraft());
    });
    await act(async () => {
      await h.result.current.submit(aDraft(), 'UPDATE');
    });
    expect(h.calls[1].entry.clientReportId).toBe(h.calls[0].entry.clientReportId);
    expect(h.calls[1].options.duplicateAction).toBe('UPDATE');
    act(() => h.result.current.reset());
    await act(async () => {
      await h.result.current.submit(aDraft({ description: 'A different hazard' }));
    });
    expect(h.calls[2].entry.clientReportId).not.toBe(h.calls[0].entry.clientReportId);
  });
  it('blocks overlapping taps and always releases the busy state', async () => {
    let finish!: (value: UploadOutcome) => void;
    let uploads = 0;
    const deps = {
      clock: new FixedClock(),
      ids: new SequentialIds(),
      uploader: {
        upload: () => {
          uploads++;
          return new Promise<UploadOutcome>((resolve) => {
            finish = resolve;
          });
        },
      },
    };
    const { result } = renderHook(() => useReportSubmission('user-1', deps));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.submit(aDraft());
      void result.current.submit(aDraft());
    });
    expect(result.current.busy).toBe(true);
    expect(uploads).toBe(1);
    await act(async () => {
      finish({ kind: 'RETRY' });
      await pending;
    });
    expect(result.current.busy).toBe(false);
  });
});
