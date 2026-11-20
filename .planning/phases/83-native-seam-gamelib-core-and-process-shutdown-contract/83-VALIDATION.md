---
phase: "83"
slug: "native-seam-gamelib-core-and-process-shutdown-contract"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: true
created: "2026-11-20"
---

# Phase 83 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Seeded from `83-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `cargo test` (Rust 1.99.1) for crates and shell; jest 29.7 for gates and generator |
| **Config file** | `src-tauri/Cargo.toml` workspace; jest projects (Meta, Backend, Preload, Frontend); `.github/workflows/rust-test.yml` |
| **Quick run command** | `cd src-tauri && cargo test -p gamelib-core -p gamelib-proc` (crate work) or the touched jest census file |
| **Full suite command** | `cd src-tauri && cargo test --bin gamelib-shell && cargo test -p gamelib-core -p gamelib-proc -p gamelib-steampoll -p gamelib-steampoll-cli`, plus `pnpm check:ipc-contract`, `pnpm codecheck` and the census jest files |
| **Estimated runtime** | ~180 seconds (full); ~30 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** the quick command for the touched area, plus `npx prettier --check` on exactly the paths written (convention 5; check `--file-info` first)
- **After every plan wave:** the full suite command
- **Before `/gsd-verify-work`:** three-leg `rust-test.yml` green, then the live macOS gate
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

Filled by plan 83-10 Task 1 from the clean-worktree measurement at P = `844d2eee8` (see "## Phase proof"). Green
means green on the operator's Windows box at P; the unix legs of the orphan harness run only in CI (D-13), so those rows
read "✅ win32 + CI" now that "## CI proof" is filled (three-OS green at `90ca09d02`).

Requirement-level map from research:

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| FND-03 | Router table == generated native sets ⊂ `RENDERER_CHANNELS`; no two-owner channel; zero-owner ledger exact | unit + census | `cargo test --bin gamelib-shell native_router` (19 ok); `pnpm jest --runTestsByPath src/backend/sidecar/__tests__/ipcDomainCensus.test.ts src/backend/sidecar/__tests__/nativeChannelOwnership.test.ts` | ✅ | ✅ green |
| FND-03 | Each native channel has ≥1 `invalid` vector and every vector behaves | unit (data-driven) | `cargo test --bin gamelib-shell native_manifest_` (`native_manifest_every_channel_has_an_invalid_vector`, `native_manifest_vectors_valid_accept_invalid_reject`) | ✅ | ✅ green |
| FND-03 | Native rejection text carries the INVALID_ARGS / INVALID_CHANNEL marker; send rejection logs name only | unit | `cargo test --bin gamelib-shell native_rejection` (`native_rejection_never_echoes_an_argument` and the shape tests in `native_router::tests`; the planned name `native_rejection_shape` is not a test name) | ✅ | ✅ green |
| FND-03 | Schema snapshot fresh; floor + empty + truncated inputs fail | generator jest + CI | `pnpm check:ipc-contract`; `pnpm jest meta/__tests__/genIpcContract` | ✅ | ✅ green |
| FND-03 | Slice queue FIFO, non-blocking enqueue, survives a failed job | unit | `cargo test --bin gamelib-shell slice_queue` (`slice_queue_runs_fifty_jobs_in_enqueue_order`, `slice_queue_enqueue_does_not_wait_for_a_blocked_handler`, `slice_queue_keeps_going_after_a_failed_job`; the planned name `native_send_queue` is not a test name) | ✅ | ✅ green |
| FND-03 | Proof-channel TS deleted (`*PortComplete`) | jest source gate | `pnpm jest --runTestsByPath src/backend/__tests__/nativeSeamPortComplete.test.ts` | ✅ | ✅ green |
| FND-04 | Graceful quit: helpers gone, stand-in game tree alive | integration | `cargo test -p gamelib-proc --test orphans graceful` | ✅ | ✅ win32 + CI (win/mac/ubuntu) |
| FND-04 | SIGKILL of parent: helpers + grandchildren gone, game alive; reaper-disabled negative control | integration | `cargo test -p gamelib-proc --test orphans sigkill` (win32 runs the Job leg only; the reaper legs and the negative control are `cfg(unix)`) | ✅ | ✅ win32 Job leg; unix reaper legs + negative control green on macos-latest and ubuntu-latest (CI proof) |
| FND-04 | Node stand-in sidecar: non-detached children die | integration (panics on CI if node missing) | `cargo test -p gamelib-proc --test orphans node_standin` | ✅ | ✅ win32 + CI (win/mac/ubuntu) |
| FND-04 | `Shutdown::begin` returns by the deadline and names stragglers | unit | `cargo test -p gamelib-core shutdown` (11 `shutdown::tests` ok) | ✅ | ✅ green |
| FND-04 | Steampoll green after the `ProcessRunner` hoist | unit | `cargo test -p gamelib-steampoll -p gamelib-steampoll-cli` | ✅ | ⚠️ 6 pre-existing Windows-local reds (deferred-items.md); rest green |

