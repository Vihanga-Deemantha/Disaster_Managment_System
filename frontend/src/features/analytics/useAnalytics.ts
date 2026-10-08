import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/shared/api/ApiProvider';
import type { ApiClient } from '@/shared/api/apiClient';
import { ApiError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/AuthContext';
import { cacheRead, cacheWrite } from '@/shared/offline/cache';
import { useOnlineStatus } from '@/shared/offline/useOnlineStatus';
import type { AnalyticsFilter, CatalogEvent, Dashboard, ReportMetadata } from './types';
import { initialFilter, validateFilters } from './filters';

interface State {
  events: CatalogEvent[];
  filter: AnalyticsFilter;
  dashboard?: Dashboard;
  loading: boolean;
  error: string;
  serverErrors: Record<string, string>;
  cachedAt?: number;
  history: ReportMetadata[];
}
type Update = (patch: Partial<State>) => void;
const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Unable to load analytics.';

/** BR6: cache contains a last view and independently addressable complete filter snapshots. */
async function remember(owner: string, events: CatalogEvent[], dashboard: Dashboard) {
  await cacheWrite(owner, 'analytics', 'last', { events, dashboard });
  await cacheWrite(owner, 'analytics', JSON.stringify(dashboard.filter), dashboard);
}
async function loadInitial(
  api: ApiClient,
  owner: string,
  online: boolean,
): Promise<Partial<State>> {
  if (!online) {
    const saved = await cacheRead<{ events: CatalogEvent[]; dashboard: Dashboard }>(
      owner,
      'analytics',
      'last',
    );
    if (!saved)
      return {
        dashboard: undefined,
        error: 'No cached analytics on this device. Reconnect to generate your first view.',
      };
    return {
      events: saved.value.events,
      dashboard: saved.value.dashboard,
      filter: saved.value.dashboard.filter,
      cachedAt: saved.syncedAt,
    };
  }
  const [catalog, dashboard] = await Promise.all([
    api.get<{ events: CatalogEvent[] }>('/api/analytics/events'),
    api.get<Dashboard>('/api/analytics/summary'),
  ]);
  await remember(owner, catalog.events, dashboard);
  return { events: catalog.events, dashboard, filter: dashboard.filter, cachedAt: undefined };
}
function useInitialLoad(api: ApiClient, owner: string, online: boolean, update: Update) {
  useEffect(() => {
    let cancelled = false;
    update({ loading: true, error: '' });
    void loadInitial(api, owner, online)
      .then((result) => {
        if (!cancelled) update(result);
      })
      .catch((cause) => {
        if (!cancelled) update({ error: message(cause) });
      })
      .finally(() => {
        if (!cancelled) update({ loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [api, owner, online, update]);
}
function useFilteredCache(owner: string, online: boolean, filter: AnalyticsFilter, update: Update) {
  useEffect(() => {
    if (online || !owner) return;
    let cancelled = false;
    void cacheRead<Dashboard>(owner, 'analytics', JSON.stringify(filter))
      .then((saved) => {
        if (!cancelled && saved) update({ dashboard: saved.value, cachedAt: saved.syncedAt });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [online, owner, filter, update]);
}
async function generateAnalytics(deps: {
  api: ApiClient;
  owner: string;
  state: State;
  update: Update;
  current(): boolean;
}) {
  const { api, owner, state, update, current } = deps;
  update({ loading: true, error: '', serverErrors: {} });
  try {
    const dashboard = await api.post<Dashboard>('/api/analytics/query', state.filter);
    if (!current()) return;
    update({ dashboard, cachedAt: undefined });
    await remember(owner, state.events, dashboard);
  } catch (cause) {
    if (!current()) return;
    const serverErrors =
      cause instanceof ApiError
        ? Object.fromEntries(
            cause.fields.map((field) => [field.field, field.message ?? field.code]),
          )
        : {};
    update({ error: message(cause), serverErrors });
  } finally {
    if (current()) update({ loading: false });
  }
}
/** UC-4 dashboard state, scoped caching and guarded Generate operation. */
export function useAnalytics() {
  const api = useApi();
  const { user } = useAuth();
  const online = useOnlineStatus();
  const owner = user?.userId ?? '';
  const [state, setState] = useState<State>(() => ({
    events: [],
    filter: initialFilter(),
    loading: true,
    error: '',
    serverErrors: {},
    history: [],
  }));
  const update = useCallback<Update>(
    (patch) => setState((previous) => ({ ...previous, ...patch })),
    [],
  );
  const generation = useRef(0);
  useInitialLoad(api, owner, online, update);
  useFilteredCache(owner, online, state.filter, update);
  useEffect(() => {
    const invalidate = () => {
      generation.current++;
    };
    invalidate();
    return invalidate;
  }, [owner, online]);
  const refreshHistory = useCallback(() => {
    if (online)
      void api
        .get<{ reports: ReportMetadata[] }>('/api/analytics/reports')
        .then((data) => update({ history: data.reports }))
        .catch(() => undefined);
  }, [api, online, update]);
  useEffect(refreshHistory, [refreshHistory]);
  const errors = { ...validateFilters(state.filter, state.events), ...state.serverErrors };
  const generate = async () => {
    if (!online || Object.keys(errors).length) return;
    const request = ++generation.current;
    await generateAnalytics({
      api,
      owner,
      state,
      update,
      current: () => generation.current === request,
    });
  };
  const changeFilter = (filter: AnalyticsFilter) => update({ filter, serverErrors: {} });
  return { ...state, user, online, errors, generate, changeFilter, refreshHistory };
}
