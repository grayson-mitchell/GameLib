---
phase: 27-tauri-shell-walking-skeleton
plan: 04
subsystem: infra
tags: [tauri, sidecar, steam, jsonrpc, headless-logging, jest-manual-mocks]

# Dependency graph
requires:
  - phase: 27-tauri-shell-walking-skeleton (27-02)
    provides: "src/backend/sidecar/* headless Node sidecar (electronStub, fileStore, sidecarRpc, bootstrap, handlers placeholder)"
  - phase: 27-tauri-shell-walking-skeleton (27-03)
    provides: "src/preload/tauriTransport.ts + tauriAttach.ts renderer bridge, SIDECAR_STORE_SNAPSHOT contract (unregistered sidecar-side)"
provides:
  - "src/backend/sidecar/steamFlowRegistration.ts — curated refreshLibrary + launch invoke handlers against the REAL SteamLibraryManager.refresh()/SteamGame.launch(), unchanged"
  - "src/backend/sidecar/handlers.ts expanded: registerSteamFlows() + a sidecar:store-snapshot handler (configStore + steamConfigStore, refreshToken excluded at the source)"
  - "backend/logger's initHeadless() (backend/logger/index.ts) — headless-safe LogWriter init, no GlobalConfig/system-info-dump side effects"
  - "src/backend/sidecar/__tests__/skeletonFlows.test.ts — 4-assertion E2E proof of both flows through the real sidecar RPC transport"
affects: ["27-05 (live npm run tauri:dev hardware run against these real handlers)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "jest.mock('electron', () => jest.requireActual('../electronStub')) / jest.mock('electron-store', () => ({default: jest.requireActual('../fileStore').default})) — routes Jest's own auto-applied node_modules manual mocks (src/backend/__mocks__/electron.ts, electron-store.ts, which pre-empt bootstrap.ts's Module._load hook INSIDE Jest) at the real sidecar shims, so integration tests exercise the actual transport bridge instead of generic fixtures"
    - "Headless logger init split: backend/logger's real init() (Electron-app-only: GlobalConfig + system-info dump) vs a new additive initHeadless() (same LogWriter singleton, no Electron-app side effects) — the sidecar calls the latter, Electron's main process is completely unaffected"

key-files:
  created:
    - src/backend/sidecar/steamFlowRegistration.ts
    - src/backend/sidecar/__tests__/skeletonFlows.test.ts
  modified:
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/logger/index.ts

key-decisions:
  - "launch's SteamGame.launch() call passes an unused-by-the-native-branch LogWriter placeholder (undefined as unknown as LogWriter) rather than constructing a real one — the parameter is dead in the shared Game interface signature for this branch, and a per-game log-file lifecycle belongs to launcher.ts's full pipeline, explicitly out of scope per the plan's own objective"
  - "sidecar:store-snapshot's channel literal ('sidecar:store-snapshot') is hardcoded in handlers.ts rather than added as a new shared constant in sidecarTransport.ts, since that file was not in this plan's declared file scope — it mirrors src-tauri/src/main.rs's own STORE_SNAPSHOT_CHANNEL literal exactly"
  - "initHeadless() is a small additive export, not a modification to backend/logger's existing init() — Electron's own main.ts startup path is byte-identical to before this plan"

requirements-completed: [REQ-27-04, REQ-27-05]

# Metrics
duration: ~75min
completed: 2026-07-21
---

# Phase 27 Plan 04: Sidecar Steam Read/Action Flow Wiring Summary

Wired the Steam library read flow (`refreshLibrary` → real `SteamLibraryManager.refresh()` → per-game `pushGameToLibrary` push) and the steam:// action flow (`launch` → real `SteamGame.launch()`'s native branch → `buildSteamProtocolUrl` + `shell.openExternal`) through the sidecar's curated 4-channel surface, proven end-to-end by a real in-process RPC transport test — and fixed a genuine headless-logging gap (`backend/logger`'s `heroicLogWriter` was never assigned outside Electron's own startup path) that would have crashed every real flow handler call.

## Performance

