---
phase: 87-engine-wine-and-tools
plan: 68
subsystem: gap-closure-proof-and-signed-build
tags: [gap-closure, svc-02, d-12, d-13, clean-worktree-proof, three-os-ci, signed-build, release-0.13.1, codesign, notarization]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: "the gap plans 87-60..87-67 and 87-70 (their SUMMARY commit lists); 87-58's proof table and CI recipe; 87-59's release/v0.13 recipe and the Phase 86 / 0.13.0 identity"
provides:
  - "87-VALIDATION.md '## Gap closure proof (87-68)': 87-58's 17-step table re-run from a clean worktree at one head P 4cf38d88c, all pass, 62 of 62 SUMMARY commit hashes ancestors"
  - "87-VALIDATION.md '## CI proof (gap closure)': rust-test.yml green on windows, macos and ubuntu at 07b194604 (one Windows red fixed), codecheck.yml, test.yml and Lint green, per-leg golden counts"
  - "87-VALIDATION.md '### Phase 87 gap build (87-68)': the signed and notarized 0.13.1 build (release/v0.13.1, run 45455431706, draft GameLib v0.13.1), identity byte-identical to 0.13.0 and Phase 86, and the line 'Gate (gap build): pending'"
affects: [87-69, 87-verification]

actuals:
  tokens: 4400
  tasks: 3
  commits: 5

plan_head_before: 900a959acd6e512f897dd28b62c5076effce3002
plan_head_after: 2170426dea83fb35cdee7719f5195c580b07f43d
commits: 5

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/87-engine-wine-and-tools/87-68-SUMMARY.md
  modified:
    - .planning/phases/87-engine-wine-and-tools/87-VALIDATION.md
    - .planning/phases/87-engine-wine-and-tools/deferred-items.md
    - meta/backendDiCeilings/frontend-components-ui.json
    - src-tauri/src/engine_log.rs

key-decisions:
  - "Task 2 (checkpoint:decision, gate=blocking-human) was answered by the operator before dispatch, through the orchestrator's question dialog on 2026-11-24, verbatim: choice `push-and-build` = 'Push and dispatch now; allow follow-up CI-fix commits within this plan without asking again'. Executed within its stated preconditions."
  - "The candidate head moved twice, as the plan allows: P = f3a1a361d failed the pre-push gate backend-di-ceilings (87-67's bottleToggle test had no baseline), so P became 4cf38d88c and every step re-ran; the CI Windows red moved the pushed head to 07b194604 (test-only). The release branch is cut from 07b194604 (production code identical to P)."
  - "release/v0.13.1 = main 07b194604 + one version-bump commit (97d6d2052: package.json, src-tauri/Cargo.toml, tauri.conf.json, the gamelib-shell entry of Cargo.lock, one line each), cut in a separate worktree; exactly one release-tauri.yml dispatch with dry_run=false (run 45455431706)."
  - "Gate (gap build) is pending, not blocked: Identifier, leaf authority, chain, TeamIdentifier, spctl and stapler equal, and the designated requirement is byte-identical (sha256 68d712d0...) to the installed 0.13.0 app and the Phase 86 record."

requirements-completed: [SVC-02]

duration: about 2h20m of wall clock (2026-11-25T05:10 to 07:35 NZDT), of which about 55 minutes waiting on CI and the build
completed: 2026-11-25
---

# Phase 87 Plan 68: Gap closure proof, CI proof and the signed 0.13.1 build Summary

**The gap closure (87-60 to 87-67, 87-70) is proven from a clean worktree at one head and on three-OS CI, and a signed, notarized 0.13.1 build containing every gap fix exists with an identity byte-identical to 0.13.0 and Phase 86, so the live re-run (87-69) can start. Getting there found and fixed two real defects the gap plans had left: a missing jest.mock baseline that would have blocked the push, and two Windows-only test failures.**

## Accomplishments

