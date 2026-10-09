import type { Role } from '@contracts/enums';
import type { MessageKey } from '@/shared/i18n/messages.en';
import type { IconName } from '@/shared/ui/Icon';

/** One entry in the sidebar. Each feature declares its own in `features/<name>/nav.ts`. */
export interface NavItem {
  id: string;
  labelKey: MessageKey;
  to: string;
  /** Who sees it. Omit for everyone who is signed in. The server still enforces access. */
  roles?: readonly Role[];
  /** The line icon beside the label (a plain dot when there is none). */
  icon?: IconName;
  /**
   * A live number shown as a badge on the entry (how many warnings are waiting, say). It is a hook so it
   * can read the feature's own data, and it runs only for the roles that can see the entry.
   */
  useBadge?: () => number | undefined;
}

/** The three sidebar sections shared by every module (fixes HCI-01: one consistent navigation). */
export interface NavGroup {
  id: 'warnings' | 'coordination' | 'analysis';
  labelKey: MessageKey;
  items: NavItem[];
}

export function visibleGroups(groups: readonly NavGroup[], role: Role): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * The entry that says where you are: of the entries whose address is yours or contains yours, the most
 * specific one. `/warnings/issued` belongs to "Issued Warnings", not to "Pending Approvals" (`/warnings`)
 * that also contains it, while `/warnings/W-102` belongs to "Pending Approvals".
 */
export function activeNavItem(items: readonly NavItem[], pathname: string): NavItem | undefined {
  return items
    .filter((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];
}
