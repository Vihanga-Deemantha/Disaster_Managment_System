import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { I18nProvider } from '@/shared/i18n/I18nProvider';
import { Alert } from '../Alert';
import { Button } from '../Button';
import { Dialog } from '../Dialog';
import { CheckboxField, PasswordField, SelectField, TextField } from '../Field';
import { SeverityBadge } from '../SeverityBadge';
import { Spinner } from '../Spinner';

const renderUi = (ui: React.ReactElement, language: 'EN' | 'SI' = 'EN') =>
  render(<I18nProvider initialLanguage={language}>{ui}</I18nProvider>);

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', () => {
    renderUi(<Button>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('blocks repeat clicks while loading, announces it as busy, and shows the loading label', async () => {
    const onClick = vi.fn();
    renderUi(
      <Button loading loadingLabel="Saving…" onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole('button', { name: /Saving…/ });
    await userEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps its own label while loading when no loading label is given', () => {
    renderUi(<Button loading>Save</Button>);

    expect(screen.getByRole('button')).toHaveTextContent('Save');
  });

  it.each(['primary', 'secondary', 'danger', 'ghost'] as const)(
    'renders the %s variant',
    (variant) => {
      renderUi(<Button variant={variant}>Go</Button>);

      expect(screen.getByRole('button', { name: 'Go' })).toBeEnabled();
    },
  );

  it('can be disabled', () => {
    renderUi(<Button disabled>Go</Button>);

    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('Spinner', () => {
  it('announces loading politely, in the user’s language', () => {
    renderUi(<Spinner />, 'SI');

    expect(screen.getByRole('status')).toHaveTextContent('පූරණය වෙමින්…');
  });

  it('accepts a custom label and a small size', () => {
    renderUi(<Spinner size="sm" label="Sending" />);

    expect(screen.getByRole('status')).toHaveTextContent('Sending');
  });
});

describe('TextField', () => {
  it('connects the label, hint and error to the input for screen readers', () => {
    renderUi(<TextField label="NIC" hint="Old or new format" error="Enter a valid NIC" />);

    const input = screen.getByLabelText('NIC');
    expect(input).toHaveAccessibleDescription('Old or new format Enter a valid NIC');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid NIC');
  });

  it('is valid and quiet when there is no error', () => {
    renderUi(<TextField label="NIC" />);

    expect(screen.getByLabelText('NIC')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marks optional fields in words, not only by omission', () => {
    renderUi(<TextField label="Address" optionalLabel="optional" />);

    expect(screen.getByText('(optional)')).toBeInTheDocument();
  });

  it('passes typing through', async () => {
    renderUi(<TextField label="Name" />);

    await userEvent.type(screen.getByLabelText('Name'), 'Perera');

    expect(screen.getByLabelText('Name')).toHaveValue('Perera');
  });
});

describe('PasswordField', () => {
  it('hides the password until asked, and the toggle says which state it is in', async () => {
    renderUi(<PasswordField label="Password" showLabel="Show" hideLabel="Hide" />);
    const input = screen.getByLabelText('Password');

    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('shows hint and error like any other field', () => {
    renderUi(
      <PasswordField
        label="Password"
        hint="10+ characters"
        error="Too short"
        showLabel="Show"
        hideLabel="Hide"
      />,
    );

    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      '10+ characters Too short',
    );
  });
});

describe('SelectField and CheckboxField', () => {
  it('labels a select and reports its error', async () => {
    renderUi(
      <SelectField label="District" error="Choose your district">
        <option value="">Choose</option>
        <option value="COLOMBO">Colombo</option>
      </SelectField>,
    );

    await userEvent.selectOptions(screen.getByLabelText('District'), 'COLOMBO');

    expect(screen.getByLabelText('District')).toHaveValue('COLOMBO');
    expect(screen.getByLabelText('District')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a select hint when there is one', () => {
    renderUi(
      <SelectField label="District" hint="Where you live">
        <option>Colombo</option>
      </SelectField>,
    );

    expect(screen.getByLabelText('District')).toHaveAccessibleDescription('Where you live');
  });

  it('toggles a checkbox from its label', async () => {
    renderUi(<CheckboxField label="Also send by WhatsApp" />);

    await userEvent.click(screen.getByLabelText('Also send by WhatsApp'));

    expect(screen.getByLabelText('Also send by WhatsApp')).toBeChecked();
  });
});

describe('Alert', () => {
  it.each(['danger', 'warning'] as const)('interrupts screen readers for a %s alert', (tone) => {
    renderUi(<Alert tone={tone}>Something happened</Alert>);

    expect(screen.getByRole('alert')).toHaveTextContent('Something happened');
  });

  it.each(['info', 'success'] as const)('announces a %s message politely', (tone) => {
    renderUi(<Alert tone={tone}>All good</Alert>);

    expect(screen.getByRole('status')).toHaveTextContent('All good');
  });

  it('names its tone in words for people who cannot see the colour', () => {
    renderUi(<Alert tone="danger">Nope</Alert>);

    expect(screen.getByRole('alert')).toHaveTextContent('Error: Nope');
  });

  it('defaults to info', () => {
    renderUi(<Alert>FYI</Alert>);

    expect(screen.getByRole('status')).toHaveTextContent('Info: FYI');
  });
});

describe('SeverityBadge (never colour alone)', () => {
  it.each([
    ['LOW', 'Low'],
    ['MEDIUM', 'Medium'],
    ['HIGH', 'High'],
    ['CRITICAL', 'Critical'],
  ] as const)('writes the severity %s as the word %s', (severity, word) => {
    renderUi(<SeverityBadge severity={severity} />);

    expect(screen.getByText(word)).toBeInTheDocument();
  });
});

function DialogHarness(props: {
  closeOnBackdrop?: boolean;
  dismissible?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Dialog
        open={open}
        title="Confirm issue"
        onClose={() => {
          props.onClose?.();
          setOpen(false);
        }}
        closeOnBackdrop={props.closeOnBackdrop}
        dismissible={props.dismissible}
        footer={
          <>
            <button>Cancel</button>
            <button>Issue</button>
          </>
        }
      >
        <label>
          Password
          <input type="password" />
        </label>
      </Dialog>
    </>
  );
}

describe('Dialog (accessible confirmation, HCI-04a)', () => {
  it('is not in the page until opened', () => {
    renderUi(<DialogHarness />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens as a modal dialog named by its title, and puts focus inside it', async () => {
    renderUi(<DialogHarness />);

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));

    const dialog = screen.getByRole('dialog', { name: 'Confirm issue' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup();
    renderUi(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const [close, password, cancel, issue] = [
      screen.getByRole('button', { name: 'Close' }),
      screen.getByLabelText('Password'),
      screen.getByRole('button', { name: 'Cancel' }),
      screen.getByRole('button', { name: 'Issue' }),
    ];

    expect(close).toHaveFocus();
    await user.tab();
    expect(password).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(issue).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(issue).toHaveFocus();
  });

  it('closes on Escape and hands focus back to what opened it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderUi(<DialogHarness onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  it('closes from the × button', async () => {
    const user = userEvent.setup();
    renderUi(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores a click outside by default, so a stray click cannot dismiss a mass-alert confirmation', async () => {
    const user = userEvent.setup();
    renderUi(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    await user.click(screen.getByRole('dialog').parentElement as HTMLElement);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('can be told to close on a click outside', async () => {
    const user = userEvent.setup();
    renderUi(<DialogHarness closeOnBackdrop />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    await user.click(screen.getByRole('dialog').parentElement as HTMLElement);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not close when the click starts inside the dialog', async () => {
    const user = userEvent.setup();
    renderUi(<DialogHarness closeOnBackdrop />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    await user.click(screen.getByText('Confirm issue'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('can be made impossible to dismiss: no ×, Escape and outside clicks do nothing', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderUi(<DialogHarness dismissible={false} closeOnBackdrop onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('dialog').parentElement as HTMLElement);

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('works without a footer', () => {
    renderUi(
      <Dialog open title="Info" onClose={() => undefined}>
        <p>Body</p>
      </Dialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Info' })).toHaveTextContent('Body');
  });
});
