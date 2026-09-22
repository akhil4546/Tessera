# Improvement Prompt: Tessera — Hardening, Correctness & Production Readiness

> Companion to [`tessera-build-prompt.md`](./tessera-build-prompt.md). That file described what to **build**. This file describes what to **fix, finish and harden** in the code that now exists. Copy everything below the line into your AI coding tool.

---

## 1. Role and working agreement

You are a senior full-stack engineer taking over an existing codebase. Tessera is a pnpm + Turborepo monorepo (`apps/web`, `apps/mobile`, `apps/api`, `apps/worker`, `apps/admin`, plus nine shared `packages/`) implementing a photo and video social platform. Phases 0–9 of the original build prompt are implemented. Phase 10 (creator tools) and Phase 11 (hardening) are not.

Rules for how you work:

1. **Work in the priority order in Section 3 (P0 → P4).** Do not start a lower band until the band above it is green in CI.
2. **Every change ships with a test that fails before it and passes after it.** No exceptions for "obvious" fixes.
3. **Never silently stub.** The codebase has a strong existing convention of labelling degraded paths (`SOFT-FAIL:`, `NOT_CONFIGURED`, `// labelled, not stubbed`). Keep it. If you cannot finish something, leave a labelled error, not a lie.
4. **Do not change the data model, auth model, or a third-party dependency that costs money without asking first.** Migrations are committed and forward-only.
5. **Keep the product identity intact.** Chronological-first, finish lines, private Appreciations, mosaic profiles, Circles, Moments, Boards, Loops budget, Memory Map, authenticity labels, unified Inbox. This is not an Instagram clone; do not "simplify" toward one.
6. At the end of each numbered workstream: stop, summarise, list what is incomplete or assumed, give commands to verify, and wait for go-ahead.
7. **Commit and push after every numbered item.** When an item such as 3.1.1 is finished — the regression test passes, and any doc the change requires is updated — commit only that item's changes and push them to `main` before starting the next item. Do not leave finished work uncommitted, and do not batch several items into one commit. The message should name the item and what it fixes. Then summarise and wait for go-ahead before the next item, unless the user has already said to continue.

## 2. Establish ground truth first

Before changing anything, run these and record the output — several of them currently pass for the wrong reasons:

```bash
pnpm install
pnpm compose:up && pnpm db:deploy && pnpm seed
pnpm lint          # currently a no-op — see 3.2.1
pnpm typecheck
pnpm test
pnpm e2e
```

Then produce a short baseline report: what actually executes, what is vacuous, and current timings. You will be held to it.

## 3. Workstreams

### 3.1 — P0: Correctness and security defects

These are confirmed defects in the current tree, not speculation. Fix each, with a regression test.

**3.1.1 — Following feed pagination is a no-op.**
`apps/api/src/posts/feed.service.ts` — `following()` accepts `opts.cursor` in its signature (line ~15), `feed.controller.ts` passes it through, and the method returns a `nextCursor` — but the cursor is **never referenced in any query**. Every page after the first re-fetches the same window. The three queries in the method (`feedEntry` `take: 200`, circles `take: 80`, high-follower merge `take: 80`) are hard-capped and merged in memory, so the feed is also silently truncated at ~360 candidate rows regardless of what the user asks for.

Fix: apply `cursorWherePublished()` (already exists in `apps/api/src/common/pagination.ts` and is used correctly by `inbox.service.ts` and `notifications.service.ts`) to every branch; derive `take` from `opts.limit` with a small overfetch rather than fixed constants; add an integration test that walks three pages and asserts zero overlap and correct ordering across the fan-out / circles / high-follower merge boundary.

**3.1.2 — `GET /v1/media/file/:key` is unauthenticated.**
`apps/api/src/media/media.controller.ts` (~line 64). Every other route on that controller has `@UseGuards(AuthGuard)`; this one has none. It serves any object by key, with no ownership or visibility check, and no expiry. It is the entire media read path when `STORAGE_DRIVER=fs` (CI, Playwright, and any deployment not using S3), and `StorageService.signGet()` returns this bare path in that mode — so "signed, expiring media URLs for non-public content" (original spec §8) is not satisfied there.

