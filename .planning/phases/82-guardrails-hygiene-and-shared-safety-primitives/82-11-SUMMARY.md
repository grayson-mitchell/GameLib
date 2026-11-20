---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 11
subsystem: infra
tags: [proof, ledger, ci, pre-push, gamelib-safety, planning-gates]

requires:
  - phase: 82-guardrails-hygiene-and-shared-safety-primitives
    provides: "82-01..82-10 and 82-13..82-16 landed on main (14 SUMMARYs, every listed commit an ancestor of the proof head)"
provides:
  - "D-02 clean-worktree proof of the D-01 gate set at head a8eb655b5, with its own frozen install; planning-gates 12/12"
  - "The finished 82-TEST-LEDGER.md: Proof head, Provenance, full-run counts, gates, notes (D-19, D-21, delete-site classifications), per-leg CI proof"
  - "One push through .husky/pre-push without --no-verify (826373aa0..76fd0e112, exit 0)"
  - "An honest D-18 record: macOS green, Windows and Linux red on the first gamelib-safety step; D-20 not yet observed"
affects: [82-12]

status: partial
actuals:
  tokens: 45000
  tasks: 3
  commits: 6
plan_head_before: 2441545b1a7f1f517d5da61dd8e6c5e06f8a4baa
plan_head_after: 376647841f5fab63df85a44016bd3f751abc00ba

tech-stack:
  added: []
  patterns:
    - "Proof by detached worktree at a named sha plus a push through the real hook; CI evidence recorded per leg and per step, never as one green"

key-files:
  created:
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-11-SUMMARY.md
  modified:
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-TEST-LEDGER.md
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-UTILS-BOOTSTRAP-INVENTORY.md
    - .planning/STATE.md
    - src/backend/safety/knownInstalls.ts

key-decisions:
  - "A CI-only fix under push-once stays off main: the safety-test fix is committed on a local branch off e4f5c0e45 (5a86d54ac, branch fix/82-11-safety-adversarial-precious), not pushed, and returned to the operator as a new decision"
  - "The two Linux-only Test reds (steamLaunchRuntime, callbackRegistryHost) and the rdo census pair are recorded for 82-12, not fixed or retired here"

requirements-completed: []

duration: multi-session
completed: 2026-11-21
---

# Phase 82 Plan 11: Clean-worktree proof, the push and the per-leg CI record Summary

**The D-01 gate set is proven green from a detached clean worktree and the hook-gated push succeeded, but the CI proof is NOT complete: the first gamelib-safety step is red on Windows and Linux from a fixture bug in 82-03's adversarial table, which also hides the D-20 Windows depot result. The fix is written and verified locally, unpushed, awaiting the operator.**

## Task Commits

1. **Task 1 (tracer): clean-worktree proof, planning-gates 12/12, inventory, ledger** - `413bbb533` (STATE.md Progress anchor), `a8eb655b5` (knownInstalls fix found by the proof), `faf82f563` (ledger and inventory)
2. **Task 2 (checkpoint:decision, push-once):** one plain fast-forward push, `826373aa0..76fd0e112 main -> main`, hook exit 0, no `--no-verify`. No commit.
3. **Task 3: per-leg CI record** - `376647841` (ledger CI proof). The safety-test fix `5a86d54ac` is on the local-only branch `fix/82-11-safety-adversarial-precious`, deliberately not on main and not pushed.

`commits: 6` is the measured `git rev-list --count 2441545b1..376647841`; two of the six (`76fd0e112` phase 83 plan, `e4f5c0e45` a todo) were made by other sessions on the shared main. This plan's own commits on main are the four above.

## Evidence

- Provenance (D-02): `git worktree add --detach <scratchpad>/proof-82 413bbb533...` read back `413bbb533400e7d056a27ac32971c550eafbc23d` before any install; after the one fix the worktree was moved to `a8eb655b5ed6bc4d19976dd60821442eb38cb873`, re-installed with `pnpm install --frozen-lockfile`, and every measurement re-run there. The 14 prior SUMMARYs were checked and every listed commit is an ancestor of the proof head (ledger "Provenance:" line).
- Local proof at P: planning-gates 12/12; all D-01 gates green. Full jest `3 failed, 1097 passed` (see Deviations 3).
- Push: origin/main was re-fetched and was still `826373aa0` (fast-forward). The hook ran all nine checks in the main tree (which carried another session's dirty `public/locales/en/gamelib.json`) and passed: lint 0 errors, i18n, find-deadcode (312 baselined), boundaries, steam-line-ceiling (201), backend-di-ceilings, gameinfo-narrowing-ceiling (876 scanned, 46 allowlisted). New commit on local main since the checkpoint: `76fd0e112` (phase 83 plan, `.planning/` only). The push published 108 commits, including other sessions' work, as the operator authorised. Another session pushed `e4f5c0e45` (one todo file) immediately on top, so CI ran at `e4f5c0e45` (code identical to `76fd0e112`).
- CI at `e4f5c0e45`:
  - Rust test run 44781299137: macOS green on every step including the clippy ratchet. Windows: gamelib-safety step FAILED (`nfc_and_nfd_spellings_match_only_when_insensitive`); the multi-crate step with gamelib-depot `fetch.rs` was SKIPPED. Ubuntu: gamelib-safety step FAILED (`case_insensitive_mode_refuses_a_differently_cased_nested_install` and the nfc/nfd row); the rest skipped.
  - Test run 44781299279 failed on 6 suites (see Deviations 7). Code check and Lint green. Supply-chain audit red on `cargo-deny`, the same as on `826373aa0`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] knownInstalls.ts GameInfo narrowing**
