---
phase: "88"
slug: "launch-pipeline"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
# nyquist_compliant covers sub-phase 88's rows (validate-phase 88, 2026-11-25); the 88.1–88.3 rows stay pending and are re-audited when those sub-phases run validate-phase against this shared file
nyquist_compliant: true
wave_0_complete: false
created: "2026-11-24"
---

# Phase 88 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `88-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7 (TS oracle, shims, gates) and `cargo test` (Rust replay, units, orphan harness) |
| **Config file** | `src/backend/jest.config.js`; per-crate Cargo |
| **Quick run command** | `pnpm jest src/backend/launchOracle src/backend/__tests__/launch --silent` ; `cd src-tauri && cargo test -p gamelib-launch -p gamelib-knownfix` |
| **Full suite command** | `pnpm test:ci` ; `cd src-tauri && cargo test -p gamelib-safety -p gamelib-testutil && cargo test -p gamelib-proc && cargo test -p gamelib-launch -p gamelib-knownfix -p gamelib-info -p gamelib-engine -p gamelib-wine && cargo test --bin gamelib-shell` ; `pnpm check:ipc-contract` ; `pnpm planning-gates` |
| **Estimated runtime** | ~600 seconds (full); ~90 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** the touched crate's `cargo test -p <crate>` plus the touched Jest folder; `npx prettier --check` over the exact written paths (check `--file-info` first; omit over prettier-ignored paths such as `.planning`).
- **After every plan wave:** the full Rust set, `pnpm test:ci`, `pnpm codecheck`, `pnpm lint`, `pnpm check:ipc-contract`.
- **Before `/gsd-verify-work`:** full suite green on three-OS CI, then `88-HUMAN-UAT.md` on the signed build, run by a plan other than its author.
- **Vacuous-pass guard on every golden:** floor in the test file and in `MANIFEST.json`, one `expected/` folder per case, an empty case list must fail, and a pairwise-coverage assertion (every legal pair present).
- **Max feedback latency:** 120 seconds (quick set).
- **Gate model (D-30):** 88, 88.1 and 88.2 close on goldens plus three-OS CI with no signed build and no operator session; only 88.3 builds the signed Phase 88 build and runs `88-HUMAN-UAT.md` over the signed Phase 87 gap build.

---

## Per-Task Verification Map

Filled in by the planner/executor per task. Requirement-level map; the Sub-phase column names the sub-phase that proves the row (88, 88.1, 88.2, 88.3, or "all" for a row every sub-phase must keep green):