Per-plan map (every plan's own verification, as measured at P; commit lists are in each SUMMARY's "Task Commits"):

| Plan | Wave | What it verifies | Command(s) | Status at P |
|------|------|------------------|------------|-------------|
| 83-01 | 1 | live macOS gate contract authored before any code | `83-HUMAN-UAT.md` exists with the Structural Reachability Review (docs only; run by 83-11) | ✅ authored, run pending |
| 83-02 | 2 | gamelib-core crate, Clock/ProcessRunner hoist, Shutdown/ExitBudget/run_exit, lockfile pin, CI `-p` entry | `cargo test -p gamelib-core` (inside the multi-crate step); `cargo test -p gamelib-steampoll`; lockfile-name census in `pnpm test` | ✅ green (steampoll: the deferred Windows-local reds only) |
| 83-03 | 2 | native manifest, generator sets, Rust router, handler, relay insertion; TS registration and zod entry deleted | `cargo test --bin gamelib-shell native_router`; `pnpm check:ipc-contract`; `ipcSchemaCoverage` / `ipcDomainCensus` jest | ✅ green |
| 83-04 | 2 | gamelib-proc crate: ChildSet, `spawn_helper`, Job, Game class, ProcRunner, early CI step | `cargo test -p gamelib-proc` (17 unit, 4 orphans, 1 runner = 22 passed) | ✅ green |
| 83-05 | 3 | schema snapshot, drift check, floor, two-owner refusal, TS ownership census, manifest-derived PortComplete | `pnpm check:ipc-contract`; `nativeChannelOwnership`, `nativeSeamPortComplete`, `genIpcContract` jest | ✅ green (`nativeChannelOwnership` classified in `testContainment` by `cfe0fa2fc`) |
| 83-06 | 3 | second native channel, validation parity, slice queue, `open_external` no longer a Tauri command | `cargo test --bin gamelib-shell native_`; `rendererAllowList` jest | ✅ green (`rendererAllowList` repaired by `cfe0fa2fc`) |
| 83-07 | 4 | reaper protocol, re-exec dispatch, unix SIGKILL legs, Node stand-in leg | `cargo test -p gamelib-proc` (unit `plan_reap_*`, `orphans`) | ✅ win32 + unix legs green in CI at `90ca09d02` |
| 83-08 | 5 | reaper wired into the shell, sidecar Job / group kill through gamelib-proc, helpers through gamelib-proc | `cargo test --bin gamelib-shell` (515 ok); `cargo test -p gamelib-steampoll -p gamelib-steamcm` | ✅ green |
| 83-09 | 5 | `handle_exit` on the one deadline, gates rewritten, conventions text | `cargo test --bin gamelib-shell`; `quitTeardownWiring` / `sidecarShutdownFlagSource` / `tauriShellSource` jest; `pnpm planning-gates` | ✅ green |
| 83-10 | 6 | clean-worktree proof at P, push, three-OS CI | this file, "## Phase proof" and "## CI proof" | ✅ local proof at P; three-OS CI green at `90ca09d02` (CI proof) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Live macOS gate contract authored before any code, with the Structural Reachability Review recorded
- [x] `crates/gamelib-core` and `crates/gamelib-proc` skeletons, workspace members, `EXPECTED_LOCKFILE_CRATE_NAMES` +2, `rust-test.yml` `-p` entries (orphan harness in its own early step)
- [x] `src/common/types/ipc/nativeChannels.json`, `native.ts`, generator extension with floor and empty/truncated tests
- [x] `nativeSeamPortComplete.test.ts` skeleton and census updates (re-measure after Phase 82 lands)
- [x] `crates/README.md` additions, CLAUDE.md Conventions row and `gamelib-conventions` skill section (D-14)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Force Quit during a download with a game running leaves no helper, game survives | FND-04 | The 80 nettop orphan was only found on the real app; CI stand-ins cannot reproduce the full live helper set | `pnpm tauri:dev`; start a Steam download; launch a game via `steam://` or a Rust-spawned stand-in (D-15, not a TS-launched Wine game); record `ps -axo pid,ppid,pgid,comm`; Force Quit; within 5 s `ps` shows no sidecar, nettop, reaper, comet, legendary/gogdl/nile or wine tools, and the game is still present; no Dock icon for the reaper; no `[shell] reaper unavailable` in the diag log |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

