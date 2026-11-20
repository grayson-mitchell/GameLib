---
phase: 83-native-seam-gamelib-core-and-process-shutdown-contract
plan: 09
subsystem: infra
tags: [rust, tauri, shutdown, exit-budget, gamelib-core, gamelib-proc, source-text-gates, conventions]
status: complete

requires:
  - phase: 83-02
    provides: gamelib_core::shutdown (ExitBudget, run_exit, Shutdown, global)
  - phase: 83-04
    provides: gamelib_proc::kill_tree::terminate_group, children::global().terminate_all
  - phase: 83-08
    provides: reaper::disarm() at the end of handle_exit; SidecarState.job as a gamelib_proc Job
provides:
  - handle_exit on run_exit(global(), ExitBudget::DEFAULT, drains, children, finish) with the depot, steamcm and steampoll drains
  - SidecarState::shutdown_child(&self, grace) delegating the unix group stop to terminate_group; one call site, in handle_exit's children closure
  - steamcm_exit_shutdown(bound) -> bool and steampoll_exit_shutdown(bound) -> bool; EXIT_FINALIZE_WAIT deleted
  - log lines `exit finished in <ms> ms` and `still running at exit deadline: <names> (<count>)` through shell_diag
  - rewritten TS source-text gates (sidecarShutdownFlagSource, quitTeardownWiring C4 + C4b, tauriShellSource)
  - CLAUDE.md Conventions row 6, the gamelib-conventions "The Rust shutdown contract" section, crates README section 2c
affects: [83-10 three-leg CI run, 83-11 live gate item 4/5, 84 and later Rust slices that add spawns or exit work]

actuals:
  tokens: 21500
  tasks: 2
  commits: 2
plan_head_before: b3a059a8fb6dd9a62bb38b2ae1b0820f9ef7f286
plan_head_after: 8d7be2c25

tech-stack:
  added: []
  patterns:
    - "Exit as stages inside one budget: concurrent named drains, then children with the time left, then finish"
    - "A drain that detects its own overrun parks to keep its Registrant held, so the stage deadline names it instead of racing it"
    - "Source-text gate rewritten in the same commit as the shape it pins, each shown failing on a deliberate break"

key-files:
  created: []
  modified:
    - src-tauri/src/main.rs
    - src-tauri/src/shell_state.rs
    - src-tauri/src/steamcm_dispatch.rs
    - src-tauri/src/steampoll_dispatch.rs
    - src-tauri/src/depot_dispatch.rs
    - src/backend/__tests__/quitTeardownWiring.test.ts
    - src/backend/__tests__/sidecarShutdownFlagSource.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - CLAUDE.md
    - .claude/skills/gamelib-conventions/SKILL.md
    - src-tauri/crates/README.md

key-decisions:
  - "The old per-subsystem lines ('depot jobs still running at exit deadline: N', 'steampoll polls still running at exit deadline: N') are deleted, not kept: both contain the substring the live gate scores for absence, so they would have muddied 83-11's overrun check; the single report line replaces them"
  - "A drain that overran holds its Registrant open (hold_exit_drain_open parks the detached drain thread) because each subsystem's own bound equals the drain budget and would otherwise return at the same instant as the stage deadline, leaving the overrun unnamed"
  - "steamcm_exit_shutdown and steampoll_exit_shutdown return bool (overran) instead of logging, so the one report names the straggler"
  - "C4b pins terminate_group's real shape (libc::SIGTERM, try_wait(), kill_process_group(pgid), child.wait() in order) plus signal_group's negated-pgid libc::kill and pgid <= 1 refusal, not the plan's literal wording, because the negated-pgid kill lives in signal_group, not terminate_group"

patterns-established:
  - "A new exit participant is a named drain in handle_exit or holds a global() Registrant, takes the bound it is handed, and never adds its own wait"

requirements-completed: [FND-04]

