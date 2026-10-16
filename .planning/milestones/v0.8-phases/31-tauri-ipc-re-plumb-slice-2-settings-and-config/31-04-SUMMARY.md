---
phase: 31-tauri-ipc-re-plumb-slice-2-settings-and-config
plan: 04
subsystem: infra
tags: [tauri, electron-shim, dialog, ipc, path-traversal, security, sidecar]

# Dependency graph
requires:
  - phase: 31-tauri-ipc-re-plumb-slice-2-settings-and-config (plans 01-02)
    provides: settingsFlowRegistration.ts write path (setSetting/writeConfig), electronStub.ts dialog trio (showMessageBox/showErrorBox/showSaveDialog)
provides:
  - showMessageBox de-wired to a safe-sentinel logged no-op (never auto-confirms, never crashes)
  - resolve+relative path-containment guard on the per-game setSetting/writeConfig write branch
  - corrected SEAM.md / 31-PORTED-CHANNELS.md / REQUIREMENTS.md reflecting the narrowed dialog scope
affects: [phase-33-lifecycle-dialog-cluster, phase-32-planning]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Safe-sentinel resolve (never reject) for a de-wired async stub whose real callers are unguarded fire-and-forget"
    - "resolve()+relative()+isAbsolute() path-containment guard mirrored from library.ts's locateMachOBinary idiom"

key-files:
  created: []
  modified:
    - src/backend/sidecar/electronStub.ts
    - src/backend/sidecar/__tests__/dialogStub.test.ts
    - src/backend/sidecar/settingsFlowRegistration.ts
    - src/backend/sidecar/__tests__/settingsFlows.test.ts
    - .planning/phases/27-tauri-shell-walking-skeleton/SEAM.md
    - .planning/phases/31-tauri-ipc-re-plumb-slice-2-settings-and-config/31-PORTED-CHANNELS.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "showMessageBox is de-wired (not multi-button-implemented): resolves { response: -1, checkboxChecked: false }, never forwards to RUST_DIALOG_MESSAGE, never rejects -- declines both reachable destructive callers (promptI386Recovery, askForceUninstall) without risking an unhandled-rejection sidecar crash"
  - "WR-01 containment guard applied only on the per-game branch (appName !== 'default') of setSetting/writeConfig; global branch unaffected; WR-02/WR-03 stay accepted out-of-scope WARNINGs"
  - "REQ-31-03 left unchecked with an honest status note rather than marked complete, since showMessageBox real behavior is deferred to Phase 33"

requirements-completed: [REQ-31-03, REQ-31-06]

# Metrics
duration: ~20min
completed: 2026-07-23
---

# Phase 31 Plan 04: Gap Closure — De-wire showMessageBox + WR-01 Containment Summary

**De-wired `dialog.showMessageBox` to a safe resolved sentinel (`{response:-1}`) closing CR-01's auto-confirm bug, and added a `resolve`+`relative` path-containment guard to the per-game `setSetting`/`writeConfig` write branch closing WR-01.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-23
- **Tasks:** 3 completed
- **Files modified:** 7

## Accomplishments

- `dialog.showMessageBox` no longer forwards to `RUST_DIALOG_MESSAGE` or maps Rust's OK-only bool to `response:0/1` — it logs one `console.warn` and RESOLVES the safe sentinel `{ response: -1, checkboxChecked: false }`. This declines both reachable destructive backend callers (`promptI386Recovery` decline=`response!==0`, `askForceUninstall` decline=`response!==1`) and never rejects, preserving the "never throws" safety the unguarded fire-and-forget callers depend on.
- Per-game `setSetting` and `writeConfig` now drop any `appName` that resolves outside `gamesConfigPath` (traversal like `'../../etc/passwd'`) via a `resolve()`+`relative()`+`isAbsolute()` containment check mirroring the proven `locateMachOBinary` idiom, logging to stderr and returning a safe value instead of writing outside the intended directory.
- SEAM.md, 31-PORTED-CHANNELS.md, and REQUIREMENTS.md no longer claim the dialog cluster is fully/safely closed — `showMessageBox` was relocated from "Ported this phase" to "Deliberately NOT ported this phase" with its real, already-shipped callers named, and REQ-31-03 carries an honest status note.

## Task Commits

Each task was committed atomically:

1. **Task 1: De-wire dialog.showMessageBox to a safe sentinel-resolving logged no-op (CR-01)** - `ccb15138` (fix)
2. **Task 2: Path-containment guard on the per-game config write path (WR-01)** - `6214cbea` (fix)
3. **Task 3: Correct SEAM.md / 31-PORTED-CHANNELS.md / REQ-31-03 and run the full green gate** - `1e98c8e1` (docs)

