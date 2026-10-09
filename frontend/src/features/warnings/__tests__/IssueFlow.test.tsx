import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { apiError, makeMe, okUser } from '@/shared/testing/fixtures';
import { resetBrowserOnline, signIn } from '@/shared/testing/auth';
import { server } from '@/shared/testing/server';
import { aDelivery, aReview, json } from '../testing/fixtures';
import { renderWarnings, serveWarnings } from '../testing/render';

vi.mock('react-leaflet', async () => (await import('../testing/mockMap')).reactLeafletMock);

afterEach(() => resetBrowserOnline());
beforeEach(() => signIn(makeMe({ userId: 'user-1' })));

const PASSWORD = 'a password for the test';

interface Issued {
  key: string | null;
  body: unknown;
}

/** Records the order of the two calls the confirmation makes, and what the issue call carried. */
function serveIssue(
  issue: () => Response | Promise<Response> = () => json(aDelivery()),
  reauth: () => Response = () => okUser(makeMe({ userId: 'user-1' })),
) {
  const order: string[] = [];
  const issued: Issued[] = [];
  serveWarnings();
  server.use(
    http.post('/api/auth/reauth', () => {
      order.push('reauth');
      return reauth();
    }),
    http.post('/api/warnings/:id/issue', async ({ request }) => {
      order.push('issue');
      issued.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
      return issue();
    }),
  );
  return { order, issued };
}

async function openConfirmation(review = aReview()) {
  serveWarnings({ review });
  const user = userEvent.setup();
  const view = renderWarnings('/warnings/W-102');
  await screen.findByText('Warning Information');
  return { user, view, review };
}

async function confirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Approve & Issue' }));
  return screen.findByRole('dialog', { name: 'Issue this warning?' });
}

const passwordBox = () => screen.getByLabelText('Your password');
const issueButton = (dialog: HTMLElement) =>
  within(dialog).getByRole('button', { name: 'Issue warning now' });

