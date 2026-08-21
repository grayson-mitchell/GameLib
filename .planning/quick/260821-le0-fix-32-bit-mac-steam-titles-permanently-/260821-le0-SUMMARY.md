---
quick: 260821-le0
subsystem: steam
tags: [steam, macos, apple-silicon, uninstall, ipc, jest]

provides:
  - "isAppleSiliconMac positive host probe (backend/constants/environment.ts)"
  - "enumerateSteamInstallCopies / removeSteamInstallCopy multi-root primitives (steam/library.ts)"
  - "SteamGame.install() route-time auto-cleanup of a demoted native i386 orphan (steam/games.ts)"
  - "removeAllSteamInstallCopies IPC seam + Remove all copies… GameSubMenu action"
affects: [steam-uninstall, steam-install-routing, macos-native-steam]

tech-stack:
  added: []
  patterns:
    - "jest.requireMock('os') spy pattern for tests that must exercise a real host-gate module against jest.setupContainment.ts's global os mock"
    - "one-file-per-IPC-handler-body convention (removeAllCopies.ts) shared verbatim by main.ts and steamAuthFlowRegistration.ts"

key-files:
  created:
    - src/backend/storeManagers/steam/removeAllCopies.ts
  modified:
    - src/backend/constants/environment.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/removeCopies.test.ts
    - src/common/types/ipc.ts
    - src/backend/main.ts
    - src/backend/sidecar/steamAuthFlowRegistration.ts
    - src/preload/api/steam.ts
    - src/frontend/screens/Game/GameSubMenu/index.tsx
    - public/locales/en/gamelib.json

key-decisions:
  - "Used showDialogModal (not UninstallModal) for the Remove all copies confirm — UninstallModal is Windows-prefix/single-root specific per the plan's explicit fallback clause"
  - "Fixed a pre-existing isIntelMac crash on cpus()===[] as an in-scope Rule 1 auto-fix, since this task's own mandated host-gate test exposed it directly"
  - "Task 1's test file, once fully written, was committed together with Task 1's source rather than split further; Task 2's commit message documents that its coverage rode along with the prior commit"

requirements-completed: []

duration: resumed session, ~1h (Task 3 portion this segment)
completed: 2026-08-21
---

# Quick 260821-le0: Fix 32-bit Mac Steam titles permanently — Summary

**Closed the 32-bit-Mac Steam orphan defect at its source (Apple Silicon host gate + route-time auto-cleanup) and added a "Remove all copies" sweep so any existing orphan across native/bottle/bridge can be cleared in one action instead of one Uninstall click per root.**

## Resume note

A prior run of this task stalled after Task 1's implementation was written but before its tests were completed. This run resumed from that point: finished Task 1's test suite (including a jest core-module mocking investigation — see Deviations), implemented and verified Task 2 (already-committed source, extended with tests), then implemented and verified Task 3 in full (new `removeAllCopies.ts`, all 4 IPC seams, the frontend button + confirm dialog, i18n strings, and the corresponding tests) in this session.

## Performance

- **Tasks:** 3/3 completed
- **Files modified/created this session (Task 3 portion):** 8 (1 created, 7 modified)
- **Total files touched across all 3 tasks:** 10

## Accomplishments

- `isAppleSiliconMac` — a positive host probe (`darwin` + `arm64`/Rosetta `VirtualApple` model) — replaces the implicit `!isIntelMac` assumption that let a 32-bit title get routed through the CrossOver bottle on an Apple Silicon Mac and orphan its native install.
- `enumerateSteamInstallCopies` / `removeSteamInstallCopy` are now shared, unit-tested primitives for every native/bottle/bridge root, reused by both the route-time auto-cleanup (Task 2) and the new user-facing sweep (Task 3).
- `SteamGame.install()` now removes a demoted native i386 orphan automatically, at route time, before routing through the bottle — closing the defect for every future install, not just existing orphans.
- `removeAllSteamInstallCopies` gives users a one-click way to clear an *existing* orphan (e.g. HOARD/63000, installed on all three roots simultaneously) without needing one Uninstall click per root.

