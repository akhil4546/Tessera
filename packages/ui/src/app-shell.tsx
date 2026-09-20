import { type ReactNode } from 'react';
import { BottomNav } from './bottom-nav';
import { type NavLinkComponent, NavRail, type ShellNavItem } from './nav-rail';

export type AppShellProps = {
  items: readonly ShellNavItem[];
  activeId: string;
  ariaLabel: string;
  wordmark: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  linkComponent?: NavLinkComponent;
};

export function AppShell({
  items,
  activeId,
  ariaLabel,
  wordmark,
  toolbar,
  children,
  linkComponent,
}: AppShellProps) {
  return (
    <div className="min-h-dvh bg-surface text-text-primary">
      <div className="flex min-h-dvh">
        <div className="sticky top-0 hidden h-dvh md:flex">
          <div className="flex h-full flex-col">
            <div className="border-r border-border bg-surface-elevated px-3 py-4 lg:px-4">
              {wordmark}
            </div>
            <NavRail
              items={items}
              activeId={activeId}
              ariaLabel={ariaLabel}
              linkComponent={linkComponent}
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur md:px-8">
            <div className="md:hidden">{wordmark}</div>
            <div className="ml-auto flex items-center gap-2">{toolbar}</div>
          </header>
          <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:pb-8">{children}</main>
        </div>
      </div>
      <BottomNav
        items={items}
        activeId={activeId}
        ariaLabel={ariaLabel}
        linkComponent={linkComponent}
      />
    </div>
  );
}
