---
status: complete
phase: 82-guardrails-hygiene-and-shared-safety-primitives
source: [82-VERIFICATION.md]
started: 2026-11-20T07:59:36Z
updated: 2026-11-21T02:56:25.571Z
---

## Current Test

[testing complete]

## Tests

### 1. Live safety round trip and refusal notice in pnpm tauri:dev
expected: Through the real sidecar-to-shell hop, a nested sideload uninstall is refused with the notice and nothing is deleted; a GOG uninstall with no gog-support folder completes; a Steam cancel before the first write to steamapps/common clears the manifest and breadcrumb.
result: pass — run on Windows in pnpm tauri:dev, 2026-11-20. 1a pass: the nested case was driven through a GOG uninstall (Balrum with a sideload "UAT Nested" installed inside its folder), because the UI uninstall never passes deleteFiles, so the sideload folder guard is unreachable from the app (uninstaller.ts:246); the refusal notice named the nested game, nothing was deleted, the tile returned to rest. 1b pass: GOG uninstall of Balrum with gog-support absent completed (CR-01 absent-trust-root path through the real hop). 1c skipped: no Steam library picker exists (installLocation.ts:92 always targets library 0, whose steamapps/common already exists on this machine), so the pre-first-write shape cannot be set up from the app; the same resolve_trust_root absent-root path was exercised live by 1b, and the Steam-side cleanup is covered by cancelDelete.test.ts:391.

### 2. Three-OS CI green on the 82-17..82-19 gap-closure commits
expected: On a main commit that contains the 261120-uzn fix (afacd26ee), the Test workflow and the Rust test workflow both pass on ubuntu, macOS and Windows. The Rust test runs include the gamelib-safety symlink and case-sensitivity rows that only run on macOS/Linux.
result: issue — checked by Claude from GitHub on 2026-11-21 (operator agreed it is automated). Main at 90ca09d02 (contains afacd26ee and 5b969edd8). Rust test run 44850161688 green on all three legs; the macOS gamelib-safety step ran a_symlinked_trust_root_is_followed_and_a_game_under_it_is_removable and case_insensitive_mode_refuses_a_differently_cased_nested_install, both ok (47/47). Test run 44850161668 red: 1 failed of 23351, sharedRedistInstall.test.ts 'installer timeout > records timedOut, stops all further entries and statuses, and does not settle' at line 929, installerCalls() length 0 after the wait loop. The prior main Test run 44846652719 was green and 90ca09d02 touches only Rust, so this is a flake in the test 82-12 (5b969edd8) set out to stabilise.
reported: "Test workflow run 44850161668 failed: sharedRedistInstall.test.ts:929 installer timeout test, expected 1 installer call, received 0 (flaky; previous run green)"
severity: major
retest_of: G-82-2 (resolved by quick 261120-uzn); retest requested 2026-11-21
previous_result: |
  issue — pushed dac99a816..c939280e5 on 2026-11-20. Rust test: the gamelib-safety step is green on all three legs (macOS: 47 adversarial incl. a_symlinked_trust_root_is_followed_and_a_game_under_it_is_removable, trust_root_contract ran). The macOS leg went red in the later steampoll step (watchdog_real::still_kills_the_grandchild_when_the_middle_process_dies_first, assertion alive(rig.grand)); gamelib-steampoll is untouched by this range, so it is treated as a timing flake; the rerun of run 44823009090 went green on all three legs (flake confirmed). Test workflow red: dialogOptionForwarding.test.ts pins UNBOUNDED_RUST_CHANNELS and does not list RUST_SAFETY_REMOVE_TREE, which 82-17..82-19 (WR-03) added.
  reported: "Test workflow run 44823008791 failed: 1 suite, 1 test (dialogOptionForwarding.test.ts:223, UNBOUNDED_RUST_CHANNELS contains RUST_SAFETY_REMOVE_TREE, not in EXPECTED)"
  severity: major

### 3. Push main and read the Test, Rust test and Lint workflows on a sha that contains the 82-20 fix (dc220850f / d59c79873) and the 261120-uzn fix
expected: Test workflow green (sharedRedistInstall.test.ts installer-timeout tests pass), Rust test green on ubuntu, macOS and Windows, Lint workflow green
result: pass — operator accepted on 2026-11-21. Not observed in CI: dc220850f/d59c79873 were not on origin/main (origin at 8af71cd3f, local main 33 ahead). The last main CI on 90ca09d02 shows Test, Rust test (3 legs) and Lint all green after the rerun of Test run 44850161668.

