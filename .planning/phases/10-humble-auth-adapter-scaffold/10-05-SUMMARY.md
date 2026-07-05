---
phase: 10-humble-auth-adapter-scaffold
plan: 05
subsystem: auth
tags: [electron, webview, session-cookies, humble, react, ipc]

# Dependency graph
requires:
  - phase: 10-humble-auth-adapter-scaffold
    provides: "C5 adapter boundary (getGamekeys/getAccountIdentity), HumbleUser scaffold, IPC/preload wiring, Manage Accounts tile (plans 10-01..10-04)"
provides:
  - "Humble login re-pointed from the retired popup BrowserWindow to the embedded /loginweb/humble Stores WebView (D-05)"
  - "persist:humble Chromium-persistent partition (D-18) shared between the renderer webview and the main-process cookie watch"
  - "gamekeys-based login acceptance gate (D-16) with best-effort post-acceptance identity fetch (D-02)"
  - "stopLogin()/notifyLoginNavigated() static watch controls + humbleStopLogin/humbleLoginNavigated/humbleGetLoginUserAgent IPC channels"
  - "humbleLoginPath exported from frontend/screens/Login as the single source of truth; HumbleConnect and the humble-connect route deleted"
affects: [10-06, phase-11-humble-library]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Main-process session watch (poll + forced-revalidation handle) replacing a BrowserWindow-hosted login flow, while preserving the throttle/single-flight state machine verbatim"
    - "Login acceptance gated on a data-endpoint 200+schema check (getGamekeys) rather than an identity/profile endpoint, with identity fetched best-effort after acceptance"

key-files:
  created: []
  modified:
    - src/backend/humble/constants.ts
    - src/backend/humble/user.ts
    - src/backend/humble/__tests__/user.test.ts
    - src/common/types/ipc.ts
    - src/backend/humble/ipc_handler.ts
    - src/preload/api/humble.ts
    - src/frontend/screens/WebView/index.tsx
    - src/frontend/screens/Login/index.tsx
    - src/frontend/App.tsx
    - src/frontend/components/UI/HumbleExpiryToast/index.tsx
  deleted:
    - src/frontend/screens/Login/components/HumbleConnect/index.tsx

key-decisions:
  - "Login validation now shares one proven call (getGamekeys/D-16) with the D-13 live-validation gate criterion #1, rather than a separate assumed identity endpoint"
  - "HumbleConnect's popup-era bridge is deleted outright rather than refactored (D-17 disposition), since its only job (start login + navigate back) is now handled by the WebView route effect"
  - "HumbleExpiryToast imports humbleLoginPath from the full Login screen module (frontend/screens/Login) per the plan's explicit instruction, rather than a smaller shared constants file — accepted as written since Login/index.tsx is already the sibling-login-path source of truth for every other runner"

requirements-completed: [HACCT-01, HACCT-02, HACCT-03]

# Metrics
duration: ~30min
completed: 2026-07-05
---

# Phase 10 Plan 05: Humble WebView Login + Gamekeys Acceptance Gate Summary

Re-pointed Humble Bundle login from the parked popup BrowserWindow to the embedded Stores `/loginweb/humble` WebView, switched the login-success gate from the never-validated identity endpoint to the proven `getGamekeys` (D-16) call, and made identity fetch best-effort so a failed identity call can never block login again.

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-07-05
- **Tasks:** 2/2 completed
- **Files modified:** 10 (+ 1 deleted)

## Accomplishments

- `HumbleUser` login/reconnect is now a main-process watch over the shared `persist:humble` partition (D-18) instead of a BrowserWindow — the poll+throttle+single-flight discipline from commits `dec7910d`/`3e6a141b`/`f824e9a3`/`701fdf9d` was preserved and re-pointed, not rewritten (D-17)
- Login acceptance gate is now `getGamekeys` 200+zod (D-16); `getAccountIdentity` runs best-effort after acceptance and never blocks `{ status: 'done' }` (D-02)
- Added `stopLogin()` (D-06 silent cancel) and `notifyLoginNavigated()` (D-17 forced re-validation) static controls, wired to three new IPC channels: `humbleStopLogin`, `humbleLoginNavigated`, `humbleGetLoginUserAgent`
- `/loginweb/humble` is a new embedded WebView route matching the Epic/GOG/Amazon UX: `persist:humble` partition, fetched standard-Chrome UA applied via the `useragent` attribute (not the generic fake Chrome UA used by other login runners), drives `humbleStartLogin`/`humbleReconnect` on mount and `humbleStopLogin` on unmount
- `humbleLoginPath` is now exported from `frontend/screens/Login` as the single source of truth (`/loginweb/humble`); the retired `humble-connect` route and `HumbleConnect` component are deleted; the D-09 reconnect toast (`HumbleExpiryToast`) is re-pointed at the new source

## Task Commits

