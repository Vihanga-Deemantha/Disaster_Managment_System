import { useId, type InputHTMLAttributes } from 'react';

export interface SwitchFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'type' | 'role' | 'aria-labelledby'
> {
  label: string;
  /** A second line under the label, read out as the switch's description. */
  description?: string;
}

const TRACK =
  "relative h-6 w-10 flex-none rounded-full bg-line-strong transition-colors after:absolute after:top-[3px] after:left-[3px] after:h-[18px] after:w-[18px] after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:content-[''] peer-checked:bg-accent-600 peer-checked:after:translate-x-4 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-500 peer-disabled:opacity-60";

/**
 * An on/off row for opt-in choices. It is a real checkbox with the switch role, so it works with a
 * keyboard and announces "on" or "off"; the track is only the picture of that state.
 */
export function SwitchField({ label, description, className = '', ...input }: SwitchFieldProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;
  return (
    <label className={`flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2 ${className}`}>
      <span className="flex flex-1 flex-col leading-snug">
        <span id={labelId} className="text-[14.5px] font-semibold text-navy-900">
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="text-[12.5px] text-ink-soft">
            {description}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        className="peer sr-only"
        {...input}
      />
      <span aria-hidden="true" className={TRACK} />
    </label>
  );
}
