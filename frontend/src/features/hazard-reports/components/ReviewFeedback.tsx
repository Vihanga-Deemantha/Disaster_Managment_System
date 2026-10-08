import { Link } from 'react-router';
import { useT } from '@/shared/i18n/I18nProvider';
import { Alert } from '@/shared/ui/Alert';
import type { ReviewReceipt } from '../hooks/useReportReview';

export function ReviewFeedback({ receipt }: { receipt: ReviewReceipt | undefined }) {
  const t = useT();
  if (!receipt) return null;
  const cluster = receipt.value.cluster;
  return (
    <Alert tone="success">
      <p>
        {t(`hazardReports.${receipt.action}.done`, {
          score: cluster.priorityScore,
          band: t(`hazardReports.band.${cluster.band}`),
        })}
      </p>
      {cluster.status === 'ESCALATION_RECOMMENDED' && (
        <Link to={`../clusters/${cluster.id}`}>{t('hazardReports.review.nowRecommended')}</Link>
      )}
      {cluster.status === 'CLOSED' && <p>{t('hazardReports.reject.clusterClosed')}</p>}
    </Alert>
  );
}
