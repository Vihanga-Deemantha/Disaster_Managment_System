import type { NavItem } from '@/shared/layout/navigation';
import { useApi } from '@/shared/api/ApiProvider';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import type { Board } from './types';
import { useResourcePolling } from './liveUpdates';

/** UC-2 sidebar entry. Adjust `roles` to match the report (District Officer plus the resource owners). */
export const resourcesNav: NavItem = {
  id: 'resources',
  labelKey: 'nav.resources',
  to: '/resources',
  roles: [
    'DISTRICT_OFFICER',
    'DMC_OFFICER',
    'NGO_MANAGER',
    'ARMED_FORCES_LIAISON',
    'GOVERNMENT_AGENCY_OFFICER',
  ],
};

const owners = ['NGO_MANAGER', 'ARMED_FORCES_LIAISON', 'GOVERNMENT_AGENCY_OFFICER'] as const;
export const resourceSidebarItems: NavItem[] = [
  {
    id: 'resource-overview',
    labelKey: 'resources.nav.overview',
    to: '/resources/overview',
    roles: ['DISTRICT_OFFICER'],
    icon: 'mapPin',
  },
  { ...resourcesNav, roles: ['DMC_OFFICER'], icon: 'package' },
  {
    id: 'resource-allocate',
    labelKey: 'nav.resources',
    to: '/resources/allocate',
    roles: ['DISTRICT_OFFICER'],
    icon: 'package',
  },
  {
    id: 'resource-requests',
    labelKey: 'resources.nav.requests',
    to: '/resources/requests',
    roles: ['DISTRICT_OFFICER', ...owners],
    icon: 'mapPin',
    useBadge: usePendingRequests,
  },
  {
    id: 'resource-deployments',
    labelKey: 'resources.nav.deployments',
    to: '/resources/deployments',
    roles: ['DISTRICT_OFFICER', ...owners],
    icon: 'package',
  },
  {
    id: 'resource-field',
    labelKey: 'resources.nav.field',
    to: '/resources/field',
    roles: ['DISTRICT_OFFICER', ...owners],
    icon: 'shield',
  },
];
function usePendingRequests() {
  const api = useApi();
  const board = useCachedResource({
    module: 'resources',
    name: 'request-badge',
    load: () => api.get<Board>('/api/resources/board'),
  });
  useResourcePolling(board.reload);
  return board.data?.requests.filter((request) => request.status === 'PENDING').length;
}
