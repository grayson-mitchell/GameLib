---
phase: 87-engine-wine-and-tools
plan: 66
subsystem: engine-bottles
tags: [bottles, removal, crossover, gamelib-safety, svc-02, gap-closure, rust, f5]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: "87-59 gate finding F5 (a non-Steam game's own per-game bottle cannot be removed) and 87-64's pub bottles::lifecycle::direct_child_dir"
provides:
  - "op engine_bottle_remove_per_game (OPS and route, strict request): removes a non-Steam game's own per-game bottle, decided in Rust from {runner, appName, stored, knownInstalls, selfKey, protectedRoots}; answers {outcome: removed | not-bottle-backed | refused | failed, reason?, otherKey?}"
  - "bottles::remove_per_game: remove_per_game_bottle, RemovePerGameRequest, RemovePerGameOutcome (to_value), CXBOTTLE_DELETE_CAP"
  - "tests/bottle_removal.rs: 26 dispatch-level cases, each comparing a sibling tree hash (path, kind, mode, sha256, link target) before and after"
affects: [87-70 shell arm, channel, TS shim and uninstaller route, 87-67 dialog control, 87-69 re-run item 7]

actuals:
  tokens: 10600
  tasks: 2
  commits: 3

plan_head_before: 0b0dcee155ff75317de0c630430a980ed94b058c
plan_head_after: 58225932c44d0889b3257d7318b610ac740c896e
commits: 3

tech-stack:
  added: []
  patterns:
    - "A destructive op takes the identity and the stored facts, never the path or the bottle name; the target is computed and must equal the stored value"
    - "Guard check before any spawn, then stop, then the engine's own delete, then the guarded remove_tree for what is left; a link is only unlinked and spawns nothing"

key-files:
  created:
    - src-tauri/crates/gamelib-engine/src/bottles/remove_per_game.rs
    - src-tauri/crates/gamelib-engine/tests/bottle_removal.rs
  modified:
    - src-tauri/crates/gamelib-engine/src/bottles/mod.rs
    - src-tauri/crates/gamelib-engine/src/lib.rs

key-decisions:
  - "Target rule: per_game_bottle_name(runner, appName), and only when stored wineCrossoverBottle equals it exactly; the shared GameLib bottle, another game's bottle, no stored bottle, a Steam title, an unknown runner and a non-macOS host all answer not-bottle-backed and delete nothing"
  - "stored is the game's settings object (a JSON map); only wineCrossoverBottle is read, so the caller can pass its stored settings whole"
  - "A link at the bottle's place spawns nothing (no wineserver stop, no cxbottle): both would follow it into the referent, which is what the sibling-link test proves"
  - "Which wineserver to stop: a CrossOver marker uses the resolved CrossOver bin dir's wineserver with CX_ROOT (none when CrossOver is absent); a pinned marker only its summary-bounded pin wineserver; a Wine Manager marker only a wineserver inside the tools path; a missing marker spawns nothing. A hand-edited marker naming /usr/bin/evil/wineserver is never run"
  - "CXBOTTLE_DELETE_CAP is 60 s (half of CX_CREATE_CAP_MS); the wineserver stop keeps the existing 15 s KILL_TIMEOUT_MS"

requirements-completed: [SVC-02]

duration: about 15 min of executor wall clock (commit times 00:41 to 00:45 local plus reading)
completed: 2026-11-25
---

# Phase 87 Plan 66: The crate removes a non-Steam game's own per-game bottle, and only that Summary

**`engine_bottle_remove_per_game` removes a game's own CrossOver per-game bottle through the crate dispatch: the target is computed in Rust and must match the stored bottle, the guard is asked before anything is spawned, the bottle's wineserver is stopped, `cxbottle --delete --force` runs as a capped helper spawn for a CrossOver bottle, and a guarded `remove_tree` takes what is left. A sibling bottle is byte-identical in every case.**

## Accomplishments

