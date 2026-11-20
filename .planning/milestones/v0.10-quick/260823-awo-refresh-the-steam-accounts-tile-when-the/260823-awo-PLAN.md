---
quick_id: 260823-awo
description: Refresh the Steam accounts tile when the login overlay closes so a completed sign-in clears the expired label
date: 2026-08-23
mode: quick
---

# Quick Task 260823-awo: the tile must stop saying "expired" once you sign back in

## Problem

Found by the user during `260823-ai6`'s UAT. After signing back in from the
"Sign-in expired — Reconnect" tile, **the tile kept saying "Sign-in expired"**. Navigating away
and back cleared it.

This is the inverse of the defect the pair was built to fix: instead of the UI claiming a live
session that is dead, it now claimed a dead session that is live. Same class — the UI
contradicting reality — so it is worth fixing rather than tolerating.

## Cause

`Login/index.tsx`'s store-tile effect is keyed on
`[epic.username, gog.username, amazon.user_id, zoom.username, steam?.username,
humble?.isLoggedIn, humble?.expired, t]`.

`GlobalState.steamLogin` writes `username: result.username` — **the same persona name the tile
already had**. So `steam?.username` goes `"Grayson"` → `"Grayson"`: no dep moves, the effect
never re-runs, and the stale `steamCredentialsMissing: true` survives in local state. Only an
unmount/remount re-runs the `useState` initialiser, which is why navigating away "fixed" it.

Note this is *not* the same as the previously documented "mount-time read" caveat, which
assumed a dep would eventually move. Nothing moves on a re-login by the same account.

## Fix

Add `openOverlay` to the effect's dependency array. It flips `'steam'` → `null` the moment the
login dialog dismisses, which is the one point where `credentialsMissing` can go true → false
while this screen stays mounted.

Rejected alternative: subscribing to store changes. `TypeCheckedStoreFrontend` exposes only
`has/get/set/delete` — there is no subscription API, and building one is far beyond this fix.

## Tasks

### Task 1 — Add the dependency

**files:** `src/frontend/screens/Login/index.tsx`

**action:** Add `openOverlay` to the dep array, with a comment stating why none of the existing
deps move on a re-login.

**verify:** `pnpm exec tsc --noEmit`; `pnpm exec jest src/frontend`.

**done:** A completed sign-in re-runs the effect and re-reads the flag.

### Task 2 — Source-level gate

**files:** `src/frontend/screens/Login/__tests__/steamTileRefreshOnDismiss.test.ts`

**action:** Assert the dependency is present, that the effect re-reads the store, and prove the
gate can go red by deleting the dep line from a specimen.

**Why source-level:** the Frontend jest project runs `testEnvironment: 'node'` with no jsdom, so
no test here can mount a component or observe a dependency array. A dep-array omission is
invisible to every other kind of test available in this project — which is exactly how it
shipped. Same technique as `Library/__tests__/librarySyncNoticeSource.test.ts`.

**MUST strip comments before matching.** The comment explaining the fix names `openOverlay`, so
a gate asserting against raw source passes even with the dependency deleted.

**done:** Deleting the dependency fails the suite.

## Must haves

- Signing in clears the expired label without navigating away.
- The gate is red-proved, and cannot be satisfied by a comment.
- No new store-subscription machinery.
