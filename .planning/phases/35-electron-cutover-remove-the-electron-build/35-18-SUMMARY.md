---
phase: 35-electron-cutover-remove-the-electron-build
plan: 18
subsystem: build
tags: [electron-removal, esbuild, jest-mocks, mutation-testing, release-notes, package-json]

# Dependency graph
requires:
  - phase: 35-electron-cutover-remove-the-electron-build
    provides: "35-15's src/ import migration (electron -> backend/platform) and reach-ledger baseline; 35-16's preload collapse; 35-17's isTauri() deletion -- all prerequisites this plan's package.json/esbuild removal depends on being already true"
provides:
  - "electron devDependency (and electron-store, and react-devtools' transitive electron@23.3.13) fully removed from package.json and node_modules"
  - "esbuild --alias:electron= flag removed from the SEA build; 43 test files' jest.mock('electron', ...) repointed to backend/platform"
  - "meta/__tests__/electronAbsence.test.ts -- the mechanized, mutation-proven form of D-03's success test"
  - "35-RELEASE-NOTES.md -- user-facing documentation of every accepted gap and behaviour change the phase ships"
affects: [35-19, package-build-pipeline, jest-test-mocks]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mutation-proven absence gate: assert a negative fact (electron package leaves zero traces) via one scratch-copy mutation per assertion, restored via cp + shasum -a 256, rather than trusting a green run alone"
    - "Release notes sourced from plan SUMMARY.md observed behaviour, not from CONTEXT.md decision text, when the two have diverged post-correction"

key-files:
  created:
    - meta/__tests__/electronAbsence.test.ts
    - .planning/phases/35-electron-cutover-remove-the-electron-build/35-RELEASE-NOTES.md
  modified:
    - meta/esbuildWorkerBundleShared.ts
    - meta/__tests__/buildSidecarSea.test.ts
    - package.json
    - pnpm-lock.yaml
    - src/backend/platform/__mocks__/index.ts (moved from src/backend/__mocks__/electron.ts)
    - 43 test files across src/backend/sidecar, src/backend/storeManagers, src/preload (jest.mock/jest.doMock specifier repointed from 'electron' to 'backend/platform')
    - src/backend/sidecar/__tests__/bootstrap.test.ts
    - src/backend/sidecar/__tests__/appRootResolution.test.ts
    - src/backend/sidecar/__tests__/wineToolsFlows.test.ts
    - src/common/typedefs/extra-mock-function.ts

key-decisions:
  - "D-03 satisfied via a mutation-proven mechanized gate (4 assertion forms + 1 vacuity control), not a one-time manual grep"
  - "react-devtools removed from devDependencies (not in the plan's files_modified list) because it bundles a transitive electron@23.3.13 that survives hoisting under this repo's node-linker=hoisted .npmrc setting -- required to satisfy the literal acceptance criterion 'node_modules/electron does not exist'"
  - "Release notes' logout item sourced from 35-09's actual (corrected) domain-scoped-Epic-only implementation, not from the plan's own stale must_haves/action text describing D-09's original, now-banned clear_all_browsing_data() mechanism"

requirements-completed: [REQ-35-02, REQ-35-21]

# Metrics
duration: ~28min of committed task work across 2 sessions (23:26-23:54 NZT 2026-08-29 for the 3 task commits; exact session-elapsed time not recorded due to a mid-plan context compaction)
completed: 2026-08-30
---

# Phase 35 Plan 18: Electron Cutover -- Remove the Electron Build Summary

**Removed `electron` from package.json/esbuild entirely, replaced D-03's manual grep with a mutation-proven absence gate, and shipped user-facing release notes correcting a stale, banned D-09 description against what plan 35-09 actually implemented.**

## Performance

- **Duration:** ~28 min of committed task work (task commits span 23:26:31-23:54:01 NZT on 2026-08-29); work spanned two sessions with a context compaction in between, so wall-clock session time is not precisely known
- **Completed:** 2026-08-30
- **Tasks:** 3/3 complete
- **Files modified:** 50 (Task 1) + 6 (Task 2) + 1 (Task 3) -- see Task Commits below for exact per-task stat lines

## Accomplishments

