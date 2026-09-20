import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { EmptyState } from './empty-state';
import { NavRail } from './nav-rail';

const items = [
  { id: 'home' as const, href: '/', label: 'Home' },
  { id: 'discover' as const, href: '/discover', label: 'Discover' },
  { id: 'create' as const, href: '/create', label: 'Create' },
  { id: 'inbox' as const, href: '/inbox', label: 'Inbox' },
  { id: 'me' as const, href: '/me', label: 'Me' },
];

describe('Button', () => {
  it('exposes an accessible name', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });
});

describe('EmptyState', () => {
  it('renders title and body', () => {
    render(<EmptyState title="You're not following anyone yet" body="Find people in Discover." />);
    expect(screen.getByRole('heading', { name: "You're not following anyone yet" })).toBeTruthy();
  });
});

describe('NavRail', () => {
  it('exposes navigation with labelled items', () => {
    render(<NavRail items={items} activeId="home" ariaLabel="Main" />);
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Create' })).toBeTruthy();
  });

  it('shows an Inbox badge count', () => {
    const withBadge = items.map((item) => (item.id === 'inbox' ? { ...item, badge: 3 } : item));
    render(<NavRail items={withBadge} activeId="inbox" ariaLabel="Main" />);
    expect(screen.getByText('3')).toBeTruthy();
  });
});
