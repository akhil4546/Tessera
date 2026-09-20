import type { AccountType } from './account';
import type { WhoCanMessage } from './inbox';
import type { SensitivityLevel } from './safety';

export type ClientKind = 'web' | 'mobile';

export type FollowRelationStatus = 'none' | 'pending' | 'accepted';

export type MuteScope = 'posts' | 'moments' | 'both';

export type ProfileLink = {
  title: string;
  url: string;
};

export type ViewerRelation = {
  isSelf: boolean;
  following: boolean;
  followedBy: boolean;
  followStatus: FollowRelationStatus;
  blockedByMe: boolean;
  mutedByMe: boolean;
  muteScope: MuteScope | null;
  restrictedByMe: boolean;
};

export type PublicProfile = {
  id: string;
  handle: string;
  displayName: string;
  bio: string;
  bioUrls: string[];
  links: ProfileLink[];
  pronouns: string | null;
  category: string | null;
  accountType: AccountType;
  isPrivate: boolean;
  memoryMapEnabled: boolean;
  avatarUrl: string | null;
  createdAt: string;
  counts: {
    followers: number;
    following: number;
    posts: number;
  };
  viewer: ViewerRelation;
};

export type MeProfile = PublicProfile & {
  email: string;
  emailVerified: boolean;
  totpEnabled: boolean;
  isMinor: boolean;
  dateOfBirth: string;
  defaultAppreciation: import('./appreciation').AppreciationType;
  momentArchiveEnabled: boolean;
  activityStatusEnabled: boolean;
  readReceiptsEnabled: boolean;
  whoCanMessage: WhoCanMessage;
  sensitivityLevel: SensitivityLevel;
  deletion: {
    pending: boolean;
    executeAt: string | null;
  };
};

export type SessionView = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  lastUsedAt: string;
  createdAt: string;
  current: boolean;
};

export type AuthTokenBundle = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type AuthSuccess = {
  user: MeProfile;
  requiresTwoFactor?: false;
} & Partial<AuthTokenBundle>;

export type AuthTwoFactorChallenge = {
  requiresTwoFactor: true;
  challengeToken: string;
};

export type AuthResult = AuthSuccess | AuthTwoFactorChallenge;

export type Paginated<T> = {
  items: T[];
  nextCursor: string | null;
};
