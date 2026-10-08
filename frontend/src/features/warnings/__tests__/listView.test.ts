import {
  INITIAL_FILTERS,
  PAGE_SIZE,
  RANGE_KEYS,
  SORT_KEYS,
  applyFilters,
  paginate,
  whenOf,
  type ListFilters,
} from '../listView';
import { aWarning } from '../testing/fixtures';

/** Midday, local time, so "today" is the same calendar day however the test is run. */
const NOW = new Date(2026, 9, 8, 12, 0, 0).getTime();
const at = (hours: number): string => new Date(NOW - hours * 3_600_000).toISOString();
const everything = (): string => '';
const ids = (list: { warningId: string }[]): string[] => list.map((warning) => warning.warningId);
const filters = (overrides: Partial<ListFilters> = {}): ListFilters => ({
  ...INITIAL_FILTERS,
  ...overrides,
});

describe('the three lists', () => {
  it('start unfiltered, newest first, on the first page', () => {
    expect(INITIAL_FILTERS).toEqual({
      query: '',
      hazard: 'ALL',
      sort: 'NEWEST',
      range: 'ALL',
      page: 1,
    });
    expect(SORT_KEYS).toEqual(['NEWEST', 'OLDEST', 'SEVERITY']);
    expect(RANGE_KEYS).toEqual(['ALL', 'TODAY', 'DAY', 'WEEK']);
    expect(PAGE_SIZE).toBe(10);
  });

  it('whenOf reads the moment each list is about', () => {
    const warning = aWarning({
      submittedAt: at(9),
      issuedAt: at(4),
      rejectedAt: at(2),
    });

    expect(whenOf(warning, 'PENDING')).toBe(Date.parse(at(9)));
    expect(whenOf(warning, 'ISSUED')).toBe(Date.parse(at(4)));
    expect(whenOf(warning, 'REJECTED')).toBe(Date.parse(at(2)));
  });
});

