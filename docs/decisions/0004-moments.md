# ADR 0004 — Moments, Keep, and expiry

**Status:** Accepted  
**Date:** 2026-09-17

## Context

Phase 3 adds 24-hour Moments with stickers, a Home tray, a viewer, and Reel Shelves. They must not clone Instagram’s story rings or hidden archives.

## Decision

- **Tiles, not rings.** The tray is a row of rounded tiles with a terracotta stroke for unseen, a quiet border for seen, and the author’s own tile first.
- **Expiry is a real job.** BullMQ queue `tessera-moments` runs `expire-moments` every 60 seconds. Tray reads also expire due rows so tests and Redis-less local dev still work (logged as `INLINE_PROCESS` / `SOFT-FAIL`).
- **Keep vs vanish.** Before `expiresAt`, the author can Keep a Moment onto a named Reel Shelf. After expiry: Kept rows stay for the shelf; if `momentArchiveEnabled` the author keeps a private archive; otherwise the Moment (and unreferenced media) is deleted. There is no silent archive.
- **Circles** are a Phase 8 audience (`circleIds`). Link stickers require Creator or Business accounts (`LINK_NOT_ELIGIBLE`).
- **Video segments** are 30 seconds max (`MAX_MOMENT_VIDEO_DURATION_MS`), separate from 60-second post video.

## Consequences

- Seed Asha mutes Kenji for Moments only and now follows him, so his posts could appear later while his Moments stay out of her tray.
- Worker must process `tessera-moments` in production. Local CI uses inline expiry.
