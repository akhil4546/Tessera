import { Injectable } from '@nestjs/common';
import {
  DEFAULT_RANKING_WEIGHTS,
  nearbySignalFromKm,
  newCreatorSignal,
  normalizeWeights,
  popularitySignal,
  rankByScore,
  recencySignal,
  scoreCandidate,
  shortestDistanceKm,
  topicMatchSignal,
  muteHidesPosts,
  type RankingSignal,
  type RankingWeights,
} from '@tessera/media';
import type {
  DiscoverFeed,
  DiscoverItem,
  DiscoverTopic,
  HashtagPage,
  MemoryMapView,
  PlacePage,
  PlacePreview,
  RecentSearchView,
  SearchResults,
  SuggestedPerson,
} from '@tessera/types';
import { TesseraHttpError } from '../common/http-error.js';
import { BoardsService } from '../boards/boards.service.js';
import { encodeCursor } from '../common/pagination.js';
import { RateLimitService } from '../common/rate-limit.js';
import { POST_INCLUDE, PostsService } from '../posts/posts.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { UsersService } from '../users/users.service.js';
import { toPlacePreview } from './place-upsert.js';
import { SearchService } from './search.service.js';

const CANDIDATE_CAP = 200;
const RECENT_SEARCH_KEEP = 20;

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly users: UsersService,
    private readonly searchIndex: SearchService,
    private readonly storage: StorageService,
    private readonly rateLimit: RateLimitService,
    private readonly boards: BoardsService,
  ) {}

  async search(
    userId: string,
    input: { q: string; tab: 'all' | 'people' | 'hashtags' | 'places' | 'captions' | 'boards'; limit: number },
  ): Promise<SearchResults> {
    await this.rateLimit.consume(`search:${userId}`, 60, 60);
    await this.rememberSearch(userId, input.q);

    const hits = await this.searchIndex.search(input.q, input.limit);
    const empty: SearchResults = {
      query: input.q,
      engine: hits.engine,
      people: [],
      hashtags: [],
      places: [],
      captions: [],
      boards: [],
    };

    const want = (tab: typeof input.tab) => input.tab === 'all' || input.tab === tab;

    if (want('people')) {
      for (const id of hits.peopleIds) {
        const user = await this.prisma.user.findUnique({ where: { id }, include: { profile: true } });
        if (!user?.profile || user.deactivatedAt || user.suspendedAt) continue;
        if (await this.users.isBlockedEitherWay(userId, user.id)) continue;
        if (user.isMinor && user.id !== userId) {
          const follows = await this.prisma.follow.findUnique({
            where: { followerId_followeeId: { followerId: userId, followeeId: user.id } },
          });
          if (follows?.status !== 'accepted') continue;
        }
        empty.people.push(await this.users.getPublicByHandle(user.handle, userId));
      }
    }

    if (want('hashtags')) {
      const followed = await this.followedTags(userId);
      for (const tag of hits.hashtagTags) {
        const hashtag = await this.prisma.hashtag.findUnique({
          where: { tag: tag.replace(/^#/, '').toLowerCase() },
        });
        if (!hashtag) continue;
        const postCount = await this.publicHashtagCount(hashtag.id);
        empty.hashtags.push({ tag: hashtag.tag, postCount, followed: followed.has(hashtag.tag) });
      }
    }

    if (want('places')) {
      for (const id of hits.placeIds) {
        const place = await this.prisma.place.findUnique({ where: { id } });
        if (!place) continue;
        const postCount = await this.prisma.post.count({
          where: { placeId: place.id, publishedAt: { not: null }, deletedAt: null, visibility: 'public' },
        });
        empty.places.push({ ...toPlacePreview(place)!, postCount });
      }
    }

    if (want('captions')) {
      for (const id of hits.postIds) {
        try {
          const post = await this.posts.get(id, userId);
          empty.captions.push({ post });
        } catch {
          // Hidden or blocked — skip.
        }
      }
    }

    if (want('boards')) {
      empty.boards = hits.boardIds.length
        ? await this.boards.cardsByIds(userId, hits.boardIds)
        : await this.boards.searchHits(userId, input.q, input.limit);
    }

    return empty;
  }

  async recentSearches(userId: string): Promise<{ items: RecentSearchView[] }> {
    const rows = await this.prisma.recentSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_SEARCH_KEEP,
    });
    return { items: rows.map((row) => ({ query: row.query, createdAt: row.createdAt.toISOString() })) };
  }

  async clearRecentSearches(userId: string): Promise<{ ok: true }> {
    await this.prisma.recentSearch.deleteMany({ where: { userId } });
    return { ok: true };
  }

  searchBoards(userId: string, q: string, limit: number) {
    return this.boards.search(userId, q, limit);
  }

  async getWeights(userId: string): Promise<RankingWeights> {
    const row = await this.prisma.rankingPreference.findUnique({ where: { userId } });
    return normalizeWeights(row ?? DEFAULT_RANKING_WEIGHTS);
  }

  async setWeights(userId: string, patch: Partial<RankingWeights>): Promise<RankingWeights> {
    const current = await this.getWeights(userId);
    const next = normalizeWeights({ ...current, ...patch });
    await this.prisma.rankingPreference.upsert({
      where: { userId },
      create: { userId, ...next },
      update: next,
    });
    return next;
  }

  async discover(
    userId: string,
    opts: { cursor?: string; limit: number; topic?: string },
  ): Promise<DiscoverFeed> {
    const weights = await this.getWeights(userId);
    const ranked = await this.rankForViewer(userId, weights, opts.topic);
    const start = opts.cursor ? ranked.findIndex((row) => row.postId === opts.cursor) + 1 : 0;
    const slice = start < 0 ? ranked.slice(0, opts.limit) : ranked.slice(start, start + opts.limit);
    const items: DiscoverItem[] = [];
    for (const row of slice) {
      const impression = await this.prisma.discoverImpression.create({
        data: {
          userId,
          postId: row.postId,
          score: row.score,
          signals: row.signals,
          weights,
          topic: opts.topic ?? null,
        },
      });
      items.push({
        impressionId: impression.id,
        score: row.score,
        signals: row.signals,
        post: row.post,
      });
    }
    const last = slice[slice.length - 1];
    return {
      items,
      nextCursor: slice.length === opts.limit && last ? last.postId : null,
      topic: opts.topic ?? null,
      topics: await this.topics(userId),
      weights,
      engine: 'rules',
    };
  }

  async why(userId: string, impressionId: string): Promise<{
    impressionId: string;
    postId: string;
    score: number;
    signals: RankingSignal[];
    weights: RankingWeights;
  }> {
    const row = await this.prisma.discoverImpression.findUnique({ where: { id: impressionId } });
    if (!row || row.userId !== userId) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'That Discover card was not shown to you.');
    }
    return {
      impressionId: row.id,
      postId: row.postId,
      score: row.score,
      signals: row.signals as RankingSignal[],
      weights: normalizeWeights(row.weights as RankingWeights),
    };
  }

  async hashtagPage(
    userId: string | undefined,
    tag: string,
    opts: { sort: 'top' | 'recent'; cursor?: string; limit: number },
  ): Promise<HashtagPage> {
    const hashtag = await this.prisma.hashtag.findUnique({ where: { tag } });
    if (!hashtag) throw new TesseraHttpError(404, 'NOT_FOUND', 'No posts with that hashtag yet.');
    const followed = userId ? (await this.followedTags(userId)).has(tag) : false;
    const items = await this.listTaggedPosts(hashtag.id, userId, opts);
    const postCount = await this.publicHashtagCount(hashtag.id);
    return { tag, postCount, followed, sort: opts.sort, ...items };
  }

  async followHashtag(userId: string, tag: string): Promise<HashtagPage> {
    const hashtag = await this.prisma.hashtag.upsert({ where: { tag }, create: { tag }, update: {} });
    await this.prisma.hashtagFollow.upsert({
      where: { userId_hashtagId: { userId, hashtagId: hashtag.id } },
      create: { userId, hashtagId: hashtag.id },
      update: {},
    });
    return this.hashtagPage(userId, tag, { sort: 'recent', limit: 20 });
  }

  async unfollowHashtag(userId: string, tag: string): Promise<HashtagPage> {
    const hashtag = await this.prisma.hashtag.findUnique({ where: { tag } });
    if (hashtag) {
      await this.prisma.hashtagFollow.deleteMany({ where: { userId, hashtagId: hashtag.id } });
    }
    return this.hashtagPage(userId, tag, { sort: 'recent', limit: 20 });
  }

  async myHashtags(userId: string): Promise<{ items: DiscoverTopic[] }> {
    const rows = await this.prisma.hashtagFollow.findMany({
      where: { userId },
      include: { hashtag: true },
      orderBy: { createdAt: 'desc' },
    });
    const items: DiscoverTopic[] = [];
    for (const row of rows) {
      items.push({
        tag: row.hashtag.tag,
        label: `#${row.hashtag.tag}`,
        postCount: await this.publicHashtagCount(row.hashtagId),
        followed: true,
      });
    }
    return { items };
  }

  async placePage(
    userId: string | undefined,
    slug: string,
    opts: { sort: 'top' | 'recent'; cursor?: string; limit: number },
  ): Promise<PlacePage> {
    const place = await this.prisma.place.findUnique({ where: { slug } });
    if (!place) throw new TesseraHttpError(404, 'NOT_FOUND', 'No place with that name.');
    const items = await this.listPlacePosts(place.id, userId, opts);
    const postCount = await this.prisma.post.count({
      where: { placeId: place.id, publishedAt: { not: null }, deletedAt: null, visibility: 'public' },
    });
    return { ...toPlacePreview(place)!, postCount, sort: opts.sort, ...items };
  }

  async memoryMap(handle: string, viewerId?: string): Promise<MemoryMapView> {
    const user = await this.users.loadByHandle(handle);
    if (viewerId && viewerId !== user.id && (await this.users.isBlockedEitherWay(viewerId, user.id))) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'No account with that handle.');
    }
    const enabled = user.profile.memoryMapEnabled;
    const isSelf = viewerId === user.id;
    if (!enabled && !isSelf) {
      return { handle: user.handle, enabled: false, visible: false, pins: [] };
    }
    const posts = await this.prisma.post.findMany({
      where: {
        authorId: user.id,
        publishedAt: { not: null },
        deletedAt: null,
        archivedAt: isSelf ? undefined : null,
        place: { lat: { not: null }, lng: { not: null } },
      },
      include: { place: true, media: { orderBy: { sortOrder: 'asc' }, take: 1 } },
      orderBy: { publishedAt: 'desc' },
      take: 200,
    });
    const pins = [];
    for (const post of posts) {
      if (!post.place?.lat || post.place.lng == null) continue;
      try {
        await this.posts.get(post.id, viewerId);
      } catch {
        continue;
      }
      const thumbKey = firstVariantKey(post.media[0]?.variants);
      pins.push({
        postId: post.id,
        place: toPlacePreview(post.place)!,
        publishedAt: post.publishedAt!.toISOString(),
        thumbnailUrl: await this.storage.signGet(thumbKey),
        caption: post.caption,
      });
    }
    return { handle: user.handle, enabled, visible: true, pins };
  }

  async suggestions(userId: string): Promise<{ items: SuggestedPerson[] }> {
    const [follows, blocks, dismissed] = await Promise.all([
      this.prisma.follow.findMany({ where: { followerId: userId, status: 'accepted' }, select: { followeeId: true } }),
      this.prisma.block.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      }),
      this.prisma.suggestedPersonDismiss.findMany({ where: { userId }, select: { suggestedUserId: true } }),
    ]);
    const following = new Set(follows.map((row) => row.followeeId));
    const blocked = new Set(blocks.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId)));
    const skip = new Set([userId, ...following, ...blocked, ...dismissed.map((row) => row.suggestedUserId)]);

    const secondDegree = await this.prisma.follow.findMany({
      where: { followerId: { in: [...following] }, status: 'accepted', followeeId: { notIn: [...skip] } },
      include: {
        follower: { include: { profile: true } },
        followee: { include: { profile: true } },
      },
      take: 40,
    });

    const items: SuggestedPerson[] = [];
    const seen = new Set<string>();
    for (const row of secondDegree) {
      if (seen.has(row.followeeId) || !row.followee.profile || row.followee.deactivatedAt || row.followee.suspendedAt) continue;
      if (row.followee.isMinor) continue;
      if (row.followee.profile.isPrivate) continue;
      seen.add(row.followeeId);
      items.push({
        profile: await this.users.getPublicByHandle(row.followee.handle, userId),
        reason: `Followed by @${row.follower.handle}`,
      });
      if (items.length >= 8) break;
    }

    const topics = [...(await this.followedTags(userId))];
    if (topics.length && items.length < 12) {
      const similar = await this.prisma.postHashtag.findMany({
        where: {
          hashtag: { tag: { in: topics } },
          post: {
            publishedAt: { not: null },
            deletedAt: null,
            visibility: 'public',
            authorId: { notIn: [...skip, ...seen] },
            author: { deactivatedAt: null, suspendedAt: null, isMinor: false, profile: { is: { isPrivate: false } } },
          },
        },
        include: { post: { include: { author: { include: { profile: true } } } }, hashtag: true },
        take: 30,
      });
      for (const row of similar) {
        const author = row.post.author;
        if (seen.has(author.id) || !author.profile) continue;
        seen.add(author.id);
        items.push({
          profile: await this.users.getPublicByHandle(author.handle, userId),
          reason: `Also posts #${row.hashtag.tag}`,
        });
        if (items.length >= 12) break;
      }
    }

    return { items };
  }

  async dismissSuggestion(userId: string, handle: string): Promise<{ ok: true }> {
    const target = await this.users.loadByHandle(handle);
    if (target.id === userId) throw new TesseraHttpError(400, 'SELF', 'You cannot dismiss yourself.');
    await this.prisma.suggestedPersonDismiss.upsert({
      where: { userId_suggestedUserId: { userId, suggestedUserId: target.id } },
      create: { userId, suggestedUserId: target.id },
      update: {},
    });
    return { ok: true };
  }

  private async rankForViewer(userId: string, weights: RankingWeights, topic?: string) {
    const [follows, mutes, blocks] = await Promise.all([
      this.prisma.follow.findMany({ where: { followerId: userId, status: 'accepted' }, select: { followeeId: true } }),
      this.prisma.mute.findMany({ where: { muterId: userId } }),
      this.prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } }),
    ]);
    const followed = new Set(follows.map((row) => row.followeeId));
    const muted = new Set(mutes.filter((row) => muteHidesPosts(row.scope)).map((row) => row.mutedId));
    const blocked = new Set(blocks.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId)));
    const excluded = [userId, ...followed, ...muted, ...blocked];

    const userTopics = [...(await this.userTopics(userId))];
    const myPlaces = await this.viewerPlaces(userId);
    const interacted = await this.interactedAuthorIds(userId);
    const secondDegree = await this.secondDegreeAuthorIds(userId, excluded);

    const posts = await this.prisma.post.findMany({
      where: {
        publishedAt: { not: null },
        deletedAt: null,
        takenDownAt: null,
        archivedAt: null,
        visibility: 'public',
        authorId: { notIn: excluded },
        author: { deactivatedAt: null, suspendedAt: null, isMinor: false, profile: { is: { isPrivate: false } } },
        ...(topic ? { hashtags: { some: { hashtag: { tag: topic.toLowerCase() } } } } : {}),
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: CANDIDATE_CAP,
      include: { ...POST_INCLUDE, place: true },
    });

    const authorIds = [...new Set(posts.map((post) => post.authorId))];
    const followerCounts = new Map<string, number>();
    if (authorIds.length) {
      const grouped = await this.prisma.follow.groupBy({
        by: ['followeeId'],
        where: { followeeId: { in: authorIds }, status: 'accepted' },
        _count: { _all: true },
      });
      for (const row of grouped) followerCounts.set(row.followeeId, row._count._all);
    }

    const now = new Date();
    const scored = [];
    for (const post of posts) {
      const tags = post.hashtags.map((row) => row.hashtag.tag);
      const topicHit = topicMatchSignal(tags, userTopics);
      const followers = followerCounts.get(post.authorId) ?? 0;
      const origin = post.place?.lat != null && post.place.lng != null
        ? { lat: post.place.lat, lng: post.place.lng }
        : null;
      const km = shortestDistanceKm(origin, myPlaces);
      const nearby = nearbySignalFromKm(km);
      const interact = interacted.has(post.authorId) ? 1 : secondDegree.has(post.authorId) ? 0.55 : 0;
      const ranked = scoreCandidate({
        topicMatch: topicHit.value,
        topicLabel: topicHit.matched.length
          ? `You follow or use ${topicHit.matched.map((tag) => `#${tag}`).join(', ')}`
          : undefined,
        interact,
        interactLabel: interacted.has(post.authorId)
          ? 'You have appreciated or commented on their posts'
          : secondDegree.has(post.authorId)
            ? 'Followed by people you follow'
            : undefined,
        newCreator: newCreatorSignal(followers),
        newCreatorLabel: followers <= 50 ? `New creator (${followers} followers)` : undefined,
        nearby,
        nearbyLabel:
          nearby > 0 && km != null && post.place
            ? `${Math.round(km)} km from a place you have posted`
            : undefined,
        popularity: popularitySignal(post.appreciations.length, post._count.comments),
        recency: recencySignal(post.publishedAt ?? now, now),
        isVideo: post.kind === 'loop',
        weights,
      });
      const card = await this.posts.mapPost(post, userId);
      scored.push({
        id: post.id,
        postId: post.id,
        score: ranked.score,
        signals: ranked.signals,
        post: card,
      });
    }
    return rankByScore(scored);
  }

  private async topics(userId: string): Promise<DiscoverTopic[]> {
    const followed = await this.followedTags(userId);
    const popular = await this.prisma.hashtag.findMany({
      take: 16,
      orderBy: { posts: { _count: 'desc' } },
      include: { _count: { select: { posts: true } } },
    });
    const seen = new Set<string>();
    const out: DiscoverTopic[] = [];
    for (const tag of followed) {
      seen.add(tag);
      const row = popular.find((item) => item.tag === tag);
      out.push({
        tag,
        label: `#${tag}`,
        postCount: row?._count.posts ?? (await this.publicHashtagCountByTag(tag)),
        followed: true,
      });
    }
    for (const row of popular) {
      if (seen.has(row.tag)) continue;
      out.push({ tag: row.tag, label: `#${row.tag}`, postCount: row._count.posts, followed: false });
      if (out.length >= 12) break;
    }
    return out;
  }

  private async userTopics(userId: string): Promise<Set<string>> {
    const tags = new Set<string>();
    const follows = await this.prisma.hashtagFollow.findMany({
      where: { userId },
      include: { hashtag: true },
    });
    for (const row of follows) tags.add(row.hashtag.tag);
    const authored = await this.prisma.postHashtag.findMany({
      where: { post: { authorId: userId } },
      include: { hashtag: true },
      take: 50,
    });
    for (const row of authored) tags.add(row.hashtag.tag);
    const appreciated = await this.prisma.postHashtag.findMany({
      where: { post: { appreciations: { some: { userId } } } },
      include: { hashtag: true },
      take: 50,
    });
    for (const row of appreciated) tags.add(row.hashtag.tag);
    return tags;
  }

  private async followedTags(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.hashtagFollow.findMany({
      where: { userId },
      include: { hashtag: true },
    });
    return new Set(rows.map((row) => row.hashtag.tag));
  }

  private async viewerPlaces(userId: string): Promise<Array<{ lat: number; lng: number }>> {
    const rows = await this.prisma.post.findMany({
      where: {
        authorId: userId,
        publishedAt: { not: null },
        deletedAt: null,
        place: { lat: { not: null }, lng: { not: null } },
      },
      include: { place: true },
      take: 50,
    });
    return rows
      .filter((row) => row.place?.lat != null && row.place.lng != null)
      .map((row) => ({ lat: row.place!.lat!, lng: row.place!.lng! }));
  }

  private async interactedAuthorIds(userId: string): Promise<Set<string>> {
    const [appreciations, comments] = await Promise.all([
      this.prisma.appreciation.findMany({ where: { userId }, select: { post: { select: { authorId: true } } } }),
      this.prisma.comment.findMany({
        where: { authorId: userId, deletedAt: null },
        select: { post: { select: { authorId: true } } },
      }),
    ]);
    const ids = new Set<string>();
    for (const row of appreciations) if (row.post.authorId !== userId) ids.add(row.post.authorId);
    for (const row of comments) if (row.post.authorId !== userId) ids.add(row.post.authorId);
    return ids;
  }

  private async secondDegreeAuthorIds(userId: string, excluded: string[]): Promise<Set<string>> {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId, status: 'accepted' },
      select: { followeeId: true },
    });
    const theirs = await this.prisma.follow.findMany({
      where: {
        followerId: { in: follows.map((row) => row.followeeId) },
        status: 'accepted',
        followeeId: { notIn: excluded },
      },
      select: { followeeId: true },
    });
    return new Set(theirs.map((row) => row.followeeId));
  }

  private async listTaggedPosts(
    hashtagId: string,
    viewerId: string | undefined,
    opts: { sort: 'top' | 'recent'; cursor?: string; limit: number },
  ) {
    const rows = await this.prisma.postHashtag.findMany({
      where: {
        hashtagId,
        post: { publishedAt: { not: null }, deletedAt: null, archivedAt: null },
      },
      include: { post: { include: POST_INCLUDE } },
    });
    return this.pagePosts(
      rows.map((row) => row.post),
      viewerId,
      opts,
    );
  }

  private async listPlacePosts(
    placeId: string,
    viewerId: string | undefined,
    opts: { sort: 'top' | 'recent'; cursor?: string; limit: number },
  ) {
    const rows = await this.prisma.post.findMany({
      where: { placeId, publishedAt: { not: null }, deletedAt: null, archivedAt: null },
      include: POST_INCLUDE,
    });
    return this.pagePosts(rows, viewerId, opts);
  }

  private async pagePosts(
    posts: Array<Parameters<PostsService['mapPost']>[0] & { publishedAt: Date | null; appreciations: { userId: string }[]; _count: { comments: number } }>,
    viewerId: string | undefined,
    opts: { sort: 'top' | 'recent'; cursor?: string; limit: number },
  ) {
    const visible = [];
    for (const post of posts) {
      try {
        visible.push({ post, card: await this.posts.mapPost(post, viewerId) });
      } catch {
        // not visible
      }
    }
    const now = new Date();
    visible.sort((a, b) => {
      if (opts.sort === 'top') {
        const sa = popularitySignal(a.post.appreciations.length, a.post._count.comments) * recencySignal(a.post.publishedAt ?? now, now);
        const sb = popularitySignal(b.post.appreciations.length, b.post._count.comments) * recencySignal(b.post.publishedAt ?? now, now);
        if (sb !== sa) return sb - sa;
      }
      const ta = (b.post.publishedAt?.getTime() ?? 0) - (a.post.publishedAt?.getTime() ?? 0);
      if (ta !== 0) return ta;
      return b.post.id.localeCompare(a.post.id);
    });
    const start = opts.cursor ? visible.findIndex((row) => row.post.id === opts.cursor) + 1 : 0;
    const slice = start < 0 ? visible.slice(0, opts.limit) : visible.slice(start, start + opts.limit);
    const last = slice[slice.length - 1];
    return {
      items: slice.map((row) => row.card),
      nextCursor: slice.length === opts.limit && last?.post.publishedAt ? encodeCursor(last.post.publishedAt, last.post.id) : null,
    };
  }

  private async publicHashtagCount(hashtagId: string): Promise<number> {
    return this.prisma.postHashtag.count({
      where: {
        hashtagId,
        post: { publishedAt: { not: null }, deletedAt: null, visibility: 'public' },
      },
    });
  }

  private async publicHashtagCountByTag(tag: string): Promise<number> {
    const hashtag = await this.prisma.hashtag.findUnique({ where: { tag } });
    return hashtag ? this.publicHashtagCount(hashtag.id) : 0;
  }

  private async rememberSearch(userId: string, query: string): Promise<void> {
    const q = query.trim().slice(0, 80);
    if (q.length < 2) return;
    await this.prisma.recentSearch.upsert({
      where: { userId_query: { userId, query: q } },
      create: { userId, query: q },
      update: { createdAt: new Date() },
    });
    const extra = await this.prisma.recentSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: RECENT_SEARCH_KEEP,
      select: { id: true },
    });
    if (extra.length) {
      await this.prisma.recentSearch.deleteMany({ where: { id: { in: extra.map((row) => row.id) } } });
    }
  }
}

function firstVariantKey(variants: unknown): string | null {
  if (!variants || typeof variants !== 'object') return null;
  const widths = (variants as { widths?: Record<string, { webp?: string }> }).widths;
  if (!widths) return null;
  const keys = Object.keys(widths).sort((a, b) => Number(a) - Number(b));
  const first = keys[0];
  return first ? (widths[first]?.webp ?? null) : null;
}

export type { PlacePreview };
