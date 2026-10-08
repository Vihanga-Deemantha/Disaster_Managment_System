import type { Language } from '@contracts/enums';
const LOCALES: Record<Language, string> = { EN: 'en-LK', SI: 'si-LK', TA: 'ta-LK' };
export function formatTime(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Colombo',
  }).format(new Date(iso));
}
