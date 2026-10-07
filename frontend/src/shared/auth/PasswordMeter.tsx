import { useT } from '@/shared/i18n/I18nProvider';
import { passwordStrength, type StrengthLevel } from './passwordStrength';

const BAR_COLOUR: Record<StrengthLevel, string> = {
  0: 'bg-line',
  1: 'bg-danger-600',
  2: 'bg-warning-600',
  3: 'bg-success-600',
  4: 'bg-success-600',
};

const TEXT_COLOUR: Record<StrengthLevel, string> = {
  0: 'text-ink-soft',
  1: 'text-warning-600',
  2: 'text-warning-600',
  3: 'text-success-600',
  4: 'text-success-600',
};

/**
 * Four bars and one sentence under the new-password box. Colour is never the only signal: the
 * sentence says the same thing, and the bars are a labelled meter for screen readers.
 */
export function PasswordMeter({ id, password }: { id: string; password: string }) {
  const t = useT();
  const { level, messageKey } = passwordStrength(password);
  const message = t(messageKey);
  return (
    <div id={id} className="mt-0.5 flex flex-col gap-1.5">
      <div
        role="meter"
        aria-label={t('auth.register.passwordMeter')}
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={level}
        aria-valuetext={message}
        className="flex gap-1"
      >
        {([1, 2, 3, 4] as const).map((bar) => (
          <span
            key={bar}
            className={`h-1 flex-1 rounded-full ${bar <= level ? BAR_COLOUR[level] : 'bg-line'}`}
          />
        ))}
      </div>
      <p aria-live="polite" className={`text-[12.5px] ${TEXT_COLOUR[level]}`}>
        {message}
      </p>
    </div>
  );
}
