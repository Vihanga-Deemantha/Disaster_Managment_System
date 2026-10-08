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
import { SeverityBadge } from '@/shared/ui/SeverityBadge';
import { Spinner } from '@/shared/ui/Spinner';
import { DemoTools } from './DemoGatewayPanel';
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

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="mt-1 text-2xl font-bold text-navy-900">{value}</dd>
    </div>
  );
}

/** The four numbers of step 14. "Reached" is rounded down: 100% only ever means everyone. */
function Figures({ result }: { result: IssueResult }) {
  const t = useT();
  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-4">
        <Figure label={t('warnings.delivery.targeted')} value={String(result.targeted)} />
        <Figure label={t('warnings.delivery.reached')} value={String(result.reached)} />
        <Figure label={t('warnings.delivery.pending')} value={String(result.pendingRetry)} />
        <Figure label={t('warnings.delivery.failed')} value={String(result.failed)} />
      </dl>
      <p className="text-lg font-semibold text-navy-900">
        {t('warnings.delivery.percent', { percent: reachedPercent(result) })}
      </p>
    </>
  );
}

function ChannelTable({ result }: { result: IssueResult }) {
  const t = useT();
  return (
    <section aria-labelledby="channels-heading" className="space-y-2">
      <h2 id="channels-heading" className="text-lg font-bold text-navy-900">
        {t('warnings.delivery.channelsHeading')}
      </h2>
      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-ink-soft">
            <tr>
              {(['channel', 'sent', 'delivered', 'failed'] as const).map((column) => (
                <th key={column} scope="col" className="px-4 py-3 font-semibold">
                  {t(`warnings.delivery.col.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CHANNELS.map((channel) => (
              <tr key={channel} className="border-t border-line">
                <th scope="row" className="px-4 py-3 font-semibold">
                  {t(`warnings.review.channel.${channel}`)}
                </th>
                <td className="px-4 py-3">{result.byChannel[channel].sent}</td>
                <td className="px-4 py-3">{result.byChannel[channel].delivered}</td>
                <td className="px-4 py-3">{result.byChannel[channel].failed}</td>
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
        <SeverityBadge severity={warning.severity} />
        <span className="font-semibold">{t(`warnings.hazard.${warning.hazardType}`)}</span>
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
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Link to="/warnings" className="text-sm font-semibold text-accent-700 underline">
            {t('warnings.delivery.back')}
          </Link>
          <h1 className="text-2xl font-bold text-navy-900">{t('warnings.delivery.title')}</h1>
        </div>
        <LastSynced syncedAt={delivery.syncedAt} />
      </header>
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
