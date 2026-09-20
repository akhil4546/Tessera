# ADR 0006 — Rules-based Discover, Meilisearch, Memory Map

**Status:** Accepted  
**Date:** 2026-09-17

## Context

Phase 5 adds search, hashtags, places, a Memory Map, and a ranked Discover feed. The spec forbids a fake ranking and forbids cloning Instagram Explore.

## Decision

- **Ranking is rules-based.** Documented weights in `packages/media/src/ranking.ts`. User sliders on `RankingPreference` change those weights. Each served item stores the signals used on `DiscoverImpression`.
- **Search** uses Meilisearch when Compose is up (`people`, `hashtags`, `places`, `captions`) via HTTP (no SDK). Postgres `ILIKE` is the labelled fallback. Typo tolerance is Meili-only.
- **Places** are author-typed names with optional coordinates. GPS is never copied from EXIF. Place pages and Memory Map use those coordinates.
- **Memory Map** visibility (`Profile.memoryMapEnabled`) is independent of post audience. Pins still respect post visibility, blocks, and privacy.
- **Boards** in search return public Boards. Circle posts stay out of Discover.
- **Maps** are Tessera-styled equirectangular plots (no Google/Mapbox key).

## Consequences

- CI has Postgres only. Integration tests prove ranking and search against Postgres.
- Seed includes public posts from people Asha does not follow so Discover is not empty.
- An ML ranker can replace `scoreCandidate()` later without changing the impression contract.