1. **Task 1: Re-point the HumbleUser login watch at persist:humble, gamekeys acceptance, and add stop/nav/UA IPC** - `990b717e` (feat)
2. **Task 2: Add the /loginweb/humble WebView surface, wire the tile to it, and retire the popup/HumbleConnect path** - `49b77144` (feat)

_Note: no TDD RED/GREEN/REFACTOR gate applies — the plan is `type: execute`, not `type: tdd`; Task 1 updated its test file alongside the implementation in a single commit per the plan's `tdd="true"` task attribute allowance for scaffold rework._

## Files Created/Modified

- `src/backend/humble/constants.ts` - `HUMBLE_LOGIN_PARTITION` renamed from `'humble-login'` to `'persist:humble'` (D-18)
- `src/backend/humble/user.ts` - BrowserWindow removed; login is now a main-process watch with `stopLogin()`/`notifyLoginNavigated()`; acceptance gate switched to `getGamekeys`; identity fetch is best-effort
- `src/backend/humble/__tests__/user.test.ts` - Dropped the BrowserWindow mock; drives the watch via `notifyLoginNavigated()`/`stopLogin()`; added best-effort-identity and stopLogin test cases
- `src/common/types/ipc.ts` - Added `humbleStopLogin`, `humbleLoginNavigated` (sync) and `humbleGetLoginUserAgent` (async) channel types
- `src/backend/humble/ipc_handler.ts` - Registered the three new channels against `HumbleUser`/`standardBrowserUserAgent`
- `src/preload/api/humble.ts` - Exported the matching preload invokers/listener callers
- `src/frontend/screens/WebView/index.tsx` - Added `/loginweb/humble` URL mapping, `persist:humble` partition branch, fetched-UA render gate + `useragent` attribute, login-watch driver effect, and navigation relay to `humbleLoginNavigated`
- `src/frontend/screens/Login/index.tsx` - Now exports `humbleLoginPath = '/loginweb/humble'`; removed the `HumbleConnect` import
- `src/frontend/App.tsx` - Removed the `humble-connect` route entry
- `src/frontend/components/UI/HumbleExpiryToast/index.tsx` - Re-pointed its `humbleLoginPath` import to `frontend/screens/Login`
- `src/frontend/screens/Login/components/HumbleConnect/index.tsx` - Deleted (retired popup-era bridge component)

## Decisions Made

- Kept `HUMBLE_LOGIN_URL` in `constants.ts` even though `user.ts` no longer references it — the plan's action only specified renaming the partition value, and the WebView screen defines its own inline `humbleLoginUrl` constant (matching the existing `gogLoginUrl`/`zoomLoginUrl` inline-constant convention in that file) rather than importing across the backend/frontend boundary.
- `finishLogin`'s status-only diagnostic breadcrumb text was updated from `"Humble identity check rejected candidate session: <status>"` to `"Humble login validation rejected candidate session: <status>"` to reflect the new gamekeys-based gate, per the plan's explicit breadcrumb wording in the Task 1 action.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance criteria were verified directly (jest, tsc, eslint, and the specified grep checks) with no auto-fixes needed.

## Known Stubs

None - both tasks wire real behavior end-to-end (main-process watch resolves via the real IPC channels; the WebView renders the real Humble login page and applies the real fetched UA).

## Threat Flags

None - all trust-boundary-relevant surface (renderer webview → humblebundle.com, persist:humble cookie store ↔ main process, main → renderer IPC) matches the plan's `<threat_model>` register (T-10-19..T-10-21) with no new endpoints, auth paths, or schema changes introduced.

## Verification Results

- `npx jest src/backend/humble/__tests__/*.test.ts --no-coverage` → 2 suites, 44 tests, all passing
- `npx tsc --noEmit` → exits 0 across the whole project (confirms the deleted `HumbleConnect` import breaks nothing, including `HumbleExpiryToast`)
- `npx eslint` on all task-modified files → 0 errors (pre-existing warning patterns only: `no-floating-promises`/`exhaustive-deps` warnings consistent with the surrounding file's existing style)
- Static trace confirmed: humble tile's `loginUrl` resolves to `/loginweb/humble`; `persist:humble` partition wired on both the webview element and the main-process watch; `humble-connect` route and `HumbleConnect` component fully removed; `HumbleExpiryToast` imports `humbleLoginPath` from `frontend/screens/Login`

## Next Steps

- Plan 10-06 (or a follow-up UAT pass) must exercise the real login flow end-to-end with a live Humble account to confirm the gamekeys-based gate accepts a real authenticated session and the D-13 live validation gate criteria pass (`10-VALIDATION.md`, per D-15).
- Full live UAT and the validation gate remain deferred per this plan's stated success criteria.

## Self-Check: PASSED

All 10 modified files and the 1 deleted file were confirmed present/absent on disk; both task commit hashes (`990b717e`, `49b77144`) were confirmed present in git log.