coverage:
  - id: D1
    description: "handle_exit runs on the one 5 s run_exit deadline: depot, steamcm and steampoll drain concurrently (3.5 s), then the sidecar group and ChildSet helpers are terminated with the time left (at most 1.5 s), then reaper disarm, wake-lock release and socket cleanup"
    requirement: FND-04
    verification:
      - kind: unit
        ref: "src/backend/__tests__/tauriShellSource.test.ts#handle_exit drains depot, steamcm and steampoll before the children stage signals the sidecar; run_exit deadline unit-tested in gamelib-core shutdown.rs (83-02)"
        status: pass
    human_judgment: true
    rationale: "The wall-clock exit time of the live app and the real drain durations are only observable in the running app; 83-11 item 4 reads `exit finished in <ms> ms` (at most 5000)"
  - id: D2
    description: "shutdown_child(grace) sets the shutdown flag first, skips the group signal once tree_reaped is set, delegates to terminate_group on unix, keeps the Windows kill-and-drop-Job path, and has exactly one call site, inside handle_exit"
    requirement: FND-04
    verification:
      - kind: unit
        ref: "quitTeardownWiring.test.ts C4/C5, sidecarShutdownFlagSource.test.ts (shutdown_child sets the flag before any kill; skips the group signal once the tree is reaped), tauriShellSource.test.ts (one call site, app_relaunch pin)"
        status: pass
    human_judgment: true
    rationale: "The unix branch of shutdown_child (terminate_group call) is cfg(unix) and was not compiled or run on this Windows host; it is pinned by source-text gates here and compiled and exercised by plan 83-10's macOS and Linux legs"
  - id: D3
    description: "The two D-12 log lines go through shell_diag, carry registrant names and counts only, and the old same-phrase per-subsystem lines are gone"
    requirement: FND-04
    verification:
      - kind: unit
        ref: "tauriShellSource.test.ts#handle_exit finishes with reaper disarm, wake-lock release and socket removal, and logs the two exit lines through shell_diag"
        status: pass
    human_judgment: true
    rationale: "That both lines reach gamelib-shell.log in the live app is 83-11 items 4 and 5"
  - id: D4
    description: "The source-text gates pin the new shape and none passes vacuously: each rewritten gate was shown failing on a deliberate local break (see Verification)"
    requirement: FND-04
    verification:
      - kind: unit
        ref: "mutations M1-M7 in this summary; jest quitTeardownWiring + sidecarShutdownFlagSource + tauriShellSource + quitHandler 315 passed"
        status: pass
    human_judgment: false
  - id: D5
    description: "The Rust shutdown convention is written in CLAUDE.md (row 6, intro, Project Skills), the gamelib-conventions skill (new section beside the sidecar one, which stays) and the crates README (section 2c, 2b amendment, section 8)"
    requirement: FND-04
    verification:
      - kind: command
        ref: "grep acceptance checks (Six conventions 1, Five conventions 0, sidecar section 1, 2c heading 1); npx prettier --check CLAUDE.md src-tauri/crates/README.md; pnpm planning-gates 12/12"
        status: pass
    human_judgment: true
    rationale: "Whether the text reads as a usable rule to a future session is a judgment; SKILL.md is prettier-ignored (.claude) and hand-matched"
  - id: D6
    description: "Research A9 / D-16: depot finalize (the 1026 record) fits the 3.5 s drain stage in practice"
    requirement: FND-04
    verification:
      - kind: other
        ref: "83-11 item 4 live gate"
        status: unknown
    human_judgment: true
    rationale: "Backstop truth from the plan: no gamelib*.log held the overrun line at planning time; only a live quit with a download in flight measures it"

duration: not captured (start time was not recorded at launch)
completed: 2026-11-20
---

# Phase 83 Plan 09: handle_exit on one exit deadline Summary

**GameLib's exit now spends one 5 s budget (3.5 s of concurrent depot, steamcm and steampoll drains, then at most 1.5 s killing the sidecar group and the helper set, then reaper disarm, wake-lock release and socket cleanup), logs `exit finished in <ms> ms` and names any overrunning drain, and the Rust shutdown rule is written next to the sidecar's.**

## Performance

- **Duration:** not captured (start time was not recorded at launch)
- **Completed:** 2026-11-20
- **Tasks:** 2 (task 1 tracer)
- **Files:** 11 modified, no files created or deleted

## Accomplishments

