---
phase: 87-engine-wine-and-tools
plan: 64
subsystem: wine-tools
tags: [winetricks, crossover, bottle-prefix, failure-surfacing, regedit, svc-02, gap-closure, rust]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: "87-59 gate item 4 finding F3 (Winetricks acts on the wrong prefix and fails silently) and the owed 56a-1 check"
provides:
  - "wine_cmd::prefix::tool_prefix: the one prefix rule for a CrossOver target that names a bottle (the bottle's directory from gamelib-engine's direct_child_dir, never the stored winePrefix; an unsafe name has no prefix)"
  - "Winetricks run and installed-list take their prefix from it; a bottle name that is not one safe segment runs nothing and creates nothing"
  - "classify.rs is_missing_regedit_file: the closed `regedit: The file '<path>' was not found` rule, an error line that ends the verb failed even on exit 0"
  - "tests/tool_bottle_target.rs: 13 cases over the 87-59 game shape, driven through engine_resolve_tool_settings then the wine ops on a scripted spawn runner"
affects: [87-69 re-run item 4]

actuals:
  tokens: 9800
  tasks: 3
  commits: 5

plan_head_before: 0a39d46bdbe6404c66ad45df10c8b25976996936
plan_head_after: 6f92bfc1f6437d8aba528a158ea3acf42b52dba6
commits: 5

tech-stack:
  added: []
  patterns:
    - "A tool's prefix for a CrossOver bottle is derived from the bottle name through the engine's single safe-segment helper, not read from settings"
    - "A closed single-form output rule, not a class: one fixed sentence, a quoted non-empty path between two fixed halves"

key-files:
  created:
    - src-tauri/crates/gamelib-wine/tests/tool_bottle_target.rs
  modified:
    - src-tauri/crates/gamelib-engine/src/bottles/lifecycle.rs
    - src-tauri/crates/gamelib-wine/src/wine_cmd/prefix.rs
    - src-tauri/crates/gamelib-wine/src/winetricks/install.rs
    - src-tauri/crates/gamelib-wine/src/winetricks/classify.rs

key-decisions:
  - "The prefix rule lives in the wine crate (wine_cmd::prefix::tool_prefix), not in the resolver: the resolver was right, so build_crossover_game_settings keeps its output keys (the launch overlay golden pins them)."
  - "A CrossOver wine whose settings name no bottle (empty wineCrossoverBottle) keeps its stored prefix: the golden_winetricks GameLibBottle case pins that shape and no name is turned into a path there."
  - "Failure surfacing is a closed rule on the one regedit form of 87-59; exit-1 already reached the tab, so no banner or component was added (D-10)."

requirements-completed: [SVC-02]

duration: about 1 h 15 min of executor wall clock (start time not recorded; estimated from the commit times)
completed: 2026-11-24
---

# Phase 87 Plan 64: Wine tools target the game's CrossOver bottle, and a Winetricks failure is shown Summary

**Winetricks for a non-Steam game on its own CrossOver bottle now runs with `WINEPREFIX` set to that bottle's directory (and `CX_BOTTLE` its name), never the stored shared prefix; a verb whose regedit import found no file ends `failed` instead of silently `installed`.**

## Accomplishments

- **F3 reproduced (Task 1, tracer).** The fixture is 87-59's Trash Goblin, rebuilt from the real `GamesConfig/<app>.json` shape (`engineOverride` `automatic`, `wineCrossoverBottle` the per-game bottle, `winePrefix` `<home>/Games/GameLib/Prefixes/shared`, `wineVersion` `{type: wine, name: "Default Wine - Not Found", bin: ""}`, document `version` `v2`, `explicit` `true`), over a FakeHome with a scripted CrossOver bin directory (`wine`, `wineserver`, `cxbottle`) and a provisioned per-game bottle with a crossover marker. It is driven through the real chain: `engine_resolve_tool_settings` with `ensureBottle` true, then `wine_winetricks_install` on a `ScriptedSpecRunner` that records argv and env.
- **F3 fixed.** The winetricks run takes its prefix from `tool_prefix`: for a CrossOver target that names a bottle, the bottle's directory (`direct_child_dir`), both when nothing runs and during a live CrossOver launch (a registered selection plus overlay). A plain-prefix game keeps its stored `winePrefix` and no `CX_BOTTLE`. The FakeHome tree after the run has no `Games/GameLib/Prefixes/shared` and nothing created outside the bottle (a before and after path-set difference).
- **Failure surfacing (Task 2).** A verb whose winetricks run prints `regedit: The file '...' was not found` and exits 0 now ends `failed` in the queue state with an error line in the run's log, and `wine_winetricks_install` answers `failed`. Exit 1 and a clean exit were already right and are pinned.
- **Task 3.** winecfg, Run EXE and a game wine command (`wine_run_command_for_game`) for the same game spawn CrossOver's wine with `CX_BOTTLE` = the game's bottle and no other prefix; the exe stays one argv entry.

## Root cause of the wrong prefix (the plan's required statement)

**Layer: the winetricks environment taking the prefix from `winePrefix` for a CrossOver target. The resolver was right.**

