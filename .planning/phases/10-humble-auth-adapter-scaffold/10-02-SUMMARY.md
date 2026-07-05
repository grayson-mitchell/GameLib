---
phase: 10-humble-auth-adapter-scaffold
plan: 02
subsystem: auth
tags: [electron, browserwindow, safeStorage, humble, backend]

# Dependency graph
requires:
  - "AdapterResult<T>, HumbleUserData, HumbleAuthState contracts (src/common/types/humble.ts, Plan 01)"
  - "Humble constants: HUMBLE_TOKEN_STORE_KEY/PREFIX, HUMBLE_LOGIN_PARTITION, HUMBLE_BASE_URL/LOGIN_URL (Plan 01)"
  - "humbleConfigStore backend config store (Plan 01)"
  - "adapter.getAccountIdentity/getGamekeys (Plan 01)"
provides:
  - "HumbleUser static class: startLogin, reconnect, disconnect, isLoggedIn, getUserDetails, getCredentials, checkHealthAndFlagExpiry (src/backend/humble/user.ts)"
  - "humbleAuthState FrontendMessages channel (src/common/types/ipc.ts) — cookie-free push shape"
  - "encryptionDegraded/expired keys on humbleConfigStore (src/common/types/electron_store.ts)"
affects: [10-03, 10-04, 10-05, phase-11-library-sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BrowserWindow + isolated session.fromPartition('humble-login') as the sole Humble login surface — no WebView route"
    - "Cookie-detection: did-navigate/did-navigate-in-page hook + a 1.5s setInterval poll backstop, both feeding one shared checkCookie()"
    - "safeStorage + HUMBLE_TOKEN_PREFIX sentinel encryption, extended with a warn-and-store degraded-encryption signal (configStore.set('encryptionDegraded', true)) instead of Steam's log-only fallback"
    - "401 -> session_expired flips 'expired' + pushes humbleAuthState; 403 -> access_denied is a silent C5 backoff, never treated as expiry"
    - "Partition lifecycle split: startLogin()/reconnect() share the same openLoginWindow() helper (never clears the partition); disconnect() is the only path that calls the five clearX methods + configStore.clear()"

key-files:
  created:
    - src/backend/humble/user.ts
    - src/backend/humble/__tests__/user.test.ts
  modified:
    - src/common/types/electron_store.ts
    - src/common/types/ipc.ts

key-decisions:
  - "startLogin() and reconnect() are both thin wrappers over a shared private openLoginWindow() — D-11's 'reconnect keeps the partition' requirement falls out for free since neither path ever calls clearStorageData/clearCache/etc; only disconnect() does"
  - "getCredentials() returns the decrypted cookie as a plain string (not a {refreshToken} object like Steam) — Humble's credential is a single cookie value, an object wrapper would add no value"
  - "Registered humbleAuthState in FrontendMessages (ipc.ts) now, one plan ahead of Plan 03's own IPC-wiring task, because HumbleUser.checkHealthAndFlagExpiry() must call sendFrontendMessage('humbleAuthState', ...) for tsc --noEmit to pass this plan's own acceptance criterion; Plan 03 will find the channel already declared"
  - "Added encryptionDegraded/expired keys to humbleConfigStore's StoreStructure entry (electron_store.ts) — TypeCheckedStoreBackend.set() only type-checks keys registered on the store's StoreStructure entry"

requirements-completed: [HACCT-01, HACCT-02, HACCT-03]

duration: ~20min
completed: 2026-07-05
---

# Phase 10 Plan 02: Humble Auth + Adapter Scaffold - HumbleUser Auth Service Summary

**BrowserWindow-based Humble login against an isolated `humble-login` session partition, with safeStorage+HUMBLE_TOKEN_PREFIX cookie encryption (including a user-visible degraded-encryption signal on Linux-no-keyring), a 401-vs-403 startup/live health check, and a reconnect-keeps-partition / disconnect-wipes-partition split.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 completed (TDD: RED then GREEN)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- Built `HumbleUser` test-first (RED then GREEN): 13 tests covering silent-cancel-on-close (D-06), cookie capture + `humble:v1:`-prefixed encryption, the degraded-encryption user-visible signal (success criterion 5 / Pitfall 5), `checkHealthAndFlagExpiry`'s 401-vs-403 split (D-08), `reconnect()`'s partition-kept guarantee (D-11), `disconnect()`'s full five-method partition wipe + `configStore.clear()` (D-07), and an explicit "cookie never logged or stored raw" assertion (Pitfall 4)
- Login window opens against `session.fromPartition('humble-login')`, loads `HUMBLE_LOGIN_URL`, and watches for the `_simpleauth_sess` cookie via both `did-navigate`/`did-navigate-in-page` hooks and a 1.5s poll backstop; the moment it's captured, the cookie is encrypted, stored, the account identity is fetched (`adapter.getAccountIdentity`), and the window auto-closes, resolving `{ status: 'done', username }`
- Closing the window before any cookie appears resolves `{ status: 'waiting' }` with no error, no toast, no store writes (D-06)
- `checkHealthAndFlagExpiry()` calls `adapter.getGamekeys` with the stored cookie; a 401 (`session_expired`) sets `expired: true` and pushes the cookie-free `humbleAuthState` message; a 403 (`access_denied`) is intentionally a no-op (C5 backoff, never a re-login prompt)
- `reconnect()` and `startLogin()` share one `openLoginWindow()` helper that never calls any `clearX` method, so the `humble-login` partition (and any reduced-friction browser state) survives a reconnect by construction; `disconnect()` is the only path that wipes `clearStorageData`/`clearCache`/`clearAuthCache`/`clearHostResolverCache`/`clearData` plus `configStore.clear()`
- `npx tsc --noEmit` clean; `npx jest src/backend/humble/__tests__/*.test.ts` 33/33 passing (13 new + 20 from Plan 01's adapter suite); `npx eslint`/`npx prettier --check` clean (0 errors; warnings limited to the same `any`-in-mocks pattern already accepted in `steam/__tests__/user.test.ts`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing HumbleUser unit tests (RED)** - `b4e16f02` (test)
2. **Task 2: Implement HumbleUser (GREEN)** - `bc1ea499` (feat)

_Note: this is a TDD task per the plan's own instructions — RED and GREEN are separate commits._

## Files Created/Modified

- `src/backend/humble/user.ts` - `HumbleUser` static class: `startLogin`, `reconnect`, `disconnect`, `isLoggedIn`, `getUserDetails`, `getCredentials`, `checkHealthAndFlagExpiry`; private `openLoginWindow`/`finishLogin` helpers; `encryptCookie`/`decryptCookie` (safeStorage + `HUMBLE_TOKEN_PREFIX`)
- `src/backend/humble/__tests__/user.test.ts` - 13 tests: silent cancel, cookie capture + encryption, degraded-encryption signal, health check 401/403 split, reconnect partition-kept, disconnect full wipe, cookie-never-logged
- `src/common/types/electron_store.ts` (modified) - added `encryptionDegraded?: boolean` and `expired?: boolean` to the `humbleConfigStore` `StoreStructure` entry (Rule 3 auto-fix, see below)
- `src/common/types/ipc.ts` (modified) - added `humbleAuthState: (state: HumbleAuthState) => void` to `FrontendMessages`, imported `HumbleAuthState` from `./humble` (Rule 3 auto-fix, see below)

## Decisions Made

- `startLogin()`/`reconnect()` are both thin calls into one shared `openLoginWindow()` — this makes D-11 (reconnect keeps the partition) a structural guarantee rather than something that needs separate testing/maintenance: neither path ever references a `clearX` method, only `disconnect()` does.
- `getCredentials()` returns the decrypted cookie directly as `string | undefined`, not wrapped in an object like Steam's `{ refreshToken }` — there is only one credential value for Humble, so a wrapper object would add indirection with no benefit.
- The 1.5s `setInterval` poll is a deliberate backstop per Open Question 3 / the plan's explicit instruction — `did-navigate`/`did-navigate-in-page` alone may not fire on every SPA-style post-login state change on humblebundle.com (this remains `[ASSUMED]`, unverified against the live site until Plan 05's validation gate).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Registered `encryptionDegraded`/`expired` keys on `humbleConfigStore` in `StoreStructure`**
- **Found during:** Task 2 verification (`npx tsc --noEmit`)
- **Issue:** `TypeCheckedStoreBackend.set(key, value)`'s type signature computes `value`'s allowed type via `Get<StoreStructure[Name], KeyType>` and collapses to `never` when the key path doesn't exist on the store's registered type (`UnknownGuard`). Plan 01 registered `humbleConfigStore` with only `isLoggedIn`/`sessionCookie`/`userData`; without adding `encryptionDegraded`/`expired`, calls like `configStore.set('encryptionDegraded', true)` and `configStore.set('expired', true)` (both required by this plan's own task instructions) would fail to type-check.
- **Fix:** Added `encryptionDegraded?: boolean` and `expired?: boolean` to the `humbleConfigStore` entry in `src/common/types/electron_store.ts`.
- **Files modified:** `src/common/types/electron_store.ts`
- **Verification:** `npx tsc --noEmit` clean for `src/backend/humble`.
- **Committed in:** `bc1ea499` (Task 2 commit)

**2. [Rule 3 - Blocking] Added `humbleAuthState` to `FrontendMessages` in `ipc.ts`**
- **Found during:** Task 2 verification (`npx tsc --noEmit`)
- **Issue:** This plan's own task instructions require `checkHealthAndFlagExpiry()` to call `sendFrontendMessage('humbleAuthState', { isLoggedIn, username, expired })`. `sendFrontendMessage`'s generic signature (`backend/ipc.ts`) is constrained to `ChannelName extends keyof FrontendMessages` — the channel did not yet exist because it's formally Plan 03's task (`10-03-PLAN.md` Task 1). Without it, `npx tsc --noEmit` fails on `user.ts`, violating this plan's own acceptance criterion.
- **Fix:** Imported `HumbleAuthState` from `./humble` into `src/common/types/ipc.ts` and added `humbleAuthState: (state: HumbleAuthState) => void` to the `FrontendMessages` interface, with a comment noting the cookie-free contract (Pitfall 4 / T-10-05).
- **Files modified:** `src/common/types/ipc.ts`
- **Verification:** `npx tsc --noEmit` clean.
- **Committed in:** `bc1ea499` (Task 2 commit)
- **Note for Plan 03:** `10-03-PLAN.md` Task 1 also instructs adding this exact channel signature to `ipc.ts`. That plan's executor will find it already present — no conflicting change needed, just skip re-adding it (the channel name, shape, and "no colon" convention already match Plan 03's own acceptance criteria verbatim).

---

**Total deviations:** 2 auto-fixed (both Rule 3, blocking type-check issues required by this plan's own task instructions)
**Impact on plan:** No scope creep beyond the two necessary type-registration edits — no new files, no new behavior. Both fixes are required for this plan's own stated acceptance criteria (`npx tsc --noEmit` clean) to pass, and both are pre-existing intent from the phase's own downstream plan (10-03), just landed one plan earlier than originally scheduled.

## Issues Encountered

None beyond the two auto-fixed items above.

## User Setup Required

None - no external service configuration required. Zero new npm packages (electron's `BrowserWindow`/`session`/`safeStorage` are already used elsewhere in this codebase).

## Next Phase Readiness

- `HumbleUser.startLogin()`, `getUserDetails()`, `checkHealthAndFlagExpiry()`, `reconnect()`, `disconnect()`, and `isLoggedIn()` are all in place and fully tested — Plan 03 (typed IPC wiring: `ipc_handler.ts`, `preload/api/humble.ts`, `main.ts` registration) can now bind directly to these methods without guessing signatures.
- Plan 03 will find `humbleAuthState` already declared in `ipc.ts`'s `FrontendMessages` (added here as a Rule 3 blocking auto-fix) — its own Task 1 instructions to add this channel are already satisfied; the executor should verify-and-skip rather than re-add.
- The 1.5s cookie-poll cadence and the `did-navigate`/`did-navigate-in-page` hook combination remain `[ASSUMED]` per RESEARCH.md — Plan 05's live validation gate is the first point this gets exercised against the real humblebundle.com login page.
- No blockers.

---
*Phase: 10-humble-auth-adapter-scaffold*
*Completed: 2026-07-05*

## Self-Check: PASSED

All 3 created/modified files verified present on disk; both commit hashes (`b4e16f02`, `bc1ea499`) verified present in `git log --oneline --all`.