Fix: require a signed, expiring token on the fs path (HMAC over `key + exp`, verified in the controller) **or** gate the route behind `AuthGuard` plus the same `canViewPost` visibility check the post routes use. Keep the existing `..` traversal guard and the `.m3u8` rewrite behaviour. Test: an anonymous request for a followers-only author's media key must 404/403; the owner's request must succeed; an expired token must fail.

**3.1.3 — Idempotency is implemented on two endpoints out of many.**
`IdempotencyRecord` exists in the schema and is honoured by `POST /v1/posts` and `POST /v1/loops` only. The original spec calls for idempotency keys on create endpoints generally. Moments, messages, comments, boards, reports and appreciations can all double-fire from the mobile outbox (`apps/mobile/src/outbox.ts` retries) or a flaky network.

Fix: extract the duplicated lookup/record logic out of `posts.service.ts` and `loops.service.ts` into a single reusable helper (e.g. `apps/api/src/common/idempotency.ts`) or a Nest interceptor keyed on `userId + key + route`, and apply it to every non-GET create route. Add a TTL/cleanup job — the table currently grows forever.

**3.1.4 — Rate limiting is not correct under multiple instances and returns no `Retry-After`.**
`apps/api/src/common/rate-limit.ts` falls back to a per-process `Map` whenever Redis is absent or errors once (`redisDisabled` latches to `true` permanently and never retries). With N API instances that is an N× effective limit. The Redis path also uses `INCR` + `EXPIRE` as two round trips, which can leak a key without TTL if the process dies between them.

Fix: make the Redis path a single atomic Lua script or `SET NX PX` + `INCR`; add a circuit breaker that retries Redis after a backoff instead of latching off forever; emit `429` with a `Retry-After` header and the remaining window; log a loud warning when running degraded. Keep the in-memory fallback for local dev, but label it as non-authoritative.

**3.1.5 — Auth hot path does two uncached database round trips per request.**
`apps/api/src/auth/auth.guard.ts` queries `session` then `user` on every authenticated request. The original architecture called for Redis-backed sessions. At feed-load fan-out (web fires many parallel requests, all client-side) this is the single hottest query pair in the system.

Fix: cache the session + account-status tuple in Redis keyed by `sid` with a short TTL (≤ 60s) and explicit invalidation on logout, session revoke, suspend and delete. Fall back to Postgres when Redis is down. Do not cache longer than the access-token TTL.

**3.1.6 — One JWT secret signs every token type; no rotation path.**
`apps/api/src/auth/tokens.ts` — user access, admin access, 2FA challenge, OAuth state and OAuth setup tokens are all HS256 over `JWT_ACCESS_SECRET`. Separation currently rests entirely on the `iss` claim and a `purpose` field. The admin app and the public app therefore share a signing key.

Fix: at minimum give the admin issuer its own secret (`JWT_ADMIN_SECRET`) and give short-lived purpose tokens their own. Add a `kid` header and support verifying against a previous key so secrets can be rotated without logging everyone out. Fail fast at boot if any required secret is missing or under 32 chars (the current check only runs lazily, at first sign).

**3.1.7 — Health check reports static, stale truth.**
`apps/api/src/health/health.service.ts` returns a hardcoded `{ status: 'ok', phase: 7 }` — it never touches Postgres, Redis, storage or Meilisearch, and the phase number disagrees with the README (9). Playwright uses this endpoint as its readiness gate, so E2E can start against a half-dead API.

Fix: split `/health` (liveness, static, fast) from `/health/ready` (checks DB connectivity, Redis, storage bucket, search — each reported individually with a per-check timeout and overall degraded status). Point Playwright's `webServer.url` at readiness. Drop the hardcoded phase or derive it from package metadata.

### 3.2 — P1: Engineering hygiene that CI currently fakes

**3.2.1 — There is no linter. At all.**
Every package's `lint` script is `echo "lint: @tessera/<name>"`. There is no `.eslintrc*` and no `eslint.config.*` anywhere in the repo. `pnpm lint` in CI is a guaranteed pass that checks nothing.

Fix: add a flat ESLint config at the root with `typescript-eslint` (type-aware), plus `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y` for `apps/web`, `apps/admin` and `packages/ui`, `eslint-plugin-import` for boundary rules (nothing in `packages/*` may import from `apps/*`), and Nest-appropriate rules for `apps/api`. Wire real `lint` scripts in every workspace. Expect a large first-run diff — land it as a single mechanical commit, then a second commit for genuine findings. Enable `--max-warnings 0` in CI only after the tree is clean.

