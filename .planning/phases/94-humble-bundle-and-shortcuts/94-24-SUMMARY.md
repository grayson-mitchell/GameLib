---
phase: 94-humble-bundle-and-shortcuts
plan: 24
subsystem: backend
tags: [shortcuts, deletion, delete-gate, d-15, d-23, sc4, wiki, dependencies, todos, icon-geometry]
status: complete

requires:
  - phase: 94-humble-bundle-and-shortcuts
    provides: 94-22 every shortcut caller reaches Rust through a scheduled resolver; 94-03 the schedule and the delete-gate shape; 94-05/94-07 the goldens the Rust crate replays; 94-20 the Rust wiki seam (WikiLookup) the crate calls in-process
provides:
  - describe('shortcutsPortComplete') running runSlice(SHORTCUTS) (added red in fdec3f76a, green in 92ab71110)
  - src/backend/shortcuts/ and src/backend/testUtils/shortcutsOracle/ deleted; meta/backendDiCeilings/shortcuts.json deleted
  - getWikiGameInfo, its infoShimSchedule row and the nonesteamgame WIKI_CALLERS entry deleted
  - a cut-down icon_geometry oracle kept as a scheduled survivor (src/backend/testUtils/shortcutsIconGeometry, deletedBy 99) so the four macOS goldens stay recordable
  - three quirk todos and the icon_geometry todo updated
affects: [94-30, 94-31]

requirements-completed: []

actuals:
  tokens: 70000
  tasks: 2
  commits: 3

plan_head_before: a7ea5449bf14893244923c82a7ca689192e42f8e
plan_head_after: 7546616151bf8d4fdb67e1aaa29f3857e4dab96c

tech-stack:
  added: []
  patterns:
    - "a delete gate is committed red, then the deleting commit turns it green; a `kept` list names what must outlive the deletion (goldens, the redaction scan, the one survivor)"
    - "when a deletion would strand an unrecorded golden family, keep only the minimum that records it, outside the deleted trees, with a schedule row and a deletedBy"

key-files:
  created:
    - src/backend/testUtils/shortcutsIconGeometry/iconGeometryGoldens.ts
    - src/backend/testUtils/shortcutsIconGeometry/__tests__/iconGeometry.oracle.test.ts
    - .planning/todos/pending/2026-11-24-mac-shortcut-icon-crop-centred-not-top-left.md
    - .planning/todos/pending/2026-11-24-mac-shortcut-add-writes-into-existing-same-named-app.md
    - .planning/todos/pending/2026-11-24-linux-desktop-shortcut-url-not-percent-encoded.md
  modified:
    - src/backend/__tests__/shortcutsPortComplete.test.ts
    - src/backend/__tests__/infoShimSchedule.test.ts
    - src/backend/__tests__/infoPortComplete.test.ts
    - src/backend/__tests__/humbleShortcutsShimSchedule.test.ts
    - src/backend/info/wiki.ts
    - src/backend/info/__tests__/wiki.test.ts
    - src/backend/sidecar/nativeImageShim.ts
    - src/backend/storeManagers/steam/localFiles/steamFilesTypes.ts
    - src/backend/storeManagers/steam/localFiles/__tests__/shortcutsFixtures.test.ts
    - meta/gameInfoNarrowingBaseline.json
    - package.json
    - pnpm-lock.yaml
    - .planning/todos/pending/2026-11-24-record-macos-icon-geometry-goldens-on-a-mac.md
  deleted:
    - src/backend/shortcuts (33 files: the service, nonesteamgame, utils, types, eight TS test suites, six oracle suites and helpers, the seven test_data vdfs)
    - src/backend/testUtils/shortcutsOracle (harness.ts and its self-test)
    - meta/backendDiCeilings/shortcuts.json
    - src/backend/storeManagers/steam/localFiles/__tests__/shortcutsReplay.test.ts

key-decisions:
  - "The TS shortcuts oracle was deleted as planned, but removeIcons.oracle.test.ts was the only thing that could record the four macOS icon_geometry goldens 94-07 owes (94-14's Rust replay is #[ignore]d on them). Instead of stopping at a checkpoint, option (a) was taken: the icon_geometry describe, its PNG codec, its four inputs and a cut-down golden writer/manifest guard were kept in src/backend/testUtils/shortcutsIconGeometry/ (outside both deleted trees), with a relocated row in humbleShortcutsShimSchedule.test.ts (writeOrCompareIconGeometryGolden, deletedBy 99, no non-test callers) and the todo updated. The goldens remain recordable on a Mac with the same env var; the survivor is deleted in the commit that records them."
  - "The delete gate's describe is named shortcutsPortComplete (the header's `<name>PortComplete` convention, runnable with -t), not the plan's bare `shortcuts`."
  - "meta/backendDiCeilings/shortcuts.json was deleted whole: all five jestMock entries named suites this plan deletes; no other shard named a path under the two trees."
  - "ShortcutsDeps and NonSteamGameDeps needed no move: 94-22 already left no importer outside the deleted tree, so managerDeps.ts, services/types.ts, storeManagers/index.ts, nile/games.ts and testServices.ts needed no edit."
  - "Dependencies dropped: @shockpkg/icon-encoder, sanitize-filename, and (not named by the plan) tmp and @types/tmp, whose only importer was the deleted nonesteamgame.test.ts. fastest-levenshtein stays."
  - "The orphaned `shortcuts/validity/unknown-type` override in gamelib-steamfiles/tests/fixtures/overrides/shortcuts.json is left: it was consumed only by the retired TS replay and is harmless; see Deferred Issues."

