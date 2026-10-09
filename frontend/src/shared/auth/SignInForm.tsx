import { useState, type FormEvent } from 'react';
import type { MeResponse } from '@contracts/auth';
import { useT } from '@/shared/i18n/I18nProvider';
import { translateError } from '@/shared/i18n/translateError';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { PasswordField, TextField } from '@/shared/ui/Field';
import { useAuth } from './AuthContext';

/** The sign-in form, shared by the login page and the "session expired" prompt. */
export function SignInForm({
  defaultIdentifier = '',
  onSignedIn,
}: {
  defaultIdentifier?: string;
  onSignedIn?: (user: MeResponse) => void;
}) {
  const t = useT();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState(defaultIdentifier);
  const [password, setPassword] = useState('');
  const [missing, setMissing] = useState<{ identifier?: boolean; password?: boolean }>({});
  const [failure, setFailure] = useState<unknown>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const nextMissing = { identifier: identifier.trim() === '', password: password === '' };
    setMissing(nextMissing);
    if (nextMissing.identifier || nextMissing.password) return;
    setBusy(true);
    setFailure(undefined);
    try {
      // Sign in first, then notify. (`onSignedIn?.(await login(...))` would skip the sign-in
      // entirely whenever no callback is given, because optional calls do not evaluate arguments.)
      const user = await login(identifier.trim(), password);
      onSignedIn?.(user);
    } catch (error) {
      setFailure(error);
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-[18px]">
      {failure ? <Alert tone="danger">{translateError(t, failure)}</Alert> : null}
      <TextField
        label={t('auth.login.identifier')}
        placeholder={t('auth.login.identifierPlaceholder')}
        value={identifier}
        onChange={(event) => setIdentifier(event.target.value)}
        error={missing.identifier ? t('error.IDENTIFIER_REQUIRED') : undefined}
        autoComplete="username"
        autoCapitalize="none"
        inputMode="email"
      />
      <PasswordField
        label={t('auth.login.password')}
        showLabel={t('common.show')}
        hideLabel={t('common.hide')}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={missing.password ? t('error.PASSWORD_REQUIRED') : undefined}
        autoComplete="current-password"
      />
      <Button
        type="submit"
        size="lg"
        className="mt-1.5 w-full"
        loading={busy}
        loadingLabel={t('auth.login.submitting')}
      >
        {t('auth.login.submit')}
      </Button>
    </form>
  );
}
