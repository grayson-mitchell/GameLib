---
status: complete
phase: 82-guardrails-hygiene-and-shared-safety-primitives
source: [82-VERIFICATION.md]
started: 2026-11-20T07:59:36Z
updated: 2026-11-21T06:28:23.310Z
---

## Current Test

[testing complete]

## Tests

### 1. Live safety round trip and refusal notice in pnpm tauri:dev
expected: Through the real sidecar-to-shell hop, a nested sideload uninstall is refused with the notice and nothing is deleted; a GOG uninstall with no gog-support folder completes; a Steam cancel before the first write to steamapps/common clears the manifest and breadcrumb.
result: pass — run on Windows in pnpm tauri:dev, 2026-11-20. 1a pass: the nested case was driven through a GOG uninstall (Balrum with a sideload "UAT Nested" installed inside its folder), because the UI uninstall never passes deleteFiles, so the sideload folder guard is unreachable from the app (uninstaller.ts:246); the refusal notice named the nested game, nothing was deleted, the tile returned to rest. 1b pass: GOG uninstall of Balrum with gog-support absent completed (CR-01 absent-trust-root path through the real hop). 1c skipped: no Steam library picker exists (installLocation.ts:92 always targets library 0, whose steamapps/common already exists on this machine), so the pre-first-write shape cannot be set up from the app; the same resolve_trust_root absent-root path was exercised live by 1b, and the Steam-side cleanup is covered by cancelDelete.test.ts:391.

### 2. Three-OS CI green on the 82-17..82-19 gap-closure commits
expected: On a main commit that contains the 261120-uzn fix (afacd26ee), the Test workflow and the Rust test workflow both pass on ubuntu, macOS and Windows. The Rust test runs include the gamelib-safety symlink and case-sensitivity rows that only run on macOS/Linux.
result: pass — re-tested by Claude from GitHub on 2026-11-21 after pushing main to 5bd0c0b72 (contains 261121-mpt c540e9769 and 5e700a0cf, plus 82-20 and 261120-uzn). Every Phase 82 check is green: runTs.test.ts (C3-01, E-02), steamBridgeKnownFixes.test.ts, sharedRedistInstall.test.ts, the gamelib-safety rows, and gamelib-steampoll on macOS. Lint 44872994881 and Code check 44872995026 green. Operator ruled 2026-11-21 to pass this item on attribution, because the remaining reds are outside Phase 82: (1) Rust test 44872994911 Windows, gamelib-log golden.rs:191 case chunks-wine-header writes a backslash where the fixture has / (Phase 84, gamelib-log crate); (2) Test 44872994910, gameDetailsImportGate.test.ts Gate 7 digest and twelve-channel pin on settingsFlowRegistration.ts (Phase 84-05, 92ad8ec5b); (3) Rust test ubuntu, gamelib-steamcm macowned.rs:558 HelperFailed vs AccountMismatch, file untouched in the pushed range, likely intermittent; (4) Supply-chain audit 44872994926, RUSTSEC-2026-0543 chrono unmaintained (external; also red on 8af71cd3f). Each is filed as a pending todo.
retest_of: G-82-2-r3 (resolved by quick 261121-mpt); retest 2026-11-21
previous_result: |
  issue — re-tested by Claude from GitHub on 2026-11-21 after pushing main to 005cd414d (contains dc220850f, d59c79873, afacd26ee). Lint 44858803763 green. Rust test 44858803826: ubuntu and windows green, macOS red in gamelib-steampoll watchdog_real::still_kills_the_grandchild_when_the_middle_process_dies_first (monitor.rs:711, assertion alive(rig.grand)), the same timing flake seen on run 44823009090. Test 44858803823: 3 failed of 23415. (a) meta/__tests__/runTs.test.ts, two pins (C3-01 and E-02) fail deterministically: the codecheck script now writes --tsBuildInfoFile node_modules/.cache/tsc-*.tsbuildinfo (quick 261121-kqt, 1dc3e622e) and the pins reject any node_modules/.cache mention. (b) steamBridgeKnownFixes.test.ts:576 'times out a never-settling call after 15s and warns' exceeded the 5000 ms jest timeout (fake timers with real setImmediate around real .reg IO); green on prior main runs. The 82-20 installer-timeout tests in sharedRedistInstall.test.ts passed.
  reported: "Push to 005cd414d: Test run 44858803823 red (runTs.test.ts C3-01/E-02 pins vs codecheck tsbuildinfo under node_modules/.cache; steamBridgeKnownFixes.test.ts:576 exceeded 5 s timeout); Rust test 44858803826 macOS red (steampoll watchdog grandchild flake, monitor.rs:711)"
  severity: major

