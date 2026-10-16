---
phase: 27-tauri-shell-walking-skeleton
plan: 03
subsystem: infra
tags: [tauri, preload, ipc, electron-store, jest, module-bundling]

# Dependency graph
requires:
  - phase: 27-tauri-shell-walking-skeleton (27-01)
    provides: "src/common/types/sidecarTransport.ts transport contract (SIDECAR_INVOKE/SIDECAR_SEND/SIDECAR_STORE_SNAPSHOT/FRONTEND_MESSAGE_EVENT), src-tauri/ Rust shell relay commands"
  - phase: 27-tauri-shell-walking-skeleton (27-02)
    provides: "src/backend/sidecar/* headless Node sidecar, src/sidecar/index.ts build:sidecar entry"
provides:
  - "src/preload/tauriTransport.ts -- invoke/send/listen over @tauri-apps/api + a synchronous in-memory store snapshot bridge (hydrateStoreSnapshot/snapshotGet/snapshotHas/snapshotSet/snapshotDelete/isTauri)"
  - "ipc.ts's 3 factories + misc.ts's store bridge re-pointed onto that transport behind isTauri(), Electron path preserved byte-identical"
  - "src/preload/tauriAttach.ts -- the BLOCKER-1 fix: attaches window.api + the 6 preload globals directly to the Tauri webview (contextBridge doesn't exist there)"
  - "A new 'Preload' jest project (src/preload/jest.config.js) -- src/preload had no test coverage at all before this plan"
affects: ["27-04 (real E2E flow channels + Rust openExternal wiring)", "27-05 (live npm run tauri:dev hardware run -- first real proof this bundles/loads correctly)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy, guarded `require('electron')` / `require('electron-store')` (a runtime function CALL inside the non-Tauri branch, never a static `import` value) -- a static import compiles to an unconditional top-level require() once bundled (confirmed against the real build/preload/index.js output), which would throw if this module is ever reached from the Tauri renderer's own JS bundle. The Electron path is otherwise byte-identical to before."
    - "First-import-wins module ordering: src/frontend/index.tsx imports preload/tauriAttach as its literal first import so its (Electron/Node-free) side effect runs before any sibling import's own module-scope code -- ES modules resolve all of a file's static imports, depth-first in declaration order, before any of that file's own top-level statements run, so a callable attach function invoked as a regular statement would always run too late."
key-files:
  created:
    - src/preload/tauriTransport.ts
    - src/preload/tauriAttach.ts
    - src/preload/jest.config.js
    - src/preload/__tests__/tauriTransport.test.ts
    - src/preload/__tests__/tauriAttach.test.ts
  modified:
    - src/preload/ipc.ts
    - src/preload/api/misc.ts
    - src/preload/index.ts
    - src/frontend/index.tsx
    - jest.config.js

key-decisions:
  - "Split the BLOCKER-1 attach into its own file (tauriAttach.ts) rather than reusing preload/index.ts directly: that file's Electron branch unconditionally imports 'electron' (contextBridge) and 'backend/constants/environment' (os.cpus(), graceful-fs) at module scope -- both Node-only. Importing preload/index.ts from the renderer bundle to reuse that logic would pull those in too. tauriAttach.ts has zero Node/Electron imports and is safe to import unconditionally from index.tsx; it no-ops under Electron."
  - "The 6 Tauri-path preload globals (isSteamDeck, isFlatpak, platform, etc.) use hardcoded/navigator-derived fallbacks rather than the real Node-based detection in backend/constants/environment.ts, since that detection (os.cpus(), graceful-fs, process.env/argv) has no browser equivalent inside a Tauri webview and neither Steam Deck nor Flatpak detection is load-bearing for either of the skeleton's two E2E flows (27-CONTEXT: explicitly out of scope this phase)."
  - "hydrateStoreSnapshot() is awaited via top-level await in index.tsx (valid: target esnext, entry module, nothing imports it) rather than deferred into an async bootstrap wrapper, so it completes before the file's own first synchronous store read (configStore.get_nodefault('language'))."
  - "Registered a new 'Preload' jest project (src/preload/jest.config.js, added to the root jest.config.js's projects array) -- src/preload wasn't covered by any of the existing backend/frontend/meta projects, so tests placed there (as the plan's own files_modified list specifies) would have been silently undiscoverable by `npm test`."

requirements-completed: [REQ-27-03]

# Metrics
duration: ~30min
completed: 2026-07-21
---

# Phase 27 Plan 03: Tauri Renderer Bridge Summary

Re-pointed GameLib's three `window.api` preload factories plus the synchronous electron-store bridge onto a Tauri↔sidecar transport, with zero changes to any of the 379 `window.api.*` call-sites or to `GlobalState.tsx`, and attached `window.api` directly to the Tauri webview (contextBridge doesn't exist there) via a dedicated, Node/Electron-free module imported first in the renderer entry -- proven by a headless contract test with zero electron symbols touched.

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-07-21
- **Tasks:** 3
- **Files modified:** 10 (5 created, 5 modified)

