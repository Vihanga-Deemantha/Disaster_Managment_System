import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet } from 'react-router';
import { renderRoutes } from '@/shared/testing/render';
import type { Report } from '../api/types';
import { ReportCard } from '../components/ReportCard';

const report: Report = {
  id: 'report-1',
  clientReportId: 'client-1',
  reporterId: 'citizen-1',
  reporterType: 'CITIZEN',
  hazardType: 'FLOOD',
  description: 'Water covers the bridge',
  location: { lat: 6.58, lng: 79.96, source: 'GPS' },
  capturedAt: '2026-10-07T10:00:00Z',
  receivedAt: '2026-10-07T11:00:00Z',
  syncedFromOffline: false,
  status: 'PENDING',
};
function view(overrides: Partial<Report> = {}) {
  return renderRoutes(
    [
      {
        path: '/hazard-reports/*',
        element: <Outlet />,
        children: [
          { path: 'clusters/:id', element: <ReportCard report={{ ...report, ...overrides }} /> },
          { path: 'reports/:id', element: <p>Report detail destination</p> },
        ],
      },
    ],
    { route: '/hazard-reports/clusters/cluster-1', withAuth: false },
  );
}
it('UC-3 A2: a photographed report shows its hazard, capture time, reporter and status', () => {
  view({ photoUrl: '/api/hazard-reports/photos/bridge.jpg' });
  expect(screen.getByRole('img', { name: 'Photo attached to this Flood report' })).toHaveAttribute(
    'src',
    '/api/hazard-reports/photos/bridge.jpg',
  );
  expect(screen.getByText('Flood')).toBeVisible();
  expect(screen.getByText('Water covers the bridge')).toBeVisible();
  expect(screen.getByText('Citizen')).toBeVisible();
  expect(screen.getByText('Pending review')).toHaveClass('bg-warning-100');
  expect(screen.getByText('Oct 7, 15:30')).toHaveAttribute('dateTime', report.capturedAt);
  expect(screen.queryByText(/Sent later from offline/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Rejected:/)).not.toBeInTheDocument();
});
it('UC-3 A2: an offline volunteer report without a photo displays capture and receipt times', () => {
  view({ syncedFromOffline: true, reporterType: 'VOLUNTEER', status: 'VERIFIED' });
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText('No photo was attached.')).toBeVisible();
  expect(screen.getByText('Volunteer')).toBeVisible();
  expect(screen.getByText('Verified')).toHaveClass('bg-success-100');
  expect(
    screen.getByText(
      'Sent later from offline. Captured at Oct 7, 15:30, received at Oct 7, 16:30.',
    ),
  ).toBeVisible();
});
it('UC-3 A2: rejected reports show the reason when supplied', () => {
  view({ status: 'REJECTED', rejectionReason: 'Duplicate evidence' });
  expect(screen.getByText('Rejected')).toHaveClass('bg-danger-100');
  expect(screen.getByText('Rejected: Duplicate evidence')).toBeVisible();
});
it.each(['PENDING', 'VERIFIED'] as const)(
  'UC-3 A2: %s reports never show a stored rejection reason',
  (status) => {
    view({ status, rejectionReason: 'Must stay hidden' });
    expect(screen.getByText(status === 'PENDING' ? 'Pending review' : 'Verified')).toBeVisible();
    expect(screen.queryByText(/Must stay hidden/)).not.toBeInTheDocument();
  },
);
it('UC-3 A2: rejection without an optional reason does not invent one', () => {
  view({ status: 'REJECTED' });
  expect(screen.getByText('Rejected')).toBeVisible();
  expect(screen.queryByText(/Rejected:/)).not.toBeInTheDocument();
});
it('UC-3 A2: review link resolves to the sibling reports route from a nested cluster route', async () => {
  const { router } = view();
  const link = screen.getByRole('link', { name: 'Review report' });
  expect(link).toHaveAttribute('href', '/hazard-reports/reports/report-1');
  await userEvent.click(link);
  expect(await screen.findByText('Report detail destination')).toBeVisible();
  expect(router.state.location.pathname).toBe('/hazard-reports/reports/report-1');
});
