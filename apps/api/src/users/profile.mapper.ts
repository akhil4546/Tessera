import { extractBioUrls, HANDLE_CHANGE_COOLDOWN_DAYS } from '@tessera/validation';
import type {
  AppreciationType,
  MeProfile,
  ProfileLink,
  PublicProfile,
  SensitivityLevel,
  ViewerRelation,
  WhoCanMessage,
} from '@tessera/types';

type ProfileRow = {
  displayName: string;
  bio: string;
  avatarKey: string | null;
  pronouns: string | null;
  category: string | null;
  accountType: 'personal' | 'creator' | 'business';
  isPrivate: boolean;
  memoryMapEnabled: boolean;
  defaultAppreciation?: AppreciationType;
  momentArchiveEnabled?: boolean;
  activityStatusEnabled?: boolean;
  readReceiptsEnabled?: boolean;
  whoCanMessage?: WhoCanMessage;
  sensitivityLevel?: SensitivityLevel;
  links: unknown;
};

type UserRow = {
  id: string;
  handle: string;
  createdAt: Date;
  email: string;
  emailVerifiedAt: Date | null;
  isMinor: boolean;
  dateOfBirth: Date;
  profile: ProfileRow | null;
};

function asLinks(value: unknown): ProfileLink[] {
  if (!Array.isArray(value)) return [];
  const links: ProfileLink[] = [];
  for (const item of value as unknown[]) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { title?: unknown; url?: unknown };
    if (typeof record.title === 'string' && typeof record.url === 'string') {
      links.push({ title: record.title, url: record.url });
    }
  }
  return links.slice(0, 3);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function emptyViewer(isSelf: boolean): ViewerRelation {
  return {
    isSelf,
    following: false,
    followedBy: false,
    followStatus: 'none',
    blockedByMe: false,
    mutedByMe: false,
    muteScope: null,
    restrictedByMe: false,
  };
}

export function toPublicProfile(
  user: UserRow,
  counts: { followers: number; following: number; posts: number },
  viewer: ViewerRelation,
  avatarUrl: string | null = null,
): PublicProfile {
  const profile = user.profile;
  const bio = profile?.bio ?? '';
  return {
    id: user.id,
    handle: user.handle,
    displayName: profile?.displayName ?? user.handle,
    bio,
    bioUrls: extractBioUrls(bio),
    links: asLinks(profile?.links),
    pronouns: profile?.pronouns ?? null,
    category: profile?.category ?? null,
    accountType: profile?.accountType ?? 'personal',
    isPrivate: profile?.isPrivate ?? false,
    memoryMapEnabled: profile?.memoryMapEnabled ?? true,
    avatarUrl,
    createdAt: user.createdAt.toISOString(),
    counts,
    viewer,
  };
}

export function toMeProfile(
  user: UserRow,
  counts: { followers: number; following: number; posts: number },
  totpEnabled: boolean,
  avatarUrl: string | null = null,
): MeProfile {
  return {
    ...toPublicProfile(user, counts, emptyViewer(true), avatarUrl),
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    totpEnabled,
    isMinor: user.isMinor,
    dateOfBirth: isoDate(user.dateOfBirth),
    defaultAppreciation: user.profile?.defaultAppreciation ?? 'love',
    momentArchiveEnabled: user.profile?.momentArchiveEnabled ?? false,
    activityStatusEnabled: user.profile?.activityStatusEnabled ?? true,
    readReceiptsEnabled: user.profile?.readReceiptsEnabled ?? true,
    whoCanMessage: user.profile?.whoCanMessage ?? 'everyone',
    sensitivityLevel: user.profile?.sensitivityLevel ?? 'warn',
    deletion: { pending: false, executeAt: null },
  };
}

export function handleCooldownEnds(handleChangedAt: Date | null, now = new Date()): Date | null {
  if (!handleChangedAt) return null;
  const ends = new Date(handleChangedAt);
  ends.setUTCDate(ends.getUTCDate() + HANDLE_CHANGE_COOLDOWN_DAYS);
  return ends > now ? ends : null;
}
