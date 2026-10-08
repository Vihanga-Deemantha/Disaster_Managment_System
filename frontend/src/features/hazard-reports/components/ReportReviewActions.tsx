import { useId, useState } from 'react';
import { useT } from '@/shared/i18n/I18nProvider';
import { Button } from '@/shared/ui/Button';
import type { Report } from '../api/types';
import type { ReviewAction } from '../hooks/useReportReview';
import { ConfirmActionDialog } from './ConfirmActionDialog';
import { RejectDialog } from './RejectDialog';

interface Props {
  report: Report | undefined;
  online: boolean;
  onReview: (action: ReviewAction, reason?: string) => Promise<void>;
}
export function ReportReviewActions({ report, online, onReview }: Props) {
  const t = useT();
  const reasonId = useId();
  const [verifying, setVerifying] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const pending = report?.status === 'PENDING';
  const disabledReason = !online
    ? t('hazardReports.review.offline')
    : !pending
      ? t('error.REPORT_ALREADY_REVIEWED')
      : undefined;
  return (
    <>
      {pending && (
        <div className="space-y-3">
          {!online && <p id={reasonId}>{t('hazardReports.review.offline')}</p>}
          <div className="flex gap-3">
            <Button
              disabled={!online}
              aria-describedby={!online ? reasonId : undefined}
              onClick={() => setVerifying(true)}
            >
              {t('hazardReports.verify.button')}
            </Button>
            <Button
              variant="danger"
              disabled={!online}
              aria-describedby={!online ? reasonId : undefined}
              onClick={() => setRejecting(true)}
            >
              {t('hazardReports.reject.button')}
            </Button>
          </div>
        </div>
      )}
      <ConfirmActionDialog
        open={verifying}
        title={t('hazardReports.verify.confirmTitle')}
        body={t('hazardReports.verify.confirmBody')}
        confirmLabel={t('hazardReports.verify.confirm')}
        onConfirm={() => onReview('verify')}
        onClose={() => setVerifying(false)}
        disabledReason={disabledReason}
      />
      <RejectDialog
        open={rejecting}
        onReject={(reason) => onReview('reject', reason)}
        onClose={() => setRejecting(false)}
        disabledReason={disabledReason}
      />
    </>
  );
}
