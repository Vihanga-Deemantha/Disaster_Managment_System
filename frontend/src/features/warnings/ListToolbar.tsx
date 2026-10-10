import { useT } from '@/shared/i18n/I18nProvider';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { hazardCounts } from './format';
import {
  RANGE_KEYS,
  SORT_KEYS,
  type HazardFilter,
  type ListFilters,
  type RangeKey,
  type SortKey,
} from './listView';
import type { WarningDto } from './types';

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`-mb-px min-h-11 border-b-2 px-1 pt-2 pb-2.5 text-[15px] font-semibold whitespace-nowrap transition-colors ${
        active
          ? 'border-accent-600 text-accent-600'
          : 'border-transparent text-ink-soft hover:text-navy-900'
      }`}
    >
      {children}
    </button>
  );
}

/** "All (5)", "Flood (2)", …: one tab for every hazard that has a warning in the list, with its count. */
function HazardTabs({
  warnings,
  value,
  onChange,
}: {
  warnings: readonly WarningDto[];
  value: HazardFilter;
  onChange: (hazard: HazardFilter) => void;
}) {
  const t = useT();
  return (
    <div
      role="group"
      aria-label={t('warnings.list.filterLabel')}
      className="flex flex-wrap gap-x-7"
    >
      <Tab active={value === 'ALL'} onClick={() => onChange('ALL')}>
        {`${t('warnings.list.all')} (${warnings.length})`}
      </Tab>
      {hazardCounts(warnings).map(([hazard, count]) => (
        <Tab key={hazard} active={value === hazard} onClick={() => onChange(hazard)}>
          {`${t(`warnings.hazard.${hazard}`)} (${count})`}
        </Tab>
      ))}
    </div>
  );
}

/** A white rounded drop-down that reads "Sort by: Newest" or shows a small icon in front of its choice. */
function SelectPill<T extends string>({
  label,
  prefix,
  icon,
  value,
  options,
  onChange,
}: {
  label: string;
  prefix?: string;
  icon?: IconName;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="relative flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white pr-9 pl-3.5 text-sm shadow-sm">
      {icon ? <Icon name={icon} size={16} className="text-ink-soft" /> : null}
      {prefix ? (
        <span aria-hidden="true" className="text-ink-soft">
          {prefix}
        </span>
      ) : null}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="min-h-11 cursor-pointer appearance-none bg-transparent pr-1 font-bold text-navy-900"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevronDown"
        size={16}
        className="pointer-events-none absolute right-3 text-ink-soft"
      />
    </div>
  );
}

/** The row above the table: hazard tabs on the left; how to order the rows and which period on the right. */
export function ListToolbar({
  warnings,
  filters,
  onChange,
}: {
  warnings: readonly WarningDto[];
  filters: ListFilters;
  onChange: (patch: Partial<ListFilters>) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line">
      <HazardTabs
        warnings={warnings}
        value={filters.hazard}
        onChange={(hazard) => onChange({ hazard })}
      />
      <div className="flex flex-wrap gap-3 pb-2">
        <SelectPill<SortKey>
          label={t('warnings.list.sortLabel')}
          prefix={`${t('warnings.list.sortLabel')}:`}
          value={filters.sort}
          options={SORT_KEYS.map((key) => ({ value: key, label: t(`warnings.list.sort.${key}`) }))}
          onChange={(sort) => onChange({ sort })}
        />
        <SelectPill<RangeKey>
          label={t('warnings.list.rangeLabel')}
          icon="calendar"
          value={filters.range}
          options={RANGE_KEYS.map((key) => ({
            value: key,
            label: t(`warnings.list.range.${key}`),
          }))}
          onChange={(range) => onChange({ range })}
        />
      </div>
    </div>
  );
}
