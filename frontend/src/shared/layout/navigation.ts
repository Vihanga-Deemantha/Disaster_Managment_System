import type { Role } from '@contracts/enums';
import type { MessageKey } from '@/shared/i18n/messages.en';

/** One entry in the sidebar. Each feature declares its own in `features/<name>/nav.ts`. */
export interface NavItem {
  id: string;
  labelKey: MessageKey;
  to: string;
  /** Who sees it. Omit for everyone who is signed in. The server still enforces access. */
  roles?: readonly Role[];
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
