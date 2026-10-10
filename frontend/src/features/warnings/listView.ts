import type { HazardType, Severity } from '@contracts/enums';
import type { WarningDto } from './types';

/** The three lists: waiting for approval, issued, and rejected. */
export type ListKind = 'PENDING' | 'ISSUED' | 'REJECTED';
export type HazardFilter = HazardType | 'ALL';
export type SortKey = 'NEWEST' | 'OLDEST' | 'SEVERITY';
export type RangeKey = 'ALL' | 'TODAY' | 'DAY' | 'WEEK';

export const SORT_KEYS: readonly SortKey[] = ['NEWEST', 'OLDEST', 'SEVERITY'];
export const RANGE_KEYS: readonly RangeKey[] = ['ALL', 'TODAY', 'DAY', 'WEEK'];
export const PAGE_SIZE = 10;

/** What the person has typed or chosen above the table. Changing any of it goes back to the first page. */
export interface ListFilters {
  query: string;
  hazard: HazardFilter;
  sort: SortKey;
  range: RangeKey;
  page: number;
}

export const INITIAL_FILTERS: ListFilters = {
  query: '',
  hazard: 'ALL',
  sort: 'NEWEST',
  range: 'ALL',
  page: 1,
};

const DAY_MS = 86_400_000;

/** The moment each list is about: when a warning was submitted, issued or rejected. */
const MOMENT = { PENDING: 'submittedAt', ISSUED: 'issuedAt', REJECTED: 'rejectedAt' } as const;

export const whenOf = (warning: WarningDto, kind: ListKind): number =>
  Date.parse(warning[MOMENT[kind]] as string);

const SEVERITY_RANK: Record<Severity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

function inRange(at: number, range: RangeKey, now: number): boolean {
  if (range === 'ALL') return true;
  if (range === 'TODAY') return new Date(at).toDateString() === new Date(now).toDateString();
  return now - at <= (range === 'DAY' ? DAY_MS : 7 * DAY_MS);
}

type Comparator = (a: WarningDto, b: WarningDto) => number;

function comparatorFor(sort: SortKey, kind: ListKind): Comparator {
  const newest: Comparator = (a, b) => whenOf(b, kind) - whenOf(a, kind);
  if (sort === 'OLDEST') return (a, b) => newest(b, a);
  if (sort === 'SEVERITY') {
    return (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || newest(a, b);
  }
  return newest;
}

/**
 * What the table shows: the warnings that match the search, the hazard tab and the time range, in the
 * order chosen. `searchOf` says what a warning can be found by (its hazard, places, submitter, reason).
 */
export function applyFilters(
  warnings: readonly WarningDto[],
  filters: ListFilters,
  kind: ListKind,
  now: number,
  searchOf: (warning: WarningDto) => string,
): WarningDto[] {
  const query = filters.query.trim().toLowerCase();
  return warnings
    .filter(
      (warning) =>
        (filters.hazard === 'ALL' || warning.hazardType === filters.hazard) &&
        inRange(whenOf(warning, kind), filters.range, now) &&
        (query === '' || searchOf(warning).includes(query)),
    )
    .sort(comparatorFor(filters.sort, kind));
}

export interface PageView<T> {
  items: T[];
  /** The page actually shown: asked-for pages that do not exist are brought back into range. */
  page: number;
  pages: number;
  /** 1-based position of the first and last row shown, for "Showing 1–5 of 5". Both 0 when empty. */
  from: number;
  to: number;
  total: number;
}

export function paginate<T>(
  all: readonly T[],
  page: number,
  size: number = PAGE_SIZE,
): PageView<T> {
  const pages = Math.max(1, Math.ceil(all.length / size));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * size;
  const items = all.slice(start, start + size);
  return {
    items,
    page: current,
    pages,
    from: items.length === 0 ? 0 : start + 1,
    to: start + items.length,
    total: all.length,
  };
}
