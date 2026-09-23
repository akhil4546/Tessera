# API overview (Phase 9)

Base URL in local dev: `http://localhost:3001`. Versioned domain routes live under `/v1`. Errors are:

```json
{ "error": { "code": "HANDLE_TAKEN", "message": "That handle is taken." } }
```

Web uses httpOnly cookies (`tessera_at`, `tessera_rt`) with `credentials: 'include'`. Mobile sends `Authorization: Bearer` and stores refresh tokens in secure storage. Pass `client: "mobile"` on auth requests to receive tokens in JSON.

OpenAPI: `/docs`.

## Idempotency

Signed-in non-GET routes accept an optional `Idempotency-Key` header (one line, at most 255 characters). The same user, key, and path replays the first successful response for 24 hours and does not run the handler again. Replay returns that original body, including any signed media URLs from that moment — fetch the resource again if you need fresh URLs.

A different body with the same key is **409 `IDEMPOTENCY_MISMATCH`**. A key whose first request is still running is **409 `IDEMPOTENCY_IN_PROGRESS`**. Keys stored by the older post/Moment/Loop path (a bare resource id) are **409 `IDEMPOTENCY_KEY_REUSED`** rather than creating a second resource. Failed requests are not stored, so the same key can be retried after a 4xx. GET, HEAD, and OPTIONS ignore the header.

The key is ignored when nobody is signed in (`/v1/auth/*`) and on admin routes. Admin actions are not user-scoped, and `IdempotencyRecord.userId` references `User`. Messages stay idempotent on `clientId` as well.

`tessera-safety` runs `purge-idempotency` every hour. It deletes finished rows older than 24 hours and locks left in progress (status 0) after 2 minutes. If Redis is down, the API process runs the same purge on that interval.

## Auth

`/v1/auth/*`, `/v1/me`, sessions, 2FA, and OAuth (501 until that provider is configured).

User access tokens, admin access tokens, and short-lived purpose tokens (2FA challenge, OAuth state, OAuth setup) are signed with different secrets: `JWT_ACCESS_SECRET`, `JWT_ADMIN_SECRET`, and `JWT_PURPOSE_SECRET`. The process exits at startup if any of those is missing, shorter than 32 characters, or a copy of another. The `kid` header selects the current key or, during a rotation, `JWT_ACCESS_SECRET_PREVIOUS`, `JWT_ADMIN_SECRET_PREVIOUS`, or `JWT_PURPOSE_SECRET_PREVIOUS`. Tokens minted before `kid` was added still verify until they expire. Access tokens last 15 minutes; remove the previous secret after that.

Filesystem media URLs are outside that rotation. They use the current `JWT_ACCESS_SECRET` only.

## Identity and graph

Unchanged from Phase 1. `GET /v1/users/:handle` now includes `counts.posts` and a signed `avatarUrl` when one exists.

`POST /v1/me/avatar` `{ mediaId }` after an avatar upload.

