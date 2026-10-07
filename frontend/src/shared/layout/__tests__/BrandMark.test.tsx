import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/shared/i18n/I18nProvider';
import { BrandMark } from '../BrandMark';
import { useDocumentTitle } from '../useDocumentTitle';

const renderMark = (ui: React.ReactElement, language: 'EN' | 'SI' = 'EN') =>
  render(<I18nProvider initialLanguage={language}>{ui}</I18nProvider>);

describe('BrandMark', () => {
  it('shows the logo (as decoration) and the two-word name, which reads as one name', () => {
    const { container } = renderMark(<BrandMark />);

    expect(screen.getByText(/Safe/)).toHaveTextContent('Safe Zone');
    const logo = container.querySelector('img');
    expect(logo).toHaveAttribute('src', '/favicon.svg');
    expect(logo).toHaveAttribute('alt', '');
  });

  it('leaves the tagline out unless asked', () => {
    renderMark(<BrandMark />);

    expect(screen.queryByText(/coordination for Sri Lanka/)).not.toBeInTheDocument();
  });

  it('writes the tagline in the page language when asked for', () => {
    renderMark(<BrandMark tagline />, 'SI');

    expect(
      screen.getByText('ශ්‍රී ලංකාව සඳහා ආපදා අනතුරු ඇඟවීම් සහ සම්බන්ධීකරණය'),
    ).toBeInTheDocument();
  });

  it('can be dressed for a dark background, and be given a custom tagline class', () => {
    renderMark(<BrandMark tone="dark" size="sm" tagline taglineClass="hidden" />);

    expect(screen.getByText('Zone')).toHaveClass('text-accent-400');
    expect(screen.getByText('Disaster alerts and coordination for Sri Lanka')).toHaveClass(
      'hidden',
      'text-slate-200',
    );
  });

  it('is dark on light by default', () => {
    renderMark(<BrandMark />);

    expect(screen.getByText('Zone')).toHaveClass('text-accent-600');
  });
});

function Titled({ title }: { title: string }) {
  useDocumentTitle(title);
  return null;
}

describe('useDocumentTitle', () => {
  it('sets the tab title, follows changes, and puts the old one back on leaving', () => {
    document.title = 'Before';

    const { rerender, unmount } = render(<Titled title="First" />);
    expect(document.title).toBe('First');

    rerender(<Titled title="Second" />);
    expect(document.title).toBe('Second');

    unmount();
    expect(document.title).toBe('Before');
  });
});
