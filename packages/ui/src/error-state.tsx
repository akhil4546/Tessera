import { Button } from './button';
import { EmptyState } from './empty-state';

export type ErrorStateProps = {
  title: string;
  body: string;
  retryLabel: string;
  onRetry?: () => void;
};

export function ErrorState({ title, body, retryLabel, onRetry }: ErrorStateProps) {
  return (
    <EmptyState
      title={title}
      body={body}
      action={
        onRetry ? (
          <Button type="button" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : undefined
      }
    />
  );
}