## Media

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/v1/media/intents` | Presigned PUT, or fs local path |
| POST | `/v1/media/:id/bytes` | Filesystem / test driver body |
| POST | `/v1/media/:id/complete` | Enqueues processing (inline if Redis is down) |
| GET | `/v1/media/:id` | Status + signed variant URLs |
| POST | `/v1/media/:id/suggest-alt` | 501 `ALT_SUGGEST_NOT_CONFIGURED` without `XAI_API_KEY` |
| GET | `/v1/media/file/:key?exp=&sig=` | fs driver reads. `sig` is HMAC-SHA256 of `${exp}.${key}` using `JWT_ACCESS_SECRET`. Missing, tampered, or expired links return 403 `MEDIA_URL_INVALID`. `..` in the key is still 400. |

## Posts, appreciations, comments

| Method | Path |
| --- | --- |
| POST | `/v1/posts` | Optional `Idempotency-Key`, same as other signed-in creates |
| GET/PATCH/DELETE | `/v1/posts/:id` |
| POST | `/v1/posts/:id/archive` |
| POST/DELETE | `/v1/posts/:id/appreciations` |
| GET/POST | `/v1/posts/:id/comments` |
| DELETE | `/v1/comments/:id` |
| POST/DELETE | `/v1/comments/:id/pin` |
| POST/DELETE | `/v1/comments/:id/like` |
| GET/PUT | `/v1/me/comment-filters` |
| PUT | `/v1/me/hero-tiles` |
| GET | `/v1/users/:handle/mosaic` |

Audience: `public`, `followers`, or `circles` with `circleIds`. `scheduledAt` (ISO) leaves `publishedAt` null until the worker job.

Appreciation counts are omitted for viewers unless `publicAppreciationCounts` is on. Authors always see the breakdown.

## Following feed

| Method | Path |
| --- | --- |
| GET | `/v1/feed/following?keepGoing=&cursor=&limit=` |
| POST | `/v1/feed/following/caught-up` |

Response includes `finishLine: { reached, seenSinceLastVisit, olderAvailable }`.

`cursor` is the previous response's `nextCursor`. Pages do not overlap. Order stays `publishedAt` descending, then `id` descending, including across fan-out, Circle, and high-follower posts. `limit` is 1–50 and defaults to 12. `seenSinceLastVisit` is the full count of posts newer than the finish line.

## Moments

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/v1/moments` | Optional `Idempotency-Key`. Circles via `circleIds` |
| GET | `/v1/moments/tray` | Own ring first, unseen, then recency + interaction |
| GET | `/v1/moments/authors/:handle` | Live segments for the viewer |
| GET/DELETE | `/v1/moments/:id` | |
| POST | `/v1/moments/:id/segments/:segmentId/view` | |
| POST/DELETE | `/v1/moments/:id/segments/:segmentId/reactions` | Quick emojis only |
| GET | `/v1/moments/:id/viewers` | Author only |
| POST | `/v1/moments/:id/stickers/:stickerId/responses` | Poll vote or question answer |
| POST | `/v1/moments/:id/keep` | `{ shelfId }` or `{ title }` before expiry |
| POST | `/v1/moments/:id/reply` | **501 `MESSAGING_NOT_READY`** |
| GET | `/v1/me/moments/archive` | Empty unless `momentArchiveEnabled` |
| POST/GET | `/v1/me/reel-shelves` | |
| PATCH/DELETE | `/v1/me/reel-shelves/:id` | |
| PUT | `/v1/me/reel-shelves/order` | |
| GET | `/v1/users/:handle/reel-shelves` | |
| GET | `/v1/users/:handle/reel-shelves/:id` | Includes Kept Moments after expiry |

Link stickers: **403 `LINK_NOT_ELIGIBLE`** on Personal accounts. Video segments longer than 30s: **400 `VIDEO_TOO_LONG`**.

