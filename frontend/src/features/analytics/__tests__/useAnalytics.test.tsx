import { act, renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import type { ApiClient } from '@/shared/api/apiClient';
import { ApiError } from '@/shared/api/errors';
import { useAnalytics } from '../useAnalytics';
import { dashboard, event } from '../testing/fixtures';
let online = true;
let user: { userId: string } | null = { userId: 'hook-user' };
const api = { get: vi.fn(), post: vi.fn() } as unknown as ApiClient;
vi.mock('@/shared/api/ApiProvider', () => ({ useApi: () => api }));
vi.mock('@/shared/auth/AuthContext', () => ({ useAuth: () => ({ user }) }));
vi.mock('@/shared/offline/useOnlineStatus', () => ({ useOnlineStatus: () => online }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  online = true;
  user = { userId: 'hook-user' };
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.get).mockImplementation(async (path) =>
    path.endsWith('/events')
      ? { events: [event] }
      : path.endsWith('/summary')
        ? dashboard
        : { reports: [] },
  );
  vi.mocked(api.post).mockResolvedValue(dashboard);
});
afterEach(() => vi.restoreAllMocks());
describe('UC-4 guarded asynchronous dashboard operations', () => {
  it('UC-4 E1 / BR6: invalid and offline Generate do not query the server', async () => {
    const { result, rerender } = renderHook(useAnalytics);
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.changeFilter({ ...dashboard.filter, from: 'bad' }));
    await act(() => result.current.generate());
    expect(api.post).not.toHaveBeenCalled();
    online = false;
    rerender();
    await act(() => result.current.generate());
    expect(api.post).not.toHaveBeenCalled();
  });
  it('UC-4 E1: missing API field message uses its error code', async () => {
    const { result } = renderHook(useAnalytics);
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(api.post).mockRejectedValue(
      new ApiError(400, 'INVALID_FILTER', 'Invalid', [{ field: 'to', code: 'END_INVALID' }]),
    );
    await act(() => result.current.generate());
    expect(result.current.errors.to).toBe('END_INVALID');
  });
  it('UC-4 error: unknown rejection still gives a readable error', async () => {
    const { result } = renderHook(useAnalytics);
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(api.post).mockRejectedValue('transport failure');
    await act(() => result.current.generate());
    expect(result.current.error).toBe('Unable to load analytics.');
  });
  it('UC-4 error: ordinary network failure has no invented field errors', async () => {
    const { result } = renderHook(useAnalytics);
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(api.post).mockRejectedValue(new Error('Offline network'));
    await act(() => result.current.generate());
    expect(result.current.error).toBe('Offline network');
    expect(result.current.errors).toEqual({});
  });
  it.each(['resolve', 'reject'] as const)(
    'UC-4 concurrency: stale %s cannot overwrite latest results',
    async (completion) => {
      const { result } = renderHook(useAnalytics);
      await waitFor(() => expect(result.current.loading).toBe(false));
      const old = deferred<typeof dashboard>();
      vi.mocked(api.post)
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce({ ...dashboard, generatedAt: 'newer' });
      let pending: Promise<void>;
      act(() => {
        pending = result.current.generate();
      });
      await act(() => result.current.generate());
      await act(async () => {
        if (completion === 'resolve') old.resolve(dashboard);
        else old.reject(new Error('stale'));
        await pending!;
      });
      expect(result.current.dashboard?.generatedAt).toBe('newer');
      expect(result.current.error).toBe('');
    },
  );
  it('UC-4 cleanup: initial result completing after unmount is ignored', async () => {
    const initial = deferred<typeof dashboard>();
    vi.mocked(api.get).mockImplementation(async (path) =>
      path.endsWith('/events')
        ? { events: [event] }
        : path.endsWith('/summary')
          ? initial.promise
          : { reports: [] },
    );
    const hook = renderHook(useAnalytics);
    hook.unmount();
    await act(async () => {
      initial.resolve(dashboard);
      await initial.promise;
    });
  });
  it('UC-4 anonymous/offline: no owner reads a scoped filter cache', async () => {
    user = null;
    online = false;
    const { result } = renderHook(useAnalytics);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain('No cached analytics');
  });
});
