---
phase: 88-launch-pipeline
plan: 17
subsystem: phase-proof-and-ci
tags: [phase-proof, three-os-ci, golden-replays, windows, knownfix, svc-03]

requires:
  - phase: 88-launch-pipeline
    plan: 16
    provides: the known-fix TypeScript deleted behind knownFixPortComplete and knownFixSurvivors
  - phase: 88-launch-pipeline
    plan: 01
    provides: 88-HUMAN-UAT.md, the 82 amendments, the D-30 gate model
provides:
  - "## Phase proof (88)" in 88-VALIDATION.md, measured from a clean git worktree add --detach checkout at P 68979200f (P line, seven golden compared/floor lines, the command table, the sweep)
  - "## CI proof (88)" in 88-VALIDATION.md, measured at P' c5ae345ae: rust-test.yml green on windows-latest, macos-latest and ubuntu-latest (run 45533129411), codecheck.yml, test.yml and lint.yml green, and the seven golden test binaries named per leg
  - eight CI-only fix commits (one pre-push hook ratchet, one Linux Node zlib, five Windows legs, one workflow) so the known-fix goldens replay on every OS
affects: [88.1, 88.2, 88.3, 97]

actuals:
  tokens: 9000
  tasks: 3
  commits: 10
commits: 10
plan_head_before: 68979200f2e94c561d869c5997437fb99adcc65e
plan_head_after: 1063508ecf687baf955e2096d2800f5b0e9b575a

tech-stack:
  added: []
  patterns:
    - "a golden replay that compares compressed bytes recorded by one zlib build compares them only where a reference case reproduces them, and always compares what is not compression (tar bytes, headers, round trips, errors)"
    - "a Windows leg that cannot reproduce Node's single ENOENT text accepts the platform's own not-found texts and folds them onto one before comparing; any other text still fails"

key-files:
  created: []
  modified:
    - .planning/phases/88-launch-pipeline/88-VALIDATION.md
    - .github/workflows/rust-test.yml
    - meta/backendDiCeilings/__tests__.json
    - src/backend/__tests__/knownFixLaunchReply.test.ts
    - src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts
    - src-tauri/crates/gamelib-knownfix/tests/golden_launch_overrides.rs
    - src-tauri/crates/gamelib-knownfix/tests/golden_registry.rs
    - src-tauri/crates/gamelib-knownfix/src/overlay/install.rs
    - src-tauri/src/knownfix_dispatch.rs

key-decisions:
  - "Operator decision at Task 2 (checkpoint:decision, blocking-human): option `push` - push now, and allow follow-up fix commits for CI-only failures within this plan without asking again. Recorded as given; every follow-up commit below is a CI-only failure inside this plan's scope, each in its own commit."
  - "The CI proof is at P' (c5ae345ae), not P: the eight fix commits between them are test, workflow or `cfg_attr` changes, listed in the CI proof table; the clean-worktree proof was measured once at P and not repeated, and the plan's open-time property (`git diff --name-only P HEAD` outside .planning is empty) held for the first push attempt and does not hold for the pushes that carried the fixes."
  - "release-tauri.yml (a signed-build workflow, outside this plan) checks out on windows-latest too and has the same long-path exposure rust-test.yml had; it was not changed and is flagged for the operator."

patterns-established: []

requirements-completed: [SVC-03]

coverage:
  - id: D1
    description: "Sub-phase 88 closes on its D-30 gate model: goldens proven from a clean checkout at a named head, and three-OS CI green with the known-fix golden replays observed running on every leg"
    requirement: SVC-03
    verification:
      - kind: integration
        ref: "88-VALIDATION.md '## Phase proof (88)': P 68979200f, cargo test (850 and 888 passed), pnpm test:ci, codecheck, lint, check:ipc-contract, planning-gates"
        status: pass
      - kind: integration
        ref: "88-VALIDATION.md '## CI proof (88)': Rust test run 45533129411 (windows-latest, macos-latest, ubuntu-latest), Code check 45533129281, Test 45533129299, Lint 45533129229, all at c5ae345ae"
        status: pass
    human_judgment: false
  - id: D2
    description: "The deferred decisions are named and not claimed (D-01 builders and funnel, D-02, D-04..D-10, D-16 and D-17 live run, D-23, D-26, D-29, D-31), and 88-HUMAN-UAT.md stays authored and unrun for 88.3"
    requirement: SVC-03
    verification:
      - kind: integration
        ref: "88-VALIDATION.md '### Decisions proven by this plan's evidence, and what is deferred'"
        status: pass
    human_judgment: false

duration: about 3 h 30 min for this continuation (Task 3, almost all of it waiting on seven CI rounds)
completed: 2026-11-25
status: complete
---

# Phase 88 Plan 17: Phase proof and three-OS CI Summary

**Sub-phase 88 is proven twice: from a clean worktree at P (`68979200f`), and on windows-latest, macos-latest and ubuntu-latest in CI at P' (`c5ae345ae`) with all seven known-fix golden replay binaries seen running on every leg. Getting there took eight CI-only fix commits, mostly the Windows leg having never run these tests before.**

## Performance

