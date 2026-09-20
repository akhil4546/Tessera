# ADR 0007 — Plaintext Inbox now, E2E-ready schema later

**Status:** Accepted  
**Date:** 2026-09-18

## Context

Phase 6 adds 1:1 and group threads, message requests, media, receipts, typing, and presence. The spec requires the schema to allow end-to-end encryption later, and forbids cloning Instagram Direct.

## Decision

- **Plaintext v1.** `Message.body` is stored as UTF-8. `bodyEncoding` defaults to `plaintext`. `ciphertext` is nullable and unused. `Conversation.e2eVersion` is `0`.
- **Future E2E** can set `e2eVersion >= 1`, write `ciphertext`, and leave `body` empty without a table rewrite. Clients already receive `bodyEncoding` and `e2eVersion`.
- **Requests** are 1:1 only. A sender who is not an accepted follower of the recipient lands in Requests when `whoCanMessage=everyone`. Minors (and `whoCanMessage=followers`) reject non-followers instead of creating a request.
- **Groups** cap at 32. You can only add people who would not be a request.
- **Read receipts** are optional per user. Delivery receipts always run. Presence is optional (`activityStatusEnabled`) and lives in Redis with an in-memory fallback.
- **WebSockets** on `/v1/inbox` with the access cookie or bearer token. Redis adapter when Redis is up; in-process otherwise (labelled SOFT-FAIL).
- **Reports** stay **501 `SAFETY_NOT_READY`** until Phase 9.
- Language: Inbox, threads, Messages, Requests. No paper-plane Direct chrome.

## Consequences

- Operators can read message bodies in the database in v1. That is documented, not hidden.
- Adding E2E later is a protocol change on the same rows, not a new product.
- CI proves REST (send, request, group, media, receipts, edit/unsend). Socket.IO is covered by the gateway auth path and a live client in web/mobile.
