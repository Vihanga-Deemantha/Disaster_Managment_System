import { useId, useState, type FormEvent } from 'react';
import type { Channel } from '@contracts/enums';
import { useNavigate } from 'react-router';
import { useApi } from '@/shared/api/ApiProvider';
import { useAuth } from '@/shared/auth/AuthContext';
import { useT } from '@/shared/i18n/I18nProvider';
import { translateError } from '@/shared/i18n/translateError';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { PasswordField } from '@/shared/ui/Field';
import { SeverityBadge } from '@/shared/ui/SeverityBadge';
import { deliveryPath, isOutage, issueWarning } from './api';
import { areaNames } from './format';
import type { OptionalChannel, ReviewDto } from './types';

/** What is about to happen, in the officer's own words: how bad, where, to how many, on which channels. */
function ConfirmSummary({ review, channels }: { review: ReviewDto; channels: readonly Channel[] }) {
  const t = useT();
  const { warning, recipients } = review;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
      <dt className="text-ink-soft">{t('warnings.confirm.severity')}</dt>
      <dd>
        <SeverityBadge severity={warning.severity} />
      </dd>
      <dt className="text-ink-soft">{t('warnings.confirm.areas')}</dt>
      <dd className="font-semibold">{areaNames(warning)}</dd>
      <dt className="text-ink-soft">{t('warnings.confirm.recipients')}</dt>
      <dd className="font-semibold">{recipients.total}</dd>
      <dt className="text-ink-soft">{t('warnings.confirm.channels')}</dt>
      <dd>
        <ul>
          {channels.map((channel) => (
            <li key={channel}>
              {t(`warnings.review.channel.${channel}`)} ·{' '}
              {t('warnings.review.channelCount', { count: recipients.byChannel[channel] })}
            </li>
          ))}
        </ul>
      </dd>
    </dl>
  );
}

/**
 * UC-1 steps 5 to 7 (screen 5): the last look before real people are alerted. It repeats what is about
 * to happen, asks for the password again (BR3: `/api/auth/reauth`, then the guarded issue call), and
 * Cancel sends nothing (A4). One idempotency key per confirmation means a lost connection can be
 * retried safely (BR5).
 */
export function ConfirmIssueDialog({
  review,
  optional,
  onClose,
}: {
  review: ReviewDto;
  optional: readonly OptionalChannel[];
  onClose: () => void;
}) {
  const t = useT();
  const api = useApi();
  const navigate = useNavigate();
  const { reauth } = useAuth();
  const formId = useId();
  const [key] = useState(() => crypto.randomUUID());
  const [password, setPassword] = useState('');
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const { warning } = review;
  const channels = ['PUSH', 'SMS', ...optional] as const;

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setMissing(password === '');
    if (password === '') return;
    setBusy(true);
    setFailure(undefined);
    try {
      await reauth(password);
      await issueWarning(api, warning.warningId, optional, key);
      navigate(deliveryPath(warning.warningId));
    } catch (error) {
      // E2: the warning IS issued, only the gateways were down. The summary screen explains it.
      if (isOutage(error)) {
        navigate(deliveryPath(warning.warningId));
        return;
      }
      setFailure(error);
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={t('warnings.confirm.title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="danger"
            loading={busy}
            loadingLabel={t('warnings.confirm.submitting')}
          >
            {t('warnings.confirm.submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
        <p className="font-semibold text-danger-600">{t('warnings.confirm.body')}</p>
        <ConfirmSummary review={review} channels={channels} />
        {failure ? <Alert tone="danger">{translateError(t, failure)}</Alert> : null}
        <PasswordField
          label={t('warnings.confirm.password')}
          hint={t('warnings.confirm.passwordHint')}
          showLabel={t('common.show')}
          hideLabel={t('common.hide')}
          value={password}
          autoComplete="current-password"
          error={missing ? t('error.PASSWORD_REQUIRED') : undefined}
          onChange={(event) => setPassword(event.target.value)}
        />
      </form>
    </Dialog>
  );
}
