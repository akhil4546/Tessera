# ADR 0005 — Loops, original audio, and the wellbeing budget

**Status:** Accepted  
**Date:** 2026-09-17

## Context

Phase 4 adds short vertical videos (Loops). The spec forbids licensed music in v1, requires HLS, auto-captions, audio reuse, a full-screen player, and an optional daily watch budget.

## Decision

- **Loops are posts** with `kind=loop` plus a 1:1 `Loop` row (cover frame, overlays, caption job, clip recipe).
- **Original audio only.** There is no music catalogue. Creators can allow reuse of the AAC extracted from their Loop. Reuse muxes that track onto a new Loop and credits the source.
- **HLS** is composed by FFmpeg (360/720/1080). Missing FFmpeg fails the media row with `FFMPEG_MISSING` — never silently accepted.
- **Captions** are a pluggable speech-to-text job. Default is labelled `CAPTIONS_NOT_CONFIGURED` (`skipped`). `CAPTION_PROVIDER=fixture` is tests-only. `WHISPER_BIN` is reserved and currently labelled `WHISPER_NOT_WIRED`.
- **Wellbeing:** optional daily minutes on `WellbeingSetting`. Watch heartbeats write `WatchTimeLog`. At the budget the player shows a pause: stop, extend 10 minutes, or dismiss for the day.
- **Boards save** and **Circles** return labelled **501**.
- **Player** is Tessera’s vertical tile (sand/ink, labelled Appreciations), not an Instagram Reels clone.

## Consequences

- Seed Loops need FFmpeg. Without it, seed logs `FFMPEG_MISSING` and skips Loops.
- Worker must process `tessera-loops` in production. Local CI uses `MEDIA_PROCESS=inline`.
- Discover ranking of Loops remains Phase 5. The Following feed still includes Loops in chronological order.
