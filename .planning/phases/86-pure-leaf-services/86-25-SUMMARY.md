---
phase: 86-pure-leaf-services
plan: 25
subsystem: phase-proof-ci-signed-build
tags: [phase-proof, sc4, d-01, drift, ci, three-os, d-15, d-16, clippy-ratchet, backend-di-ceilings, rustsec, gate-item-4]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-01..86-24 complete (every cited commit an ancestor of P = 6d9654265); 85-19's signed Phase 85 build block in 85-VALIDATION.md"
provides:
  - "86-VALIDATION.md: ## Phase proof (clean worktree at P), ## SC4 sweep, ## Drift run, ## CI proof (per-leg, with gamelib-info golden counts per OS), ## Signed builds (D-15) and the single `Gate item 4:` status line (blocked: no artifact)"
  - "R1-R3 darwin clippy excess removed (dd7872126), R4 jest.mock calls replaced by DI seams (1a58fe646), RUSTSEC-2026-0592 closed by the url 2.5.9 bump (0f3e6e9e9)"
  - "Phase 86 pushed to origin/main (88b48b70d..1a58fe646, 1a58fe646..0f3e6e9e9) with three-OS CI green at 4e1af5463"
affects: [86-26]

actuals:
  tokens: 14400
  tasks: 3
  commits: 26

plan_head_before: 6d9654265f689b5df4aff1293e1ac672bd36e008
plan_head_after: b1910d9f2e6910eb74e54d8391a29fe6f74f109f
commits: 26

key-files:
  created:
    - .planning/phases/86-pure-leaf-services/86-25-SUMMARY.md
  modified:
    - .planning/phases/86-pure-leaf-services/86-VALIDATION.md
    - src-tauri/src/info_dispatch.rs
    - src-tauri/src/native_router.rs
    - src/backend/storeManagers/steam/optInDlc.ts
    - src/backend/storeManagers/steam/__tests__/optInDlc.test.ts
    - src/frontend/state/__tests__/libraryStoreFollowers.test.ts
    - src/frontend/testUtils/tauriIpcRoute.ts
    - src-tauri/Cargo.lock

key-decisions:
  - "Task 2 operator decision: push-and-build-ask. Before the push the operator authorised the R1-R3 clippy fix and R4 by removing the jest.mock calls (not by baselining them), and deferred R5 (stale meta/i18nForkTouchedFiles.json) to later. After push 1 the operator authorised the url 2.5.9 bump for RUSTSEC-2026-0592."
  - "The open-time diff before push 1 listed six non-.planning paths. They were exactly the operator-authorised R1-R4 fixes, so the push went ahead on that authorisation instead of returning to the checkpoint; the list is recorded verbatim below."
  - "Gate item 4 is blocked, not pending: the authorised release run (45051040572) was a dry run, which uploads nothing by design, so no Phase 86 artifact exists to read an identity from. Log evidence (Developer ID keychain item, notarization Accepted, stapling) is recorded as supporting only, per the baseline rule that identity comes from the artifact, never the log."
  - "A dry_run=false dispatch on main today would target the existing v0.11.0 draft release (tauri.conf.json is still 0.11.0) and overwrite the Phase 85 build's assets that gate item 4 installs first; recorded as a caveat for the operator rather than acted on."

patterns-established:
  - "Per-leg CI golden counts are read from the job log with ANSI stripped and matched to cargo's `Running` lines; on macOS stderr/stdout interleave, so match in log order and cross-check against another leg."

requirements-completed: []

coverage:
  - id: E1
    description: "phase proof at a clean-worktree candidate head P, with red items attributed and the D-01/SC4 sweep and one drift run recorded"
    requirement: SVC-01
    verification:
      - kind: integration
        ref: "86-VALIDATION.md ## Phase proof (24 rows; R1-R5), ## SC4 sweep, ## Drift run (14 PASS, 6 keyed SKIP, 0 FAIL); commit 5303061fa"
        status: pass
    human_judgment: false
  - id: E2
    description: "three-OS CI green with gamelib-info golden replay observed on windows-latest and ubuntu-latest (D-16)"
    requirement: SVC-01
    verification:
      - kind: integration
        ref: "rust-test.yml run 45052890985 at 4e1af5463: ubuntu/windows/macos success; gamelib-info 364/363/364 tests, ten golden_* binaries (118 tests) on every leg; codecheck 45052890933, test 45052890886, lint 45052891061, supply-chain 45052890967 success"
        status: pass
    human_judgment: false
  - id: E3
    description: "signed Phase 86 build identity recorded beside Phase 85's and compared (D-15)"
    requirement: SVC-01
    verification:
      - kind: manual
        ref: "release-tauri.yml 45051040572 (dry run, all legs success) uploaded no artifact; Gate item 4: blocked"
        status: blocked
    human_judgment: true

