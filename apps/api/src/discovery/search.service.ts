import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  SEARCH_INDEXES,
  ensureSearchIndexes,
  indexPublishedPost,
  indexUserProfile,
  meiliAvailable,
  meiliSearch,
} from '@tessera/media';
import type { SearchEngine } from '@tessera/types';
import { PrismaService } from '../prisma/prisma.service.js';

export type RawSearchHits = {
  engine: SearchEngine;
  peopleIds: string[];
  hashtagTags: string[];
  placeIds: string[];
  postIds: string[];
  boardIds: string[];
};

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly log = new Logger(SearchService.name);
  private meiliReady = false;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    this.meiliReady = await ensureSearchIndexes();
    if (this.meiliReady) {
      this.log.log('Meilisearch indexes ready (people, hashtags, places, captions, boards).');
    } else {
      this.log.warn('SOFT-FAIL: Meilisearch is down or unset. Search uses Postgres (no typo tolerance).');
    }
  }

  async engine(): Promise<SearchEngine> {
    if (this.meiliReady && (await meiliAvailable())) return 'meilisearch';
    this.meiliReady = false;
    return 'postgres';
  }

  async search(q: string, limit: number): Promise<RawSearchHits> {
    const engine = await this.engine();
    if (engine === 'meilisearch') {
      const [people, hashtags, places, captions, boards] = await Promise.all([
        meiliSearch(SEARCH_INDEXES.people, q, limit),
        meiliSearch(SEARCH_INDEXES.hashtags, q, limit),
        meiliSearch(SEARCH_INDEXES.places, q, limit),
        meiliSearch(SEARCH_INDEXES.captions, q, limit),
        meiliSearch(SEARCH_INDEXES.boards, q, limit),
      ]);
      if (people && hashtags && places && captions && boards) {
        return {
          engine,
          peopleIds: people.map((hit) => hit.id),
          hashtagTags: hashtags.map((hit) => String(hit.tag ?? hit.id)),
          placeIds: places.map((hit) => hit.id),
          postIds: captions.map((hit) => hit.id),
          boardIds: boards.map((hit) => hit.id),
        };
      }
      this.meiliReady = false;
      this.log.warn('SOFT-FAIL: Meilisearch search failed. Falling back to Postgres.');
    }
    return this.postgresSearch(q, limit);
  }

  async indexPost(postId: string): Promise<void> {
    await indexPublishedPost(this.prisma, postId);
  }

  async indexUser(userId: string): Promise<void> {
    await indexUserProfile(this.prisma, userId);
  }

  async reindexAll(): Promise<{ people: number; posts: number }> {
    const users = await this.prisma.user.findMany({
      where: { deactivatedAt: null, suspendedAt: null, isMinor: false, profile: { isNot: null } },
      select: { id: true },
    });
    for (const user of users) await this.indexUser(user.id);
    const posts = await this.prisma.post.findMany({
      where: { publishedAt: { not: null }, deletedAt: null },
      select: { id: true },
    });
    for (const post of posts) await this.indexPost(post.id);
    return { people: users.length, posts: posts.length };
  }

  private async postgresSearch(q: string, limit: number): Promise<RawSearchHits> {
    const term = q.replace(/[%_]/g, '').trim();
    const [people, hashtags, places, captions, boards] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          deactivatedAt: null,
          suspendedAt: null,
          isMinor: false,
          OR: [
            { handle: { contains: term, mode: 'insensitive' } },
            { profile: { displayName: { contains: term, mode: 'insensitive' } } },
            { profile: { bio: { contains: term, mode: 'insensitive' } } },
          ],
        },
        take: limit,
        orderBy: { handle: 'asc' },
        select: { id: true },
      }),
      this.prisma.hashtag.findMany({
        where: { tag: { contains: term.replace(/^#/, ''), mode: 'insensitive' } },
        take: limit,
        orderBy: { tag: 'asc' },
        select: { tag: true },
      }),
      this.prisma.place.findMany({
        where: {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { slug: { contains: term.replace(/\s+/g, '-'), mode: 'insensitive' } },
          ],
        },
        take: limit,
        orderBy: { name: 'asc' },
        select: { id: true },
      }),
      this.prisma.post.findMany({
        where: {
          publishedAt: { not: null },
          deletedAt: null,
          archivedAt: null,
          visibility: 'public',
          caption: { contains: term, mode: 'insensitive' },
          author: { deactivatedAt: null, suspendedAt: null, isMinor: false, profile: { is: { isPrivate: false } } },
        },
        take: limit,
        orderBy: { publishedAt: 'desc' },
        select: { id: true },
      }),
      this.prisma.board.findMany({
        where: {
          visibility: 'public',
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      }),
    ]);
    return {
      engine: 'postgres',
      peopleIds: people.map((row) => row.id),
      hashtagTags: hashtags.map((row) => row.tag),
      placeIds: places.map((row) => row.id),
      postIds: captions.map((row) => row.id),
      boardIds: boards.map((row) => row.id),
    };
  }
}