- `handle_exit` calls `run_exit(global(), ExitBudget::DEFAULT, drains, children, finish)`. The three drains (`"depot"`, `"steamcm"`, `"steampoll"`) run concurrently with the 3.5 s drain bound; the children closure runs `state.shutdown_child(grace)` then `gamelib_proc::children::global().terminate_all(grace)`; `finish` runs `reaper::disarm()`, `wake_lock_release_all()` and the unix socket removal in that order. The old serial worst case (about 17 s) is gone, and steamcm logoff and the nettop kill still finish, or reach their deadline, before the sidecar is signalled.
- `shutdown_child(&self, grace: Duration)` keeps `begin_shutdown()` first and the `tree_reaped` guard, then calls `gamelib_proc::kill_tree::terminate_group(pgid, &mut child, grace)` on unix; the Windows path still kills the child and drops its Job. The `[shell] sidecar terminated on exit` line stays.
- `steamcm_exit_shutdown(bound) -> bool` and `steampoll_exit_shutdown(bound) -> bool` take the drain bound and report an overrun; `EXIT_FINALIZE_WAIT` is deleted (nothing used it after the change). The sidecar-EOF path keeps `STEAMCM_SHUTDOWN_BOUND`.
- Logging: `shell_diag("exit finished in {} ms")` always, and `shell_diag("still running at exit deadline: {names} ({count})")` only when a drain overran, so both reach stderr and `gamelib-shell.log`. D-12: registrant names and counts only.
- Gates rewritten in the same commit as the shape they pin: `sidecarShutdownFlagSource` (flag precedes `terminate_group(` and `child.kill()`), `quitTeardownWiring` C4 (tree_reaped guard then `terminate_group(pgid, &mut child, grace)`, no inline `libc::kill(`) and new C4b over gamelib-proc's `kill_tree.rs`, `tauriShellSource` (exactly one `shutdown_child(` call site excluding the definition and inside `handle_exit`; the `app_relaunch` pin now reads `shutdown_child(`; the drain-order pin; a finish-stage and log-line pin).
- D-14: CLAUDE.md Conventions row 6 and intro (six conventions, three discipline-only plus a note that the sixth is discipline at its call sites), the gamelib-conventions section "The Rust shutdown contract (gamelib-core Shutdown, gamelib-proc spawns)" after the sidecar section (which stays), and crates README section 2c, the 2b amendment (gamelib-safety was not re-homed in Phase 83), the section 1 crate list and the section 8 CI steps.

## Task Commits

1. **Task 1 (tracer): handle_exit on the one deadline, children via gamelib-proc, gates rewritten** - `e7d794092` (feat)
2. **Task 2: Rust shutdown convention in CLAUDE.md, the skill and the README** - `8d7be2c25` (docs)

Two other sessions committed to main in the same window (`f309d86c0`, `e572574b7`, `7435204c6`); `plan_head_before..HEAD` therefore spans foreign commits, and `commits: 2` is counted from the `(83-09)` subjects.

## Verification

Tracer feedback gate (auto and end-of-phase, automated `<verify>` only): the tracer `<verify>` passed end to end before expansion.

- `cargo test --bin gamelib-shell`: 515 passed, 4 ignored. `cargo test -p gamelib-core -p gamelib-proc -p gamelib-steampoll -p gamelib-steamcm -p gamelib-depot`: all green (no baseline failures hit).
- `rustfmt --edition 2021 --check` over `shell_state.rs`, `steamcm_dispatch.rs`, `steampoll_dispatch.rs`, `depot_dispatch.rs`: clean. `main.rs` is not rustfmt-clean as a file (pre-existing); the `handle_exit` region has no rustfmt diff after one fix.
- `pnpm exec jest` over `quitTeardownWiring`, `sidecarShutdownFlagSource`, `tauriShellSource`, `quitHandler`: 315 passed. `npx prettier --file-info` reports the three test files and CLAUDE.md and the README not ignored; `npx prettier --check` over them passes. SKILL.md is under `.claude` (prettier-ignored), hand-matched.
- `pnpm planning-gates`: 12/12.
- Acceptance greps: `run_exit(` 1, `exit finished in ` 2 (one in the doc comment), `still running at exit deadline: ` 2 (one in the doc comment), `EXIT_FINALIZE_WAIT` 0 in main.rs (0 anywhere), `terminate_group(` 1 in shell_state.rs, `kill_tree.rs` 2 in quitTeardownWiring, `Six conventions` 1, `Five conventions` 0, the sidecar section 1, the 2c heading 1.
- **Each rewritten gate failed on a deliberate local break, then the break was reverted** (backups restored from the scratchpad; baseline re-run 310 passed):
  - M1 `terminate_group` with its SIGKILL call replaced by a no-op: C4b failed.
  - M2 `shutdown_child` without `begin_shutdown()`: "shutdown_child sets the flag before any kill" failed.
  - M3 `shutdown_child` with an inline `libc::kill(-pgid, SIGKILL)` instead of `terminate_group`: C4 and the flag gate failed.
  - M4 a `shutdown_child(Duration::ZERO)` call inside `rpc_app_relaunch`: the app_relaunch pin and the one-call-site pin failed (the old zero-arg text would have passed vacuously).
  - M5 a second `shutdown_child(grace)` call in `handle_exit`: the one-call-site pin failed.
  - M6 the `"steampoll"` drain name misspelled: the drain-order pin failed.
  - M7 the sidecar signalled before the drains: the drain-order pin failed.