duration: about 2h30m (Task 1 commit 16:04Z to Task 3 commit 18:30Z, 2026-11-22 UTC), across the Task 2 checkpoint
completed: 2026-11-23
status: complete
---

# Phase 86 Plan 25: Phase proof, three-OS CI and the Phase 86 signed build Summary

**Phase 86 is proven from a clean worktree at P = `6d9654265`, the R1-R4 gate reds found there are fixed and pushed with the operator's authorisation, and CI is green on all three OSes with gamelib-info's ten golden replay binaries observed on windows-latest and ubuntu-latest; the signed Phase 86 identity could not be recorded because the authorised release run was a dry run, which uploads no artifact, so `Gate item 4: blocked`.**

## Performance

- **Tasks:** 3 (tracer, blocking-human decision, auto). Task 1 by the first agent; Task 2 resolved by the operator; Task 3 by this continuation agent.
- **Tracer gate (Task 1):** automated-only `<verify>`, re-run green after its commit. The proof itself recorded five red items at P (R1-R5), which Task 2 resolved by decision.
- **Fix commits within the authorisation:** three (R1-R3, R4, url bump). No ceiling was raised and nothing was baselined.

## Task 2 decision

`push-and-build-ask`. Authorised before the push: the R1-R3 clippy fix commit; R4 by removing the `jest.mock` calls (not a baseline entry). R5 (`meta/i18nForkTouchedFiles.json` stale, `genI18nGateScope` A-17) deferred by the operator: "later". After the push: the url bump for the new advisory RUSTSEC-2026-0592.

## Open-time diff before the first push

`git diff --name-only 6d9654265f689b5df4aff1293e1ac672bd36e008 HEAD`, re-run immediately before `git push origin main` (saved by the first agent):

```
.planning/phases/86-pure-leaf-services/86-VALIDATION.md
src-tauri/src/info_dispatch.rs
src-tauri/src/native_router.rs
src/backend/storeManagers/steam/__tests__/optInDlc.test.ts
src/backend/storeManagers/steam/optInDlc.ts
src/frontend/state/__tests__/libraryStoreFollowers.test.ts
src/frontend/testUtils/tauriIpcRoute.ts
```

Every non-`.planning` path is one of the R1-R4 fixes the operator authorised before the push.

## Pushes

| Push | Range | Hook | Notes |
|------|-------|------|-------|
| 1 | `88b48b70d..1a58fe646` | green | `5303061fa`, `dd7872126`, `1a58fe646` |
| 2 | `1a58fe646..0f3e6e9e9` | green | `0f3e6e9e9` plus another session's `49f03ab67..f7c4f6b18` |
| foreign | `0f3e6e9e9..4e1af5463` | n/a | another session's quick-261123-9i7 pair; no runs were triggered for `0f3e6e9e9` |

## CI proof

| Workflow | Head | Run id | Legs / conclusion |
|----------|------|--------|-------------------|
| Rust test | `4e1af5463` | 45052890985 | ubuntu-latest success, windows-latest success, macos-latest success |
| Code check | `4e1af5463` | 45052890933 | success |
| Test | `4e1af5463` | 45052890886 | success (1118 suites, 24152 tests passed) |
| Lint | `4e1af5463` | 45052891061 | success |
| Supply-chain audit | `4e1af5463` | 45052890967 | cargo-deny success, pnpm-audit success |
| Rust test | `1a58fe646` | 45051034867 | ubuntu success, macos success, windows cancelled (superseded) |
| Code check / Test / Lint | `1a58fe646` | 45051034871 / 45051034925 / 45051034868 | success / success / success |
| Supply-chain audit | `1a58fe646` | 45051034887 | cargo-deny **failure** (RUSTSEC-2026-0592, fixed by `0f3e6e9e9`), pnpm-audit success |
| Release Tauri (dry run) | `1a58fe646` | 45051040572 | macOS, Linux, Windows success; no artifact |

gamelib-info in run 45052890985 (multi-crate step): 364 tests on ubuntu, 363 on windows (the unix-only symlink unit test `overrides::tests::a_symlink_out_of_the_folder_loses_the_link_and_keeps_the_target` is the difference), 364 on macOS, all `0 failed`. The ten `golden_*` binaries ran 118 tests on each leg, including `golden_overrides` and `golden_crossover` on windows-latest. Per-binary table in 86-VALIDATION.md ## CI proof.

## Build identity (D-15)