**3.2.2 — Formatting is checked nowhere.**
`format:check` exists in the root `package.json` but is absent from `.github/workflows/ci.yml`. Add it.

**3.2.3 — No dependency or secret scanning.**
The original spec requires dependency scanning in CI. `.github/` contains exactly one workflow and no Dependabot config. Add: Dependabot (or Renovate) for pnpm and GitHub Actions; `pnpm audit --audit-level high` as a CI job; CodeQL for JS/TS; a secret scanner (gitleaks) — the repo commits real-looking dev credentials in `.env.example` and `docker-compose.yml`, so tune it rather than letting it cry wolf.

**3.2.4 — No coverage measurement.**
63 test files exist and the business logic in `packages/media` and `packages/validation` is genuinely well covered, but no `vitest.config.ts` enables coverage, so nobody knows where the holes are. Add `@vitest/coverage-v8`, publish the report as a CI artifact, and set a ratchet (coverage may not drop) rather than an arbitrary percentage target.

**3.2.5 — CI runs a single job on a single browser against a dev server.**
`apps/web/playwright.config.ts` boots `next dev` — so E2E validates the development bundle, not what production serves. `projects` contains chromium only; `fullyParallel: false` means the suite is serial. And the whole pipeline is one `check` job, so a Playwright flake blocks the unit-test signal.

Fix: split CI into parallel jobs (lint / typecheck / unit / api-integration / e2e / build). Run E2E against `next build && next start`. Add at least WebKit (Safari is the dominant mobile browser for this product category). Cache Playwright browsers. Upload traces and the HTML report on failure.

**3.2.6 — The mobile app has no tests and no CI presence.**
`apps/mobile` has `"test": "echo \"no mobile tests in Phase 2\""` and `"build": "echo \"...skipped in Phase 0\""` — both stale by seven phases. Add Jest + React Native Testing Library for `apps/mobile/src/*` (`outbox.ts`, `session.ts`, `api.ts` and `push.ts` are pure-ish logic and the highest-value targets), plus a Maestro smoke flow (launch → login → feed) as the original spec called for. At minimum, make `typecheck` run in CI and stop the `build` script from lying.

**3.2.7 — The "typed client" is hand-maintained, not generated.**
`packages/api-client/src/client.ts` is ~1000 hand-written lines mirroring the API surface. The original spec called for a client generated from the published OpenAPI spec. Today, adding an API route and forgetting the client compiles fine and fails at runtime.

Fix: emit the OpenAPI document to a committed artifact during build, generate types from it, and have the hand-written ergonomic wrapper consume the generated types. Add a CI check that fails when the committed spec drifts from the code.

### 3.3 — P2: Performance and scalability

**3.3.1 — Feed serialisation is N+1 on storage signing.**
`FeedService.following()` ends with `for (const post of sliced.visible) { items.push(await this.posts.mapPost(post, userId)) }` — strictly serial. Each `mapPost` (`apps/api/src/posts/posts.service.ts` ~line 500) awaits `storage.signGet()` for the author avatar, plus one per media item inside `media.toView()`, plus two more for Loops (audio + captions + audio owner avatar). A 20-post feed with carousels issues well over a hundred sequential signing calls. The 300ms p95 target in the original spec §8 is not reachable this way.

Fix: parallelise with `Promise.all`; batch and memoise signed URLs per request (the same avatar is signed repeatedly for the same author); cache signed URLs in Redis keyed by `key + rounded-expiry` so repeated feed loads reuse them. Then add a load-test script (k6 or autocannon) with a documented p95 budget, per original spec §11, and run it against seed data.

**3.3.2 — Visibility checks are per-post round trips.**
`PostsService.assertVisible()` runs `isBlockedEitherWay`, a `follow.findUnique` and `viewerInPostCircles` — three queries per post. Fine for a detail page, wasteful anywhere a list is involved.

Fix: hoist the viewer's block set, follow set and circle-membership set into a single per-request context object resolved once, and pass it to the pure `canViewPost` helper in `packages/media`. The pure function is already correctly separated — only the data loading needs batching.

