import { useId, useState } from 'react';
import { useT } from '@/shared/i18n/I18nProvider';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
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
          {!online && (
            <p id={reasonId} className="text-sm text-ink-soft">
              {t('hazardReports.review.offline')}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              disabled={!online}
              aria-describedby={!online ? reasonId : undefined}
              onClick={() => setVerifying(true)}
            >
              <Icon name="check" size={16} />
              {t('hazardReports.verify.button')}
            </Button>
            <Button
              variant="secondary"
              disabled={!online}
              aria-describedby={!online ? reasonId : undefined}
              onClick={() => setRejecting(true)}
            >
              <Icon name="x" size={16} className="text-danger-600" />
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
