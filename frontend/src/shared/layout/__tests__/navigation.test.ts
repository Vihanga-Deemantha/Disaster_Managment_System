import { activeNavItem, visibleGroups, type NavGroup, type NavItem } from '../navigation';

const item = (id: string, to: string, roles?: NavItem['roles']): NavItem => ({
  id,
  labelKey: 'nav.warnings',
  to,
  roles,
});

describe('activeNavItem (which sidebar entry says where you are)', () => {
  const pending = item('pending', '/warnings');
  const issued = item('issued', '/warnings/issued');
  const resources = item('resources', '/resources');
  const items = [pending, issued, resources];

  it('is the entry whose address you are on', () => {
    expect(activeNavItem(items, '/warnings')).toBe(pending);
    expect(activeNavItem(items, '/warnings/issued')).toBe(issued);
    expect(activeNavItem(items, '/resources')).toBe(resources);
  });

  it('is the entry above you when you are on a page below it', () => {
    expect(activeNavItem(items, '/warnings/W-102')).toBe(pending);
    expect(activeNavItem(items, '/warnings/W-102/delivery')).toBe(pending);
    expect(activeNavItem(items, '/warnings/issued/anything')).toBe(issued);
  });

  it('prefers the most specific entry, however the entries are ordered', () => {
    expect(activeNavItem([issued, pending], '/warnings/issued')).toBe(issued);
    expect(activeNavItem([pending, issued], '/warnings/issued')).toBe(issued);
  });

  it('is nothing when no entry is yours, and does not mistake a longer word for a page below', () => {
    expect(activeNavItem(items, '/nowhere')).toBeUndefined();
    expect(activeNavItem(items, '/warnings-archive')).toBeUndefined();
    expect(activeNavItem([], '/warnings')).toBeUndefined();
  });
});

describe('visibleGroups', () => {
  const groups: NavGroup[] = [
    {
      id: 'warnings',
      labelKey: 'nav.group.warnings',
      items: [item('dmc', '/warnings', ['DMC_OFFICER']), item('all', '/home')],
    },
    {
      id: 'analysis',
      labelKey: 'nav.group.analysis',
      items: [item('donor', '/analytics', ['DONOR'])],
    },
  ];

  it('keeps an entry with no role list for everyone, and drops groups left empty', () => {
    const visible = visibleGroups(groups, 'CITIZEN');

    expect(visible.map((group) => group.id)).toEqual(['warnings']);
    expect(visible[0].items.map((entry) => entry.id)).toEqual(['all']);
  });

  it('keeps the entries a role is named in', () => {
    expect(
      visibleGroups(groups, 'DMC_OFFICER').flatMap((group) => group.items.map((entry) => entry.id)),
    ).toEqual(['dmc', 'all']);
  });
});