## Task Commits

1. **Task 1: Apple Silicon host gate + multi-root enumerate/remove primitives** - `184415669` (feat) — `environment.ts` (`isAppleSiliconMac` + Rule 1 fix to `isIntelMac`), `library.ts` (`enumerateSteamInstallCopies`, `removeSteamInstallCopy`), full `removeCopies.test.ts` (24 tests)
2. **Task 2: route-time auto-cleanup** - `69a1c4f5c` (feat) — `games.ts`'s `removeDemotedNativeOrphan()`, called as the first statement of `install()`'s `routeThroughBottle` branch; test coverage rode along with commit 1 (see commit message)
3. **Task 3: Remove all copies IPC seam + UI** - `be73db5cb` (feat) — `removeAllCopies.ts`, `ipc.ts`, `main.ts`, `steamAuthFlowRegistration.ts`, `preload/api/steam.ts`, `GameSubMenu/index.tsx`, `gamelib.json`, `removeCopies.test.ts` extensions (9 new tests)

**Plan metadata:** not yet committed — orchestrator handles the docs commit (SUMMARY.md/STATE.md/PLAN.md) separately, per this task's explicit constraint.

## Files Created/Modified

- `src/backend/constants/environment.ts` - adds `isAppleSiliconMac`; Rule 1 fix to `isIntelMac`'s `cpus()[0]` crash on zero-CPU hosts
- `src/backend/storeManagers/steam/library.ts` - `SteamInstallCopy`, `enumerateSteamInstallCopies`, `RemoveCopyResult`, `removeSteamInstallCopy`
- `src/backend/storeManagers/steam/games.ts` - `removeDemotedNativeOrphan()` called at the top of `install()`'s bottle-routing branch
- `src/backend/storeManagers/steam/removeAllCopies.ts` - new: `removeAllSteamInstallCopies(appName)`, the shared IPC handler body for both runtimes
- `src/common/types/ipc.ts` - `steamRemoveAllCopies` added to `AsyncIPCFunctions`
- `src/backend/main.ts` - Electron `addHandler('steamRemoveAllCopies', ...)`
- `src/backend/sidecar/steamAuthFlowRegistration.ts` - Tauri `ipcMain.handle('steamRemoveAllCopies', ...)` + declared-channel doc-comment entry
- `src/preload/api/steam.ts` - `steamRemoveAllCopies` handler invoker export
- `src/frontend/screens/Game/GameSubMenu/index.tsx` - Steam-only "Remove all copies…" button, routed through `showDialogModal`'s confirm pattern
- `public/locales/en/gamelib.json` - `steam.uninstall.removeAllCopies{Label,ConfirmTitle,ConfirmMessage}`
- `src/backend/storeManagers/steam/__tests__/removeCopies.test.ts` - 33 tests total across all 3 tasks (host gate, enumerate/remove primitives, route-time auto-cleanup, the sweep's tally/refusal/error paths, and a 4-file IPC seam census)

## Decisions Made

- **Confirm dialog choice:** used the existing `showDialogModal` pattern (from `ContextProvider`) rather than `UninstallModal`, because `UninstallModal` is scoped to a single Windows-prefix uninstall call and isn't a fit for a multi-root sweep — this follows the plan's explicit fallback clause.
- **Rule 1 auto-fix in `environment.ts`:** the pre-existing `isIntelMac` line dereferenced `cpus()[0]` unconditionally and crashed on a zero-CPU host. This was directly exposed by this task's own mandated host-gate test coverage (adjacent line, same file), so it was fixed in place with a documenting comment rather than worked around.
- **Test-file commit split:** Task 1's full test file (`removeCopies.test.ts`, all scenarios written in one pass) was committed together with Task 1's source. Task 2's commit documents in its message that its own test coverage was already present from the prior commit, rather than re-splitting an already-written file artificially.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `isIntelMac` crash on `cpus()` returning `[]`**
- **Found during:** Task 1 (writing the host-gate test's zero-CPU-host case)
- **Issue:** `cpus()[0].model.includes('Intel')` threw `TypeError: Cannot read properties of undefined (reading 'model')` when `cpus()` returns an empty array — a pre-existing bug immediately adjacent to this task's new `isAppleSiliconMac` line, not part of any prior diff.
- **Fix:** `(cpus()[0]?.model ?? '').includes('Intel')` — identical behavior for every normal host (empty string `.includes('Intel')` is `false`), fails closed instead of crashing on the zero-CPU edge case.
- **Files modified:** `src/backend/constants/environment.ts`
- **Verification:** `isAppleSiliconMac (host gate)` describe block, 8/8 passing including `darwin + x64 cpus() returning [] -> false, fails closed`.
- **Commit:** `184415669`

**2. [Test infrastructure] jest `os` module mocking required three iterations to find the correct approach**
- **Found during:** Task 1 (writing `loadWithHost()`, the host-gate test helper)
- **Issue:** `jest.spyOn()` on the real `os` namespace throws `Cannot redefine property: cpus` (Node core-module exports are non-configurable). A competing file-local `jest.mock('os', ...)` silently loses to the project's global `jest.setupContainment.ts` mock (a `setupFiles` entry applied to every backend test, for HOME/USERPROFILE containment).
- **Fix:** no file-local `os` mock; instead `jest.requireMock('os')` retrieves the already-installed containment mock (a plain spread object with configurable properties) and `jest.spyOn()`'s its `cpus` method directly. Documented in-file so a future test author doesn't repeat the same three-iteration search.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/removeCopies.test.ts` (test-only, no source change)
- **Verification:** all 8 host-gate tests pass, including the mandatory RED-proof case.

No architectural changes, no scope reduction. `uninstallBottleGameDirectly` was left untouched (`// TODO(dedup)` comment only), per this task's explicit constraint.

## Known Stubs

None.

## Threat Flags

None — `removeAllSteamInstallCopies` validates `appName` as a numeric string before any enumeration or delete target is built (same discipline as `getSteamBottleEligibilityVerdict`/`installFormIpc.ts`), matches the plan's `T-LE0-01`–`T-LE0-06` mitigations, and introduces no new network endpoints, auth paths, or schema changes.

## Verification Results

Plan's top-level `<verification>` block, run in full after Task 3's commit:

1. **Whole Steam jest suite** (`pnpm jest src/backend/storeManagers/steam/__tests__/`) — 33 suites, 1281 passed, 2 skipped (pre-existing), 0 failed.
2. **Sidecar declared-channel gate** (`pnpm jest src/backend/sidecar/__tests__/steamAuthFlows.test.ts`) — 40/40 passed (confirms the `steamRemoveAllCopies` doc-comment entry matches the registered handler).
3. **`pnpm codecheck`** (`tsc --noEmit`) — clean, no errors.
4. **4-seam grep census** (`grep -rn "steamRemoveAllCopies" src/common/types/ipc.ts src/backend/main.ts src/backend/sidecar/steamAuthFlowRegistration.ts src/preload/api/steam.ts | grep -v '^\s*//' | wc -l`) — **5** (≥ 4 required).
5. **RED-proof of the host gate** — satisfied by the test file's own self-contained `RED-proof: !isIntelMac gets the Intel and empty-model cases WRONG` test, which computes `!isIntelMac` against the same host fixtures and proves it disagrees with the real `isAppleSiliconMac` on both the Intel and empty-model cases (documented in-test as self-verifying, no source edit+revert needed) — passing as part of the 33/33 suite.

All 7 items in the plan's `<success_criteria>` are satisfied: host gate is a positive probe and fails closed; the shared enumerate/remove primitives exist and are independently tested; route-time auto-cleanup runs before bottle routing; the sweep IPC seam is registered on both runtimes; the frontend action is Steam-only and confirmed; i18n strings are present; `uninstallBottleGameDirectly` is untouched.

## Self-Check

Verifying claims made in this summary:

- All 11 files listed under Files Created/Modified: **FOUND** on disk.
- All 3 task commit hashes (`184415669`, `69a1c4f5c`, `be73db5cb`): **FOUND** in `git log`.

## Self-Check: PASSED
