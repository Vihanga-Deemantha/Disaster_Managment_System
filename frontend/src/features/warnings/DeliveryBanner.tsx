import { useId } from 'react';
import { useI18n, type Translate } from '@/shared/i18n/I18nProvider';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { deliveryOutcome, formatCount, validityState, type DeliveryOutcome } from './format';
import type { DeliveryDto, IssueResult } from './types';
import type { Language } from '@contracts/enums';

interface Look {
  box: string;
  disc: string;
  heading: string;
  icon: IconName;
}

/** Green when everyone was reached, amber while retries are due, red when citizens were missed. */
const LOOKS: Record<DeliveryOutcome, Look> = {
  ALL: {
    box: 'border-success-600/20 bg-success-100',
    disc: 'bg-success-600',
    heading: 'text-success-600',
    icon: 'check',
  },
  PENDING: {
    box: 'border-warning-600/20 bg-warning-100',
    disc: 'bg-warning-600',
    heading: 'text-warning-600',
    icon: 'clock',
  },
  FAILED: {
    box: 'border-danger-600/20 bg-danger-100',
    disc: 'bg-danger-600',
    heading: 'text-danger-600',
    icon: 'alertTriangle',
  },
  OUTAGE: {
    box: 'border-danger-600/20 bg-danger-100',
    disc: 'bg-danger-600',
    heading: 'text-danger-600',
    icon: 'alertCircle',
  },
};

const PILLS = {
  ACTIVE: 'border-success-600/30 text-success-600',
  EXPIRED: 'border-line text-ink-soft',
} as const;

/** What the banner says. Only "all reached" may say success: the rest say what is still wrong (HCI-05a). */
function wording(t: Translate, outcome: DeliveryOutcome, result: IssueResult, language: Language) {
  const count = (value: number): string => formatCount(value, language);
  switch (outcome) {
    case 'ALL':
      return {
        title: t('warnings.delivery.banner.ALL.title'),
        body: t('warnings.delivery.banner.ALL.body', { count: count(result.targeted) }),
      };
    case 'PENDING':
      return {
        title: t('warnings.delivery.banner.PENDING.title'),
        body: t('warnings.delivery.banner.PENDING.body', {
          reached: count(result.reached),
          total: count(result.targeted),
        }),
      };
    case 'FAILED':
      return {
        title: t('warnings.delivery.banner.FAILED.title'),
        body: t('warnings.delivery.banner.FAILED.body', {
          failed: count(result.failed),
          total: count(result.targeted),
        }),
      };
    case 'OUTAGE':
      return { title: t('warnings.delivery.outageTitle'), body: t('warnings.delivery.outageBody') };
  }
}

/**
 * The strip under the title (step 14). The warning IS issued whatever happened, but how far it got is
 * said in words and colour, not assumed: the pill says whether it is still in force.
 */
export function DeliveryBanner({ delivery }: { delivery: DeliveryDto }) {
  const { t, language } = useI18n();
  const headingId = useId();
  const outcome = deliveryOutcome(delivery);
  const look = LOOKS[outcome];
  const { title, body } = wording(t, outcome, delivery.result, language);
  const state = validityState(delivery.warning, Date.now());
  return (
    <section
      role={outcome === 'ALL' ? 'status' : 'alert'}
      aria-labelledby={headingId}
      className={`flex flex-wrap items-center gap-4 rounded-2xl border px-6 py-5 ${look.box}`}
    >
      <span
        className={`flex h-12 w-12 flex-none items-center justify-center rounded-full text-white ${look.disc}`}
      >
        <Icon name={look.icon} size={24} strokeWidth={2.4} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id={headingId} className={`text-xl font-extrabold ${look.heading}`}>
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-ink">{body}</p>
      </div>
      <span
        className={`rounded-lg border bg-white px-4 py-2 text-xs font-extrabold tracking-wider uppercase ${PILLS[state]}`}
      >
        {t(`warnings.delivery.state.${state}`)}
      </span>
    </section>
  );
}
