---
phase: 27-tauri-shell-walking-skeleton
plan: 02
subsystem: infra
tags: [tauri, sidecar, electron-shim, jsonrpc, circular-dependency]

# Dependency graph
requires:
  - phase: 27-tauri-shell-walking-skeleton (27-01)
    provides: "src/common/types/sidecarTransport.ts (transport contract), src-tauri/ Rust shell spawning build/main/sidecar.js"
provides:
  - "src/backend/sidecar/* — headless Node sidecar (path shim, file-backed electron-store replacement, electron-module stub, stdio JSON-RPC server, bootstrap entrypoint)"
  - "src/sidecar/index.ts — the actual build:sidecar bundle entry"
  - "backend/storeManagers/steam/library.ts (and the whole backend module graph) now imports safely under bare node, regardless of import order"
affects: ["27-04 (registers real E2E flow channels on this transport)", "27-05 (live sidecar run against the real Steam library path)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module._load hook intercepts require('electron') and require('electron-store') before any backend import — spike 009's two import-time walls"
    - "Lazy `await import(...)` / synchronous `require(...)` for storeManagers/index.ts's eagerly-constructed libraryManagerMap, breaking a pre-existing order-sensitive circular dependency (matches the codebase's existing bottle.ts/games.ts convention for the same purpose)"
    - "Injectable input/output streams (sidecarRpc.ts, bootstrap.ts's init()) for testing without touching real process.stdin/stdout"

key-files:
  created:
    - src/backend/sidecar/pathShim.ts
    - src/backend/sidecar/fileStore.ts
    - src/backend/sidecar/electronStub.ts
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/__tests__/bootstrap.test.ts
    - src/sidecar/index.ts
  modified:
    - package.json (build:sidecar: added --external:electron-store)
    - src/backend/storeManagers/gog/user.ts
    - src/backend/storeManagers/gog/setup.ts
    - src/backend/storeManagers/gog/redist.ts
    - src/backend/storeManagers/nile/setup.ts
    - src/backend/storeManagers/legendary/setup.ts
    - src/backend/storeManagers/legendary/eos_overlay/eos_overlay.ts
    - src/backend/tools/index.ts
    - src/backend/launcher.ts
    - src/backend/utils.ts
    - src/backend/downloadmanager/downloadqueue.ts
    - src/backend/downloadmanager/utils.ts
    - src/backend/utils/helperBinaries/index.ts

key-decisions:
  - "userData path = join(appData, 'GameLib') in pathShim.ts (matches the 'GameLib' literal already used throughout paths.ts), since the real Electron app.getName()-derived value can't be observed from a headless sidecar — flagged for later verification against a real packaged build"
  - "shell.openExternal has no direct Tauri-command access from the sidecar process, so it emits a SidecarRpcRequest{kind:'openExternal'} frame on stdout for the Rust shell to interpret; wiring that interpretation into src-tauri/main.rs is left to 27-04 (this plan is the 'generic transport half' per its own objective)"
  - "electronStub covers all 16 Electron main-process APIs spike 009 mapped (not just Steam's touchpoints), because storeManagers/index.ts eagerly constructs every store manager (GOG/Legendary/Nile/Zoom/Sideload/Steam) at import time, so importing steam/library.ts alone pulls the whole backend module graph in"

requirements-completed: [REQ-27-02]

# Metrics
duration: ~50min
completed: 2026-07-21
---

# Phase 27 Plan 02: Sidecar Bootstrap, Shims & Headless Boot Summary

Node sidecar boots headless under bare node — `Module._load` hook shims `require('electron')`/`require('electron-store')` before any backend import, serves a stdio JSON-RPC loop, and signals `READY_SENTINEL` — proven end-to-end via a real bundled-and-spawned process plus a jest integration test, after fixing a pre-existing order-sensitive circular dependency the direct import exposed.

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-07-21
- **Tasks:** 3
- **Files modified:** 21 (8 created under `src/backend/sidecar/` + `src/sidecar/index.ts`, 13 modified)

## Accomplishments

- Three headless shims (`pathShim.ts`, `fileStore.ts`, `electronStub.ts`) satisfy spike 009's two import-time walls (`app.getPath()` at module scope in `paths.ts`, `new Store()` at module scope in `electron_store.ts`) plus the full 16-API Electron surface the backend's module graph touches.
- `sidecarRpc.ts` + `bootstrap.ts` serve the 27-01 transport contract: stdio JSON-RPC (`invoke`/`send`), a `pushFrontendMessage`/`requestOpenExternal` pair wired onto electronStub's `sendFrontendMessage`/`shell.openExternal` paths, newline-framing with a max-line cap (T-27-04 fail-soft), and `READY_SENTINEL` printed only once the RPC server is listening.
- Verified against the REAL bundled artifact, not just the test: `pnpm build:sidecar` produces `build/main/sidecar.js`, which boots under bare `node` (electron absent), prints `READY_SENTINEL`, and round-trips a real `health`/`ping` invoke frame over actual OS pipes.
- Found and fixed a pre-existing, order-sensitive circular dependency (`storeManagers/index.ts` eagerly constructs `new SteamLibraryManager()` at module scope, but many files import `libraryManagerMap` from it at THEIR OWN top level) that faults whenever `backend/storeManagers/steam/library.ts` is required before `storeManagers/index.ts` — exactly the order 27-05's real sidecar flow will use.

## Task Commits

1. **Task 1: Path shim + minimal file-backed store + electron-module stub** - `64bbef74` (feat)
2. **Task 2: Bootstrap entry + stdio JSON-RPC server + READY signal** - `5e168761` (feat)
3. **Task 3: Headless-boot integration test** - `af318c50` (test)

## Files Created/Modified

- `src/backend/sidecar/pathShim.ts` - headless `app.getPath('appData'|'userData'|'temp'|'home')`
- `src/backend/sidecar/fileStore.ts` - minimal sync file-backed electron-store replacement (get/set/has/delete/clear/store getter+setter/iterator)
- `src/backend/sidecar/electronStub.ts` - electron-module replacement (all 16 main-process APIs spike 009 mapped)
- `src/backend/sidecar/sidecarRpc.ts` - stdio JSON-RPC server, `pushFrontendMessage`/`requestOpenExternal`
- `src/backend/sidecar/handlers.ts` - placeholder `health` invoke handler (27-04 expands)
- `src/backend/sidecar/bootstrap.ts` - installs the `Module._load` hook, exports `init()`
- `src/backend/sidecar/__tests__/bootstrap.test.ts` - 3-assertion headless-boot integration test
- `src/sidecar/index.ts` - the `build:sidecar` bundle entry (thin, calls `init()`)
- `package.json` - `build:sidecar` now also externalizes `electron-store`
- `src/backend/storeManagers/gog/user.ts`, `gog/setup.ts`, `gog/redist.ts`, `nile/setup.ts`, `legendary/setup.ts`, `legendary/eos_overlay/eos_overlay.ts`, `tools/index.ts`, `launcher.ts`, `utils.ts`, `downloadmanager/downloadqueue.ts`, `downloadmanager/utils.ts`, `utils/helperBinaries/index.ts` - converted top-level `libraryManagerMap` imports to lazy loads at each use site (circular-dependency fix, see Deviations)

## Decisions Made

- `pathShim.ts`'s `userData` resolves to `join(appData, 'GameLib')`, matching the `'GameLib'` literal `paths.ts` already uses for `appFolder`/`heroicInstallPath`, since a headless sidecar cannot observe the real Electron `app.getName()`-derived value. Flagged for later verification against a real packaged build if 27-05's live run shows a mismatch.
- `shell.openExternal`'s Rust-side interpretation is intentionally left unwired in `src-tauri/main.rs` — 27-02 only proves the sidecar emits a well-formed `SidecarRpcRequest{kind:'openExternal'}` frame; making the Rust reader thread act on it is 27-04's job (the real E2E launch flow).
- `electronStub.ts` covers all 16 Electron APIs spike 009 catalogued, not just Steam's direct touchpoints, because `backend/storeManagers/steam/library.ts`'s own import chain transitively pulls in `backend/utils.ts` -> `backend/storeManagers/index.ts`, which eagerly constructs every store manager (GOG/Legendary/Nile/Zoom/Sideload/Steam) at import time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `build:sidecar` script missing `--external:electron-store`**
- **Found during:** Task 2, verifying the real bundled artifact
- **Issue:** `package.json`'s `build:sidecar` script (authored in 27-01) only had `--external:electron`. Without also externalizing `electron-store`, esbuild would inline the REAL `electron-store` npm package into the bundle at build time, so the `Module._load` hook would never see a `require('electron-store')` call at runtime — defeating the entire electron-store shim once actually bundled and run.
- **Fix:** Added `--external:electron-store` to the `build:sidecar` script.
- **Files modified:** `package.json`
- **Verification:** `pnpm build:sidecar` then `node build/main/sidecar.js` boots headless and reaches `READY_SENTINEL`; a real `health`/`ping` invoke frame round-trips over actual stdio.
- **Committed in:** `5e168761` (Task 2 commit)

**2. [Rule 3 - Blocking] Created `src/sidecar/index.ts`, the `build:sidecar` bundle entry**
- **Found during:** Task 2
- **Issue:** 27-01's `build:sidecar` script targets `src/sidecar/index.ts` (documented as a known stub in 27-01-SUMMARY.md), but this file didn't exist. Without it, `pnpm build:sidecar` fails outright and "must bundle to build/main/sidecar.js" (a plan must-have) is unmet.
- **Fix:** Added a thin entry that imports `init` from `backend/sidecar/bootstrap.ts` and calls it unconditionally — kept separate from `bootstrap.ts` itself so tests can `require` the bootstrap module without an unwanted auto-start against real `process.stdin`/`stdout`.
- **Files modified:** `src/sidecar/index.ts` (new)
- **Verification:** `pnpm build:sidecar` bundles cleanly (37.8kb); the bundled output boots and serves RPC (see #1's verification).
- **Committed in:** `5e168761` (Task 2 commit)

**3. [Rule 1 - Bug] Pre-existing circular dependency broke headless import of `backend/storeManagers/steam/library.ts`**
- **Found during:** Task 3, writing the headless-boot integration test
- **Issue:** `backend/storeManagers/index.ts` eagerly builds `libraryManagerMap` at ITS OWN module scope, including `new SteamLibraryManager()`. Many other backend files (`gog/user.ts`, `gog/setup.ts`, `gog/redist.ts`, `nile/setup.ts`, `legendary/setup.ts`, `legendary/eos_overlay/eos_overlay.ts`, `tools/index.ts`, `launcher.ts`, `utils.ts`, `downloadmanager/downloadqueue.ts`, `downloadmanager/utils.ts`, `utils/helperBinaries/index.ts`) import `libraryManagerMap` from that same module at THEIR OWN top level. When something requires `backend/storeManagers/steam/library.ts` directly (as opposed to via `storeManagers/index.ts` first — which is what happens to work in the Electron app's own import order), Node's circular-require semantics hand back `steam/library.ts`'s still-mid-evaluation (incomplete) exports partway through its own import chain, so `SteamLibraryManager` is `undefined` at the point `storeManagers/index.ts` tries to construct it — `TypeError: library_6.default is not a constructor`. This is exactly the import order the plan's own must_haves require ("require('backend/storeManagers/steam/library') imports headlessly ... the transitive Electron coupling the live 27-05 run hits"), so it would have blocked 27-05 for real, not just this test.
- **Fix:** Converted every top-level `import { libraryManagerMap } from '.../storeManagers'` found on this import path to a lazy load at its actual (deferred) use site — `await import(...)` inside the (overwhelming majority) async functions, or a synchronous `require(...)` inside the handful of functions that are themselves synchronous and called synchronously elsewhere (`utils.ts`'s `getGame()`, `launcher.ts`'s `getRunnerCallWithoutCredentials()`, `gog/redist.ts`'s `createRedistDMQueueElement()` — their signatures could not change without rippling to their own callers). This exactly matches the codebase's own pre-existing convention for breaking the same class of cycle (`const { runWineCommand } = await import('backend/launcher')` in `bottle.ts`/`games.ts`). Zero behavior change — purely deferred module resolution timing.
- **Files modified:** `storeManagers/gog/user.ts`, `gog/setup.ts`, `gog/redist.ts`, `nile/setup.ts`, `legendary/setup.ts`, `legendary/eos_overlay/eos_overlay.ts`, `tools/index.ts`, `launcher.ts`, `utils.ts`, `downloadmanager/downloadqueue.ts`, `downloadmanager/utils.ts`, `utils/helperBinaries/index.ts`
- **Verification:** `bootstrap.test.ts`'s third assertion passes; full backend jest suite (73 suites / 1588 tests) still green; `npm run codecheck` clean.
- **Committed in:** `af318c50` (Task 3 commit)

**4. [Rule 3 - Blocking] Own explanatory comment tripped the "no electron import" grep**
- **Found during:** Post-task-3 plan-level verification
- **Issue:** `handlers.ts`'s docstring literally contained the prose `"from 'electron'"`, which the plan's own verification grep (`grep -r "from 'electron'" src/backend/sidecar/`) matched as a false positive — mirrors the `@node-steam/vdf` prose-avoidance precedent already established for `manifest.ts` in Phase 21.
- **Fix:** Reworded the comment to describe the constraint without using the literal import-statement substring.
- **Files modified:** `src/backend/sidecar/handlers.ts`
- **Verification:** `grep -r "from 'electron'" src/backend/sidecar/` returns nothing.
- **Committed in:** `af318c50` (Task 3 commit)

---

**Total deviations:** 4 auto-fixed (3 Rule 3 - blocking, 1 Rule 1 - bug)
**Impact on plan:** All four were necessary for the plan's own must-haves to actually hold once bundled/run for real (not just pass a narrowly-scoped test). No scope creep — every touched file's change is a mechanical, behavior-preserving deferral of an existing dependency, not new functionality.

## Issues Encountered

- The plan's own suggested verify command (`npm test -- --testPathPattern=sidecar/bootstrap`) doesn't match the test's actual path (`src/backend/sidecar/__tests__/bootstrap.test.ts`) because of the `__tests__/` directory segment every other test file in this codebase also uses — not a deviation, just a pattern typo in the plan text. Verified instead with `--testPathPattern=bootstrap.test` (also confirmed `--testPathPattern="sidecar.*bootstrap"` matches).
- Initially made `utils.ts`'s `getGame()` helper `async` to lazy-load `libraryManagerMap`, which broke 8 other call sites across the codebase (`launcher.ts`, `main.ts`, `shortcuts/ipc_handler.ts`, `tools/ipc_handler.ts`, `wiki_game_info/ipc_handler.ts`) that call it synchronously. Reverted to synchronous `require()` instead — same result the codebase's own CJS runtime supports, with zero signature change downstream.

## Known Stubs

- `handlers.ts` registers exactly one placeholder `health` invoke handler. This is the documented interface-first seam per the plan's own objective ("the generic transport half; 27-04 registers the two E2E flows' specific channels on top of it") — not an accidental stub.
- `requestOpenExternal()` emits a well-formed `SidecarRpcRequest{kind:'openExternal'}` frame on stdout, but `src-tauri/main.rs`'s reader thread (27-01) does not yet special-case it — the frame is currently silently ignored on the Rust side. Wiring that interpretation (invoking `tauri-plugin-opener`) is 27-04's job, since this plan owns only the generic transport, not the real launch flow.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The sidecar boots, serves the transport contract, and signals READY — the generic transport half REQ-27-02 asked for is done and hardware-proven (real bundle, real process, real stdio round-trip).
- `backend/storeManagers/steam/library.ts` now imports headlessly regardless of order, unblocking 27-05's real live-flow run against it.
- 27-04 can now register the two E2E flow channels (Steam library read, `steam://` launch) on top of `handlers.ts`'s placeholder registry, and wire `src-tauri/main.rs`'s reader thread to act on the `openExternal` frames `requestOpenExternal()` already emits.
- No blockers.

## Self-Check: PASSED

- Files verified present: `src/backend/sidecar/pathShim.ts`, `fileStore.ts`, `electronStub.ts`, `sidecarRpc.ts`, `handlers.ts`, `bootstrap.ts`, `__tests__/bootstrap.test.ts`, `src/sidecar/index.ts`.
- Commits verified in git log: `64bbef74` (Task 1), `5e168761` (Task 2), `af318c50` (Task 3).

---
*Phase: 27-tauri-shell-walking-skeleton*
*Completed: 2026-07-21*
