import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { cacheWrite } from '@/shared/offline/cache';
import { apiError, makeMe } from '@/shared/testing/fixtures';
import { resetBrowserOnline, setBrowserOnline, signIn } from '@/shared/testing/auth';
import { server } from '@/shared/testing/server';
import { REFRESH_MS, useAutoRefresh } from '../DeliverySummaryPage';
import { aDelivery, aResult, aWarning, hoursAgo, hoursFromNow, json } from '../testing/fixtures';
import { renderWarnings, serveWarnings } from '../testing/render';

vi.mock('react-leaflet', async () => (await import('../testing/mockMap')).reactLeafletMock);

afterEach(() => {
  resetBrowserOnline();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
beforeEach(() => signIn(makeMe({ userId: 'user-1' })));

const open = async (delivery = aDelivery(), options = {}) => {
  serveWarnings({ delivery });
  const view = renderWarnings('/warnings/W-102/delivery', options);
  await screen.findByText('Citizens Reached');
  return view;
};

/** The value beside a label in the details card (its `<dd>` follows the label's `<dt>`). */
const info = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;
/** One line of the notification summary: the channel's name, and what it says on the right. */
const channel = (name: string) => screen.getByText(name).closest('li') as HTMLElement;
/** "61 / 61": the big figure under "Citizens Reached". */
const reachedFigure = () => screen.getByText('Citizens Reached').nextElementSibling;

/** Advances only the polling interval. Tests await network/render completion explicitly. */
const tick = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });

/** Everyone reached, but 8 pushes failed: SMS got through to them (A1). */
const partial = () => {
  const result = aResult({ targeted: 100, reached: 100 });
  result.byChannel.PUSH = { sent: 70, delivered: 62, failed: 8 };
  return aDelivery({ result });
};

/** 11 citizens are being tried again (E3). */
const pending = () =>
  aDelivery({ result: aResult({ reached: 50, pendingRetry: 11, unreached: 11 }) });

/** 5 citizens no channel reached. */
const missed = () => aDelivery({ result: aResult({ reached: 56, failed: 5, unreached: 5 }) });

/** E2: every gateway was down, so nothing was sent anywhere. */
const outage = () => {
  const result = aResult({ reached: 0, pendingRetry: 61, unreached: 61 });
  result.byChannel.PUSH = { sent: 0, delivered: 0, failed: 0 };
  result.byChannel.SMS = { sent: 0, delivered: 0, failed: 0 };
  return aDelivery({ allChannelsUnavailable: true, result });
};

