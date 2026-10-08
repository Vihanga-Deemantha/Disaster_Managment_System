import { useMemo } from 'react';
import { useParams } from 'react-router';
import { useApi } from '@/shared/api/ApiProvider';
import { useT } from '@/shared/i18n/I18nProvider';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { useOnlineStatus } from '@/shared/offline/useOnlineStatus';
import { hazardReportsApi } from '../api/hazardReportsApi';
import { AsyncState } from '../components/AsyncState';
import { ReportEvidence } from '../components/ReportEvidence';
import { ReportReviewActions } from '../components/ReportReviewActions';
import { ReviewFeedback } from '../components/ReviewFeedback';
import { useReportReview } from '../hooks/useReportReview';

export function ReportDetail() {
  const { reportId } = useParams();
  return reportId ? <ReportResource key={reportId} reportId={reportId} /> : null;
}
function ReportResource({ reportId }: { reportId: string }) {
  const t = useT();
  const api = useApi();
  const client = useMemo(() => hazardReportsApi(api), [api]);
  const online = useOnlineStatus();
  const resource = useCachedResource({
    module: 'hazard-reports',
    name: `report:${reportId}`,
    load: () => client.report(reportId),
  });
  const { receipt, review } = useReportReview(client, reportId, resource.reload);
  const shown = receipt?.value.report ?? resource.data;
  return (
    <section className="space-y-6">
      <ReviewFeedback receipt={receipt} />
      <AsyncState resource={resource} emptyMessage={t('error.REPORT_NOT_FOUND')}>
        {(loaded) => <ReportEvidence report={receipt?.value.report ?? loaded} />}
      </AsyncState>
      <ReportReviewActions
        report={resource.error ? undefined : shown}
        online={online}
        onReview={review}
      />
    </section>
  );
}