## Loops

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/v1/loops` | Optional `Idempotency-Key`. Circles via `circleIds`; `scheduledAt` held until due |
| GET | `/v1/loops/feed` | Following + self, reverse-chronological, includes wellbeing |
| GET/PATCH | `/v1/loops/:id` | PATCH: `allowAudioReuse`, `coverFrameMs` |
| POST | `/v1/loops/:id/watch` | `{ seconds }` heartbeat 1–30 |
| POST | `/v1/loops/:id/save` | `{ boardId? }` — default Saved board |
| GET | `/v1/audio` | Reusable original audio from you and people you follow |
| GET/PUT | `/v1/me/wellbeing` | Optional daily Loops budget (minutes or null) |
| POST | `/v1/me/wellbeing/extend` | +10 minutes today |
| POST | `/v1/me/wellbeing/dismiss` | Pause screen off for today |

Upload Loop clips with `purpose: "loop"`. Video longer than 90s after trim/speed: **400 `VIDEO_TOO_LONG`**. Missing FFmpeg: media `failed` with `FFMPEG_MISSING`. Captions skip with `CAPTIONS_NOT_CONFIGURED` unless a provider is set. There is no licensed-music endpoint.

## Search and Discover

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/v1/search?q=&tab=` | tabs: all / people / hashtags / places / captions / boards. `engine` is `meilisearch` or `postgres` |
| GET | `/v1/search/boards` | Public Boards by title/description |
| GET/DELETE | `/v1/search/recent` | Last 20 queries |
| GET | `/v1/feed/discover?topic=&cursor=` | Ranked mix. Each item has `impressionId`, `score`, `signals` |
| GET | `/v1/feed/discover/impressions/:id` | Stored “Why am I seeing this?” |
| GET/PUT | `/v1/me/discover` | Tune sliders 0–1 |
| GET | `/v1/discover/people` | Suggested people with a truthful reason |
| POST | `/v1/discover/people/:handle/dismiss` | |
| GET | `/v1/hashtags/:tag?sort=top\|recent` | |
| POST/DELETE | `/v1/hashtags/:tag/follow` | |
| GET | `/v1/me/hashtags` | |
| GET | `/v1/places/:slug?sort=` | Map coords when known |
| GET | `/v1/users/:handle/memory-map` | Empty / hidden when the map is off |

## Circles

| Method | Path |
| --- | --- |
| GET/POST | `/v1/me/circles` |
| GET/PATCH/DELETE | `/v1/me/circles/:id` |
| POST | `/v1/me/circles/:id/members` `{ handle }` |
| DELETE | `/v1/me/circles/:id/members/:handle` |

Membership is owner-only. Members do not get a list of Circles they belong to.

## Boards

| Method | Path |
| --- | --- |
| GET | `/v1/me/boards` |
| GET | `/v1/me/boards/following` |
| POST | `/v1/boards` |
| GET/PATCH/DELETE | `/v1/boards/:id` |
| POST | `/v1/posts/:id/save` `{ boardId? }` |
| POST | `/v1/loops/:id/save` `{ boardId? }` |
| DELETE | `/v1/boards/:id/items/:postId` |
| POST/DELETE | `/v1/boards/:id/follow` |
| POST | `/v1/boards/:id/collaborators` `{ handle }` — emits `board_invite` |
| POST | `/v1/boards/:id/accept` / `decline` |
| DELETE | `/v1/boards/:id/collaborators/:handle` |
| GET | `/v1/users/:handle/boards` | Public Boards |

## Drafts and scheduled

| Method | Path |
| --- | --- |
| GET/POST | `/v1/drafts` |
| GET/PATCH/DELETE | `/v1/drafts/:id` |
| GET | `/v1/me/scheduled` | Unpublished posts with `scheduledAt` |

Worker queue `tessera-scheduled` publishes due rows every 30s and emits `scheduled_post_published`.

## Inbox

