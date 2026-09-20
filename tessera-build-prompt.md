# Build Prompt: "Tessera": A Photo & Video Social Platform

> Copy everything below this line into your AI coding tool. Replace anything in [BRACKETS] to suit your needs. "Tessera" is a working name (a tessera is a single tile in a mosaic); rename it freely.

---

## 1. Role and working agreement

You are a senior full-stack engineer and product architect. You will build **Tessera**, a production-quality social platform for sharing photos and short videos. It covers the same core territory as Instagram (profiles, posts, a feed, ephemeral content, short video, discovery, messaging, notifications) but it is **not a clone**. It has its own name, visual identity, and a set of distinctive product decisions described in Section 3. Do not use Instagram's name, logo, gradient, icons, copy, or layouts.

Rules for how you work:

1. Build in the phases listed in Section 10. At the end of each phase, stop, summarise what you built, list anything incomplete or assumed, give me commands to run and test it, and wait for my go-ahead before continuing.
2. Never silently stub or fake a feature. If something is mocked (e.g. push notifications in local dev), label it clearly in code and in your summary.
3. Ask me before making any decision that is hard to reverse (database choice changes, auth model, paid third-party services).
4. Write clean, typed, modular code with meaningful names. Every phase ships with tests, a seed script update, and README updates.
5. Prefer boring, well-documented technology over clever solutions.

## 2. Tech stack (default; tell me if you'd change anything and why)

- **Monorepo:** Turborepo + pnpm, TypeScript everywhere, shared `packages/` for types, validation schemas (Zod), UI tokens, and API client.
- **Web client:** Next.js (App Router), Tailwind CSS, TanStack Query.
- **Mobile client:** React Native with Expo (Expo Router), sharing types, API client and design tokens with web. [Remove if web-only.]
- **API:** Node.js with NestJS (REST + OpenAPI docs), WebSocket gateway for real-time features.
- **Database:** PostgreSQL with Prisma ORM; migrations committed to the repo.
- **Cache / ephemeral data / rate limiting:** Redis.
- **Background jobs:** BullMQ on Redis (media processing, fan-out, notifications, scheduled posts, moment expiry).
- **Object storage:** S3-compatible (MinIO locally, S3/R2 in production) behind a CDN; uploads via presigned URLs.
- **Media processing:** Sharp for images; FFmpeg for video (HLS output).
- **Search:** Meilisearch (users, hashtags, places, captions).
- **Auth:** Email/password (argon2id), OAuth (Google, Apple), optional TOTP 2FA; short-lived access tokens + rotating refresh tokens in httpOnly cookies (web) / secure storage (mobile).
- **Push:** Expo Push (wrapping FCM/APNs); web push via service worker.
- **Local dev:** Docker Compose for Postgres, Redis, MinIO, Meilisearch, Mailpit.
- **Observability:** Structured logging (pino), OpenTelemetry traces, Sentry for errors.
- **CI:** GitHub Actions running lint, typecheck, unit, integration and E2E (Playwright for web, Maestro or Detox for mobile).

## 3. What makes Tessera different (non-negotiable product decisions)

These are the core of the product's identity. Implement all of them.

