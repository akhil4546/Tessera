import { type ComponentType, type ReactNode } from 'react';
import { cn } from './cn';
import { navIcons } from './icons';

export type ShellNavItem = {
  id: 'home' | 'discover' | 'create' | 'inbox' | 'me';
  href: string;
  label: string;
  badge?: number;
};

export type NavLinkComponent = ComponentType<{
  href: string;
  className?: string;
  children: ReactNode;
  'aria-current'?: 'page';
}>;

const DefaultLink: NavLinkComponent = ({ href, className, children, ...rest }) => (
  <a href={href} className={className} {...rest}>
    {children}
  </a>
);

export type NavRailProps = {
  items: readonly ShellNavItem[];
  activeId: string;
  ariaLabel: string;
  linkComponent?: NavLinkComponent;
};

export function NavRail({ items, activeId, ariaLabel, linkComponent: Link = DefaultLink }: NavRailProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className="hidden h-full w-[4.75rem] flex-col items-center gap-1 border-r border-border bg-surface-elevated py-4 md:flex lg:w-52 lg:items-stretch lg:px-3"
    >
      {items.map((item) => {
        const Icon = navIcons[item.id];
        const active = item.id === activeId;
        const prominent = item.id === 'create';
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center justify-center gap-3 rounded-tile px-3 text-sm font-medium transition-colors duration-[var(--tessera-duration-fast)] lg:justify-start',
              prominent &&
                'bg-accent text-text-inverse hover:bg-accent-hover lg:mt-2 lg:mb-2',
              !prominent && active && 'bg-surface-muted text-text-primary',
              !prominent && !active && 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
            )}
          >
            <span className="relative">
              <Icon className="h-5 w-5 shrink-0" />
              {item.badge ? (
                <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-text-inverse">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              ) : null}
            </span>
            <span className="hidden lg:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