_Note: Task 2's commit also includes a small compile-compatibility fix to showMessageBox's signature (see Deviations)._ 

## Files Created/Modified

- `src/backend/sidecar/electronStub.ts` - `showMessageBox` de-wired to resolve `{response:-1}`; `mapMessageBoxKind` removed (dead code); `showErrorBox`/`showSaveDialog` unchanged; dialog-block docstring updated with the CR-01 rationale
- `src/backend/sidecar/__tests__/dialogStub.test.ts` - replaced the two stale bool→response mapping tests and the stale reject-path test with three new tests asserting the safe-sentinel-resolve contract; moved the `RUST_DIALOG_MESSAGE` membership test under `showErrorBox`
- `src/backend/sidecar/settingsFlowRegistration.ts` - added `isContainedGameConfig()` helper (imports `gamesConfigPath`, `resolve`/`relative`/`isAbsolute`); applied to the per-game branch of both `setSetting` and `writeConfig`
- `src/backend/sidecar/__tests__/settingsFlows.test.ts` - two new WR-01 tests (traversal appName dropped for `setSetting` and `writeConfig`), no regression to existing write-flow tests
- `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` - corrected the Priority-2 `dialog` row and the settings/config+dialog cluster paragraph to name `showMessageBox` as deliberately un-ported
- `.planning/phases/31-tauri-ipc-re-plumb-slice-2-settings-and-config/31-PORTED-CHANNELS.md` - moved the `showMessageBox` row out of "Ported this phase" into "Deliberately NOT ported this phase" with full rationale; corrected the D-05 note and the closing "Note on dialog"
- `.planning/REQUIREMENTS.md` - REQ-31-03 stays unchecked, appended a status note naming the showMessageBox de-scope and Phase 33 deferral

## Decisions Made

- De-wire (resolve a safe sentinel), not implement the multi-button contract — per the user's already-locked scope decision, because a reject-based de-wire would crash the sidecar on the first use of either unguarded fire-and-forget caller.
- `-1` chosen as the sentinel because it satisfies both callers' decline conditions (`!== 0` and `!== 1`) simultaneously; `handleExit`'s inverted sense is moot since `main.ts` (where it's wired) is outside the sidecar's curated import graph.
- WR-02 (writeConfig type guard) and WR-03 (dialog_save directory drop) intentionally left out of scope, per the plan's locked decision — no tasks for them here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restored showMessageBox's optional-args signature**
- **Found during:** Task 2 (running `tsc --noEmit` as part of verifying the full green gate)
- **Issue:** Task 1's de-wire initially changed `showMessageBox` to take zero parameters. `dialogStub.test.ts`'s new tests call it with `(undefined, {...})` (matching Electron's real 2-arg signature and existing call-site shape), causing `TS2554: Expected 0 arguments, but got 2` at three call sites.
- **Fix:** Restored two optional, unused parameters (`_windowOrOptions?`, `_maybeOptions?`) on the function signature; the body still ignores all arguments and unconditionally resolves the sentinel.
- **Files modified:** src/backend/sidecar/electronStub.ts
- **Verification:** `npx tsc --noEmit -p tsconfig.json` clean project-wide; `dialogStub.test.ts`/`settingsFlows.test.ts` both pass.
- **Committed in:** `6214cbea` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule-1 blocking type-compile fix)
**Impact on plan:** Necessary to keep the de-wire type-compatible with real Electron call sites and existing test shapes; no behavior change, no scope creep.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CR-01 (destructive dialog auto-confirm) and WR-01 (path traversal on per-game config write) are both closed.
- Full green gate confirmed: `settingsFlows`/`storeLayer`/`dialogStub`/`electronUntouched` suites (81/81 tests) pass, project-wide `tsc --noEmit` is clean, and `cargo check --manifest-path src-tauri/Cargo.toml` prints `Finished` — REQ-31-07 (both builds still build) held.
- Real multi-button `showMessageBox` behavior remains deferred to Phase 33 (lifecycle/dialog cluster) — tracked honestly in SEAM.md, 31-PORTED-CHANNELS.md, and REQUIREMENTS.md rather than claimed complete.
- WR-02/WR-03 remain documented, accepted WARNINGs (no tasks this plan, per user's locked scope).

---
*Phase: 31-tauri-ipc-re-plumb-slice-2-settings-and-config*
*Completed: 2026-07-23*

## Self-Check: PASSED

All 8 claimed files confirmed present on disk; all 3 task commit hashes (`ccb15138`, `6214cbea`, `1e98c8e1`) confirmed in git log.