Checked in the plan's order, each with its test:

- The resolver answers `engine`, not `stored`. `the_resolver_answers_the_games_crossover_bottle` is green at HEAD: `kind: engine`, `wineCrossoverBottle` the per-game bottle, `wineVersion.type` `crossover` with `bin` the CrossOver `wine`. So neither `read_engine_for_game` / `read_stored_game_config` (the versioned document with `explicit` and `version` is read fine) nor the resolver's branch order is the cause, and `tool_settings.rs` and `config.rs` are unedited.
- `build_crossover_game_settings` keeps the stored `winePrefix` (the shared default) by design: it adds `wineCrossoverBottle` and a crossover `wineVersion` and leaves every other key. `winetricks::install::build_env` then does `env.insert("WINEPREFIX", prefix)` after the two env builders, with `prefix` = `settings.wine_prefix` from `wine_from_proton`. For a CrossOver kind the env builder sets only `CX_BOTTLE`, so the insert is the only `WINEPREFIX`, and it named the stored shared prefix.

**Red at HEAD, green after the fix** (RED `852768f8e`, GREEN `36add53bf`): `winetricks_for_a_bottle_backed_game_runs_in_its_bottle_when_it_is_not_running` and `..._during_a_live_crossover_launch` failed on `WINEPREFIX is the bottle's directory, not the stored winePrefix` with `WINEPREFIX` = `<home>/Games/GameLib/Prefixes/shared` and `CX_BOTTLE` correct; `a_bottle_name_that_is_not_one_safe_segment_runs_nothing` failed with `installed` for `../escape`. The two cases that must not move (`the_resolver_answers_...`, `winetricks_for_a_plain_prefix_game_keeps_its_stored_prefix`) were green at both states.

**What this does not reproduce.** 87-59 also recorded "CrossOver wine without `CX_BOTTLE`". At HEAD `CX_BOTTLE` is in the spawn env of both winetricks cases (the env builder always sets it for a CrossOver target), so that part of the observation is not explained by this code path; it may have been read off a winetricks banner or a process listing rather than the spawn env. `WINEARCH=win32` is assumed to be winetricks' own reaction to the fresh, empty shared directory (the plan's flagged assumption); with the bottle as the prefix it should not appear. Re-run item 4 observes both.

## The prefix rule

`wine_cmd::prefix::tool_prefix(ctx, settings) -> ToolPrefix`: `Stored` unless the wine kind is CrossOver and `wineCrossoverBottle` is non-empty; then `Bottle(dir)` where `dir` comes only from `gamelib_engine::bottles::lifecycle::direct_child_dir` (a name `sanitizeBottleName` leaves unchanged and that sits directly under the Bottles root), else `UnsafeBottle`. `wine_from_proton` returns `None` for `UnsafeBottle`; `run_with_args` logs `Winetricks not run for <app>: no usable Wine environment (invalid-bottle)`, ends failed, spawns nothing and creates nothing (T-87-112); `list_installed` answers the empty list. `list_installed` also reads the bottle's own `winetricks.log` now (it used to read the shared prefix's).

## Failure surfacing

- **Exit code (parity, D-16).** The rule "the exit code itself, not the text, decides" was copied from the TS and is unchanged; a non-zero exit ends the verb `failed` with an error line (`winetricks exited with code N`). It already reached the tab: the existing jest tests `groups.test.tsx` (E6-error, D-18 remount) and `rowStates.test.tsx` (errored) feed a `failed` outcome and assert the row renders as failed, so no `failedRun.test.tsx` was created and no component was added (D-10). The WinetricksSettings jest directory passes (15 suites, 252 tests).
- **The regedit rule (a gate fix, D-06).** The 87-59 silence was the exit-0 class: winetricks' `w_try` does not abort on a regedit import that found no file. `is_missing_regedit_file` matches that one form only (`regedit: The file '<non-empty path>' was not found`, after trimming), classifies it as an `error` line, and `RunState` ends the run failed on exit 0 with the line `winetricks reported a registry import that found no file`. Vectors in `classify.rs` pin the neighbours that must not match (an empty path, `was found`, `Unable to open the file`, a prefix or suffix on the line, wine `err:` noise). The `winetricks_pure` vectors and every `golden_winetricks` case are unchanged.

## Task Commits

1. **Task 1 (tracer): the bottle as the Winetricks prefix** - RED `852768f8e` (test), GREEN `36add53bf` (fix)
2. **Task 2 (TDD): a failed regedit import ends the verb failed** - RED `8220ded74` (test), GREEN `03028db23` (fix)
3. **Task 3: winecfg, Run EXE and a game command target the bottle** - `6f92bfc1f` (test; green at HEAD, no source edit)

`commits: 5` is the measured `git rev-list --count 0a39d46bd..HEAD`; all five are this plan's.

## Tracer gate

Task 1 is `type="tracer"`. Auto mode is not active (`workflow.auto_advance` false); `human_verify_mode` is the default `end-of-phase` and the task's `<verify>` is automated only, so the verify was re-run end to end before Task 2: `tool_bottle_target`, `golden_winetricks` (8), `winetricks_pure` (27), `run_for_game_guard` (25), `gamelib-engine tool_settings::` (3), `golden_launch` (8), clippy on both crates with `-D warnings`, and `cargo fmt --check` all passed. Tracer verified end to end, expanded.

