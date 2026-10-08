import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { LANGUAGES, type Language } from '@/shared/contracts/enums';
import type { KeyValueStore } from '@/shared/storage/KeyValueStore';
import { translatorFor, type Translate } from './translate';

const KEY = 'safezone.ui-language';

interface I18nValue {
  /** The language of the app's own texts (alerts arrive in the language the citizen chose at registration). */
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
}

const I18nContext = createContext<I18nValue | null>(null);

const isLanguage = (value: string | null): value is Language =>
  LANGUAGES.some((language) => language === value);

/**
 * The app's language: English until the person picks Sinhala or Tamil, then that choice, kept on the
 * phone. Reading it takes a moment, so the first frame may be English; the splash screen covers it.
 */
export function I18nProvider({
  store,
  initial = 'EN',
  children,
}: {
  store: KeyValueStore;
  initial?: Language;
  children: ReactNode;
}) {
  const [language, setLanguageState] = useState<Language>(initial);

  useEffect(() => {
    let cancelled = false;
    store
      .get(KEY)
      .then((saved) => {
        if (!cancelled && isLanguage(saved)) setLanguageState(saved);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [store]);

  const setLanguage = useCallback(
    (next: Language) => {
      setLanguageState(next);
      store.set(KEY, next).catch(() => undefined);
    },
    [store],
  );

  const value = useMemo(
    () => ({ language, setLanguage, t: translatorFor(language) }),
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