**3.3.3 — Feed candidate generation is bounded by magic numbers.**
`take: 200` / `take: 80` / `take: 80` in `feed.service.ts` and the in-memory `Map` merge do not scale with follow-graph size and silently change behaviour as a user follows more accounts. Replace with cursor-driven windows (see 3.1.1) and document the fan-out threshold (`highFollowerAuthorIds` in `packages/media`) in `docs/architecture.md` with the number it actually uses.

**3.3.4 — Services have outgrown single files.**
`apps/api/src/inbox/inbox.service.ts` is 1,238 lines; `moments.service.ts` 865; `discovery.service.ts` 707; `posts.service.ts` 658. The mapper/rules split (`*.mapper.ts`, `*.rules.ts` with colocated unit tests) is a good existing pattern — extend it. Split each of these into a thin orchestration service plus pure rule modules and query modules. Do this **only** where a test already pins the behaviour, and do not mix refactors with fixes in the same commit.

**3.3.5 — Index review against real query shapes.**
73 models, 94 `@@index` declarations, 9 migrations. Run `EXPLAIN ANALYZE` over the feed, Discover, Inbox and notification queries at ~50× seed volume, and add a seed mode that generates that volume. Confirm the composite indexes the original spec called for — `(authorId, publishedAt DESC)` on Post, `(userId, createdAt DESC)` on FeedEntry — exist and are actually chosen by the planner.

### 3.4 — P3: Web, mobile and admin clients

**3.4.1 — `apps/web` is a client-side SPA wearing a Next.js App Router costume.**
46 of ~62 source files are `'use client'`, and all data fetching goes through `apps/web/src/lib/api.ts` (itself `'use client'`) directly from the browser to `:3001`. Consequences: no server rendering of content, no SEO, no social previews, a slower first contentful paint than the original spec's 2s target, and the API's CORS surface exposed to every visitor.

Fix, in order: (a) add `generateMetadata` with Open Graph tags to `/p/[id]`, `/u/[handle]`, `/h/[tag]` and `/places/[slug]` — the original spec §5.3 explicitly requires an OG preview page and there is currently **zero** `generateMetadata` or `openGraph` usage in the app; (b) move read-only initial loads for feed, profile and post pages into server components that call the API server-side, hydrating TanStack Query with the result; (c) keep interactive surfaces (Loops player, Inbox, create flow) client-side.

**3.4.2 — No Content-Security-Policy on the web app.**
`apps/web/next.config.ts` sets `transpilePackages` and the next-intl plugin, and nothing else. The API sends `helmet()` defaults; the web app sends no security headers at all. The original spec §8 requires a CSP.

Fix: add a `headers()` block (or middleware) with CSP, `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy` and HSTS. Use a nonce-based script policy. Do the same for `apps/admin` — a staff console with takedown and suspension powers deserves a stricter policy than the public app.

**3.4.3 — Blurhash is computed, stored, and then thrown away.**
Credit where due: `apps/web/src/components/post-media.tsx` is hand-rolled but correct — a `<picture>` with AVIF and WebP `srcSet` from the stored 150/320/640/1080 variants, real `sizes`, explicit `width`/`height`, and `loading="lazy"`. It satisfies the original spec §8 responsive-image requirement without `next/image`. Leave it alone unless you have a reason.

What is broken is the placeholder. The only use of `item.blurhash` is:

```tsx
style={item.blurhash ? { background: 'var(--tessera-surface-muted)' } : undefined}
```

— which resolves to the same muted surface whether the blurhash exists or not, and sits in the *no-image* branch where it can never improve a real load anyway. The worker computes a blurhash for every image and nothing ever renders it. The original spec §4 requires blurhash placeholders for media.

Fix: decode the blurhash to a data URI (or a tiny canvas) and render it as the `<img>` background so it shows during load, then fades out on `onLoad` (respecting `prefers-reduced-motion`). Also reconsider the blanket `object-cover` on both the `<img>` and the `<video>` — it centre-crops everything, which directly contradicts the mosaic's promise to respect each photo's aspect ratio (see 3.5.4). Finally, `'Processing…'`, `'Photo'` and `'Video'` are hardcoded English in this component; route them through next-intl like the rest of the app.

**3.4.4 — Accessibility is asserted, not verified.**
The original spec targets WCAG 2.2 AA. `packages/tokens` has genuine contrast tests — good. But `packages/ui` has only 15 `aria-*`/`role` attributes across 20 components, and no automated a11y assertion runs anywhere.

