import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { I18nProvider } from '@/shared/i18n/I18nProvider';
import { Alert } from '../Alert';
import { Button, buttonClasses } from '../Button';
import { Dialog } from '../Dialog';
import { CheckboxField, PasswordField, SelectField, TextAreaField, TextField } from '../Field';
import { Icon } from '../Icon';
import { RadioCards } from '../RadioCards';
import { ScreenSpinner } from '../ScreenSpinner';
import { SeverityBadge } from '../SeverityBadge';
import { SwitchField } from '../Switch';
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

describe('Button looks', () => {
  it('has a style for buttons that sit on a photo or on navy', () => {
    renderUi(<Button variant="onDark">Go</Button>);

    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('text-white', 'border-white/50');
  });

  it('comes in a large size for forms and calls to action', () => {
    renderUi(<Button size="lg">Go</Button>);

    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('min-h-13');
  });

  it('shares its look with links, so a link can be dressed as a button', () => {
    expect(buttonClasses()).toContain('bg-accent-600');
    expect(buttonClasses('secondary', 'lg', 'w-full')).toContain('w-full');
    expect(buttonClasses('secondary', 'lg', 'w-full')).toContain('min-h-13');
    expect(buttonClasses()).not.toMatch(/\s$/);
  });
});

describe('Icon', () => {
  it('is decoration only: hidden from screen readers and never a tab stop', () => {
    const { container } = renderUi(<Icon name="phone" />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
  });

  it('draws paths, circles and rectangles', () => {
    const { container } = renderUi(
      <>
        <Icon name="check" />
        <Icon name="alertCircle" />
        <Icon name="lock" />
      </>,
    );

    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    expect(container.querySelectorAll('rect')).toHaveLength(1);
  });

  it('takes a size, a stroke width and extra classes', () => {
    const { container } = renderUi(<Icon name="check" size={30} strokeWidth={3} className="x" />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '30');
    expect(svg).toHaveAttribute('stroke-width', '3');
    expect(svg).toHaveClass('x');
  });
});

describe('Alert look', () => {
  it.each(['info', 'success', 'warning', 'danger'] as const)(
    'carries a hidden icon next to the %s message',
    (tone) => {
      const { container } = renderUi(<Alert tone={tone}>Message</Alert>);

      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    },
  );
});

describe('TextField prefix', () => {
  it('shows a fixed beginning inside the box and reads it out together with the hint', () => {
    renderUi(<TextField label="Phone" prefix="+94" hint="SMS goes here" />);

    expect(screen.getByText('+94')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone')).toHaveAccessibleDescription('+94 SMS goes here');
  });

  it('keeps the prefix off the input itself, and still shows an error', () => {
    renderUi(<TextField label="Phone" prefix="+94" error="Not a number" />);

    expect(screen.getByLabelText('Phone')).not.toHaveAttribute('prefix');
    expect(screen.getByLabelText('Phone')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Not a number');
  });
});

describe('PasswordField footer', () => {
  it('can carry a strength meter under the box, described together with the field', () => {
    renderUi(
      <PasswordField
        label="Password"
        showLabel="Show"
        hideLabel="Hide"
        footer={<p id="meter">Strong enough.</p>}
        footerId="meter"
      />,
    );

    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Strong enough.');
  });
});

describe('TextAreaField', () => {
  it('connects its label, hint and error like any other field', () => {
    renderUi(<TextAreaField label="Address" hint="Street and town" error="Too long" />);

    const box = screen.getByLabelText('Address');
    expect(box).toHaveAccessibleDescription('Street and town Too long');
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box.tagName).toBe('TEXTAREA');
  });

  it('is two lines tall unless asked otherwise, marks itself optional, and passes typing through', async () => {
    renderUi(<TextAreaField label="Address" optionalLabel="optional" />);
    const box = screen.getByLabelText(/Address/);

    await userEvent.type(box, '12 Temple Road');

    expect(box).toHaveAttribute('rows', '2');
    expect(box).toHaveValue('12 Temple Road');
    expect(screen.getByText('(optional)')).toBeInTheDocument();
  });

  it('is valid and quiet when there is no error, and can be made taller', () => {
    renderUi(<TextAreaField label="Address" rows={4} />);

    expect(screen.getByLabelText('Address')).toHaveAttribute('rows', '4');
    expect(screen.getByLabelText('Address')).not.toHaveAttribute('aria-invalid');
  });
});

describe('SwitchField', () => {
  function Harness() {
    const [on, setOn] = useState(false);
    return (
      <SwitchField
        label="Also send by WhatsApp"
        description="An extra channel"
        checked={on}
        onChange={(event) => setOn(event.target.checked)}
      />
    );
  }

  it('is a real switch that announces on or off, and can be flipped by click or keyboard', async () => {
    renderUi(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Also send by WhatsApp' });
    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);
    expect(toggle).toBeChecked();

    toggle.focus();
    await userEvent.keyboard(' ');
    expect(toggle).not.toBeChecked();
  });

  it('reads its second line out as the description', () => {
    renderUi(<Harness />);

    expect(screen.getByRole('switch')).toHaveAccessibleDescription('An extra channel');
  });

  it('works without a description, and can be locked', () => {
    renderUi(<SwitchField label="Always on" checked disabled readOnly />);

    const toggle = screen.getByRole('switch', { name: 'Always on' });
    expect(toggle).toBeChecked();
    expect(toggle).toBeDisabled();
    expect(toggle).not.toHaveAttribute('aria-describedby');
  });
});

describe('RadioCards', () => {
  const options = [
    { value: 'a', label: 'Alpha', lang: 'en' },
    { value: 'b', label: 'Beta' },
  ] as const;

  it('is one group of real radio buttons with a legend, and reports a change', async () => {
    const onChange = vi.fn();
    renderUi(
      <RadioCards legend="Pick one" name="pick" value="a" onChange={onChange} options={options} />,
    );

    expect(screen.getByRole('group', { name: 'Pick one' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Alpha' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Beta' })).not.toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: 'Beta' }));

    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('marks a card with the language its label is written in', () => {
    renderUi(
      <RadioCards
        legend="Pick one"
        name="pick"
        value="a"
        onChange={() => undefined}
        options={options}
      />,
    );

    expect(screen.getByText('Alpha')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Beta')).not.toHaveAttribute('lang');
  });
});

describe('ScreenSpinner', () => {
  it('fills the screen with the navy brand colour and announces the wait', () => {
    const { container } = renderUi(<ScreenSpinner />);

    expect(container.firstElementChild).toHaveClass('min-h-screen', 'bg-navy-900');
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });
});
