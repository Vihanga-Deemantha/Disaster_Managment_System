import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { CHANNELS } from '@contracts/enums';
import { useApi } from '@/shared/api/ApiProvider';
import { useT } from '@/shared/i18n/I18nProvider';
import { translateError } from '@/shared/i18n/translateError';
import { useDocumentTitle } from '@/shared/layout/useDocumentTitle';
import { LastSynced } from '@/shared/offline/LastSynced';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { useOnlineStatus } from '@/shared/offline/useOnlineStatus';
import { Alert } from '@/shared/ui/Alert';
import { Button, buttonClasses } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { PageHeader } from '@/shared/ui/PageHeader';
import { SeverityPill } from '@/shared/ui/SeverityPill';
import { Spinner } from '@/shared/ui/Spinner';
import { StatCard } from '@/shared/ui/StatCard';
import { DemoTools } from './DemoGatewayPanel';
import { HazardIcon } from './HazardIcon';
import { getDelivery, retryFailed, reviewPath, unreachedCsvUrl } from './api';
import { areaNames, hasRetryableDelivery, reachedPercent } from './format';
import type { DeliveryDto, IssueResult } from './types';

/** While retries are still due, the numbers move on their own. */
export const REFRESH_MS = 10_000;

export function useAutoRefresh(enabled: boolean, reload: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(reload, REFRESH_MS);
    return () => clearInterval(timer);
  }, [enabled, reload]);
}

/** The four numbers of step 14. "Reached" is rounded down: 100% only ever means everyone. */
function Figures({ result }: { result: IssueResult }) {
  const t = useT();
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="users"
          tone="blue"
          value={String(result.targeted)}
          label={t('warnings.delivery.targeted')}
        />
        <StatCard
          icon="checkCircle"
          tone="green"
          value={String(result.reached)}
          label={t('warnings.delivery.reached')}
        />
        <StatCard
          icon="clock"
          tone="amber"
          value={String(result.pendingRetry)}
          label={t('warnings.delivery.pending')}
        />
        <StatCard
          icon="alertTriangle"
          tone="red"
          value={String(result.failed)}
          label={t('warnings.delivery.failed')}
        />
      </div>
      <p className="text-lg font-bold text-navy-900">
        {t('warnings.delivery.percent', { percent: reachedPercent(result) })}
      </p>
    </>
  );
}

function ChannelTable({ result }: { result: IssueResult }) {
  const t = useT();
  return (
    <section aria-labelledby="channels-heading" className="space-y-3">
      <h2 id="channels-heading" className="text-[15px] font-bold text-navy-900">
        {t('warnings.delivery.channelsHeading')}
      </h2>
      <div className="overflow-x-auto rounded-2xl border border-line-soft bg-card shadow-[0_1px_2px_rgba(20,40,72,0.05)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[13px] text-navy-900">
              {(['channel', 'sent', 'delivered', 'failed'] as const).map((column) => (
                <th key={column} scope="col" className="px-5 py-4 font-bold">
                  {t(`warnings.delivery.col.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CHANNELS.map((channel) => (
              <tr key={channel} className="border-t border-line-soft">
                <th scope="row" className="px-5 py-4 font-bold text-navy-900">
                  {t(`warnings.review.channel.${channel}`)}
                </th>
                <td className="px-5 py-4">{result.byChannel[channel].sent}</td>
                <td className="px-5 py-4">{result.byChannel[channel].delivered}</td>
                <td className="px-5 py-4">{result.byChannel[channel].failed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** A1, E2, E3: send again whatever did not get through; the follow-up list for the rest. */
function Remedies({
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
    <div className="space-y-3">
      {failure ? <Alert tone="danger">{translateError(t, failure)}</Alert> : null}
      <div className="flex flex-wrap items-center gap-3">
        {hasRetryableDelivery(result) ? (
          <Button
            variant="secondary"
            disabled={!online}
            loading={busy}
            loadingLabel={t('warnings.delivery.retrying')}
            onClick={() => void retry()}
          >
            {t('warnings.delivery.retry')}
          </Button>
        ) : null}
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

function DeliveryBody({
  delivery,
  online,
  reload,
}: {
  delivery: DeliveryDto;
  online: boolean;
  reload: () => void;
}) {
  const t = useT();
  const { warning, result } = delivery;
  if (warning.status !== 'ISSUED') {
    return (
      <Alert tone="info">
        <p>{t('warnings.delivery.notIssued')}</p>
        <Link to={reviewPath(warning.warningId)} className="font-semibold underline">
          {t('warnings.delivery.openReview')}
        </Link>
      </Alert>
    );
  }
  return (
    <>
      <p className="flex flex-wrap items-center gap-3 text-ink">
        <SeverityPill severity={warning.severity} />
        <span className="flex items-center gap-2 font-bold text-navy-900">
          <HazardIcon hazard={warning.hazardType} />
          {t(`warnings.hazard.${warning.hazardType}`)}
        </span>
        <span>{areaNames(warning)}</span>
      </p>
      {delivery.allChannelsUnavailable ? (
        <Alert tone="danger">
          <p className="font-semibold">{t('warnings.delivery.outageTitle')}</p>
          <p>{t('warnings.delivery.outageBody')}</p>
        </Alert>
      ) : null}
      <Figures result={result} />
      <ChannelTable result={result} />
      {result.pendingRetry > 0 ? (
        <p className="text-sm text-ink-soft">{t('warnings.delivery.autoRefresh')}</p>
      ) : null}
      <Remedies delivery={delivery} online={online} reload={reload} />
    </>
  );
}

/** UC-1 step 14 (screen 6): what really happened, per channel, never a flat "100% delivered" (HCI-05a). */
export function DeliverySummaryPage() {
  const t = useT();
  const api = useApi();
  const online = useOnlineStatus();
  const { warningId } = useParams() as { warningId: string };
  useDocumentTitle(t('warnings.delivery.title'));
  const delivery = useCachedResource({
    module: 'warnings',
    name: `delivery:${warningId}`,
    load: () => getDelivery(api, warningId),
  });
  useAutoRefresh(
    delivery.data !== undefined && delivery.data.result.pendingRetry > 0,
    delivery.reload,
  );

  return (
    <section className="space-y-5">
      <PageHeader title={t('warnings.delivery.title')} subtitle={t('warnings.delivery.subtitle')} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/warnings"
          className="flex items-center gap-2 text-sm font-semibold text-navy-900 hover:underline"
        >
          <Icon name="arrowLeft" size={16} />
          {t('warnings.delivery.back')}
        </Link>
        <LastSynced syncedAt={delivery.syncedAt} />
      </div>
      {delivery.error ? (
        <Alert tone="danger">
          <span>{translateError(t, delivery.error)}</span>{' '}
          <Button variant="secondary" onClick={delivery.reload}>
            {t('common.retry')}
          </Button>
        </Alert>
      ) : null}
      {delivery.data ? (
        <DeliveryBody delivery={delivery.data} online={online} reload={delivery.reload} />
      ) : null}
      {delivery.loading && !delivery.data ? <Spinner /> : null}
      <DemoTools />
    </section>
  );
}
