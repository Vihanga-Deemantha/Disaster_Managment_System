import { useState } from 'react';
import { useT } from '@/shared/i18n/I18nProvider';
import { translateError } from '@/shared/i18n/translateError';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';

export interface ConfirmActionDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  disabledReason?: string;
}
export function ConfirmActionDialog(props: ConfirmActionDialogProps) {
  return props.open ? <OpenConfirmation {...props} /> : null;
}

function OpenConfirmation({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
  disabledReason,
}: ConfirmActionDialogProps) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  async function confirm() {
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm();
      onClose();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={title}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={busy} disabled={Boolean(disabledReason)} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-6 text-ink-soft">{body}</p>
      {disabledReason && <p>{disabledReason}</p>}
      {error !== undefined && <Alert tone="danger">{translateError(t, error)}</Alert>}
    </Dialog>
  );
}
