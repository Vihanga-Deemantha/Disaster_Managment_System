import { render, screen, within } from '@testing-library/react';
import { SEVERITIES } from '@contracts/enums';
import { I18nProvider } from '@/shared/i18n/I18nProvider';
import { en } from '@/shared/i18n/messages.en';
import { si } from '@/shared/i18n/messages.si';
import { Card } from '../Card';
import { PageHeader } from '../PageHeader';
import { SeverityPill } from '../SeverityPill';
import { StatCard } from '../StatCard';

const renderUi = (ui: React.ReactElement, language: 'EN' | 'SI' | 'TA' = 'EN') =>
  render(<I18nProvider initialLanguage={language}>{ui}</I18nProvider>);

describe('PageHeader (how every screen starts)', () => {
  it('is a level-one title with a line saying what the screen is for', () => {
    renderUi(<PageHeader title="Pending Approvals" subtitle="Review what was sent in." />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Pending Approvals' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Review what was sent in.')).toBeInTheDocument();
  });

  it('leaves the subtitle out when there is none', () => {
    const { container } = renderUi(<PageHeader title="Impact Analytics" />);

    expect(container.querySelectorAll('p')).toHaveLength(0);
  });

  it('gives the screen’s own controls room beside the title, and nothing when there are none', () => {
    const { rerender } = renderUi(
      <PageHeader title="T">
        <button type="button">Do it</button>
      </PageHeader>,
    );
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Do it' })).toBeVisible();

    rerender(
      <I18nProvider initialLanguage="EN">
        <PageHeader title="T" />
      </I18nProvider>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('StatCard (one headline number)', () => {
  it('reads out as one group: the number, what it counts and the note', () => {
    renderUi(
      <StatCard
        icon="fileText"
        tone="amber"
        value="5"
        label="Pending Approvals"
        note="Oldest: 2 hours ago"
      />,
    );

    const card = screen.getByRole('group', { name: 'Pending Approvals' });
    expect([...card.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
      '5',
      'Pending Approvals',
      'Oldest: 2 hours ago',
    ]);
  });

  it('needs no note', () => {
    renderUi(<StatCard icon="users" tone="blue" value="61" label="Citizens alerted" />);

    expect(
      screen.getByRole('group', { name: 'Citizens alerted' }).querySelectorAll('p'),
    ).toHaveLength(2);
  });

  it.each([
    ['amber', 'bg-warning-100'],
    ['red', 'bg-danger-100'],
    ['blue', 'bg-info-100'],
    ['green', 'bg-success-100'],
  ] as const)('tints the %s icon tile softly', (tone, tint) => {
    const { container } = renderUi(<StatCard icon="clock" tone={tone} value="1" label="L" />);

    expect(container.querySelector('svg')?.parentElement).toHaveClass(tint);
  });

  it('keeps its icon as decoration only', () => {
    const { container } = renderUi(<StatCard icon="clock" tone="red" value="1" label="L" />);

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('gives two cards on one screen two different labels for a screen reader', () => {
    renderUi(
      <>
        <StatCard icon="clock" tone="red" value="1" label="First" />
        <StatCard icon="clock" tone="red" value="2" label="Second" />
      </>,
    );

    expect(screen.getByRole('group', { name: 'First' })).toHaveTextContent('1');
    expect(screen.getByRole('group', { name: 'Second' })).toHaveTextContent('2');
  });
});

describe('SeverityPill (never colour alone)', () => {
  it.each([
    ['LOW', 'Low', 'bg-info-100'],
    ['MEDIUM', 'Medium', 'bg-warning-100'],
    ['HIGH', 'High', 'bg-danger-100'],
    ['CRITICAL', 'Critical', 'bg-danger-600'],
  ] as const)('writes %s as the word %s, in a soft colour of its own', (severity, word, colour) => {
    renderUi(<SeverityPill severity={severity} />);

    expect(screen.getByText(word)).toHaveClass(colour);
  });

  it('makes critical a solid red, so it can never be mistaken for high', () => {
    renderUi(
      <>
        <SeverityPill severity="HIGH" />
        <SeverityPill severity="CRITICAL" />
      </>,
    );

    expect(screen.getByText('Critical')).toHaveClass('text-white');
    expect(screen.getByText('High')).not.toHaveClass('text-white');
  });

  it('is written in the reader’s language', () => {
    renderUi(<SeverityPill severity="CRITICAL" />, 'SI');

    expect(screen.getByText(si['severity.CRITICAL'])).toBeInTheDocument();
    expect(screen.queryByText(en['severity.CRITICAL'])).not.toBeInTheDocument();
  });

  it('has a word for every severity there is', () => {
    for (const severity of SEVERITIES) {
      const { container, unmount } = renderUi(<SeverityPill severity={severity} />);

      expect(container.textContent).toBe(en[`severity.${severity}`]);
      unmount();
    }
  });
});

describe('Card', () => {
  it('is a white rounded panel around what it is given', () => {
    renderUi(
      <Card>
        <p>Inside</p>
      </Card>,
    );

    expect(screen.getByText('Inside').parentElement).toHaveClass('rounded-2xl', 'bg-card', 'p-6');
  });

  it('adds the classes it is given after its own, and leaves no stray space without any', () => {
    renderUi(
      <>
        <Card className="mt-4">
          <p>With</p>
        </Card>
        <Card>
          <p>Without</p>
        </Card>
      </>,
    );

    const withClass = screen.getByText('With').parentElement as HTMLElement;
    expect(withClass).toHaveClass('mt-4');
    expect(withClass.className.endsWith(' mt-4')).toBe(true);
    expect((screen.getByText('Without').parentElement as HTMLElement).className.endsWith(' ')).toBe(
      false,
    );
  });
});
