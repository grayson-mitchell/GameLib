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
| SVC-03 / SC1 | 88.1 | builders match TS vectors (env, wrappers, gamescope, known-fix env, prepare ops) | Rust replay of TS vectors | `cargo test -p gamelib-launch --test golden_builders` | ❌ W0 | ⬜ pending |
| SVC-03 / SC1 | 88.1 | spawn traces: native, Wine/Proton/CrossOver, gamescope/mangohud, overlay, pre/post (argv, full env, cwd, class, order) | Rust replay of TS traces | `cargo test -p gamelib-launch --test golden_launch` | ❌ W0 | ⬜ pending |
| SVC-03 / SC1 | 88 | known-fix reader, layering, registry, overlay archive/install, fetch | replay + ported incident tests | `cargo test -p gamelib-knownfix` | ✅ | ✅ green (P `68979200f`, 88-17; three-OS CI green at P' `c5ae345ae`) |
| SVC-03 / SC1 | 88.2 | runner command argv/env, redacted log line, streamed line sequence | replay | `cargo test -p gamelib-launch --test golden_runner` | ❌ W0 | ⬜ pending |
| SVC-03 / SC2 | 88.3 | funnel order, status events, single-flight join, release on failure | funnel oracle replay | `cargo test -p gamelib-launch --test funnel` | ❌ W0 | ⬜ pending |
| SVC-03 / SC2 | 88.2 | stub game: start, single flight, quit-kill, survives parent SIGKILL (three OS) | CI smoke + orphan harness | `cargo test -p gamelib-proc` ; `cargo test -p gamelib-launch --test stub_game` | partial | ⬜ pending |
| SVC-03 / SC2 | 88.2 | Windows quoting against a real exe | Windows-leg cross-check | `cargo test -p gamelib-launch --test windows_quoting` | ❌ W0 | ⬜ pending |
| SVC-03 / SC2 | 88.3 | live: launches, single flight + quit (D-27 game-running prompt), Force Quit survival + re-adopt, known fix + scripts | operator, signed build | `88-HUMAN-UAT.md` | ✅ authored by 88-01 (not yet run) | ⬜ pending |
| SVC-03 / SC3 | 88.1 | anti-cheat at launch; utils pieces (`errorHandler`, `askForceUninstall`, `isEpicServiceOffline`, `isMacSonomaOrHigher` both ways, `removeQuoteIfNecessary`, D-28 `check_wine_before_launch`/`download_default_wine`; `errorHandler` and `askForceUninstall` land with 88.2's runner, per the 82 amendment) | replay + unit | `cargo test -p gamelib-launch --test utils_pieces` | ❌ W0 | ⬜ pending |
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