## TDD Gate Compliance

Task 2 carries `tdd="true"` in a `type: execute` plan. Sequence: `test(87-64)` RED `8220ded74`, then `fix(87-64)` GREEN `03028db23`, no REFACTOR. The RED run failed on assertions, not on compile errors or zero tests: `a_regedit_import_that_found_no_file_ends_the_verb_failed_even_on_exit_zero` (`left: "installed"`, right `"failed"`, the run's log showing the regedit line as `info`) and `..._is_a_failed_install_on_the_single_verb_op_too` (`installed` vs `failed`); the exit-1 and clean-exit cases were green in the same run, which is what narrowed the class to exit 0. Task 1's RED `852768f8e`: 3 failed on assertions. Task 3: the three plan cases (and a live-launch winecfg case) were green at HEAD with no source edit, as the plan allows; they are committed as `test(87-64)` only. `gsd_run check tdd-red-evidence` has no adapter for `cargo test` text; the assessment is by hand from the real output.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `direct_child_dir` was private**
- **Found during:** Task 1
- **Issue:** the plan names `bottle_dir` / `direct_child_dir` as the one safe way to name a bottle's directory, but `direct_child_dir` was a private function of `bottles/lifecycle.rs`, unreachable from gamelib-wine, and `bottle_dir` alone does not refuse an unsafe name.
- **Fix:** made it `pub` with its doc comment saying why. No behaviour change.
- **Files modified:** `src-tauri/crates/gamelib-engine/src/bottles/lifecycle.rs` (not in the plan's `files_modified`)
- **Commit:** `36add53bf`

**2. [Plan wording] An empty bottle name keeps the stored prefix**
- **Found during:** Task 1 (the first GREEN run failed `golden_winetricks` `install-missing-dependency-mac-wiki`)
- **Issue:** that golden has a CrossOver wine with an empty `wineCrossoverBottle` and a `winePrefix` that is already the bottle's directory. Treating an empty name as unsafe refused it. The plan says existing goldens stay unchanged.
- **Fix:** an empty name is `Stored` (no name is turned into a path, so there is nothing to refuse); only a non-empty name that is not one safe segment is `UnsafeBottle`. The unsafe-name test lists `../escape`, `a/b`, `.`, `..` and a padded name. No golden expectation changed.
- **Commit:** `36add53bf`

**3. [Plan wording] Task 2's `failedRun.test.tsx` and `winetricks/queue.rs` were not needed**
- The plan said to add `failedRun.test.tsx` only if no existing test feeds a failed outcome; `groups.test.tsx` and `rowStates.test.tsx` do, so none was added. `queue.rs` already maps a run's failed result to `VerbOutcome::Failed`, so only `install.rs` and `classify.rs` changed. `lib.rs`, `mod.rs`, `env.rs` and `call_tool.rs` were not edited either (Task 3 was green at HEAD).

**Parity note (D-16, D-06).** The exit-code rule is the TS's, kept. The regedit rule is new behaviour (a gate fix), not a TS copy.

**Total deviations:** 1 auto-fixed (blocking), 2 plan-wording departures. **Impact:** none on scope beyond one visibility change outside `files_modified`.

## Threat Flags

None. T-87-112 (prefix from a stored bottle name) is mitigated and tested; T-87-113 by the exit code plus the closed rule; T-87-114 by the argv test.

## Issues Encountered

- The first RED commit's test file had a clippy `cloned_ref_to_slice_refs` finding in a later-added helper; fixed before the Task 2 GREEN commit, the final tree is clean.
- Wine commands (winecfg, Run EXE, a game command) for a CrossOver target set only `CX_BOTTLE`, no `WINEPREFIX`: the TS-identical environment, accepted by the plan's "either way" and asserted as "absent or the bottle's directory, never the shared prefix". Whether CrossOver's `wine` honours a `WINEPREFIX` was not tested live.
- Live proof is owed to 87-69 re-run item 4 (Trash Goblin `fontsmooth=bgr`: the bottle's `user.reg` FontSmoothing keys change, or a failure is shown).

## Known Stubs

None.

## Self-Check: PASSED

- `src-tauri/crates/gamelib-wine/tests/tool_bottle_target.rs` exists (13 tests pass); `src-tauri/crates/gamelib-wine/src/wine_cmd/prefix.rs` has `tool_prefix`.
- Commits `852768f8e`, `36add53bf`, `8220ded74`, `03028db23`, `6f92bfc1f` are ancestors of HEAD.
- Plan verification re-run at the end: `tool_bottle_target` 13, `golden_winetricks` 8, `winetricks_pure` 27, `golden_wine_core` 18, `run_for_game_guard` 25, `gamelib-wine` and `gamelib-engine` suites all green; clippy `-D warnings` and `cargo fmt --check` clean on both crates; the WinetricksSettings jest directory 252 passed.