- **Duration:** ~75 min
- **Completed:** 2026-07-21
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- `steamFlowRegistration.ts` registers exactly `refreshLibrary` and `launch` against electronStub's `ipcMain`, importing the REAL `SteamLibraryManager`/`SteamGame` classes — `refreshLibrary` reuses `refresh()`'s own existing `sendFrontendMessage('pushGameToLibrary', ...)` calls unchanged; `launch` reuses `SteamGame.launch()`'s native branch (`buildSteamProtocolUrl` + `shell.openExternal`) unchanged. Neither `launcher.ts`'s full Wine/GameConfig pipeline nor the other 5 store managers are imported.
- `handlers.ts` now calls `registerSteamFlows()` (replacing the 27-02 ping-only placeholder scope) and adds a `sidecar:store-snapshot` handler serving `configStore` + `steamConfigStore.raw_store` with `refreshToken` excluded at the source (T-27-09) — closing 27-03's documented "no handler yet" gap for the renderer's synchronous store-snapshot bridge.
- `skeletonFlows.test.ts` drives the real sidecar RPC server in-process (bootstrap.test.ts's real-tmpdir black-box pattern) and proves all 4 required behaviors on observable frames only: a `refreshLibrary` invoke with a stubbed owned-apps client produces a `pushGameToLibrary` `SidecarNotification` carrying a real steam `GameInfo`; a `launch` invoke for a numeric appId emits an `openExternal` frame with URL `steam://rungameid/999002`; a non-numeric appId emits NO `openExternal` frame (T-03-01 guard proven live through the sidecar); `sidecar:store-snapshot` returns `steamConfigStore.userData` but never `refreshToken`.
- Found and fixed a genuine blocking gap discovered by the test itself: `backend/logger`'s `logInfo`/`logWarning`/`logError` (called throughout the real flow code this plan reuses unchanged) dereference a `heroicLogWriter` that only Electron's main process ever assigns — the headless sidecar had no equivalent. Added `initHeadless()` (real `LogWriter`, no `GlobalConfig`/system-info-dump side effects) rather than reimplementing logging or invoking the full Electron-only `init()`.

## Task Commits

1. **Task 1: Curated read-flow + action-flow channel registration** - `11d286b9` (feat)
2. **Task 2: End-to-end flow integration test (read + action)** - `6a9b0d21` (test)

## Files Created/Modified

- `src/backend/sidecar/steamFlowRegistration.ts` - curated `refreshLibrary`/`launch` invoke handlers against the real Steam store-manager code
- `src/backend/sidecar/handlers.ts` - calls `registerSteamFlows()`; adds the `sidecar:store-snapshot` handler
- `src/backend/sidecar/bootstrap.ts` - calls `backend/logger`'s new `initHeadless()` once per process (idempotent guard)
- `src/backend/logger/index.ts` - adds `initHeadless()` (additive; `init()` itself unmodified)
- `src/backend/sidecar/__tests__/skeletonFlows.test.ts` - 4-behavior E2E integration test for both flows

## Decisions Made

- `launch`'s handler passes an unused `LogWriter` placeholder to `SteamGame.launch()` rather than constructing a real one — the parameter is dead code on the native/action-flow branch (retained only for the shared `Game` interface signature); a per-game log-file lifecycle belongs to `launcher.ts`'s full pipeline, out of scope per the plan's own objective.
- `sidecar:store-snapshot`'s channel-name literal is hardcoded in `handlers.ts` (mirroring `src-tauri/src/main.rs`'s `STORE_SNAPSHOT_CHANNEL` constant exactly) rather than promoted to a shared constant in `sidecarTransport.ts`, since that file wasn't in this plan's declared `files_modified` scope.
- `initHeadless()` is purely additive to `backend/logger/index.ts` — Electron's own `main.ts` startup path (`initLogger()` → the original `init()`) is byte-identical to before this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `backend/logger`'s `heroicLogWriter` was never assigned in the headless sidecar**
- **Found during:** Task 2, writing the end-to-end integration test
- **Issue:** Every real flow handler this plan wires up calls `logInfo`/`logWarning`/`logError` internally (e.g. `library.ts`'s refresh() "Steam client not ready..." warning, `games.ts`'s launch() "launching appId..." info line, `buildSteamProtocolUrl`'s guard-rejection warning) — all of which dereference a module-private `heroicLogWriter` in `backend/logger/index.ts` that is ONLY ever assigned by that module's own `init()`, which only Electron's main process calls at app startup. The headless sidecar had no equivalent, so the first real flow invocation threw `Cannot read properties of undefined (reading 'logInfo')` — this would have blocked every real call in production, not just the test.
- **Fix:** Added `initHeadless()` to `backend/logger/index.ts` — assigns the same real `LogWriter` singleton directly, skipping only `init()`'s two Electron-app-only side effects (`GlobalConfig.get()`, which assumes an already-initialized `userData` config file a real Electron app guarantees but a headless process does not; and a fire-and-forget hardware/binary-version system-info dump whose async chain can outlive a short-lived caller). `bootstrap.ts`'s own `init()` now calls it once (idempotent guard). `init()` itself is completely unmodified.
- **Files modified:** `src/backend/logger/index.ts`, `src/backend/sidecar/bootstrap.ts`
- **Verification:** `npm run codecheck` clean; `skeletonFlows.test.ts` and `bootstrap.test.ts` both pass with exit code 0 (no dangling async crash after teardown); full backend suite (74 suites / 1592 tests) still green.
- **Committed in:** `6a9b0d21` (Task 2 commit)

**2. [Rule 3 - Blocking] Jest's own `electron`/`electron-store` manual mocks silently pre-empt `bootstrap.ts`'s `Module._load` hook inside Jest**
- **Found during:** Task 2, debugging why `shell.openExternal`/`app.getPath` calls weren't routing through electronStub/fileStore
- **Issue:** `src/backend/__mocks__/electron.ts` and `.../electron-store.ts` are Jest manual mocks for node_modules packages, auto-applied to EVERY backend test — Jest's own module resolution intercepts `import ... from 'electron'` BEFORE Node's `Module._load` (which bootstrap.ts patches) is ever consulted. Left unmocked, the real flow handlers would run against those generic fixtures (no `shell` export at all in the adjacent automock) instead of this plan's actual sidecar transport, so neither the `shell.openExternal` → `openExternal` RPC frame bridge nor the `BrowserWindow.webContents.send` → `pushGameToLibrary` notification bridge — the exact seams this test exists to prove — would ever be exercised.
- **Fix:** `skeletonFlows.test.ts` explicitly overrides both with `jest.mock('electron', () => jest.requireActual('../electronStub'))` and an equivalent for `electron-store` → `fileStore.ts`, achieving the same effect the production `Module._load` hook achieves outside Jest.
- **Files modified:** `src/backend/sidecar/__tests__/skeletonFlows.test.ts`
- **Verification:** Test 2/3 correctly observe `openExternal` RPC frames on stdout (proving the real electronStub bridge fired); `bootstrap.test.ts` (which does NOT need this override, since it only exercises the electron-independent `health` channel) remains unaffected.
- **Committed in:** `6a9b0d21` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking)
**Impact on plan:** Both were necessary for the plan's own must-haves to hold for real (not just satisfy a narrowly-scoped acceptance grep) — same class of gap 27-02/27-03's own summaries documented ("worked on paper, would have broken for real"). No scope creep: the logger fix is a small additive export with zero effect on Electron's own startup path; the Jest-mock fix is test-infrastructure-only.

