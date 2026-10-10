import { useRef, useState } from 'react';

export function useRejection(
  onReject: (reason: string) => Promise<void>,
  onClose: () => void,
  disabledReason?: string,
) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const running = useRef(false);
  async function submit() {
    const trimmed = reason.trim();
    if (!trimmed || running.current || disabledReason) return;
    running.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await onReject(trimmed);
      onClose();
    } catch (failure) {
      setError(failure);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { reason, setReason, busy, error, submit };
}
