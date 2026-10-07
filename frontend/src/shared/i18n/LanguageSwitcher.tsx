import { useId } from 'react';
import { LANGUAGES, type Language } from '@contracts/enums';
import { useI18n } from './I18nProvider';

/** Each language is named in its own script, so a person who cannot read English can still find theirs. */
export function LanguageSwitcher({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { language, setLanguage, t } = useI18n();
  const id = useId();
  const colours =
    tone === 'dark' ? 'border-navy-600 bg-navy-800 text-white' : 'border-line bg-white text-ink';
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">
        {t('lang.label')}
      </label>
      <select
        id={id}
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
        className={`min-h-11 rounded-md border px-2 text-sm ${colours}`}
      >
        {LANGUAGES.map((code) => (
          <option key={code} value={code}>
            {t(`lang.${code}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
