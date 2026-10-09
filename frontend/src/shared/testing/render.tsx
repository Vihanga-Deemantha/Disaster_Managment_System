import { render, type RenderResult } from '@testing-library/react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { RouterProvider, createMemoryRouter, type RouteObject } from 'react-router';
import type { Language } from '@contracts/enums';
import { createApiClient, type ApiClient } from '@/shared/api/apiClient';
import { ApiProvider } from '@/shared/api/ApiProvider';
import { AuthProvider } from '@/shared/auth/AuthContext';
import { I18nProvider } from '@/shared/i18n/I18nProvider';
import { Outbox } from '@/shared/offline/outbox';
import { SyncProvider } from '@/shared/offline/SyncProvider';
import { SyncService } from '@/shared/offline/syncService';

export interface TestOptions {
  language?: Language;
  /** Use your own client (e.g. with a fake `fetch`); defaults to one backed by the MSW server. */
  api?: ApiClient;
  /** Skip the real AuthProvider, for components that do not need a user. */
  withAuth?: boolean;
}

/** The long-lived services a test may want to look at or drive (e.g. `services.sync.getStatus()`). */
export interface TestServices {
  api: ApiClient;
  sync: SyncService;
}

export function createTestServices(api: ApiClient = createApiClient()): TestServices {
  const sync = new SyncService({ api, outbox: new Outbox(), isOnline: () => navigator.onLine });
  return { api, sync };
}

/** Everything a component may ask for from context: i18n, API, offline sync and (optionally) auth. */
export function TestProviders({
  children,
  language = 'EN',
  api,
  services: provided,
  withAuth = true,
}: TestOptions & { children: ReactNode; services?: TestServices }) {
  const [services] = useState(() => provided ?? createTestServices(api));
  const tree = withAuth ? <AuthProvider>{children}</AuthProvider> : children;
  return (
    <I18nProvider initialLanguage={language}>
      <ApiProvider client={services.api}>
        <SyncProvider service={services.sync}>{tree}</SyncProvider>
      </ApiProvider>
    </I18nProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  options: TestOptions = {},
): RenderResult & { services: TestServices } {
  const services = createTestServices(options.api);
  const result = render(ui, {
    wrapper: ({ children }) => (
      <TestProviders {...options} services={services}>
        {children}
      </TestProviders>
    ),
  });
  return { ...result, services };
}

/** Renders real routes in a memory router, inside the real providers. */
export function renderRoutes(
  routes: RouteObject[],
  { route = '/', ...options }: TestOptions & { route?: string } = {},
): RenderResult & { router: ReturnType<typeof createMemoryRouter>; services: TestServices } {
  const router = createMemoryRouter(routes, { initialEntries: [route] });
  const services = createTestServices(options.api);
  const result = render(
    <TestProviders {...options} services={services}>
      <RouterProvider router={router} />
    </TestProviders>,
  );
  return { ...result, router, services };
}
