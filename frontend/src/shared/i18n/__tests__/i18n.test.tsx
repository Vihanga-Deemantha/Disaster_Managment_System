import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ApiError, NetworkError } from '@/shared/api/errors';
import {
  I18nProvider,
  LANGUAGE_STORAGE_KEY,
  districtLabel,
  interpolate,
  useI18n,
  useT,
} from '../I18nProvider';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { en, type MessageKey } from '../messages.en';
import { si } from '../messages.si';
import { ta } from '../messages.ta';
import { translateCode, translateError } from '../translateError';

const wrapper =
  (initialLanguage?: 'EN' | 'SI' | 'TA') =>
  ({ children }: { children: ReactNode }) => (
    <I18nProvider initialLanguage={initialLanguage}>{children}</I18nProvider>
  );

describe('translation catalogues (the citizen-facing languages must be complete)', () => {
  const keys = Object.keys(en) as MessageKey[];
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it.each([
    ['Sinhala', si],
    ['Tamil', ta],
  ])('%s has exactly the same keys as English', (_name, catalogue) => {
    expect(Object.keys(catalogue).sort()).toEqual([...keys].sort());
  });

  it.each([
    ['Sinhala', si],
    ['Tamil', ta],
  ])('%s has no empty strings', (_name, catalogue) => {
    const empty = keys.filter((key) => catalogue[key].trim() === '');
    expect(empty).toEqual([]);
  });

  it.each([
    ['Sinhala', si],
    ['Tamil', ta],
  ])(
    '%s keeps every {placeholder} the English message has (so no count or name goes missing)',
    (_name, catalogue) => {
      const mismatched = keys.filter(
        (key) => placeholders(catalogue[key]).join() !== placeholders(en[key]).join(),
      );
      expect(mismatched).toEqual([]);
    },
  );

  it('writes each language name in its own script, identically everywhere', () => {
    for (const catalogue of [en, si, ta]) {
      expect([catalogue['lang.SI'], catalogue['lang.TA'], catalogue['lang.EN']]).toEqual([
        'සිංහල',
        'தமிழ்',
        'English',
      ]);
    }
  });

  it('actually translates: the Sinhala and Tamil sign-in titles differ from English', () => {
    expect(si['auth.login.title']).not.toBe(en['auth.login.title']);
    expect(ta['auth.login.title']).not.toBe(en['auth.login.title']);
  });
});

describe('interpolate', () => {
  it('fills named placeholders, numbers included', () => {
    expect(interpolate('{name} has {count} changes', { name: 'Perera', count: 3 })).toBe(
      'Perera has 3 changes',
    );
  });

  it('leaves an unknown placeholder visible so it gets noticed', () => {
    expect(interpolate('Hello {who}', { name: 'x' })).toBe('Hello {who}');
  });

  it('returns the text untouched when there are no params', () => {
    expect(interpolate('Hello {who}')).toBe('Hello {who}');
  });
});

describe('I18nProvider', () => {
  it('defaults to English', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: wrapper() });

    expect(result.current.language).toBe('EN');
    expect(result.current.t('auth.login.title')).toBe('Sign in');
  });

  it('switches language, persists it, and tells the browser which language the page is in', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: wrapper() });

    act(() => result.current.setLanguage('SI'));

    expect(result.current.t('auth.login.title')).toBe(si['auth.login.title']);
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('SI');
    expect(document.documentElement.lang).toBe('si');
    act(() => result.current.setLanguage('TA'));
    expect(document.documentElement.lang).toBe('ta');
  });

  it('restores the saved language on the next visit', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'TA');

    const { result } = renderHook(() => useI18n(), { wrapper: wrapper() });

    expect(result.current.language).toBe('TA');
  });

  it('tells the browser the page language on startup too, not only after a switch', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'SI');

    renderHook(() => useI18n(), { wrapper: wrapper() });

    expect(document.documentElement.lang).toBe('si');
  });

  it('ignores a corrupt saved value', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'KLINGON');

    expect(renderHook(() => useI18n(), { wrapper: wrapper() }).result.current.language).toBe('EN');
  });

  it('still works when browser storage is blocked (private windows)', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const { result } = renderHook(() => useI18n(), { wrapper: wrapper() });
    act(() => result.current.setLanguage('SI'));

    expect(result.current.language).toBe('SI');
    get.mockRestore();
    set.mockRestore();
  });

  it('refuses to be used without a provider', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useT())).toThrow(/I18nProvider/);
    quiet.mockRestore();
  });

  it('useT returns the translate function', () => {
    const { result } = renderHook(() => useT(), { wrapper: wrapper('SI') });

    expect(result.current('common.cancel')).toBe(si['common.cancel']);
  });
});

describe('districtLabel', () => {
  it('shows the English name in English and "native (English)" otherwise, so staff can always read it', () => {
    const english = renderHook(() => useI18n(), { wrapper: wrapper('EN') }).result.current;
    const sinhala = renderHook(() => useI18n(), { wrapper: wrapper('SI') }).result.current;
    const tamil = renderHook(() => useI18n(), { wrapper: wrapper('TA') }).result.current;

    expect(districtLabel(english.t, 'EN', 'COLOMBO')).toBe('Colombo');
    expect(districtLabel(sinhala.t, 'SI', 'COLOMBO')).toBe('කොළඹ (Colombo)');
    expect(districtLabel(tamil.t, 'TA', 'NUWARA_ELIYA')).toBe('நுவரெலியா (Nuwara Eliya)');
  });
});

describe('LanguageSwitcher', () => {
  it('offers each language in its own script and switches the page', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <LanguageSwitcher />
        <Title />
      </I18nProvider>,
    );

    const select = screen.getByRole('combobox', { name: 'Language' });
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'සිංහල',
      'தமிழ்',
      'English',
    ]);
    await user.selectOptions(select, 'SI');

    expect(screen.getByRole('heading')).toHaveTextContent(si['auth.login.title']);
  });

  it('can be drawn for a dark header', () => {
    render(
      <I18nProvider>
        <LanguageSwitcher tone="dark" />
      </I18nProvider>,
    );

    expect(screen.getByRole('combobox')).toHaveClass('bg-navy-800');
  });
});

function Title() {
  const t = useT();
  return <h1>{t('auth.login.title')}</h1>;
}

describe('translateCode / translateError', () => {
  const t = renderHook(() => useT(), { wrapper: wrapper('EN') }).result.current;

  it('turns a known API code into a sentence', () => {
    expect(translateCode(t, 'NIC_ALREADY_REGISTERED')).toBe(en['error.NIC_ALREADY_REGISTERED']);
  });

  it('falls back to a generic message for a code it does not know', () => {
    expect(translateCode(t, 'SOMETHING_NEW')).toBe(en['error.UNKNOWN']);
  });

  it('fills in the wait time for throttled sign-ins', () => {
    const error = new ApiError(429, 'LOGIN_THROTTLED', 'm', [], { retryAfterSeconds: 4 });

    expect(translateError(t, error)).toBe(
      'Too many attempts. Please wait 4 seconds and try again.',
    );
  });

  it('gives being offline its own message', () => {
    expect(translateError(t, new NetworkError())).toBe(en['error.NETWORK']);
  });

  it('treats anything else as unknown', () => {
    expect(translateError(t, new Error('boom'))).toBe(en['error.UNKNOWN']);
    expect(translateError(t, 'weird')).toBe(en['error.UNKNOWN']);
  });
});