Plan-level `clippy --workspace` plus `meta/clippyRatchet.cjs` is specified for darwin and was not run (Windows host, no pinned toolchain).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A drain that overran would not have been named**
- **Found during:** Task 1
- **Issue:** `run_exit` names a drain only while its `Registrant` is still held at the deadline. Each subsystem's own wait (`cancel_all_and_wait(bound)`, `shutdown_all(bound)`) is bounded by the same drain budget, so a drain that hit its bound returned and dropped its registrant at the same instant the stage deadline fired, and the report would randomly omit the straggler.
- **Fix:** each drain returns normally on success; on an overrun (depot `still_running > 0`, steamcm `RestoreOutcome::TimedOut`, steampoll `still > 0`) it calls `hold_exit_drain_open()`, which parks the detached drain thread forever (the process is about to end), so the registrant is still held and the report names it. `steamcm_exit_shutdown` and `steampoll_exit_shutdown` return a bool for this instead of logging.
- **Files modified:** `src-tauri/src/main.rs`, `src-tauri/src/steamcm_dispatch.rs`, `src-tauri/src/steampoll_dispatch.rs`
- **Commit:** `e7d794092`

**2. [Rule 1 - Bug] The old per-subsystem overrun lines would have contaminated the live gate**
- **Found during:** Task 1
- **Issue:** `[shell] depot jobs still running at exit deadline: N` and `[shell] steampoll polls still running at exit deadline: N` contain the substring `still running at exit deadline: ` that 83-HUMAN-UAT scores as absent unless a drain overran.
- **Fix:** both lines deleted; the single `still running at exit deadline: <names> (<count>)` report replaces them, and a gate asserts neither old line returns.
- **Commit:** `e7d794092`

**3. [Rule 1 - Bug] The plan's C4b wording did not match the code**
- **Found during:** Task 1
- **Issue:** the plan asks C4b to find `libc::kill(` followed by `-` inside `terminate_group`'s body; in `kill_tree.rs` the negated-pgid kill is in `signal_group`, and `terminate_group` only calls it, and `SIGKILL` appears in `terminate_group` only inside a log string (a vacuous match).
- **Fix:** C4b orders `libc::SIGTERM`, `try_wait()`, `kill_process_group(pgid)` and `child.wait()` inside `terminate_group`, then pins `libc::kill(-pgid` and `pgid <= 1` in `signal_group` and `signal_group(pgid, libc::SIGKILL)` in `kill_process_group`. The test module is cut at its indented `#[cfg(test)]`, since `stripRustTestModules` only sees column-0 modules.
- **Commit:** `e7d794092`

**Total deviations:** 3 auto-fixed (3 Rule 1). **Impact:** all three tighten the plan's own D-12 and gate goals; no scope change.

## Issues Encountered

- A concurrent commit by another session moved HEAD during the first `git commit` ("cannot lock ref 'HEAD'"); the staged index was intact and the retry succeeded.
- Prettier re-padded the whole Conventions table in CLAUDE.md (the new row is wider), so the diff touches every table row; the content of the other rows is unchanged. Only the Conventions and Project Skills regions changed.

## Known Stubs

None.

## Unix paths not compiled or run on this host

The host is `x86_64-pc-windows-msvc` only. The unix arm of `shutdown_child` (`terminate_group(pgid, &mut child, grace)` with `&mut MutexGuard<Child>` deref-coercing to `&mut Child`), `terminate_group` and `kill_tree`'s unix tests, the reaper's unix legs and the `#[cfg(unix)]` socket removal in `finish` are `cfg(unix)` and were checked here only by the source-text gates and reading. Plan 83-10's macOS and Linux CI legs compile and run them; 83-11 items 4 and 5 observe the two log lines and the exit time in the live app.

## Threat Flags

None. No new network endpoint, auth path or trust-boundary file access; the exit logs carry static names and counts only (T-83-32).

## Next Phase Readiness

Ready for 83-10 (three-leg CI run) and 83-11 (live gate). Open for 83-11 item 4: research A9 (depot finalize inside 3.5 s) and `exit finished in <ms> ms` at most 5000.

## Self-Check: PASSED

All eleven modified files exist, commits `e7d794092` and `8d7be2c25` are in the log, and every acceptance criterion and the plan-level jest, cargo and prettier checks above were re-run green.