Fix: add `@axe-core/playwright` to the E2E suite and assert zero serious/critical violations on every route it already visits; add `jest-axe`-style checks to `packages/ui` component tests; audit focus management in the modal-like surfaces (`why-sheet.tsx`, `report-dialog.tsx`, `moment-viewer.tsx`, `sensitive-gate.tsx`) for focus trap, restore-on-close and Escape; verify the 44pt touch-target minimum; verify `prefers-reduced-motion` is honoured by the motion tokens; verify the Loops player is keyboard-operable and its captions are exposed.

**3.4.5 — i18n is one language and untested for RTL.**
`packages/i18n/src/en.ts` is 582 lines, and 43 web files use `useTranslations`/`getTranslations` — the plumbing is real. But there is only an English catalog, no RTL support (the original spec §4 requires it), no locale-aware date/number formatting audit, and no check for hardcoded strings.

Fix: add a lint rule or test that fails on literal user-facing strings in JSX; add a pseudo-locale (`en-XA`) and an RTL locale to CI so layout breakage surfaces without a translator; route all date/number formatting through `Intl` with the active locale; confirm `dir="rtl"` flows through the app shell and the mosaic/masonry layouts.

**3.4.6 — Mobile is a thin shell against a full-featured API.**
`apps/mobile` has 5 tabs plus 9 routes, ~10 source files. Web has 30+ pages. There is no push-notification registration test, the offline outbox has no retry-exhaustion path, and `expo-notifications` is shimmed via a local `.d.ts`. Decide explicitly: either bring mobile to parity with a stated feature subset, or document the gap in the README so it stops reading as complete.

**3.4.7 — Admin app has no tests of its own.**
`"test": "echo \"admin coverage is API integration + the authenticated UI\""`. The API side is covered by `admin.int.spec.ts`, but the UI that staff use to take down content and suspend accounts has no test at all. Add E2E covering: staff login (distinct session from the public one), queue triage, takedown, suspend, appeal decision, and an assertion that every one of those writes an `AuditLog` row.

### 3.5 — P2: Design system and visual craft

The visual foundation is better than most codebases at this stage: a warm, committed palette that is genuinely not a gradient-era Instagram pastiche; semantic tokens rather than raw hex at call sites; a real contrast test suite in `packages/tokens`; `motion-safe:` on the skeleton pulse and reduced-motion handling that zeroes the duration variables; `min-h-11`/`h-11 w-11` giving true 44px touch targets on `Button` and `IconButton`; and a correct blocking inline theme script in `apps/web/src/app/layout.tsx`, so there is no dark-mode flash. The problems are that the system is **duplicated, undersized, and unverified**.

**3.5.1 — Tokens exist twice, and the copy the web app actually uses is unguarded.**
`packages/tokens/src/semantic.ts` defines the values in TypeScript. `packages/tokens/src/theme.css` re-declares all 17 of them by hand as CSS custom properties. Nothing generates one from the other.

Consumption is split down that seam: `apps/mobile/src/theme.ts` imports `lightSemantic`/`darkSemantic` from the TS source, while `apps/web` and `apps/admin` import `theme.css`. So editing `semantic.ts` silently restyles mobile and leaves web unchanged — and `tokens.test.ts`, including every contrast assertion, validates only the TS side. The tests guard the copy the web app does not use.

Fix: make `theme.css` a build artifact generated from `semantic.ts` (plus `shape.ts`, `motion.ts`, `typography.ts`), with a CI check that fails if the committed file is stale. One source of truth, generated downward.

**3.5.2 — The contrast suite tests four pairs and misses the failing ones.**
`tokens.test.ts` asserts `textPrimary`-on-`surface` and `textInverse`-on-`accent`, light and dark. Those pass. Computing the pairs it does *not* test, against the light theme:

| Pair | Ratio | AA requirement | Result |
| --- | --- | --- | --- |
| `moss` on `surface` | **4.39** | 4.5 (text) | **fails** |
| `moss` on `surfaceMuted` | **3.87** | 4.5 (text) | **fails** |
| `border` on `surface` | **1.32** | 3.0 (non-text, WCAG 1.4.11) | **fails** |
| `borderStrong` on `surface` | **1.68** | 3.0 (non-text) | **fails** |
| `accent` on `surface` | 4.76 | 4.5 | passes, barely |

