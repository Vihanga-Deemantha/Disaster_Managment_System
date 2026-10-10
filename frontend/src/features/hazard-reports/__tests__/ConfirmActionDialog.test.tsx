import { useState } from 'react';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/shared/api/errors';
import { renderWithProviders } from '@/shared/testing/render';
import { ConfirmActionDialog } from '../components/ConfirmActionDialog';

function view(action: () => Promise<void>, disabledReason?: string) {
  function Host() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button onClick={() => setOpen(true)}>Reopen</button>
        <ConfirmActionDialog
          open={open}
          title="Confirm action"
          body="Please confirm"
          confirmLabel="Confirm"
          onConfirm={action}
          onClose={() => setOpen(false)}
          disabledReason={disabledReason}
        />
      </>
    );
  }
  return renderWithProviders(<Host />, { withAuth: false });
}
it('UC-3 H4: confirms once, blocks cancellation and Escape while busy, then closes', async () => {
  let finish!: () => void;
  let calls = 0;
  view(() => {
    calls++;
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  const dialog = screen.getByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: /Confirm$/ }));
  expect(within(dialog).getByRole('button', { name: /Confirm$/ })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await userEvent.click(within(dialog).getByRole('button', { name: /Confirm$/ }));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await userEvent.keyboard('{Escape}');
  expect(dialog).toBeVisible();
  expect(calls).toBe(1);
  await act(async () => finish());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('UC-3 H4: failure stays visible, cancel closes, and reopening clears stale errors', async () => {
  view(async () => {
    throw new ApiError(409, 'ESCALATION_NOT_ALLOWED', 'Refused');
  });
  await userEvent.click(screen.getByRole('button', { name: /Confirm$/ }));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.getByRole('dialog')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Reopen' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('UC-3 H4: unavailable action shows a visible reason and cannot confirm', async () => {
  let calls = 0;
  view(async () => {
    calls++;
  }, 'Connection required');
  expect(screen.getByText('Connection required')).toBeVisible();
  expect(screen.getByRole('button', { name: /Confirm$/ })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: /Confirm$/ }));
  expect(calls).toBe(0);
});
