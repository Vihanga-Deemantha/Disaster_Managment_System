export interface RadioCardOption<T extends string> {
  value: T;
  label: string;
  /** The language the label is written in, so a screen reader pronounces it correctly. */
  lang?: string;
}

const CARD =
  'flex min-h-13 items-center justify-center rounded-[10px] border border-line bg-white px-2 text-[15px] font-semibold text-navy-900 transition-colors peer-checked:border-accent-600 peer-checked:bg-accent-50 peer-checked:ring-1 peer-checked:ring-accent-600 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-500';

/** A row of big, tappable choices (one can be selected). Real radio buttons, drawn as cards. */
export function RadioCards<T extends string>({
  legend,
  name,
  value,
  onChange,
  options,
}: {
  legend: string;
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly RadioCardOption<T>[];
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-navy-900">{legend}</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <label key={option.value} className="relative block cursor-pointer">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span lang={option.lang} className={CARD}>
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