`moss` is one of the five brand colours and is not safe as text on either light surface. The border failures matter because `border-border` is the visible edge of `Tile` and the resting edge of `TextField` — at 1.32:1 the input boundary is invisible to a low-vision user, and `TextField`'s focus style moves to `border-border-strong` (1.68:1) plus a ring, so the ring is doing all the work.

Fix: darken `moss` for light-theme text use (or split into `moss` / `mossText`); raise `borderStrong` to ≥3:1 against `surface` and use it wherever a border identifies a control; then extend `tokens.test.ts` to assert *every* foreground/background pair the components actually combine, not a hand-picked four. Generate the matrix from the component usage rather than listing it manually, so new combinations cannot slip through untested.

**3.5.3 — `packages/ui` is too small to cover the app, so the hard components are one-offs.**
Twelve exports, all primitives and layout: `Button`, `IconButton`, `Tile`, `TextField`, `TextArea`, `Skeleton`, `EmptyState`, `ErrorState`, `CreateButton`, `NavRail`/`BottomNav`/`AppShell`, `ThemeProvider`/`ThemeToggle`, `Wordmark`, icons. There is no Dialog, Sheet, Popover, Menu, Tabs, Select, Switch, Checkbox, Avatar, Badge, Toast or Spinner. The only Radix dependency is `@radix-ui/react-slot` — the headless primitives that would supply focus management for free are not installed.

The consequence is that every overlay in the product is hand-built inside `apps/web/src/components`, cannot be reused by `apps/admin`, and is individually wrong in a different way:

- `why-sheet.tsx` sets `role="dialog"` and `aria-modal="true"` — then never moves focus into the dialog, never traps it, never restores it on close, and has no Escape handler. Because `aria-modal="true"` hides the rest of the page from assistive tech while focus is still outside it, a screen-reader user is stranded. Dismissal is an `onClick` on a non-interactive backdrop `<div>`, so there is no keyboard path to close it at all.
- `report-dialog.tsx` is called a dialog but is really an inline disclosure: no `role`, no `aria-expanded` on its toggle, no focus movement.
- `moment-viewer.tsx`, `sensitive-gate.tsx` and the create flow each re-solve overlay behaviour again.

Fix: adopt the Radix primitives (`react-dialog`, `react-popover`, `react-dropdown-menu`, `react-tabs`, `react-select`, `react-switch`) and wrap them once in `packages/ui` with Tessera styling — focus trap, restore, Escape and scroll-lock come with them. Then migrate every web overlay onto the shared components and delete the bespoke versions. Add the missing feedback primitives (`Toast`, `Spinner`, `Badge`, `Avatar`) while you are there; the app currently renders raw `<p>Loading…</p>` in several places.

**3.5.4 — The mosaic — the product's signature screen — is the least considered layout.**
`apps/web/src/components/mosaic-grid.tsx` is a fixed `grid-cols-4` at every breakpoint, with hero and standard tiles sized by hardcoded `minHeight: 280` and `120` pixels, and `object-cover` on the media. The original spec §3.4 defines the mosaic as "a mixed-size masonry layout that **respects each photo's aspect ratio**" — the current implementation crops every photo to a fixed box, which is the one thing it was specified not to do. On a 360px phone, a 2-column hero is roughly 170px wide and 280px tall: a forced 0.6 portrait crop of whatever was uploaded.

Fix: drive tile height from the stored `aspect` on `MediaItem` via CSS `aspect-ratio`, keep the 2×2 hero span as a *span* rather than a pixel height, and make the column count responsive (2 on mobile, 3–4 on tablet, 4+ on desktop). `mosaicSpan` already exists in `packages/media` — extend that pure function to return an aspect-aware span and unit-test it, rather than encoding layout maths in the component.

**3.5.5 — No visual regression testing, and almost no component testing.**
`packages/ui` ships one test file (`button.test.tsx`) for twenty components. There is no Storybook, no Chromatic, no Percy, no screenshot baseline anywhere in the repo. A token change — the very thing 3.5.1 makes risky — has nothing to catch it.

Fix: add Storybook for `packages/ui` with a story per component covering each variant, state and both themes; wire Playwright screenshot assertions (or Chromatic) over those stories as the visual baseline; assert light and dark, LTR and RTL, and a large-text setting in the same matrix.