### 3. Push main and read the Test, Rust test and Lint workflows on a sha that contains the 82-20 fix (dc220850f / d59c79873) and the 261120-uzn fix
expected: Test workflow green (sharedRedistInstall.test.ts installer-timeout tests pass), Rust test green on ubuntu, macOS and Windows, Lint workflow green
result: pass — operator accepted on 2026-11-21. Not observed in CI: dc220850f/d59c79873 were not on origin/main (origin at 8af71cd3f, local main 33 ahead). The last main CI on 90ca09d02 shows Test, Rust test (3 legs) and Lint all green after the rerun of Test run 44850161668.

### 4. Confirm the SC5 override wording (operator)
expected: ROADMAP SC5 edited to name the deferrals (fileStore.ts to Phase 85, proxy-types.ts, legendary/commands/* and the type-only files to Phase 91), or the override accepted as is
result: pass — operator accepted the D-19 override as is on 2026-11-21; ROADMAP SC5 wording left unchanged.

## Summary

total: 4
passed: 4
issues: 0
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

- gap_id: G-82-2-r3
  truth: "On a pushed main commit containing the 82-20 and 261120-uzn fixes, the Test and Rust test workflows pass on ubuntu, macOS and Windows"
  status: resolved
  resolved_by: 261121-mpt
  resolved_at: 2026-11-21
  reason: "User reported: Test run 44858803823 red (runTs.test.ts C3-01/E-02 pins; steamBridgeKnownFixes.test.ts:576 5 s timeout) and Rust test 44858803826 macOS red (steampoll watchdog grandchild flake)"
  severity: major
  test: 2
  root_cause: "Three independent causes, none in Phase 82 code. (1) Deterministic: quick 261121-kqt (1dc3e622e) put tsc incremental build info under node_modules/.cache in the codecheck script; runTs.test.ts pins C3-01 and E-02 forbid any package.json script mentioning node_modules/.cache (they target the compile-then-run outfile, but match the bare path). (2) Flake: steamBridgeKnownFixes.test.ts:576 runs under the default 5 s jest timeout while waiting on real .reg IO with fake timers, the same pattern 82-12 and 82-20 fixed in sharedRedistInstall.test.ts. (3) Flake: gamelib-steampoll watchdog_real grandchild test on macOS (monitor.rs:711), already seen on run 44823009090 and green on rerun."
  artifacts:
    - path: "meta/__tests__/runTs.test.ts"
      issue: "C3-01 and E-02 pins match any node_modules/.cache mention, not only the compile-then-run outfile"
    - path: "package.json"
      issue: "codecheck writes tsc-main/tsc-meta .tsbuildinfo under node_modules/.cache"
    - path: "src/backend/__tests__/steamBridgeKnownFixes.test.ts"
      issue: "line 576 test has no per-test timeout and waits on real IO under fake timers"
    - path: "crates/gamelib-steampoll/tests/monitor.rs"
      issue: "line 711 alive(rig.grand) assertion is timing-dependent on macOS runners"
  missing:
    - "Narrow the runTs pins to the compile-then-run outfile, or move the tsbuildinfo files to a path the pins allow; keep codecheck incremental"
    - "Give the steamBridgeKnownFixes timeout test a real-time-bounded wait (the 82-20 yieldUntil pattern) and an explicit per-test timeout"
    - "Make the steampoll watchdog grandchild test wait on a deadline instead of a fixed timing assumption, or record why it stays flaky"
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
