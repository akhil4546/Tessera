# ADR 0003 — Upload pipeline and inline fallback

**Status:** Accepted  
**Date:** 2026-09-17

## Context

Phase 2 needs presigned uploads, EXIF stripping, image variants, optional HLS, and hybrid feed fan-out. Local CI cannot assume MinIO, Redis, or FFmpeg.

## Decision

- **S3-compatible storage** (MinIO locally) via `@aws-sdk/client-s3`. Browser uploads use presigned PUT URLs.
- **`STORAGE_DRIVER=fs`** is a labelled test/CI driver, not a production stub. The API still runs the same process-media code.
- **BullMQ** on Redis for `tessera-media` and `tessera-feed`. If Redis is down or `MEDIA_PROCESS=inline`, the API processes jobs in-process and logs `INLINE_PROCESS` / `SOFT-FAIL`.
- **FFmpeg** is required for video. Missing FFmpeg marks the media `failed` with `FFMPEG_MISSING` — we do not silently accept unprocessed video.
- **Alt-text AI drafts** call SpaceXAI only when `XAI_API_KEY` is set. Otherwise `501 ALT_SUGGEST_NOT_CONFIGURED`. The alt-text prompt still exists.

## Consequences

- Production must set S3/MinIO and run `apps/worker`.
- When `STORAGE_DRIVER=fs`, `GET /v1/media/file/:key` requires an expiring HMAC (`exp` and `sig` over the object key) signed with `JWT_ACCESS_SECRET`. Unsigned keys are not readable. S3 reads stay on presigned URLs. Playlist rewrites carry the same expiry as the playlist URL.
- Seed and tests bake images with Sharp in-process.
- Circles, drafts, and scheduled posts ship in Phase 8. Media processing holds `scheduledAt` posts until the publish job.
