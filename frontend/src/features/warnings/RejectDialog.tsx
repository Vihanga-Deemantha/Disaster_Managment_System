import { useId, useState, type FormEvent } from 'react';
import { useT } from '@/shared/i18n/I18nProvider';
import { translateError } from '@/shared/i18n/translateError';
import { useOfflineWrite } from '@/shared/offline/useOfflineWrite';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { TextAreaField } from '@/shared/ui/Field';

/** `queued`: there was no connection, so the rejection waits in the outbox and is sent later (BR6). */
export type RejectOutcome = 'rejected' | 'queued';

/** The longest reason the server accepts. */
const MAX_REASON = 500;

/** UC-1 A3 (screen 4): a reason is mandatory, so the button stays off until one is written. */
export function RejectDialog({
  warningId,
  onClose,
  onDone,
}: {
  warningId: string;
  onClose: () => void;
  onDone: (outcome: RejectOutcome) => void;
}) {
  const t = useT();
  const write = useOfflineWrite();
  const formId = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>();

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setFailure(undefined);
    try {
      const result = await write({
        module: 'warnings',
        method: 'POST',
        url: `/api/warnings/${warningId}/reject`,
        body: { reason: reason.trim() },
      });
      onDone(result.queued ? 'queued' : 'rejected');
    } catch (error) {
      setFailure(error);
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={t('warnings.reject.title')}
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
            disabled={reason.trim() === ''}
            loading={busy}
            loadingLabel={t('warnings.reject.submitting')}
          >
            {t('warnings.reject.submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void submit(event)} className="space-y-4">
        <p>{t('warnings.reject.body')}</p>
        {failure ? <Alert tone="danger">{translateError(t, failure)}</Alert> : null}
        <TextAreaField
          label={t('warnings.reject.reason')}
          value={reason}
          maxLength={MAX_REASON}
          rows={4}
          onChange={(event) => setReason(event.target.value)}
        />
      </form>
    </Dialog>
  );
}
