---
phase: quick-260629-9ly
plan: 01
subsystem: steam-auth
tags: [bug-fix, race-condition, qr-login, steam-library]
depends_on:
  requires: [260627-vq1]
  provides: [AUTH-01, LIB-01]
  affects: [steam-user, steam-login-ui]
tech_stack:
  added: []
  patterns: [connectingPromise-dedupe, username-gate-polling]
key_files:
  created: []
  modified:
    - src/backend/storeManagers/steam/user.ts
    - src/frontend/screens/Login/components/SteamLogin/index.tsx
    - src/backend/storeManagers/steam/__tests__/user.test.ts
decisions:
  - connectingPromise assigned in QR authenticated handler so concurrent ensureConnected dedupes
  - Frontend gates finalization on truthy poll.username to defer until persona arrives
  - logout() now clears connectingPromise to prevent stale-promise await on re-login
metrics:
  duration: 6m
  completed: 2026-06-29
  tasks: 3
  files_modified: 3
---

# Quick Task 260629-9ly: Fix QR-Login Library Race Summary

**One-liner:** connectingPromise dedupe in QR authenticated handler + frontend username gate prevent Steam library from staying invisible after QR login.

## What Was Built

Two surgical source changes and new unit tests fixing the QR-login -> Steam-library race (v1.0 audit blockers AUTH-01 / LIB-01):

**Root cause 1 (backend):** QR `authenticated` handler called `connectSteamUserClient` as fire-and-forget (`void`). When post-login `refreshLibrary('steam')` triggered `ensureConnected()`, it saw `this.connectingPromise === null` and started a **second** `connectSteamUserClient`. `connectSteamUserClient` always calls `this.client.logOff()` first -- killing the first client and resolving it with the 'Steam User' fallback, overwriting the real persona name in `userData`.

**Root cause 2 (frontend):** The QR poll handler finalized login (called `steam.login` + navigated) as soon as `poll.status === 'done'`, even when `poll.username` was `undefined`. `makeLibrary()` gates Steam inclusion on `steam?.username`, so the library stayed invisible until an app reload.

**Fix 1 -- Backend `user.ts`:** Changed the QR `authenticated` handler to capture the background connect in `this.connectingPromise` (with `.finally(() => { this.connectingPromise = null })`) -- exactly mirroring the `ensureConnected` dedupe pattern. Also added `this.connectingPromise = null` to `SteamUser.logout()` so post-logout reconnection does not await a stale QR-connect promise.

**Fix 2 -- Frontend `SteamLogin/index.tsx`:** Split `poll.status === 'done'` into two branches: when `poll.username` is truthy, finalize as before; when falsy, show `qr-confirmed` UI state and keep polling. The background connect always resolves within 15s (worst case: 'Steam User' fallback), so a subsequent poll carries the username and finalizes cleanly.

**Fix 3 -- Tests `user.test.ts`:** Added "QR race fix (260629-9ly)" describe block with two new tests:
- Test (a): fires `authenticated` with logOn not triggering loggedOn, verifies `pollQRLogin()` returns `{status:'done', username:undefined}`, then fires `loggedOn` and verifies username becomes 'TestUser'.
- Test (b): fires `authenticated`, clears call counts, calls `ensureConnected()` with steamID temporarily null (forces past early-return check), asserts 0 new `logOn`/`logOff`/`MockSteamUserLib` calls and final `userData.username === 'TestUser'`.

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 -- Backend dedupe | 4ffdd32 | fix(260629-9ly-01): assign QR background connect to connectingPromise |
| Task 2 -- Frontend gate | e84bf78 | fix(260629-9ly-02): gate QR login finalization on truthy poll.username |
| Task 3 -- Tests | a3427bf | test(260629-9ly-03): cover username-then-populated and connectingPromise dedupe |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SteamUser.logout() did not clear this.connectingPromise**
- **Found during:** Task 1 verification (test run after backend change)
- **Issue:** `logout()` reset `client`, `session`, and `qrSessionState` but not `connectingPromise`. With our fix, the QR `authenticated` handler now sets `connectingPromise`. When a subsequent test called `logout()` followed by `ensureConnected()`, `ensureConnected` found a non-null `connectingPromise` from a previous QR session and awaited it -- the "reconnects with the stored refresh token" test timed out at 5s.
- **Fix:** Added `this.connectingPromise = null` to `logout()` with an explanatory comment. Semantically correct: logout must reset all connection state.
- **Files modified:** `src/backend/storeManagers/steam/user.ts`
- **Commit:** 4ffdd32 (included in Task 1 commit)

## Success Criteria Verification

- [x] QR authenticated handler assigns `this.connectingPromise` so concurrent `ensureConnected()` dedupes (no second connectSteamUserClient, no persona-name overwrite).
- [x] Frontend QR poll handler finalizes login only when `poll.username` is truthy; otherwise stays in `qr-confirmed` and keeps polling.
- [x] 260627-vq1 hang fix preserved: synchronous token store + isLoggedIn + qrSessionState='done' before the CM connect.
- [x] Zero new npm packages; steam-* calls main-process only.
- [x] New unit tests (a) and (b) cover both behaviors and pass (132 total tests, up from 130).
- [x] `npm run codecheck` passes (TypeScript clean).
- [x] `npm test -- --testPathPattern=steam` passes (6 suites, 132 tests).
- [ ] Manual re-audit: after QR approval the Steam library appears without reload, showing the real persona name. (Requires running device -- covered by code correctness; frontend gating noted in test comment.)

## Self-Check: PASSED

Files exist:
- [x] `src/backend/storeManagers/steam/user.ts` -- contains `this.connectingPromise`
- [x] `src/frontend/screens/Login/components/SteamLogin/index.tsx` -- contains `poll.username`
- [x] `src/backend/storeManagers/steam/__tests__/user.test.ts` -- contains "QR race fix (260629-9ly)"

Commits exist:
- [x] 4ffdd32 -- fix(260629-9ly-01)
- [x] e84bf78 -- fix(260629-9ly-02)
- [x] a3427bf -- test(260629-9ly-03)
