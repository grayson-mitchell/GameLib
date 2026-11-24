---
phase: 88-launch-pipeline
plan: 06
subsystem: known-fix-goldens
tags: [knownfix, golden, oracle, registry, overlay, archive, spawn-class, incident-census, svc-03]

requires:
  - phase: 88-launch-pipeline
    plan: 03
    provides: the gamelib-knownfix crate, whose tests/fixtures root (prettier-ignored) holds the goldens, and the shared overlay catalogue JSON
  - phase: 88-launch-pipeline
    plan: 04
    provides: launchOracle (withPinnedBaseEnv, injectPlatform, withInjected, attachSpawnClass and loadClasses, tsTestTitles and assertCasesCoverTitles)
  - phase: 88-launch-pipeline
    plan: 05
    provides: the case-builder pattern (cases.json written from a TS builder), the exported seedProfile and the layer-file helper `fix`
provides:
  - src/backend/__tests__/oracle/knownFixRegistry.oracle.test.ts and knownFixRegistry.cases.ts (the registry oracle and its case builder)
  - src/backend/__tests__/oracle/knownFixOverlay.oracle.test.ts and knownFixOverlay.cases.ts (the overlay archive, install and env oracle and its case builders)
  - src/backend/__tests__/oracle/oracleCommon.ts (log spies, a fake-clock driver and the realpath normaliser the two oracles share)
  - gamelib-knownfix/tests/fixtures/golden/classes.json (knownfix.registry.reg_add is a helper)
  - gamelib-knownfix/tests/fixtures/golden/registry (57 cases), overlay_archive (25) and overlay_install (41), each with cases.json, deltas.json, MANIFEST.json and expected/<case>/
  - writeOrCompareGolden takes extra named files (calls.json) beside its five fixed ones
affects: [88-09, 88-10, 88.1]

actuals:
  tokens: 34200
  tasks: 3
  commits: 3
commits: 3
plan_head_before: c4888f5c5411d8a9e3969b5630d9b5d72ad5c4f1
plan_head_after: 1c01abc9579bbb664a1de6be41fd36d0e512fd24

tech-stack:
  added: []
  patterns:
    - "a launcher-path case drives the real createCommandRunner over the spawn tracer with an EMPTY base env, so a recorded spawn's env is the whole environment the child was given, and attachSpawnClass joins the call site's class from classes.json"
    - "a timeout is recorded with jest fake timers that leave nextTick, setImmediate and microtasks real; the case advances the clock only when the scripted run says it is parked, so no timer belonging to a run that is about to succeed fires early"
    - "archive inputs for the strict reader are written by the oracle's own ustar encoder and gzipped with level 0 (stored blocks, xfl and OS bytes pinned), so the committed cases.json does not move with Node's zlib"

key-files:
  created:
    - src/backend/__tests__/oracle/knownFixRegistry.oracle.test.ts
    - src/backend/__tests__/oracle/knownFixRegistry.cases.ts
    - src/backend/__tests__/oracle/knownFixOverlay.oracle.test.ts
    - src/backend/__tests__/oracle/knownFixOverlay.cases.ts
    - src/backend/__tests__/oracle/oracleCommon.ts
    - src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/classes.json
    - src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/registry
    - src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/overlay_archive
    - src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/overlay_install
    - .planning/todos/pending/2026-11-25-overlay-archive-reader-accepts-an-entry-smaller-than-its-pin.md
    - .planning/todos/pending/2026-11-25-overlay-install-hostile-archive-test-fails-on-the-magic-not-the-dotdot-name.md
  modified:
    - src/backend/testUtils/engineWineOracle/harness.ts

