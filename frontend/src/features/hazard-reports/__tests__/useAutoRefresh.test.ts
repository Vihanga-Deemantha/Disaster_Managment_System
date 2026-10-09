import { act, renderHook } from '@testing-library/react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('UC-3 A2: automatic queue refresh', () => {
  it('UC-3 A2: refreshes visible queues every fifteen seconds and stops on unmount', () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    let updates = 0;
    const { unmount } = renderHook(() =>
      useAutoRefresh(() => {
        updates++;
      }, true),
    );
    act(() => vi.advanceTimersByTime(14_999));
    expect(updates).toBe(0);
    act(() => vi.advanceTimersByTime(1));
    expect(updates).toBe(1);
    act(() => vi.advanceTimersByTime(15_000));
    expect(updates).toBe(2);
    unmount();
    act(() => vi.advanceTimersByTime(15_000));
    expect(updates).toBe(2);
  });
  it('UC-3 A2: disabled and hidden queues wait until enabled and visible', () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    let updates = 0;
    const { rerender } = renderHook(
      ({ enabled }) =>
        useAutoRefresh(() => {
          updates++;
        }, enabled),
      { initialProps: { enabled: false } },
    );
    act(() => vi.advanceTimersByTime(15_000));
    expect(updates).toBe(0);
    rerender({ enabled: true });
    act(() => vi.advanceTimersByTime(15_000));
    expect(updates).toBe(0);
    visibility.mockReturnValue('visible');
    act(() => vi.advanceTimersByTime(15_000));
    expect(updates).toBe(1);
    rerender({ enabled: false });
    act(() => vi.advanceTimersByTime(15_000));
    expect(updates).toBe(1);
  });
  it('UC-3 A2: uses the latest reload function and restarts when the interval changes', () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const updates: string[] = [];
    const { rerender } = renderHook(
      ({ label, interval }) =>
        useAutoRefresh(
          () => {
            updates.push(label);
          },
          true,
          interval,
        ),
      { initialProps: { label: 'old', interval: 1_000 } },
    );
    rerender({ label: 'new', interval: 1_000 });
    act(() => vi.advanceTimersByTime(1_000));
    expect(updates).toEqual(['new']);
    rerender({ label: 'new', interval: 2_000 });
    act(() => vi.advanceTimersByTime(1_000));
    expect(updates).toEqual(['new']);
    act(() => vi.advanceTimersByTime(1_000));
    expect(updates).toEqual(['new', 'new']);
  });
});
