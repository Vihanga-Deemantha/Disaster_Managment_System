import { useEffect } from 'react';
import { useApi } from '@/shared/api/ApiProvider';
import type { NavItem } from '@/shared/layout/navigation';
import { useCachedResource } from '@/shared/offline/useCachedResource';
import { listPending } from './api';

/** The sidebar numbers that have to be read again when a warning leaves the waiting list. */
const refreshers = new Set<() => void>();

/**
 * Said by the screens that issue or reject a warning, so the number on the sidebar drops at once instead
 * of when the officer next opens the list.
 */
export const pendingChanged = (): void => {
  refreshers.forEach((refresh) => refresh());
};

/**
 * How many warnings are waiting: the number on the sidebar entry. It reads the very list the Pending
 * Approvals screen shows (same saved copy), so the two can never disagree, and it works offline.
 */
export function usePendingCount(): number | undefined {
  const api = useApi();
  const { data, reload } = useCachedResource({
    module: 'warnings',
    name: 'pending-list',
    load: () => listPending(api),
  });
  useEffect(() => {
    refreshers.add(reload);
    window.addEventListener('safezone:warning-request-created', reload);
    return () => {
      refreshers.delete(reload);
      window.removeEventListener('safezone:warning-request-created', reload);
    };
  }, [reload]);
  return data?.length;
}

/** UC-1 sidebar entries: only a DMC Officer approves, issues and reviews warnings. */
export const warningsNav: NavItem = {
  id: 'warnings',
  labelKey: 'nav.warnings',
  to: '/warnings',
  roles: ['DMC_OFFICER'],
  icon: 'inbox',
  useBadge: usePendingCount,
};

export const warningsIssuedNav: NavItem = {
  id: 'warnings-issued',
  labelKey: 'nav.warnings.issued',
  to: '/warnings/issued',
  roles: ['DMC_OFFICER'],
  icon: 'radio',
};

export const warningsRejectedNav: NavItem = {
  id: 'warnings-rejected',
  labelKey: 'nav.warnings.rejected',
  to: '/warnings/rejected',
  roles: ['DMC_OFFICER'],
  icon: 'shieldX',
};