key-decisions:
  - "calls.json is a fixed extra file of the registry slice: writeOrCompareGolden gained an optional `extra` map (file name to value) that adds files only when named, so Phase 87's slices keep the same file set. calls.json lists, in call order, what the run seam received (command parts, wait, protonVerb, skipPrefixCheckIKnowWhatImDoing, whether onSpawn was passed), each child kill, and the options the command runner gave the process runner"
  - "A registry case is a list of steps over one fake HOME (validate, dllCompile, profileFixes, commandParts, regIsSet, prefixDir, timeout, apply, profileApply), with each it.each title one case and one step per row; the scripted run seam takes one outcome per call (code, undefined, reject, never) and `never` makes the case advance a fake clock past 15 000 ms"
  - "The three bridge-shaped cases call applyRegistryFixes with a seam that hands a recording runWineCommand the options the Steam bridge passes (wait false, protonVerb run, skipPrefixCheckIKnowWhatImDoing true, the bottle dir as prefix), so 88-09's bridge op has vectors without importing the bridge"
  - "buildOverlayTarGz bytes are recorded with the sha256, size and base64 the plan asks for, and ALSO with the size and sha256 of the gunzipped tar, which does not depend on the zlib build; deltas.json says the replay compares the tar byte for byte and the compressed bytes only when the Rust deflate matches"
  - "Install cases pin a fixture overlay (test-overlay-1) from buildOverlayTarGz(payload) and script every fetch; the warning that carries two archive lengths is recorded as `archive size <A> does not match the pinned <A+1>` and the fetch's maxBytes as a delta from the pinned archive length, so no golden holds a compressed length"
  - "The hostile-archive install test is recorded as the TS builds it (its header has no ustar magic, so the reader refuses it for the magic and never reaches ../x) and a second case with a well-formed ../x header is added, so the zip-slip path check is itself pinned at install level (T-88-12)"
  - "verifyInstalledOverlay's reason for an unreadable path is recorded without the `Error: ` prefix: an fs error comes from outside the jest realm, so `instanceof Error` is false there and the module prints a prefix the app never does"

patterns-established:
  - "A launcher-path golden is the tier-2 file on disk, the run seam's arguments, the command runner's options and the wine spawn, in one case"
  - "A named case per test title, ids `<file-stem>--<slug(title)>`, with the census failing both an uncovered title and a case id no title owns"

requirements-completed: [SVC-03]

coverage:
  - id: D1
    description: "The registry slice holds 57 cases: a named case for each of the 46 titles of knownFixesRegistry.test.ts, the launcher-path tracer, three bridge-shaped cases, four more launcher-path cases (crossover skip, wine prefix, proton verb, non-zero exit) and three shapes the TS tests leave out (every reject reason, command parts, unusual wine types)"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/__tests__/oracle/knownFixRegistry.oracle.test.ts#every title of knownFixesRegistry.test.ts is a named case, one for one"
        status: pass
    human_judgment: false
  - id: D2
    description: "A registry fix applied on the launch path is pinned from the tier-2 file to the wine spawn: the tracer case records 3 spawns (two views of a registry entry and a dllOverrides entry) with program, argv, full env and cwd, each with class helper from classes.json"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "knownFixRegistry.oracle.test.ts#launcher-path-crossover-registry-and-dll-override; classes.json holds exactly one key"
        status: pass
    human_judgment: false
  - id: D3
    description: "Timeouts are goldens: a never-settling reg add is killed after 15 000 ms with SIGKILL on the captured child (and not killed when the child already exited, there is no child, or the run succeeded), recorded in calls.json and the warning lines"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "knownFixRegistry.oracle.test.ts#knownFixesRegistry--applyregistryfixes-skip-and-kill-sigkills-the-captured-child-on-timeout-and-warns-killed and bridge-timeout-kills-the-reg-add"
        status: pass
    human_judgment: false
  - id: D4
    description: "The overlay_archive slice holds 25 cases: all 13 titles of knownFixOverlayArchive.test.ts plus byte vectors for the writer (sorting, block sizes, path limits) and the strict reader's verdict for traversal names, non-regular entries, unexpected and missing paths, size and cap boundaries, a bad size field, name-field shapes and non-gzip input"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/__tests__/oracle/knownFixOverlay.oracle.test.ts#every title of knownFixOverlayArchive.test.ts is a named case, one for one"
        status: pass
    human_judgment: false
  - id: D5
    description: "The overlay_install slice holds 41 cases: the 10 titles of knownFixOverlayInstall.test.ts, the 22 of knownFixOverlays.test.ts, install outcomes (success, sha mismatch, download failure, timeout, abort through the registry, a real ../x entry, invalid ids), verifyInstalledOverlay reasons and an env case; every fetch is scripted and the overlays tree is pinned"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "knownFixOverlay.oracle.test.ts#every title of %s is a named case, one for one (2 tests) and no case reaches the real catalogue archive"
        status: pass
    human_judgment: false
  - id: D6
    description: "MANIFEST floors equal the recorded counts (57, 25, 41), an empty case list fails, nothing reads the real profile (every case runs on a fresh fake HOME under withPinnedBaseEnv with an injected platform), and the three recordings are stable across repeated compare runs"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "both oracle tests in compare mode with GAMELIB_WRITE_ENGINE_GOLDEN and GAMELIB_EW_ORACLE unset (138 tests, three consecutive runs)"
        status: pass
    human_judgment: false
  - id: D7
    description: "The goldens are discriminating: with the overlay entry cap changed from 8 to 7, the tar mode field changed, the reg add timeout kill changed to SIGTERM and the download deadline changed to 100 000 ms, 11 of the 138 oracle tests failed (all four mutations reverted)"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "mutation run of the two oracle tests, 11 failed, reverted"
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-11-25
status: complete
---

