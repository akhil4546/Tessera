'use client';

import { cn } from './cn';
import { useTheme, type ThemePreference } from './theme-provider';

export type ThemeToggleProps = {
  labels: Record<ThemePreference, string>;
  groupLabel: string;
};

const options: ThemePreference[] = ['light', 'dark', 'system'];

export function ThemeToggle({ labels, groupLabel }: ThemeToggleProps) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="group"
      aria-label={groupLabel}
      className="flex rounded-tile border border-border bg-surface-muted p-0.5"
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setPreference(option)}
          aria-pressed={preference === option}
          className={cn(
            'min-h-9 rounded-[10px] px-2.5 text-xs font-medium text-text-secondary transition-colors duration-[var(--tessera-duration-fast)]',
            preference === option && 'bg-surface-elevated text-text-primary shadow-sm',
          )}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}