- **Task 1 (tracer): clean-worktree proof.** 87-58's 17-step table, copied verbatim, passes at P `4cf38d88c6009cef56b2f55193c2a5b60568077b` from a `git worktree add --detach` checkout with its own frozen-lockfile install, vite build, SEA sidecar and cold `src-tauri/target`: cargo suites (95, 47, 2956, 381, 341, 870 passed, 0 red), darwin clippy ratchet, ipc-contract check, `pnpm test` (1109 suites, 24298 tests, 0 red), exit and sidecar smokes, the nine pre-push gates and 12/12 planning gates. 62 distinct commit hashes from the SUMMARYs of 87-60..87-67 and 87-70 are all ancestors of P. The worktree was clean and is removed.
- **Task 2: operator decision** recorded (see key-decisions); not asked again.
- **Task 3: CI proof and the signed build.** Two pushes of main (pre-push hook ran both times, never `--no-verify`); rust-test.yml green on macos-latest, windows-latest and ubuntu-latest at `07b194604`, codecheck.yml, test.yml and Lint green; per-leg golden counts recorded (gamelib-wine goldens on all three legs, gamelib-engine goldens on macos and ubuntu, unix-gated on Windows as in 87-58). `release/v0.13.1` built once (run `45455431706`, all three legs green); the aarch64 app is `0.13.1`, signed by Developer ID Application: grayson mitchell (S7U223QWXJ), `spctl` accepted (Notarized Developer ID), stapled, designated requirement sha256 `68d712d0b6d7e715a10a8e79e81b6a50faf2098af411591169238f56d7888b91` equal to the installed 0.13.0 app; the 87-70 op string is present in the shell and sidecar and absent from 0.13.0.

## Scores

| Truth (must_haves) | Result |
|---|---|
| Automated proof at one head P from a clean worktree, after the SUMMARYs exist, every listed commit an ancestor, recorded with every step | met (17 rows, 62 of 62 ancestors) |
| Push only after the checkpoint decision; open-time diff re-measured immediately before the push; pre-push hook runs | met (push 1: only `.planning/` paths between P and HEAD; push 2: exactly the authorised CI fix `src-tauri/src/engine_log.rs`; hook ran both times) |
| D-13: three-leg rust-test.yml green plus codecheck.yml and test.yml, run ids recorded | met (run `45451701819`, legs `138650244730`, `138650245299`, `138650245738`) |
| D-12: `release/v0.13.1` = P + bump in a separate worktree, one dispatch, only the new draft | met |
| Gap build identity recorded with the gate line | met: `Gate (gap build): pending (identities match: ...)` |

## Task Commits

1. **Task 1 (tracer):** `4cf38d88c` fix(87-68): baseline the jest.mock sites of the 87-67 uninstall dialog bottle toggle test (Rule 1, moved P), then `9dda41aaa` docs(87-68): gap closure proof from a clean worktree at one head.
2. **Task 2:** no commit (operator decision, recorded above).
3. **Task 3:** `07b194604` fix(87-68): the 87-61 engine log tests use a path that is absolute on Windows (Rule 1, authorised CI fix), `a73449c80` docs(87-68): three-OS CI proof of the gap closure, `2170426de` docs(87-68): signed Phase 87 gap build 0.13.1, identity and gate line. The release branch commit `97d6d2052` (version bump to 0.13.1) lives on `release/v0.13.1`, not on main.

`commits: 5` is `git rev-list --count 900a959ac..2170426de` (the ledger base is main's HEAD before this plan's first commit; no other session landed commits in that range).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 87-67's `bottleToggle.test.tsx` had no backendDiCeilings baseline, so a pre-push gate was red**
- **Found during:** Task 1 (the pre-push gate set, step 16)
- **Issue:** `pnpm backend-di-ceilings` failed `new violation: src/frontend/components/UI/UninstallModal/__tests__/bottleToggle.test.tsx has 6 (jestMock) and no baseline entry`; the pre-push hook would have blocked the push.
- **Fix:** one entry added to `meta/backendDiCeilings/frontend-components-ui.json` (6), the way `2679311c7` (79-38) baselined new jest.mock suites; the harness is the same plain-function shape as `AboutDialog.test.tsx` (5).
- **Files modified:** `meta/backendDiCeilings/frontend-components-ui.json`
- **Verification:** `pnpm backend-di-ceilings` PASS, the two `backendDiCeilings` jest suites pass (154 tests), then the whole table re-ran at the new P.
- **Commit:** `4cf38d88c`

