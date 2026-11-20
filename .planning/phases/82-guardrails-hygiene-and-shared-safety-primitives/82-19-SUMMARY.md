---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 19
subsystem: safety
tags: [test-fake, trust-root, contract-fixture, gap-closure, review-disposition]
requires:
  - phase: 82-guardrails-hygiene-and-shared-safety-primitives
    provides: trust-root-contract.json fixture and the crate's absent-root rule (82-17); detector and unbounded remove channel (82-18)
provides:
  - fakeSafetyRustInvoke models the crate's trust-root rule and lstat-based absent/isLink
  - fakeSafetyRustContract.test.ts runs the 12 shared contract rows against the fake, with a floor
  - GOG uninstall with no gog-support folder proceeds (CR-01), proven through the modelled fake
  - cancelled Steam install with no steamapps/common proceeds (WR-01), proven through the modelled fake
  - a disposition for every 82-REVIEW finding (6 fixed, 9 deferred, 0 open) and one triaged todo
affects: [82-verification re-run, verify-work]
requirements-completed: [FND-02]
actuals:
  tokens: 7600
  tasks: 3
  commits: 3
plan_head_before: f6bce0ca20ecab5118d763aab62480f93ed51cf0
plan_head_after: c0a50506db499b94f6d232eaaa0c842c8cb41ab8
key-files:
  created:
    - src/backend/testUtils/__tests__/fakeSafetyRustContract.test.ts
    - .planning/todos/pending/2026-11-21-phase-82-deferred-review-findings.md
  modified:
    - src/backend/testUtils/fakeSafetyRust.ts
    - src/backend/testUtils/__tests__/fakeSafetyRust.test.ts
    - src/backend/storeManagers/gog/__tests__/uninstallSafety.test.ts
    - src/backend/storeManagers/steam/__tests__/cancelDelete.test.ts
    - src/backend/sidecar/__tests__/shellFilesFlows.test.ts
    - src/common/types/safety.ts
    - src/backend/utils/uninstaller.ts
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-REVIEW-DISPOSITION.md
key-decisions:
  - "The fake has no option to turn the trust-root model off; a test that breaks the model has a request bug or a fixture bug and is fixed"
  - "Fake and crate are held to one fixture (trust-root-contract.json), each side with a floor of 12 rows"
status: complete
completed: 2026-11-20
---

# Phase 82 Plan 19: Trust-root-aware safety fake and review dispositions Summary

