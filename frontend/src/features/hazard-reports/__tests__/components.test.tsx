import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, NetworkError } from '@/shared/api/errors';
import type { CachedResource } from '@/shared/offline/useCachedResource';
import { renderWithProviders } from '@/shared/testing/render';
import { AsyncState } from '../components/AsyncState';
import { BandBadge } from '../components/BandBadge';
import { ScoreBar } from '../components/ScoreBar';
import { StatCard } from '../components/StatCard';
import { StatusChip } from '../components/StatusChip';

function resource(overrides: Partial<CachedResource<string[]>> = {}): CachedResource<string[]> {
  return {
    data: undefined,
    loading: false,
    error: undefined,
    syncedAt: undefined,
    fromCache: false,
    reload: () => {},
    ...overrides,
  };
}
function view(value: CachedResource<string[]>, checkEmpty = true) {
  return renderWithProviders(
    <AsyncState
      resource={value}
      isEmpty={checkEmpty ? (data) => data.length === 0 : undefined}
      emptyMessage="No reports"
    >
      {(data) => <p>{data.join(', ')}</p>}
    </AsyncState>,
    { withAuth: false },
  );
}
describe('UC-3 A2: reusable report states', () => {
  it.each([true, false])('UC-3 A2: undefined data loading=%s waits safely', (loading) => {
    view(resource({ loading }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });
  it('UC-3 A2: cached data stays visible during refresh with its sync time', () => {
    view(
      resource({ data: ['Saved report'], loading: true, fromCache: true, syncedAt: Date.now() }),
    );
    expect(screen.getByText('Saved report')).toBeVisible();
    expect(screen.getByText(/Last synced/)).toBeVisible();
  });
  it.each([
    new NetworkError(),
    new ApiError(404, 'REPORT_NOT_FOUND', 'missing'),
    new Error('unexpected'),
  ])('UC-3 A2: errors expose retry and reload the resource', async (error) => {
    let retries = 0;
    view(
      resource({
        error,
        reload: () => {
          retries++;
        },
      }),
    );
    expect(screen.getByRole('alert')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retries).toBe(1);
  });
  it('UC-3 A2: an empty result has its explicit message', () => {
    view(resource({ data: [] }));
    expect(screen.getByText('No reports')).toBeVisible();
  });
  it('UC-3 A2: success without an empty predicate renders children and never-synced state', () => {
    view(resource({ data: ['Fresh report'] }), false);
    expect(screen.getByText('Fresh report')).toBeVisible();
    expect(screen.getByText('Not synced yet')).toBeVisible();
  });
  it.each([
    ['HIGH', 'High priority'],
    ['ELEVATED', 'Elevated'],
    ['MODERATE', 'Moderate'],
    ['LOW', 'Low'],
  ] as const)('UC-3 A2: %s badge has a readable label', (band, label) => {
    renderWithProviders(<BandBadge band={band} />, { withAuth: false });
    expect(screen.getByText(label)).toBeVisible();
  });
  it('UC-3 A2: priority meter exposes the score and bounds', () => {
    renderWithProviders(<ScoreBar score={87} />, { withAuth: false });
    const meter = screen.getByRole('meter', { name: 'Priority score 87 of 100' });
    expect(meter).toHaveAttribute('aria-valuenow', '87');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
  });
  it('UC-3 A2: stats and status chips present their value and label', () => {
    renderWithProviders(
      <>
        <StatCard label="Open clusters" value={4} />
        <StatusChip label="Verified" tone="bg-success-100 text-success-600" />
      </>,
      { withAuth: false },
    );
    expect(screen.getByText('Open clusters')).toBeVisible();
    expect(screen.getByText('4')).toBeVisible();
    expect(screen.getByText('Verified')).toHaveClass('bg-success-100');
  });
});
