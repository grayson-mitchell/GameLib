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
| SVC-03 / SC1 | 88.1 | builders match TS vectors (env, wrappers, gamescope, known-fix env, prepare ops) | Rust replay of TS vectors | `cargo test -p gamelib-launch --test golden_builders` | ✅ | ✅ green (P `ab7876c01`, 88.1-20; three-OS CI pending the push) |
| SVC-03 / SC1 | 88.1 | spawn traces: native, Wine/Proton/CrossOver, gamescope/mangohud, overlay, pre/post (argv, full env, cwd, class, order) | Rust replay of TS traces | `cargo test -p gamelib-launch --test golden_launch` | ✅ | ✅ green (P `ab7876c01`, 88.1-20; three-OS CI pending the push) |
| SVC-03 / SC1 | 88 | known-fix reader, layering, registry, overlay archive/install, fetch | replay + ported incident tests | `cargo test -p gamelib-knownfix` | ✅ | ✅ green (P `68979200f`, 88-17; three-OS CI green at P' `c5ae345ae`) |
| SVC-03 / SC1 | 88.2 | runner command argv/env, redacted log line, streamed line sequence | replay | `cargo test -p gamelib-launch --test golden_runner` | ❌ W0 | ⬜ pending |
| SVC-03 / SC2 | 88.3 | funnel order, status events, single-flight join, release on failure | funnel oracle replay | `cargo test -p gamelib-launch --test funnel` | ❌ W0 | ⬜ pending |
| SVC-03 / SC2 | 88.2 | stub game: start, single flight, quit-kill, survives parent SIGKILL (three OS) | CI smoke + orphan harness | `cargo test -p gamelib-proc` ; `cargo test -p gamelib-launch --test stub_game` | partial | ⬜ pending |
| SVC-03 / SC2 | 88.2 | Windows quoting against a real exe | Windows-leg cross-check | `cargo test -p gamelib-launch --test windows_quoting` | ❌ W0 | ⬜ pending |
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
