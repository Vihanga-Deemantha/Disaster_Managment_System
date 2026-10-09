import { useEffect, useRef, type ComponentType, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import type { District } from '@contracts/enums';
import { districtLabel, useI18n } from '@/shared/i18n/I18nProvider';
import { translateError } from '@/shared/i18n/translateError';
import { useDocumentTitle } from '@/shared/layout/useDocumentTitle';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { Icon } from '@/shared/ui/Icon';
import { ScreenSpinner } from '@/shared/ui/ScreenSpinner';
import { useAuth } from './AuthContext';
import { AuthLayout } from './AuthLayout';
import { homePathFor } from './homePath';
import { LAST_STEP, STEPS, type Step } from './registrationSteps';
import { AboutStep, AlertsStep, LocationStep, type StepProps } from './RegisterSteps';
import { StepIndicator } from './StepIndicator';
import { useRegistration } from './useRegistration';

const STEP_BODY: Record<Step, ComponentType<StepProps>> = {
  1: AboutStep,
  2: LocationStep,
  3: AlertsStep,
};

interface MismatchDialogProps {
  /** The district the server thinks is nearer, or null when the dialog is closed. */
  suggested: District | null;
  chosen: District | '';
  onKeep: () => void;
  onUseSuggested: (district: District) => void;
  onClose: () => void;
}

/** "Is your district correct?": keep the one they picked, or switch to the nearer one (master plan §7.1.2). */
function DistrictMismatchDialog({
  suggested,
  chosen,
  onKeep,
  onUseSuggested,
  onClose,
}: MismatchDialogProps) {
  const { t, language } = useI18n();
  const label = (district: District | '') => (district ? districtLabel(t, language, district) : '');
  return (
    <Dialog
      open={suggested !== null}
      title={t('auth.mismatch.title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onKeep}>
            {t('auth.mismatch.keepMine', { chosen: label(chosen) })}
          </Button>
          <Button onClick={() => suggested && onUseSuggested(suggested)}>
            {t('auth.mismatch.useSuggested', { suggested: label(suggested ?? '') })}
          </Button>
        </>
      }
    >
      <p>{t('auth.mismatch.body', { suggested: label(suggested ?? ''), chosen: label(chosen) })}</p>
    </Dialog>
  );
}

/** "Step 2 of 3", the step's title and a line saying why we ask. The title takes focus when the step changes. */
function StepHeading({ step, focusOnChange }: { step: Step; focusOnChange: boolean }) {
  const { t } = useI18n();
  const heading = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(step);
  useEffect(() => {
    if (focusOnChange && shownStep.current !== step) heading.current?.focus();
    shownStep.current = step;
  }, [step, focusOnChange]);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-bold text-accent-600">
        {t('auth.register.stepCounter', { current: step, total: STEPS.length })}
      </p>
      <h1
        ref={heading}
        tabIndex={-1}
        className="text-[32px] leading-[1.15] font-extrabold tracking-[-0.02em] break-words text-navy-900 focus-visible:outline-none"
      >
        {t(`auth.register.step${step}.title`)}
      </h1>
      <p className="text-[15px] leading-[1.6] text-ink-soft">
        {t(`auth.register.step${step}.intro`)}
      </p>
    </div>
  );
}

function WizardButtons({ step, busy, onBack }: { step: Step; busy: boolean; onBack: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex gap-2.5">
      {step > 1 ? (
        <Button variant="secondary" size="lg" onClick={onBack}>
          {t('common.back')}
        </Button>
      ) : null}
      <Button
        type="submit"
        size="lg"
        className="flex-1"
        loading={busy}
        loadingLabel={t('auth.register.submitting')}
      >
        {step === LAST_STEP ? t('auth.register.submit') : t('auth.register.next')}
        <Icon name="arrowRight" size={16} strokeWidth={2.4} />
      </Button>
    </div>
  );
}

export function RegisterPage() {
  const { t } = useI18n();
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const form = useRegistration((role) => navigate(homePathFor(role), { replace: true }));
  const formRef = useRef<HTMLFormElement>(null);
  const { focusRequest, step } = form;
  useDocumentTitle(`${t('auth.register.title')} · ${t('app.name')}`);

  // Declared after the heading's own focus effect, so when a failed submit both changes the step and
  // asks for focus, the cursor ends up on the field with the problem and not on the title.
  useEffect(() => {
    if (focusRequest > 0)
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusRequest]);

  if (status === 'loading') return <ScreenSpinner />;
  if (status === 'authenticated' && user) return <Navigate to={homePathFor(user.role)} replace />;

  const Body = STEP_BODY[step];
  const stepProps = { values: form.values, set: form.set, error: form.error, touch: form.touch };

  return (
    <AuthLayout variant="register">
      <StepHeading step={step} focusOnChange />
      <StepIndicator current={step} onSelect={form.goTo} />
      <form
        ref={formRef}
        noValidate
        className="flex flex-col gap-[18px]"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (step === LAST_STEP) void form.submit(form.values, false);
          else form.next();
        }}
      >
        {form.failure ? <Alert tone="danger">{translateError(t, form.failure)}</Alert> : null}
        <Body {...stepProps} />
        <WizardButtons step={step} busy={form.busy} onBack={form.back} />
      </form>
      <p className="flex justify-center gap-1.5 text-sm text-ink-soft">
        {t('auth.register.haveAccount')}{' '}
        <Link to="/login" className="font-bold text-accent-600 hover:text-accent-700">
          {t('auth.register.signInLink')}
        </Link>
      </p>
      <DistrictMismatchDialog
        suggested={form.mismatch}
        chosen={form.values.district}
        onClose={() => form.setMismatch(null)}
        onKeep={() => void form.submit(form.values, true)}
        onUseSuggested={(district) => void form.submit({ ...form.values, district }, false)}
      />
    </AuthLayout>
  );
}
