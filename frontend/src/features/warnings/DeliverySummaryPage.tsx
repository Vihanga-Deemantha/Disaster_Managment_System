import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { useApi } from '@/shared/api/ApiProvider';
import { useAuth } from '@/shared/auth/AuthContext';
import { useI18n, useT } from '@/shared/i18n/I18nProvider';
import { translateError } from '@/shared/i18n/translateError';
import { useDocumentTitle } from '@/shared/layout/useDocumentTitle';
import { LastSynced } from '@/shared/offline/LastSynced';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { useOnlineStatus } from '@/shared/offline/useOnlineStatus';
import { Alert } from '@/shared/ui/Alert';
import { Button, buttonClasses } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Icon } from '@/shared/ui/Icon';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Spinner } from '@/shared/ui/Spinner';
import { DeliveryBanner } from './DeliveryBanner';
import { DemoTools } from './DemoGatewayPanel';
import { NotificationSummary } from './NotificationSummary';
import { InfoRow, WarningFacts, WarningTitle } from './WarningFacts';
import { getDelivery, reviewPath } from './api';
import { formatDateTime } from './format';
import type { DeliveryDto, WarningDto } from './types';

/** While retries are still due, the numbers move on their own. */
export const REFRESH_MS = 10_000;

export function useAutoRefresh(enabled: boolean, reload: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(reload, REFRESH_MS);
    return () => clearInterval(timer);
  }, [enabled, reload]);
}

/**
 * Who issued it. Only a DMC Officer can (BR1), so the role is always true; the name is shown when it is
 * the person looking, because the warning keeps the approver's id and nothing else.
 */
function IssuedBy({ warning }: { warning: WarningDto }) {
  const t = useT();
  const me = useAuth().user;
  const role = t('role.DMC_OFFICER');
  if (me && warning.approvedBy === me.userId) {
    return (
      <>
        <span className="block">{me.displayName}</span>
        <span className="block text-xs font-normal text-ink-soft">{role}</span>
      </>
    );
  }
  return <>{role}</>;
}

/** The left card: which warning this was, and when it was issued and by whom. */
function DetailsCard({ warning }: { warning: WarningDto }) {
  const { t, language } = useI18n();
  return (
    <Card>
      <h2 className="mb-4 text-xl font-extrabold text-navy-900">
        {t('warnings.delivery.detailsTitle')}
      </h2>
      <WarningTitle warning={warning} as="h3" />
      <hr className="my-5 border-line-soft" />
      <WarningFacts warning={warning}>
        <InfoRow label={t('warnings.delivery.issuedAt')} icon="clock">
          {formatDateTime(warning.issuedAt as string, language)}
        </InfoRow>
        <InfoRow label={t('warnings.delivery.issuedBy')} icon="user">
          <IssuedBy warning={warning} />
        </InfoRow>
      </WarningFacts>
    </Card>
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
  const { warning } = delivery;
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
      <DeliveryBanner delivery={delivery} />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <DetailsCard warning={warning} />
        <NotificationSummary delivery={delivery} online={online} reload={reload} />
      </div>
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
      <PageHeader title={t('warnings.delivery.title')} subtitle={t('warnings.delivery.subtitle')}>
        <Link to="/warnings/issued" className={buttonClasses('primary')}>
          {t('warnings.delivery.viewIssued')}
          <Icon name="arrowRight" size={16} />
        </Link>
      </PageHeader>
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
