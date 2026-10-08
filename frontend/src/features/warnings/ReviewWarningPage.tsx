import { useState, type ReactNode } from 'react';
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
import { Card } from '@/shared/ui/Card';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { PageHeader } from '@/shared/ui/PageHeader';
import { SeverityPill } from '@/shared/ui/SeverityPill';
import { Spinner } from '@/shared/ui/Spinner';
import { AudiencePanel } from './AudiencePanel';
import { ConfirmIssueDialog } from './ConfirmIssueDialog';
import { DemoTools } from './DemoGatewayPanel';
import { EditWarningForm } from './EditWarningForm';
import { HazardIcon, HazardTile } from './HazardIcon';
import { MessageTabs } from './MessageTabs';
import { RejectDialog, type RejectOutcome } from './RejectDialog';
import { WarningMap } from './WarningMap';
import { deliveryPath, getReview } from './api';
import { areaNames, describeIssue, formatDateTime, submitterLabel } from './format';
import { pendingChanged } from './nav';
import type {
  OptionalChannel,
  ReviewDto,
  ValidationResult,
  WarningDto,
  WarningStatus,
} from './types';

type Mode = 'view' | 'edit' | 'reject' | 'issue';

/** One line of "Warning Information": a label, then an icon and the value. */
function InfoRow({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <>
      <dt className="text-ink-soft">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2.5 font-medium text-navy-900">
        {icon ? <Icon name={icon} size={16} className="flex-none text-ink-soft" /> : null}
        <span className="min-w-0">{children}</span>
      </dd>
    </>
  );
}

/** What the warning is: its hazard, how severe, where, until when, who sent it and when. */
function WarningInformation({ warning }: { warning: WarningDto }) {
  const { t, language } = useI18n();
  const hazard = t(`warnings.hazard.${warning.hazardType}`);
  const submitted = Date.parse(warning.submittedAt);
  return (
    <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-4 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
      <InfoRow label={t('warnings.review.label.hazard')}>
        <span className="flex items-center gap-2.5">
          <span className="text-ink-soft">
            <HazardIcon hazard={warning.hazardType} size={16} />
          </span>
          {hazard}
        </span>
      </InfoRow>
      <InfoRow label={t('warnings.review.label.severity')}>
        <SeverityPill severity={warning.severity} />
      </InfoRow>
      <InfoRow label={t('warnings.review.label.area')} icon="mapPin">
        {warning.targetAreas.map((area) => (
          <span key={area.areaId} className="block">
            {area.name}
            <span className="ml-2 rounded bg-accent-100 px-1.5 py-0.5 text-xs font-semibold">
              {t(`warnings.area.${area.type}`)}
            </span>
          </span>
        ))}
      </InfoRow>
      <InfoRow label={t('warnings.review.label.validity')} icon="calendar">
        {/* each end stays in one piece, so the line can only break at the dash */}
        <span className="whitespace-nowrap">
          {formatDateTime(warning.validFrom, language)}
        </span> —{' '}
        <span className="whitespace-nowrap">{formatDateTime(warning.validTo, language)}</span>
      </InfoRow>
      <InfoRow label={t('warnings.review.label.submittedBy')} icon="user">
        {submitterLabel(warning, t)}
      </InfoRow>
      <InfoRow label={t('warnings.review.label.submittedAt')} icon="clock">
        {formatDateTime(warning.submittedAt, language)}
        <span className="ml-2 text-xs font-normal text-ink-soft">
          {relativeTime(submitted, Date.now(), HTML_LANG[language])}
        </span>
      </InfoRow>
    </dl>
  );
}

/** The big card on the left: title with the hazard icon, the information, and the message in three languages. */
function WarningCard({ warning }: { warning: WarningDto }) {
  const t = useT();
  const hazard = t(`warnings.hazard.${warning.hazardType}`);
  return (
    <Card>
      <div className="flex items-center gap-4">
        <HazardTile hazard={warning.hazardType} severity={warning.severity} />
        <h2 className="text-xl font-extrabold text-navy-900">
          {t('warnings.review.cardTitle', { hazard })}
        </h2>
      </div>
      <hr className="my-5 border-line-soft" />
      <h3 className="mb-4 text-[15px] font-bold text-navy-900">{t('warnings.review.info')}</h3>
      <WarningInformation warning={warning} />
      <hr className="my-5 border-line-soft" />
      <MessageTabs messages={warning.messages} />
    </Card>
  );
}

const STATUS_STYLES: Record<WarningStatus, string> = {
  PENDING_APPROVAL: 'bg-danger-100 text-danger-600',
  ISSUED: 'bg-success-100 text-success-600',
  REJECTED: 'bg-line text-ink',
};

