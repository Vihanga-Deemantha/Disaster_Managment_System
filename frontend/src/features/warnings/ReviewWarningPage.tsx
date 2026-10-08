import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useApi } from '@/shared/api/ApiProvider';
import { useAuth } from '@/shared/auth/AuthContext';
import { HTML_LANG, useI18n, useT } from '@/shared/i18n/I18nProvider';
import { translateError } from '@/shared/i18n/translateError';
import { useDocumentTitle } from '@/shared/layout/useDocumentTitle';
import { LastSynced, relativeTime } from '@/shared/offline/LastSynced';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { useOnlineStatus } from '@/shared/offline/useOnlineStatus';
import { Alert } from '@/shared/ui/Alert';
import { Button, buttonClasses } from '@/shared/ui/Button';
import { SeverityBadge } from '@/shared/ui/SeverityBadge';
import { Spinner } from '@/shared/ui/Spinner';
import { AudiencePanel } from './AudiencePanel';
import { ConfirmIssueDialog } from './ConfirmIssueDialog';
import { DemoTools } from './DemoGatewayPanel';
import { EditWarningForm } from './EditWarningForm';
import { MessageTabs } from './MessageTabs';
import { RejectDialog } from './RejectDialog';
import { WarningMap } from './WarningMap';
import { deliveryPath, getReview } from './api';
import { describeIssue, formatDateTime } from './format';
import type { OptionalChannel, ReviewDto, ValidationResult, WarningDto } from './types';

type Mode = 'view' | 'edit' | 'reject' | 'issue';

function AreaChips({ warning }: { warning: WarningDto }) {
  const t = useT();
  return (
    <>
      {warning.targetAreas.map((area) => (
        <p key={area.areaId} className="font-semibold">
          {area.name}
          <span className="ml-2 rounded bg-accent-100 px-1.5 py-0.5 text-xs text-navy-900">
            {t(`warnings.area.${area.type}`)}
          </span>
        </p>
      ))}
    </>
  );
}

function ReviewHeader({ warning }: { warning: WarningDto }) {
  const { t, language } = useI18n();
  const submitted = relativeTime(Date.parse(warning.submittedAt), Date.now(), HTML_LANG[language]);
  return (
    <header className="space-y-2">
      <Link to="/warnings" className="text-sm font-semibold text-accent-700 underline">
        {t('warnings.review.back')}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-navy-900">{t('warnings.review.title')}</h1>
        <SeverityBadge severity={warning.severity} />
        <span className="rounded border border-line px-2 py-0.5 text-xs font-semibold">
          {t(`warnings.status.${warning.status}`)}
        </span>
      </div>
      <p className="text-lg font-semibold text-navy-900">
        {t(`warnings.hazard.${warning.hazardType}`)}
      </p>
      <AreaChips warning={warning} />
      <p className="text-sm text-ink-soft">
        {t('warnings.review.validity', {
          from: formatDateTime(warning.validFrom, language),
          to: formatDateTime(warning.validTo, language),
        })}
      </p>
      <p className="text-sm text-ink-soft">{t('warnings.review.submitted', { time: submitted })}</p>
    </header>
  );
}

/** E1: every problem at once, in words, so the officer can see what to fix before pressing Approve. */
function ProblemList({ validation }: { validation: ValidationResult }) {
  const t = useT();
  if (validation.ok) return null;
  return (
    <Alert tone="warning">
      <p className="font-semibold">{t('warnings.review.problems')}</p>
      <ul className="list-disc pl-5">
        {validation.errors.map((issue) => (
          <li key={`${issue.field}:${issue.code}`}>{describeIssue(t, issue)}</li>
        ))}
      </ul>
    </Alert>
  );
}

/** What became of a warning that is no longer waiting. */
function Outcome({ warning }: { warning: WarningDto }) {
  const { t, language } = useI18n();
  if (warning.status === 'REJECTED') {
    return (
      <Alert tone="danger">
        {t('warnings.review.rejected', { reason: warning.rejectionReason as string })}
      </Alert>
    );
  }
  return (
    <Alert tone="success">
      <p>
        {t('warnings.review.issued', {
          time: formatDateTime(warning.issuedAt as string, language),
        })}
      </p>
      <Link to={deliveryPath(warning.warningId)} className={`mt-2 ${buttonClasses('secondary')}`}>
        {t('warnings.review.viewDelivery')}
      </Link>
    </Alert>
  );
}

interface ActionsProps {
  review: ReviewDto;
  online: boolean;
  userId: string;
  onChoose: (mode: Mode) => void;
}