## Issues Encountered

- Iterated through three mkdir/path-resolution approaches (pathShim's own `getPath`, a fresh runtime `app.getPath()` call, `paths.ts`'s cached `appFolder`/`userDataPath` constants) while chasing an ENOENT before concluding the correct fix was to avoid `GlobalConfig` entirely via `initHeadless()` — the `resetMocks: true` config strips a mock's `.mockImplementation()` before every test body, so a fresh `app.getPath()` call made at runtime (inside a test) diverges from a value the SAME mock computed once at module-import time (before the first reset ever fires). `initHeadless()` sidesteps the whole class of issue by never touching `GlobalConfig`.
- The plan's own suggested verify command (`npm test -- --testPathPattern=sidecar/skeletonFlows`) doesn't match the test's actual path (`src/backend/sidecar/__tests__/skeletonFlows.test.ts`) — same documented `__tests__/` directory-segment pattern 27-02/27-03's own summaries already noted. Verified instead with `--testPathPattern="sidecar.*skeletonFlows"`.

## Known Stubs

None — both flows are wired against the real, unmodified store-manager code; no placeholder data paths introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both E2E flows (Steam library read, `steam://` launch action) are proven end-to-end through the sidecar's own RPC transport against real backend code, with only the 4 declared channels wired (`refreshLibrary`, `pushGameToLibrary`, `launch`, `sidecar:store-snapshot`).
- 27-03's documented "no handler yet for `sidecar:store-snapshot`" gap is now closed — the renderer's synchronous store bridge has a real sidecar-side implementation.
- 27-05 (live `npm run tauri:dev` hardware run) can now exercise these real handlers through the actual Rust shell + bundled sidecar process, not just the in-process jest harness.
- No blockers.

## Self-Check: PASSED

- Files verified present: `src/backend/sidecar/steamFlowRegistration.ts` (FOUND), `src/backend/sidecar/__tests__/skeletonFlows.test.ts` (FOUND).
- Commits verified in git log: `11d286b9` (FOUND, Task 1), `6a9b0d21` (FOUND, Task 2).

---
*Phase: 27-tauri-shell-walking-skeleton*
*Completed: 2026-07-21*
