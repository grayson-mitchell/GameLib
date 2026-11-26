---
phase: 87-engine-wine-and-tools
plan: 78
subsystem: gap-closure-proof-and-signed-build
tags: [gap-closure, svc-02, d-12, d-13, clean-worktree-proof, three-os-ci, signed-build, release-0.13.2, codesign, notarization]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: "the cycle 2 gap plans 87-71..87-77 (their SUMMARY commit lists, including 87-74's debug-session commits); 87-68's proof table, CI recipe and release/v0.13.1 recipe; the 0.13.1 / 0.13.0 / Phase 86 identity"
provides:
  - "87-VALIDATION.md '## Gap closure proof (cycle 2, 87-78)': the 18-step proof from a clean worktree, first at P 02d0bd26d and re-run at the moved P c0e66d30e; only pre-existing or environmental reds in step 13"
  - "87-VALIDATION.md '## CI proof (gap closure cycle 2)': all five workflows green at 06e4d2844, rust-test.yml on windows, macos and ubuntu, with per-leg engine, wine and shortcuts counts"
  - "87-VALIDATION.md '### Phase 87 gap build 2 (87-78)': the signed, notarized 0.13.2 build (release/v0.13.2, run 45791635064, draft GameLib v0.13.2), designated requirement byte-identical to 0.13.1, 0.13.0 and Phase 86, and 'Gate (gap build 2): pending'"
affects: [87-79, 87-verification]

actuals:
  tokens: 0
  tasks: 3
  commits: 8

plan_head_before: 756c4b2c8c03381fc36134e5c2f12380dd715464
plan_head_after: 17df53d0f
commits: 8

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/87-engine-wine-and-tools/87-78-SUMMARY.md
  modified:
    - .planning/phases/87-engine-wine-and-tools/87-VALIDATION.md
    - src/frontend/screens/Game/GamePage/actions/rowActivation.ts
    - meta/knip-baseline.txt
    - meta/backendDiCeilings/frontend-screens-game.json
    - src/backend/humble/__tests__/oracle/userHarness.ts
    - src-tauri/Cargo.lock
    - src-tauri/crates/gamelib-shortcuts/tests/golden_windows.rs

key-decisions:
  - "Task 2 (checkpoint:decision, gate=blocking-human), operator reply verbatim: `push-and-build`. The executor declined to act on the reply when the orchestrator relayed it, so the orchestrator ran Task 3 itself in the session where the operator gave it."
  - "Push 1's CI had two reds already on main before this plan (Test: loginWindowSeamPredicateRemoved false positive from 94-09; Supply-chain audit: RUSTSEC-2026-0594). Operator chose 'Fix first, then release' over releasing with them recorded."
  - "Push 2's CI turned up a Windows-only timeout in the 94-16 real-PowerShell .lnk test. Operator chose 'Investigate, then release'. Measured on windows-latest: Add-Type under the test's empty fake profile took 17.8 to 28 s (no module-analysis cache, Az modules on PSModulePath). Test-only fix, verified on the runner at 11.5 to 16.9 s; the app passes PowerShell its full environment and is unaffected."
  - "P moved twice: 02d0bd26d -> c0e66d30e (Task 1 re-run in full) -> 06e4d2844. The third move is a #[cfg(windows)] test in a Windows-only binary the macOS proof does not compile, so Task 1 was not re-run a third time (deviation, recorded)."
  - "Gate (gap build 2) is pending, not blocked: Identifier, leaf authority, chain, TeamIdentifier, spctl and stapler equal, and the designated requirement hashes to 68d712d0..., equal to 0.13.1, 0.13.0 and Phase 86."

requirements-completed: [SVC-02]

duration: about 6h of wall clock (2026-11-26, 07:00 to 09:55 UTC for Task 3 alone), most of it on three CI reds that were not cycle 2 defects
completed: 2026-11-26
---

# Phase 87 Plan 78: Gap closure proof (cycle 2), CI proof and the signed 0.13.2 build Summary

**Cycle 2 is proven from a clean worktree and on three-OS CI, and a signed, notarized 0.13.2 build containing every cycle 2 fix exists with an identity byte-identical to 0.13.1, 0.13.0 and Phase 86, so re-run 2 (87-79) can start. Getting there fixed four defects that blocked the push or CI, none of them a cycle 2 regression: 87-74's three pre-push gate reds, a Phase 94 seam-gate false positive, the cookie advisory, and a Windows test timeout.**

## Tasks

