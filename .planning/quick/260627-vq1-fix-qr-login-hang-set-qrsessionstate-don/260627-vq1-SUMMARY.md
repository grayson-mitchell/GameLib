---
phase: quick
plan: 260627-vq1
subsystem: steam-auth
tags: [bug-fix, qr-login, timeout, async]
dependency_graph:
  requires: []
  provides: [non-blocking-qr-login, cm-connect-timeout]
  affects: [startQRLogin, connectSteamUserClient, pollQRLogin]
tech_stack:
  added: []
  patterns: [background-promise, clearTimeout-on-resolve]
key_files:
  modified:
    - src/backend/storeManagers/steam/user.ts
    - src/backend/storeManagers/steam/__tests__/user.test.ts
decisions:
  - Store credentials and set qrSessionState=done synchronously in QR authenticated handler; defer CM persona-name fetch to background .then()
  - Call clearTimeout at the top of both loggedOn and error handlers (before any async work) to prevent the timer from firing after the promise already resolved via loggedOn
metrics:
  duration: ~5 minutes
  completed: 2026-06-27
  tasks_completed: 2
  tasks_total: 2
---

# Phase quick Plan 260627-vq1: Fix QR Login Hang (Set qrSessionState=done Synchronously) Summary

**One-liner:** Decouple QR login completion from Steam CM connection by inlining credential storage and setting `qrSessionState=done` before firing `connectSteamUserClient` as a background promise; add a 15s timeout guard to prevent indefinite CM hang.

## Tasks Completed

| Task | Name | Status |
|------|------|--------|
| 1 | Add 15s timeout to connectSteamUserClient() | Done |
| 2 | Set qrSessionState=done immediately, connect CM in background | Done |

## What Changed

### Task 1 — 15s timeout in `connectSteamUserClient()`

`connectSteamUserClient()` previously had no timeout. If the Steam CM `loggedOn` event never fired (network hiccup, server unresponsive), the returned Promise would hang forever, blocking every auth path that called it.

**Fix:** Inside the `new Promise<string>` constructor, a `setTimeout(() => resolve('Steam User'), 15000)` is registered immediately. Both the `loggedOn` handler and the `error` handler call `clearTimeout(timeout)` as their very first statement (before any async work), so the timer is always cancelled if either event fires normally. If neither fires within 15s, the promise resolves with the `'Steam User'` fallback — identical to the existing error-path fallback for consistency.

This protects all three flows that call `connectSteamUserClient`: credential login via `finishAuth()`, SteamGuard submit via `finishAuth()`, and QR background connect.

### Task 2 — Immediate `qrSessionState=done` in QR `authenticated` handler

The root cause of the hang: `session.once('authenticated', async () => { ... await this.finishAuth(...) ... })`. `finishAuth` awaited `connectSteamUserClient`, which awaited `loggedOn`. The frontend poll kept seeing `waiting` until the CM handshake completed — which could take seconds or never happen.

**Fix:** The `authenticated` handler was restructured:
1. Inline the first two lines of `finishAuth`: encrypt token, write `TOKEN_STORE_KEY`, set `isLoggedIn: true`.
2. Immediately set `this.qrSessionState = { status: 'done', username: undefined }` — the frontend poll unblocks at the next tick.
3. Fire `this.connectSteamUserClient(session.refreshToken)` as an **unawaited** background promise. In the `.then()` callback, `configStore.set('userData', { username, steamId })` is written once the persona name is available. In the `.catch()` callback, a warning is logged — the user remains logged in because credentials were already stored in step 1.

`finishAuth()` itself is unchanged and continues to serve the credential and SteamGuard paths (which block until CM resolves — acceptable since those paths do not use `qrSessionState`).

## Test Changes

- `'returns { status: "done", username } after authenticated event fires'` — renamed and updated: `username` is now `undefined` at poll time (CM connection is background). Assertion changed from `typeof result.username === 'string'` to `result.username === undefined`.
- New `describe('connectSteamUserClient() — timeout guard')` block with two tests:
  - Verifies `pollQRLogin` returns `done` immediately even when `logOn` never triggers `loggedOn`.
  - Uses `jest.useFakeTimers()` to advance 15001ms and verifies `userData` is written with `username: 'Steam User'` via the background `.then()`.

Total: 36 tests pass (was 35 before new tests were added).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The `username: undefined` in the immediate poll response is intentional and documented behavior: the persona name is filled asynchronously via `userData` configStore key once the CM connection resolves.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes introduced.

## Self-Check

- [x] `src/backend/storeManagers/steam/user.ts` — modified, verified with grep
- [x] `src/backend/storeManagers/steam/__tests__/user.test.ts` — modified, 36/36 tests pass
- [x] `setTimeout` at line 147 of user.ts
- [x] `qrSessionState = { status: 'done'` at line 221 of user.ts (inside QR authenticated handler)
- [x] `await this.finishAuth` absent from `startQRLogin` (only present in credential/guard paths at lines 306, 348)

## Self-Check: PASSED
