# ADR 0001 — Stack for Tessera v1

**Status:** Accepted  
**Date:** 2026-09-17

## Context

The build prompt specified Turborepo, pnpm, Next.js, Expo, NestJS, PostgreSQL/Prisma, Redis/BullMQ, MinIO, Meilisearch, and Mailpit. We needed to pin versions and fill in unspecified choices (test runner, CSS major, ORM major).

## Decision

- **Node 22 LTS**, **pnpm 9**, **Turborepo 2**.
- **Prisma 7.10 (stable)** when schema work starts in Phase 1, not Prisma 8 RC.
- **Vitest** instead of Jest.
- **Tailwind CSS v4** with semantic tokens in `packages/tokens`.
- **Custom UI** on Radix Slot, not shadcn's default look.
- **next-intl** (web) and a tiny catalog lookup (Expo) sharing `packages/i18n`.
- **pino** now. Sentry and OpenTelemetry are **config-gated no-ops** until Phase 11.
- **SpaceXAI (`XAI_API_KEY`, `https://api.x.ai/v1`)** for later AI features (alt-text drafts). Not called in Phase 0.
- **Mobile** is an Expo Router tab shell only. No Maestro/Detox in CI yet.

## Consequences

- Prisma 8 can be adopted after GA via the official upgrade recipe.
- Auth is custom NestJS in Phase 1 (no Clerk/Auth0).
- Shared packages are consumed as TypeScript source (`transpilePackages` on Next; Metro watchFolders on Expo; `tsx` for Nest in Phase 0).
- Filled-button `accent` is `#B04732`, a darker shade of terracotta `#C8553D`, so sand-coloured label text meets WCAG AA. Raw terracotta remains the palette token for decorative tiles.