**`fakeSafetyRustInvoke` now answers trust roots the way `gamelib-safety` does (absent root judged at its nearest existing ancestor; equal, outside, empty, relative and unresolvable roots refused with the crate's reasons), is pinned to the crate by the shared 12-row contract fixture, and the GOG and cancel-install absent-folder cases are proven through it.**

## Accomplishments

- **Fake model** (`fakeSafetyRust.ts`): target location from `lstat` (a link is located by its parent's realpath plus its own name and reports `isLink`; ENOENT walks up to the nearest existing directory ancestor and reports `absent`), then the trust-root comparison on NFC-folded components (case-folded on win32/darwin). A non-yes trust-root answer wins over the configured verdict; undefined/null `trustRoot` keeps the configured verdict. No new exports.
- **Contract test** (`fakeSafetyRustContract.test.ts`): reads the same fixture the crate's `trust_root_contract.rs` includes, runs each row through the fake's check channel, and carries `TRUST_ROOT_CONTRACT_FLOOR = 12` with the zero-row throw. 13 tests.
- **CR-01 test:** GOG `uninstall` with `gogSupportPath` removed completes (`{stdout:'', stderr:''}`), install dir and manifest gone, installed store written, no refusal notice, support target carries `trustRoot: gogSupportPath`, folder still absent.
- **WR-01 test:** cancel cleanup with `steamapps/common` removed returns `deleted`, removes both manifests, clears the breadcrumb once, no notice, request carries `trustRoot: steamapps/common`, and `common` is not created.
- **Docs:** `SafetyTarget.trustRoot` comment states the empty-string and absent-root rules; the `removeAppDataFiles` JSDoc drops the stale missing-trust-root refusal reason (comment only).
- **Dispositions:** CR-01, WR-01 (82-17 + 82-19), WR-03 (82-18), WR-04 (82-17), WR-07 (82-18), WR-08 (82-17) marked fixed after confirming each SUMMARY records the fix. WR-02, WR-05, WR-06, WR-09, IN-01..IN-05 deferred with reasons and the todo path. `open: 0`, `total: 15`.

## Task Commits

1. **Task 1 (tracer): fake models trust roots, shared contract, GOG absent-folder test** - `de4f84ca1`
2. **Task 2: cancel absent-common test (WR-01), shellFilesFlows fixture fix, doc comments** - `90dff4133`
3. **Task 3: review dispositions and the deferred-findings todo** - `c0a50506d`
(SUMMARY and ROADMAP follow in a docs commit)

## Evidence

- **Red run against the old fake (HEAD fake, new contract test):** 7 failed, 6 passed, 13 total. The seven are the outside, prefix-lookalike, equal-to-root (two), through-a-file, relative and empty-root rows, exactly the rows the fake answered yes to.
- **Green after the model:** contract 13/13, `fakeSafetyRust.test.ts` and gog `uninstallSafety.test.ts` 33/33 together.
- **Mutation (not committed):** replacing the objection with `null` in `check` turned the contract suite 7 failed / 6 passed again. Restored.
- **Task 2 suites** (cancelDelete, gog/sideload uninstallSafety, bridgeRemovalSafety, removeCopies, staleQueueHeadCancel, fakeSafetyRust, contract, uninstaller): 9 suites, 140 tests, all passed.
- `pnpm codecheck` clean; `pnpm backend-di-ceilings` PASS (jestMock=1865, unchanged); `pnpm find-deadcode` PASS (312 baselined); `pnpm planning-gates` 12/12; prettier `--file-info` not ignored and `--check` clean on every TS path touched.

## Sweep of the suites that use the fake (Windows, vs the dac99a816 baseline)

| Suite | Baseline failing | After |
| --- | --- | --- |
| bridgeBottleLifecycle | 5 | 5 |
| steamDirectRemovalSafety | 2 | 2 (identical with the old fake and the new one; same tests, `result.refused` undefined and status `removed` instead of `refused`, the pre-existing Windows cause, not the trust-root model) |
| games | 52 | 52 |
| shellFilesFlows | 3 | 2 to 4 per run, see below |

The nine baseline-green suites stay green.

**Files the sweep touched:** `src/backend/sidecar/__tests__/shellFilesFlows.test.ts` only, a **fixture bug**: the test's boot context set `configPath` and `gamesConfigPath` from the contained HOME but left `appFolder` at a different tmp tree, so `resetHeroic`'s `trustRoot: appFolder` did not contain its own targets and the new model refused it (the real crate would have too). The fix passes `appFolder` from `createContainedHomeAppPaths()`. No production request was wrong.

**shellFilesFlows flake:** on this Windows box the suite fails a varying 2 to 4 tests run to run, from the pre-existing log-rotate `EPERM` (`gamelib.log` -> `gamelib.log.old` rename), `checkDiskSpace` and the traversal case. `REQ-34.3-05` (resetHeroic) failed deterministically before the fixture fix and passes after it (the reruns where it showed red were the `EPERM` log failure). The plan's second automated verify caps this suite at 3, so it can read 4 on a bad run here. CI (ubuntu) is not affected by the EPERM cause.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] fakeSafetyRust.test.ts "outside the OS temp dir" test hit the trust-root refusal first**
- **Found during:** Task 1
- **Issue:** the test sent the repo's `src` folder under a tmp trust root; the new model refused it as `outside-trust-root` before the temp-dir confinement could throw.
- **Fix:** the request now uses `trustRoot: process.cwd()`, so the trust-root check passes and the confinement is what is tested.
- **Files modified:** `src/backend/testUtils/__tests__/fakeSafetyRust.test.ts`
- **Commit:** `de4f84ca1`

**2. [Rule 1 - Bug, fixture] shellFilesFlows `appFolder` outside its own config paths**
- Described in the sweep section above. **Commit:** `90dff4133`

**3. [Process] the new contract test was written, then the fake model, with the red run taken afterwards by swapping the HEAD fake back in**
- The red evidence above is the real run of the new test against the old fake; the order of writing differs from the plan's literal wording.

## Notes

- GOG and cancel absent-folder tests pass against both the old and the new fake in isolation; what makes them meaningful is that the fake now answers what the crate answers, pinned by the contract rows (rows 3 and 4 are these two shapes).
- Plan 82-17's crate contract test (`trust_root_contract.rs`) was not rerun here; no Rust code changed in this plan.
- `pnpm lint` and the CI legs are left to the pre-push hook and CI.

## Known Stubs

None.

## Threat Flags

None. T-82-54 (fake diverging from the crate) is mitigated by the contract rows on both sides; T-82-55 (delete outside the temp dir) keeps the `insideTmp` confinement and the contract test only uses the check channel; T-82-56 (lost findings) is mitigated by the dispositions and the todo under `pnpm planning-gates`.

## Remaining human item (routed to /gsd-verify-work)

On the operator's machine, after `pnpm tauri:dev` (restart so the sidecar rebuilds): (a) uninstall a throwaway sideloaded game whose folder holds another installed game's folder and expect the "Couldn't uninstall ... Nothing was deleted." notice naming the other game; (b) uninstall a throwaway GOG game with no gog-support folder and expect it to complete.

Operator follow-up (no plan does it): ROADMAP Phase 82 success criterion 5 still reads as if `legendary/commands/*`, the type-only files and `fileStore.ts` were deleted; the verifier recorded an override (D-19). Edit SC5's wording or name those items in the Phase 85 and Phase 91 plans.

## Self-Check: PASSED

- Created and modified files exist; commits `de4f84ca1`, `90dff4133`, `c0a50506d` found in `git log`; measured count from the ledger (`f6bce0ca2..HEAD`) was 3 before this SUMMARY's own commit.
- No unexpected deletions in any task commit.
