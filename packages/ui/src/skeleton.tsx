import { type HTMLAttributes } from 'react';
import { cn } from './cn';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'rounded-tile bg-surface-muted motion-safe:animate-pulse',
        className,
      )}
      {...props}
    />
  );
}
