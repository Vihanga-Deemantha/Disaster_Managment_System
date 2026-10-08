import { useId, useState } from 'react';
import { LANGUAGES, type Language } from '@contracts/enums';
import { HTML_LANG, useT } from '@/shared/i18n/I18nProvider';
import { Alert } from '@/shared/ui/Alert';
import { Icon } from '@/shared/ui/Icon';
import { SMS_MAX_LENGTH, missingLanguages, smsLength } from './format';
import type { Messages } from './types';

/** The character counter under a text: turns red, and says so in words, once one SMS cannot hold it. */
function SmsCounter({ text }: { text: string }) {
  const t = useT();
  const count = smsLength(text);
  const over = count > SMS_MAX_LENGTH;
  return (
    <p className={`text-sm ${over ? 'font-semibold text-danger-600' : 'text-ink-soft'}`}>
      {t('warnings.review.smsCount', { count, max: SMS_MAX_LENGTH })}
      {over ? ` · ${t('warnings.review.smsTooLong')}` : ''}
    </p>
  );
}

/**
 * The warning message in Sinhala, Tamil and English (SC1-05, HCI-06a). A language with no text is marked
 * on its tab and explained in the panel, because the warning cannot be issued without all three.
 */
export function MessageTabs({ messages }: { messages: Messages }) {
  const t = useT();
  const id = useId();
  const [active, setActive] = useState<Language>('EN');
  const missing = missingLanguages(messages);
  const text = messages[active];
  const name = (language: Language): string =>
    missing.includes(language)
      ? t('warnings.review.tabMissing', { language: t(`lang.${language}`) })
      : t(`lang.${language}`);

  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3">
      <h3
        id={`${id}-heading`}
        className="flex items-center gap-2.5 text-[15px] font-bold text-navy-900"
      >
        <Icon name="fileText" size={18} className="text-ink-soft" />
        {t('warnings.review.message')}
      </h3>
      <div role="tablist" aria-label={t('warnings.review.languageTabs')} className="flex gap-2">
        {LANGUAGES.map((language) => (
          <button
            key={language}
            type="button"
            role="tab"
            id={`${id}-tab-${language}`}
            aria-selected={active === language}
            aria-controls={`${id}-panel`}
            onClick={() => setActive(language)}
            className={`min-h-10 rounded-lg border px-4 text-sm font-semibold ${
              active === language
                ? 'border-accent-600 bg-accent-600 text-white'
                : 'border-line bg-white text-navy-900 hover:bg-accent-100'
            }`}
          >
            {name(language)}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${active}`}
        className="space-y-2 rounded-xl bg-accent-50 p-4"
      >
        {text.trim() === '' ? (
          <Alert tone="warning">
            {t('warnings.review.missing', { language: t(`lang.${active}`) })}
          </Alert>
        ) : (
          <p lang={HTML_LANG[active]} className="whitespace-pre-wrap leading-relaxed text-ink">
            {text}
          </p>
        )}
        <SmsCounter text={text} />
      </div>
    </section>
  );
}