patterns-established:
  - "a survivor test-support module with no non-test importer is scheduled as a relocated row with callers: []"

requirements: [SVC-05]
duration: 95min
completed: 2026-11-24
---

# Phase 94 Plan 24: Shortcuts TypeScript deleted behind its gate Summary

**The non-Steam shortcuts TypeScript is gone: `shortcutsPortComplete` was committed red, then the 33-file service tree, its TS oracle and harness, the wiki resolver and four unused dependencies were deleted and it went green, with only the one cut-down macOS `icon_geometry` oracle kept (scheduled, deletedBy 99) so the Mac goldens 94-07 owes can still be recorded.**

## What was built

- **Task 1 (tracer).** `describe('shortcutsPortComplete')` over `SHORTCUTS: SliceSpec` (deleted: every file under `src/backend/shortcuts/` and `src/backend/testUtils/shortcutsOracle/`; kept: the `gamelib-shortcuts` golden fixtures, `shortcutsFixtureRedaction.test.ts` and the two icon geometry survivor files; forbidden identifiers `addNonSteamGame`, `generateMacOsApp`, `convertPngToICNS`, `writeWindowsShortcut`, `resolveWindowsShortcutIcon`, `shortcutFiles`, `ShortcutsDeps`; flag `GAMELIB_SHORTCUTS`) was committed red (41 failing) in `fdec3f76a`. `92ab71110` then deleted the trees and `meta/backendDiCeilings/shortcuts.json`, removed `getWikiGameInfo` from `info/wiki.ts` with its tests, its `infoShimSchedule` row and the `WIKI_CALLERS` entry (the Rust crate reaches the wiki lookup in-process), removed the two stale `meta/gameInfoNarrowingBaseline.json` entries, and turned the describe green.
- **The icon_geometry survivor.** See Deviations 1. `iconGeometryGoldens.ts` holds the golden writer/comparer, manifest guard, PNG codec and the four inputs; the oracle test runs the codec and golden-writer self-tests on every host and the `/usr/bin/sips` describe on darwin only. Its row in the Phase 94 schedule is `writeOrCompareIconGeometryGolden`, relocated, `callers: []`, `deletedBy: 99`.
- **Task 2.** `pnpm remove @shockpkg/icon-encoder sanitize-filename tmp @types/tmp` (lockfile 70 lines smaller, nothing added); three triaged todos (centred icon crop vs the intended top-left, add writing into an existing same-named `.app`, Linux `.desktop` URL not percent-encoded), each naming the Rust file carrying the quirk; the icon geometry todo rewritten to point at the surviving oracle.

## Evidence

- Jest, passing: `shortcutsPortComplete` (the describe plus `noRollbackFlag`), `infoShimSchedule`, `humbleShortcutsShimSchedule`, `infoPortComplete`, `humblePortComplete`, `shortcutsFixtureRedaction`, `humbleFixtureRedaction`, `engineWineFixtureRedaction`, `shortcutsResolvers`, `wiki`, the new `iconGeometry.oracle` (darwin describe skipped on this Windows host, by design), `shortcutsFixtures`, every remaining `*.oracle.test.ts` (the six Humble oracles pass; the wine core oracle is skipped on Windows), and the census suites `flowRegistrationCensus`, `ipcDomainCensus`, `rustInvokeSchemas`, `tauriShellSource`, `runnerSliceRegistration`, `invokeReturnValueSweep`, `diPhaseGates`, `testContainment`, `fakeHomeIsolation`, `electronReachLedger`. No count in any census moved: this plan registered and removed no channel.
- Gates: `pnpm codecheck` clean, `pnpm backend-di-ceilings` PASS, `pnpm check:ipc-contract` up to date, `pnpm find-deadcode` PASS (310 baselined, unchanged), `pnpm planning-gates` 12/12, `pnpm install --frozen-lockfile` clean, eslint clean on the touched TS, prettier clean over every TS/JSON file written (`.planning` and the lockfile are prettier-ignored). `cargo test -p gamelib-shortcuts` all green (93 lib, 35 golden_add, 13 icns with 1 ignored, and the rest). `cargo fmt` and `clippy` were not re-run: no Rust source changed (only a README under gamelib-steamfiles).
- Wider backend run (storeManagers, info, sidecar, `__tests__`, testUtils, host): 431 suites pass, 44 fail. The 44 are the Windows-host failures this repo already carries (path separators, `sips`/bottle/overlay suites, POSIX-only fixtures: e.g. `libraryReplay`, `library.installedMap`, `utils`, `protocol`, `cache`, `loggerPortComplete`, the `steam/bridge` and `bottle` suites); none names a deleted module, and no run printed a `Cannot find module` for one. They were not diffed against a pre-change baseline; CI is ubuntu.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The deletion would have made the macOS icon_geometry goldens unrecordable**
- **Found during:** pre-task read of 94-07/94-14 and `removeIcons.oracle.test.ts`
- **Issue:** the plan deletes the TS oracle and its harness, but the four `icon_geometry` goldens (94-07 task 3, PARTIAL) were never recorded on this Windows host and 94-14's Rust replay is `#[ignore]`d on them. The only recorder was `removeIcons.oracle.test.ts` plus `testUtils/shortcutsOracle/harness.ts`.
- **Fix:** kept the minimum in `src/backend/testUtils/shortcutsIconGeometry/` (outside both deleted trees), scheduled it (relocated row, deletedBy 99), added both files to the gate's `kept` list, and rewrote the todo `2026-11-24-record-macos-icon-geometry-goldens-on-a-mac` (new command, new file names, a step 6 that deletes the survivor with the recording commit). No checkpoint was needed.
- **Files modified:** the two new files, `shortcutsPortComplete.test.ts`, `humbleShortcutsShimSchedule.test.ts`, the todo.
- **Commit:** 92ab71110, 754661615

