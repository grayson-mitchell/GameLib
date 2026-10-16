---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
plan: 01
subsystem: testing
tags: [tauri, jest, ts-jest, ci, config-shape-testing, node-sea, minisign, github-actions]

# Dependency graph
requires:
  - phase: 33-tauri-lifecycle-cluster
    provides: working Tauri v2 macOS dev shell (src-tauri/tauri.conf.json, Cargo.toml, main.rs) this plan's tests read
provides:
  - "tauriConf.test.ts — regression gate for src-tauri/tauri.conf.json's target bundle/updater shape, incl. the never-regress-to-Heroic negative assertion (T-34-01)"
  - "cargoFeatures.test.ts — regression gate for src-tauri/Cargo.toml's keyring cross-platform feature list + new plugin deps"
  - "releaseWorkflow.test.ts — regression gate for the not-yet-created .github/workflows/release-tauri.yml (trigger, matrix, draft/prerelease, D-04 signing-skip warnings)"
  - "buildSidecarSea.test.ts — regression gate for the not-yet-created meta/buildSidecarSea.ts's pure argv-builders"
affects: [34-02-sea-sidecar-and-config, 34-05-updater-plugin, 34-06-release-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave-0 config-shape test scaffolding: write the regression-gate jest suite BEFORE the target config/module exists, so it is RED for the right reason (assertion failure or missing-file/missing-module, never a silent no-op), and turns GREEN when a later plan authors the real artifact."
    - "Read-file-then-assert-shape, one-behavior-per-test — mirrors src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts."
    - "Config-shape tests for not-yet-existing artifacts belong under the nearest EXISTING jest project's __tests__ dir (src/backend/__tests__, meta/__tests__), not a new src-tauri/__tests__ dir — src-tauri is not a registered jest project."

key-files:
  created:
    - src/backend/__tests__/tauriConf.test.ts
    - src/backend/__tests__/cargoFeatures.test.ts
    - src/backend/__tests__/releaseWorkflow.test.ts
    - meta/__tests__/buildSidecarSea.test.ts
    - .planning/phases/34-tauri-packaging-windows-and-linux-builds-signing-auto-update/deferred-items.md
  modified: []

key-decisions:
  - "buildSidecarSea.test.ts's target API adds a dedicated buildCodesignArgv(binaryPath, platform) export (returning [] on non-darwin, codesign steps on darwin) rather than only asserting codesign's absence inside buildPostjectArgv — gives the plan's 'codesign only on macOS' acceptance criterion a real positive assertion instead of a weak negative-string check."
  - "releaseWorkflow.test.ts's D-04 clear-warning assertions match each ::warning::Signing skipped line loosely-associated (via a non-greedy multiline regex) with its own env.{APPLE,WINDOWS}_CERTIFICATE == '' guard, rather than requiring an exact adjacent-line shape — keeps the RED-now/GREEN-later contract from over-constraining 34-06's exact YAML formatting."

requirements-completed: [REQ-34-01, REQ-34-02, REQ-34-05, REQ-34-06, REQ-34-07]

duration: ~17min
completed: 2026-07-24
---

# Phase 34 Plan 01: Wave-0 Config-Shape Test Scaffolds Summary

**Four RED-by-design jest suites (tauriConf, cargoFeatures, releaseWorkflow, buildSidecarSea) gate every downstream Phase 34 config change against drift, especially the fork-pointed updater feed never regressing to Heroic.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-07-24T02:06:58Z (approx, per STATE.md session start)
- **Completed:** 2026-07-24T02:14:30Z
- **Tasks:** 2
- **Files modified:** 4 test files + 1 deferred-items log

## Accomplishments
- `tauriConf.test.ts` asserts the target `src-tauri/tauri.conf.json` shape (`bundle.active`, `bundle.targets` incl. nsis/appimage/dmg, `bundle.externalBin`, `bundle.createUpdaterArtifacts`, `plugins.updater.pubkey`/`endpoints`) plus the T-34-01 mitigation: a hard negative assertion that the feed never contains `Heroic-Games-Launcher`.
- `cargoFeatures.test.ts` asserts `src-tauri/Cargo.toml`'s `keyring` dependency line carries `apple-native` + `windows-native` + `sync-secret-service` (Pitfall 5 cross-platform safeStorage) and that `tauri-plugin-updater`/`tauri-plugin-shell` are declared dependencies.
- `releaseWorkflow.test.ts` asserts the target `.github/workflows/release-tauri.yml` shape: `v*` tag + `workflow_dispatch` triggers, the 3-OS matrix, `tauri-apps/tauri-action`, the shared `install-deps` composite, `releaseDraft: true`/`prerelease: true` (D-09 human-gate regression guard), the Windows conditional-signing gate, and both per-OS `::warning::Signing skipped` steps (D-04).
- `buildSidecarSea.test.ts` asserts the target `meta/buildSidecarSea.ts` pure argv-builders: `.exe`-only-on-Windows naming, the exact `NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2` sentinel, the `NODE_SEA` macho-segment flag appearing only on darwin, and a dedicated `buildCodesignArgv` proving codesign steps exist only on darwin.
- All four suites verified RED for the correct reason (real assertion failures or expected missing-file/missing-module errors, never a silent pass or an unrelated collection error) — confirmed via `npx jest --testPathPattern`.

## Task Commits

1. **Task 1: tauriConf + cargoFeatures config-shape suites** - `3012e0b3` (test)
2. **Task 2: releaseWorkflow + buildSidecarSea suites** - `57c6c73f` (test)

**Plan metadata:** (pending — this commit)

## Files Created/Modified
- `src/backend/__tests__/tauriConf.test.ts` - target-shape assertions for `src-tauri/tauri.conf.json`'s bundle/updater config, incl. the never-Heroic negative
- `src/backend/__tests__/cargoFeatures.test.ts` - target-shape assertions for `src-tauri/Cargo.toml`'s keyring features + new plugin deps
- `src/backend/__tests__/releaseWorkflow.test.ts` - target-shape assertions for the not-yet-created `.github/workflows/release-tauri.yml`
- `meta/__tests__/buildSidecarSea.test.ts` - target-shape assertions for the not-yet-created `meta/buildSidecarSea.ts` argv-builders
- `.planning/phases/34-tauri-packaging-windows-and-linux-builds-signing-auto-update/deferred-items.md` - logs a pre-existing, out-of-scope jest crash found during verification (see Issues Encountered)

## Decisions Made
- Added `buildCodesignArgv` as a distinct exported function in the target `buildSidecarSea.ts` API surface (rather than folding codesign into `buildPostjectArgv`) so "codesign only on macOS" has a real positive test, matching the plan's acceptance criteria more precisely than the minimum literal text implied.
- Kept the D-04 clear-warning regex assertions loosely coupled (match anywhere later in the file via non-greedy `[\s\S]*?`) rather than requiring exact line adjacency, so 34-06's actual YAML formatting has room to differ without breaking this gate.

## Deviations from Plan

None — plan executed exactly as written. The `buildCodesignArgv` addition and the loose D-04 regex shape are within the plan's stated discretion ("These are RED now by design... asserts per-OS argv (codesign only on macOS...)"), not scope changes.

## Issues Encountered

Found (not fixed, out of scope): a pre-existing leaked-timer jest crash in `src/backend/storeManagers/steam/library.ts:1153` (`readAcfState`/`pollInstallOnce`) that terminates the full `pnpm test:ci` run with a non-zero exit after all suites have already reported PASS/FAIL. Confirmed unrelated to this plan — `library.ts` is not in this plan's `files_modified`, the crash reproduces identically whether or not the four new test files are present, and it matches a previously-documented project-memory item ("known separate library.ts leaked-timer jest exit-1", first noted 2026-07-19). Logged in `deferred-items.md`; not auto-fixed per the deviation-rules scope boundary. Verified in isolation that the `meta` jest project (`buildSidecarSea.test.ts`) and the `src/backend` jest project each run to completion with only the four expected new-suite failures when the crash-prone `library.ts` timer isn't allowed to leak past suite teardown in a truncated run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plans 34-02 (SEA sidecar build script + `tauri.conf.json`/`Cargo.toml` edits), 34-05 (updater plugin), and 34-06 (release workflow) each have a concrete, already-written regression gate to turn GREEN.
- The pre-existing `library.ts` leaked-timer jest crash remains open and unrelated to Phase 34 — flag for whichever future plan/debug session next touches that file's timer lifecycle.

---
*Phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update*
*Completed: 2026-07-24*

## Self-Check: PASSED

All 4 created test files verified present on disk. All 3 commit hashes (`3012e0b3`,
`57c6c73f`, `fbab645b`) verified present in `git log --oneline --all`.
