import { type TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from './cn';

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
};

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { className, label, hint, id, ...props },
  ref,
) {
  const fieldId = id ?? props.name;
  const hintId = hint && fieldId ? `${fieldId}-hint` : undefined;

  return (
    <label className="flex flex-col gap-1.5 text-sm text-text-primary">
      <span className="font-medium">{label}</span>
      <textarea
        ref={ref}
        id={fieldId}
        aria-describedby={hintId}
        className={cn(
          'min-h-28 rounded-tile border border-border bg-surface-elevated px-3 py-2 text-base text-text-primary outline-none transition-shadow duration-[var(--tessera-duration-fast)] placeholder:text-text-secondary focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
        {...props}
      />
      {hint ? (
        <span id={hintId} className="text-text-secondary">
          {hint}
        </span>
      ) : null}
    </label>
  );
});
