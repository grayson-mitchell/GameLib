---
phase: 31-tauri-ipc-re-plumb-slice-2-settings-and-config
plan: 01
subsystem: ipc
tags: [tauri, sidecar, electron-parity, settings, config, jest]

# Dependency graph
requires:
  - phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check
    provides: settingsFlowRegistration.ts's read-side scaffold (requestAppSettings/requestGameSettings) and the ipcMain/electronStub send-vs-invoke registration idiom
  - phase: 29-tauri-store-layer
    provides: the real configStore/STORE_ALLOWLIST store layer the global write branch persists through
provides:
  - setSetting (send/listener) and writeConfig (invoke) registered in settingsFlowRegistration.ts, reaching GlobalConfig.setSetting/GameConfig.setSetting and the real writeConfig() function
  - Six confirmed generic reads (getMaxCpus, showUpdateSetting, getLogContent, getSystemInfo, hasExecutable, isNative) registered and returning real values
  - A process.getSystemVersion polyfill in electronStub.ts (Electron-only API getSystemInfo() depends on)
  - Proof that the global writeConfig branch persists through the pre-existing configStore/STORE_ALLOWLIST entry, no new store declaration
affects: [31-02, 31-03, settings-screen-tauri-parity]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "send-kind (fire-and-forget) channel registration via ipcMain.on, never ipcMain.handle, for channels with no response frame"
    - "boundary-mock real-subprocess-dependent backend modules (helperBinaries-chain, os/path spawn) in sidecar unit tests rather than letting them spawn real child processes"
    - "polyfill Electron-only process augmentations (process.getSystemVersion) inside electronStub.ts rather than modifying the shared Electron-parity backend module"

key-files:
  created: []
  modified:
    - src/backend/sidecar/settingsFlowRegistration.ts
    - src/backend/sidecar/electronStub.ts
    - src/backend/sidecar/__tests__/settingsFlows.test.ts
    - src/backend/sidecar/__tests__/storeLayer.test.ts

key-decisions:
  - "setSetting registered via ipcMain.on (not .handle) per RESEARCH.md Pitfall 2 — a send channel registered as a handler fails 100% silently at runtime"
  - "getUserInfo/readConfig deliberately NOT ported — neither is reached by the Settings screen (Epic-only / Legendary-only respectively), confirmed by 31-RESEARCH.md Q1"
  - "getSystemInfo/hasExecutable's real subprocess dependencies (helperBinaries version checks, os/path which/where spawn) are boundary-mocked in settingsFlows.test.ts to keep the suite deterministic; the channel wiring is what's under test, not the OS-probing internals"
  - "process.getSystemVersion polyfilled in electronStub.ts via os.release() rather than modifying backend/utils/systeminfo/index.ts, preserving that module's Electron-parity guarantee"

patterns-established:
  - "Write-path (send-kind) channel tests assert the underlying mocked target method was called with the right args, never a response-frame absence, since send channels produce no response frame"

requirements-completed: [REQ-31-01, REQ-31-02, REQ-31-05, REQ-31-07]

# Metrics
duration: 45min
completed: 2026-07-23
---

# Phase 31 Plan 01: Settings Write Path + Generic Reads Summary

**setSetting/writeConfig write path and six generic settings reads ported onto the Tauri sidecar, closing a 100%-silent-failure gap where every Settings toggle previously vanished with zero signal**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-07-23T16:36:02+12:00
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- `setSetting` (send/listener) and `writeConfig` (invoke) registered in `settingsFlowRegistration.ts`, mirroring `main.ts:1042-1052` exactly — every Settings toggle and `ThemeSelector`'s config write now reach `GlobalConfig.setSetting`/`GameConfig.setSetting`/the real `writeConfig()` function instead of silently no-oping
- Six confirmed-reachable generic reads (`getMaxCpus`, `showUpdateSetting`, `getLogContent`, `getSystemInfo`, `hasExecutable`, `isNative`) registered and resolving real values, not `UNPORTED_CHANNEL_MARKER`
- `getUserInfo`/`readConfig` deliberately left unregistered (Invariant B) — confirmed by 31-RESEARCH.md Q1 that neither is reached by the Settings screen
- Discovered and fixed a genuine production bug: `getSystemInfo()` calls `process.getSystemVersion()`, an Electron-only `process` augmentation that does not exist under the plain-Node sidecar — would have crashed every real `getSystemInfo` invocation in the shipped Tauri build, not just this test
- Proved the global `writeConfig` branch persists end-to-end through the real Phase 29 `configStore`/`STORE_ALLOWLIST` layer, using the pre-existing `'settings'` allow-list entry (no new store declaration)

## Task Commits

Each task was committed atomically (Tasks 1 and 2 landed as a single commit — both extend the same `registerSettingsFlows()` function body in the same file and were implemented/verified together; Task 3 is a separate, independently-verifiable test file):

1. **Task 1 + Task 2: Register write path + six generic reads** - `66cfcee5` (feat)
2. **Task 3: Prove global writeConfig persists through the store layer** - `52935375` (test)

_Note: TDD tasks (1 and 2) had their tests and implementation authored and verified together within the single commit above; RED/GREEN separation was not preserved as distinct commits for this plan._

