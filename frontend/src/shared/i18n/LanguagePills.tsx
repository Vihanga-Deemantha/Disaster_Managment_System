import { LANGUAGES } from '@contracts/enums';
import { HTML_LANG, useI18n } from './I18nProvider';

const SHELL = {
  light: 'border-line-soft bg-white',
  dark: 'border-transparent bg-navy-800',
} as const;

const ACTIVE = {
  light: 'bg-navy-900 text-white',
  dark: 'bg-white text-navy-900',
} as const;

const IDLE = {
  light: 'text-ink hover:bg-paper',
  dark: 'text-white hover:bg-white/10',
} as const;

/**
 * The language choice as three pills (සිංහල, தமிழ், English). Each is written in its own script, and
 * marked with its own `lang`, so a person who cannot read English can still find theirs.
 */
export function LanguagePills({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { language, setLanguage, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t('lang.label')}
      className={`ml-auto inline-flex items-center gap-0.5 rounded-full border p-[3px] ${SHELL[tone]}`}
    >
      {LANGUAGES.map((code) => (
        <button
          key={code}
          type="button"
          lang={HTML_LANG[code]}
          aria-pressed={code === language}
          onClick={() => setLanguage(code)}
          className={`min-h-9 rounded-full px-3 text-[13px] font-semibold transition-colors ${code === language ? ACTIVE[tone] : IDLE[tone]}`}
        >
          {t(`lang.${code}`)}
        </button>
      ))}
    </div>
  );
}