# Phase 88 Plan 06: Registry-fix and overlay goldens Summary

**The tier-2 registry fixes and the verified overlay installer are pinned by committed TS goldens before any Rust for them exists: 57 registry cases through to the wine spawn with its spawn class, 25 archive cases with the exact bytes and the strict reader's verdicts, and 41 install and env cases with the overlays tree, every incident test a named case.**

## Performance

- **Duration:** about 18 min (start time was not recorded at launch; taken from the previous plan's final commit)
- **Completed:** 2026-11-25
- **Tasks:** 3 (one tracer, two auto)
- **Files:** 5 test-side files and 2 todos created, 1 shared harness edited; 3 golden slices (57, 25 and 41 cases) and `classes.json`

## Accomplishments

- **Tracer (Task 1):** `applyKnownFixProfileRegistry` through the real `createCommandRunner` over the spawn tracer: a bundled tier-2 profile with one `registry` entry and one `dllOverrides` entry, a CrossOver bottle, a seeded `system.reg` and `user.reg` lacking the values. The case records three `reg add` spawns (the registry value in `/reg:32` and `/reg:64`, then the `AppDefaults\Game.exe\DllOverrides` value) with program, argv, the whole environment and cwd, each carrying `"class": "helper"` from `classes.json`, plus `calls.json` (what the run seam received and what the command runner gave the process runner) and the tree. Verified in compare mode before Task 2 started.
- **Registry incidents (Task 2):** 46 named cases, id `knownFixesRegistry--<slug(title)>`, one for every `it` / `test` title (each `it.each` is one case with a step per row). Application cases script the run seam: code 0, non-zero, `undefined`, a rejection, and a run that never settles, for which a fake clock passes the 15 000 ms deadline and `calls.json` holds the `SIGKILL` of the captured child. Skip decisions are recorded against seeded `system.reg` content. Three bridge-shaped cases hand the seam the options the Steam bridge passes (wait false, `protonVerb: run`, the prefix check skipped, the bottle as prefix). Four more launcher-path cases drive the real runner: a CrossOver bottle with values already set, a plain wine prefix, a proton prefix (the `runinprefix` verb is put in front of `reg`), and a `reg add` that exits non-zero.
- **Overlay archive (Task 3):** all 13 titles plus writer vectors (byte-order sorting, empty, block-sized and multi-block files, path limits, the pinned gzip mtime and OS byte, the tar header fields) and the reader's verdict for each hostile shape the plan names. Read inputs are stored-gzip archives built by the oracle's own ustar encoder, so `cases.json` does not move with Node's zlib.
- **Overlay install and env (Task 3):** the 10 install and 22 overlay titles, install outcomes (success, sha mismatch with the right length, download failure, the 120 000 ms deadline and a custom one, abort through the abort registry, a real `../x` entry, invalid ids), `verifyInstalledOverlay` reasons, and the env resolution with a scripted installer (the base values the callback was asked for are recorded as a map). `<APPFOLDER>/overlays` is pinned as a tree after every case, and the fixture overlay is `test-overlay-1`, pinned from an archive built in the test, so the real gst-libav archive is never fetched.
- **Manifests:** `registry` 57, `overlay_archive` 25, `overlay_install` 41, each floor equal to its count; each oracle test carries its own floor constant and an empty-list failure test. Each slice has a `deltas.json`.

## Task Commits

1. **Task 1: Tracer, a profile registry fix recorded from the tier-2 file to the wine spawn with its spawn class** - `2c89fe3d2` (test)
2. **Task 2: Every registry incident as a named case, with timeouts, skips and the bridge-shaped run seam** - `c01aba6be` (test)
3. **Task 3: Overlay archive, install and env goldens** - `1c01abc95` (test)

**Plan metadata:** the docs commits that carry this SUMMARY, STATE.md and ROADMAP.md.

## Decisions Made

See `key-decisions` above.

## Quirks recorded, not fixed (D-20)

- **`readOverlayTarGz` accepts an entry smaller than its pinned size** (an empty entry too): it rejects only a larger one. The installer's `verifyInstalledOverlay` catches it before the rename, so nothing reaches the overlays folder. Recorded as `entry-smaller-than-the-pinned-size-is-accepted`; filed as `.planning/todos/pending/2026-11-25-overlay-archive-reader-accepts-an-entry-smaller-than-its-pin.md` (minor, any, code).
- **The TS hostile-archive install test never reaches the `../x` check it names.** Its header writes the typeflag, magic and version contiguously from offset 156, so the magic field at 257 is zero and the archive is refused as `not a POSIX ustar entry`. Recorded as found (`knownFixOverlayInstall--...refuses-a-hostile-archive-whose-sha-matches-the-pin`), with `outcome-hostile-archive-with-a-real-dotdot-entry` added to pin the path check; filed as `.planning/todos/pending/2026-11-25-overlay-install-hostile-archive-test-fails-on-the-magic-not-the-dotdot-name.md` (minor, any, code).
- **An fs error in `verifyInstalledOverlay` and a gunzip error in `readOverlayTarGz` print differently under jest than in the app** (`instanceof Error` is false for an error from outside the test realm). Not a defect; the goldens hold the app's text and the two `deltas.json` files say so.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `writeOrCompareGolden` could not record `calls.json`**
- **Found during:** Task 1
- **Issue:** the plan names `calls.json` as a recorded file, but the shared harness writes a fixed set of five files and, in compare mode, asserts that exact file set, so a sixth file would fail every slice.
- **Fix:** an optional `extra` map on `GoldenCapture`; a file is written only when named, so Phase 87's slices keep their file set.
- **Files modified:** src/backend/testUtils/engineWineOracle/harness.ts
- **Verification:** both new oracles run in write and compare mode; the Phase 87 wine oracle's file set is unchanged (nothing names `extra`).
- **Committed in:** 2c89fe3d2

### Scope additions (inside the plan's intent)

- `knownFixRegistry.cases.ts`, `knownFixOverlay.cases.ts` and `oracleCommon.ts` are files the plan does not list: the case builders follow 88-05's pattern (cases.json written from a builder so the list and the recording cannot drift) and the helpers are shared by both oracles.
- The overlay install slice also covers the env resolution and the pure helpers (the plan counts 22 overlay titles in it) and the registry slice holds four launcher-path cases beyond the tracer, so the Rust launch-path ops have vectors for the wine, proton and CrossOver prefix shapes.

---

**Total deviations:** 1 auto-fixed (1 blocking), scope additions as listed
**Impact on plan:** none on scope or on the files the plan lists; every artifact the plan names exists with the planned meaning.

## Issues Encountered

- **The compressed bytes of `buildOverlayTarGz` depend on the zlib build.** The plan asks for their sha256 and size, which are recorded (`overlay_archive` `build` steps), and for the tar the plan did not name: `tarSize` and `tarSha256` are recorded beside them. If a Node upgrade changes the deflate output, the compare run will fail on exactly those lines and the slice has to be re-recorded; the Rust side cannot be expected to match level 9 deflate byte for byte, which `overlay_archive/deltas.json` records. Everything else in the three slices was designed not to depend on it (stored-gzip inputs, lengths replaced by tokens, `maxBytes` as a delta).
- The `husky` post-checkout hook runs `pnpm i` and `pnpm download-helper-binaries` on a `git checkout -- <file>`; a first mutation attempt triggered it, and the later mutation run restored the sources from copies instead.

## Known Stubs

None.

## Threat Flags

None. T-88-12 (zip-slip) is pinned by named traversal, non-regular, unexpected-path and over-cap cases at archive level and by a real `../x` entry at install level; T-88-13 by the reject case for every `validateRegistryFixes` reason and the argv-array command parts; T-88-14 by the 15 s and 120 s timeout cases with the recorded kill and null result. T-88-SC: no package was added.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 88-09 (registry and bridge ops) has `registry/` with the spawn class column, the bridge-shaped run options and the skip decisions; 88-10 (overlay archive, install and env) has `overlay_archive/` and `overlay_install/`. The two `deltas.json` files list the documented Rust-side differences (kill mechanism, zlib text and bytes, fs error text).
- The two todos above are `ready: code` and independent of the port.

## Self-Check: PASSED

All 14 created paths exist on disk (five test-side files, `classes.json`, the three MANIFESTs and `deltas.json` files, the two todos); commits `2c89fe3d2`, `c01aba6be` and `1c01abc95` are ancestors of HEAD; both oracle tests pass in compare mode (138 tests, three consecutive runs); `tsc --noEmit`, eslint over `src/backend/__tests__/oracle/`, `npx prettier --check` over the five test-side files and `pnpm planning-gates` (12 of 12) are clean; four planted mutations failed 11 tests and were reverted.

---
*Phase: 88-launch-pipeline*
*Completed: 2026-11-25*