1. **Chronological by default, with a transparent algorithm.** The Home feed has two tabs: *Following* (strictly reverse-chronological, the default) and *Discover* (ranked). Every ranked item has a "Why am I seeing this?" sheet listing the actual signals used. Users get a *Tune my Discover* screen with sliders (e.g. "more from people I interact with", "more new creators", "more nearby", "less video") that genuinely change ranking weights.
2. **Finish lines instead of infinite scroll.** The Following feed ends with an explicit "You're caught up" card showing how many posts you've seen since your last visit. Scrolling past it shows older posts only if the user taps "Keep going".
3. **Private appreciation.** Public like counts are hidden by default. Instead of a single like, users can leave one of four **Appreciations** (e.g. ✨ Inspiring, 😂 Funny, 💛 Love this, 🎯 Useful). Authors see counts per type; viewers see only their own reaction unless the author opts into public counts.
4. **Mosaic profiles.** A profile is not a uniform square grid. It's a mosaic: users can pin up to three posts as large 2×2 "hero tiles", and the rest flow in a mixed-size masonry layout that respects each photo's aspect ratio.
5. **Circles instead of a single close-friends list.** Users create multiple named audiences (e.g. "Family", "Climbing crew"). Any post, Moment or Loop can be shared with Public, Followers, or one or more Circles. Circle membership is private to the owner.
6. **Moments that can become permanent.** Ephemeral 24-hour content is called **Moments**. Before expiry, the author can "Keep" a Moment into a themed **Reel Shelf** on their profile (Tessera's take on highlights), or let it disappear forever (no hidden archive unless the user turns archiving on).
7. **Boards (collaborative collections).** Saved posts go into **Boards**, which can be private, shared with specific people who can add to them, or public. Boards are followable.
8. **Loops with a wellbeing budget.** Short vertical videos are called **Loops**. Users set an optional daily Loops budget; when reached, the player shows a gentle pause screen with options to stop, extend by 10 minutes, or dismiss for the day.
9. **Memory Map.** Posts with locations appear on a personal map on the user's profile (visibility controlled separately from the posts). Place pages show public posts taken there.
10. **Authenticity labels.** On upload, the author must declare if content is AI-generated or heavily edited. Posts with no filters or edits can carry an optional "Unfiltered" badge. EXIF data (including GPS) is always stripped from stored media.
11. **Unified Inbox.** Messages and activity notifications live in a single Inbox tab with filters (All / Messages / Mentions / Appreciations / Follows / Requests), rather than being separated.

## 4. Visual identity and UX

- **Palette:** warm and earthy, not neon or gradient. Tokens: ink `#1F1B16`, sand `#F4EDE3`, terracotta `#C8553D`, moss `#5B7553`, slate `#4A5A6A`, plus full dark-mode equivalents. Define all colours as semantic tokens (`surface`, `text-primary`, `accent`, etc.).
- **Type:** a serif display face for headings (e.g. Fraunces) and a clean sans for UI (e.g. Inter), both via Google Fonts with system fallbacks.
- **Shape language:** soft rounded "tile" corners (12–16px), subtle shadows, generous spacing.
- **Navigation (mobile bottom bar / web left rail):** Home · Discover · Create (centre, prominent) · Inbox · Me.
- **Create flow:** a single entry point that lets the user choose Post, Moment, or Loop, then pick media, edit, add details, choose audience, and publish or schedule.
- **Motion:** purposeful and short (150–250ms); respect reduced-motion settings.
- **Empty, loading and error states:** designed for every screen; use blurhash placeholders for media and skeletons for lists.
- **Accessibility:** WCAG 2.2 AA; alt text prompt on every image upload (with an AI-suggested draft the user can edit); captions for Loops; full keyboard and screen-reader support; minimum 44pt touch targets.
- **Internationalisation:** all strings externalised; RTL layout support; locale-aware dates and numbers.

## 5. Feature specification

### 5.1 Accounts and identity
- Sign up / log in with email, Google, Apple; email verification; password reset; optional TOTP 2FA with recovery codes.
- Unique handle (validation, reserved words list, change cooldown of 14 days).
- Profile: display name, handle, avatar, bio with link parsing, up to 3 links, pronouns (optional), category (for creators/businesses), hero tiles, Reel Shelves, Memory Map toggle.
- Account types: Personal, Creator, Business (Creator/Business unlock analytics and contact buttons).
- Private accounts with follow requests (approve/decline/remove follower).
- Session management screen (see and revoke active devices).
- Data export (JSON + media zip, generated by a background job and emailed) and account deletion (30-day grace period, then hard delete including media).

### 5.2 Social graph
- Follow / unfollow, follow requests for private accounts, remove follower.
- Circles: create, rename, delete, add/remove members.
- Block (mutual invisibility), Mute (posts, Moments, or both), Restrict (their comments only visible to them unless approved).
- Suggested people (mutuals, contacts if permitted, similar interests), with dismiss.

### 5.3 Posts
- Single photo, single video (up to 60s), or carousel (up to 10 mixed items).
- Per-item crop to 1:1, 4:5, or 3:2, or keep original aspect ratio.
- Built-in editor: 12 original filters with distinct names (not Instagram's), plus adjustments (brightness, contrast, warmth, saturation, fade, vignette, sharpen), all non-destructive until publish.
- Caption with @mentions and #hashtags (autocomplete), people tags placed on the image, location, alt text per item, authenticity declaration.
- Audience selector (Public / Followers / Circles), toggle comments on/off, toggle public Appreciation counts.
- Drafts (synced across devices) and scheduled publishing.
- Edit caption/tags/alt text after posting (with "edited" marker); delete; archive (if enabled).
- Share to a DM, copy link, share externally (with Open Graph preview page on web).

### 5.4 Engagement
- Appreciations (four types, see Section 3); double-tap applies the user's default type.
- Comments with one level of threaded replies, mentions, pinning (by author, up to 3), comment likes, delete, report; author can filter comments by keyword list.
- Save to Boards (default "Saved" board plus custom boards).

### 5.5 Feeds
- **Following:** reverse-chronological from followed accounts and Circles the user belongs to, with finish line.
- **Discover:** ranked mix of posts and Loops from outside the user's graph, with transparency sheet and tuning sliders.
- Pull to refresh, cursor-based pagination, "new posts" pill, optimistic UI for interactions, offline cache of the last loaded feed.

### 5.6 Moments (ephemeral)
- Photo or video (up to 30s per segment), text overlays, drawing, stickers (mention, location, hashtag, poll, question box, countdown, link for eligible accounts).
- Audience selection including Circles.
- Viewer list for the author; reply via DM; quick emoji reactions.
- Tray at the top of Home ordered by recency and interaction; tap-to-advance, hold-to-pause, swipe between users.
- Automatic expiry after 24 hours via scheduled job; "Keep" into a Reel Shelf before expiry.

### 5.7 Loops (short video)
- Vertical video up to 90 seconds; record in-app (multi-clip, timer, speed) or upload.
- Trim, reorder clips, text overlays, auto-captions (speech-to-text job), cover frame selection.
- Original audio only in v1 (no licensed music); users can reuse another Loop's original audio if the creator allows it.
- Full-screen vertical player with preloading of the next 2 videos, HLS adaptive streaming, mute toggle, Appreciations, comments, share, save.
- Daily Loops budget and pause screen.

### 5.8 Discovery and search
- Discover grid (mixed posts and Loops) with topic chips.
- Search across people, hashtags, places, and Boards with typo tolerance and recent searches (clearable).
- Hashtag pages (top and recent), follow a hashtag.
- Place pages with map, top and recent posts.
- Memory Map on profiles.

### 5.9 Messaging (Inbox → Messages)
- 1:1 and group chats (up to 32 members), real-time over WebSockets with delivery and read receipts (read receipts can be disabled).
- Text, photos, videos, voice notes, shared posts/Loops/Moments, reactions, replies to a specific message, unsend, edit within 15 minutes.
- Typing indicators, online status (can be disabled), message requests from non-followers, mute conversation, report.
- Pagination of history; offline queue and retry on mobile.
- Design the schema so end-to-end encryption can be added later; document this as a future phase.

### 5.10 Notifications (Inbox → Activity)
- Types: new follower, follow request, Appreciation, comment, reply, mention, tag, Moment reaction, Board invite, scheduled post published, security alerts.
- Aggregation ("Asha and 12 others appreciated your post").
- In-app, push, and email channels with per-type preferences and quiet hours.

### 5.11 Creator and business tools
- Dashboard: reach, impressions, profile visits, follower growth, Appreciation breakdown, top posts, audience locations and active hours (aggregated and privacy-safe, minimum thresholds before showing data).
- Per-post insights.
- Contact buttons (email, phone, booking link) for Business accounts.
- [OPTIONAL, later phase] Product tags linking to external shop URLs. No in-app checkout in v1.
- [OPTIONAL, later phase] Live video.

### 5.12 Safety, privacy and wellbeing
- Report flows for posts, comments, Moments, Loops, messages and accounts, with reason categories.
- Moderation pipeline: automated image/video classification for nudity and violence (pluggable provider interface; a stub in dev), keyword filters, and a queue for human review.
- Admin panel (separate web app, role-based access): review queue, user lookup, content takedown, account suspension, audit log of every admin action, appeals handling.
- Sensitive content screen (blurred with "Show anyway") and a user setting controlling sensitivity level.
- Minors: age gate at sign-up; accounts under 18 default to private with DMs limited to followers and restricted discoverability.
- Wellbeing: Loops budget, optional daily app-time reminder, "Take a break" nudge after long sessions, hidden-counts default.
- Rate limits on follows, comments, messages, and sign-ups; spam and bot heuristics.

### 5.13 Settings
- Account, privacy (account visibility, who can message/tag/mention, Memory Map visibility, activity status, read receipts), notifications, Circles, blocked/muted/restricted lists, Discover tuning, Loops budget, sensitive content, language, theme (light/dark/system), data export, deactivate/delete.

## 6. Data model (starting point; refine and explain changes)

Design Prisma models for at least:

`User`, `Profile`, `Session`, `Device` (push tokens), `Follow` (status: pending/accepted), `Circle`, `CircleMember`, `Block`, `Mute`, `Restrict`,
`Post` (type: post/loop; visibility; authenticity flags; scheduledAt; publishedAt; editedAt), `MediaItem` (original key, variants JSON, width, height, aspect, blurhash, duration, altText, processing status), `PostAudience` (circle links), `PeopleTag`, `Hashtag`, `PostHashtag`, `HashtagFollow`, `Location`, `HeroTile`,
`Appreciation` (type enum, unique per user+post), `Comment` (parentId for replies, pinned, hidden-by-restrict), `CommentLike`, `CommentFilter`,
`Board`, `BoardCollaborator`, `BoardItem`, `BoardFollow`,
`Moment`, `MomentSegment`, `MomentSticker`, `MomentView`, `MomentReaction`, `ReelShelf`, `ReelShelfItem`,
`AudioTrack` (original audio reuse),
`Conversation`, `ConversationMember` (role, lastReadMessageId, muted), `Message` (type, body, attachment refs, replyToId, editedAt, deletedAt), `MessageReaction`, `MessageRequest`,
`Notification` (type, actor(s), target, aggregated key, readAt), `NotificationPreference`,
`FeedEntry` (materialised feed rows for fan-out), `RankingPreference` (slider weights), `WellbeingSetting`, `WatchTimeLog`,
`Report`, `ModerationCase`, `ModerationAction`, `Appeal`, `AdminUser`, `AuditLog`,
`Draft`, `ExportJob`, `DeletionRequest`, `InsightDaily` (pre-aggregated analytics).

Include appropriate indexes (e.g. `(authorId, publishedAt DESC)`, `(userId, createdAt DESC)` on FeedEntry, unique constraints on follows and appreciations) and use soft-delete only where needed for moderation or undo.

## 7. System architecture

- **Upload pipeline:** client requests a presigned URL → uploads original directly to storage → notifies API → API enqueues a processing job → worker strips EXIF (preserving orientation), generates image variants (e.g. 150, 320, 640, 1080 width) in AVIF and WebP plus a blurhash; for video, transcodes to HLS (360p/720p/1080p), extracts thumbnails and runs speech-to-text for captions → runs moderation classification → marks media ready → post becomes visible. The client shows processing state throughout.
- **Feed generation:** hybrid fan-out. For authors with fewer than [10,000] followers, fan out on write into `FeedEntry` via a job. For high-follower accounts, merge their posts at read time. Respect Circles, blocks and mutes at both write and read.
- **Discover ranking:** a candidate generation step (popular in the user's topics, from similar users, nearby, new creators) followed by a scoring function with explicit, documented weights that the user's sliders adjust. Store the top signals per item so "Why am I seeing this?" is truthful. Keep it rules-based in v1 with a clean interface for swapping in an ML model later.
- **Real-time:** WebSocket gateway authenticated with the access token; Redis pub/sub adapter so it scales across instances; used for messages, typing, presence, and live notification badges.
- **Caching:** Redis for sessions, hot profiles, counters (flushed to Postgres periodically), and rate limits. CDN caching for all media.
- **Scheduled jobs:** Moment expiry, scheduled post publishing, notification digests, insight aggregation, data export, account hard-deletion.
- **API design:** versioned REST (`/v1`), cursor pagination everywhere, consistent error format, idempotency keys on create endpoints, OpenAPI spec generated and published, a typed client generated for web and mobile.

## 8. Non-functional requirements

- **Performance:** p95 API latency under 300ms for feed and profile reads at seed-data scale; first contentful paint under 2s on mid-range mobile; images lazy-loaded with correct `srcset`.
- **Security:** OWASP Top 10 mitigations; input validation with shared Zod schemas; CSRF protection for cookie auth; strict CORS; content-security policy on web; signed, expiring media URLs for non-public content; secrets only via environment variables; dependency scanning in CI.
- **Privacy:** privacy-by-default settings; no GPS in stored media; data export and deletion fully functional; analytics aggregated with minimum thresholds.
- **Reliability:** graceful degradation if search or the media worker is down; retries with backoff on jobs; dead-letter queue with an admin view.
- **Testing:** unit tests for services, integration tests against a real Postgres in Docker, E2E tests for the critical paths (sign up, post, follow, see in feed, appreciate, comment, message, Moment expiry). Target meaningful coverage of business logic rather than a number.
- **Seed data:** a script that creates ~50 users with avatars, follow relationships, Circles, posts, Loops, Moments, comments, Boards and conversations using locally generated placeholder media.

## 9. Deliverables

- Monorepo with `apps/web`, `apps/mobile`, `apps/api`, `apps/worker`, `apps/admin` and shared `packages/`.
- `docker-compose.yml` that brings up all infrastructure with one command.
- `.env.example` for every app with comments.
- README covering architecture overview (with a Mermaid diagram), local setup, scripts, testing, and deployment notes.
- `docs/` folder with the data model diagram, API overview, ranking algorithm explanation, and a decisions log (ADR style).

## 10. Build phases

Stop and report after each phase.

- **Phase 0 – Foundations:** monorepo, tooling, Docker Compose, CI pipeline, design tokens, base UI components, empty app shells with navigation.
- **Phase 1 – Identity & graph:** auth (all methods, 2FA), profiles, handles, follow/requests, private accounts, block/mute, sessions screen.
- **Phase 2 – Posts & feed:** upload pipeline, editor and filters, post creation, Following feed with finish line, Appreciations, comments, mosaic profile with hero tiles.
- **Phase 3 – Moments:** creation, stickers, tray and viewer, expiry job, Reel Shelves.
- **Phase 4 – Loops:** recording/upload, HLS pipeline, auto-captions, vertical player, audio reuse, wellbeing budget.
- **Phase 5 – Discovery:** search, hashtags, places, Memory Map, Discover feed with transparency and tuning.
- **Phase 6 – Messaging:** real-time DMs and groups, requests, media messages, receipts.
- **Phase 7 – Notifications:** in-app, push, email, aggregation, preferences, unified Inbox.
- **Phase 8 – Organisation & audiences:** Circles across all content types, Boards with collaboration, drafts, scheduled posts.
- **Phase 9 – Safety & admin:** reporting, moderation pipeline, admin panel, restrict, minor protections, sensitive content controls.
- **Phase 10 – Creator tools:** account types, insights dashboard, contact buttons. [Optional: product tags, live video.]
- **Phase 11 – Hardening:** performance pass, accessibility audit, i18n completion, security review, load test script, production deployment guide.

## 11. Before you start

Reply first with:
1. Any questions or concerns about the spec.
2. Any stack changes you'd recommend, with reasons.
3. A short plan for Phase 0.

Do not write code until I confirm.
