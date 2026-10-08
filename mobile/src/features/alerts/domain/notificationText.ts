import { translatorFor } from '@/shared/i18n/translate';
import type { Alert } from './types';

/** The longest body worth putting in a banner; the full text is one tap away. */
export const BANNER_BODY_LENGTH = 300;

export interface NotificationContent {
  title: string;
  body: string;
  /** Carried through the banner so a tap can open this alert. */
  data: { alertId: string };
}

function shorten(text: string): string {
  const characters = [...text.trim()];
  return characters.length <= BANNER_BODY_LENGTH
    ? characters.join('')
    : `${characters.slice(0, BANNER_BODY_LENGTH - 1).join('')}…`;
}

/**
 * What the phone's banner says for an alert. The title is in the alert's own language (the one the
 * citizen asked warnings in), like the message under it, whatever language the app is showing.
 */
export function notificationContent(alert: Alert): NotificationContent {
  const t = translatorFor(alert.language);
  return {
    title: t('notification.title', {
      hazard: t(`hazard.${alert.hazardType}`),
      severity: t(`severity.${alert.severity}`),
    }),
    body: shorten(alert.message),
    data: { alertId: alert.alertId },
  };
}
