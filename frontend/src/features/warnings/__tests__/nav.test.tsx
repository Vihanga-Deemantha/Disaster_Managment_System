import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { cacheWrite } from '@/shared/offline/cache';
import { resetBrowserOnline, setBrowserOnline, signIn } from '@/shared/testing/auth';
import { makeMe } from '@/shared/testing/fixtures';
import { TestProviders } from '@/shared/testing/render';
import { server } from '@/shared/testing/server';
import {
  pendingChanged,
  usePendingCount,
  warningsIssuedNav,
  warningsNav,
  warningsRejectedNav,
} from '../nav';
import { aWarning, json } from '../testing/fixtures';

const wrapper = ({ children }: { children: ReactNode }) => (
  <TestProviders>{children}</TestProviders>
);

beforeEach(() => signIn(makeMe({ userId: 'user-1' })));
afterEach(() => resetBrowserOnline());

describe('the warnings entries in the sidebar', () => {
  it('are for a DMC Officer only, each with an icon and its own address', () => {
    for (const item of [warningsNav, warningsIssuedNav, warningsRejectedNav]) {
      expect(item.roles).toEqual(['DMC_OFFICER']);
      expect(item.icon).toBeDefined();
    }
    expect([warningsNav.to, warningsIssuedNav.to, warningsRejectedNav.to]).toEqual([
      '/warnings',
      '/warnings/issued',
      '/warnings/rejected',
    ]);
  });

  it('shows the live count on Pending Approvals only', () => {
    expect(warningsNav.useBadge).toBe(usePendingCount);
    expect(warningsIssuedNav.useBadge).toBeUndefined();
    expect(warningsRejectedNav.useBadge).toBeUndefined();
  });
});

describe('usePendingCount (the number on Pending Approvals)', () => {
  it('refreshes when approving a report creates a warning request', async () => {
    let waiting = 1;
    server.use(
      http.get('/api/warnings', () =>
        json(Array.from({ length: waiting }, (_, index) => aWarning({ warningId: `W-${index}` }))),
      ),
    );
    const { result } = renderHook(() => usePendingCount(), { wrapper });
    await waitFor(() => expect(result.current).toBe(1));
    waiting = 2;
    act(() => window.dispatchEvent(new Event('safezone:warning-request-created')));
    await waitFor(() => expect(result.current).toBe(2));
  });
  it('is unknown until the list has been read, then how many warnings are waiting', async () => {
    server.use(http.get('/api/warnings', () => json([aWarning(), aWarning({ warningId: 'W-2' })])));

    const { result } = renderHook(() => usePendingCount(), { wrapper });

    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe(2));
  });

  it('is zero when nothing is waiting', async () => {
    server.use(http.get('/api/warnings', () => json([])));

    const { result } = renderHook(() => usePendingCount(), { wrapper });

    await waitFor(() => expect(result.current).toBe(0));
  });

  it('reads the same saved copy as the list, so it still has a number offline', async () => {
    await cacheWrite('user-1', 'warnings', 'pending-list', [aWarning(), aWarning()]);
    server.use(http.get('/api/warnings', () => HttpResponse.error()));
    setBrowserOnline(false);

    const { result } = renderHook(() => usePendingCount(), { wrapper });

    await waitFor(() => expect(result.current).toBe(2));
  });

  it('is read again when a warning has just been issued or rejected', async () => {
    let waiting = 3;
    server.use(
      http.get('/api/warnings', () =>
        json(Array.from({ length: waiting }, (_, index) => aWarning({ warningId: `W-${index}` }))),
      ),
    );
    const { result } = renderHook(() => usePendingCount(), { wrapper });
    await waitFor(() => expect(result.current).toBe(3));

    waiting = 2;
    act(() => pendingChanged());

    await waitFor(() => expect(result.current).toBe(2));
  });

  it('stops listening once the sidebar is gone', async () => {
    let reads = 0;
    server.use(
      http.get('/api/warnings', () => {
        reads += 1;
        return json([aWarning()]);
      }),
    );
    const { result, unmount } = renderHook(() => usePendingCount(), { wrapper });
    await waitFor(() => expect(result.current).toBe(1));
    const before = reads;

    unmount();
    act(() => pendingChanged());
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(reads).toBe(before);
  });

  it('says nothing, and breaks nothing, when no sidebar is listening', () => {
    expect(() => pendingChanged()).not.toThrow();
  });
});
