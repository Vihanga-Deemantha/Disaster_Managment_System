import { useI18n } from '@/shared/i18n/I18nProvider';
import { Icon } from '@/shared/ui/Icon';
import { STEPS, type Step } from './registrationSteps';

const DOT =
  'flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-[1.5px] text-[12.5px] font-extrabold';

/**
 * The three registration steps as numbered dots joined by a line. A finished step can be reopened to
 * change an answer; a step that has not been reached cannot be jumped to, so nothing is skipped
 * without being checked.
 */
export function StepIndicator({
  current,
  onSelect,
}: {
  current: Step;
  onSelect: (step: Step) => void;
}) {
  const { t } = useI18n();
  return (
    <ol aria-label={t('auth.register.stepsLabel')} className="flex items-center gap-2">
      {STEPS.map((step) => {
        const done = step < current;
        const name = t(`auth.register.step${step}.title`);
        const dot = (
          <span
            className={`${DOT} ${step <= current ? 'border-accent-600 bg-accent-600 text-white' : 'border-line-strong bg-white text-ink-soft'}`}
          >
            {done ? <Icon name="check" size={13} strokeWidth={3} /> : step}
          </span>
        );
        return (
          <li
            key={step}
            aria-current={step === current ? 'step' : undefined}
            className="flex flex-1 items-center gap-2"
          >
            {done ? (
              <button
                type="button"
                aria-label={t('auth.register.goToStep', { number: step, name })}
                onClick={() => onSelect(step)}
                className="flex min-h-9 items-center rounded-full"
              >
                {dot}
              </button>
            ) : (
              <>
                {dot}
                <span className="sr-only">{name}</span>
              </>
            )}
            <span
              aria-hidden="true"
              className={`h-[3px] flex-1 rounded-full ${done ? 'bg-accent-600' : 'bg-line'}`}
            />
          </li>
        );
      })}
    </ol>
  );
}