## Files Created/Modified
- `src/backend/sidecar/settingsFlowRegistration.ts` - Adds `setSetting` (ipcMain.on) + `writeConfig` (ipcMain.handle) write path, and six generic-read `ipcMain.handle` registrations; D-02 divergence documented in a block comment above the write path
- `src/backend/sidecar/electronStub.ts` - Adds a `process.getSystemVersion` polyfill (via `os.release()`), guarded to never clobber a real Electron implementation
- `src/backend/sidecar/__tests__/settingsFlows.test.ts` - Adds a `writeSend()` helper, write-path tests (global + per-game branches, `writeConfig`, T-31-01 secret-safety), six generic-read tests, and an extended Invariant B guard for `getUserInfo`/`readConfig`; boundary-mocks `backend/utils/systeminfo` and `backend/utils/os/path` to avoid real subprocess spawns
- `src/backend/sidecar/__tests__/storeLayer.test.ts` - Extends the `round-trip` describe block with a case proving `configStore.set('settings', ...)` round-trips through the real store-fetch/snapshot paths, plus a case confirming the per-game write path never routes through `getRegisteredStore()`

## Decisions Made
- `setSetting` registered via `ipcMain.on`, never `.handle` — a `send` channel registered as a handler compiles but fails 100% silently at runtime (`dispatchSend()` iterates an empty listener array); RESEARCH.md Pitfall 2 flagged this explicitly
- `getUserInfo`/`readConfig` dropped from the port list — traced call sites confirm neither is reached by the Steam Settings screen (Epic SID login and a Legendary-only helper respectively); they stay `UNPORTED_CHANNEL_MARKER`-rejecting per Invariant B
- Real-subprocess-dependent internals of `getSystemInfo`/`hasExecutable` (helper-binary version checks, `which`/`where`/`sysctl`/`vm_stat` spawns) are boundary-mocked in the test suite rather than exercised for real — the suite's job is proving channel wiring reaches the real exported function, not re-verifying OS-probing subprocess behavior on every CI run
- `process.getSystemVersion` polyfilled in `electronStub.ts` (the sidecar's designated Electron-replacement module) rather than touching `backend/utils/systeminfo/index.ts`, preserving that module's "real logic runs unchanged" guarantee for both the Electron and Tauri builds

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `getSystemInfo()` crashes under the sidecar — `process.getSystemVersion` is an Electron-only API**
- **Found during:** Task 2 (generic reads) — the `getSystemInfo` test failed with the real handler never resolving
- **Issue:** `backend/utils/systeminfo/index.ts:107` calls `process.getSystemVersion()` unconditionally. This method is an Electron main-process augmentation of the global `process` object and does not exist under plain Node — it would throw `process.getSystemVersion is not a function` on every real invocation in the shipped Tauri sidecar, not only in the test.
- **Fix:** Added a guarded polyfill to `electronStub.ts` (`process.getSystemVersion = () => osRelease()` if not already a function), mirroring the file's existing role as the sidecar's Electron-replacement shim. `backend/utils/systeminfo/index.ts` itself was left unmodified (it must keep behaving identically for the Electron build).
- **Files modified:** `src/backend/sidecar/electronStub.ts`
- **Commit:** `66cfcee5`

**2. [Rule 3 - Blocking issue] Real subprocess spawns inside `getSystemInfo`/`hasExecutable` made the test suite non-deterministic and crashed Jest's teardown**
- **Found during:** Task 2 — `getSystemInfo` and `hasExecutable` tests initially failed with "You are trying to `import` a file after the Jest environment has been torn down" (helper-binary version-check `execAsync` calls, and later macOS `sysctl`/`vm_stat` subprocess calls, outliving the bounded `flush()` wait window)
- **Issue:** The real `getSystemInfo`/`hasExecutable` implementations shell out to multiple real subprocesses (`which`/`where`, `sysctl`, `vm_stat`, legendary/gogdl/comet/nile version-check execs) — unsuitable for a fast, deterministic unit suite, and actively broke Jest teardown
- **Fix:** Boundary-mocked `backend/utils/systeminfo` and `backend/utils/os/path` in `settingsFlows.test.ts` (re-established per-test in `beforeEach` since the project's `resetMocks: true` config wipes factory implementations before every test) — the suite now proves the channel wiring reaches the real exported function without exercising the OS-probing internals
- **Files modified:** `src/backend/sidecar/__tests__/settingsFlows.test.ts`
- **Commit:** `66cfcee5`

**3. [Rule N/A - out of scope, logged not fixed] Pre-existing eslint error in `electronStub.ts`**
- **Found during:** Task 1/2 lint verification
- **Issue:** `@typescript-eslint/no-redundant-type-constituents` on the pre-existing `IpcHandler` type's `) => unknown | Promise<unknown>` return type — confirmed pre-existing via `git stash` + `npx eslint` against the committed HEAD version of the file, unrelated to this plan's changes
- **Action:** Not fixed (out of scope per the scope-boundary rule); logged to `.planning/phases/31-tauri-ipc-re-plumb-slice-2-settings-and-config/deferred-items.md`

---

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 3), 1 logged-deferred (out of scope)
**Impact on plan:** Both auto-fixes were necessary for correctness — without them, `getSystemInfo` would crash in production and the test suite would be flaky/broken. No scope creep beyond what wiring the two ported reads required.

## Issues Encountered
`GlobalConfig.get()`/`GameConfig.get()`'s existing mock objects in `settingsFlows.test.ts` (from Phase 30) only stubbed `getSettings` — extending them with `setSetting`/`set`/`flush` jest.fn() spies was needed before the write-path tests could assert against them. Straightforward, no design implications.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
The settings write path and generic reads are live and unit-proven under the sidecar. Plan 31-02/31-03 (dialog members, D-04 no-op logging, `31-PORTED-CHANNELS.md`/SEAM.md update) can proceed independently — this plan's `files_modified` scope (`settingsFlowRegistration.ts`, `settingsFlows.test.ts`, `storeLayer.test.ts`) is fully closed. No blockers identified.

---
*Phase: 31-tauri-ipc-re-plumb-slice-2-settings-and-config*
*Completed: 2026-07-23*
