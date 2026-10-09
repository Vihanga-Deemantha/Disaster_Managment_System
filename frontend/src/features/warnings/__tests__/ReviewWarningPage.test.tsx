import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { cacheWrite } from '@/shared/offline/cache';
import { apiError, makeMe } from '@/shared/testing/fixtures';
import { resetBrowserOnline, setBrowserOnline, signIn } from '@/shared/testing/auth';
import { server } from '@/shared/testing/server';
import { smsLength } from '../format';
import {
  aBasin,
  aDistrict,
  aReview,
  aWarning,
  anEstimate,
  hoursAgo,
  json,
} from '../testing/fixtures';
import { renderWarnings, serveWarnings } from '../testing/render';

vi.mock('react-leaflet', async () => (await import('../testing/mockMap')).reactLeafletMock);

afterEach(() => resetBrowserOnline());
beforeEach(() => signIn(makeMe({ userId: 'user-1' })));

const open = async (review = aReview(), options = {}) => {
  serveWarnings({ review });
  const view = renderWarnings('/warnings/W-102', options);
  await screen.findByText('Warning Information');
  return view;
};

const button = (name: string) => screen.getByRole('button', { name });

/** The value beside a label in "Warning Information" (its `<dd>` follows the label's `<dt>`). */
const info = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;

describe('UC-1 step 2: Review Warning (screen 2)', () => {
  it('links an automatically created request to its approved report and allows the same DMC to issue', async () => {
    await open(
      aReview({
        warning: aWarning({
          sourceReportId: 'report-7',
          submittedBy: 'user-1',
          hazardType: 'ROAD_BLOCKAGE',
        }),
      }),
    );
    expect(screen.getByRole('link', { name: 'View approved report' })).toHaveAttribute(
      'href',
      '/hazard-reports/reports/report-7',
    );
    expect(screen.getByRole('heading', { name: 'Road blockage Warning' })).toBeVisible();
    expect(button('Approve & Issue')).toBeEnabled();
  });
  it('shows a spinner while it loads, and a way back to the list', async () => {
    serveWarnings();

    renderWarnings('/warnings/W-102');

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to pending list' })).toHaveAttribute(
      'href',
      '/warnings',
    );
    await screen.findByText('Warning Information');
  });

  it('shows what the warning is: hazard, severity, status, area and its type, validity and age', async () => {
    await open(
      aReview({
        warning: aWarning({
          targetAreas: [aDistrict(), aBasin()],
          validFrom: '2026-10-07T09:00:00.000Z',
          validTo: '2026-10-08T09:00:00.000Z',
          submittedAt: hoursAgo(3),
        }),
      }),
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Flood Warning' })).toBeInTheDocument();
    expect(screen.getByText('Warning Information')).toBeInTheDocument();
    expect(info('Hazard Type')).toHaveTextContent('Flood');
    expect(info('Severity')).toHaveTextContent('High');
    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
    expect(screen.getByText('Gampaha')).toHaveTextContent('District');
    expect(screen.getByText('Kelani Ganga basin')).toHaveTextContent('River basin');
    expect(info('Validity Period').textContent).toMatch(/2026.* — .*2026/);
    expect(info('Submitted at')).toHaveTextContent('3 hours ago');
  });

  it.each([
    ['the name saved with the warning', { submittedByName: 'Nimali Perera' }, 'Nimali Perera'],
    [
      'Duty Officer for a draft confirmed from a cluster',
      { sourceClusterId: 'CL-7' },
      'Duty Officer',
    ],
    ['the id when nothing else is known', {}, 'usr-duty-1'],
  ])('says who submitted it: %s', async (_case, overrides, shown) => {
    await open(aReview({ warning: aWarning(overrides) }));

    expect(info('Submitted by')).toHaveTextContent(shown);
  });

  it('shows the warning message in a card of its own, and explains the map in words', async () => {
    await open();

    expect(screen.getByText('Warning Message')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Location & Map' })).toBeInTheDocument();
    expect(screen.getByText('Affected area (Gampaha)')).toBeInTheDocument();
  });

  it('draws the target area on a map', async () => {
    await open();

    expect(screen.getByRole('group', { name: 'Map of the target area' })).toBeInTheDocument();
    expect(screen.getByTestId('circle')).toBeInTheDocument();
  });

  it('estimates the audience per channel before anything is decided (SD1-03)', async () => {
    await open();

    expect(screen.getByText('61 registered citizens live in the target area.')).toBeInTheDocument();
    const push = screen.getByText('Push notification').parentElement as HTMLElement;
    expect(push).toHaveTextContent('40 citizens');
    expect(screen.getByText('SMS').parentElement).toHaveTextContent('61 citizens');
    expect(screen.getByRole('checkbox', { name: 'WhatsApp · 18 citizens' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Email · 9 citizens' })).not.toBeChecked();
    expect(screen.queryByText(/no device token or phone number/)).not.toBeInTheDocument();
  });

  it('says how many citizens no channel can reach, because they go on the follow-up list', async () => {
    await open(aReview({ recipients: anEstimate({ unreachable: 4 }) }));

    expect(screen.getByText(/4 citizens have no device token or phone number/)).toBeInTheDocument();
  });

  it('lets the officer tick WhatsApp and Email, and untick them again', async () => {
    const user = userEvent.setup();
    await open();
    const whatsapp = screen.getByRole('checkbox', { name: /WhatsApp/ });

    await user.click(whatsapp);
    expect(whatsapp).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: /Email/ }));
    expect(screen.getByRole('checkbox', { name: /Email/ })).toBeChecked();
    await user.click(whatsapp);
    expect(whatsapp).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Email/ })).toBeChecked();
  });

  it('offers the demo controls for the simulated gateways before anything is issued', async () => {
    await open();

    expect(await screen.findByText('Demo controls: simulated gateways')).toBeInTheDocument();
  });

  it('offers Edit, Reject and Approve & Issue on a warning that is waiting', async () => {
    await open();

    expect(button('Edit')).toBeEnabled();
    expect(button('Reject')).toBeEnabled();
    expect(button('Approve & Issue')).toBeEnabled();
    expect(screen.queryByText('Fix these before issuing')).not.toBeInTheDocument();
  });
});

