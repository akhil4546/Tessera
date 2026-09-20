# ADR 0008 — Unified Inbox activity, aggregated, with labelled push

**Status:** Accepted  
**Date:** 2026-09-18

## Context

Phase 7 adds in-app, push, and email notifications, aggregation, preferences, quiet hours, and a unified Inbox. Tessera must not clone Instagram’s activity chrome or heart icon. Push in local dev is often unconfigured.

## Decision

- **One Inbox tab.** Filters are All / Messages / Mentions / Appreciations / Follows / Requests. Threads and activity are `InboxEntry` rows, not a second product.
- **Aggregation.** One row per `(recipientId, aggregateKey)`. Copy is “Asha and 12 others appreciated your post.” A new actor on a read row clears `readAt`.
- **Channels.** Per-type in-app / push / email. Quiet hours skip push and email. Security alerts always email and ignore quiet hours. Digest holds non-security email until 09:00 in the user’s timezone.
- **Push.** Expo Push HTTP API for mobile. Web Push via VAPID + service worker. Missing `EXPO_ACCESS_TOKEN` / `PUSH_DRIVER=live` or VAPID keys is **SOFT-FAIL** — devices are stored, delivery is not pretended.
- **Schema.** `board_invite` and `scheduled_post_published` exist so Phase 8 did not rewrite prefs. Phase 8 emits both.
- Language: Inbox, activity, Appreciations, Mentions, Follows. No “likes” or notification heart.

## Consequences

- Operators can read notification copy in the database. That is documented.
- Clients from Phase 6 that expected `InboxList.items` to be `ConversationView[]` must unwrap `{ type: 'thread', conversation }`.