function StatusPill({ status }: { status: WarningStatus }) {
  const t = useT();
  return (
    <span className={`rounded-xl px-4 py-2 text-sm font-bold ${STATUS_STYLES[status]}`}>
      {t(`warnings.status.${status}`)}
    </span>
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
}

/** What the officer may do: nothing once approval has started, unless they are the one who started it. */
function actionState({ review, userId }: Pick<ActionsProps, 'review' | 'userId'>) {
  const { warning, validation } = review;
  const approved = warning.approvedAt !== undefined;
  const mine = warning.approvedBy === userId;
  return { approved, mine, canApprove: validation.ok && (!approved || mine) };
}

/** Edit, Reject and Approve & Issue, at the top right as in the design. Issuing is off while offline (BR6). */
function ActionButtons({
  review,
  online,
  userId,
  onChoose,
}: ActionsProps & { onChoose: (mode: Mode) => void }) {
  const t = useT();
  const { approved, canApprove } = actionState({ review, userId });
  return (
    <div className="flex flex-wrap justify-end gap-3">
      <Button variant="secondary" disabled={approved} onClick={() => onChoose('edit')}>
        {t('warnings.action.edit')}
      </Button>
      <Button variant="secondary" disabled={approved} onClick={() => onChoose('reject')}>
        <Icon name="x" size={16} className="text-danger-600" />
        {t('warnings.action.reject')}
      </Button>
      <Button
        disabled={!canApprove || !online}
        title={online ? undefined : t('warnings.action.offlineTooltip')}
        onClick={() => onChoose('issue')}
      >
        <Icon name="send" size={16} />
        {t('warnings.action.approve')}
      </Button>
    </div>
  );
}

/** The explanations that go with the buttons: approval half-done, or no connection to issue over. */
function ActionNotes({ review, online, userId }: ActionsProps) {
  const t = useT();
  const { approved, mine } = actionState({ review, userId });
  return (
    <>
      {approved ? (
        <Alert tone="info">
          {t(mine ? 'warnings.review.beingIssued' : 'warnings.review.beingIssuedByOther')}
        </Alert>
      ) : null}
      {online ? null : (
        <p className="text-sm text-ink-soft">{t('warnings.action.offlineTooltip')}</p>
      )}
    </>
  );
}

function BackBar({
  status,
  syncedAt,
  reload,
}: {
  status: WarningStatus;
  syncedAt: number | undefined;
  reload: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link
        to="/warnings"
        className="flex items-center gap-2 text-sm font-semibold text-navy-900 hover:underline"
      >
        <Icon name="arrowLeft" size={16} />
        {t('warnings.review.back')}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <LastSynced syncedAt={syncedAt} />
        <Button variant="ghost" onClick={reload}>
          {t('warnings.review.reload')}
        </Button>
        <StatusPill status={status} />
      </div>
    </div>
  );
}

/** The column beside the warning: where it is on a map, and who will receive it. */
function SidePanels({
  review,
  optional,
  onToggle,
  locked,
}: {
  review: ReviewDto;
  optional: readonly OptionalChannel[];
  onToggle: (channel: OptionalChannel) => void;
  locked: boolean;
}) {
  const t = useT();
  const { warning } = review;
  return (
    <div className="space-y-5">
      <Card>
        <h2 className="mb-4 text-[15px] font-bold text-navy-900">{t('warnings.review.map')}</h2>
        <WarningMap
          areas={warning.targetAreas}
          label={t('warnings.review.mapLabel')}
          legend={t('warnings.review.legend', { area: areaNames(warning) })}
        />
      </Card>
      <Card>
        <AudiencePanel
          recipients={review.recipients}
          optional={optional}
          onToggle={onToggle}
          locked={locked}
        />
      </Card>
    </div>
  );
}

/** The two questions that stop the page: why reject it, and are you sure you want to issue it. */
function Dialogs({
  mode,
  review,
  optional,
  onClose,
  onRejected,
}: {
  mode: Mode;
  review: ReviewDto;
  optional: readonly OptionalChannel[];
  onClose: () => void;
  onRejected: (outcome: RejectOutcome) => void;
}) {
  if (mode === 'reject') {
    return (
      <RejectDialog warningId={review.warning.warningId} onClose={onClose} onDone={onRejected} />
    );
  }
  if (mode === 'issue') {
    return <ConfirmIssueDialog review={review} optional={optional} onClose={onClose} />;
  }
  return null;
}

function ReviewScreen({
  review,
  syncedAt,
  reload,
}: {
  review: ReviewDto;
  syncedAt: number | undefined;
  reload: () => void;
}) {
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
  /** A queued rejection has not reached the server, so there is nothing new to read yet. */
  const rejected = (outcome: RejectOutcome): void => {
    close();
    if (outcome === 'queued') {
      setQueued(true);
      return;
    }
    pendingChanged();
    reload();
  };

  return (
    <>
      {pending ? (
        <ActionButtons review={review} online={online} userId={userId} onChoose={setMode} />
      ) : null}
      <BackBar status={warning.status} syncedAt={syncedAt} reload={reload} />
      {queued ? <Alert tone="info">{t('warnings.review.queued')}</Alert> : null}
      {pending ? (
        <>
          <ProblemList validation={review.validation} />
          <ActionNotes review={review} online={online} userId={userId} />
        </>
      ) : (
        <Outcome warning={warning} />
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
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
          <WarningCard warning={warning} />
        )}
        <SidePanels review={review} optional={optional} onToggle={toggle} locked={!pending} />
      </div>
      {pending ? <DemoTools /> : null}
      <Dialogs
        mode={mode}
        review={review}
        optional={optional}
        onClose={close}
        onRejected={rejected}
      />
    </>
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
    <section className="space-y-5">
      <PageHeader title={t('warnings.review.title')} subtitle={t('warnings.review.subtitle')} />
      {review.error ? (
        <Alert tone="danger">
          <span>{translateError(t, review.error)}</span>{' '}
          <Button variant="secondary" onClick={review.reload}>
            {t('common.retry')}
          </Button>
        </Alert>
      ) : null}
      {review.data ? (
        <ReviewScreen review={review.data} syncedAt={review.syncedAt} reload={review.reload} />
      ) : (
        <Link to="/warnings" className="text-sm font-semibold text-navy-900 underline">
          {t('warnings.review.back')}
        </Link>
      )}
      {review.loading && !review.data ? <Spinner /> : null}
    </section>
  );
}
