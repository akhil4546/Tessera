import { type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';
import { PlusIcon } from './icons';

export type CreateButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
};

export function CreateButton({ label, className, ...props }: CreateButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'inline-flex h-12 min-w-12 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-text-inverse shadow-[var(--tessera-shadow-tile)] transition-colors duration-[var(--tessera-duration-fast)] hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        className,
      )}
      {...props}
    >
      <PlusIcon className="h-5 w-5" />
      <span className="sr-only md:not-sr-only">{label}</span>
    </button>
  );
}
