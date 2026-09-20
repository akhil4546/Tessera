import { cn } from './cn';

export function Wordmark({
  className,
  subtitle,
}: {
  className?: string;
  subtitle?: string;
}) {
  return (
    <div className={cn('flex flex-col', className)}>
      <span className="font-display text-xl font-semibold tracking-tight text-text-primary">
        Tessera
      </span>
      {subtitle ? (
        <span className="text-[11px] uppercase tracking-[0.16em] text-text-secondary">
          {subtitle}
        </span>
      ) : null}
    </div>
  );
}
