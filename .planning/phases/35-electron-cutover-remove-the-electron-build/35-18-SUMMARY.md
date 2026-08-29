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

## Post-Wave Gate Fix (2026-08-30)

A post-wave gate review found the plan's initial 3-task execution (above) substantively correct but
incomplete on two points. Both are closed as of commit `272f9fe1a`.

### Gap 1: `package.json:34` still carried `--external:electron`, invisible to the D-03 gate

**Finding:** `build:sidecar`'s esbuild invocation (`"esbuild --bundle ... --packages=external
--external:electron --outfile=build/main/sidecar.js src/sidecar/index.ts"`) still had a live
`--external:electron` flag after all three tasks were committed. `electronAbsence.test.ts` as
originally written reported green throughout, because its `package.json` coverage only inspected
the `dependencies`/`devDependencies` object *keys* -- structurally blind to the `scripts` section
(and every other section of the file). D-03's actual text ("`electron` appears nowhere in `src/`
or `package.json`") is whole-file, literal scope; the original gate under-covered it.

**Redundancy verified empirically, not assumed:** built a scratch probe file containing
`require('electron')`, ran esbuild against it with only `--packages=external` (no
`--external:electron`), and separately with both flags present, then diffed the two outputs --
byte-identical. `--packages=external` already externalizes every bare-specifier package import,
`electron` included; the explicit flag was fully redundant even before removal. Confirmed against
esbuild's own `--help` text ("`--packages=...` Set to `external` to avoid bundling any package")
as a second, independent source.

**Fix:**
- Removed `--external:electron` from `package.json:34`'s `build:sidecar` script.
- Widened `meta/__tests__/electronAbsence.test.ts` with a new file-wide substring scan of the
  entire `package.json` (not just the two dependency maps), with its own vacuity control
  (`"gamelib"` must still be found by the same read). The original key-based check was kept
  alongside it, unchanged, for its more specific per-key error message.
- **Mutation-proven** using this project's established methodology: reintroduced the exact
  `--external:electron` flag into `package.json`, re-ran the suite -- the new file-wide assertion
  went RED while the original key-based assertion stayed GREEN, empirically confirming the old
  check truly could never have caught this class of gap. Restored via `cp` + `shasum -a 256 -c`
  byte-identity (never `git checkout -- <file>`, which fires a `post-checkout` hook that throws
  per an established project lesson). Re-ran: all 7 `it()` blocks green again.
- No `electron` literal needed to legitimately remain anywhere in `package.json`; no exemption was
  required.

**No other legitimate `electron` literal exists elsewhere in `package.json`** -- confirmed by the
new file-wide scan itself (0 matches) plus a direct `grep -n electron package.json` (0 matches),
both post-fix.

**Deferred (out of scope for this fix, logged as `D-35-18-01`):** three pre-existing stale
comments describing removed or already-inaccurate esbuild mechanisms (`meta/buildSidecarSea.ts:154-156`,
`meta/buildSidecarSea.ts:699-701`, `src/sidecar/index.ts:5-6`). Comment-only, inert to both D-03's
gate (comments are stripped before matching) and to build behaviour. One predates this plan
entirely. Per the SCOPE BOUNDARY rule, logged rather than fixed.

**Commit:** `272f9fe1a` -- `fix(35-18): close post-wave gate 1 -- package.json:34 was blind to the D-03 gate`

### Gap 2: the real sidecar/SEA build was never actually run

**Finding:** the original SUMMARY (this file, before this amendment) recorded task completion and
gate-passing test suites, but no evidence the real build pipeline had been executed end-to-end.
This project has a standing lesson that a bundle-only defect is invisible to jest ("all backend
jest suites green, `tsc` clean... crashed on evaluation-order issues" -- see
`jest-cannot-see-dynamic-import-defects` in project memory), and this plan specifically changed
esbuild bundling behaviour (removed both the `--alias:electron=` flag in Task 1 and the
`--external:electron` flag in the Gap 1 fix above), making build verification load-bearing, not
optional.

**Action taken:** the real build was run, not blocked. Sequence:
1. `rm -rf build/main` -- confirmed safe; `build/main` is pure esbuild output. Did **not** touch
   `build/bin` (helper binaries), per the standing warning that `download-helper-binaries` is
   tag-idempotent, not presence-idempotent, and an `rm -rf` there is not auto-restored by a rebuild.
2. `pnpm build:sidecar` -- real dev/Electron-target esbuild bundle, ran clean.
3. `pnpm build:sidecar-sea` -- real SEA build, chaining `build:sidecar` then
   `meta/buildSidecarSea.ts`'s fully self-contained bundle + Node SEA blob injection. Produced
   `src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin`: 169,780,640 bytes, confirmed via
   `file` as `Mach-O 64-bit executable arm64`.
