import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { Outbox } from '@/shared/offline/outbox';
import { apiError, makeMe } from '@/shared/testing/fixtures';
import { resetBrowserOnline, setBrowserOnline, settle, signIn } from '@/shared/testing/auth';
import { server } from '@/shared/testing/server';
import { toLocalInput } from '../format';
import { aReview, aWarning, json } from '../testing/fixtures';
import { renderWarnings } from '../testing/render';

vi.mock('react-leaflet', async () => (await import('../testing/mockMap')).reactLeafletMock);

afterEach(() => resetBrowserOnline());
beforeEach(() => signIn(makeMe({ userId: 'user-1' })));

interface Seen {
  method: string;
  path: string;
  body: Record<string, unknown>;
  key: string | null;
}

/** Serves the review (the first one, then `after` once a change has been accepted) and records writes. */
function serve(options: { after?: unknown; writeStatus?: Response } = {}) {
  const seen: Seen[] = [];
  let changed = false;
  const record = async (request: Request): Promise<void> => {
    seen.push({
      method: request.method,
      path: new URL(request.url).pathname,
      body: (await request.json()) as Record<string, unknown>,
      key: request.headers.get('Idempotency-Key'),
    });
    changed = options.writeStatus === undefined;
  };
  server.use(
    http.get('/api/warnings/:id', () => json(changed && options.after ? options.after : aReview())),
    http.patch('/api/warnings/:id', async ({ request }) => {
      await record(request);
      return options.writeStatus ?? json(aReview());
    }),
    http.post('/api/warnings/:id/reject', async ({ request }) => {
      await record(request);
      return options.writeStatus ?? json(aWarning());
    }),
  );
  return seen;
}

async function openReview() {
  const view = renderWarnings('/warnings/W-102');
  await screen.findByText('Warning Information');
  return view;
}

const textbox = (name: string) => screen.getByRole('textbox', { name });

describe('UC-1 A2: editing a warning (screen 3)', () => {
  it('opens a form holding what the warning says now', async () => {
    const user = userEvent.setup();
    const warning = aReview().warning;
    serve();
    await openReview();

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByRole('form', { name: 'Edit warning' })).toBeInTheDocument();
    expect(textbox('Text in English')).toHaveValue(warning.messages.EN);
    expect(textbox('Text in සිංහල')).toHaveValue(warning.messages.SI);
    expect(textbox('Text in தமிழ்')).toHaveValue(warning.messages.TA);
    expect(screen.getByRole('combobox', { name: 'Severity' })).toHaveValue('HIGH');
    expect(screen.getByLabelText('Valid from')).toHaveValue(toLocalInput(warning.validFrom));
    expect(screen.getByLabelText('Valid until')).toHaveValue(toLocalInput(warning.validTo));
  });

  it('counts the characters of each text as the officer types', async () => {
    const user = userEvent.setup();
    serve();
    await openReview();
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    await user.clear(textbox('Text in English'));
    await user.type(textbox('Text in English'), 'Move now');

    expect(screen.getByText('8 of 160 characters')).toBeInTheDocument();
  });

  it('closes on Cancel and sends nothing', async () => {
    const user = userEvent.setup();
    const seen = serve();
    await openReview();
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('form', { name: 'Edit warning' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'English' })).toBeInTheDocument();
    expect(seen).toEqual([]);
  });

  it('closes without sending anything when nothing was changed', async () => {
    const user = userEvent.setup();
    const seen = serve();
    await openReview();
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.queryByRole('form', { name: 'Edit warning' })).not.toBeInTheDocument();
    expect(seen).toEqual([]);
  });

  it('E1: marks a missing text next to its box, sends nothing, and clears the mark once it is written', async () => {
    const user = userEvent.setup();
    const seen = serve();
    await openReview();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.clear(textbox('Text in தமிழ்'));

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(textbox('Text in தமிழ்')).toBeInvalid();
    expect(screen.getByText('Write the warning text in தமிழ்.')).toBeInTheDocument();
    expect(seen).toEqual([]);

    await user.type(textbox('Text in தமிழ்'), 'புதிய உரை');
    expect(textbox('Text in தமிழ்')).toBeValid();
    expect(screen.queryByText('Write the warning text in தமிழ்.')).not.toBeInTheDocument();
  });

  it('E1: refuses a text that will not fit one SMS, and an end that is not after the start', async () => {
    const user = userEvent.setup();
    const seen = serve();
    await openReview();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.clear(textbox('Text in English'));
    await user.click(textbox('Text in English'));
    await user.paste('x'.repeat(161));
    fireEvent.change(screen.getByLabelText('Valid until'), {
      target: { value: toLocalInput(aReview().warning.validFrom) },
    });

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      screen.getByText('The English text must fit one SMS (160 characters).'),
    ).toBeInTheDocument();
    expect(screen.getByText('The warning must end after it starts.')).toBeInTheDocument();
    expect(screen.getByText('161 of 160 characters')).toBeInTheDocument();
    expect(seen).toEqual([]);
  });

  it('E1: refuses a time box that has been emptied', async () => {
    const user = userEvent.setup();
    serve();
    await openReview();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Valid from'), { target: { value: '' } });

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByText('Enter a valid date and time.')).toBeInTheDocument();
  });

  it('saves only what changed, with an idempotency key and the version the officer was looking at', async () => {
    const user = userEvent.setup();
    const after = aReview({ warning: aWarning({ severity: 'CRITICAL', version: 2 }) });
    const seen = serve({ after });
    await openReview();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Severity' }), 'CRITICAL');
    await user.clear(textbox('Text in English'));
    await user.type(textbox('Text in English'), 'Evacuate now.');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('form', { name: 'Edit warning' })).toBeNull());
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      method: 'PATCH',
      body: { expectedVersion: 1, severity: 'CRITICAL', messages: { EN: 'Evacuate now.' } },
    });
    expect(Object.keys(seen[0]?.body ?? {}).sort()).toEqual([
      'expectedVersion',
      'messages',
      'severity',
    ]);
    expect(seen[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText('Critical')).toBeInTheDocument();
  });

  it('keeps the form open and explains when someone else changed the warning first', async () => {
    const user = userEvent.setup();
    serve({ writeStatus: apiError(409, 'VERSION_CONFLICT') });
    await openReview();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Severity' }), 'LOW');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const form = screen.getByRole('form', { name: 'Edit warning' });
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Someone else changed this warning. Reload it and try again.',
    );
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('BR6: offline, queues the change on this device and says so', async () => {
    const user = userEvent.setup();
    const seen = serve();
    await openReview();
    await settle(() => setBrowserOnline(false));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Severity' }), 'LOW');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/Your change is saved on this device/)).toBeInTheDocument();
    expect(seen).toEqual([]);
    const [row, ...others] = await new Outbox().all('user-1');
    expect(others).toEqual([]);
    expect(row).toMatchObject({
      module: 'warnings',
      method: 'PATCH',
      url: '/api/warnings/W-102',
      body: { expectedVersion: 1, severity: 'LOW' },
    });
    expect(row?.idempotencyKey).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Edit warning' })).not.toBeInTheDocument();
  });
});

