import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
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
    <div className="flex flex-col gap-[7px]">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-navy-900">
        {label}
        {optionalLabel ? (
          <span className="ml-1 font-normal text-ink-soft">({optionalLabel})</span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <p id={hintId} className="text-[12.5px] text-ink-soft">
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

/**
 * Brown border and a soft halo on focus, replacing the page-wide outline: the border change is what
 * tells a keyboard user where they are, so it must stay clearly visible.
 */
const FOCUS =
  'focus:border-accent-600 focus:ring-3 focus:ring-accent-600/15 focus-visible:outline-none';
const FOCUS_WITHIN =
  'focus-within:border-accent-600 focus-within:ring-3 focus-within:ring-accent-600/15';
const PLACEHOLDER = 'placeholder:text-ink-soft/70';
const CONTROL = `w-full rounded-[10px] border bg-white px-3.5 text-[15px] text-ink ${PLACEHOLDER} ${FOCUS}`;
const TALL = 'min-h-[50px]';
const borderFor = (error?: string): string => (error ? 'border-danger-600' : 'border-line');

interface FieldIds {
  prefix: string;
  hint: string;
  error: string;
}

const idsFor = (id: string): FieldIds => ({
  prefix: `${id}-prefix`,
  hint: `${id}-hint`,
  error: `${id}-error`,
});

/** Ties the hint, the error (and a prefix or meter, when there is one) to the control for screen readers. */
function describedBy(
  ids: FieldIds,
  present: { prefix?: string; hint?: string; error?: string },
  extra?: string,
): string | undefined {
  const parts = [
    present.prefix && ids.prefix,
    present.hint && ids.hint,
    present.error && ids.error,
  ];
  return [...parts, extra].filter(Boolean).join(' ') || undefined;
}

export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'prefix'
> {
  label: string;
  hint?: string;
  error?: string;
  optionalLabel?: string;
  /** A fixed beginning shown inside the box, such as the "+94" of a Sri Lankan mobile number. */
  prefix?: string;
}

/** A labelled input whose hint and error are wired to it for screen readers (`aria-describedby`). */
export function TextField({
  label,
  hint,
  error,
  optionalLabel,
  prefix,
  className = '',
  ...input
}: TextFieldProps) {
  const id = useId();
  const ids = idsFor(id);
  const shared = {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy(ids, { prefix, hint, error }),
    ...input,
  };
  return (
    <FieldFrame
      {...{ label, hint, error, optionalLabel }}
      htmlFor={id}
      hintId={ids.hint}
      errorId={ids.error}
    >
      {prefix ? (
        <div
          className={`flex items-stretch overflow-hidden rounded-[10px] border bg-white ${FOCUS_WITHIN} ${borderFor(error)}`}
        >
          <span
            id={ids.prefix}
            className="flex items-center border-r border-line bg-paper px-3 text-[14.5px] font-semibold text-navy-900"
          >
            {prefix}
          </span>
          <input
            {...shared}
            className={`min-h-12 min-w-0 flex-1 border-0 bg-transparent px-3.5 text-[15px] text-ink ${PLACEHOLDER} focus-visible:outline-none ${className}`}
          />
        </div>
      ) : (
        <input {...shared} className={`${CONTROL} ${TALL} ${borderFor(error)} ${className}`} />
      )}
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
  /** Shown under the box, before the hint (for example a strength meter). */
  footer?: ReactNode;
  /** The id of whatever `footer` renders, so screen readers read it with the field. */
  footerId?: string;
}

/** A password input with a Show/Hide toggle inside it, so a typo on a phone keyboard can be checked. */
export function PasswordField({
  label,
  hint,
  error,
  showLabel,
  hideLabel,
  footer,
  footerId,
  className = '',
  ...input
}: PasswordFieldProps) {
  const id = useId();
  const ids = idsFor(id);
  const [visible, setVisible] = useState(false);
  return (
    <FieldFrame {...{ label, hint, error }} htmlFor={id} hintId={ids.hint} errorId={ids.error}>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(ids, { hint, error }, footerId)}
          className={`${CONTROL} ${TALL} ${borderFor(error)} pr-24 ${className}`}
          {...input}
        />
        <button
          type="button"
          aria-pressed={visible}
          onClick={() => setVisible((shown) => !shown)}
          className="absolute inset-y-0 right-0 min-w-20 rounded-r-[10px] px-3 text-[13.5px] font-bold text-accent-600"
        >
          {visible ? hideLabel : showLabel}
        </button>
      </div>
      {footer}
    </FieldFrame>
  );
}

export interface TextAreaFieldProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'id'
> {
  label: string;
  hint?: string;
  error?: string;
  optionalLabel?: string;
}

/** A labelled multi-line box (an address, say), wired up like `TextField`. */
export function TextAreaField({
  label,
  hint,
  error,
  optionalLabel,
  className = '',
  rows = 2,
  ...area
}: TextAreaFieldProps) {
  const id = useId();
  const ids = idsFor(id);
  return (
    <FieldFrame
      {...{ label, hint, error, optionalLabel }}
      htmlFor={id}
      hintId={ids.hint}
      errorId={ids.error}
    >
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(ids, { hint, error })}
        className={`${CONTROL} resize-y py-3 leading-normal ${borderFor(error)} ${className}`}
        {...area}
      />
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
  const ids = idsFor(id);
  return (
    <FieldFrame {...{ label, hint, error }} htmlFor={id} hintId={ids.hint} errorId={ids.error}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(ids, { hint, error })}
        className={`${CONTROL} ${TALL} ${borderFor(error)} ${className}`}
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
