# ADR 0010 — Safety, moderation, and admin

**Status:** Accepted  
**Date:** 2026-09-18

## Context

Phase 9 adds reporting, restrict, a moderation pipeline, a staff admin app, sensitive-content controls, remaining minor rules, wellbeing reminders, data export, and account deletion. Public web sessions must not unlock `apps/admin`.

## Decision

- **Reports** create or attach to a `ModerationCase`. Targets: post, comment, Moment, Loop, message, conversation, account. Reasons are a closed enum.
- **Restrict** is a one-way graph edge. Restricted comments are visible to the commenter and the post author until the author approves.
- **Classifier** is a `MediaClassifier` interface. Local/dev uses `StubMediaClassifier`, labelled, always `unknown`. It does not pretend media is safe. Classification runs in the upload pipeline before publish. A `likely` verdict (only from a real/fixture provider) holds publish and opens a case.
- **Keyword filters** are global (`flag` / `hide` / `queue`). Author comment filters from Phase 2 stay personal.
- **Admin** uses `AdminUser` + `AdminSession` and `tessera_admin_*` cookies with JWT issuer `tessera-admin`. Roles: moderator, admin, superadmin. Every action writes `AuditLog`.
- **Minors** remain private by default with follower-only DMs. They are also excluded from Discover ranking, people suggestions, and public people search unless the viewer already follows them.
- **Export** is a BullMQ job (`tessera-safety`) that zips JSON + original media and emails a signed link. **Deletion** deactivates immediately, hard-deletes (including media) after 30 days.
- Prisma stays on **7.10**.

## Consequences

- The public AuthGuard rejects suspended accounts. Pending deletion can still sign in to cancel.
- Discover/search must keep checking `isMinor` at read time as well as at index time.
- A production classifier is not wired. Setting `CLASSIFIER_PROVIDER` to an unknown name still uses the stub.
