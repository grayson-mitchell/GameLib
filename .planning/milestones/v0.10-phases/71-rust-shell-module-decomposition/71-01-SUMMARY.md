---
phase: 71-rust-shell-module-decomposition
plan: 01
subsystem: tooling
tags: [rust, move-proof, baseline, python, bash]
requires: []
provides:
  - tools/moveproof.py (Layers 1-3, waves 1-5, --self-test)
  - tools/sizes.py, baseline.sh, permove.sh, jestpins.sh
  - baselines/wave-0-start (BASE_REF b9daa654a)
affects: [71-02, 71-03, all later Phase 71 plans]
tech-stack:
  added: []
  patterns: [shared test-module cut rule, per-wave allow profiles]
key-files:
  created:
    - .planning/phases/71-rust-shell-module-decomposition/tools/sizes.py
    - .planning/phases/71-rust-shell-module-decomposition/tools/baseline.sh
    - .planning/phases/71-rust-shell-module-decomposition/tools/permove.sh
    - .planning/phases/71-rust-shell-module-decomposition/tools/jestpins.sh
    - .planning/phases/71-rust-shell-module-decomposition/tools/known-jest-failures.txt
    - .planning/phases/71-rust-shell-module-decomposition/baselines/wave-0-start/
  modified:
    - .planning/phases/71-rust-shell-module-decomposition/tools/moveproof.py
key-decisions:
  - "clippy-list compare ignores file:line:col (locations move with code); lint + message multiset must be identical"
  - "baseline jest summary keeps path :: fullName; known-jest-failures.txt holds bare fullName (what jestpins.sh matches)"
requirements-completed: [D-01, D-02, D-03, D-05, D-13, D-14]
duration: 25min
completed: 2026-11-08
---

# Phase 71 Plan 01: Proof tooling and wave-0 baseline Summary

moveproof.py (3-layer mechanical-move proof with a shared test-module cut rule), sizes.py, and the baseline/permove/jestpins gates are built and proven, and the wave-0-start baseline is committed.

## Accomplishments
- moveproof.py self-test passes: pure move accepted; dropped and duplicated lines rejected; wave-1 conversion accepted; edited handler body rejected (Layer 2 MISMATCH); item body edit rejected (Layer 3); cutter removes trailing and mid-file test mods, keeps following code, ignores commented/indented/non-mod `#[cfg(test)]`.
- Sensitivity: `--base b62cf4172~1 --wave 1` exits 1 (366 lines removed-not-allowed, 504 added-not-allowed). `--base HEAD --wave 1` exits 0, 0/0, Layer 2 still-inline=45.
- sizes.py: main.rs (1867 non-test), store_embed.rs (4546), login_window.rs (3315), macos_epic_embed.rs (1900), single_instance.rs (1620), tray.rs (1099) OVER; exits 0 with the allow flags, 1 without.
- Baseline: cargo 441 passed / 0 failed / 2 ignored, 443 names; clippy ratchet PASS; jest 24 suites, 701 passed, 2 failed (exactly the WR-07 `.title(` and C3 `.spawn()` count pins). `baseline.sh compare` self-compare and `permove.sh wave-0-start 1` both pass.
- D-01 confirmed (transport-mirror count 0, ipc_contract.rs `@generated`); D-02 confirmed superseded (ubuntu-latest in matrix line 83); no `module_path!/file!()/line!()` hits.

## Task Commits
1. Task 1: b9daa654a (moveproof.py, sizes.py, vis.py, items.py promoted)
2. Task 2: 562a8f980 (baseline.sh, permove.sh, jestpins.sh, wave-0-start)

## Deviations from Plan
- [Rule 1 - Bug] Clippy list compare: the `--list` output carries file:line:col, so a literal diff would fail on every move. Compare strips locations. File: tools/baseline.sh.
- Jest suite list is 24 suites / 701 passed rather than the 20 / 658 quoted in the plan (list grew since b74d85dee); the 2 failures match exactly.
- Wave 3 does not allow import-line diffs (plan lists waves 2, 4, 5 only); implemented literally.
- Self-test assertion for `--require-all` was corrected during development (a partially converted fixture legitimately fails with the flag).

## Known Stubs
None.

## Self-Check: PASSED