- **Duration:** Task 1 ran in the first session; this continuation (Task 2 decision, Task 3) took about 3 h 30 min, nearly all of it CI wall time
- **Completed:** 2026-11-25
- **Tasks:** 3 (a tracer, a blocking-human decision and an auto task)
- **Commits:** 10 measured from the ledger (`git rev-list --count 68979200f..HEAD` at SUMMARY write): `44dc97a26` (Task 1), eight fixes, `1063508ec` (Task 3 proof)
- **Files:** 9 changed in `git diff --stat 68979200f HEAD`, 255 insertions, 19 deletions

## Accomplishments

- **Task 1 (tracer), first session.** The phase proof at P is in 88-VALIDATION.md: eleven steps with exits, the seven `golden <name>: compared <n> floor <f>` lines (reader 125/125, launch_overrides 19/19, registry 57/57, overlay_archive 25/25, overlay_install 41/41, fetcher 38/38, report 48/48), the sweep, and the decisions proven and deferred. See the carried-forward deviations below.
- **Task 2 (decision).** The operator chose `push`.
- **Task 3, the push.** Immediately before the first push, `git diff --name-only 68979200f HEAD` listed only `.planning/phases/88-launch-pipeline/88-VALIDATION.md`. Local main was 90 ahead and 0 behind origin and stayed 0 behind. The pre-push hook ran every time (no `--no-verify`, no force).
- **CI proof.** Run 45533129411 (Rust test) is green on all three legs at `c5ae345ae`; Code check, Test and Lint are green at the same head. The table in 88-VALIDATION.md names `golden_reader`, `golden_launch_overrides`, `golden_registry`, `golden_overlay_archive`, `golden_overlay_install`, `golden_fetcher` and `golden_report` as run with `test result: ok` on each OS (T-88-42). Windows lists fewer tests in three binaries because the rest are `cfg(unix)` (symlink seeds).
- **Sign-off.** Three boxes set (all tasks have automated verify, no watch-mode flags, the gamelib-launch and gamelib-knownfix skeletons with their `-p` entries); the sub-phase 88 per-task row gained the CI head.

## Task Commits

1. **Task 1: tracer, clean-worktree proof at P** - `44dc97a26` (docs)
2. **Task 2: authorise the push** - operator choice `push`, no commit
3. **Task 3: three-OS CI proof** - `1063508ec` (docs), preceded by the eight fix commits under Deviations

## Deviations from Plan

### Auto-fixed Issues (Task 3, all authorised by the operator's `push` choice for CI-only failures)

**1. [Rule 1 - Bug] backend-di-ceilings ratchet failed in the pre-push hook**
- **Found during:** the first `git push` (the hook stopped it before anything left the machine)
- **Issue:** `knownFixLaunchReply.test.ts` (88-12) added a `jest.mock` site with no baseline, and `steamBridgeKnownFixes.test.ts` (88-14) no longer had seven, so the shrink-only ratchet failed both ways.
- **Fix:** the test spies on `logWarning` (`jest.spyOn(logger, 'logWarning')`) instead of `jest.mock`, and the baseline for `steamBridgeKnownFixes.test.ts` went 7 to 6. No baseline entry was added.
- **Files modified:** src/backend/__tests__/knownFixLaunchReply.test.ts, meta/backendDiCeilings/__tests__.json
- **Commit:** 5ff66437b