- **Task 1 (tracer, `62d0bd61d`).** The op, its strict request (`deny_unknown_fields`, `<op>:bad-args`), the target rule and the guarded delete over a `Bottle` target rooted at the Bottles directory; registered in `OPS` (sorted) and the route. The removed case, the shared-bottle and other-game cases, bad-args and absent `knownInstalls` (guard unknown, refused `known-installs-unreadable`) pass through `gamelib_engine::dispatch`, with the sibling and shared bottle trees unchanged.
- **Task 2 RED (`ad127fa69`).** 18 more cases written first; six failed on behaviour (in-use by ledger, in-use by live selection, CrossOver spawn order, the failed-spawn path, cxbottle having already deleted the directory, the pinned wineserver stop), the rest already held because the Task 1 guard did.
- **Task 2 GREEN (`58225932c`).** The running check, the pre-spawn guard check, the bounded wineserver stop, the `cxbottle --bottle <name> --delete --force` helper spawn under a `ctx.shutdown` registrant, then the guarded delete. 26 of 26 pass.
- **The adversarial table.** A link at the bottle's place aimed at a CrossOver-marked sibling (no spawn, link unlinked, sibling intact); a link inside the bottle aimed at a sibling (unlinked, not followed); lookalike names (`-123`, `-12345`, `-1234-x`, `-1234.bak`, an encoded variant, other runners); NFC and NFD spellings of one app name as two bottles, both directions; a case variant (asserted per the filesystem's sensitivity); stored names `..`, `.`, `../GameLib`, `GameLib-gog-1234/..`, `GameLib/../GameLib-gog-1234`, `/etc`; Linux and Windows hosts. Every case compares the sibling trees before and after.

## Verification

- `cargo test -p gamelib-engine --features testing --test bottle_removal --test golden_bottles`: 26 and 14 passed, golden_bottles unchanged.
- `cargo test -p gamelib-engine --features testing --lib` (bottles filter 41 passed; the full lib 189 passed with the OPS sorted test updated).
- `cargo clippy -p gamelib-engine --all-targets --features testing -- -D warnings` and `cargo fmt -p gamelib-engine --check`: clean.
- `grep -c '"engine_bottle_remove_per_game"' lib.rs` is 3 (OPS, route, the sorted-list test); the acceptance floor is 2.
- Prettier: Rust-only plan, no prettier-visible path written.

## Deviations from Plan

None that change scope. Three notes:

- **Task 1 is one commit** (tracer: tests and implementation together), so its tests were green on first run rather than red-first; the RED-before-GREEN split is Task 2's, as the plan's `tdd="true"` is on Task 2 only.
- **The registrant is `ctx.shutdown.register("engine-bottle-remove")`, not a bare `global()`** call: the crate takes its `Shutdown` from the context (the shell passes the global one), and `dispatch`'s `guarded` already holds an `engine` registrant for the whole op; the extra one names the in-flight cxbottle section.
- **No post-delete guard re-check** (the TS bridge route's WR-09): the plan does not call for one, and after `cxbottle --delete` the directory is normally gone, so a late objection cannot un-delete anything; `remove_tree` re-checks whatever is left. Noted in case 87-70 wants parity.

## Threat model

T-87-118 to T-87-122 are mitigated as planned: no path or bottle name is an argument; the guard is asked before any spawn and again by `remove_tree`; links are only unlinked; the shared bottle answers `not-bottle-backed`; ledger and live selection refuse `in-use` before the guard; the cxbottle and wineserver spawns are capped helper spawns. No new dependency (T-87-SC).

## Known Stubs

None.

## Threat Flags

None: no new network, auth or schema surface; the op is not yet reachable from the shell (87-70).

## Issues Encountered

None. Out of scope and untouched: the pre-existing dirty `.planning` and spike files and the stray `.dxvk-cache`. F1 was not attempted (as instructed).

## Self-Check: PASSED

- FOUND: src-tauri/crates/gamelib-engine/src/bottles/remove_per_game.rs
- FOUND: src-tauri/crates/gamelib-engine/tests/bottle_removal.rs
- FOUND commits: 62d0bd61d, ad127fa69, 58225932c (all ancestors of HEAD)
