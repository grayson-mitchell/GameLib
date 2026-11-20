---
status: complete
phase: 82-guardrails-hygiene-and-shared-safety-primitives
source: [82-VERIFICATION.md]
started: 2026-11-20T07:59:36Z
updated: 2026-11-20T22:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Live safety round trip and refusal notice in pnpm tauri:dev
expected: Through the real sidecar-to-shell hop, a nested sideload uninstall is refused with the notice and nothing is deleted; a GOG uninstall with no gog-support folder completes; a Steam cancel before the first write to steamapps/common clears the manifest and breadcrumb.
result: pass — run on Windows in pnpm tauri:dev, 2026-11-20. 1a pass: the nested case was driven through a GOG uninstall (Balrum with a sideload "UAT Nested" installed inside its folder), because the UI uninstall never passes deleteFiles, so the sideload folder guard is unreachable from the app (uninstaller.ts:246); the refusal notice named the nested game, nothing was deleted, the tile returned to rest. 1b pass: GOG uninstall of Balrum with gog-support absent completed (CR-01 absent-trust-root path through the real hop). 1c skipped: no Steam library picker exists (installLocation.ts:92 always targets library 0, whose steamapps/common already exists on this machine), so the pre-first-write shape cannot be set up from the app; the same resolve_trust_root absent-root path was exercised live by 1b, and the Steam-side cleanup is covered by cancelDelete.test.ts:391.

### 2. Three-OS CI green on the 82-17..82-19 gap-closure commits
expected: After pushing main, the Rust test and Test workflows pass on ubuntu, macOS and Windows legs, including the gamelib-safety symlink and case-sensitivity rows that only run on macOS/Linux (last green CI sha dac99a816 predates the gap closure).
result: issue — pushed dac99a816..c939280e5 on 2026-11-20. Rust test: the gamelib-safety step is green on all three legs (macOS: 47 adversarial incl. a_symlinked_trust_root_is_followed_and_a_game_under_it_is_removable, trust_root_contract ran). The macOS leg went red in the later steampoll step (watchdog_real::still_kills_the_grandchild_when_the_middle_process_dies_first, assertion alive(rig.grand)); gamelib-steampoll is untouched by this range, so it is treated as a timing flake and the job was rerun. Test workflow red: dialogOptionForwarding.test.ts pins UNBOUNDED_RUST_CHANNELS and does not list RUST_SAFETY_REMOVE_TREE, which 82-17..82-19 (WR-03) added.
reported: "Test workflow run 44823008791 failed: 1 suite, 1 test (dialogOptionForwarding.test.ts:223, UNBOUNDED_RUST_CHANNELS contains RUST_SAFETY_REMOVE_TREE, not in EXPECTED)"
severity: major

## Summary

total: 2
passed: 1
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-82-2
  truth: "After pushing main, the Rust test and Test workflows pass on ubuntu, macOS and Windows legs"
  status: failed
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

## Deferred Follow-Ups

- test: 1
  idea: "GOG on Windows shows external dialogs: 3 UAC prompts installing Balrum (gog + vcredist), a UAC prompt on uninstall, then GOG's own 'keep saved games?' dialog. Operator: 'what a mess, need try and get rid of all of those external windows'. Cause found: games.ts Windows uninstall branch drops /KEEPSAVES /ProductId /galaxyclient from the built command (only /verysilent + /dir passed); -Verb RunAs elevates per call (uninstall, and per redist at games.ts:1360). Not a Phase 82 regression."
  deferred_at: 2026-11-20
- test: 1
  idea: "Sideload uninstall from the UI never deletes the game folder (uninstallGameCallback calls game.uninstall({ shouldRemovePrefix }) with no deleteFiles), so the sideload-folder safety guard (D-22) is unreachable from the app. Decide: offer a 'delete files' option for sideload, or retire the dead branch."
  deferred_at: 2026-11-20
- test: 1
  idea: "No Steam library picker for native installs: installLocation.ts always targets the first registered library; the backend accepts a registered-library override but the install dialog never sends one."
  deferred_at: 2026-11-20
