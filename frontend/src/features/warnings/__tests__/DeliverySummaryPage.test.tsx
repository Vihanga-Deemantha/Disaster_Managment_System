import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { cacheWrite } from '@/shared/offline/cache';
import { apiError, makeMe } from '@/shared/testing/fixtures';
import { resetBrowserOnline, setBrowserOnline, signIn } from '@/shared/testing/auth';
import { server } from '@/shared/testing/server';
import { REFRESH_MS, useAutoRefresh } from '../DeliverySummaryPage';
import { aDelivery, aResult, aWarning, json } from '../testing/fixtures';
import { renderWarnings, serveWarnings } from '../testing/render';

vi.mock('react-leaflet', async () => (await import('../testing/mockMap')).reactLeafletMock);

afterEach(() => {
  resetBrowserOnline();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
beforeEach(() => signIn(makeMe({ userId: 'user-1' })));

const open = async (delivery = aDelivery(), options = {}) => {
  serveWarnings({ delivery });
  const view = renderWarnings('/warnings/W-102/delivery', options);
  await screen.findByText('Citizens alerted');
  return view;
};

/** The big number on the card called `label`: the card's first paragraph. */
const figure = (label: string) => screen.getByRole('group', { name: label }).querySelector('p');
const cells = (channel: string): (string | null)[] =>
  [...screen.getByRole('rowheader', { name: channel }).parentElement!.querySelectorAll('td')].map(
    (cell) => cell.textContent,
  );

/** Moves the (faked) interval timer on, then lets the real network round trip finish. */
const tick = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
    await new Promise((resolve) => setTimeout(resolve, 150));
  });

const partial = () => {
  const result = aResult({ targeted: 100, reached: 100 });
  result.byChannel.PUSH = { sent: 70, delivered: 62, failed: 8 };
  return aDelivery({ result });
};