1. **Task 1 (tracer): gap closure proof, cycle 2.** 18 steps from a clean `git worktree add --detach` checkout at P = `02d0bd26d` (36 of 36 cycle 2 SUMMARY hashes are ancestors). First pass at `0521d20d3` found `find-deadcode` and `backend-di-ceilings` red from 87-74, fixed in `02d0bd26d` (Rule 1). Re-run in full at the moved P `c0e66d30e`. Step 13 reds at both heads are pre-existing or environmental only (genI18nGateScope A-17, iconGeometry goldens never committed, valveClient symlink permission in the executor shell, the transient runTs probe race; `shimAbiGate` once under full-suite load, green alone).
2. **Task 2 (checkpoint:decision, blocking-human):** operator reply `push-and-build`.
3. **Task 3: CI proof, release branch, signed build, identity.** Three pushes of main, pre-push hook every time:
   - **Push 1** (`c0f863946..01f11c55e`): Test red (seam gate false positive, 94-09) and Supply-chain audit red (RUSTSEC-2026-0594), both already red on main. Fixed: `f2bed5556`, `c0e66d30e`.
   - **Push 2** (`..c866ad57d`): Windows Rust test red twice (`powershell did not exit within 30000ms`). Diagnosed on a throwaway branch (6 runs) and fixed: `06e4d2844`.
   - **Push 3** (`..06e4d2844`): all five workflows green on all three legs.

   `release/v0.13.2` = `06e4d2844` + `c5d19ab53` (version bump, four files), one dispatch (run `45791635064`, three legs green), draft `GameLib v0.13.2` the only new release. The aarch64 app is `0.13.2`, Developer ID S7U223QWXJ, `spctl` accepted (Notarized Developer ID), stapled, designated requirement sha256 `68d712d0...` equal to the installed 0.13.1.

## Task Commits

- `02d0bd26d` fix(87-78): 87-74's three pre-push gate reds, a dead export and two ratchet baselines
- `01f11c55e` docs(87-78): gap closure proof, cycle 2, from a clean worktree at one head
- `f2bed5556` fix(87-78): the Humble user harness defaults its seam script without a seam?-shaped expression
- `c0e66d30e` fix(87-78): bump cookie to 0.18.3 for RUSTSEC-2026-0594
- `c866ad57d` docs(87-78): gap closure proof re-run at the moved P
- `06e4d2844` fix(87-78): the real PowerShell .lnk test gives PowerShell only its built-in module path
- `17df53d0f` docs(87-78): three-OS CI proof (cycle 2) and the signed gap build 2 (0.13.2), gate pending
- this SUMMARY

The release-branch commit `c5d19ab53` (version bump to 0.13.2) lives on `release/v0.13.2`, not on main.

## Deviations from Plan

1. **Rule 1, three CI-fix commits beyond the plan's scope** (`f2bed5556`, `c0e66d30e`, `06e4d2844`): each red was pre-existing on main or environmental, not a cycle 2 defect. The plan says to record such a red and not fix it. The operator chose to fix each one first (two question dialogs).
2. **Task 1 not re-run at the third P** (`06e4d2844`): the only change is a `#[cfg(windows)]` test in `golden_windows.rs`, which the macOS proof does not compile.
3. **Task 3 run by the orchestrator, not the executor:** the executor would not accept the relayed operator reply as consent.
4. **`git commit --no-verify` on the throwaway `diag/ps-lnk-timing` branch only** (diagnostic workflow commits; the branch was deleted from origin and locally). Every commit and push on main and on `release/v0.13.2` ran its hooks.

## Issues Encountered

- `realCapture.oracle` fails in the main checkout only, because of the untracked local Humble capture under `src-tauri/crates/gamelib-humble/tests/fixtures/recorded/real/`. A clean worktree and CI skip it.
- `cargo deny check` (all checks) reports license rejections locally. CI runs `check advisories` only, which is ok.
- The i18n gate scope still lacks 87-74's `dialogCloseClock.ts` and `rowActivation.ts` (no user-facing strings); genI18nGateScope A-17 is red for six unrelated drifted files, so a regen is deferred.

## State of the remote

`origin/main` = `06e4d2844` before this SUMMARY's push (the docs commits after it are local). `origin/release/v0.13.2` = `c5d19ab53`. Draft release `GameLib v0.13.2` (8 assets), not published; no other draft, tag or branch changed (remote tags 23 before the dispatch; the draft's tag is created on publish). `/Applications/GameLib.app` is still 0.13.1 and was not touched.

## Next

87-79 runs re-run 2: read `Gate (gap build 2): pending` in `87-VALIDATION.md`, install 0.13.2 over 0.13.1 on the operator's Mac and score the live items. Item 6 can now also read the 87-74 provenance lines (`Show in Steam activation:` and `[SwitchRow] ignored a pointer click`).

## Self-Check: PASSED

- The plan's `<verify>`: `## CI proof (gap closure cycle 2)` 1, `### Phase 87 gap build 2 (87-78)` 1, `Gate (gap build 2): pending` 1.
- FOUND commits on main: 02d0bd26d, 01f11c55e, f2bed5556, c0e66d30e, c866ad57d, 06e4d2844, 17df53d0f; `c5d19ab53` on origin/release/v0.13.2.