- Release run 45051040572 (`dry_run=true`, headSha `1a58fe646`): all three legs success; `actions/runs/45051040572/artifacts` total_count 0; macOS log ends `No releaseId or tagName provided, skipping all uploads...`. Nothing was downloaded, installed or run.
- Log evidence only: signed with the `Mac Developer ID Application: grayson mitchell` keychain item, `Notarizing Finished with status Accepted for id 155b67c6-c03f-4f22-be3d-458fa5688c58`, `Stapling app...`.
- Result: **`Gate item 4: blocked`** (no signed Phase 86 artifact). Unblocking needs a `dry_run=false` dispatch, which needs a new operator authorisation; first either bump the version (main is still 0.11.0, so the run would overwrite the Phase 85 assets in the `v0.11.0` draft) or keep a copy of the Phase 85 app.

## Task Commits

1. **Task 1 (tracer):** `5303061fa` docs(86-25): record the clean-worktree phase proof, the SC4 sweep and the drift run at 6d9654265
2. **R1-R3 fix (authorised at Task 2):** `dd7872126` fix(86-25): bring the darwin clippy ratchet back to its ceilings
3. **R4 fix (authorised at Task 2):** `1a58fe646` test(86-25): inject the opt-in DLC and library store-follower deps instead of jest.mock
4. **Advisory fix (authorised after push 1):** `0f3e6e9e9` fix(86-25): bump url to 2.5.9 for RUSTSEC-2026-0592
5. **Task 3:** `b1910d9f2` docs(86-25): record the three-OS CI proof and the blocked Phase 86 build identity

`commits: 26` is the measured `git rev-list --count 6d9654265..b1910d9f2`; 5 of those are this plan's (above), the other 21 are another session's commits on the shared `main`.

## Deviations from Plan

### Auto-fixed Issues

None in Task 3. The three fix commits were made within the operator's Task 2 authorisation, not under Rules 1-3.

### Plan-rule deviations

**1. Push with non-.planning paths in the open-time diff**
- **Rule in plan:** push only if every listed path is under `.planning/`, otherwise return to the checkpoint.
- **What happened:** the six extra paths were exactly the R1-R4 fixes the operator authorised at the checkpoint, so the push went ahead on that authorisation.

**2. Identity checks not run**
- **Plan step:** download the macOS artifact of the dry run and run the five checks.
- **What happened:** a dry run uploads no artifact (by workflow design; the Phase 85 baseline already noted it). Recorded as `Gate item 4: blocked (...)` with the unblock path; no workflow was dispatched.

## Issues Encountered

- GitHub triggered no CI runs for `0f3e6e9e9` (another session pushed `4e1af5463` seconds later). The proof is taken at `4e1af5463`, which contains every 86-25 commit; its only extra commits are the foreign quick-261123-9i7 pair.
- The Phase 86 release dry run ran at `1a58fe646`, before the url bump; the bump touches only `Cargo.lock`.

## Open Items

- **R5 (deferred by the operator):** `meta/i18nForkTouchedFiles.json` lacks `src/frontend/components/UI/WikiGameInfo/components/HowLongToBeat/index.tsx` (86-23 touched it). `meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT is red locally; CI skips that git-based block in its shallow clone, so CI stays green. Fix: `pnpm gen-i18n-gate-scope` and commit the regenerated file (precedent `ee1995796`). Not done here.
- **Gate item 4 blocked:** needs an operator-authorised `dry_run=false` release run (with the v0.11.0 overwrite caveat above), then the five checks on the downloaded app. 86-26 cannot run item 4 until then.
- **Owed once `src/backend/sidecar/handlers.ts` is clean (foreign-dirty):** pass `requestRustInvoke` to `registerRunnerAuthFlows`, add it to `userDeps()`, make `ClearCacheDeps.requestRustInvoke` required and drop the `canClearWikiCache` guard (flip the absent-path case in `clearCacheWiki.test.ts`) (86-23); delete the inert `infoCaches` / `appRuntime` members on `EnrichmentFlowDeps` and `ShortcutsFlowDeps`, the steamGridSecrets/itadSecrets/miscRuntime leftovers, and shrink `INERT_DEPS_EXEMPT` (86-24).
- The six keyed drift cases (SteamGridDB, ITAD) stay unproved live until the operator runs the drift check with their own keys.

## Self-Check: PASSED

- FOUND: .planning/phases/86-pure-leaf-services/86-VALIDATION.md (## CI proof, ## Signed builds (D-15), one `Gate item 4: blocked` line)
- FOUND (ancestors of HEAD): 5303061fa, dd7872126, 1a58fe646, 0f3e6e9e9, b1910d9f2
- FOUND (ancestors of origin/main): 5303061fa, dd7872126, 1a58fe646, 0f3e6e9e9