describe('UC-1 step 14: the delivery summary (screen 6)', () => {
  it('shows a spinner while it loads, and a way back', async () => {
    serveWarnings();

    renderWarnings('/warnings/W-102/delivery');

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Pending Approvals' })).toHaveAttribute(
      'href',
      '/warnings',
    );
    await screen.findByRole('heading', { level: 1, name: 'Warning issued' });
  });

  it('gives the real numbers, and the percentage reached', async () => {
    await open();

    expect(figure('Citizens alerted')).toHaveTextContent('61');
    expect(figure('Reached')).toHaveTextContent('61');
    expect(figure('Waiting to retry')).toHaveTextContent('0');
    expect(figure('Not reached')).toHaveTextContent('0');
    expect(screen.getByText('100% of citizens reached')).toBeInTheDocument();
    expect(screen.getByText('Flood')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Gampaha')).toBeInTheDocument();
  });

  it('breaks the numbers down by channel', async () => {
    await open();

    expect(cells('Push notification')).toEqual(['40', '40', '0']);
    expect(cells('SMS')).toEqual(['61', '61', '0']);
    expect(cells('WhatsApp')).toEqual(['0', '0', '0']);
    expect(cells('Email')).toEqual(['0', '0', '0']);
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers).toEqual(['Channel', 'Sent', 'Delivered', 'Failed']);
  });

  it('offers nothing to retry or download when everyone was reached', async () => {
    await open();

    expect(screen.queryByRole('button', { name: 'Retry failed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Download the list/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/updates by itself/)).not.toBeInTheDocument();
    expect(screen.queryByText('Every delivery channel is unavailable')).not.toBeInTheDocument();
  });

  it('never rounds up to 100%', async () => {
    await open(
      aDelivery({ result: aResult({ targeted: 1000, reached: 999, failed: 1, unreached: 1 }) }),
    );

    expect(screen.getByText('99% of citizens reached')).toBeInTheDocument();
  });

  it('A1: shows the failures per channel even though everyone was reached, and offers Retry failed', async () => {
    await open(partial());

    expect(cells('Push notification')).toEqual(['70', '62', '8']);
    expect(screen.getByText('100% of citizens reached')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry failed' })).toBeEnabled();
  });

  it('E2: says plainly when no gateway worked, and offers both ways forward', async () => {
    await open(
      aDelivery({
        allChannelsUnavailable: true,
        result: aResult({ reached: 0, pendingRetry: 61, unreached: 61 }),
      }),
    );

    const alert = screen
      .getByText('Every delivery channel is unavailable')
      .closest('[role="alert"]');
    expect(alert).toHaveTextContent('The warning is issued, but nothing could be sent.');
    expect(screen.getByRole('button', { name: 'Retry failed' })).toBeInTheDocument();
    expect(screen.getByText('0% of citizens reached')).toBeInTheDocument();
  });

  it('E2: downloads the follow-up list as a plain file', async () => {
    await open(aDelivery({ result: aResult({ reached: 50, failed: 11, unreached: 11 }) }));

    const link = screen.getByRole('link', {
      name: 'Download the list of citizens not reached (CSV)',
    });
    expect(link).toHaveAttribute('href', '/api/warnings/W-102/unreached.csv');
    expect(link).toHaveAttribute('download');
  });
});

describe('UC-1 A1, E3: Retry failed', () => {
  it('sends the retry, then shows the numbers again', async () => {
    let retries = 0;
    let deliveries = 0;
    server.use(
      http.get('/api/warnings/:id/delivery', () => {
        deliveries += 1;
        return json(deliveries === 1 ? partial() : aDelivery());
      }),
      http.post('/api/warnings/:id/retry-failed', () => {
        retries += 1;
        return json(aDelivery());
      }),
      http.get('/api/dev/gateways', () => json({})),
    );
    const user = userEvent.setup();
    renderWarnings('/warnings/W-102/delivery');
    await user.click(await screen.findByRole('button', { name: 'Retry failed' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry failed' })).toBeNull());
    expect(retries).toBe(1);
    expect(cells('Push notification')).toEqual(['40', '40', '0']);
  });

  it('shows the button busy while it works, so it cannot be pressed twice', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    let retries = 0;
    serveWarnings({ delivery: partial() });
    server.use(
      http.post('/api/warnings/:id/retry-failed', async () => {
        retries += 1;
        await held;
        return json(partial());
      }),
    );
    const user = userEvent.setup();
    renderWarnings('/warnings/W-102/delivery');
    await user.click(await screen.findByRole('button', { name: 'Retry failed' }));

    const busy = await screen.findByRole('button', { name: /Retrying…/ });
    expect(busy).toBeDisabled();
    await user.click(busy);
    release();

    await screen.findByRole('button', { name: 'Retry failed' });
    expect(retries).toBe(1);
  });

  it('explains a failure and lets the officer try again', async () => {
    serveWarnings({ delivery: partial() });
    server.use(
      http.post('/api/warnings/:id/retry-failed', () => apiError(409, 'WARNING_NOT_ISSUED')),
    );
    const user = userEvent.setup();
    renderWarnings('/warnings/W-102/delivery');

    await user.click(await screen.findByRole('button', { name: 'Retry failed' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only an issued warning has deliveries to retry.',
    );
    expect(screen.getByRole('button', { name: 'Retry failed' })).toBeEnabled();
  });

  it('BR6: needs a connection, so it is off while offline', async () => {
    await open(partial());

    act(() => setBrowserOnline(false));

    expect(await screen.findByRole('button', { name: 'Retry failed' })).toBeDisabled();
  });
});

describe('UC-1 E3: the page updates itself while retries are due', () => {
  it('asks again every ten seconds while citizens are waiting to be retried, and stops when none are', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let calls = 0;
    server.use(
      http.get('/api/warnings/:id/delivery', () => {
        calls += 1;
        return json(
          aDelivery({
            result: aResult({ reached: calls === 1 ? 50 : 61, pendingRetry: calls === 1 ? 11 : 0 }),
          }),
        );
      }),
      http.get('/api/dev/gateways', () => json({})),
    );
    renderWarnings('/warnings/W-102/delivery');
    expect(await screen.findByText(/updates by itself/)).toBeInTheDocument();
    expect(calls).toBe(1);

    await tick(REFRESH_MS - 1);
    expect(calls).toBe(1);
    await tick(1);
    expect(calls).toBe(2);
    await waitFor(() => expect(screen.queryByText(/updates by itself/)).not.toBeInTheDocument());

    await tick(REFRESH_MS * 3);
    expect(calls).toBe(2);
  });

  it('useAutoRefresh reloads on a timer only while it is enabled', () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const { rerender, unmount } = renderHook(({ on }) => useAutoRefresh(on, reload), {
      initialProps: { on: false },
    });

    vi.advanceTimersByTime(REFRESH_MS * 2);
    expect(reload).not.toHaveBeenCalled();

    rerender({ on: true });
    vi.advanceTimersByTime(REFRESH_MS * 2);
    expect(reload).toHaveBeenCalledTimes(2);

    rerender({ on: false });
    vi.advanceTimersByTime(REFRESH_MS * 2);
    expect(reload).toHaveBeenCalledTimes(2);

    rerender({ on: true });
    unmount();
    vi.advanceTimersByTime(REFRESH_MS * 2);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});

describe('UC-1 step 14: states other than success', () => {
  it('says so, with a way to the review, when the warning has not been issued', async () => {
    serveWarnings({
      delivery: aDelivery({ warning: aWarning(), result: aResult({ targeted: 0, reached: 0 }) }),
    });

    renderWarnings('/warnings/W-102/delivery');

    expect(await screen.findByText('This warning has not been issued yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the review screen' })).toHaveAttribute(
      'href',
      '/warnings/W-102',
    );
    expect(screen.queryByText('Citizens alerted')).not.toBeInTheDocument();
  });

  it('explains an error and offers to try again', async () => {
    let calls = 0;
    server.use(
      http.get('/api/warnings/:id/delivery', () => {
        calls += 1;
        return calls === 1 ? apiError(404, 'WARNING_NOT_FOUND') : json(aDelivery());
      }),
      http.get('/api/dev/gateways', () => json({})),
    );
    const user = userEvent.setup();
    renderWarnings('/warnings/nope/delivery');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This warning no longer exists.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('100% of citizens reached')).toBeInTheDocument();
  });

  it('BR6: shows the saved summary, and when it was synced, with no connection', async () => {
    await cacheWrite('user-1', 'warnings', 'delivery:W-102', aDelivery(), {
      now: Date.now() - 600_000,
    });
    server.use(
      http.get('/api/warnings/:id/delivery', () => HttpResponse.error()),
      http.get('/api/dev/gateways', () => json({})),
    );
    setBrowserOnline(false);

    renderWarnings('/warnings/W-102/delivery');

    expect(await screen.findByText('100% of citizens reached')).toBeInTheDocument();
    expect(screen.getByText(/Last synced 10 minutes ago/)).toBeInTheDocument();
  });
});

describe('the demo controls', () => {
  it('are on the delivery screen while developing', async () => {
    await open();

    expect(await screen.findByText('Demo controls: simulated gateways')).toBeInTheDocument();
  });

  it('are left out of a production build', async () => {
    vi.stubEnv('DEV', false);
    await open();

    expect(screen.queryByText('Demo controls: simulated gateways')).not.toBeInTheDocument();
  });
});
