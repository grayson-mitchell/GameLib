---
phase: 10-humble-auth-adapter-scaffold
plan: 03
subsystem: ipc
tags: [electron, ipc, preload, humble, backend]

# Dependency graph
requires:
  - "HumbleUser static class: startLogin, getUserDetails, reconnect, checkHealthAndFlagExpiry, disconnect (src/backend/humble/user.ts, Plan 02)"
  - "humbleAuthState already present in FrontendMessages (src/common/types/ipc.ts, added early as a Plan 02 Rule 3 auto-fix)"
provides:
  - "Typed Humble AsyncIPCFunctions signatures: humbleStartLogin, humbleGetUserInfo, humbleReconnect, humbleCheckHealth (src/common/types/ipc.ts)"
  - "humbleDisconnect sync/listener channel (src/common/types/ipc.ts)"
  - "registerHumbleIpcHandlers() backend handler registration (src/backend/humble/ipc_handler.ts)"
  - "window.api.humble* preload bridge + handleHumbleAuthState push listener slot (src/preload/api/humble.ts)"
affects: [10-04, 10-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "registerHumbleIpcHandlers() grouped in its own file (src/backend/humble/ipc_handler.ts) rather than inlined in main.ts, per 10-PATTERNS.md's recommendation for Humble's larger IPC surface (5 channels vs. Steam's inline block)"
    - "addHandler callbacks return the underlying HumbleUser method's result directly (no unnecessary async wrapper) where the method itself is not async, avoiding no-op async/require-await lint warnings"

key-files:
  created:
    - src/backend/humble/ipc_handler.ts
    - src/preload/api/humble.ts
  modified:
    - src/common/types/ipc.ts
    - src/preload/api/index.ts
    - src/backend/main.ts

key-decisions:
  - "humbleAuthState was already declared in FrontendMessages by Plan 02 (documented there as a Rule 3 blocking auto-fix) — verified present and left untouched rather than re-added, per Plan 02's summary note and the orchestrator's instruction"
  - "humbleCheckHealth and humbleGetUserInfo handlers call the corresponding HumbleUser method directly without an async wrapper (HumbleUser.getUserDetails() and disconnect() are not async / addHandler's type accepts either a Promise or the Awaited value) — keeps the handler registration file lint-clean with zero no-op async warnings"
  - "humbleDisconnect listener calls HumbleUser.disconnect() with a leading void operator (fire-and-forget, matching the sync/listener IPC contract's void return type) rather than awaiting it in place"

requirements-completed: [HACCT-01, HACCT-02, HACCT-03]

duration: ~15min
completed: 2026-07-05
---

# Phase 10 Plan 03: Humble Auth + Adapter Scaffold - Typed IPC Wiring Summary

**Typed IPC surface (types -> handler -> preload -> main registration) connecting the renderer to `HumbleUser`'s login/reconnect/health-check/disconnect methods, all unprefixed camelCase channels with the cookie structurally excluded from `humbleAuthState`.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2 completed
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Added `humbleStartLogin`, `humbleGetUserInfo`, `humbleReconnect`, `humbleCheckHealth` to `AsyncIPCFunctions` and `humbleDisconnect` to the sync/listener section of `src/common/types/ipc.ts`, matching the plan's exact signatures (`{ status: 'done' | 'waiting' | 'error'; username?: string }` for login-shaped results, `HumbleUserData | undefined` for user info, `void` for health check)
- Confirmed `humbleAuthState` was already present in `FrontendMessages` (landed one plan early by Plan 02 as a documented Rule 3 auto-fix) — verified it matches this plan's own acceptance criteria (cookie-free `{ isLoggedIn; username?; expired? }` shape) and left it untouched, no duplicate addition
- Created `src/backend/humble/ipc_handler.ts` exporting `registerHumbleIpcHandlers()`, binding all five channels to `HumbleUser.startLogin`/`getUserDetails`/`reconnect`/`checkHealthAndFlagExpiry`/`disconnect` via `addHandler`/`addListener`
- Created `src/preload/api/humble.ts` mirroring `steam.ts`'s invoker/caller pattern exactly: four `makeHandlerInvoker` exports, one `makeListenerCaller` for disconnect, and a `frontendListenerSlot('humbleAuthState')` push listener slot named `handleHumbleAuthState`
- Registered the new `Humble` module in `src/preload/api/index.ts`'s aggregation object and called `registerHumbleIpcHandlers()` once from `src/backend/main.ts`, immediately after the existing Steam handler block
- `npx tsc --noEmit` clean across common/backend/preload; `npx eslint` on all touched/created Humble files reports 0 errors and 0 warnings; `grep -c "humble:" src/common/types/ipc.ts` returns 0 (no colon-namespaced channels); `registerHumbleIpcHandlers` appears twice in `main.ts` (import + call)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Humble IPC signatures and backend handler registration** - `155e5715` (feat)
2. **Task 2: Add preload bridge and register handlers in main.ts** - `716a3052` (feat)

## Files Created/Modified

- `src/common/types/ipc.ts` (modified) - added `humbleStartLogin`/`humbleGetUserInfo`/`humbleReconnect`/`humbleCheckHealth` to `AsyncIPCFunctions`, `humbleDisconnect` to the sync section; imported `HumbleUserData` alongside the already-imported `HumbleAuthState`
- `src/backend/humble/ipc_handler.ts` - new file, exports `registerHumbleIpcHandlers()` binding all five Humble channels to `HumbleUser` methods
- `src/preload/api/humble.ts` - new file, `window.api.humble*` invoker/caller bridge + `handleHumbleAuthState` push slot
- `src/preload/api/index.ts` (modified) - added `import * as Humble from './humble'` and `...Humble` to the exported aggregate
- `src/backend/main.ts` (modified) - imported `registerHumbleIpcHandlers` and called it once, next to the Steam handler registration block

## Decisions Made

- Kept `registerHumbleIpcHandlers()` in its own file rather than inlining in `main.ts` like Steam does, following 10-PATTERNS.md's explicit recommendation given Humble's larger 5-channel surface.
- Dropped unnecessary `async` wrappers on `humbleGetUserInfo` (`HumbleUser.getUserDetails()` is synchronous) and `humbleCheckHealth` (already returns the needed `Promise<void>` directly) to avoid `@typescript-eslint/require-await` no-op warnings — `addHandler`'s type signature accepts either the `Promise` or the `Awaited` value, so no wrapper is required.
- `humbleDisconnect`'s listener calls `HumbleUser.disconnect()` prefixed with `void` (fire-and-forget), consistent with the sync/listener contract's `() => void` signature and how `logoutSteam`/`logoutGOG`/`logoutZoom` are registered elsewhere in `main.ts`.

## Deviations from Plan

None - plan executed exactly as written. The one thing that could be mistaken for a deviation — `humbleAuthState` already existing in `ipc.ts` — was explicitly anticipated by Plan 02's summary and the orchestrator's note; this plan's Task 1 verified it was present and correct rather than re-adding it, which is what the plan's own read_first/interfaces section implied it should do.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Zero new npm packages.

## Next Phase Readiness

- `window.api.humbleStartLogin()`, `humbleGetUserInfo()`, `humbleReconnect()`, `humbleCheckHealth()`, `humbleDisconnect()`, and `window.api.handleHumbleAuthState(...)` are all available to the renderer — Plan 04 (frontend Manage Accounts tile + GlobalState `humble` slice) can consume these directly without guessing signatures.
- `humbleCheckHealth` is wired end-to-end so Plan 04 can invoke it on startup per D-08 (the only expiry-detection trigger this phase).
- No blockers.

---
*Phase: 10-humble-auth-adapter-scaffold*
*Completed: 2026-07-05*

## Self-Check: PASSED

All 5 created/modified files verified present on disk; both commit hashes (`155e5715`, `716a3052`) verified present in `git log --oneline --all`.
