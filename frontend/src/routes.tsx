import type { ComponentType } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import type { Role } from '@contracts/enums';
import { analyticsNav } from '@/features/analytics/nav';
import { hazardReportsNav } from '@/features/hazard-reports/nav';
import { resourcesNav } from '@/features/resources/nav';
import { warningsNav } from '@/features/warnings/nav';
import { HomeRedirect } from '@/shared/auth/HomeRedirect';
import { LoginPage } from '@/shared/auth/LoginPage';
import { RegisterPage } from '@/shared/auth/RegisterPage';
import { RequireAuth } from '@/shared/auth/RequireAuth';
import { AppShell } from '@/shared/layout/AppShell';
import { NotFoundPage } from '@/shared/layout/NotFoundPage';
import { RouteFallback } from '@/shared/layout/RouteFallback';
import { NAV_GROUPS } from './navigation';

/**
 * Mounts a use case at `/<path>/*`. Its screens are loaded only when someone opens it, so a module's
 * heavy libraries (charts, maps) never slow down the sign-in page or the other modules. The service
 * worker still precaches every chunk, so everything keeps working offline.
 */
function feature(
  path: string,
  roles: readonly Role[] | undefined,
  load: () => Promise<{ default: ComponentType }>,
): RouteObject {
  return {
    path: `${path}/*`,
    lazy: async () => {
      const { default: Page } = await load();
      return {
        element: (
          <RequireAuth roles={roles}>
            <Page />
          </RequireAuth>
        ),
      };
    },
  };
}

/**
 * Every route in the app, registered once (master plan §5: "all routes registered Wed"). A use case
 * is mounted at `/<name>/*`, so it owns everything below its own path and handles its sub-routes
 * with `<Routes>` inside its page. Access is limited by the same `roles` its sidebar entry declares.
 */
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: (
      <RequireAuth>
        <AppShell navGroups={NAV_GROUPS} />
      </RequireAuth>
    ),
    HydrateFallback: RouteFallback,
    children: [
      { index: true, element: <HomeRedirect /> },
      feature('warnings', warningsNav.roles, () =>
        import('@/features/warnings').then((m) => ({ default: m.WarningsPage })),
      ),
      feature('resources', resourcesNav.roles, () =>
        import('@/features/resources').then((m) => ({ default: m.ResourcesPage })),
      ),
      feature('hazard-reports', hazardReportsNav.roles, () =>
        import('@/features/hazard-reports').then((m) => ({ default: m.HazardReportsPage })),
      ),
      feature('analytics', analyticsNav.roles, () =>
        import('@/features/analytics').then((m) => ({ default: m.AnalyticsPage })),
      ),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '/home', element: <Navigate to="/" replace /> },
];
