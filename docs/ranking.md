# Discover ranking

Specified in `tessera-build-prompt.md` §3.1 and §7.

v1 is **rules-based**. There is no ML model. `scoreCandidate()` in `packages/media/src/ranking.ts` is the swap point later.

## What Discover contains

Public, published posts and Loops from **outside** the viewer’s graph: not the viewer, not accepted follows, not blocked, not muted for posts, not private accounts. The Following feed stays reverse-chronological.

## Weights (Tune my Discover)

Stored on `RankingPreference`. Each slider is 0–1 and **multiplies** that term.

| Slider | Default | Term |
| --- | --- | --- |
| people I interact with | 0.5 | `1.2 × slider × interact` |
| new creators | 0.5 | `1.0 × slider × newCreator` |
| nearby | 0.5 | `1.0 × slider × nearby` |
| less video | 0 | `−1.5 × slider` if the item is a Loop |

Fixed (not sliders): topic match `1.0`, popularity `0.4`, recency `0.3`.

`interact` is 1 if the viewer appreciated or commented on that author, 0.55 if they are followed by someone the viewer follows. `newCreator` is 1 at ≤50 followers. `nearby` uses haversine from the viewer’s own located posts (author-typed places with coordinates — never EXIF GPS).

## Truth

Every ranked card writes a `DiscoverImpression` with the **signals that actually entered the sum** (zero-weight sliders are omitted). “Why am I seeing this?” reads that row. Changing sliders changes the next score.

## Search

Meilisearch indexes people, hashtags, places, captions, and public Boards (Compose). If Meilisearch is down or unset, search uses Postgres and the response sets `engine: "postgres"`. Circle-audience posts are not Discover candidates.