4. `pnpm smoke:sidecar` -- the existing project gate (rebuilds `build/main/sidecar.js`, spawns it
   with no stdin, expects exit 0) -- **PASSED**: `[sidecar-smoke] PASS: built, started, exited 0
   on stdin EOF.` This exercises the dev bundle only.
5. Went beyond the existing smoke gate: directly spawned the freshly-built **SEA binary itself**
   (not the dev bundle) via an ad-hoc `spawnSync` probe, no stdin, 30s timeout. Result: exit
   status 0, no error, genuine RPC-loop output including the readiness marker
   `__GAMELIB_SIDECAR_READY__` and real frames (`storeChanged`, `connectivity-changed`, a
   `rustInvoke` `tray_set_icon` frame). This is direct evidence the actual packaged artifact --
   not just the intermediate dev bundle -- builds and boots correctly after both esbuild-flag
   removals in this plan.

**Outcome: build succeeded, no blocker to ledger.** Plan 35-19's packaged macOS arm64 live gate
(wave 13) remains the authoritative end-to-end verification (full Tauri package, not just the
sidecar binary in isolation), but this plan's own build surface is now proven, not merely claimed.

### Re-verified test suite (post-fix)

Re-ran `pnpm test --selectProjects Backend Meta Preload Frontend Common` three times to
distinguish deterministic failures from load-dependent flakes (a documented class in this
project -- a full-suite run can manufacture a different failure set than isolated runs):

- **Run 1:** 3 suites failed / 6 tests failed -- `decompressPool.test.ts` (3, known-red) +
  `enrichmentFlows.test.ts` (2, two `getAnticheatInfo` assertions) + implicitly a third suite not
  visible in the truncated tail.
- **Run 2:** 3 suites failed / matched `genI18nGateScope.test.ts` (1, known-red) +
  `decompressPool.test.ts` (3, known-red) + `isIntelMacRemoved.test.ts` (2).
- **Run 3:** 2 suites failed / 4 tests failed -- `genI18nGateScope.test.ts` (1) +
  `decompressPool.test.ts` (3). Nothing else.

Isolated `npx jest --testPathPattern` runs of every suite that appeared in only one of the three
full runs all passed cleanly: `enrichmentFlows.test.ts` (41/41), `bootstrapWirings.test.ts`
(13/13), and `isIntelMacRemoved.test.ts` (2/2). `decompressPool.test.ts` and
`genI18nGateScope.test.ts` fail identically in isolation and every full run -- these are the true
deterministic baseline (LZMA native-decode environment gap; an i18n-scope-snapshot check with a
documented pre-existing drift), unrelated to this plan's changes.

**Real, verified counts: 2 suites / 4 tests genuinely red (`decompressPool.test.ts` x3,
`genI18nGateScope.test.ts` x1), both pre-existing and unrelated to Gap 1/Gap 2. Nothing new
introduced by this plan's fix work.** `enrichmentFlows.test.ts` and `isIntelMacRemoved.test.ts`
are confirmed load-dependent flakes (documented class), not regressions.

## Known Stubs

None -- this plan only removes a dependency (deletion, not stub creation) and writes documentation.

## Threat Flags

None -- no new network endpoints, auth paths, file-access patterns, or trust-boundary schema changes were introduced. The plan's own STRIDE register (T-35-84 through T-35-89, T-35-SC) covers this plan's actual surface (package.json tampering risk, mock-repointing correctness, release-note decision-ID leakage) and all listed mitigations were applied as described above.

## Self-Check: PASSED

- FOUND: `meta/__tests__/electronAbsence.test.ts`
- FOUND: `.planning/phases/35-electron-cutover-remove-the-electron-build/35-RELEASE-NOTES.md`
- FOUND: `package.json` (no `electron`/`electron-store`/`react-devtools` keys, no `electron`
  substring anywhere in the file -- file-wide scan, not just dependency keys)
- FOUND: commit `7ed470b19` in `git log --oneline --all`
- FOUND: commit `2e826a395` in `git log --oneline --all`
- FOUND: commit `390c8bead` in `git log --oneline --all`
- FOUND: commit `272f9fe1a` in `git log --oneline --all` (post-wave gate fix)
- CONFIRMED: `node_modules/electron` absent
- CONFIRMED: `src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin` exists, 169,780,640 bytes,
  `file` reports Mach-O 64-bit executable arm64, directly spawned and reached
  `__GAMELIB_SIDECAR_READY__`
- CONFIRMED: `pnpm test --selectProjects Backend Meta Preload Frontend Common` run 3x; deterministic
  baseline is 2 suites / 4 tests (`decompressPool.test.ts`, `genI18nGateScope.test.ts`), all other
  observed failures reproduced as isolated-pass flakes
