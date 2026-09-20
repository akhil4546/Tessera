import { type ReactNode } from 'react';
import { Tile } from './tile';

export type EmptyStateProps = {
  title: string;
  body: string;
  action?: ReactNode;
};

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <Tile className="mx-auto max-w-lg text-center">
      <h2 className="font-display text-2xl font-semibold text-text-primary">{title}</h2>
      <p className="mt-3 text-base leading-relaxed text-text-secondary">{body}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </Tile>
  );
}
