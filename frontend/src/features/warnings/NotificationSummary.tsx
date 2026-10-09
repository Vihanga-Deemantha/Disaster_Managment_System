import { useState } from 'react';
import { CHANNELS, type Channel } from '@contracts/enums';
import { useApi } from '@/shared/api/ApiProvider';
import { useI18n, useT } from '@/shared/i18n/I18nProvider';
import { translateError } from '@/shared/i18n/translateError';
import { Alert } from '@/shared/ui/Alert';
import { Button, buttonClasses } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { retryFailed, unreachedCsvUrl } from './api';
import { formatCount, hasRetryableDelivery, reachedPercent } from './format';
import type { ChannelTally, DeliveryDto, IssueResult } from './types';

const CHANNEL_ICONS: Record<Channel, IconName> = {
  PUSH: 'bell',
  SMS: 'messageSquare',
  WHATSAPP: 'messageCircle',
  EMAIL: 'mail',
};

/**
 * One channel and what it really did: how many were delivered and how many failed, never just "Sent".
 * A channel that sent nothing says so, whether it was not used or its gateway was down.
 */
function ChannelRow({ channel, tally }: { channel: Channel; tally: ChannelTally }) {
  const { t, language } = useI18n();
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line-soft py-3.5 last:border-b-0">
      <span className="flex items-center gap-3 text-sm text-navy-900">
        <Icon name={CHANNEL_ICONS[channel]} size={17} className="text-ink-soft" />
        {t(`warnings.delivery.channel.${channel}`)}
      </span>
      {tally.sent === 0 ? (
        <span className="flex items-center gap-1.5 text-sm text-ink-soft">
          <Icon name="minus" size={14} />
          {t('warnings.delivery.channelNone')}
        </span>
      ) : (
        <span className="flex flex-wrap items-center justify-end gap-x-3 text-sm font-semibold">
          {tally.delivered > 0 ? (
            <span className="flex items-center gap-1.5 text-success-600">
              <Icon name="check" size={15} strokeWidth={2.4} />
              {t('warnings.delivery.channelDelivered', {
                count: formatCount(tally.delivered, language),
              })}
            </span>
          ) : null}
          {tally.failed > 0 ? (
            <span className="text-danger-600">
              {t('warnings.delivery.channelFailed', { count: formatCount(tally.failed, language) })}
            </span>
          ) : null}
        </span>
      )}
    </li>
  );
}

/** "12,458 / 12,458" and a bar. The percentage is rounded down: 100% only ever means everyone (HCI-05a). */
function CitizensReached({ result }: { result: IssueResult }) {
  const { t, language } = useI18n();
  const percent = reachedPercent(result);
  return (
    <div>
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl border border-line-soft bg-paper text-navy-900">
          <Icon name="user" size={22} />
        </span>
        <div>
          <p className="text-sm font-bold text-navy-900">{t('warnings.delivery.reachedTitle')}</p>
          <p className="text-[28px] leading-none font-extrabold text-navy-900">
            {formatCount(result.reached, language)}
            <span className="ml-2 text-xl font-semibold text-ink-soft">
              / {formatCount(result.targeted, language)}
            </span>
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <div
          role="progressbar"
          aria-label={t('warnings.delivery.percent', { percent })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2.5 flex-1 overflow-hidden rounded-full bg-line"
        >
          <div className="h-full rounded-full bg-success-600" style={{ width: `${percent}%` }} />
        </div>
        <span className="text-sm font-bold text-navy-900">{percent}%</span>
      </div>
    </div>
  );
}

/** Everyone was reached on every channel they were sent to: nothing to do. */
function AllDelivered() {
  const t = useT();
  return (
    <div className="flex items-start gap-3 rounded-xl bg-success-100 p-4 text-sm">
      <Icon name="info" size={20} className="mt-0.5 flex-none text-info-600" />
      <div>
        <p className="font-bold text-navy-900">{t('warnings.delivery.allDelivered.title')}</p>
        <p className="text-ink-soft">{t('warnings.delivery.allDelivered.body')}</p>
      </div>
    </div>
  );
}

/**
 * Something did not get through (A1, E2, E3): the two numbers that matter, what happens next, and the
 * two ways forward: send again now, or reach the people on the list in person.
 */
function Attention({
  delivery,
  online,
  reload,
}: {
  delivery: DeliveryDto;
  online: boolean;
  reload: () => void;
}) {
  const t = useT();
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const { warning, result } = delivery;

  async function retry(): Promise<void> {
    setBusy(true);
    setFailure(undefined);
    try {
      await retryFailed(api, warning.warningId);
      reload();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl bg-warning-100 p-4 text-sm">
      <div className="flex items-start gap-3">
        <Icon name="alertTriangle" size={20} className="mt-0.5 flex-none text-warning-600" />
        <div className="min-w-0 space-y-1">
          <p className="font-bold text-warning-600">{t('warnings.delivery.attention.title')}</p>
          <p className="text-ink">
            {result.pendingRetry > 0
              ? t('warnings.delivery.autoRefresh')
              : t('warnings.delivery.attention.retry')}
          </p>
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-1 text-navy-900">
        <div className="flex items-baseline gap-2">
          <dt className="text-ink-soft">{t('warnings.delivery.pending')}</dt>
          <dd className="font-extrabold">{result.pendingRetry}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-ink-soft">{t('warnings.delivery.failed')}</dt>
          <dd className="font-extrabold">{result.failed}</dd>
        </div>
      </dl>
      {failure ? <Alert tone="danger">{translateError(t, failure)}</Alert> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={!online}
          loading={busy}
          loadingLabel={t('warnings.delivery.retrying')}
          onClick={() => void retry()}
        >
          {t('warnings.delivery.retry')}
        </Button>
        {result.unreached > 0 ? (
          <a
            href={unreachedCsvUrl(warning.warningId)}
            download
            className={buttonClasses('secondary')}
          >
            {t('warnings.delivery.download')}
          </a>
        ) : null}
      </div>
    </div>
  );
}

/** The right-hand card: each channel, how many citizens were reached, and what to do about the rest. */
export function NotificationSummary({
  delivery,
  online,
  reload,
}: {
  delivery: DeliveryDto;
  online: boolean;
  reload: () => void;
}) {
  const t = useT();
  const { result } = delivery;
  return (
    <Card>
      <h2 className="text-xl font-extrabold text-navy-900">
        {t('warnings.delivery.summaryTitle')}
      </h2>
      <ul className="mt-2">
        {CHANNELS.map((channel) => (
          <ChannelRow key={channel} channel={channel} tally={result.byChannel[channel]} />
        ))}
      </ul>
      <hr className="my-5 border-line-soft" />
      <CitizensReached result={result} />
      <div className="mt-5">
        {hasRetryableDelivery(result) ? (
          <Attention delivery={delivery} online={online} reload={reload} />
        ) : (
          <AllDelivered />
        )}
      </div>
    </Card>
  );
}