- **Found during:** Task 1 (clean proof run)
- **Issue:** gameinfo-narrowing-ceiling red at the proof head from the sideload runner check in `src/backend/safety/knownInstalls.ts`
- **Fix:** named the check without a GameInfo narrowing; the ceiling was not widened
- **Commit:** `a8eb655b5`

**2. [Rule 3 - Blocking] STATE.md Progress anchor**
- **Found during:** Task 1
- **Issue:** planning-gates 11/12: the field-anchor gate wants a `Progress:` line in Current Position
- **Fix:** added the line by hand; the gate was not edited (D-03)
- **Commit:** `413bbb533`

### Plan items not met, and why

**3. Task 1 "no failed count above zero" is NOT met.** The ledger honestly records 3 failed at P: the two surviving reds `moduleStateCensus` and `diPhaseGates` (from `a94108e3e` quick-261120-rdo, `shimCoverage.ts:515` `X86_NULL_OBJECT_VERSION_SET`, written up as a fix-not-retire proposal for 82-12), plus one load flake `rustInvokeChannel.test.ts` (green alone three times). Task 1's automated verify would trip on this; the operator chose to continue past it.

**4. Provenance via `plan_head_after`:** 82-04 and 82-13 are verified through their `plan_head_after` ancestry (their SUMMARYs list commits differently).

**5. Latent race, not fixed:** `depotPortComplete` and `steamFilesPortComplete` walk `meta/` with no `.__probe__.` skip (same race as the fixed `steamCmPortComplete`). It never reddened; a source change would have moved the proof head.

**6. Stale comments left alone:** `bootstrap.ts` lines ~2257/2267 still say "e2e legendary/nile stub slot".

**7. [Task 3 - CI-only reds, not fixed here]**
- **gamelib-safety first step, Windows and Linux (phase 82's own, 82-03):** the sensitive branch of two adversarial rows keeps the `b.exe` inside the target in `fx.precious` while expecting `removed()`, so `assert_precious` flags the legitimate deletion. macOS never reached that branch. Fix `5a86d54ac` (retain only precious paths outside the target; corrected the NTFS NFC/NFD comment) is on the local branch only; verified `42 passed; 0 failed` on a case-sensitive APFS image, the same branch Linux takes. NOT pushed (push-once).
- **Test, not phase 82's, for 82-12:** `diPhaseGates` and `moduleStateCensus` (rdo, above); `steamLaunchRuntime.test.ts` 3 raise-loop tests (`expect(clock.pendingCount()).toBe(1)` received 0, Linux only, from `0c5c35a32`); `meta/__tests__/callbackRegistryHost.test.ts` (`FAIL cr_buffer_zeroed left == 0:1311`, Linux C harness, from `4234aa0da`).
- **D-20:** the Windows depot `fetch.rs` result was never observed on this run because the red first step skipped the multi-crate step, so no retirement proposal exists or is warranted yet. Same for the Windows and Linux clippy legs and the Tauri shell test.

**8. State updates:** `state.update-progress` and `requirements.mark-complete` decline here because STATE.md asserts milestone `v0.10` (matches no ROADMAP heading) and requirements live in `REQUIREMENTS-v0.11.md`. FND-01 and FND-02 are NOT marked complete: the D-18/D-20 proof is open. `requirements-completed` is therefore empty.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None.

## Open for the operator

1. Push the fix branch commit `5a86d54ac` (it is on branch `fix/82-11-safety-adversarial-precious` in the worktree `/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/5e94eace-74c7-482f-892f-3220ce0a4ef6/scratchpad/fix-82`; cherry-pick onto main, then push) and re-collect the Rust test run to observe the Windows depot `fetch.rs`, clippy and Tauri legs for the first time.
2. 82-12: the rdo census pair, `steamLaunchRuntime` and `callbackRegistryHost` Linux reds, and the `cargo-deny` red.

## Self-Check: PASSED

- Commits `413bbb533`, `a8eb655b5`, `faf82f563`, `376647841` are ancestors of HEAD on main; `5a86d54ac` exists on the local fix branch.
- Ledger sections "## Proof head", "Provenance:", "## CI proof (D-18)" present.