---

## Phase proof

Measured by plan 83-10 Task 1 on the operator's Windows 11 box (rustc stable plus the pinned 1.99.1 clippy toolchain,
node 22, pnpm 10.28.0).

**Candidate head P = `844d2eee8164671c8de43dc713654bf01cedc917`** (`fix(83-10): gamelib-proc spawn no longer trips
clippy::let_unit_value on unix`). All 35 commits listed under "Task Commits" in the nine plan SUMMARYs are ancestors of
P (`git merge-base --is-ancestor`, checked from the main checkout before the worktree was created).

Provenance: a clean `git worktree add --detach` checkout of P (`C:\Users\grays\p83`, a short path because
`LongPathsEnabled` is 0 on this box), its own `pnpm install --frozen-lockfile`, `pnpm exec vite build` and
`pnpm build:sidecar-sea` (the fresh worktree has neither the renderer build nor the externalBin), and its own cargo
`target` directory. The main checkout has 3 modified tracked files (`.planning/state.json`,
`public/locales/en/gamelib.json`, `src/backend/__tests__/cargoFeatures.test.ts`) and 18 untracked paths; none of them
exist in the worktree, so they are excluded from the claim by construction. The worktree was removed at the end
(`git worktree list` shows only the main checkout).

### Measurement history (why P moved)

| Head | Result | What changed |
|------|--------|--------------|
| `0f33fbe98` (first measurement) | `pnpm test` red on two suites that no pre-phase base fails and that origin CI had already shown red since `4566008950`: `rendererAllowList` (3 assertions) and `testContainment` (1) | none yet |
| `cfe0fa2fc` | fix: `nativeChannelOwnership.test.ts` (83-05) added to `STRUCTURALLY_CONTAINED_SUITES`; `rendererAllowList`'s computed set now unions the `nativeChannels.json` names, as `genIpcContract` does for `RENDERER_CHANNELS` | `src/backend/sidecar/__tests__/testContainment.test.ts`, `rendererAllowList.test.ts` |
| `844d2eee8` (= P) | fix: `clippy::let_unit_value` on `gamelib-proc/src/spawn.rs` (`JobSlot` is `()` off Windows). macos-latest's clippy ratchet failed at `4566008950` on exactly these two sites and the file has not changed since 83-04, so they were still present at `0f33fbe98`. One site passes the call inline, the other carries a scoped `#[allow]` with the reason (the Job must be taken before the child moves). No `meta/clippyRatchet.cjs` ceiling changed | `src-tauri/crates/gamelib-proc/src/spawn.rs` |

Every command below was re-run at P after the second fix; the first-measurement numbers are shown only where they differ.

### Command table (all at P, cwd = the worktree root unless a `src-tauri` prefix is shown)