**3.5.6 — The design system has no documentation and no usage rules.**
`docs/` covers architecture, data model, API and ranking, plus ten ADRs — but nothing on design. Nothing records why `accent` is `#B04732` rather than the brand `terracotta` `#C8553D` (it is darkened for AA on filled buttons — the reasoning survives only as a comment in `semantic.ts`), when to use `moss` versus `slate`, what the spacing rhythm is, or which motion duration applies to what. There is also no spacing scale, type scale, z-index scale or breakpoint token at all: `typography.ts` defines two font families and no sizes, weights or line-heights, so every component hardcodes Tailwind steps (`text-2xl`, `tracking-[0.18em]`, `z-40`) with no shared rhythm.

Fix: add the missing scales as tokens; write `docs/design-system.md` covering palette rationale, semantic token usage rules, the type and spacing scales, motion guidance, and the accessibility floor (AA, 44px targets, reduced motion, focus visibility); and add an ADR recording the accent-darkening decision so nobody "fixes" it back to the brand colour.

**3.5.7 — The admin app is permanently English and visually unowned.**
`apps/admin` imports the raw catalog (`import { en } from '@tessera/i18n'`) instead of using next-intl like the web app, including the tell-tale `en.common?.loading ?? 'Loading…'` — an optional chain falling back to a hardcoded string for a key that may not exist. It also reuses only `Button`, `Tile`, `TextField`, `TextArea` and `EmptyState`, and builds its tables and case views ad hoc.

Fix: move admin onto next-intl for consistency (even if English stays the only catalog), and give it the dense data-table, filter-bar and detail-pane components a moderation console needs — as shared `packages/ui` components where they generalise, since the creator dashboard in 3.6.4 will want the same building blocks.

### 3.6 — P4: Operations, observability and the unfinished phases

**3.6.1 — Observability is a labelled no-op.**
`apps/api/src/observability.ts` prints console messages and wires nothing, exactly as its comment says. Pino structured logging works; there are no traces, no metrics, no error reporting.

Fix (Phase 11 as originally scoped): wire OpenTelemetry with auto-instrumentation for HTTP, Prisma, Redis and BullMQ; propagate trace context from web → API → worker; wire Sentry for API, worker, web and admin with release tagging and PII scrubbing; expose Prometheus metrics (request duration by route, queue depth and job latency per queue, rate-limit rejections, media processing success/failure by stage). Add a correlation ID that appears in every log line and is returned in a response header.

**3.6.2 — Jobs have no dead-letter visibility.**
The original spec §8 requires retries with backoff and a dead-letter queue **with an admin view**. `QueueService` covers seven queues and falls back to inline processing when Redis is down (labelled — good), but there is no DLQ inspection UI. Add one to `apps/admin`: failed jobs by queue, payload, error, retry count, and a manual requeue action that writes to the audit log.

**3.6.3 — No deployment story at all.**
No Dockerfiles, no production compose, no IaC, no runbook — the README says production notes land in Phase 11 and they haven't. Deliver: multi-stage Dockerfiles for api / worker / web / admin (note that api and worker currently run via `tsx` on TypeScript source, including workspace packages — decide whether to ship compiled output and change `build` accordingly, since `apps/api`'s `build` is currently `tsc --noEmit`); a production compose or Helm chart; documented env matrix per environment; migration strategy including expand/contract for zero-downtime deploys; backup and restore procedure for Postgres and object storage, **tested**; a rollback runbook.

**3.6.4 — Phase 10 (creator tools) is unbuilt.**
`AccountType` exists in the schema and gates exactly one thing (link stickers in Moments). `InsightDaily` — named in the original spec's data model — does not exist. Build: the insights aggregation job, the creator dashboard (reach, impressions, profile visits, follower growth, Appreciation breakdown, top posts, audience locations and active hours), per-post insights, and business contact buttons. Honour the privacy-safe minimum thresholds the original spec §5.11 requires — do not display a metric below the threshold, and say so in the UI rather than showing zero.

