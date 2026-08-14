---
created: 2026-08-15T08:50:00.000Z
title: "Switch the GOG user API off embed.gog.com/userData.json — it fails outright for large wishlists"
area: store/gog
needs: code-fix-plus-test-rework
status: OPEN
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
