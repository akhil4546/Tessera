import { type HTMLAttributes } from 'react';
import { cn } from './cn';

export function Tile({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-tile-lg border border-border bg-surface-elevated p-6 shadow-[var(--tessera-shadow-tile)]',
        className,
      )}
      {...props}
    />
  );
}