**2. [Rule 3 - Blocking] The Windows checkout failed (exit 128, long paths)**
- **Found during:** Rust test run 45520264955, windows-latest, `actions/checkout`
- **Issue:** the gamelib-knownfix golden case folders are named after the test titles that recorded them (tracked paths up to 248 characters); with the runner prefix `D:\a\GameLib\GameLib\` they pass 260 and git refused to create them.
- **Fix:** a Windows-only step before checkout runs `git config --system core.longpaths true`.
- **Files modified:** .github/workflows/rust-test.yml
- **Commit:** c2e88633e

**3. [Rule 1 - Bug] Five overlay_archive twin cases failed test.yml on Linux**
- **Found during:** Test run 45521558646
- **Issue:** Node's zlib on the Linux runner deflates the same tar to other bytes (134 against 127) than the macOS recording; the twin test compared the gzip size, sha256 and base64. It is the zlib build, not the twin. Rust's replay compares those bytes on all three OSes.
- **Fix:** those three fields are compared only where a reference case reproduces the recorded archive (`exactGzip`); otherwise they are dropped from both sides, and the tar bytes and digest, header fields, gzip header, round trips and errors are always compared. The self-test now plants a `tarSha256`, which is platform-neutral. Verified in both modes locally (266 tests).
- **Files modified:** src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts
- **Commit:** dc0adf728

**4. [Rule 1 - Bug] golden_launch_overrides failed on Windows, two ways**
- **Found during:** Rust test run 45521558786, windows-latest
- **Issue:** `only_enoent_is_recorded_and_no_warning_carries_a_profile_path` ran the symlink cases the replay skips on a non-unix leg and panicked; and Windows words a missing file `os error 2` and a missing folder `os error 3`, while the replay mapped Node's single ENOENT to one probed text.
- **Fix:** that test skips symlink cases on a non-unix leg; `fold_not_found` accepts the platform's two not-found texts and folds them onto the expected one (any other text still fails).
- **Files modified:** src-tauri/crates/gamelib-knownfix/tests/golden_launch_overrides.rs
- **Commit:** a8b3cfcbe

**5. [Rule 1 - Bug] golden_registry `prefixDir` on Windows (two commits)**
- **Found during:** Rust test runs 45523697957 and 45525351981
- **Issue:** `Path::join` writes `\x\pfx` for the recorded `/x/pfx`. My first fix folded separators before `normalise_text` swapped the profile root for its placeholder, which broke the CrossOver bottle path in the same step; the second folds only a path outside the profile root.
- **Files modified:** src-tauri/crates/gamelib-knownfix/tests/golden_registry.rs
- **Commits:** 5205d86be (first, incomplete), 748c0ab8b (corrected)

**6. [Rule 1 - Bug] knownfix_dispatch test expected a slash-joined path on Windows**
- **Found during:** Rust test run 45527404602, `cargo test (Tauri shell crate)`
- **Issue:** `install.join("bin/game.exe")` is `bin/game.exe` on Windows while the answered path is `bin\game.exe`.
- **Fix:** the expectation uses `install.join("bin").join("game.exe")`.
- **Files modified:** src-tauri/src/knownfix_dispatch.rs
- **Commit:** 7f1a76f78

**7. [Rule 1 - Bug] A new `unused_mut` warning on the Windows clippy ratchet**
- **Found during:** Rust test run 45530102549, `cargo clippy ratchet`, windows-latest
- **Issue:** `make_partial_dir`'s `let mut builder` is mutated only in the `cfg(unix)` arm; `unused_mut` has no ceiling, so the ratchet failed.
- **Fix:** `#[cfg_attr(not(unix), allow(unused_mut))]` on that one `let`.
- **Files modified:** src-tauri/crates/gamelib-knownfix/src/overlay/install.rs
- **Commit:** c5ae345ae

### Carried forward from Task 1 (reported by the first agent)

1. The first cold-worktree `pnpm test:ci` had three red suites (`shimAbiGate`, `wireExtendedCompile`, `msvcCallbackBaseLayout`, 32 tests) because `downloadZig()` outran its 180 s hook budget in a cold worktree; after copying the pinned, SHA-256-verified zig 0.16.0 cache all 32 passed. Environmental, 0 red combined (1100 suites, 24436 tests).
2. The plan's literal "`ls src/backend/knownFix*.ts` is empty" cannot hold: `knownFixLaunchReply.ts` (the 88-12 settle helpers) stays by design; the count is 0 with it excluded.
3. `golden_reader` and `golden_registry` print no "compared N" line; n is the `expected/<case>` folder count (125, 57), equal to MANIFEST.
4. Prohibition 1 observations, not claimed as defects: `registry.rs` echoes a rejected registry or dllOverrides entry via `shown()` without `redact_urls`; `launch.rs` echoes a rejected exeOverride. The prohibition stays `unresolved`.
5. Not run (not in 88-17's list): the clippy ratchet at P, `smoke:*`, `cargo fmt` (`ipc_contract.rs` is rustfmt-unclean at HEAD; `clippy -D warnings` fails at HEAD on unrelated files). The clippy ratchet did run in CI at P' on all three legs and is green.

The operator reviewed and kept 88-16's re-point of the three `meta/` overlay-archive scripts onto `launchrust/knownFixTwins.ts`.

## Items for the operator

- **Supply-chain audit is red** on this push (45533129405) and on the previous one (45451702304 at `07b194604`). It is not one of 88-17's required workflows and was not investigated or touched.
- **release-tauri.yml** checks out on `windows-latest` and would meet the same long-path checkout failure that `rust-test.yml` did. It was left alone (a signed-build workflow, outside this plan); the same `git config --system core.longpaths true` step before its checkout would do.
- The clean-worktree proof was measured at P and not repeated at P'; the CI run at P' (full Jest on Linux in test.yml, the Rust crates on three OSes) covers the eight commits between them. `pnpm test:ci` was not re-run locally at P'.
- Windows runs the non-unix arm of `golden_launch_overrides` (15 cases, symlink cases skipped) and does not run the `cfg(unix)` tests; the Windows golden coverage is that, not the full 19.

## Known Stubs

None.

## Threat Flags

None. The only new CI surface is one `git config --system core.longpaths true` step on the Windows leg of `rust-test.yml`, which runs before checkout and carries no secret or network access.

## Prohibitions

All seven prohibitions keep their `unresolved` status from the plan (spec-less fallback, no wired check descriptor); nothing in this plan changes shipped behaviour or adds a log line, and none was found violated.

## Self-Check: PASSED

- 88-VALIDATION.md has `## Phase proof (88)` and `## CI proof (88)`; both Task `<verify>` awk checks pass (`CI PROOF OK`), `pnpm planning-gates` 12/12.
- Every fix commit is an ancestor of HEAD and on `origin/main` (pushed up to `c5ae345ae`; `1063508ec` and this SUMMARY follow).