**2. [Rule 3 - Blocking] Two Steam-files tests depended on the deleted nonesteamgame module and its test_data**
- **Found during:** the importer grep before deleting
- **Issue:** `steam/localFiles/__tests__/shortcutsReplay.test.ts` imported `shortcutsValidityFromSummary` and `titleIndexFromSummary` from `nonesteamgame.ts` (a P75-E parity test of the TS validity policy over replayed Rust summaries), and `shortcutsFixtures.test.ts` compared the crate's `shortcuts/upstream/` copy against `nonesteamgame/__tests__/test_data`.
- **Fix:** deleted `shortcutsReplay.test.ts` (its subject is gone; the Rust crate carries the validity messages in `gamelib-shortcuts/src/steam/mod.rs` and the `add-invalid-*` goldens in `golden_steam.rs`, and `gamelib-steamfiles/tests/golden.rs` still replays the parse cases); replaced the verbatim-copy test with one asserting the crate's `upstream/` folder still holds its seven files (it is now the only copy; the steamfiles README says so).
- **Commit:** 92ab71110

**3. [Rule 3 - Blocking] Knip findings introduced by the deletion**
- **Issue:** `find-deadcode` flagged `tmp` and `@types/tmp` (last importer was the deleted `nonesteamgame.test.ts`) and three types in `steamFilesTypes.ts` (`ShortcutsReadResult`, `ShortcutsApplyResult`, `EntryField`) whose only importers were the deleted modules.
- **Fix:** removed the two dev dependencies with the other two (Task 2) and un-exported the three types (still used inside the file). Three exports in the new survivor module were un-exported for the same reason.
- **Commit:** 92ab71110, 754661615

**4. [Rule 1 - Bug] A string literal still named `convertPngToICNS`**
- **Found during:** the green run of the new gate (`nativeImageShim.ts` `SYNC_REASON`, a justification string naming the deleted function)
- **Fix:** reworded the string and the header comment to say the two call sites moved to Rust in Phase 94. The shim itself stays for Phase 98 (the host `imageTools` still wraps it).
- **Commit:** 92ab71110

**5. [Rule 1 - Bug] infoPortComplete still expected the wiki resolver's constant**
- **Issue:** `info/wiki.ts holds the shims and the resolver` expected `RUST_INFO_WIKI_GET`.
- **Fix:** the test now expects exactly the umu and wiki-cache constants, with a Phase 94 plan 24 comment. The constant, its zod schema and the Rust channel stay (Rust calls it in-process).
- **Commit:** 92ab71110

## Known Stubs

None. The icon_geometry describe is skipped off darwin by design (a real gate waiting on a Mac), not a stub.

## Deferred Issues

- `src-tauri/crates/gamelib-steamfiles/tests/fixtures/overrides/shortcuts.json` still holds the `shortcuts/validity/unknown-type` override, which only the retired TS replay read. Leaving it is harmless; removing it is a hand edit of a fixture, left to a future steamfiles pass.
- Rust doc comments in `gamelib-shortcuts` still cite the deleted TS paths as the provenance of each port (`backend/shortcuts/...`). They are history, not references.
- Not done, by design: the four macOS `icon_geometry` goldens (94-07 and 94-14 stay partial; todo updated); no Mac live gate.

## Threat Flags

None. Removals only; no new endpoint, auth path or file access.

## Self-Check: PASSED

- FOUND: src/backend/testUtils/shortcutsIconGeometry/iconGeometryGoldens.ts
- FOUND: src/backend/testUtils/shortcutsIconGeometry/__tests__/iconGeometry.oracle.test.ts
- FOUND: the three new todos under .planning/todos/pending/
- MISSING (as intended): src/backend/shortcuts, src/backend/testUtils/shortcutsOracle, meta/backendDiCeilings/shortcuts.json, getWikiGameInfo in info/wiki.ts
- FOUND commits: fdec3f76a (red gate), 92ab71110 (deletion), 754661615 (dependencies and todos)