### 4. Confirm the SC5 override wording (operator)
expected: ROADMAP SC5 edited to name the deferrals (fileStore.ts to Phase 85, proxy-types.ts, legendary/commands/* and the type-only files to Phase 91), or the override accepted as is
result: pass — operator accepted the D-19 override as is on 2026-11-21; ROADMAP SC5 wording left unchanged.

## Summary

total: 4
passed: 3
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-82-2
  truth: "After pushing main, the Rust test and Test workflows pass on ubuntu, macOS and Windows legs"
  status: resolved
  resolved_by: 261120-uzn
  resolved_at: 2026-11-20
  reason: "User reported: Test workflow run 44823008791 failed in dialogOptionForwarding.test.ts:223 (UNBOUNDED_RUST_CHANNELS set-equality pin lacks RUST_SAFETY_REMOVE_TREE)"
  severity: major
  test: 2
  root_cause: "WR-03 gap closure added RUST_SAFETY_REMOVE_TREE to UNBOUNDED_RUST_CHANNELS in sidecarRpc.ts but did not update the exact-set pin in dialogOptionForwarding.test.ts; the verifier re-ran only targeted suites (rustInvokeChannel etc.), not this one"
  artifacts:
    - path: "src/backend/__tests__/dialogOptionForwarding.test.ts"
      issue: "EXPECTED list (ends ~line 216) missing RUST_SAFETY_REMOVE_TREE; test title says 'dialog, depot and Rust CM channels'"
  missing:
    - "Add RUST_SAFETY_REMOVE_TREE to EXPECTED with a comment citing WR-03 (a recursive delete of a large install can exceed the 60 s cap), and widen the test title to include the safety remove channel"
  debug_session: ""

- gap_id: G-82-2-r2
  truth: "On a main commit containing the 261120-uzn fix, the Test and Rust test workflows pass on ubuntu, macOS and Windows"
  status: resolved
  resolved_by: 82-20-PLAN.md
  resolved_at: 2026-11-21
  reason: "Test workflow run 44850161668 failed: sharedRedistInstall.test.ts:929 installer-timeout test saw 0 installer calls after its wait loop (flaky; previous main run green)"
  severity: major
  test: 2
  root_cause: "The three installer-timeout tests in sharedRedistInstall.test.ts wait for the first installer call with a loop bounded by 500 setImmediate turns. Before that call the code under test does real fs I/O (the ledger lives under a per-test mkdtemp dir). A setImmediate turn costs microseconds when nothing else is pending, so on a loaded CI runner the 500 turns run out before the fs callbacks land and the assertion sees an empty call list. 82-12 (5b969edd8) only raised the per-test jest timeout to 30 s, which cures the other failure mode (the loop taking longer than 5 s) but not this one: the loop counts turns, not elapsed time."
  artifacts:
    - path: "src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts"
      issue: "wait loops at ~line 927 (and the two sibling installer-timeout tests) are bounded by a turn count, not by wall-clock time"
  missing:
    - "Replace the turn-counted wait with one shared helper that yields with setImmediate until the condition holds or a real wall-clock deadline (performance.now / Date.now, not faked) passes, and use it in all three installer-timeout tests"
    - "Prove it under load: run the suite repeatedly with CPU contention (e.g. --runInBand alongside a busy loop, or a mocked slow fs) and show no failures"
  debug_session: ""

## Deferred Follow-Ups

- test: 1
  idea: "GOG on Windows shows external dialogs: 3 UAC prompts installing Balrum (gog + vcredist), a UAC prompt on uninstall, then GOG's own 'keep saved games?' dialog. Operator: 'what a mess, need try and get rid of all of those external windows'. Cause found: games.ts Windows uninstall branch drops /KEEPSAVES /ProductId /galaxyclient from the built command (only /verysilent + /dir passed); -Verb RunAs elevates per call (uninstall, and per redist at games.ts:1360). Not a Phase 82 regression. Partially addressed by quick task 261120-uzn on 2026-11-20: the Windows uninstall now passes /VERYSILENT /ProductId /galaxyclient /KEEPSAVES and /dir with literal-safe quoting, so the keep-saved-games dialog should not appear, and paths with spaces now reach the uninstaller at all; GOG setup's elevated steps run under one UAC prompt instead of one each. Still open: the uninstall keeps one UAC prompt on purpose, and nothing is live-verified yet; both are tracked in .planning/todos/pending/2026-11-20-gog-windows-elevation-live-check.md."
  deferred_at: 2026-11-20
- test: 1
  idea: "Sideload uninstall from the UI never deletes the game folder (uninstallGameCallback calls game.uninstall({ shouldRemovePrefix }) with no deleteFiles), so the sideload-folder safety guard (D-22) is unreachable from the app. Decide: offer a 'delete files' option for sideload, or retire the dead branch."
  deferred_at: 2026-11-20
- test: 1
  idea: "No Steam library picker for native installs: installLocation.ts always targets the first registered library; the backend accepts a registered-library override but the install dialog never sends one."
  deferred_at: 2026-11-20
