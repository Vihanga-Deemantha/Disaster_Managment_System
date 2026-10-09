import { useMemo } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { createApiClient } from '@/shared/api/apiClient';
import { ApiProvider } from '@/shared/api/ApiProvider';
import { AuthProvider } from '@/shared/auth/AuthContext';
import { I18nProvider } from '@/shared/i18n/I18nProvider';
import { outbox } from '@/shared/offline/outbox';
import { SyncProvider } from '@/shared/offline/SyncProvider';
import { SyncService } from '@/shared/offline/syncService';
import { routes } from './routes';

/** Builds the long-lived services once and provides them to the whole tree. */
export function App() {
  const api = useMemo(() => createApiClient(), []);
  const sync = useMemo(
    () => new SyncService({ api, outbox, isOnline: () => navigator.onLine }),
    [api],
  );
  const router = useMemo(() => createBrowserRouter(routes), []);

  return (
    <I18nProvider>
      <ApiProvider client={api}>
        <SyncProvider service={sync}>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </SyncProvider>
      </ApiProvider>
    </I18nProvider>
  );
}