describe('UC-1 SC1-05, HCI-06a: the Sinhala, Tamil and English text', () => {
  it('opens on English, and shows each language in its own tab', async () => {
    const user = userEvent.setup();
    const warning = aWarning();
    await open(aReview({ warning }));

    expect(screen.getByRole('tab', { name: 'English' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent(warning.messages.EN);

    await user.click(screen.getByRole('tab', { name: 'සිංහල' }));
    expect(screen.getByRole('tab', { name: 'සිංහල' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(warning.messages.SI)).toHaveAttribute('lang', 'si');

    await user.click(screen.getByRole('tab', { name: 'தமிழ்' }));
    expect(screen.getByText(warning.messages.TA)).toHaveAttribute('lang', 'ta');
  });

  it('counts the characters against the one-SMS limit', async () => {
    const warning = aWarning();
    await open(aReview({ warning }));

    expect(
      screen.getByText(`${smsLength(warning.messages.EN)} of 160 characters`),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Too long for one SMS/)).not.toBeInTheDocument();
  });

  it('allows exactly 160 characters and warns, in words and colour, at 161', async () => {
    const user = userEvent.setup();
    const messages = { ...aWarning().messages, EN: 'x'.repeat(160), SI: 'y'.repeat(161) };
    await open(aReview({ warning: aWarning({ messages }) }));

    const exact = screen.getByText('160 of 160 characters');
    expect(exact).not.toHaveClass('text-danger-600');

    await user.click(screen.getByRole('tab', { name: 'සිංහල' }));
    const over = screen.getByText('161 of 160 characters · Too long for one SMS');
    expect(over).toHaveClass('text-danger-600');
  });

  it('marks a missing language on its tab, explains it, and blocks approval until it is written', async () => {
    const user = userEvent.setup();
    const messages = { ...aWarning().messages, TA: '  ' };
    await open(
      aReview({
        warning: aWarning({ messages }),
        validation: { ok: false, errors: [{ field: 'messages.TA', code: 'MESSAGE_REQUIRED' }] },
      }),
    );

    await user.click(screen.getByRole('tab', { name: 'தமிழ் (missing)' }));

    expect(
      screen.getByText('There is no தமிழ் text yet. Write it before this warning can be issued.'),
    ).toBeInTheDocument();
    expect(screen.getByText('0 of 160 characters')).toBeInTheDocument();
    expect(screen.getByText('Fix these before issuing')).toBeInTheDocument();
    expect(button('Approve & Issue')).toBeDisabled();
    expect(button('Edit')).toBeEnabled();
  });

  it('lists every problem at once in words, naming the language', async () => {
    await open(
      aReview({
        validation: {
          ok: false,
          errors: [
            { field: 'messages.SI', code: 'MESSAGE_REQUIRED' },
            { field: 'messages.EN', code: 'SMS_TOO_LONG' },
            { field: 'validTo', code: 'VALIDITY_EXPIRED' },
          ],
        },
      }),
    );

    const alert = screen
      .getByText('Fix these before issuing')
      .closest('[role="alert"]') as HTMLElement;
    const items = within(alert)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(items).toEqual([
      'Write the warning text in සිංහල.',
      'The English text must fit one SMS (160 characters).',
      'The warning has already expired. Move its end time forward.',
    ]);
  });
});

describe('UC-1: a warning that is no longer waiting', () => {
  it('shows an issued warning as issued, links to its delivery summary, and offers no way to change it', async () => {
    await open(
      aReview({
        warning: aWarning({
          status: 'ISSUED',
          approvedBy: 'usr-dmc-2',
          approvedAt: hoursAgo(1),
          issuedAt: hoursAgo(1),
        }),
        validation: { ok: false, errors: [{ field: 'status', code: 'NOT_PENDING' }] },
      }),
    );

    expect(screen.getByText(/^This warning was issued /)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View the delivery summary' })).toHaveAttribute(
      'href',
      '/warnings/W-102/delivery',
    );
    expect(screen.queryByRole('button', { name: 'Approve & Issue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByText('Fix these before issuing')).not.toBeInTheDocument();
    expect(screen.queryByText('Demo controls: simulated gateways')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /WhatsApp/ })).toBeDisabled();
  });

  it('shows a rejected warning with the reason it was given', async () => {
    await open(
      aReview({
        warning: aWarning({
          status: 'REJECTED',
          rejectedBy: 'usr-dmc-2',
          rejectedAt: hoursAgo(1),
          rejectionReason: 'Duplicate of W-9',
        }),
      }),
    );

    expect(
      screen.getByText('This warning was rejected. Reason: Duplicate of W-9'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'View the delivery summary' }),
    ).not.toBeInTheDocument();
  });
});

describe('UC-1 BR2, SD1-05: a warning whose approval started but did not finish', () => {
  const unfinished = (approvedBy: string) =>
    aReview({ warning: aWarning({ approvedBy, approvedAt: hoursAgo(0.5) }) });

  it('lets the officer who started it carry on, but no longer edit or reject it', async () => {
    await open(unfinished('user-1'));

    expect(screen.getByText(/Approval started but sending did not finish/)).toBeInTheDocument();
    expect(button('Approve & Issue')).toBeEnabled();
    expect(button('Edit')).toBeDisabled();
    expect(button('Reject')).toBeDisabled();
  });

  it('keeps every other officer out, and says why', async () => {
    await open(unfinished('usr-dmc-2'));

    expect(
      screen.getByText('Another officer is already issuing this warning.'),
    ).toBeInTheDocument();
    expect(button('Approve & Issue')).toBeDisabled();
    expect(button('Edit')).toBeDisabled();
  });
});

describe('UC-1 BR6: Review Warning offline', () => {
  it('disables Approve & Issue and says why, while Edit and Reject stay available to queue', async () => {
    await open();

    act(() => setBrowserOnline(false));

    const approve = await screen.findByRole('button', { name: 'Approve & Issue' });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAttribute(
      'title',
      'Issuing needs a connection so you can see delivery results',
    );
    expect(
      screen.getByText('Issuing needs a connection so you can see delivery results'),
    ).toBeInTheDocument();
    expect(button('Edit')).toBeEnabled();
    expect(button('Reject')).toBeEnabled();
  });

  it('opens from the saved copy when the network is down', async () => {
    await cacheWrite('user-1', 'warnings', 'warning:W-102', aReview(), {
      now: Date.now() - 120_000,
    });
    setBrowserOnline(false);
    server.use(http.get('/api/warnings/W-102', () => HttpResponse.error()));

    renderWarnings('/warnings/W-102');

    expect(await screen.findByText(/Last synced 2 minutes ago/)).toBeInTheDocument();
    expect(screen.getByText('Warning Information')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Approve & Issue' })).toBeDisabled();
  });
});

describe('UC-1: loading, reloading and errors', () => {
  it('says so, and offers the way back, when there is no such warning', async () => {
    server.use(http.get('/api/warnings/:id', () => apiError(404, 'WARNING_NOT_FOUND')));

    renderWarnings('/warnings/nope');

    expect(await screen.findByRole('alert')).toHaveTextContent('This warning no longer exists.');
    expect(screen.getByRole('link', { name: 'Back to pending list' })).toBeInTheDocument();
    expect(screen.queryByText('Warning Information')).not.toBeInTheDocument();
  });

  it('tries again on request', async () => {
    let calls = 0;
    server.use(
      http.get('/api/warnings/:id', () => {
        calls += 1;
        return calls === 1 ? apiError(500, 'INTERNAL_ERROR') : json(aReview());
      }),
    );
    const user = userEvent.setup();
    renderWarnings('/warnings/W-102');

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Warning Information')).toBeInTheDocument();
  });

  it('reloads from the server with the Reload button, to pick up what someone else changed', async () => {
    let calls = 0;
    server.use(
      http.get('/api/warnings/:id', () => {
        calls += 1;
        return json(
          aReview({
            warning: aWarning({ severity: calls === 1 ? 'HIGH' : 'CRITICAL', version: calls }),
          }),
        );
      }),
    );
    const user = userEvent.setup();
    renderWarnings('/warnings/W-102');
    await screen.findByText('High');

    await user.click(screen.getByRole('button', { name: 'Reload' }));

    expect(await screen.findByText('Critical')).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('is written in Tamil when the interface is', async () => {
    serveWarnings();

    renderWarnings('/warnings/W-102', { language: 'TA' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'எச்சரிக்கை மதிப்பாய்வு' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'ஒப்புதல் அளித்து வெளியிடு' }),
    ).toBeInTheDocument();
  });
});