WebSocket namespace: `/v1/inbox` (cookie or `auth.token`). Events are a single `inbox` payload (`message.new`, `typing`, `presence`, `receipt`, `request.new`, `inbox.badge`, …).

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/v1/inbox?filter=all\|messages\|mentions\|appreciations\|follows\|requests` | Unified Inbox. `items` are `{ type: "thread" \| "activity", … }`. Badge counts include `unreadActivity` |
| GET | `/v1/inbox/badge` | `unreadMessages` + `pendingRequests` + `unreadActivity` |
| POST | `/v1/inbox/conversations` | `{ handle }` 1:1 or `{ handles, title }` group |
| GET/PATCH | `/v1/inbox/conversations/:id` | mute, hide, rename group |
| POST/DELETE | `/v1/inbox/conversations/:id/members` | Group owner |
| POST | `/v1/inbox/conversations/:id/leave` | |
| GET/POST | `/v1/inbox/conversations/:id/messages` | Cursor pagination. `clientId` is idempotent, and `Idempotency-Key` replays the whole response |
| PATCH/DELETE | `/v1/inbox/messages/:id` | Edit 15 minutes (text). Unsend anytime |
| POST/DELETE | `/v1/inbox/messages/:id/reactions` | Tessera quick emojis |
| POST | `/v1/inbox/conversations/:id/read` | `{ messageId }` |
| POST | `/v1/inbox/conversations/:id/delivered` | `{ messageId }` |
| POST | `/v1/inbox/requests/:id/accept` | |
| POST | `/v1/inbox/requests/:id/decline` | |
| POST | `/v1/inbox/conversations/:id/report` | `{ reason, details? }` — opens a moderation case |
| POST | `/v1/inbox/messages/:id/report` | same body |
| GET/PUT | `/v1/me/messaging` | activity status, read receipts, whoCanMessage |
| GET | `/v1/inbox/presence?handles=` | |
| POST | `/v1/moments/:id/reply` | Opens a 1:1 and sends a Moment share |

Upload message media with `purpose: "message"`. Voice notes: `kind: "audio"`. Groups max 32. Minors cannot set `whoCanMessage=everyone`.

## Notifications

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/v1/notifications?filter=` | Activity only. Same filters as Inbox except `messages` / `requests` |
| POST | `/v1/notifications/read` | `{ ids }` or `{ all: true }` |
| GET/PUT | `/v1/me/notification-preferences` | Per-type in-app / push / email, quiet hours, digest |
| GET/POST | `/v1/me/devices` | Expo token or Web Push subscription |
| DELETE | `/v1/me/devices/:id` | |
| GET | `/v1/me/push/vapid` | Public VAPID key. `configured: false` without env keys |

Socket events: `notification.new`, `inbox.badge` (includes `unreadActivity`).

Push without Expo/VAPID config is **labelled SOFT-FAIL**. `board_invite` and `scheduled_post_published` are emitted in Phase 8.

## Safety

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/v1/reports` | `{ targetKind, targetId, reason, details? }` |
| POST | `/v1/posts/:id/report` `/v1/loops/:id/report` `/v1/comments/:id/report` `/v1/moments/:id/report` `/v1/users/:handle/report` | convenience |
| POST | `/v1/users/:handle/restrict` | Comments only visible to them + you |
| DELETE | `/v1/users/:handle/restrict` | |
| GET | `/v1/me/restricted` `/v1/me/blocked` `/v1/me/muted` | lists |
| POST | `/v1/comments/:id/approve` | Author approves a restricted comment |
| PUT | `/v1/me/sensitivity` | `hide` / `warn` / `show` |
| POST | `/v1/me/export` | Background zip, emailed |
| POST | `/v1/me/delete` | `{ password }` — 30-day grace, then hard delete |
| DELETE | `/v1/me/delete` | Cancel during grace |
| POST | `/v1/me/wellbeing/heartbeat` | `{ seconds }` app-time |
| POST | `/v1/appeals` | `{ caseId, statement }` |

The classifier is **stub** unless a real `MediaClassifier` is wired. Stub results are `unknown` and labelled.

## Admin (separate session)

Cookies: `tessera_admin_at` / `tessera_admin_rt`. Issuer `tessera-admin`. Public `tessera_at` does not work here.

| Method | Path |
| --- | --- |
| POST | `/v1/admin/auth/login` `{ email, password }` |
| GET | `/v1/admin/me` |
| GET | `/v1/admin/queue` |
| GET/POST | `/v1/admin/cases/:id` claim + action |
| GET | `/v1/admin/users?q=` |
| POST | `/v1/admin/users/:id/suspend` `/unsuspend` (admin role) |
| POST | `/v1/admin/posts/:id/takedown` `/restore` |
| GET/POST | `/v1/admin/appeals` |
| GET | `/v1/admin/audit` |
| GET/POST/DELETE | `/v1/admin/keyword-filters` |