describe('UC-1 step 14: the delivery summary (screen 6)', () => {
  it('shows the title at once, a spinner while it loads, and a way back', async () => {
    serveWarnings();

    renderWarnings('/warnings/W-102/delivery');

    expect(screen.getByRole('heading', { level: 1, name: 'Warning Issued' })).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Pending Approvals' })).toHaveAttribute(
      'href',
      '/warnings',
    );
    await screen.findByText('Citizens Reached');
  });

  it('offers the Issued Warnings list as the next place to go', async () => {
    await open();

    expect(screen.getByRole('link', { name: 'View Issued Warnings' })).toHaveAttribute(
      'href',
      '/warnings/issued',
    );
  });

  it('says the warning was issued and has reached everyone, while it is still in force', async () => {
    await open();

    const banner = screen.getByRole('status');
    expect(within(banner).getByRole('heading', { level: 2 })).toHaveTextContent(
      'Warning Issued Successfully',
    );
    expect(banner).toHaveTextContent(
      'The warning is now active and has reached all 61 citizens in the target area.',
    );
    expect(within(banner).getByText('Active')).toBeInTheDocument();
  });

  it('stops saying it is active once its validity has ended', async () => {
    await open(
      aDelivery({
        warning: aWarning({
          status: 'ISSUED',
          approvedBy: 'user-1',
          issuedAt: hoursAgo(30),
          validFrom: hoursAgo(31),
          validTo: hoursAgo(1),
        }),
      }),
    );

    expect(within(screen.getByRole('status')).getByText('Expired')).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('gives the real numbers, in a bar that never rounds up to 100%', async () => {
    await open(
      aDelivery({ result: aResult({ targeted: 1000, reached: 999, failed: 1, unreached: 1 }) }),
    );

    expect(reachedFigure()).toHaveTextContent('999/ 1,000');
    const bar = screen.getByRole('progressbar', { name: '99% of citizens reached' });
    expect(bar).toHaveAttribute('aria-valuenow', '99');
    expect(screen.getByText('99%')).toBeInTheDocument();
  });

  it('writes a big number with its separators', async () => {
    await open(aDelivery({ result: aResult({ targeted: 12458, reached: 12458 }) }));

    expect(reachedFigure()).toHaveTextContent('12,458/ 12,458');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('shows what the warning is, when it was issued, and who issued it', async () => {
    await open();

    expect(screen.getByRole('heading', { level: 2, name: 'Warning Details' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Flood Warning' })).toBeInTheDocument();
    expect(info('Hazard Type')).toHaveTextContent('Flood');
    expect(info('Severity')).toHaveTextContent('High');
    expect(info('Target Area')).toHaveTextContent('Gampaha');
    expect(info('Validity Period').textContent).toMatch(/20\d\d.* — .*20\d\d/);
    expect(info('Issued At').textContent).toMatch(/20\d\d/);
  });

  it('names the officer who issued it when that is the person looking, with their role under it', async () => {
    await open();

    expect(info('Issued By')).toHaveTextContent('DMC Officer (demo)');
    expect(info('Issued By')).toHaveTextContent('DMC Officer');
  });

  it('shows only the role when another officer issued it, because the warning keeps no name', async () => {
    await open(
      aDelivery({
        warning: aWarning({
          status: 'ISSUED',
          approvedBy: 'usr-dmc-9',
          issuedAt: hoursAgo(1),
        }),
      }),
    );

    expect(info('Issued By')).toHaveTextContent(/^DMC Officer$/);
  });

  it('shows each channel with what it really did, never just "Sent"', async () => {
    await open();

    expect(channel('Push Notification')).toHaveTextContent('40 delivered');
    expect(channel('SMS Notification')).toHaveTextContent('61 delivered');
    expect(channel('WhatsApp Notification')).toHaveTextContent('Not sent');
    expect(channel('Email Notification')).toHaveTextContent('Not sent');
    expect(channel('Push Notification')).not.toHaveTextContent('failed');
  });

  it('A1: shows the failures on a channel even though everyone was reached', async () => {
    await open(partial());

    expect(channel('Push Notification')).toHaveTextContent('62 delivered');
    expect(channel('Push Notification')).toHaveTextContent('8 failed');
    expect(screen.getByRole('status')).toHaveTextContent('reached all 100 citizens');
    expect(screen.getByText('Some notifications did not get through.')).toBeInTheDocument();
    expect(screen.getByText('You can send them again now.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry failed' })).toBeEnabled();
    expect(
      screen.queryByText('All notifications have been delivered successfully.'),
    ).not.toBeInTheDocument();
  });

  it('shows a channel whose sends all failed as failed, without a tick', async () => {
    const result = aResult({ reached: 61 });
    result.byChannel.PUSH = { sent: 20, delivered: 0, failed: 20 };
    await open(aDelivery({ result }));

    expect(channel('Push Notification')).toHaveTextContent(/^Push Notification20 failed$/);
  });

  it('E3: says how many are reached so far, and that the rest are being tried again', async () => {
    await open(pending());

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Warning issued, delivery still in progress');
    expect(banner).toHaveTextContent('50 of 61 citizens reached so far.');
    expect(
      screen.getByText('This page updates by itself while retries are pending.'),
    ).toBeVisible();
    expect(screen.getByText('Waiting to retry').nextElementSibling).toHaveTextContent('11');
    expect(screen.getByText('Not reached').nextElementSibling).toHaveTextContent('0');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '81');
  });

  it('says plainly that some citizens were not reached, and offers the list to follow up', async () => {
    await open(missed());

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Warning issued, but some citizens were not reached');
    expect(banner).toHaveTextContent(
      '5 of 61 citizens could not be reached on any channel and need a visit or a call.',
    );
    expect(screen.getByText('Not reached').nextElementSibling).toHaveTextContent('5');
    expect(
      screen.getByRole('link', { name: /Download the list of citizens not reached/ }),
    ).toBeVisible();
    expect(screen.queryByText(/updates by itself/)).not.toBeInTheDocument();
  });

  it('E2: says plainly when no gateway worked, and offers both ways forward', async () => {
    await open(outage());

    const banner = screen.getByRole('alert');
    expect(within(banner).getByRole('heading', { level: 2 })).toHaveTextContent(
      'Every delivery channel is unavailable',
    );
    expect(banner).toHaveTextContent('The warning is issued, but nothing could be sent.');
    expect(channel('Push Notification')).toHaveTextContent('Not sent');
    expect(channel('SMS Notification')).toHaveTextContent('Not sent');
    expect(screen.getByRole('button', { name: 'Retry failed' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download the list/ })).toBeInTheDocument();
    expect(reachedFigure()).toHaveTextContent('0/ 61');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('E2: downloads the follow-up list as a plain file', async () => {
    await open(aDelivery({ result: aResult({ reached: 50, failed: 11, unreached: 11 }) }));

    const link = screen.getByRole('link', {
      name: 'Download the list of citizens not reached (CSV)',
    });
    expect(link).toHaveAttribute('href', '/api/warnings/W-102/unreached.csv');
    expect(link).toHaveAttribute('download');
  });

  it('offers nothing to retry or download when everyone was reached everywhere', async () => {
    await open();

    expect(screen.getByText('All notifications have been delivered successfully.')).toBeVisible();
    expect(screen.getByText('Citizens in the target area have been notified.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Retry failed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Download the list/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/updates by itself/)).not.toBeInTheDocument();
    expect(screen.queryByText('Every delivery channel is unavailable')).not.toBeInTheDocument();
  });

  it('is written in Tamil when the interface is', async () => {
    serveWarnings();

    renderWarnings('/warnings/W-102/delivery', { language: 'TA' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'எச்சரிக்கை வெளியிடப்பட்டது' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('சென்றடைந்த குடிமக்கள்')).toBeInTheDocument();
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
    expect(channel('Push Notification')).toHaveTextContent('40 delivered');
    expect(channel('Push Notification')).not.toHaveTextContent('failed');
    expect(screen.getByText('All notifications have been delivered successfully.')).toBeVisible();
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
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const cleared = vi.spyOn(globalThis, 'clearInterval');
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
    const pollingIndex = intervals.mock.calls.findIndex(([, delay]) => delay === REFRESH_MS);
    expect(pollingIndex).toBeGreaterThanOrEqual(0);
    const pollingTimer = intervals.mock.results[pollingIndex].value;

    await tick(REFRESH_MS - 1);
    expect(calls).toBe(1);
    await tick(1);
    await waitFor(() => expect(calls).toBe(2));
    await waitFor(() => expect(screen.queryByText(/updates by itself/)).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Warning Issued Successfully');

    // The updated DOM can precede React's passive-effect cleanup. Wait for the interval to be
    // removed before jumping another thirty seconds, rather than racing cleanup on a busy CI host.
    await waitFor(() => expect(cleared).toHaveBeenCalledWith(pollingTimer));

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
    expect(screen.queryByText('Citizens Reached')).not.toBeInTheDocument();
    expect(screen.queryByText('Warning Issued Successfully')).not.toBeInTheDocument();
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

    expect(
      await screen.findByRole('progressbar', { name: '100% of citizens reached' }),
    ).toBeInTheDocument();
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

    expect(
      await screen.findByRole('progressbar', { name: '100% of citizens reached' }),
    ).toBeInTheDocument();
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

describe('a warning that only starts later', () => {
  it('is still reported as active, because it was sent and has not ended', async () => {
    await open(
      aDelivery({
        warning: aWarning({
          status: 'ISSUED',
          approvedBy: 'user-1',
          issuedAt: hoursAgo(0.1),
          validFrom: hoursFromNow(2),
          validTo: hoursFromNow(26),
        }),
      }),
    );

    expect(within(screen.getByRole('status')).getByText('Active')).toBeInTheDocument();
  });
});