| # | Command | Exit | Counts / note |
|---|---------|------|---------------|
| 1 | `cd src-tauri && cargo test -p gamelib-safety -p gamelib-testutil` | 0 | 77 passed, 0 failed (6 test binaries) |
| 2 | `cd src-tauri && cargo test -p gamelib-proc` | 0 | 22 passed, 0 failed: 17 unit, 4 `tests/orphans.rs` (`graceful_quit_terminates_the_helper`, `graceful_quit_kills_helpers_and_grandchildren_and_spares_the_game`, `sigkill_kills_helpers_and_grandchildren_and_spares_the_game`, `node_standin_children_die_with_the_parent`), 1 `tests/runner.rs`. win32 runs the Job leg; the reaper legs, the negative control, the disarm and the leaked-pipe legs are `cfg(unix)` and do not run here |
| 3 | `cd src-tauri && cargo test -p gamelib-scan -p gamelib-scan-cli -p gamelib-depot -p gamelib-depot-cli -p gamelib-steamfiles -p gamelib-steamfiles-cli -p gamelib-steamcm -p gamelib-steamcm-cli -p gamelib-steampoll -p gamelib-steampoll-cli -p gamelib-i18n -p gamelib-core` (the rust-test.yml line, verbatim) | 101 | stops at the first red binary. Re-run with `--no-fail-fast`: 1495 passed, 6 failed, 7 ignored across 80 binaries. The 6 are exactly the Windows-local reds recorded in `deferred-items.md` (found identical at baseline `b69d43018`): `gamelib-steampoll` `tests/adoption.rs` `on_windows_a_changed_steam_pid_is_never_adopted` (the real Steam client is running on this box) and 5 `gamelib-steampoll-cli` replay tests (`tempdir: Access is denied` under `C:\Windows`). Every `gamelib-core` test passes, including the 11 `shutdown::tests` |
| 4 | `cd src-tauri && cargo test --bin gamelib-shell` | 0 | 515 passed, 0 failed, 4 ignored (35 `native_` tests, 19 in `native_router`) |
| 5 | `cd src-tauri && cargo +1.99.1 clippy --workspace --all-targets --message-format=json > clippy.json` then `node ../meta/clippyRatchet.cjs clippy.json --list` | 0 / 0 | **win32 ratchet PASS** on this host (toolchain 1.99.1): `dead_code 5 (ceiling 5)`, `non_snake_case 2 (ceiling 2)`, every other lint at its ceiling. These are the same counts the windows-latest leg printed at `0c351cfd8`. **The darwin ratchet was NOT run: it needs an aarch64-apple-darwin host and none is available here.** The two darwin-only `let_unit_value` sites are fixed by inspection, not measured |
| 6 | `pnpm check:ipc-contract` | 0 | `ipc_contract.rs` and `ipcSchemaSnapshot.json` up to date |
| 7 | `pnpm planning-gates` | 0 | 12/12 |
| 8 | `.husky/pre-push`: `pnpm codecheck` | 0 | `tsc --noEmit` and `tsc -p tsconfig.meta.json --noEmit` clean |
| 9 | `.husky/pre-push`: `pnpm lint` | 0 | production PASS, tests PASS (0 errors, 960 + 622 warnings) |
| 10 | `.husky/pre-push`: `pnpm prettier` | 0 | all matched files use Prettier code style |
| 11 | `.husky/pre-push`: `pnpm i18n --fail-on-update` | 0 | exit 0. Side effect on this box only: the run re-sorts `public/locales/en/gamelib.json` (Windows collation of `_one` vs `None` keys), the same working-tree noise the main checkout already carries; reverted in the worktree before the next command |
| 12 | `.husky/pre-push`: `pnpm find-deadcode` | 0 | PASS (312 baselined knip findings) |
| 13 | `.husky/pre-push`: `pnpm boundaries` | 0 | no dependency violations (1402 modules, 8575 dependencies) |
| 14 | `.husky/pre-push`: `pnpm steam-line-ceiling` | 0 | PASS (201 files scanned, 0 allowlisted over 1000) |
| 15 | `.husky/pre-push`: `pnpm backend-di-ceilings` | 0 | PASS (`childProcess=1`, `jestMock=1865`, `sanctioned=1`) |
| 16 | `.husky/pre-push`: `pnpm gameinfo-narrowing-ceiling` | 0 | PASS (878 files scanned, 46 allowlisted) |
| 17 | `pnpm test` (whole jest run, `--maxWorkers=8`) | 1 | 85 suites failed, 1015 passed, 11 skipped (1111 total); 363 tests failed, 22604 passed, 386 skipped. **Red, and all of it pre-existing Windows-local**, shown by the base comparison below |

### `pnpm test` against the pre-phase base

The phase base `c939280e5` was run the same way in its own clean worktree: 95 suites failed, 1000 passed; 427 tests
failed. The failing-suite sets compare as follows (suites keyed by path):

- fail at P and not at base: 2 (`settingsFlows`, `sidecarRejectionGuard`). Neither is a regression. `settingsFlows` fails
  in isolation at the base worktree too (3 then 1 failed tests across two runs; `EPERM` renaming `gamelib.log` to
  `gamelib.log.old`, the Windows file lock on the log, the same class `deferred-items.md` records for 83-06) and at P
  (1 failed, twice). `sidecarRejectionGuard` passes on its own at P (it only failed in the loaded full run).