/**
 * Edit, Reject and Approve & Issue. A warning whose approval started but did not finish can only be
 * carried on by the officer who started it, and can no longer be edited or rejected. Issuing is off
 * while offline: the officer must see the delivery results, so it needs a connection (BR6).
 */
function ReviewActions({ review, online, userId, onChoose }: ActionsProps) {
  const t = useT();
  const { warning, validation } = review;
  const approved = warning.approvedAt !== undefined;
  const mine = warning.approvedBy === userId;
  const canApprove = validation.ok && (!approved || mine);
  return (
    <div className="space-y-3">
      {approved ? (
        <Alert tone="info">
          {t(mine ? 'warnings.review.beingIssued' : 'warnings.review.beingIssuedByOther')}
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" disabled={approved} onClick={() => onChoose('edit')}>
          {t('warnings.action.edit')}
        </Button>
        <Button variant="secondary" disabled={approved} onClick={() => onChoose('reject')}>
          {t('warnings.action.reject')}
        </Button>
        <Button
          disabled={!canApprove || !online}
          title={online ? undefined : t('warnings.action.offlineTooltip')}
          onClick={() => onChoose('issue')}
        >
          {t('warnings.action.approve')}
        </Button>
      </div>
      {online ? null : (
        <p className="text-sm text-ink-soft">{t('warnings.action.offlineTooltip')}</p>
      )}
    </div>
  );
}

function ReviewScreen({ review, reload }: { review: ReviewDto; reload: () => void }) {
  const t = useT();
  const online = useOnlineStatus();
  const userId = useAuth().user!.userId;
  const [mode, setMode] = useState<Mode>('view');
  const [optional, setOptional] = useState<readonly OptionalChannel[]>([]);
  const [queued, setQueued] = useState(false);
  const { warning } = review;
  const pending = warning.status === 'PENDING_APPROVAL';
  const close = (): void => setMode('view');
  const toggle = (channel: OptionalChannel): void =>
    setOptional((current) =>
      current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel],
    );

  return (
    <div className="space-y-6">
      <ReviewHeader warning={warning} />
      {queued ? <Alert tone="info">{t('warnings.review.queued')}</Alert> : null}
      <WarningMap areas={warning.targetAreas} label={t('warnings.review.mapLabel')} />
      {mode === 'edit' ? (
        <EditWarningForm
          warning={warning}
          onCancel={close}
          onSaved={(wasQueued) => {
            setQueued(wasQueued);
            close();
            // Nothing has reached the server yet when the change was queued, so there is nothing new to read.
            if (!wasQueued) reload();
          }}
        />
      ) : (
        <MessageTabs messages={warning.messages} />
      )}
      <AudiencePanel
        recipients={review.recipients}
        optional={optional}
        onToggle={toggle}
        locked={!pending}
      />
      {pending ? (
        <>
          <ProblemList validation={review.validation} />
          <ReviewActions review={review} online={online} userId={userId} onChoose={setMode} />
          <DemoTools />
        </>
      ) : (
        <Outcome warning={warning} />
      )}
      {mode === 'reject' ? (
        <RejectDialog
          warningId={warning.warningId}
          onClose={close}
          onDone={(outcome) => {
            close();
            if (outcome === 'queued') setQueued(true);
            else reload();
          }}
        />
      ) : null}
      {mode === 'issue' ? (
        <ConfirmIssueDialog review={review} optional={optional} onClose={close} />
      ) : null}
    </div>
  );
}

/** UC-1 steps 2 to 7 (screen 2): everything an officer needs to decide, and the three ways to answer. */
export function ReviewWarningPage() {
  const t = useT();
  const api = useApi();
  const { warningId } = useParams() as { warningId: string };
  useDocumentTitle(t('warnings.review.title'));
  const review = useCachedResource({
    module: 'warnings',
    name: `warning:${warningId}`,
    load: () => getReview(api, warningId),
  });

  return (
    <section className="space-y-4">
      {review.error ? (
        <Alert tone="danger">
          <span>{translateError(t, review.error)}</span>{' '}
          <Button variant="secondary" onClick={review.reload}>
            {t('common.retry')}
          </Button>
        </Alert>
      ) : null}
      {review.data ? (
        <>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <LastSynced syncedAt={review.syncedAt} />
            <Button variant="ghost" onClick={review.reload}>
              {t('warnings.review.reload')}
            </Button>
          </div>
          <ReviewScreen review={review.data} reload={review.reload} />
        </>
      ) : (
        <Link to="/warnings" className="text-sm font-semibold text-accent-700 underline">
          {t('warnings.review.back')}
        </Link>
      )}
      {review.loading && !review.data ? <Spinner /> : null}
    </section>
  );
}
