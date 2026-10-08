import { useId } from 'react';
import { useT } from '@/shared/i18n/I18nProvider';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { useRejection } from '../hooks/useRejection';
import { rejectionError } from '../model/rejectionError';

export interface RejectDialogProps {
  open: boolean;
  onReject: (reason: string) => Promise<void>;
  onClose: () => void;
  disabledReason?: string;
}
export function RejectDialog(props: RejectDialogProps) {
  return props.open ? <OpenRejection {...props} /> : null;
}
function OpenRejection({ onReject, onClose, disabledReason }: RejectDialogProps) {
  const t = useT();
  const id = useId();
  const state = useRejection(onReject, onClose, disabledReason);
  return (
    <Dialog
      open
      title={t('hazardReports.reject.title')}
      onClose={onClose}
      dismissible={!state.busy}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void state.submit();
        }}
        className="space-y-4"
      >
        <label htmlFor={id}>{t('hazardReports.reject.reasonLabel')}</label>
        <textarea
          id={id}
          aria-describedby={`${id}-hint`}
          required
          maxLength={500}
          disabled={state.busy}
          value={state.reason}
          onChange={(event) => state.setReason(event.target.value)}
          className="w-full rounded border border-paper p-3"
        />
        <p id={`${id}-hint`}>{t('hazardReports.reject.reasonHint')}</p>
        {disabledReason && <p>{disabledReason}</p>}
        {state.error !== undefined && <Alert tone="danger">{rejectionError(t, state.error)}</Alert>}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" disabled={state.busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="danger"
            loading={state.busy}
            disabled={!state.reason.trim() || Boolean(disabledReason)}
          >
            {t('hazardReports.reject.confirm')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
