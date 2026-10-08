import { useState } from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/shared/api/errors';
import { renderWithProviders } from '@/shared/testing/render';
import { RejectDialog } from '../components/RejectDialog';

function view(action: (reason: string) => Promise<void>, disabledReason?: string) {
  function Host() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button onClick={() => setOpen(true)}>Reopen</button>
        <RejectDialog
          open={open}
          onReject={action}
          onClose={() => setOpen(false)}
          disabledReason={disabledReason}
        />
      </>
    );
  }
  renderWithProviders(<Host />, { withAuth: false });
}
it('UC-3 A2/H8: reason is required, whitespace cannot submit and length is bounded', async () => {
  let sent = '';
  view(async (reason) => {
    sent = reason;
  });
  const input = screen.getByRole('textbox', { name: 'Reason' });
  expect(input).toHaveAttribute('maxLength', '500');
  expect(input).toBeRequired();
  expect(input).toHaveAccessibleDescription('The report is kept for audit with this reason.');
  expect(screen.getByRole('button', { name: 'Reject report' })).toBeDisabled();
  await userEvent.type(input, '   ');
  fireEvent.submit(input.closest('form')!);
  expect(sent).toBe('');
  expect(screen.getByRole('button', { name: 'Reject report' })).toBeDisabled();
  await userEvent.type(input, ' different place  ');
  await userEvent.click(screen.getByRole('button', { name: 'Reject report' }));
  expect(sent).toBe('different place');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('UC-3 A2: busy blocks repeated submit, cancellation and Escape', async () => {
  let finish!: () => void;
  let calls = 0;
  view(() => {
    calls++;
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  const input = screen.getByRole('textbox', { name: 'Reason' });
  await userEvent.type(input, 'Evidence does not match');
  await userEvent.click(screen.getByRole('button', { name: 'Reject report' }));
  fireEvent.submit(input.closest('form')!);
  expect(input).toBeDisabled();
  expect(screen.getByRole('button', { name: /Reject report$/ })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await userEvent.keyboard('{Escape}');
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(calls).toBe(1);
  await act(async () => finish());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it.each([
  [
    new ApiError(400, 'VALIDATION_FAILED', 'Invalid', [
      { field: 'reason', code: 'REASON_REQUIRED' },
    ]),
    'Enter a reason for rejection.',
  ],
  [
    new ApiError(400, 'VALIDATION_FAILED', 'Invalid', [
      { field: 'reason', code: 'REASON_TOO_LONG' },
    ]),
    'Use at most 500 characters for the reason.',
  ],
  [
    new ApiError(400, 'VALIDATION_FAILED', 'Invalid', [{ field: 'other', code: 'OTHER' }]),
    'Something went wrong. Please try again.',
  ],
  [
    new ApiError(409, 'REPORT_ALREADY_REVIEWED', 'Reviewed'),
    'This report has already been reviewed.',
  ],
  [new Error('Unexpected'), 'Something went wrong. Please try again.'],
])('UC-3 A2: failure stays open and translated (%s)', async (error, message) => {
  view(async () => {
    throw error;
  });
  await userEvent.type(screen.getByRole('textbox'), 'Different place');
  await userEvent.click(screen.getByRole('button', { name: 'Reject report' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.getByRole('dialog')).toBeVisible();
});
it('UC-3 A2: cancellation and reopening clears the reason and error', async () => {
  view(async () => {
    throw new Error('Failure');
  });
  await userEvent.type(screen.getByRole('textbox'), 'Different place');
  await userEvent.click(screen.getByRole('button', { name: 'Reject report' }));
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await userEvent.click(screen.getByRole('button', { name: 'Reopen' }));
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('UC-3 A2: unavailable action gives a reason and cannot submit', async () => {
  let calls = 0;
  view(async () => {
    calls++;
  }, 'Connection required');
  await userEvent.type(screen.getByRole('textbox'), 'Different place');
  expect(within(screen.getByRole('dialog')).getByText('Connection required')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Reject report' })).toBeDisabled();
  fireEvent.submit(screen.getByRole('textbox').closest('form')!);
  expect(calls).toBe(0);
});
