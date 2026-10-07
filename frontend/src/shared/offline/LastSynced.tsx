import { useEffect, useState } from 'react';
import { useI18n } from '@/shared/i18n/I18nProvider';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "5 minutes ago", in the user's language. Anything under a minute reads as "now". */
export function relativeTime(then: number, now: number, locale: string): string {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const elapsed = now - then;
  for (const [unit, size] of UNITS) {
    if (Math.abs(elapsed) >= size) return formatter.format(-Math.round(elapsed / size), unit);
  }
  return formatter.format(0, 'second');
}

const LOCALES = { EN: 'en', SI: 'si', TA: 'ta' } as const;

/**
 * The single "last synced" label every module uses next to cached data (master plan §6), so people
 * always know how old what they are looking at is. Re-renders each minute.
 */
export function LastSynced({ syncedAt }: { syncedAt: number | undefined }) {
  const { language, t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (syncedAt === undefined)
    return <span className="text-xs text-ink-soft">{t('offline.neverSynced')}</span>;
  return (
    <time
      dateTime={new Date(syncedAt).toISOString()}
      title={new Date(syncedAt).toLocaleString(LOCALES[language])}
      className="text-xs text-ink-soft"
    >
      {t('offline.lastSynced', { time: relativeTime(syncedAt, now, LOCALES[language]) })}
    </time>
  );
}
