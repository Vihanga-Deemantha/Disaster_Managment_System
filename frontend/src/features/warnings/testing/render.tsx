import { http } from 'msw';
import type { RouteObject } from 'react-router';
import { renderRoutes, type TestOptions } from '@/shared/testing/render';
import { server } from '@/shared/testing/server';
import { WarningsPage } from '..';
import { aDelivery, aReview, aWarning, json } from './fixtures';

const ROUTES: RouteObject[] = [
  { path: '/warnings/*', element: <WarningsPage /> },
  { path: '/', element: <p>Home page</p> },
];

/** The warnings screens inside the real providers, opened at `route` (default: Pending Approvals). */
export const renderWarnings = (route = '/warnings', options: TestOptions = {}) =>
  renderRoutes(ROUTES, { route, ...options });

export const ALL_WORKING = { PUSH: 'OK', SMS: 'OK', WHATSAPP: 'OK', EMAIL: 'OK' };

/** The reads every screen needs, answered with fixtures unless a test overrides one. */
export function serveWarnings(
  overrides: { list?: unknown; review?: unknown; delivery?: unknown; gateways?: unknown } = {},
): void {
  server.use(
    http.get('/api/warnings', () => json(overrides.list ?? [aWarning()])),
    http.get('/api/warnings/:id', () => json(overrides.review ?? aReview())),
    http.get('/api/warnings/:id/delivery', () => json(overrides.delivery ?? aDelivery())),
    http.get('/api/dev/gateways', () => json(overrides.gateways ?? ALL_WORKING)),
  );
}