**3.6.5 — Finish the security review the original spec asked for.**
Beyond the P0 items: verify CSRF coverage is complete (the current check in `apps/api/src/main.ts` relies on the Origin header plus a `CSRF_EXEMPT_PATHS` set containing the two OAuth callbacks — confirm those exemptions cannot be abused and that `SameSite=lax` genuinely covers the rest); confirm upload handling validates magic bytes and not just the client-supplied `Content-Type` (`media.controller.ts` reads up to 110MB of raw body before the service inspects it); confirm EXIF/GPS stripping is enforced on every path including Moments and Loops; confirm export and hard-delete actually remove media objects, not just rows; review the account-deletion grace period and the `AuditLog` for completeness. Then write it up as an ADR.

**3.6.6 — Document the E2EE path.**
The original spec §5.9 required the messaging schema to be designed so end-to-end encryption can be added later, *and documented as a future phase*. There is no such document. Write `docs/decisions/0011-e2ee.md` stating what in the current `Conversation`/`Message`/`MessageAttachment` shape supports it, what blocks it (server-side search indexing, moderation of reported messages, the notification preview payload), and the migration path.

## 4. Cross-cutting requirements

- **Error contract:** the `TesseraHttpError` + `HttpErrorFilter` pattern is consistent and good. Verify every new path uses it, that no stack traces or Prisma errors leak to clients in production, and that the OpenAPI spec documents the error shape.
- **Validation:** 17 of 18 controllers use `ZodPipe` (only `health.controller.ts` doesn't, which is fine). Keep that at 100% for new routes, and validate WebSocket payloads in `inbox.gateway.ts` with the same schemas.
- **Boundaries:** pure business rules belong in `packages/media` and `packages/validation` with colocated unit tests (`visibility.ts`, `ranking.ts`, `spam.ts`, `session.rules.ts`, `graph.rules.ts`, `messaging.rules.ts` are the model to follow). Services should orchestrate and query, not decide.
- **Docs:** `docs/architecture.md`, `docs/data-model.md`, `docs/api.md`, `docs/ranking.md` and ten ADRs exist. Every change in this prompt that alters behaviour updates the relevant doc in the same PR, and adds an ADR if it is a decision rather than a fix.
- **README accuracy:** the README says "Phase 9", the health endpoint says phase 7, the Swagger description says Phase 9, and the worker boot log says Phase 7. Pick one source of truth and derive the rest.

## 5. Suggested sequencing

| Milestone | Contents | Exit criterion |
| --- | --- | --- |
| M1 — Trustworthy CI | 3.2.1–3.2.5 | `pnpm lint` fails on real problems; CI is parallel; coverage reported; E2E runs a production build on two browsers |
| M2 — Correctness | 3.1.1–3.1.7 | Each defect has a regression test; feed pagination proven across three pages; media route provably access-controlled |
| M3 — Performance | 3.3.1–3.3.5 | Load-test script committed; documented p95 under 300ms for feed and profile reads at 50× seed |
| M4 — Design system | 3.5.1–3.5.7 | `theme.css` generated from TS tokens; full contrast matrix passes AA; overlays share one accessible Dialog; mosaic respects aspect ratio; Storybook + visual baseline in CI |
| M5 — Client quality | 3.4.1–3.4.7 | OG previews render; CSP enforced; axe clean on every E2E route; RTL pseudo-locale renders without breakage |
| M6 — Production readiness | 3.6.1–3.6.6 | Traces span web→API→worker; DLQ visible in admin; a deploy and a rollback both performed against a staging environment |
| M7 — Phase 10 | 3.6.4 | Creator dashboard live behind account type, with threshold suppression |

M4 lands before M5 deliberately: the accessibility and RTL work in 3.4.4–3.4.5 is far cheaper once the overlays share one correct Dialog and the token pipeline has a single source of truth.

## 6. Definition of done for this engagement

- `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e` all run real checks and pass from a clean clone.
- No endpoint serves user content without an authorisation decision.
- Pagination is cursor-correct everywhere it is advertised.
- Every degraded path is labelled and observable; nothing is silently faked.
- Design tokens have one source of truth, every colour pair the UI actually renders passes AA, and no overlay traps a keyboard or screen-reader user.
- A documented deploy exists, has been exercised, and can be rolled back.
- The README describes the system that is actually in the repository.

## 7. Before you start

Reply first with:
1. Your baseline report from Section 2 — including which of the claimed defects in 3.1 you independently reproduced, and any you believe are wrong.
2. Anything in this list you would re-prioritise, with reasons.
3. A plan for M1.

Do not write code until I confirm.