**2. [Rule 1 - Bug] 87-61's two `engine_log` tests failed on windows-latest**
- **Found during:** Task 3 (run `45447603838`, `cargo test --bin gamelib-shell`: 833 passed, 2 failed)
- **Issue:** both tests pass `"/cx/bin/wineserver"`, which is not absolute on Windows; `engine_bottle_kill_wineserver` refuses a relative path as `bad-args` before it reads the bottle name.
- **Fix:** a helper returning `C:\cx\bin\wineserver` on Windows (the unsafe name is refused before anything spawns, so the path is never run; the tests still run on every leg).
- **Files modified:** `src-tauri/src/engine_log.rs`
- **Verification:** both tests and the shell crate pass locally; rust-test.yml green on all three legs at `07b194604` (windows 835 passed, macos 870, ubuntu 854; Windows clippy ratchet `PASS (win32, toolchain 1.99.1)`).
- **Commit:** `07b194604`

### Plan truths not met as worded

**3. [Contract] The first clean-worktree run was discarded and the harness corrected (not a code defect)**
- A first run set `TMPDIR` to the session scratchpad that held the worktree. `fakeSafetyRust.test.ts` ("refuses to delete a path outside the OS temp dir") then resolved the repo's `src/` as inside the OS temp dir, and the fake performed the real delete: the worktree's whole `src/` (2618 tracked files) vanished during `pnpm test`. Located with an `fs.rmSync` trace, restored with `git checkout -- src`, and every step re-run with the default `TMPDIR`. The main checkout was never exposed. Logged in `deferred-items.md` (82-05/82-19 code; the test is only safe while the checkout is outside `os.tmpdir()`).
- A cold clean worktree has no `.build-tools/zig`; three Meta suites race on one zig download and time out at 180 s on this network (3 min 53 s alone), and `phase70PassthroughCensus` read a transient `meta/runTs.__probe__.cjs` once. All pass with zig present / on re-run; no gap plan involved; logged in `deferred-items.md`. A stale `.eslintcache` from the invalid run also produced false `import-x/no-unresolved` errors until deleted; the final run started from clean caches.

**4. [Contract] The shared `Supply-chain audit` workflow is red** (RUSTSEC-2026-0594, as before 87-58), recorded not fixed; it is not one of the three required workflows.

## Authentication gates

None. Task 2 was a decision gate answered by the operator before dispatch.

## Known Stubs

None. This plan changed a test baseline, one test fixture and planning documents; it added no UI or data wiring.

## Threat Flags

None. No new endpoint, auth path or trust-boundary file access; the version bump touched metadata only.

## Issues Encountered

None open. The Windows and ratchet reds above were fixed in this plan. The working tree's pre-existing dirt (`.planning/state.json`, spikes, debug and todo files, a stray `.dxvk-cache`) belongs to other sessions and was left alone.

## Closing state

`main` was pushed to `origin` through `07b194604` (the later docs commits `a73449c80` and `2170426de` and this SUMMARY are local). `origin/release/v0.13.1` exists at `97d6d2052`; the draft release `GameLib v0.13.1` (8 assets) is the only new release and nothing was published; no tag was created. `/Applications/GameLib.app` is still the signed 0.13.0 build and was not touched. The downloaded artifacts and the proof logs stay under the session scratchpad. Both scratch worktrees are removed.

## Next Phase Readiness

87-69 can run the re-run gate: read `Gate (gap build): pending` in `87-VALIDATION.md`, install 0.13.1 over 0.13.0 on the operator's Mac and score the live items. Install-over source is 0.13.0 (`CDHash 18d7ea76...`), the gap build is `CDHash 266b7378...`.

## Self-Check: PASSED

- FOUND: .planning/phases/87-engine-wine-and-tools/87-VALIDATION.md with `## Gap closure proof (87-68)`, `## CI proof (gap closure)`, `### Phase 87 gap build (87-68)` and the `Gate (gap build): pending` line
- FOUND commits (ancestors of HEAD): 4cf38d88c, 9dda41aaa, 07b194604, a73449c80, 2170426de; `97d6d2052` is on origin/release/v0.13.1
- Task verify commands: Task 1 section present, 0 fail rows, 17 numbered step rows; Task 3 CI section, build subsection and gate line each present once
