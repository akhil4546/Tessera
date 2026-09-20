export const DRAFT_KINDS = ['post', 'loop', 'moment'] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export type DraftView = {
  id: string;
  kind: DraftKind;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