describe('UC-1 A3: rejecting a warning (screen 4)', () => {
  const reasonBox = () => screen.getByRole('textbox', { name: 'Reason for rejecting' });

  async function openDialog() {
    const user = userEvent.setup();
    await openReview();
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    return { user, dialog: await screen.findByRole('dialog', { name: 'Reject this warning?' }) };
  }

  it('asks for a reason, and keeps the button off until there is one', async () => {
    serve();
    const { user, dialog } = await openDialog();
    const submit = within(dialog).getByRole('button', { name: 'Reject warning' });

    expect(submit).toBeDisabled();
    await user.type(reasonBox(), '   ');
    expect(submit).toBeDisabled();
    await user.type(reasonBox(), 'Duplicate of W-9');
    expect(submit).toBeEnabled();
    expect(reasonBox()).toHaveAttribute('maxlength', '500');
  });

  it('closes on Cancel and on Escape, and sends nothing', async () => {
    const seen = serve();
    const { user, dialog } = await openDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(seen).toEqual([]);
  });

  it('rejects with the trimmed reason and an idempotency key, then shows the warning as rejected', async () => {
    const after = aReview({
      warning: aWarning({
        status: 'REJECTED',
        rejectedBy: 'user-1',
        rejectedAt: new Date().toISOString(),
        rejectionReason: 'Duplicate of W-9',
      }),
    });
    const seen = serve({ after });
    const { user, dialog } = await openDialog();
    await user.type(reasonBox(), '  Duplicate of W-9  ');

    await user.click(within(dialog).getByRole('button', { name: 'Reject warning' }));

    expect(
      await screen.findByText('This warning was rejected. Reason: Duplicate of W-9'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      method: 'POST',
      path: '/api/warnings/W-102/reject',
      body: { reason: 'Duplicate of W-9' },
    });
    expect(seen[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps the dialog open and explains when the warning is no longer waiting', async () => {
    serve({ writeStatus: apiError(409, 'WARNING_NOT_PENDING') });
    const { user, dialog } = await openDialog();
    await user.type(reasonBox(), 'Duplicate');

    await user.click(within(dialog).getByRole('button', { name: 'Reject warning' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This warning is no longer waiting for approval.',
    );
    expect(within(dialog).getByRole('button', { name: 'Reject warning' })).toBeEnabled();
  });

  it('BR6: offline, queues the rejection and says so', async () => {
    const seen = serve();
    const { user, dialog } = await openDialog();
    await settle(() => setBrowserOnline(false));
    await user.type(reasonBox(), 'Duplicate of W-9');

    await user.click(within(dialog).getByRole('button', { name: 'Reject warning' }));

    expect(await screen.findByText(/Your change is saved on this device/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(seen).toEqual([]);
    await settle(() => undefined);
    expect(await new Outbox().all('user-1')).toMatchObject([
      { method: 'POST', url: '/api/warnings/W-102/reject', body: { reason: 'Duplicate of W-9' } },
    ]);
  });
});
