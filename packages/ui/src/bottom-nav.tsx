import { cn } from './cn';
import { navIcons } from './icons';
import { type NavLinkComponent, type ShellNavItem } from './nav-rail';

const DefaultLink: NavLinkComponent = ({ href, className, children, ...rest }) => (
  <a href={href} className={className} {...rest}>
    {children}
  </a>
);

export type BottomNavProps = {
  items: readonly ShellNavItem[];
  activeId: string;
  ariaLabel: string;
  linkComponent?: NavLinkComponent;
};

export function BottomNav({
  items,
  activeId,
  ariaLabel,
  linkComponent: Link = DefaultLink,
}: BottomNavProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-surface-elevated/95 px-2 py-1 backdrop-blur md:hidden"
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
              'flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-tile text-[11px] font-medium',
              prominent && '-mt-3',
            )}
          >
            <span
              className={cn(
                'relative flex h-11 w-11 items-center justify-center rounded-full',
                prominent && 'bg-accent text-text-inverse shadow-[var(--tessera-shadow-tile)]',
                !prominent && active && 'text-text-primary',
                !prominent && !active && 'text-text-secondary',
              )}
            >
              <Icon className="h-5 w-5" />
              {item.badge ? (
                <span className="absolute right-0 top-0 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-text-inverse">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              ) : null}
            </span>
            <span className={cn(prominent && 'sr-only', !prominent && 'text-text-secondary')}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