describe('UC-1 steps 5 to 7: the confirmation (screen 5)', () => {
  it('repeats what is about to happen: how bad, where, to how many, and on which channels', async () => {
    serveIssue();
    const { user } = await openConfirmation();

    const dialog = await confirm(user);

    expect(
      within(dialog).getByText('This alerts real people straight away and cannot be undone.'),
    ).toBeInTheDocument();
    const summary = within(dialog).getByText('Severity').closest('dl') as HTMLElement;
    expect(summary).toHaveTextContent('High');
    expect(summary).toHaveTextContent('Gampaha');
    expect(summary).toHaveTextContent('61');
    expect(summary).toHaveTextContent('Push notification · 40 citizens');
    expect(summary).toHaveTextContent('SMS · 61 citizens');
    expect(summary).not.toHaveTextContent('WhatsApp');
  });

  it('lists WhatsApp and Email only when the officer ticked them', async () => {
    serveIssue();
    const { user } = await openConfirmation();
    await user.click(screen.getByRole('checkbox', { name: /WhatsApp/ }));
    await user.click(screen.getByRole('checkbox', { name: /Email/ }));

    const dialog = await confirm(user);

    expect(dialog).toHaveTextContent('WhatsApp · 18 citizens');
    expect(dialog).toHaveTextContent('Email · 9 citizens');
  });

  it('asks for the password again, and moves focus into the dialog (HCI-04a)', async () => {
    serveIssue();
    const { user } = await openConfirmation();

    const dialog = await confirm(user);

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(passwordBox()).toHaveAttribute('type', 'password');
    expect(
      screen.getByText('We ask again because this reaches many people at once.'),
    ).toBeInTheDocument();
  });

  it('keeps the keyboard inside the dialog however many times Tab is pressed', async () => {
    serveIssue();
    const { user } = await openConfirmation();
    const dialog = await confirm(user);

    for (let press = 0; press < 12; press += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let press = 0; press < 12; press += 1) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('A4: Cancel closes it and sends nothing at all', async () => {
    const { order } = serveIssue();
    const { user } = await openConfirmation();
    const dialog = await confirm(user);
    await user.type(passwordBox(), PASSWORD);

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(order).toEqual([]);
    expect(screen.getByText('Warning Information')).toBeInTheDocument();
  });

  it('A4: Escape closes it too, and focus goes back to the button that opened it', async () => {
    const { order } = serveIssue();
    const { user } = await openConfirmation();
    await confirm(user);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve & Issue' })).toHaveFocus();
    expect(order).toEqual([]);
  });

  it('does not close when the backdrop is clicked by mistake', async () => {
    serveIssue();
    const { user } = await openConfirmation();
    const dialog = await confirm(user);

    await user.click(dialog.parentElement as HTMLElement);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('asks for the password before doing anything when the box is empty', async () => {
    const { order } = serveIssue();
    const { user } = await openConfirmation();
    const dialog = await confirm(user);

    await user.click(issueButton(dialog));

    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(order).toEqual([]);
  });

  it('BR3: a wrong password stops here, says so, empties the box, and never reaches the issue call', async () => {
    const { order } = serveIssue(undefined, () => apiError(401, 'INVALID_CREDENTIALS'));
    const { user } = await openConfirmation();
    const dialog = await confirm(user);
    await user.type(passwordBox(), 'not my password');

    await user.click(issueButton(dialog));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Invalid credentials.');
    expect(passwordBox()).toHaveValue('');
    expect(issueButton(dialog)).toBeEnabled();
    expect(order).toEqual(['reauth']);
  });

  it('BR3, BR5: confirms the password first, then issues once with a key and the channels ticked', async () => {
    const { order, issued } = serveIssue();
    const { user, view } = await openConfirmation();
    await user.click(screen.getByRole('checkbox', { name: /WhatsApp/ }));
    const dialog = await confirm(user);
    await user.type(passwordBox(), PASSWORD);

    await user.click(issueButton(dialog));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Warning Issued' }),
    ).toBeInTheDocument();
    await screen.findByText('Citizens Reached');
    expect(view.router.state.location.pathname).toBe('/warnings/W-102/delivery');
    expect(order).toEqual(['reauth', 'issue']);
    expect(issued).toHaveLength(1);
    expect(issued[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(issued[0]?.body).toEqual({ optionalChannels: ['WHATSAPP'] });
  });

  it('shows the button busy and refuses a second click while the warning is being issued', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const { issued } = serveIssue(async () => {
      await held;
      return json(aDelivery());
    });
    const { user } = await openConfirmation();
    const dialog = await confirm(user);
    await user.type(passwordBox(), PASSWORD);

    await user.click(issueButton(dialog));
    const busy = await within(dialog).findByRole('button', { name: /Issuing…/ });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await user.click(busy);
    release();

    await screen.findByText('Citizens Reached');
    expect(issued).toHaveLength(1);
  });

  it('E2: when every gateway is down the warning is still issued, so it goes to the summary, not an error', async () => {
    serveIssue(() =>
      HttpResponse.json(
        {
          error: {
            code: 'ALL_CHANNELS_UNAVAILABLE',
            message: 'x',
            details: { delivery: aDelivery() },
          },
        },
        { status: 503 },
      ),
    );
    const { user, view } = await openConfirmation();
    const dialog = await confirm(user);
    await user.type(passwordBox(), PASSWORD);

    await user.click(issueButton(dialog));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Warning Issued' }),
    ).toBeInTheDocument();
    await screen.findByText('Citizens Reached');
    expect(view.router.state.location.pathname).toBe('/warnings/W-102/delivery');
  });

  it('BR2: explains a refusal in words and stays open, with the password emptied', async () => {
    serveIssue(() => apiError(403, 'SELF_APPROVAL_FORBIDDEN'));
    const { user } = await openConfirmation();
    const dialog = await confirm(user);
    await user.type(passwordBox(), PASSWORD);

    await user.click(issueButton(dialog));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'You submitted this warning, so a different DMC Officer must approve it.',
    );
    expect(passwordBox()).toHaveValue('');
    expect(issueButton(dialog)).toBeEnabled();
  });

  it('BR5: after a dropped connection, trying again sends the same idempotency key, so it can only be issued once', async () => {
    let attempt = 0;
    const { issued } = serveIssue(() => {
      attempt += 1;
      return attempt === 1 ? HttpResponse.error() : json(aDelivery());
    });
    const { user } = await openConfirmation();
    const dialog = await confirm(user);
    await user.type(passwordBox(), PASSWORD);
    await user.click(issueButton(dialog));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('You appear to be offline');

    await user.type(passwordBox(), PASSWORD);
    await user.click(issueButton(dialog));

    await screen.findByText('Citizens Reached');
    expect(issued).toHaveLength(2);
    expect(issued[1]?.key).toBe(issued[0]?.key);
  });

  it('a new confirmation gets a new key', async () => {
    const { issued } = serveIssue(() => apiError(409, 'WARNING_NOT_PENDING'));
    const { user } = await openConfirmation();
    for (let round = 0; round < 2; round += 1) {
      const dialog = await confirm(user);
      await user.type(passwordBox(), PASSWORD);
      await user.click(issueButton(dialog));
      await within(dialog).findByRole('alert');
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    }

    await waitFor(() => expect(issued).toHaveLength(2));
    expect(issued[0]?.key).not.toBe(issued[1]?.key);
  });
});
