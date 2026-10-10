import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useCurrentLocation, type LocationProvider } from '../hooks/useCurrentLocation';

const point = { lat: 6.5854, lng: 79.9607, accuracyM: 12 };
function provider(overrides: Partial<LocationProvider> = {}): LocationProvider {
  return {
    requestPermission: async () => true,
    current: async () => point,
    lastKnown: async () => undefined,
    ...overrides,
  };
}
describe('UC-3 step 4 / E1: current location', () => {
  it('does not update state after unmount while permission or GPS is pending', async () => {
    let finish!: (value: typeof point) => void;
    const location = provider({
      current: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const { result, unmount } = renderHook(() => useCurrentLocation(location));
    await act(async () => {
      await Promise.resolve();
    });
    const before = result.current.state;
    unmount();
    await act(async () => finish(point));
    expect(result.current.state).toBe(before);
  });
  it('obtains a GPS fix with accuracy', async () => {
    const location = provider();
    const { result } = renderHook(() => useCurrentLocation(location));
    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'READY',
        location: { ...point, source: 'GPS' },
      }),
    );
  });
  it('denial supplies a last-known centre without accepting it as report evidence', async () => {
    const location = provider({
      requestPermission: async () => false,
      lastKnown: async () => point,
    });
    const { result } = renderHook(() => useCurrentLocation(location));
    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: 'MANUAL',
        reason: 'DENIED',
        center: point,
        lastKnown: point,
      }),
    );
    expect(result.current.state).not.toHaveProperty('location');
    act(() => result.current.pin(point));
    expect(result.current.state).toMatchObject({
      status: 'MANUAL',
      location: { lat: point.lat, lng: point.lng, source: 'MANUAL' },
    });
  });
  it('falls back to Colombo if the provider or last-known lookup fails', async () => {
    const location = provider({
      current: async () => {
        throw new Error('Unavailable');
      },
      lastKnown: async () => {
        throw new Error('Unavailable');
      },
    });
    const { result } = renderHook(() => useCurrentLocation(location));
    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'MANUAL',
        reason: 'UNAVAILABLE',
        center: { lat: 6.9271, lng: 79.8612 },
      }),
    );
  });
  it('times out a GPS lookup and ignores its late result', async () => {
    jest.useFakeTimers();
    let finish!: (value: typeof point) => void;
    const location = provider({
      current: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const { result, unmount } = renderHook(() => useCurrentLocation(location, 100));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.state).toMatchObject({ status: 'MANUAL', reason: 'TIMEOUT' });
    await act(async () => finish(point));
    expect(result.current.state.status).toBe('MANUAL');
    unmount();
    jest.useRealTimers();
  });
  it('retries permission and allows adjustment of a GPS fix', async () => {
    let granted = false;
    const location = provider({ requestPermission: async () => granted });
    const { result } = renderHook(() => useCurrentLocation(location));
    await waitFor(() => expect(result.current.state.status).toBe('MANUAL'));
    granted = true;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe('READY'));
    act(() => result.current.pin({ lat: 7, lng: 80 }));
    expect(result.current.state).toMatchObject({
      status: 'MANUAL',
      location: { lat: 7, lng: 80, source: 'MANUAL' },
    });
  });
  it('ignores stale requests after a retry, pin or unmount', async () => {
    let finish!: (value: typeof point) => void;
    let calls = 0;
    const location = provider({
      current: () =>
        ++calls === 1
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : Promise.resolve(point),
    });
    const { result, unmount } = renderHook(() => useCurrentLocation(location));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe('READY'));
    act(() => result.current.pin({ lat: 7, lng: 80 }));
    await act(async () => finish(point));
    expect(result.current.state).toMatchObject({ location: { lat: 7 } });
    unmount();
  });
});
