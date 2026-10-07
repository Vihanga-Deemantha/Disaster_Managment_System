import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { District, Language } from '@contracts/enums';
import { en, type MessageKey, type Messages } from './messages.en';
import { si } from './messages.si';
import { ta } from './messages.ta';

const CATALOGS: Record<Language, Messages> = { EN: en, SI: si, TA: ta };
const HTML_LANG: Record<Language, string> = { EN: 'en', SI: 'si', TA: 'ta' };
export const LANGUAGE_STORAGE_KEY = 'safezone.language';

export type TranslationParams = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: TranslationParams) => string;

/** Replaces `{name}` placeholders. Unknown placeholders are left visible so they get noticed. */
export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}

function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'SI' || stored === 'TA' || stored === 'EN') return stored;
  } catch {
    // Storage can be blocked (private windows); the language then simply resets to English.
  }
  return 'EN';
}

interface I18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  initialLanguage?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage ?? readStoredLanguage);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Not persisting is acceptable; the choice still applies for this visit.
    }
  }, []);

  // The browser and screen readers must know the page language, including a language restored on startup.
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[language];
  }, [language]);

  const value = useMemo<I18nValue>(
    () => ({
      language,
      setLanguage,
      t: (key, params) => interpolate(CATALOGS[language][key], params),
    }),
    [language, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>.');
  return value;
}

export const useT = (): Translate => useI18n().t;

/** "කොළඹ (Colombo)" in Sinhala and Tamil, plain "Colombo" in English, so staff can always read it too. */
export function districtLabel(t: Translate, language: Language, district: District): string {
  const native = t(`district.${district}`);
  return language === 'EN' ? native : `${native} (${en[`district.${district}`]})`;
}
