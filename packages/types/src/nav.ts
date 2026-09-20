export const NAV_ITEMS = [
  { id: 'home', href: '/', labelKey: 'nav.home' },
  { id: 'discover', href: '/discover', labelKey: 'nav.discover' },
  { id: 'create', href: '/create', labelKey: 'nav.create' },
  { id: 'inbox', href: '/inbox', labelKey: 'nav.inbox' },
  { id: 'me', href: '/me', labelKey: 'nav.me' },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];
export type NavItemId = NavItem['id'];