describe('applyFilters', () => {
  const list = [
    aWarning({ warningId: 'a', hazardType: 'FLOOD', severity: 'LOW', submittedAt: at(3) }),
    aWarning({ warningId: 'b', hazardType: 'LANDSLIDE', severity: 'CRITICAL', submittedAt: at(1) }),
    aWarning({ warningId: 'c', hazardType: 'FLOOD', severity: 'HIGH', submittedAt: at(20) }),
    aWarning({ warningId: 'd', hazardType: 'CYCLONE', severity: 'HIGH', submittedAt: at(100) }),
  ];

  it('puts the newest first unless told otherwise, and does not change the list it was given', () => {
    const before = ids(list);

    expect(ids(applyFilters(list, filters(), 'PENDING', NOW, everything))).toEqual([
      'b',
      'a',
      'c',
      'd',
    ]);
    expect(ids(list)).toEqual(before);
  });

  it('puts the oldest first on request', () => {
    expect(
      ids(applyFilters(list, filters({ sort: 'OLDEST' }), 'PENDING', NOW, everything)),
    ).toEqual(['d', 'c', 'a', 'b']);
  });

  it('puts the most severe first, and the newest first among equals', () => {
    expect(
      ids(applyFilters(list, filters({ sort: 'SEVERITY' }), 'PENDING', NOW, everything)),
    ).toEqual(['b', 'c', 'd', 'a']);
  });

  it('keeps only the chosen hazard', () => {
    expect(
      ids(applyFilters(list, filters({ hazard: 'FLOOD' }), 'PENDING', NOW, everything)),
    ).toEqual(['a', 'c']);
    expect(
      ids(applyFilters(list, filters({ hazard: 'DROUGHT' }), 'PENDING', NOW, everything)),
    ).toEqual([]);
  });

  it('keeps only what the search finds, ignoring capitals and the spaces around the words', () => {
    const searchOf = (warning: { warningId: string; hazardType: string }): string =>
      `${warning.hazardType} ${warning.warningId}`.toLowerCase();

    expect(
      ids(applyFilters(list, filters({ query: '  LAND ' }), 'PENDING', NOW, searchOf)),
    ).toEqual(['b']);
    expect(
      ids(applyFilters(list, filters({ query: '   ' }), 'PENDING', NOW, searchOf)),
    ).toHaveLength(4);
  });

  it('keeps only the chosen period', () => {
    const only = (range: ListFilters['range']) =>
      ids(applyFilters(list, filters({ range }), 'PENDING', NOW, everything));

    expect(only('ALL')).toEqual(['b', 'a', 'c', 'd']);
    expect(only('WEEK')).toEqual(['b', 'a', 'c', 'd']);
    expect(only('DAY')).toEqual(['b', 'a', 'c']);
    expect(only('TODAY')).toEqual(['b', 'a']);
  });

  it('counts a week as exactly seven days, and a day as exactly twenty-four hours', () => {
    const edge = [
      aWarning({ warningId: 'day-in', submittedAt: at(24) }),
      aWarning({ warningId: 'day-out', submittedAt: at(24.01) }),
      aWarning({ warningId: 'week-in', submittedAt: at(168) }),
      aWarning({ warningId: 'week-out', submittedAt: at(168.01) }),
    ];

    expect(ids(applyFilters(edge, filters({ range: 'DAY' }), 'PENDING', NOW, everything))).toEqual([
      'day-in',
    ]);
    expect(ids(applyFilters(edge, filters({ range: 'WEEK' }), 'PENDING', NOW, everything))).toEqual(
      ['day-in', 'day-out', 'week-in'],
    );
  });

  it('judges each list by its own moment: submitted, issued or rejected', () => {
    const mixed = [
      aWarning({ warningId: 'x', submittedAt: at(200), issuedAt: at(1), rejectedAt: at(300) }),
      aWarning({ warningId: 'y', submittedAt: at(1), issuedAt: at(200), rejectedAt: at(2) }),
    ];
    const run = (kind: 'PENDING' | 'ISSUED' | 'REJECTED', range: ListFilters['range']) =>
      ids(applyFilters(mixed, filters({ range }), kind, NOW, everything));

    expect(run('PENDING', 'DAY')).toEqual(['y']);
    expect(run('ISSUED', 'DAY')).toEqual(['x']);
    expect(run('REJECTED', 'DAY')).toEqual(['y']);
    expect(run('ISSUED', 'ALL')).toEqual(['x', 'y']);
  });

  it('combines the hazard, the search and the period', () => {
    const searchOf = (warning: { warningId: string }): string => warning.warningId;

    expect(
      ids(
        applyFilters(
          list,
          filters({ hazard: 'FLOOD', range: 'DAY', query: 'a' }),
          'PENDING',
          NOW,
          searchOf,
        ),
      ),
    ).toEqual(['a']);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 23 }, (_, index) => index + 1);

  it('cuts a page of ten and says where it sits', () => {
    expect(paginate(items, 1)).toEqual({
      items: items.slice(0, 10),
      page: 1,
      pages: 3,
      from: 1,
      to: 10,
      total: 23,
    });
    expect(paginate(items, 3)).toEqual({
      items: [21, 22, 23],
      page: 3,
      pages: 3,
      from: 21,
      to: 23,
      total: 23,
    });
  });

  it('brings a page that does not exist back into range', () => {
    expect(paginate(items, 99).page).toBe(3);
    expect(paginate(items, 0).page).toBe(1);
    expect(paginate(items, -4).page).toBe(1);
  });

  it('is one empty page, counting from zero, when there is nothing', () => {
    expect(paginate([], 1)).toEqual({ items: [], page: 1, pages: 1, from: 0, to: 0, total: 0 });
  });

  it('takes another page size', () => {
    expect(paginate(items, 2, 5)).toMatchObject({ from: 6, to: 10, pages: 5 });
  });

  it('fits exactly when the total is a multiple of the page size', () => {
    expect(paginate(items.slice(0, 20), 2)).toMatchObject({ pages: 2, from: 11, to: 20 });
  });
});
