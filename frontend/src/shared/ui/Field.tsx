import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

interface FieldFrameProps {
  label: string;
  hint?: string;
  /** Already translated. Shown in red with an icon-free "!" prefix so colour is never the only cue. */
  error?: string;
  optionalLabel?: string;
  htmlFor: string;
  hintId: string;
  errorId: string;
  children: ReactNode;
}

function FieldFrame({
  label,
  hint,
  error,
  optionalLabel,
  htmlFor,
  hintId,
  errorId,
  children,
}: FieldFrameProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
        {optionalLabel ? (
          <span className="ml-1 font-normal text-ink-soft">({optionalLabel})</span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <p id={hintId} className="text-xs text-ink-soft">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-danger-600">
          <span aria-hidden="true">! </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  'min-h-11 w-full rounded-md border bg-white px-3 py-2 text-base text-ink placeholder:text-ink-soft';
const borderFor = (error?: string): string => (error ? 'border-danger-600' : 'border-line');

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
  optionalLabel?: string;
}

/** A labelled input whose hint and error are wired to it for screen readers (`aria-describedby`). */
export function TextField({
  label,
  hint,
  error,
  optionalLabel,
  className = '',
  ...input
}: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <FieldFrame {...{ label, hint, error, optionalLabel, hintId, errorId }} htmlFor={id}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${CONTROL} ${borderFor(error)} ${className}`}
        {...input}
      />
    </FieldFrame>
  );
}

export interface PasswordFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'type'
> {
  label: string;
  hint?: string;
  error?: string;
  showLabel: string;
  hideLabel: string;
}

/** A password input with a Show/Hide toggle inside it, so a typo on a phone keyboard can be checked. */
export function PasswordField({
  label,
  hint,
  error,
  showLabel,
  hideLabel,
  className = '',
  ...input
}: PasswordFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const [visible, setVisible] = useState(false);
  const describedBy =
    [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <FieldFrame {...{ label, hint, error, hintId, errorId }} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${CONTROL} ${borderFor(error)} pr-24 ${className}`}
          {...input}
        />
        <button
          type="button"
          aria-pressed={visible}
          onClick={() => setVisible((shown) => !shown)}
          className="absolute inset-y-0 right-0 min-w-20 px-3 text-sm font-semibold text-accent-700"
        >
          {visible ? hideLabel : showLabel}
        </button>
      </div>
    </FieldFrame>
  );
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function SelectField({
  label,
  hint,
  error,
  children,
  className = '',
  ...select
}: SelectFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <FieldFrame {...{ label, hint, error, hintId, errorId }} htmlFor={id}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${CONTROL} ${borderFor(error)} ${className}`}
        {...select}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

export interface CheckboxFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'type'
> {
  label: string;
}

export function CheckboxField({ label, className = '', ...input }: CheckboxFieldProps) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-3">
      <input
        id={id}
        type="checkbox"
        className={`h-5 w-5 accent-accent-600 ${className}`}
        {...input}
      />
      <label htmlFor={id} className="text-sm text-ink">
        {label}
      </label>
    </div>
  );
}