- fail at base and not at P: 12 (Phase 82's Windows gap-fill commits, plus load flakes).
- the first run at `0f33fbe98` also showed `migrationsWiring` and `bridgeScan` red; both passed at P, so they are load
  flakes, not defects.
- no suite that touches the native seam, the gamelib-proc harness, the shutdown contract or the censuses fails at P:
  `nativeSeamPortComplete`, `ipcDomainCensus`, `ipcSchemaCoverage`, `nativeChannelOwnership`, `genIpcContract`,
  `rendererAllowList`, `testContainment`, `quitTeardownWiring`, `sidecarShutdownFlagSource` and `tauriShellSource` all pass.

This is not the CI claim: CI test.yml is ubuntu-only, so the 85 Windows-local reds do not decide it. The CI claim is the
"## CI proof" below, which is not yet filled.

### Evidence already on origin before this plan's push

`origin/main` was at `0c351cfd8` (83-07 Task 3) when 83-10 started measuring, so GitHub had already run the three-OS
matrix on two earlier phase heads. Recorded here because it is where the two fixes above came from, not as the proof:

| Head | Workflow | Result |
|------|----------|--------|
| `4566008950` (83-06 Task 1) | Rust test | windows-latest success, ubuntu-latest success, macos-latest failure: clippy ratchet, 2 new `let_unit_value` in `gamelib-proc/src/spawn.rs` (fixed in `844d2eee8`) |
| `4566008950` | Test | failure: `rendererAllowList`, `testContainment`, `logSecretGate` (the first two fixed in `cfe0fa2fc`; `logSecretGate` passed at `0c351cfd8`) |
| `0c351cfd8` (83-07 Task 3) | Rust test | ubuntu-latest success, windows-latest success, macos-latest failure: step `cargo test (gamelib-core, ...)`, `gamelib-steampoll` `tests/monitor.rs` `watchdog_real::still_kills_the_grandchild_when_the_middle_process_dies_first` (`assertion failed: alive(rig.grand)` at line 711). The macOS gamelib-proc step passed there, with all seven unix orphans tests ok. This test is Phase 80 code that no Phase 83 commit between `4566008950` and `0c351cfd8` touched, and it passed on macOS at `4566008950` and at the phase base `c939280e5`, so it reads as a timing flake; it cannot run on this host and is unconfirmed until the next macOS run |
| `0c351cfd8` | Test | failure: `rendererAllowList`, `testContainment` (fixed), `meta/__tests__/callbackRegistryHost.test.ts` (the C-harness `buffer_zeroed` case; no Phase 83 file touches it, it is not red on this box, and it is the suite `.planning/debug/test-workflow-red-since-1026.md` already tracks) |

### Not proven locally (stated, not green)

- the darwin clippy ratchet at P (CI's macos-latest leg is the only place it runs);
- every `cfg(unix)` leg of the orphan harness (reaper SIGKILL, negative control, disarm, leaked pipe) and the Linux
  `cargo check --all-targets`;
- the unix-only code added after `4566008950` (reaper, proto, children) has never been linted on darwin.

---

## CI proof

Collected by plan 83-10 Task 3 after the operator answered the push checkpoint `push-now`. The first push of the phase
commits (including `844d2eee8` and the 83-10 docs) reached origin at `bd150a0c7`; one CI-only fix followed (`90ca09d02`,
pushed with the pre-push hook, never `--no-verify`).

**Proof head: `90ca09d02cc6ee83b7b422ca627d42b44aca7b58`.** `git diff 844d2eee8 90ca09d02 -- meta/clippyRatchet.cjs` is
empty: no ceiling moved in either direction. `git log 844d2eee8..90ca09d02` holds one code commit (`90ca09d02`) plus
other sessions' phase-84 docs and a phase-82 docs commit.

### At `90ca09d02` (the proof)

| Workflow | Run | Leg / job | Conclusion | Note |
|----------|-----|-----------|------------|------|
| Rust test | 44850161688 | windows-latest | success | gamelib-proc step green: 17 unit + `tests/orphans.rs` 4 (`graceful_quit_terminates_the_helper`, `graceful_quit_kills_helpers_and_grandchildren_and_spares_the_game`, `sigkill_kills_helpers_and_grandchildren_and_spares_the_game` = the Job leg, `node_standin_children_die_with_the_parent`) + 1 runner; no reaper tests (cfg(unix)). `cargo test --bin gamelib-shell` 515 passed. Clippy ratchet `PASS (win32, toolchain 1.99.1)`, `dead_code 5 (ceiling 5)` |
| Rust test | 44850161688 | ubuntu-latest | success | gamelib-proc step green: 21 unit + orphans 7 (`graceful_quit_terminates_the_helper`, `graceful_quit_disarms_the_reaper`, `graceful_quit_kills_helpers_and_grandchildren_and_spares_the_game`, `node_standin_children_die_with_the_parent`, `sigkill_kills_helpers_and_spares_the_game`, `sigkill_with_a_leaked_pipe_still_reaps`, `sigkill_without_reaper_leaves_the_helper_alive` = the negative control) + 1 runner; `cargo check` and `cargo test --bin gamelib-shell` 523 passed; no clippy step on this leg |
| Rust test | 44850161688 | macos-latest | success | gamelib-proc step green with the same seven orphans tests as ubuntu; `cargo test --bin gamelib-shell` 538 passed; clippy ratchet `PASS (darwin, toolchain 1.99.1)` (the two `unit_arg` sites fixed by `90ca09d02`). This is the first green darwin ratchet at the phase code (it failed at `4566008950` and `bd150a0c7`) |
| Code check | 44850161669 | codecheck | success | |
| Lint | 44850161817 | lint | success | |
| Supply-chain audit | 44850161707 | cargo-deny, pnpm-audit | success | |
| Test | 44850161668 | ci | success on attempt 2 | attempt 1 failed on one test, `sharedRedistInstall.test.ts` "installer timeout > records timedOut..." (`installerCalls()` length 0, a fake-timer race); passed on rerun with no change. See "Failures that are not phase 83" |

The Windows leg proves the Job SIGKILL leg and the graceful legs; the SIGKILL reaper legs and the reaper-disabled negative
control run (and pass) on macOS and Linux. All three legs ran the gamelib-proc step and the Node stand-in leg. D-13's
three-OS claim for criterion 3 therefore holds at `90ca09d02`.

### Fix history (phase-83-caused CI failures, one fix round)

| Head | Run | Result | Cause | Fix |
|------|-----|--------|-------|-----|
| `bd150a0c7` | 44846652732 (attempt 2) | macos-latest failed at step "cargo clippy ratchet": `FAIL: 2 new warning(s) for clippy::unit_arg, which has no ceiling` at `gamelib-proc/src/spawn.rs:99` and `reaper.rs:571` | `844d2eee8` removed `let_unit_value` by inlining the call; with `JobSlot = ()` off Windows the inlined unit argument is `clippy::unit_arg` instead (the Windows host cannot lint a `cfg(not(windows))` path) | `90ca09d02`: scoped `#[allow(clippy::unit_arg)]` at both sites with the reason; no ratchet ceiling touched |

### Failures that are not phase 83 (recorded for the verifier, not fixed here)

- **gamelib-steampoll macOS watchdog flake.** `watchdog_real::still_kills_the_grandchild_when_the_middle_process_dies_first`
  (`crates/gamelib-steampoll/tests/monitor.rs:711`, `assertion failed: alive(rig.grand)`) failed on macos-latest at
  `0c351cfd8` (run 44837163578) and at `bd150a0c7` attempt 1 (run 44846652732, job 136667906401), passed on rerun
  of the same head (attempt 2, job 136672520861 got past the multi-crate step) and at `90ca09d02`. Evidence it predates
  phase 83: `git diff 4566008950 0c351cfd8 -- src-tauri/crates/gamelib-steampoll src-tauri/crates/gamelib-core src-tauri/Cargo.lock .github`
  is empty, so nothing the test links changed between its last pass (`4566008950`, `c939280e5`) and its first failure;
  the test is a shell, `kill -9` and a 300 ms sleep timing race on a shared runner. Passes on 2 of 4 macOS attempts
  at phase-83 heads, so it stays flaky; worth a todo.
- **Test workflow flake.** `sharedRedistInstall.test.ts` (Steam bridge; `git log c939280e5..90ca09d02` shows no phase 83
  commit touches `src/backend/storeManagers/steam/bridge`) failed once at `90ca09d02` and passed at `bd150a0c7` and on
  rerun.
- **callbackRegistryHost** (`meta/__tests__/callbackRegistryHost.test.ts`) failed Test at `0c351cfd8` as recorded above;
  Test at `bd150a0c7` and `90ca09d02` passed, so it did not reproduce.
- **Windows-local reds** (85 suites in `pnpm test`, 6 steampoll cargo tests) are the operator-box environment set in
  "## Phase proof" and `deferred-items.md`; CI runs Linux/mac/win cargo and ubuntu jest and is green.
