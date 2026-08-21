---
created: 2026-08-15T08:50:00.000Z
title: 'Switch the GOG user API off embed.gog.com/userData.json — it fails outright for large wishlists'
area: store/gog
needs: code-fix-plus-test-rework
status: CLOSED
closed: 2026-08-21
closed_by: 'b0776ab8d (quick-260821-o34, code) + 463426e9d (tests); verified and closed 2026-08-21'
severity: major
upstream:
  - b1a87c958 (Heroic v2.22.1 — Switch GOG user APIs, #5718)
files:
  - src/backend/storeManagers/gog/user.ts
  - src/backend/storeManagers/gog/games.ts
  - src/backend/storeManagers/gog/library.ts
  - src/common/types/gog.ts
---

## Problem

GameLib still calls `https://embed.gog.com/userData.json` (`src/backend/storeManagers/gog/user.ts:143`).

Upstream moved off it in Heroic v2.22.1 for a concrete reason: **`userData.json` fails outright
for users with a very large wishlist.** The replacement is `https://users.gog.com/users/<user id>`
— the endpoint GOG Galaxy itself uses — which also returns much less data GameLib doesn't need.

This is a real user-facing failure, not a tidiness change. Affected users can't get their GOG
account details at all.

## Solution

Port upstream `b1a87c958` (`git show b1a87c958` — Heroic upstream is git remote `origin`).

Swap the endpoint to `https://users.gog.com/users/${user.user_id}` with the same
`Authorization: Bearer` + User-Agent headers. Note upstream also **stopped deleting `data.email`**
— the new endpoint doesn't return the same shape, so the old "exclude email, it won't be needed"
line goes away.

**Why this is its own scoped session and not a quick task** (measured 2026-08-15):

- `gog/user.ts` has diverged **111 lines** from fork base.
- It carries **372 lines of tests** (`gog/__tests__/user.test.ts`) plus **294** in
  `library.test.ts` — both will need rework, not just re-running.
- The change reshapes `src/common/types/gog.ts` (**92 lines** upstream) and touches
  `gog/games.ts` and `gog/library.ts`.

Related: [[port-heroic-gamepad-nintendo-layout-and-key-repeat]] (same upstream review batch).

## Resolution (2026-08-21)

Closed in two parts, both verified at HEAD rather than taken on trust.

**Code — `b0776ab8d` (quick task `260821-o34`, 2026-08-21).** `getUserDetails()` now fetches
`https://api.gog.com/users/${encodeURIComponent(userId)}` (`user.ts:162`). Zero `userData.json`
references remain anywhere in `src/`; the surviving `embed.gog.com` hits are all the OAuth
`on_login_success` redirect, a different and legitimate use of that host.

**Tests — `463426e9d` (2026-08-21).** The 159-line test rework this todo predicted was sitting
uncommitted in the working tree when this closure ran. It was **not** an abandoned leftover: quick
task `260821-o34` was still in flight in a concurrent session and wrote its SUMMARY minutes later.
This closure committed that session's test file from under it, along with a fix for a real defect
it carried — the suite passed jest but broke `tsc --noEmit` (TS2345 at `user.test.ts:493`), the
ts-jest transpile-only trap. Proven non-vacuous by reverting `user.ts` to `b0776ab8d^`, at which
point all four new cases fail. Recorded plainly because the collision, not the code, is the part a
future reader needs: `260821-o34`'s SUMMARY lists `user.test.ts` among its modified files, but the
commit that carries it is this closure's, not the quick task's.

### Two deviations from what this todo specified, recorded rather than silently absorbed

1. **Host is `api.gog.com`, not the `users.gog.com` named above.** Both return the small,
   fixed-size Galaxy user document independent of wishlist size, so the failure mode this todo
   filed — a large wishlist making the account details unfetchable — is closed either way. Noted
   because a future reader comparing against upstream `b1a87c958` will find a different hostname.

2. **`games.ts` and `library.ts` needed no changes**, despite being listed in `files:` above, and
   `library.test.ts` needed no rework (it is green unmodified, 5/5). The 2026-08-15 estimate that
   they would was pessimistic: narrowing `UserData` to `{userId, username, galaxyUserId}` broke no
   consumer, which repo-wide `tsc --noEmit` (exit 0) confirms.

Also unlike upstream, `email` is not merely "no longer deleted" — the narrowed `UserData` has no
such field, and the headline test asserts the persisted record carries no `email` property.