## Accomplishments

- `tauriTransport.ts` wraps `@tauri-apps/api` with the four renderer primitives the preload needs: `invoke`/`send`/`listen` (matching the three factories' existing shapes exactly) plus a synchronous in-memory store snapshot (`hydrateStoreSnapshot`/`snapshotGet`/`snapshotHas`/`snapshotSet`/`snapshotDelete`), preserving the `SECRET_STORE_KEYS` deny-list verbatim (T-27-06). No `electron` import anywhere in the module.
- `ipc.ts`'s three factories and `misc.ts`'s store functions are re-pointed onto that transport behind `isTauri()`. The Electron `ipcRenderer`/`electron-store` access is now a lazily-invoked, guarded `require()` call (not a static `import` value) inside the non-Tauri branch only -- this is the load-bearing fix that makes the re-pointed files actually safe to be part of the Tauri renderer's own JS bundle (a static `import { ipcRenderer } from 'electron'` compiles to an unconditional top-level `require('electron')`, confirmed against the real, already-built `build/preload/index.js` output, which would throw the moment that chunk is evaluated in a browser/webview context with no Node -- regardless of any runtime `isTauri()` guard deeper in the file).
- **BLOCKER-1 fix** (window.api attachment, 27-01's own finding): `preload/tauriAttach.ts` is a new, dedicated, Electron/Node-free module that assigns `window.api` + the 6 preload globals directly when `isTauri()` is true. `frontend/index.tsx` imports it as its literal first import specifically so its dependency subtree evaluates before `./helpers/electronStores` (transitively imported by `GlobalState`), whose module-scope `TypeCheckedStoreFrontend` constructors call `window.api.storeNew(...)` synchronously the instant that module is first imported -- ES modules resolve all of a file's own static imports, depth-first, before any of that file's own top-level statements run, so a callable attach function invoked as a regular statement would always run too late. `preload/index.ts` also gained a symmetric, documented (currently-dead-in-practice) `isTauri()` guard for consistency.
- `frontend/index.tsx` awaits `hydrateStoreSnapshot()` (top-level await) before its own first synchronous store read.
- A headless contract test (`tauriTransport.test.ts`, mirrors spike 012's bridge-shim-demo) proves the invoke round-trip, the frontend-push + unsubscribe contract, the synchronous snapshot read + secret-key denial, and zero electron symbols touched -- against a mock Tauri transport, no real sidecar/Rust process needed.
- A second test (`tauriAttach.test.ts`) proves the BLOCKER-1 attach actually runs (window.api + globals present) under Tauri and no-ops under Electron -- satisfying Task 2's own acceptance criterion text ("a startup assertion / unit check proves the attach runs first").

## Task Commits

1. **Task 1: tauriTransport module** - `f966e5aa` (feat)
2. **Task 2: re-point the three factories + store funcs; attach window.api** - `5568fd93` (feat)
3. **Task 3: headless bridge contract test + preload jest project + attach smoke check** - `55974470` (test)

## Files Created/Modified

- `src/preload/tauriTransport.ts` - invoke/send/listen over @tauri-apps/api + synchronous store snapshot bridge
- `src/preload/tauriAttach.ts` - BLOCKER-1 fix: attaches window.api + 6 globals directly to the Tauri webview
- `src/preload/ipc.ts` - three factories re-pointed onto the transport behind isTauri(), Electron path via lazy guarded require()
- `src/preload/api/misc.ts` - storeNew/storeGet/storeHas/storeSet/storeDelete re-pointed, SECRET_STORE_KEYS preserved
- `src/preload/index.ts` - symmetric isTauri() guard added around the (unchanged) contextBridge calls
- `src/frontend/index.tsx` - imports tauriAttach first; awaits hydrateStoreSnapshot() before the first synchronous store read
- `src/preload/jest.config.js` - new "Preload" jest project (mirrors backend/frontend pattern)
- `jest.config.js` - registers the new preload project in the root `projects` array
- `src/preload/__tests__/tauriTransport.test.ts` - Task 3's headless contract test (4 behaviors)
- `src/preload/__tests__/tauriAttach.test.ts` - attach-order smoke check

## Decisions Made

- Split the window.api attach into its own file (`tauriAttach.ts`) rather than reusing `preload/index.ts` directly -- see key-decisions above for the full reasoning (avoids pulling Node-only `contextBridge`/`backend/constants/environment` imports into the renderer bundle).
- Tauri-path fallbacks for the 6 preload globals (Steam Deck/Flatpak detection) are hardcoded/navigator-derived rather than ported from the Node-only real detection logic -- not load-bearing for either of the skeleton's two E2E flows, revisit if a later phase targets those platforms for real under Tauri.
- Added a new "Preload" jest project rather than relocating the test files elsewhere, since the plan's own `files_modified` list specifies `src/preload/__tests__/tauriTransport.test.ts` as the path, and that directory had zero test coverage/discoverability before this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ipc.ts`/`misc.ts` needed lazy `require()`, not a static `import`, for Electron/Node-only values**
- **Found during:** Task 2, working through how `window.api` actually gets attached under Tauri
- **Issue:** The plan's action text says to re-point the three factories "behind the isTauri() guard" and attach window.api via a module `index.tsx` imports. A static `import { ipcRenderer } from 'electron'` (ipc.ts) and `import Store from 'electron-store'` (misc.ts) compile to an unconditional top-level `require(...)` once bundled (confirmed against the real, already-built `build/preload/index.js` output) -- this would throw the instant either chunk is evaluated in the Tauri renderer's own JS bundle (no Node/Electron there), regardless of any runtime `isTauri()` guard deeper in the file, since ES/CJS imports are hoisted and evaluated unconditionally at module-load time.
- **Fix:** Converted both to type-only imports (`import type`) for their type usages, plus a lazily-invoked, guarded `require()` call positioned only inside each function's non-Tauri branch -- inert unless actually called, which `isTauri()` ensures never happens under Tauri. Electron behavior is otherwise byte-identical (still a plain synchronous `require('electron')`/`require('electron-store')`, matching how the real preload bundle already compiles these).
- **Files modified:** `src/preload/ipc.ts`, `src/preload/api/misc.ts`
- **Verification:** `npm run codecheck` passes; `npx eslint` on all touched files: 0 errors; `tauriTransport.test.ts`'s "zero electron symbols" test asserts a mocked `require('electron')` (configured to throw) is never invoked.
- **Committed in:** `5568fd93` (Task 2 commit)

**2. [Rule 3 - Blocking] window.api attach could not live in `preload/index.ts` alone -- added `tauriAttach.ts`**
- **Found during:** Task 2
- **Issue:** `preload/index.ts`'s Electron branch unconditionally imports `contextBridge` from `'electron'` and `flatpakRuntimeVersion`/etc. from `'backend/constants/environment'` (Node-only: `os.cpus()`, `graceful-fs`) at module scope. If `index.tsx` imported `preload/index.ts` to reuse its attach logic, both of those Node-only imports would be pulled into the Tauri renderer's own JS bundle, breaking it for the same reason as deviation #1 -- and `contextBridge` itself must be called synchronously during Electron's actual preload initialization (a hard Electron API constraint), so it can't be deferred behind a dynamic `import()` either.
- **Fix:** Created `src/preload/tauriAttach.ts`, a new, dedicated, zero-Electron/Node-import module that performs the direct `window.api = api` + globals assignment as a side effect on import when `isTauri()` is true (no-op under Electron). `index.tsx` imports it as its literal first import (see key-decisions for the ordering rationale); `preload/index.ts` also imports it for symmetry (currently dead code there in practice, documented as such, since Tauri never actually loads that separate preload bundle -- 27-01's own finding).
- **Files modified:** `src/preload/tauriAttach.ts` (new), `src/preload/index.ts`, `src/frontend/index.tsx`
- **Verification:** `tauriAttach.test.ts` proves the attach runs under Tauri and no-ops under Electron; `git diff --stat` confirms zero changes under `src/frontend/screens`, `src/frontend/components`, or `GlobalState.tsx`.
- **Committed in:** `5568fd93` (Task 2 commit)

**3. [Rule 3 - Blocking] `src/preload` had no jest project -- tests there were undiscoverable**
- **Found during:** Task 3, running the plan's own verify command
- **Issue:** The root `jest.config.js`'s `projects` array only lists `src/backend`, `src/frontend`, and `meta` -- `src/preload` (where the plan's own `files_modified` list places `tauriTransport.test.ts`) wasn't covered by any project, so `npm test -- --testPathPattern=preload/tauriTransport` reported "No tests found" regardless of the test file's content.
- **Fix:** Added `src/preload/jest.config.js` (mirrors the existing backend/frontend project pattern exactly) and registered it in the root `jest.config.js`'s `projects` array.
- **Files modified:** `src/preload/jest.config.js` (new), `jest.config.js`
- **Verification:** `npx jest --config src/preload/jest.config.js` discovers and runs both new test files; full `npm test` (102 suites / 1812 tests) still passes.
- **Committed in:** `55974470` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 3 - blocking)
**Impact on plan:** All three were necessary for the plan's own must-haves to actually hold once bundled/run for real (not just satisfy a narrowly-scoped acceptance grep) -- mirrors 27-01/27-02's own pattern of surfacing exactly this class of "worked on paper, would have broken for real" gap. No scope creep: every change is either a mechanical require()-laziness conversion, one new small self-contained attach module, or test-infra plumbing.

## Issues Encountered

- The plan's own suggested verify command (`npm test -- --testPathPattern=preload/tauriTransport`) doesn't match the test's actual path (`src/preload/__tests__/tauriTransport.test.ts`) because of the `__tests__/` directory segment -- same documented pattern-typo class as 27-02's summary noted for its own bootstrap test. Verified instead with `--testPathPattern="preload.*tauriTransport"`.
- Jest's `resetMocks: true` (shared root config) wipes a `jest.fn()`'s implementation, not just its call history, before every test -- the first draft of `tauriTransport.test.ts` mocked `isTauri: jest.fn(() => true)` once at module scope and the mock's return value silently reverted to `undefined` on the second test, making `ipc.ts`'s factories fall through to their guarded (mocked-to-throw) Electron branch. Fixed by re-establishing `mockedIsTauri.mockReturnValue(true)` in a `beforeEach`.
- `jest.mock('electron', mockElectronFactory)` (a pre-declared `const` passed by reference) threw `Cannot access 'mockElectronFactory' before initialization` -- Jest's mock-hoisting moves the `jest.mock()` *call* to the very top of the file, before even a same-file `const` declaration it references, a TDZ trap distinct from (and stricter than) the "no out-of-scope variables" static check. Fixed by using an inline factory closing over a `let mockElectronRequireCount = 0` counter instead of a pre-declared function reference.

## Known Stubs

- The Tauri renderer's own build was NOT actually bundled/run end-to-end in this plan (no `npm run tauri:dev` / real webview load) -- that live proof is 27-05's job per the plan's own acceptance criteria ("confirmed live in 27-05; here a startup assertion / unit check proves the attach runs first"). Everything here is verified by `npm run codecheck` (real `tsc` type-check across the whole re-pointed module graph) + `npx eslint` (0 errors) + the two headless jest suites -- not by an actual Vite renderer build of the new code paths.
- `hydrateStoreSnapshot()` calls the Tauri `sidecar_store_snapshot` command, which relays to the sidecar's `sidecar:store-snapshot` RPC channel (27-01's `STORE_SNAPSHOT_CHANNEL` constant in `main.rs`) -- no handler for that channel exists yet in `src/backend/sidecar/handlers.ts` (still only registers `'health'`, per 27-02's own documented scope). A real live call would currently receive `"No handler registered for channel 'sidecar:store-snapshot'"` from the sidecar. Registering that handler is explicitly future work (27-04 "registers the two E2E flows' specific channels on top of it" per 27-02's summary) -- not this plan's scope, and not exercised by this plan's tests (they mock the Tauri command layer directly).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `window.api` is served by the three re-pointed factories + the synchronous store-snapshot bridge, with the Electron path preserved byte-identical behind `isTauri()`, and all 379 `window.api.*` call-sites + `GlobalState.tsx` untouched -- proven by a headless contract test with zero electron symbols.
- The remaining real-world gap for 27-04/27-05: the sidecar has no handler yet for `sidecar:store-snapshot` (or any of the real E2E flow channels) -- registering those is explicitly 27-04's scope per 27-02's own summary.
- No blockers for 27-04.

## Self-Check: PASSED

- Files verified present: `src/preload/tauriTransport.ts`, `src/preload/tauriAttach.ts`, `src/preload/jest.config.js`, `src/preload/__tests__/tauriTransport.test.ts`, `src/preload/__tests__/tauriAttach.test.ts`.
- Commits verified in git log: `f966e5aa` (Task 1), `5568fd93` (Task 2), `55974470` (Task 3).

---
*Phase: 27-tauri-shell-walking-skeleton*
*Completed: 2026-07-21*
