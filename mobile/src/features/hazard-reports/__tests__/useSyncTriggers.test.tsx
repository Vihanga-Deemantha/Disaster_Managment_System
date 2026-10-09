import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { useSyncTriggers } from '../hooks/useSyncTriggers';
import { ensureSyncTaskRegistered } from '../background/syncTask';
import { getHazardReportsRuntime } from '../composition';
import { syncTaskStatus } from '../background/taskStatus';

jest.mock('../background/syncTask', () => ({ ensureSyncTaskRegistered: jest.fn() }));
jest.mock('../composition', () => ({ getHazardReportsRuntime: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
describe('UC-3 A1: foreground sync lifecycle', () => {
  it('starts only when signed in, reconnects/foregrounds, and removes both listeners on logout', async () => {
    const run = jest.fn(async (_trigger: string) => ({}));
    const stop = jest.fn();
    const remove = jest.fn();
    let reconnect!: () => void;
    let stateChange!: (state: AppStateStatus) => void;
    const onReconnect = jest.fn((callback: () => void) => {
      reconnect = callback;
      return stop;
    });
    jest
      .mocked(getHazardReportsRuntime)
      .mockReturnValue({ sync: { run }, connectivity: { onReconnect } } as never);
    jest.mocked(ensureSyncTaskRegistered).mockResolvedValue('RESTRICTED');
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      stateChange = callback;
      return { remove };
    });
    const h = renderHook(
      ({ ownerId }: { ownerId: string | undefined }) => useSyncTriggers(ownerId),
      { initialProps: { ownerId: undefined } },
    );
    expect(run).not.toHaveBeenCalled();
    h.rerender({ ownerId: 'citizen-1' });
    await waitFor(() => expect(run).toHaveBeenCalledWith('APP_FOREGROUND'));
    await waitFor(() => expect(syncTaskStatus.getSnapshot()).toBe('RESTRICTED'));
    act(() => {
      reconnect();
      stateChange('background');
      stateChange('active');
    });
    expect(run.mock.calls.map((c) => c[0])).toEqual([
      'APP_FOREGROUND',
      'RECONNECT',
      'APP_FOREGROUND',
    ]);
    h.rerender({ ownerId: undefined });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });
  it('handles failed registration and sync without an unhandled rejection', async () => {
    jest.mocked(getHazardReportsRuntime).mockReturnValue({
      sync: {
        run: jest.fn(async () => {
          throw new Error('storage');
        }),
      },
      connectivity: { onReconnect: () => () => undefined },
    } as never);
    jest.mocked(ensureSyncTaskRegistered).mockRejectedValueOnce(new Error('restricted'));
    const h = renderHook(() => useSyncTriggers('citizen-1'));
    await waitFor(() => expect(syncTaskStatus.getSnapshot()).toBe('UNAVAILABLE'));
    h.unmount();
  });
});
