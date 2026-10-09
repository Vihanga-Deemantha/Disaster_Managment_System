import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useOnline } from '../hooks/useOnline';
import { deferred } from '../testing/syncHarness';

describe('UC-3 A1: foreground connection status', () => {
  it('updates in both directions and ignores a stale initial network probe', async () => {
    const probe = deferred<boolean>();
    let update!: (online: boolean) => void;
    const off = jest.fn();
    const connectivity = {
      isOnline: () => probe.promise,
      onReconnect: () => () => undefined,
      onChange: (listener: typeof update) => {
        update = listener;
        return off;
      },
    };
    const hook = renderHook(() => useOnline(connectivity));
    act(() => update(false));
    await act(async () => {
      probe.resolve(true);
    });
    expect(hook.result.current).toBe(false);
    act(() => update(true));
    expect(hook.result.current).toBe(true);
    hook.unmount();
    expect(off).toHaveBeenCalledTimes(1);
  });
  it('shows offline after a failed probe', async () => {
    const connectivity = {
      isOnline: async () => {
        throw new Error('network');
      },
      onReconnect: () => () => undefined,
    };
    const hook = renderHook(() => useOnline(connectivity));
    await waitFor(() => expect(hook.result.current).toBe(false));
  });
});