| Req / SC | Sub-phase | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|-----------|----------|-----------|-------------------|-------------|--------|
| SVC-03 / SC1 | 88.1 | builders match TS vectors (env, wrappers, gamescope, known-fix env, prepare ops) | Rust replay of TS vectors | `cargo test -p gamelib-launch --test golden_builders` | ✅ | ✅ green at P `21a57af08` with 124 cases (88.1-21..24; was P `ab7876c01` at 113, 88.1-20; three-OS CI pending the push) |
| SVC-03 / SC1 | 88.1 | spawn traces: native, Wine/Proton/CrossOver, gamescope/mangohud, overlay, pre/post (argv, full env, cwd, class, order) | Rust replay of TS traces | `cargo test -p gamelib-launch --test golden_launch` | ✅ | ✅ green (P `ab7876c01`, 88.1-20; three-OS CI pending the push) |
| SVC-03 / SC1 | 88 | known-fix reader, layering, registry, overlay archive/install, fetch | replay + ported incident tests | `cargo test -p gamelib-knownfix` | ✅ | ✅ green (P `68979200f`, 88-17; three-OS CI green at P' `c5ae345ae`) |
| SVC-03 / SC1 | 88.2 | runner command argv/env, redacted log line, streamed line sequence | replay | `cargo test -p gamelib-launch --test golden_runner` | ✅ | ✅ green at P `6a2265258` (golden_runner 93 of 93, redaction 88, wine_launch 41 plus 16 wine_command, wine_path 16, script 18, spawn_async 33, error_handler 108; three-OS CI green at P' `25bc3b526`: rust-test.yml run 45959503130, all three legs, see `## CI proof (88.2)`) |
| SVC-03 / SC2 | 88.3 | funnel order, status events, single-flight join, release on failure | funnel oracle replay | `cargo test -p gamelib-launch --test funnel` | ❌ W0 | ⬜ pending |
| SVC-03 / SC2 | 88.2 | stub game: start, quit-kill, survives parent SIGKILL (three OS) | CI smoke + orphan harness | `cargo test -p gamelib-proc` ; `cargo test -p gamelib-launch --test stub_game` | ✅ | ✅ green at P `6a2265258` on macOS (gamelib-proc 60 passed; stub_game 5 passed) and on three-OS CI at P' `25bc3b526` (rust-test.yml run 45959503130: stub_game 5 passed on each leg; gamelib-proc orphans 9 on windows-latest including the A5 arm, 13 on macos-latest and ubuntu-latest) |
| SVC-03 / SC2 | 88.3 | stub game: single-flight join through the funnel (three OS, D-04, D-16) | CI smoke | `cargo test -p gamelib-launch --test stub_game` | ❌ W0 | ⬜ pending |
| SVC-03 / SC2 | 88.2 | Windows quoting against a real exe | Windows-leg cross-check | `cargo test -p gamelib-launch --test windows_quoting` | ✅ | ✅ green on windows-latest at P' `25bc3b526` (2 passed, rust-test.yml run 45959503130); the binary runs 0 tests on macOS and Linux by design, so Windows CI is the only evidence |
| SVC-03 / SC2 | 88.3 | live: launches, single flight + quit (D-27 game-running prompt), Force Quit survival + re-adopt, known fix + scripts | operator, signed build | `88-HUMAN-UAT.md` | ✅ authored by 88-01 (not yet run) | ⬜ pending |
| SVC-03 / SC3 | 88.1 | anti-cheat at launch; utils pieces (`errorHandler`, `askForceUninstall`, `isEpicServiceOffline`, `isMacSonomaOrHigher` both ways, `removeQuoteIfNecessary`, D-28 `check_wine_before_launch`/`download_default_wine`; `errorHandler` and `askForceUninstall` land with 88.2's runner, per the 82 amendment) | replay + unit | `cargo test -p gamelib-launch --test utils_pieces` | ✅ | ✅ green (P `ab7876c01`, 88.1-20; three-OS CI pending the push) |
| SVC-03 / SC4 | 88.3 | TS and registrations deleted, only scheduled shims remain | Jest gate | `pnpm jest src/backend/__tests__/launchPortComplete.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts` | ❌ (gate new) | ⬜ pending |
| D-08/D-10 | 88.3 | re-adoption (pid + start match, reused pid no match, stale record removed, exit playtime + after-script) | Rust tests | `cargo test -p gamelib-launch --test readopt` | ❌ W0 | ⬜ pending |
| D-19 | all | channel parity and IPC snapshot | gen + Jest | `pnpm check:ipc-contract` | ✅ | ✅ green at 88 (P `68979200f`, 88-17); stays a per-sub-phase row |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/backend/launchOracle/` harness (record/compare modes, spawn tracer reuse, pairwise generator, classes file) and manifests (88-04: landed at `src/backend/testUtils/launchOracle/`; base env, probes, pairwise with coverage proof, spawn-class check)
- [x] `src-tauri/crates/gamelib-launch/` and `gamelib-knownfix/` skeletons, `-p` entries in `.github/workflows/rust-test.yml` (88-17: both crates build and test green on three OSes in run 45533129411)
- [ ] stub game binary (model on `gamelib-proc/src/bin/standin.rs`) and Windows CommandLine-echo stub
- [ ] `gamelib-proc` additions with orphan-harness arms (Windows `start_time`, Game job, tree kill)
- [x] `88-HUMAN-UAT.md`, SC2 amendment, `82-STATE-OWNERSHIP.md` amendment (D-24, D-28) (88-01: the contract and both 82 amendments are written; the D-16 wording was already in ROADMAP 88.3 success criterion 3)
- [ ] `launchPortComplete.test.ts` (forbidden symbols, intended survivors, file-walk floor)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real game launch on macOS (CrossOver/engine, native), single flight, quit prompt, Force Quit survival and re-adoption, known fix + scripts | SVC-03 SC2, D-08, D-27 | needs the operator's Mac, signed build and real games | `88-HUMAN-UAT.md` (D-17), authored by 88-01 and run only by the 88.3 live-gate plan, never by its author |

---

## Phase proof (88)

Measured by plan 88-17 Task 1, 2026-11-25, from a clean `git worktree add --detach` checkout (under the session scratchpad, removed
afterwards) with its own `pnpm install --frozen-lockfile`, `pnpm exec vite build`, `pnpm build:sidecar-sea` and a cold `src-tauri/target`.
The candidate head is main's HEAD after the 88-16 SUMMARY commit; the two machine-checked line shapes follow.

P: 68979200f2e94c561d869c5997437fb99adcc65e

Ancestry: 67 distinct commit hashes found in the 88-01..88-16 SUMMARYs resolve in this repository and every one is an ancestor of P
(`git merge-base --is-ancestor`, 0 exceptions). SUMMARYs 88-01..88-16 all exist.

| Step | Command (run at P, in the clean worktree) | Exit | Outcome at P |
|------|--------------------------------------------|------|--------------|
| 1 | `pnpm install --frozen-lockfile` | 0 | pass |
| 2 | `pnpm exec vite build` | 0 | pass |
| 3 | `pnpm build:sidecar-sea` | 0 | pass (arm64 SEA sidecar built) |
| 4 | `cargo test -p gamelib-knownfix -p gamelib-knownfix-cli -p gamelib-launch -p gamelib-launch-cli -p gamelib-engine -p gamelib-wine` | 0 | pass, 850 passed, 0 red, 0 ignored |
| 5 | `cargo test --bin gamelib-shell` | 0 | pass, 888 passed, 0 red, 2 ignored |
| 6 | `pnpm check:ipc-contract` | 0 | pass (ipc_contract.rs and ipcSchemaSnapshot.json up to date) |
| 7 | `pnpm planning-gates` | 0 | pass, 12/12 |
| 8 | `pnpm codecheck` (main and meta projects) | 0 | pass |
| 9 | `pnpm lint` | 0 | pass, 0 errors, 3 warnings (fixable with `--fix`) |
| 10 | `pnpm test:ci` (first run, cold worktree) | 1 | 1097 suites passed, 6 skipped, 3 failed; 24404 tests passed, 32 failed, 41 skipped. The three red suites are `meta/__tests__/shimAbiGate`, `wireExtendedCompile` and `msvcCallbackBaseLayout`: each `beforeAll` calls `downloadZig()` with a 180 s hook budget and a cold worktree has no `.build-tools/zig`, so the 52 MB pinned zig download outran the budget (three suites also raced one tarball path). The failures are `Exceeded timeout of 180000 ms for a hook`, nothing to do with sub-phase 88 |
| 11 | the same three suites re-run with `.build-tools/zig` (gitignored cache of the pinned, SHA-256-verified zig 0.16.0, same `.zig-version`) copied in from the main tree | 0 | 3 suites passed, 32 tests passed (the 32 that were red) |

`pnpm test:ci` therefore stands at 1100 suites passed (6 skipped) and 24436 tests passed (41 skipped), 0 red, across steps 10 and 11. The
clippy ratchet, `pnpm smoke:*` and the rest of the pre-push gate set are not in 88-17's command list and were not re-run here; `cargo fmt`
and `cargo clippy -p gamelib-shell -D warnings` are known to fail at HEAD on unrelated files (the generated `ipc_contract.rs` and others)
and were not run.

Golden replays at P (cargo output of `cargo test -p gamelib-knownfix --test golden_<name> -- --nocapture`; the compared count is the number the
test printed, the floor is the constant in its Rust test file). `golden_reader` and `golden_registry` do not print a compared count; their
`n` is the number of `expected/<case>` folders at P (125 and 57), which the test compares one for one and passes only when none differs,
and each equals the `MANIFEST.json` count. `golden_launch_overrides` floor is the unix arm (19; the non-unix arm is 15).

golden reader: compared 125 floor 125
golden launch_overrides: compared 19 floor 19
golden registry: compared 57 floor 57
golden overlay_archive: compared 25 floor 25
golden overlay_install: compared 41 floor 41
golden fetcher: compared 38 floor 38
golden report: compared 48 floor 48

### Sub-phase 88 sweep at P

- `ls src/backend/knownFix*.ts` lists exactly one file, `src/backend/knownFixLaunchReply.ts`: the 88-12 settle helpers that the launcher, the three
  managers and the Steam bridge use, kept on purpose (88-16 deviation 6). All eight known-fix TypeScript modules the 88-16 delete gate names are
  absent and `knownFixPortComplete` is green. The plan's literal "is empty" does not hold and cannot: it predates `knownFixLaunchReply.ts`.
  The Task 1 `<verify>` count is therefore measured with that one kept file excluded (see the deviation in 88-17-SUMMARY.md).
- `src/backend/launchrust/knownFix*.ts`: `knownFixes.ts` (7 shim rows) and `knownFixTwins.ts` (9 twin rows), 16 in all; `knownFixSurvivors` is green
  (exports against `SCHEDULE` in both directions) and `rowsDueIn(SCHEDULE, 88)` is `[]`, each row's `deletedBy` is 88.1, 92, 93 or 97.
  `launchPortComplete.test.ts` and `engineWineShimSchedule.test.ts`: 164 tests passed at P.
- `88-HUMAN-UAT.md` is present with four items, each `result: pending` (authored by 88-01, unrun, waiting for 88.3).
- gamelib.log lines added by `gamelib-knownfix` (prohibition 1): 33 call sites of `ctx.log_warn` / `ctx.log_info` plus the reader's one `log.warn`, all through
  the engine's `EngineLog`. No line formats a URL, query, header, token, account name or a profile path: the interpolated values are the
  label and fixed phrases, a store-file base name, an app name or file name, an overlay id, a status code, an appId and key/op words, a
  `FetchError` (a category only: `network`, `status(n)`, `aborted`, ... never a URL, T-87-09), a reason string, and, for rejected entries, the entry
  JSON cut at 512 UTF-16 units. Observations, none claimed as a defect here: `registry.rs` echoes a rejected registry or dllOverrides entry
  through `shown()` without the `redact_urls` pass that `overlay/env.rs` applies to overlay entries, and `launch.rs` echoes a rejected
  `exeOverride` value; both are golden-compared parity lines (D-11) over known-fix data, not user profile paths, and the engine's redactor
  still holds the line to its rule. The prohibition stays `unresolved` in the plan (no wired check descriptor).

### Decisions proven by this plan's evidence, and what is deferred

D-03, D-11..D-15, D-17 authoring, D-18, D-19, D-20, D-21, D-22, D-24, D-25, D-28 (82 amendments) and D-30 (the split and the gate model) are
carried by the goldens and gates above. Deferred by D-30 and not claimed: D-01 builder shims and the async ripple, D-28's ports of
`check_wine_before_launch` and `download_default_wine`, anti-cheat and system info (88.1); D-02 command runner and streaming shim, D-05 Game-class
spawns, D-06 as amended by D-27, D-07, D-26's ManagerHooks transport, D-29's capture file (88.2); D-01 funnel, D-04, D-08..D-10, D-16 and D-17's
live run, D-23 funnel events, D-26's full hooks, D-29's single log writer and resume todo, D-31 (88.3).

Flagged assumption (spec-less edge probe): SVC-03's edge-coverage row is `unclassified` and unresolved; the D-14 matrix stands in for edge
coverage and is not claimed as a verified edge.

## CI proof (88)

Measured by plan 88-17 Task 3, 2026-11-25, after the operator chose `push` in Task 2 (push now; follow-up fix commits for CI-only failures
allowed without asking again). The open-time check ran immediately before the first push: `git diff --name-only 68979200f HEAD` listed only
`.planning/phases/88-launch-pipeline/88-VALIDATION.md`. The pre-push hook ran on every push (no `--no-verify`, no force); main was 90 commits ahead
and 0 behind origin, and stayed 0 behind.

The first push did not go out: the hook's `backend-di-ceilings` step failed on two things 88-12 and 88-14 had left (a new `jest.mock` site and a
baseline that should have shrunk), so a fix was committed first. The first CI runs then found further CI-only failures (one on Linux, the rest on the Windows leg), each fixed
in its own commit (listed below). The candidate head the proof below ends on is P' and CI ran every row below at that one head.

P': c5ae345ae7b88c80891c24ee859a5a1556c5c747

| Workflow | Leg | Run id | Conclusion |
|----------|-----|--------|------------|
| rust-test.yml | windows-latest | 45533129411 | success |
| rust-test.yml | macos-latest | 45533129411 | success |
| rust-test.yml | ubuntu-latest | 45533129411 | success |
| codecheck.yml | ubuntu-latest | 45533129281 | success |
| test.yml | ubuntu-latest | 45533129299 | success |
| lint.yml | ubuntu-latest | 45533129229 | success |

The three rust-test.yml legs are the three jobs of the one run 45533129411 (job ids 138933132124 windows, 138933132166 macos, 138933131853 ubuntu),
at P'. The multi-crate `cargo test -p ... -p gamelib-knownfix -p gamelib-launch ...` step, `cargo test (Tauri shell crate)` and the per-platform
`cargo clippy` ratchet are green on all three.

Golden test binaries observed running in each rust-test leg's log (`Running tests/golden_<name>.rs` followed by `test result: ok`, 0 failed). The
test counts differ by OS because a few tests are `cfg(unix)` (the Windows leg has one fewer in `golden_registry`, `golden_overlay_install` and
`golden_fetcher`), and the Windows leg replays the non-unix arm of `golden_launch_overrides` (15 cases, the floor's non-unix arm, symlink cases skipped):

| Binary | windows-latest | macos-latest | ubuntu-latest |
|--------|----------------|--------------|---------------|
| golden_reader | ok, 6 passed | ok, 6 passed | ok, 6 passed |
| golden_launch_overrides | ok, 3 passed | ok, 3 passed | ok, 3 passed |
| golden_registry | ok, 8 passed | ok, 9 passed | ok, 9 passed |
| golden_overlay_archive | ok, 4 passed | ok, 4 passed | ok, 4 passed |
| golden_overlay_install | ok, 5 passed | ok, 6 passed | ok, 6 passed |
| golden_fetcher | ok, 3 passed | ok, 4 passed | ok, 4 passed |
| golden_report | ok, 9 passed | ok, 9 passed | ok, 9 passed |

Commits between P (`68979200f`) and P', all in this plan and all CI-only (no shipped behaviour changed; `git diff --name-only P P'` lists
`.planning/`, `.github/workflows/rust-test.yml`, `meta/backendDiCeilings/__tests__.json`, two Jest test files and, in Rust, three test files, one
`#[cfg_attr]` on one `let` in `overlay/install.rs` and one test expectation in `src-tauri/src/knownfix_dispatch.rs`):

| Commit | What the CI or the hook found | Fix |
|--------|-------------------------------|-----|
| 5ff66437b | pre-push `backend-di-ceilings`: `knownFixLaunchReply.test.ts` added a `jestMock` site, `steamBridgeKnownFixes.test.ts` baseline 7 should be 6 | the test spies on `logWarning`; baseline lowered to 6 |
| c2e88633e | Windows checkout exit 128: golden case folder paths pass 260 characters with the runner prefix | `git config --system core.longpaths true` before checkout, Windows leg only |
| dc0adf728 | test.yml (Linux Node): 5 `overlay_archive` twin cases, gzip bytes differ from the macOS recording (134 against 127 bytes) | the gzip-only fields are compared where a reference case reproduces; tar bytes, headers, round trips and errors always compared; Rust still compares the gzip bytes on all three OSes |
| a8b3cfcbe | Windows `golden_launch_overrides`: the ENOENT pin ran symlink cases the replay skips; Windows words a missing file `os error 2` and a missing folder `os error 3` | skip symlink cases in the pin; fold the two accepted not-found texts onto the expected one |
| 5205d86be, 748c0ab8b | Windows `golden_registry`: `prefixDir` proton answer `\x\pfx` for the recorded `/x/pfx` | fold separators for a path outside the profile root (the first attempt folded before the root swap and broke the bottle path; the second corrected it) |
| 7f1a76f78 | Windows `cargo test (Tauri shell crate)`: `knownfix_dispatch` expected `bin/game.exe` joined by a slash literal | the expectation joins `bin` then `game.exe` |
| c5ae345ae | Windows clippy ratchet: a new `unused_mut` (no ceiling) in `overlay/install.rs` | `#[cfg_attr(not(unix), allow(unused_mut))]` on that one `let` |

Not claimed here and not in the plan's list: the `Supply-chain audit` workflow is red on this push (run 45533129405) and was red on the
push before it (45451702304, at `07b194604`); it is not one of 88-17's required workflows and was not touched. `release-tauri.yml` also
checks out on `windows-latest` and would hit the same long-path checkout failure that `rust-test.yml` did; it was not changed (outside this
plan) and is flagged in 88-17-SUMMARY.md. The clean-worktree proof above was measured at P; the CI proof is at P', and the commits between them
are the table above.

## Phase proof (88.1)

Measured by plan 88.1-20 Task 1, 2026-11-26, from a clean `git worktree add --detach` checkout (under the session scratchpad, removed
afterwards) with its own `pnpm install --frozen-lockfile`, `pnpm exec vite build`, `pnpm build:sidecar-sea` and a cold `src-tauri/target`,
macOS arm64 only (Windows and Linux are proven by CI, D-30). The candidate head is the commit that fixes the one lint error this very
measurement found (see the table, step 9); the two machine-checked line shapes follow.

P: ab7876c019b85ccb2d995608da6c42d7ebc91f0e

Ancestry: the SUMMARYs 88.1-01..88.1-19 all exist. 83 distinct tokens in them resolve to commits in this repository and every one is an
ancestor of the first measured head `7b092f2c5` (`git merge-base --is-ancestor`, 0 exceptions); P is `7b092f2c5` plus one commit
(`ab7876c01`, `src/common/types/ipc/settings.ts`, one deleted import line). Steps 4 and 5 were first run at `7b092f2c5` and re-run at P with
identical counts (the Rust sources are identical at both).

| Step | Command (run in the clean worktree) | Exit | Outcome at P |
|------|--------------------------------------|------|--------------|
| 1 | `pnpm install --frozen-lockfile` | 0 | pass (run at `7b092f2c5`; the lockfile and package.json are identical at P) |
| 2 | `pnpm exec vite build` | 0 | pass (re-run at P) |
| 3 | `pnpm build:sidecar-sea` | 0 | pass (re-run at P, arm64 SEA sidecar built) |
| 4 | `cargo test -p gamelib-launch -p gamelib-launch-cli -p gamelib-info -p gamelib-info-cli -p gamelib-knownfix -p gamelib-engine -p gamelib-wine` | 0 | pass, 1405 passed, 0 failed, 0 ignored (summed over every test binary, `-- --nocapture`) |
| 5 | `cargo test --bin gamelib-shell` | 0 | pass, 1009 passed, 0 failed, 2 ignored |
| 6 | `pnpm check:ipc-contract` | 0 | pass (ipc_contract.rs and ipcSchemaSnapshot.json up to date) |
| 7 | `pnpm planning-gates` | 0 | pass, 12/12 |
| 8 | `pnpm codecheck` (main and meta projects) | 0 | pass |
| 9 | `pnpm lint` | 0 | pass at P: production 787 warnings against a ceiling of 1130, tests 578 against 661, 0 errors. At `7b092f2c5` it exited 1 with one error, `@typescript-eslint/no-unused-vars` on `optionalArg` in `src/common/types/ipc/settings.ts` (88.1-10 deleted its last two users); `ab7876c01` removes the import |
| 10 | `pnpm find-deadcode` | 0 | pass (310 baselined knip findings) |
| 11 | `pnpm test:ci` | 1 | 1108 suites passed, 5 skipped, 4 failed; 25524 tests passed, 39 skipped, 8 failed. The same four suites failed at `7b092f2c5` and at P (table below). `.build-tools/zig` was copied in from the main tree before the run, so the zig-download suites that timed out cold in 88-17 passed |
| 12 | `pnpm jest src/backend/__tests__/launchPortComplete.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts` | 0 | pass, 2 suites, 262 tests |

The four red `pnpm test:ci` suites, none of them 88.1's and each on the operator's known-unrelated list: `meta/__tests__/genI18nGateScope`
(1 test, the A-17 anti-rot comparison against the upstream merge-base), `meta/__tests__/loginWindowSeamPredicateRemoved` (1 test, the
`src/backend/humble` zero-match scope), `src/backend/storeManagers/steam/bridge/drm/__tests__/valveClient` (1 test, `rejects a symlink entry`)
and `src/backend/testUtils/shortcutsIconGeometry/__tests__/iconGeometry.oracle` (5 tests, the macOS `sips` geometry oracle). `pnpm test:ci`
is therefore **red at P**, and this plan does not claim it green; every other suite, including every 88.1 gate, passed. Not run here:
`cargo clippy` and `cargo fmt` (known red on `login_window/*`, `store_embed/state.rs`, `native_gamepad_shape.rs`, `shell_state.rs` and the
generated `ipc_contract.rs`, none touched by 88.1), `pnpm smoke:*` and the pre-push hook's other steps; the hook runs at the push.

Test binaries observed running in step 4 (all `test result: ok`, 0 failed): `golden_builders` (5 tests), `golden_launch` (8 tests in
gamelib-launch and 4 in gamelib-launch-cli), `utils_pieces` (6), `golden_sysinfo` (3), `sysinfo_host` (5). `stub_gamescope` ran 0 tests on
this macOS leg, as it must (it is Linux-only); its first real run is the ubuntu CI leg (Task 3).

Golden replays at P (the cargo output of step 4; the compared count and the floor are the two numbers each test printed, copied here).
`prepare_launch` printed `compared 582 (linux 379) of 582 floor 582` and `prepare_wine` printed `compared 391 (linux 207, mac 184) of 391
floor 391; both halves replayed in 361 (floor 361)`; the machine-checked lines carry the totals:

golden builders: compared 113 floor 113
golden gamescope: compared 65 floor 65
golden prepare_launch: compared 582 floor 582
golden prepare_wine: compared 391 floor 391
golden epic_status: compared 70 floor 70
golden check_wine: compared 49 floor 49
golden sysinfo: compared 94 floor 94

### Sub-phase 88.1 sweep at P

- `git ls-files src/backend/utils/systeminfo` lists nothing and `src/backend/gamescopeCommand.ts` does not exist.
- `launchPortComplete.test.ts` (its `buildersPortComplete`, `systemInfoPortComplete` and `buildersSurvivors` checks) and
  `engineWineShimSchedule.test.ts` pass (step 12), and `rowsDueIn(SCHEDULE, 88.1)` is `[]` (asserted at `launchPortComplete.test.ts:552`
  and `engineWineShimSchedule.test.ts:1951`).
- gamelib.log lines added in `gamelib-launch` (prohibition 1): every call goes through `ctx.engine.log` (`log.info/warn/error`). The lines are
  fixed text, with these interpolations only: the wine version name (`Changing wine version to {name}`, `Wine version {selected_name} is not
  valid`), a `{label}` and a tool name (`The {tool} install failed: {category}`), a `FetchError`/discovery category word (`Failed to get epic
  service status with {category}`; the wine discovery `{reason}` is a category word, never the rejection text) and the gamescope warning with
  the flatpak runtime version. No line formats a URL, query, header, token, account name, hostname or profile path. The new `gamelib-info`
  sysinfo tree (`src-tauri/crates/gamelib-info/src/sysinfo`) has no logging call at all. The prohibition stays `unresolved` in the plan (no wired
  check descriptor).
- Behaviour changes carried forward from the SUMMARYs, none claimed as parity: an unresolvable runner binary reads `invalid` (88.1-10); a failed
  sysinfo read no longer rejects prepare (88.1-11); `clearCache` no longer clears the pci.ids caches (88.1-18); the DiscordRPC toggle is inert and
  a todo is filed (88.1-19).

### Behaviour changes (88.2)

- The pending-operations quit dialog now also opens when the Rust running-game registry reports a running game, and Yes ends that game's
  tree through gamelib-proc, after the teardowns and `killAllTracked` and before `abortAll` (D-27, amending D-06; scored by 88-HUMAN-UAT.md
  item 2 in 88.3). A failed registry read asks. Leader death is unchanged: a run is registered until its leader is reaped, so a
  launcher-style game whose leader exits while a grandchild lives reads as no longer running and is not asked about or killed here, the
  same as the TS-tracked child it replaces.
- Not in 88.2: recording playtime at the kill and running the after-launch script at the next boot (D-31, 88.3); a quit-killed game's TS
  funnel tail does not finish before the sidecar exits.

### Per-task map: 88.1 rows

The three 88.1 rows of the Per-Task Verification Map above are set to green at P (`golden_builders`, `golden_launch`, `utils_pieces`); the D-19
row stays per-sub-phase and `pnpm check:ipc-contract` is green at P (step 6).

### Decisions proven by this plan's evidence, and what is deferred

D-01 (the builder and prepare shims, the async ripple, `deletedBy` 92 rows), D-11..D-15 (TS-recorded goldens, pinned env, injected platform,
pairwise plus named incidents, incident titles as cases), D-18 (no rollback flag), D-19 (native `getSystemInfo` and
`copySystemInfoToClipboard`, no fallback), D-20 (quirk todos with triage keys), D-21 (Helper spawns through gamelib-proc seams), D-22 (fake
HOME everywhere), D-23 (`gameStatusUpdate` names and payloads), D-24 (pci and system-info owner moved to gamelib-info), D-25 (goldens before
Rust, TS deleted at the end), D-28 (`check_wine_before_launch` and `download_default_wine`) and D-30 (the gate model and interim states) are
carried by the goldens and gates above. Deferred by D-30 and not claimed: D-02 command runner and streaming shim, D-05 Game-class spawns,
D-06 as amended by D-27, D-07 running-game registry, D-26's ManagerHooks transport, D-29 capture file (88.2); D-04 single flight, D-08, D-09
and D-10 re-adoption, D-16 and D-17's live run, D-26's full hooks (which also replace 88.1's interim launch adapters), D-29's single per-game
log writer, D-31 (88.3); D-03 was 88's.

Flagged assumption (spec-less edge probe): SVC-03's edge-coverage row is `unclassified` and unresolved; the D-14 matrix stands in for edge
coverage and is not claimed as a verified edge. Items the sub-phase leaves open: 88.1-02/03 narrowed "pairwise within each cell" to pairwise
within suites (pairs straddling suites are not enumerated); the Linux `stub_gamescope` smoke has never run on Linux (only through a
temporary cfg on macOS) and its first real run is the ubuntu leg; the Windows sysinfo and DNS code is only cross-clippy'd, and option A (the
in-repo UDP TXT query, operator-chosen) has no TCP fallback and is IPv4-only on Windows resolvers.

edge-coverage SVC-03 88.1: accepted (operator, 2026-11-26)

The row is now classified as an accepted narrowing of the D-14 matrix as executed (per-axis plus pairwise within suites plus named
incidents), recorded as the `overrides:` entry on truth 2 of `88.1-VERIFICATION.md`. The CR-01 class of escape (a missing platform axis)
is covered by 88.1-21's Windows `{}` setupEnvVars case and 88.1-22's per-platform setupEnvVars and Windows wine-env cases. The other items
the sub-phase left open, listed above, are unchanged.

## CI proof (88.1)

Measured by plan 88.1-20 Task 3, 2026-11-26, after the operator chose `push` in Task 2 (push now; follow-up fix commits for CI-only failures
allowed without asking again). The operator saw that the push was a fast-forward of 234 commits to origin/main (67 of them 88.1's, the rest from
other sessions: phase 94 Humble and shortcuts, phase 87 gap closure, phase 88 closeout, quick tasks) and that `pnpm test:ci` is red only on four
known-unrelated suites (`genI18nGateScope`, `loginWindowSeamPredicateRemoved`, `valveClient`, `iconGeometry.oracle`). The open-time check ran
immediately before the first push: `git fetch origin`, origin/main (`c5ae345ae`) an ancestor of HEAD, and `git diff --name-only ab7876c01 HEAD`
listing only `.planning/phases/88-launch-pipeline/88-VALIDATION.md`. Every push was a plain `git push origin main` through `.husky/pre-push`
(no `--no-verify`, no force) and a fast-forward each time.

The first push did not go out: the hook's `backend-di-ceilings` and `gameinfo-narrowing-ceiling` steps and its `i18n --fail-on-update` step were
red at P (see the first row of the fix table). Six more fixes followed, each found by a CI leg and each in its own commit. The candidate head the
proof ends on is P', and every row below ran at that one head (the two later commits on main are `.planning/` only).

P': 940bd9e73ca27cc7ac12e7c4e00e00ce07a1f42c

| Workflow | Leg | Run id | Conclusion |
|----------|-----|--------|------------|
| rust-test.yml | windows-latest | 45735482194 | success |
| rust-test.yml | macos-latest | 45735482194 | success |
| rust-test.yml | ubuntu-latest | 45735482194 | success |
| codecheck.yml | ubuntu-latest | 45735482187 | success |
| test.yml | ubuntu-latest | 45735482245 | failure |
| lint.yml | ubuntu-latest | 45735482181 | success |

stub_gamescope ubuntu-latest: 1 passed

The three rust-test.yml legs are the three jobs of the one run 45735482194 (job ids 139627565641 windows, 139627565955 macos, 139627566093 ubuntu)
at P'. The multi-crate `cargo test` step, `cargo test (Tauri shell crate)` and the per-platform `cargo clippy` ratchet (macOS, Windows) are green on all
legs they run on. The test.yml row is `failure` and is NOT claimed green: it is the same state the operator accepted in Task 2. At P' the Jest job
ran 1103 suites green and two red: `meta/__tests__/loginWindowSeamPredicateRemoved.test.ts` (one of the four known-unrelated suites) and
`meta/__tests__/callbackRegistryHost.test.ts`, an intermittent failure of the C host harness for the Steam bridge shim (`FAIL buffer_zeroed left ==
0:803`, and 54 more assertions that read the harness's stdout); it failed at 2064a6aca and 940bd9e73 and passed at 5b309e6f1 and 1c8d73a65, on code
no 88.1 commit touches. Nothing in either is an 88.1 test, and every 88.1 Jest suite passed at P'. `Supply-chain audit` (`cargo-deny`) is red on every
push of this branch (45735482190 at P'; it was red at `c5ae345ae` too, see the 88 section) and is not one of this plan's workflows.

88.1 replay binaries observed running in each rust-test.yml leg's log (`Running tests/<name>.rs` followed by `test result`, 0 failed). Counts differ
because `stub_gamescope` is `#![cfg(target_os = "linux")]` and `golden_launch` is Unix-only by its own header (recorded paths are POSIX; a non-unix run
prints the skip by name), so the Windows leg runs `golden_launch` as 0 tests and macOS and Windows run `stub_gamescope` as 0 tests; `sysinfo_host` has one
more Linux-only test:

| Binary | windows-latest | macos-latest | ubuntu-latest |
|--------|----------------|--------------|---------------|
| golden_builders | ok, 5 passed | ok, 5 passed | ok, 5 passed |
| golden_launch | ok, 0 passed (Unix only) | ok, 8 passed | ok, 8 passed |
| utils_pieces | ok, 6 passed | ok, 6 passed | ok, 6 passed |
| golden_sysinfo | ok, 3 passed | ok, 3 passed | ok, 3 passed |
| sysinfo_host | ok, 5 passed | ok, 5 passed | ok, 6 passed |
| stub_gamescope | ok, 0 passed (Linux only) | ok, 0 passed (Linux only) | ok, 1 passed |

So the 88.1 spawn-trace goldens replay on two OSes (macOS and Linux) and the builder, utils-pieces and system-information replays on all three; the
Linux stub-gamescope smoke ran for the first time on Linux in this CI and passed.

Commits between P (`ab7876c01`) and P', all in this plan. None changes shipped behaviour: they are baselines, one catalogue key order, one
workflow flag, test code and one lint in a test module. `git diff --name-only P P'` outside `.planning/` lists `.github/workflows/rust-test.yml`, seven
`meta/backendDiCeilings` shards, `meta/gameInfoNarrowingBaseline.json`, `public/locales/en/gamelib.json` and in Rust `gamelib-info`
(`sysinfo/versions.rs`, `tests/golden_sysinfo.rs`), `gamelib-launch` (`src/lib.rs`, `src/prepare/wine_path.rs`), `gamelib-shortcuts`
(`tests/golden_steam.rs`) and `src-tauri/src/launch_dispatch.rs`:

| Commit | What the hook or CI found | Fix |
|--------|---------------------------|-----|
| dc7aabdde | pre-push `backend-di-ceilings`: 88.1's builder ports shrank nine `jestMock` counts, grew two and added `launcher.crossoverEnv.test.ts`; 87-73, 87-76 and quick r0j added three frontend test sites; one entry went stale. `gameinfo-narrowing-ceiling`: `launcher.ts`'s four sites became `launchAdapters.ts`'s three (88.1-16). `i18n --fail-on-update`: 87-75's `inUse` key was out of order | baselines re-frozen by hand (the contract has no update flag); one key moved |
| d50bdf9fe | Windows `cargo test` did not compile `gamelib-launch`'s lib tests: `wine_path.rs` called `std::os::unix` unguarded (88.1-13) | `#[cfg(unix)]` on the chmod |
| 5b309e6f1 | ubuntu and macOS `golden_steam`: `removal_unlinks_a_grid_link...` got `File exists` (quick-261125-uzz's template now holds the file the test links). Not 88.1; it masked the later steps on those two legs. Reproduces locally with `CI=1`; without it the test skips | the test removes the name before linking |
| 2064a6aca | Windows `gamelib-info`: `the_arch_binary_falls_back...` matched `/x64/` in a joined path (88.1-10); macOS clippy ratchet: `cloned_ref_to_slice_refs` 3 against a ceiling of 2, the third in 88.1-08's `launch_dispatch.rs` test | match by path component; `std::slice::from_ref` |
| 1c8d73a65, e80b08cce | Windows `golden_sysinfo`: the 90 of 94 cases differed by path separators, first the runner paths built with `/` literals, then the recorded `/pins/bin/comet` that a Windows join makes `/pins/bin\comet` (88.1-10) | expected path built with `Path::join`; program paths compared with one separator. `rust-test.yml` also gained `--no-fail-fast` on the multi-crate step, so one red crate stops hiding the Windows failures behind it |
| 940bd9e73 | Windows `gamelib-launch`: the `launch_prepare` log assertion looked for `GamesConfig/app1.json` in JSON text where the Windows path has doubled backslashes (88.1-11) | the assertion normalises the separator |

A flaky `gamelib-depot` test binary, `steam_api_pin` (three `live_fetch_*` tests returning `deadline` on the macOS runner after 30 s), failed the macOS leg once at
3eba9dfb8 and passed at the next push with no change to that crate. It is not an 88.1 test and was not touched.

Not claimed: the Windows leg runs no `golden_launch` replay, so the Windows spawn traces are proven only through the builder and utils-pieces goldens and the
`launch_prepare` unit tests, not by trace replay. The "Items the sub-phase leaves open" above stand, except that the Linux `stub_gamescope` smoke has now run
on Linux (1 passed) and the Windows sysinfo code now compiles and passes its tests on `windows-latest` (it is still not run against a real Windows resolver).

## Gap closure proof (88.1-21..24)

Measured by plan 88.1-24 Task 1, 2026-11-27, on the main working tree, macOS arm64 only (Windows and Linux are proven by CI, D-30, in the next
section once the operator authorises the push). The measured head is P. `git status --porcelain --untracked-files=no -- src-tauri` was empty
before and after the runs (no uncommitted Rust in the measured tree). Other sessions committed to main while the runs were going (HEAD moved
from P to `fb0ff83cb`); every one of those commits is `.planning/` only (`git diff --name-only P fb0ff83cb` lists twelve files under
`.planning/phases/87-engine-wine-and-tools/`), so the Rust and frontend sources measured at P are the sources at the later head.

P: 21a57af08eedbf75b3dbba458ead65eca33558c4

Ancestry: the SUMMARYs 88.1-21, 88.1-22 and 88.1-23 exist and every commit they list is an ancestor of P (`git merge-base --is-ancestor`, 0
exceptions): 88.1-21 `24864a245`, `f9768d7c8`, `5e08206b0`; 88.1-22 `c03fe9af0`, `0b0b7258c`, `216206ebc`; 88.1-23 `978f256be`, `02269203f`.

| Step | Command (from `src-tauri` unless noted) | Exit | Outcome at P |
|------|------------------------------------------|------|--------------|
| 1 | `cargo test -p gamelib-launch -p gamelib-launch-cli -p gamelib-info -p gamelib-info-cli -p gamelib-knownfix -p gamelib-engine -p gamelib-wine -- --nocapture` | 0 | pass, 1522 passed, 0 failed, 0 ignored (summed over 90 test binaries) |
| 2 | `cargo test --bin gamelib-shell` | 0 | pass, 1040 passed, 0 failed, 2 ignored |
| 3 | `cargo +1.99.1 clippy --workspace --all-targets --message-format=json` into a scratch file, then `node ../meta/clippyRatchet.cjs {file} --list` | 0 | pass, `PASS (darwin, toolchain 1.99.1)`; no ceiling moved, in particular none on a crate neither 88.1-21 nor 88.1-22 touched |
| 4 | `pnpm check:ipc-contract` (repo root) | 0 | pass (ipc_contract.rs and ipcSchemaSnapshot.json up to date) |
| 5 | `pnpm planning-gates` (repo root) | 0 | pass, 12/12 |

The new cases were observed running in steps 1 and 2: `test every_builders_golden_replays ... ok` (golden_builders), `test
the_env_op_reads_no_wine_from_the_cli ... ok` (gamelib-launch-cli) and `test launch_dispatch::tests::the_game_env_arm_answers_settings_with_no_wine
... ok` (gamelib-shell). Not run here: `pnpm test:ci`, `pnpm lint`, `pnpm codecheck` and the pre-push hook's other steps (88.1-21..24 changed no
TypeScript; the hook runs them at the push).

Golden replays at P (the cargo output of step 1; the compared count and the floor are the two numbers each test printed, copied here).
`prepare_launch` printed `compared 582 (linux 379) of 582 floor 582` and `prepare_wine` printed `compared 391 (linux 207, mac 184) of 391
floor 391; both halves replayed in 361 (floor 361)`; the machine-checked lines carry the totals. The builders replay is 124 against 113 at
88.1-20 (88.1-21 added `env-vars-windows-empty-settings`, 88.1-22 added ten more) and every other replay is at its 88.1-20 floor:

golden builders: compared 124 floor 124
golden gamescope: compared 65 floor 65
golden prepare_launch: compared 582 floor 582
golden prepare_wine: compared 391 floor 391
golden epic_status: compared 70 floor 70
golden check_wine: compared 49 floor 49
golden sysinfo: compared 94 floor 94

The three-OS CI proof of these cases (Windows above all) is the next section, written after the push.

## Phase proof (88.2)

Measured by plan 88.2-25 Task 1, 2026-11-27, from a clean `git worktree add --detach` checkout (under the session scratchpad, removed
afterwards) with its own `pnpm install --frozen-lockfile`, `pnpm exec vite build` and `pnpm build:sidecar-sea` (and `.build-tools/zig`
copied in from the main tree, as 88.1-20 did), macOS arm64 only (Windows and Linux are proven by CI, D-30). The first measurement ran at
`c448ddbfd` (main's HEAD when the plan began) and its `pnpm lint` exited 1 with three `@typescript-eslint/unbound-method` errors, at
`sharedRedistInstall.ts:575`, `bridgeKnownFixes.ts:216` and `gameBridgeWineLaunch.ts:183`: 88.2-17/21 declared `RunnerAdapter` with method
syntax and each of those three files destructures `runWineCommand` from it. Commit `6a2265258` (`src/backend/runnerAdapter.ts`, types only,
the four members written as properties) fixes it, and that commit is the candidate head P. Every row below was re-run in a fresh checkout of
P. Two later commits on main (`a3f72e708`, the 88.3 plans) touch `.planning/` only.

P: 6a2265258b27ccd57bcab3f07c798a4490ebe897

Ancestry: the SUMMARYs 88.2-01..88.2-24 all exist (24 files). 100 distinct tokens in them resolve to commits in this repository and every one
is an ancestor of `c448ddbfd`, and so of P (`git merge-base --is-ancestor`, 0 exceptions); so are all 48 `plan_head_before` and
`plan_head_after` values in their frontmatter.

| Step | Command (run in the clean worktree) | Exit | Outcome at P |
|------|--------------------------------------|------|--------------|
| 1 | `pnpm install --frozen-lockfile` | 0 | pass |
| 2 | `pnpm exec vite build` | 0 | pass |
| 3 | `pnpm build:sidecar-sea` | 0 | pass, arm64 SEA sidecar built |
| 4 | `cargo test -p gamelib-proc -- --nocapture` (from `src-tauri`) | 0 | pass, 60 passed, 0 failed, 0 ignored (6 test binaries; `orphans` 13, `spec_runner` 14, `runner` 1, lib 32) |
| 5 | `cargo test -p gamelib-launch -p gamelib-launch-cli -p gamelib-wine -p gamelib-engine -p gamelib-knownfix -p gamelib-info -- --nocapture` | 0 | pass, 1490 passed, 0 failed, 0 ignored (summed over 89 test binaries) |
| 6 | `cargo test --bin gamelib-shell` | 0 | pass, 1040 passed, 0 failed, 2 ignored |
| 7 | `pnpm check:ipc-contract` | 0 | pass (ipc_contract.rs and ipcSchemaSnapshot.json up to date) |
| 8 | `pnpm planning-gates` | 0 | pass, 12/12 |
| 9 | `pnpm codecheck` (main and meta projects) | 0 | pass |
| 10 | `pnpm lint` | 0 | pass at P: production 773 warnings against a ceiling of 1130, tests 581 against 661, 0 errors. At `c448ddbfd` it exited 1 with the three errors named above. The first re-run at P still failed, replaying those three errors from `.eslintcache-src` (the cache keys on the linted file, not on the types it imports); with both caches deleted it passed |
| 11 | `pnpm find-deadcode` | 0 | pass (308 baselined knip findings) |
| 12 | `pnpm test:ci` | 1 | 1111 suites passed, 5 skipped, 4 failed; 25641 tests passed, 39 skipped, 8 failed. Not green; the four suites are listed below and none is 88.2's |
| 13 | `pnpm jest src/backend/__tests__/launchPortComplete.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts` | 0 | pass, 2 suites, 311 tests (run at `c448ddbfd`, and inside step 12 at P) |

`pnpm test:ci` is **red at P** and this plan does not claim it green. The four red suites: `meta/__tests__/genI18nGateScope` (1 test, the
A-17 anti-rot comparison against the upstream merge-base), `src/backend/storeManagers/steam/bridge/drm/__tests__/valveClient` (1 test,
`rejects a symlink entry`), `src/backend/testUtils/shortcutsIconGeometry/__tests__/iconGeometry.oracle` (5 tests, the macOS `sips` geometry
oracle) and `src/backend/__tests__/humbleFixtureRedaction` (1 test, `expect(files).toBeGreaterThan(0)` over
`src-tauri/crates/gamelib-humble/tests/fixtures/recorded/real/`, the operator's capture, which is untracked in the main tree and so absent
from a clean checkout). The first three are on the 88.1 list of known-unrelated suites; the fourth is new to that list and environmental, not a
regression. `meta/__tests__/loginWindowSeamPredicateRemoved`, red in 88.1's proof, passed here. Every 88.2 gate and every other suite passed.
Not run here: `cargo clippy` and `cargo fmt`, `pnpm smoke:*` and the pre-push hook's other steps; the hook runs at the push.

Test binaries observed running in steps 4 and 5 (all `test result: ok`, 0 failed): `golden_runner` (5 tests), `golden_redaction` (3),
`golden_wine_launch` (9), `golden_wine_path` (3), `golden_script` (4), `golden_spawn_async` (4), `golden_error_handler` (1), `stub_game` (5:
`a_filtered_tracked_kill_ends_only_the_game_it_names`, `the_abort_id_ends_a_game_run_through_its_handle`,
`quit_kill_ends_the_game_tree_and_reads_as_abort`, `parent_sigkill_leaves_the_game_running`,
`launch_tails_output_and_waits_for_the_grandchild`). `windows_quoting` ran 0 tests on this macOS leg, as it must (Windows only); its first
real run is the windows-latest leg (Task 3). The Windows orphan arm `terminate_parent_spares_game_then_stamped_kill_removes_its_tree` is
`cfg(windows)` and likewise first runs on CI.

Golden replays at P (the cargo output of step 5; the compared count and the floor are the two numbers each test printed, copied here).
`golden_runner` printed `compared 93 (not replayable here: 0) floor 93`; `golden_wine_launch` printed `wine_command: compared 16 floor 16` and
`wine_launch: compared 41 floor 41` (the 16 wine_command cases are their own line), and the tracer lines of `golden_script` and
`golden_spawn_async` (`compared 1 floor 1` each) are not repeated below:

golden runner: compared 93 floor 93
golden redaction: compared 88 floor 88
golden wine_launch: compared 41 floor 41
golden wine_command: compared 16 floor 16
golden wine_path: compared 16 floor 16
golden script: compared 18 floor 18
golden spawn_async: compared 33 floor 33
golden error_handler: compared 108 floor 108

### Sub-phase 88.2 sweep at P

- `src/backend/commandRunner.ts` does not exist (`test ! -e`, checked in the main tree at P and held by `commandRunnerPortComplete`).
- `runnerOraclePortComplete`, `commandRunnerPortComplete`, `commandRunnerSurvivors` and `noRollbackFlag` (all in
  `launchPortComplete.test.ts`) pass (step 13), as does `engineWineShimSchedule.test.ts`, and `rowsDueIn(SCHEDULE, 88.2)` is `[]` (asserted at
  `launchPortComplete.test.ts:912`).
- gamelib.log lines added under `src-tauri/crates/gamelib-launch/src/runner` and `src/game`, and gamelib-proc's `diag` lines. `src/game` has
  no logging call. The runner emits these: `Running command: {safe_command}` (the `{log_message_prefix}:` line; the ported line, carrying the
  runner path and the env diff as the TS line did, D-20 todo `.planning/todos/pending/2026-11-25-launch-command-log-line-carries-the-raw-home-path-and-env.md`),
  `Abort command "{safe_command}"`, `Error running command "{safe_command}": {message}`, `forceUninstall hook failed ({runner})` (a runner
  name), `Running Wine command: {debug_parts}` (Debug level), `Wine command failed to run: {reason}` and `wineserver --wait for prefix {wine_prefix}
  did not finish within 30 minutes; ...`. The last three carry a path or a spawn error text and are **not** fixed text. All of the runner's lines
  are ported verbatim from `commandRunner.ts` (lines 335, 391 and 415 of that file before its deletion at `686537757`), so 88.2 added no
  exposure the TS line did not have, but the sweep's "fixed text, no path" sentence holds only for the lines other than these four. No todo is
  filed for the three beyond the `Running command` one; they are recorded here for the 88.3 or a later logging pass. The `diag` lines in
  gamelib-proc are fixed text plus a code-supplied helper label, an OS error number or message and a process-group id, with no URL, hostname,
  token, account name or path. The prohibition stays `unresolved` in the plan (no wired check descriptor).
- The behaviour-change section exists: `### Behaviour changes (88.2)` above, under the 88.1 sweep (the D-27 quit prompt and Yes kill, a failed
  registry read asks, leader death unchanged, and what 88.2 does not do for playtime and the after-script).

### Per-task map: 88.2 rows

The `golden_runner` row is set to green at P. The `stub_game` row's Behavior now reads exactly `stub game: start, quit-kill, survives parent
SIGKILL (three OS)` and is green at P on macOS; the single-flight join moved to its own 88.3 row (D-04 is 88.3's by D-30). The
`windows_quoting` row stays `pending`: its binary runs 0 tests on macOS, so there is no local evidence to record, and it is not claimed green
until the windows-latest leg runs it. The three-OS CI proof is the next section, written after the push. Task 3 then set the `windows_quoting` row to green (2 passed on windows-latest) and added the three-OS run id to the `golden_runner` and `stub_game` rows.

### Decisions proven by this plan's evidence, and what is deferred

D-02 (runner ported, streaming shim, `commandRunner.ts` deleted), D-05 (Game-class launches), D-06 as amended by D-27 (the quit prompt and the
Yes kill), D-07 (the Rust running-game registry), D-11..D-15 for the runner goldens, D-18, D-19, D-20, D-21, D-22, D-26's ManagerHooks
transport (`game_title`, `force_uninstall`) and D-29's capture file with the D-30 interim (non-rotating batches) are carried by the goldens and
gates above. Owned by other sub-phases and not claimed: D-03 and D-24 were 88's and D-28 was 88.1's. Deferred to 88.3 by D-30: D-01 funnel,
D-04 single flight (the stub-game join, now its own 88.3 row), D-08, D-09 (log capture not resumed for a re-adopted game), D-10 and D-31
re-adoption and the quit-kill playtime and after-script, D-16 and D-17's live run, D-23 funnel events, D-26's full hooks, D-29's single per-game
log writer and resume todo, and the SIGKILL todo's body update. `88-HUMAN-UAT.md` item 2's wording that the quit kill fits inside the 5 s exit
budget is noted for 88.3, because 88.2 kills before the exit stage starts.

Flagged assumption (spec-less edge probe): SVC-03's edge-coverage row is `unclassified` and unresolved; the D-14 matrix stands in for edge
coverage and is not claimed as a verified edge.

## CI proof (88.2)

Measured by plan 88.2-25 Task 3, 2026-11-27, after the operator chose `push` in Task 2 (push main now; fix commits for failures that only show up
on CI land without asking again). The open-time check ran immediately before the first push: `git fetch origin main` (origin/main `3b721a03c`, main 4
commits ahead and 0 behind) and `git diff --name-only 6a2265258 HEAD` listing nothing outside `.planning/`. Every push was a plain
`git push origin main` through `.husky/pre-push` (no `--no-verify`, no force) and a fast-forward each time; the hook passed each time.

Three heads were pushed, because the first two each had a CI-only failure on the Windows leg of rust-test.yml (the fix table below). The candidate head
this proof ends on is P', and every row in the table below ran at that one head. P' differs from the Phase proof's P (`6a2265258`) by the two fix
commits and by `.planning/` files only; the clean-worktree measurement of the Phase proof was not repeated at P' (see "What changed since the Phase
proof" below).

P': 25bc3b52660bda5a9177169fddbc281c2cbb5707

| Workflow | Leg | Run id | Conclusion |
|----------|-----|--------|------------|
| rust-test.yml | windows-latest | 45959503130 | success |
| rust-test.yml | macos-latest | 45959503130 | success |
| rust-test.yml | ubuntu-latest | 45959503130 | success |
| codecheck.yml | ubuntu-latest | 45959503185 | success |
| test.yml | ubuntu-latest | 45959503135 | success |

stub_game windows-latest: 5 passed
stub_game macos-latest: 5 passed
stub_game ubuntu-latest: 5 passed
windows_quoting windows-latest: 2 passed

The three rust-test.yml legs are the three jobs of the one run 45959503130 at P'. The windows-latest and ubuntu-latest jobs passed on the first
attempt (job ids 140373692257 and 140373692183). The macos-latest job failed on the first attempt (job 140373692025) in the multi-crate `cargo test`
step on one test that is not an 88.2 test: `gamelib-steamcm` `webauth::tests::cancel_stops_polling` (`left: 5, right: 4`, the count of mock poll requests
read twice around a 300 ms sleep, a timing race in that test), the only failure on that leg. It passed on the same leg at the previous head
(`c7ec52d1e`, run 45956464586) and nothing in 88.2 touches that crate. The failed job was re-run once with `gh run rerun 45959503130 --failed` (no code
change) and passed on the second attempt (job 140380116302). `gh run view 45959503130` now reports `success`, attempt 2. Two other workflows ran at P'
and are not part of this plan's table: `lint.yml` 45959503220 (success) and `audit.yml` (Supply-chain audit) 45959503208 (success), both on their first
attempt. `test.yml` ran `pnpm test:ci` green on CI at P' (and at the two earlier heads), so the four suites that were red in the Phase proof's macOS
clean-worktree run (`genI18nGateScope`, `valveClient`, `iconGeometry.oracle`, `humbleFixtureRedaction`) did not fail on CI; their local reds are not
failures of the pushed tree.

88.2 binaries observed running in each rust-test.yml leg's log (`Running tests/<name>.rs` followed by `test result: ok`, 0 failed). Counts differ
because the Windows leg skips the unix-only orphan arms and one unix-only test of `golden_wine_launch` (a stand-in `wine` shell script), and runs
three Windows-only orphan arms in their place:

| Binary | windows-latest | macos-latest | ubuntu-latest |
|--------|----------------|--------------|---------------|
| gamelib-proc `orphans` | ok, 9 passed | ok, 13 passed | ok, 13 passed |
| golden_runner | ok, 5 passed | ok, 5 passed | ok, 5 passed |
| golden_redaction | ok, 3 passed | ok, 3 passed | ok, 3 passed |
| golden_wine_launch | ok, 8 passed | ok, 9 passed | ok, 9 passed |
| golden_wine_path | ok, 3 passed | ok, 3 passed | ok, 3 passed |
| golden_script | ok, 4 passed | ok, 4 passed | ok, 4 passed |
| golden_spawn_async | ok, 4 passed | ok, 4 passed | ok, 4 passed |
| golden_error_handler | ok, 1 passed | ok, 1 passed | ok, 1 passed |
| stub_game | ok, 5 passed | ok, 5 passed | ok, 5 passed |
| windows_quoting | ok, 2 passed | not applicable (Windows only) | not applicable (Windows only) |

On windows-latest the three Windows orphan arms ran and passed: `terminate_parent_spares_game_then_stamped_kill_removes_its_tree` (the A5 arm),
`windows_terminate_one_kills_a_helper_and_its_grandchild` and `windows_stamped_kill_with_a_wrong_stamp_signals_nothing`. On macos-latest and
ubuntu-latest the unix arms `sigkill_spares_game_then_stamped_kill_removes_its_tree` and `stamped_kill_with_a_wrong_stamp_signals_nothing` ran and
passed. `stub_game`'s five tests are the arms listed under the Phase proof.

### What the CI legs found, and the two fix commits

Flagged assumption A5 (88.2-06) was wrong as first stated. A named Game Job without kill-on-close cannot be reopened by name once the process that
created it has died: run 45954057247 at `16801b619` failed on windows-latest in the gamelib-proc `orphans` binary (8 passed, 1 failed). The failing arm
was `terminate_parent_spares_game_then_stamped_kill_removes_its_tree`: the stand-in parent was terminated, the game and its grandchild survived it, then
`kill_game_tree` logged `[proc] game job not found; leader only` and the arm timed out waiting for the game and its grandchild to die (the leader-only
kill left the grandchild). The cause is consistent with how Windows removes the name of a named kernel object when its last handle closes even though
members of the Job still run; the CI log shows the symptom, not that mechanism directly. Per the plan, the fix is a tree fallback inside gamelib-proc
and no hand-rolled kill. The macOS and Ubuntu legs, `codecheck.yml` and `test.yml` were green at that head.

| Commit | What CI found | Fix |
|--------|---------------|-----|
| c7ec52d1e | Windows A5 arm (run 45954057247, above). | `kill_game_tree` on Windows, when the Game Job cannot be opened, now walks the stamped leader's descendants from a process snapshot (`CreateToolhelp32Snapshot`; windows-sys feature `Win32_System_Diagnostics_ToolHelp`, no new crate, `Cargo.lock` unchanged). It keeps only processes newer than their named parent (the leader counting as created at the stamp), holds each handle from the check to the terminate so a pid cannot be recycled between them, terminates the leader and then the descendants, and repeats the walk up to three times for stragglers. `GameJob::open` is still tried first, so a live GameLib's handle still finds the Job. Comments in `job.rs`, `kill_tree.rs` and `orphans.rs` that stated A5 as fact were corrected. |
| 25bc3b526 | At `c7ec52d1e` (run 45956464586) the A5 arm passed and windows-latest went on to its first run of the 88.2 replays: `golden_wine_launch` (2 of 8 failed) and `golden_wine_path` (1 of 3 failed) differed from the POSIX recordings only in the separators of paths the code joins under a profile root (`<HOME>\.steam\steam`, `<TOOLS>\runtimes\umu\umu_run.py`); all 17 mismatched cases were equal to their recordings once those separators were folded. | The two test normalisers (`tests/common/mod.rs`, used by `golden_wine_path`, and `tests/golden_wine_launch.rs`) fold backslashes to `/` after a placeholder on Windows only. Paths that do not start at a placeholder (`C:\Games\Game One\save`) are untouched, and nothing changes off Windows. Test code only. |

`git diff --name-only P P'` outside `.planning/` lists exactly: `src-tauri/crates/gamelib-proc/Cargo.toml`, `src/job.rs`, `src/kill_tree.rs`,
`tests/orphans.rs`, and `src-tauri/crates/gamelib-launch/tests/common/mod.rs` and `tests/golden_wine_launch.rs`.

### What changed since the Phase proof

The Phase proof above was measured at P (`6a2265258`) in a clean worktree. P' adds the two commits in the table. Their code is `cfg(windows)` (the descendant walk
and its `windows-sys` feature, in a Windows-target dependency table), comments, and test-only normalisation that is a no-op off Windows, so nothing the
macOS Phase proof compiled for its own target changed. The full clean-worktree measurement was not repeated. What was re-run at P' on macOS: `cargo
clippy -p gamelib-proc -p gamelib-launch --all-targets --features harness -- -D warnings` (host and `--target x86_64-pc-windows-gnu`, 0 warnings),
`cargo fmt --check`, `cargo test -p gamelib-proc --test orphans` (13 passed) and the `golden_wine_launch`, `golden_wine_path`, `golden_runner` and
`golden_script` binaries (9, 3, 5 and 4 passed); and the CI legs above ran the whole of gamelib-proc and gamelib-launch on macOS and Ubuntu at P'.

Not shown by CI: that the Windows descendant walk was the branch that ended the game in the passing A5 arm. A passing test captures its stdout, so
the `game job not found; walking the descendants of the stamped leader` line is not in the log; the failing run at `16801b619` is what shows the
name does not survive, and the pass at `c7ec52d1e` and `25bc3b526` is what shows the tree ends. `GameLib`'s own use of a stamped kill after a restart
therefore rests on the walk, not on the Job name; a descendant the game parented to a process that has since exited is not found by it (a Job
would have held it), which is the cost of the fallback and is recorded here, not as a defect.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (sub-phase 88's plans 88-01..88-17)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

## Validation Audit 2026-11-25

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
