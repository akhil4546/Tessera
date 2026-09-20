# ADR 0009 — Circles, Boards, drafts, scheduled posts

**Status:** Accepted  
**Date:** 2026-09-18

## Context

Phase 8 adds named audiences, collaborative collections, device-synced drafts, and scheduled publishing. Tessera must not clone Instagram Close Friends, Collections, or a single “saved” dump.

## Decision

- **Circles.** Multiple named audiences per owner. Membership is private to the owner — members never see the Circle name or that they were added. Any Post, Moment, or Loop can target Public, Followers, or one or more Circles. Fan-out writes `FeedEntry` rows to Circle members (even if they do not follow). Unfollow keeps Circle-shared posts; block removes membership both ways.
- **Boards.** Default private `Saved` board plus custom Boards. Visibility is private, shared (invited people can add after they accept), or public (followable and searchable). Invites emit `board_invite`. Loop and post save land on a Board.
- **Drafts.** JSON payloads stored per user, listed newest first, so web and mobile stay in sync. Publishing still goes through the create endpoints.
- **Scheduled posts.** `Post.scheduledAt` holds the go-live time. Media processing does not publish early. A BullMQ job (`tessera-scheduled`, every 30s) publishes due rows, fans out, and emits `scheduled_post_published` to the author.
- Prisma stays on **7.10**. Enum `circles` is added to `PostVisibility` / `MomentVisibility`.

## Consequences

- Discover, hashtag pages, and place pages stay public-only. Circle posts are not ranked.
- Meilisearch gains a `tessera_boards` index for public Boards; Postgres fallback searches title/description.
- Safety/admin (Phase 9) still owns reports and restrict.
