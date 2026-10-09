import { createContext, useContext, type ReactNode } from 'react';
import type { ApiClient } from './apiClient';

const ApiContext = createContext<ApiClient | null>(null);

/** Hands one API client to the whole tree, so tests and the app can each bring their own. */
export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error('useApi must be used inside <ApiProvider>.');
  return client;
}