- `electron` no longer appears anywhere in `src/` or `package.json` (including devDependencies) -- confirmed by both a mechanized test and a final manual sweep (`node_modules/electron` absent, zero `"electron` key matches)
- D-03's "electron appears nowhere" success test is now a permanent, mutation-proven regression gate (`meta/__tests__/electronAbsence.test.ts`) instead of a manual grep a human runs once and forgets
- Every one of the phase's accepted gaps and behaviour changes (artwork/offline, Linux AppImage-only, updater handover, storefront logout scope, tray, `gamelib://` platform coverage, download auto-resume by store, remaining known gaps) is now documented in `35-RELEASE-NOTES.md` in plain user language, with an internal decision-ID appendix for maintainers

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove the SEA `--alias:electron=` esbuild flag; repoint every test mock** - `7ed470b19` (feat) -- 50 files changed, 301 insertions(+), 281 deletions(-)
2. **Task 2: Remove `electron`/`electron-store`/`react-devtools` devDependencies; write the mutation-proven D-03 gate** - `2e826a395` (feat) -- 6 files changed, 302 insertions(+), 2541 deletions(-) (bulk of the deletions are `pnpm-lock.yaml`)
3. **Task 3: Write `35-RELEASE-NOTES.md`** - `390c8bead` (docs) -- 1 file changed, 93 insertions(+)

**Plan metadata:** (this commit, made immediately after this SUMMARY) - `docs: complete 35-18 plan`

## Files Created/Modified

