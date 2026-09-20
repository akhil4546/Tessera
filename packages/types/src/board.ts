import type { AuthorPreview, PostCard } from './post';

export const BOARD_VISIBILITIES = ['private', 'shared', 'public'] as const;
export type BoardVisibility = (typeof BOARD_VISIBILITIES)[number];

export const DEFAULT_SAVED_BOARD_TITLE = 'Saved';

export type BoardCollaboratorView = AuthorPreview & {
  accepted: boolean;
  invitedAt: string;
};

export type BoardItemView = {
  id: string;
  post: PostCard;
  addedBy: AuthorPreview;
  createdAt: string;
};

export type BoardCard = {
  id: string;
  title: string;
  description: string;
  visibility: BoardVisibility;
  isDefault: boolean;
  owner: AuthorPreview;
  itemCount: number;
  followerCount: number;
  coverUrl: string | null;
  viewer: {
    isOwner: boolean;
    isCollaborator: boolean;
    pendingInvite: boolean;
    isFollower: boolean;
    canAdd: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type BoardDetail = BoardCard & {
  items: BoardItemView[];
  collaborators: BoardCollaboratorView[];
  nextCursor: string | null;
};

export type BoardSaveResult = {
  board: BoardCard;
  item: { id: string; postId: string; createdAt: string };
};
