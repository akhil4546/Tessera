import type { AuthorPreview } from './post';

export type CircleSummary = {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CircleMemberView = AuthorPreview & {
  addedAt: string;
};

export type CircleDetail = CircleSummary & {
  members: CircleMemberView[];
};