- `meta/__tests__/electronAbsence.test.ts` - New. 4 assertion forms (static import specifier, `require()` call, `Electron.` namespace reference, package.json dependency key) matched as exact reference forms (never bare substring), comments stripped before matching, one documented tolerance exception, plus a vacuity control asserting `backend/platform` is still found by the same scan mechanism
- `.planning/phases/35-electron-cutover-remove-the-electron-build/35-RELEASE-NOTES.md` - New. 8 user-facing sections (Artwork, Linux packages, Updates, Signing out, Tray icon, `gamelib://` links, Downloads that were interrupted, What still doesn't work) plus a "For anyone who ran the old build" note and an internal decision-trace appendix
- `package.json` - `electron`, `electron-store`, `react-devtools` removed from devDependencies; `debug:react` script changed to `npx react-devtools` on demand
- `pnpm-lock.yaml` - Regenerated via `pnpm install` after the devDependency removal
- `meta/esbuildWorkerBundleShared.ts` - `--alias:electron=` flag removed from `seaEsbuildFlags()`
- `meta/__tests__/buildSidecarSea.test.ts` - Flag-presence assertion inverted to flag-absence
- `src/backend/platform/__mocks__/index.ts` - New location for the 9 test doubles formerly in `src/backend/__mocks__/electron.ts` (deleted)
- 43 test files - `jest.mock('electron', ...)` / `jest.doMock('electron', ...)` repointed to `'backend/platform'`, or deleted where already vestigial (module under test never required `'electron'` to begin with)
- `src/common/typedefs/extra-mock-function.ts` - Supporting type surface for the mock repointing

## Decisions Made

- **D-03 mechanization:** implemented as a standalone test file rather than folding assertions into an existing gate, since D-03 is a permanent standing invariant (package-level absence), not a one-time migration check tied to any single plan's lifecycle.
- **react-devtools removal (deviation, see below):** required to literally satisfy `test ! -d node_modules/electron` -- react-devtools@5.3.2's own transitive `electron@23.3.13` survives this repo's `node-linker=hoisted` .npmrc setting, which has no fine-grained hoist-pattern exclusion.
- **Release notes sourced from observed behaviour, not decision text:** per this plan's own T-35-89 threat-mitigation instruction ("the logout item is sourced from plan 35-09's observed behaviour rather than from the decision text"), the release note describes Epic-domain-scoped logout (what 35-09 actually shipped) rather than the plan's own stale `must_haves`/`<action>` text describing D-09's original, since-banned `clear_all_browsing_data()` mechanism.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `react-devtools` removed alongside `electron`/`electron-store`**
- **Found during:** Task 2
- **Issue:** After removing `electron` and `electron-store` from `package.json` and running install, `node_modules/electron` was still present. Root cause: `react-devtools@5.3.2` bundles its own `electron@23.3.13` as a transitive dependency, and this repo's `.npmrc` sets `node-linker=hoisted` with no fine-grained hoist-pattern exclusion, so the transitive electron kept being hoisted into `node_modules/electron` even after GameLib's own devDependency was gone.
- **Fix:** Removed `react-devtools` from devDependencies entirely; `debug:react` script changed from a pinned devDependency invocation to `npx react-devtools` on demand, preserving the same developer workflow (run the script, react-devtools launches) without a package-level electron re-entry point.
- **Files modified:** `package.json`, `pnpm-lock.yaml`
- **Verification:** `test ! -d node_modules/electron` passes; `pnpm start` and the debug workflow unaffected (react-devtools was always an on-demand dev tool, never imported by application code).
- **Committed in:** `2e826a395` (part of Task 2's commit)

**2. [Rule 1 - Bug] 3 `jest.doMock('electron', ...)` call sites missed by Task 1's sweep**
- **Found during:** Task 2
- **Issue:** Task 1's mechanical sweep searched for `jest.mock(`, not `jest.doMock(`. Three test files (`bootstrap.test.ts`, `appRootResolution.test.ts`, `wineToolsFlows.test.ts`) still called `jest.doMock('electron', ...)`, which would throw "Cannot find module 'electron'" at test run time once `electron` left `node_modules` in this same task.
- **Fix:** All three were confirmed vestigial (the modules under test import `backend/platform` directly, never `electron`), so the calls were deleted rather than repointed, with surrounding docstrings updated to describe the post-removal reality (the old project-wide automock is gone; `backend/platform`'s replacement mock is opt-in only, never auto-applied).
- **Files modified:** `src/backend/sidecar/__tests__/bootstrap.test.ts`, `src/backend/sidecar/__tests__/appRootResolution.test.ts`, `src/backend/sidecar/__tests__/wineToolsFlows.test.ts`
- **Verification:** All three suites pass in isolation and as part of the full backend/sidecar project run.
- **Committed in:** `2e826a395` (part of Task 2's commit)

### Content Correction (not a code deviation)

**3. Release note text corrected against a stale plan input**
- **Found during:** Task 3
- **Issue:** Both this plan's own `<action>` text and its `must_haves.truths` block describe the logout behaviour as "logging out of one store logs you out of all of them" -- this is D-09's ORIGINAL decision text, prescribing `clear_all_browsing_data()`. That mechanism is banned in source at three sites in `src-tauri/src/main.rs` and was superseded by a 2026-08-29 correction appended to `35-CONTEXT.md` (per `deferred-items.md` entry `D-35-09-01`), because the shared cookie jar would silently sign users out of storefronts they never touched (closed requirement REQ-34.4.1-06). Plan 35-09 actually shipped a domain-scoped Epic-only cookie clear (5 Epic-owned apex domains) that does not affect other stores.
- **Resolution:** The release note's "Signing out" section was written to describe the ACTUAL, corrected, shipped behaviour -- signing out of one store does not sign you out of the others -- rather than the plan's own stale text. This is exactly what the plan's own threat mitigation T-35-89 instructs ("sourced from plan 35-09's observed behaviour rather than from the decision text"), so following the plan's own more-specific mitigation guidance over its own less-specific summary text is not a deviation from the plan's intent, just from one inconsistent sentence inside it.
- **Files affected:** `35-RELEASE-NOTES.md` only (no source code)
- **Verification:** Cross-referenced `35-09-SUMMARY.md` and `35-CONTEXT.md`'s D-09 correction appendix directly before writing the release note; the plan's own acceptance-criteria script does not check the logout section's literal wording, only that it exists and that no decision ID leaks above the appendix heading, so the correction has no automated-test tension with the plan's stated verification.

## Known Stubs

None -- this plan only removes a dependency (deletion, not stub creation) and writes documentation.

## Threat Flags

None -- no new network endpoints, auth paths, file-access patterns, or trust-boundary schema changes were introduced. The plan's own STRIDE register (T-35-84 through T-35-89, T-35-SC) covers this plan's actual surface (package.json tampering risk, mock-repointing correctness, release-note decision-ID leakage) and all listed mitigations were applied as described above.

## Self-Check: PASSED

- FOUND: `meta/__tests__/electronAbsence.test.ts`
- FOUND: `.planning/phases/35-electron-cutover-remove-the-electron-build/35-RELEASE-NOTES.md`
- FOUND: `package.json` (no `electron`/`electron-store`/`react-devtools` keys)
- FOUND: commit `7ed470b19` in `git log --oneline --all`
- FOUND: commit `2e826a395` in `git log --oneline --all`
- FOUND: commit `390c8bead` in `git log --oneline --all`
- CONFIRMED: `node_modules/electron` absent
