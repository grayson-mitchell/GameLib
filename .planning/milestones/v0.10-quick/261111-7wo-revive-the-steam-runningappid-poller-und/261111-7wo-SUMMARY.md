---
phase: quick-261111-7wo
plan: 01
subsystem: sidecar / steam
tags: [steam, sidecar, boot, running-poll, windows, launch-watch]
status: complete
requires:
  - 66.2 injected ProcessRunner/Clock (readRunningAppId already on the runner)
  - quick 261111-9mj steamLaunchWatch (pollerReports hand-off)
provides:
  - "'steam-running-poll' boot step: the RunningAppID poller runs from every sidecar boot"
  - "stopRunningGamePoll dep of releaseOnStdinEof"
affects:
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/stdinEofRelease.ts
  - src/backend/testUtils/testServices.ts
key-files:
  modified:
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/stdinEofRelease.ts
    - src/backend/testUtils/testServices.ts
    - src/backend/sidecar/__tests__/bootstrap.test.ts
    - src/backend/sidecar/__tests__/bootSourceShape.test.ts
    - src/backend/sidecar/__tests__/stdinEofRelease.test.ts
    - src/backend/storeManagers/steam/__tests__/library.runningPoll.test.ts
    - src/backend/storeManagers/steam/library/index.ts
    - src/backend/storeManagers/steam/steamProcesses.ts
    - src/backend/storeManagers/steam/steamLaunchWatch.ts
    - .planning/todos/pending/2026-11-11-revive-steam-runningappid-poller-under-tauri.md
  created:
    - .planning/todos/pending/2026-11-11-windows-steam-launch-stop-is-a-no-op.md
decisions:
  - "P-01: no runner move; readRunningAppId was already on the injected ProcessRunner"
  - "P-02: dedicated 'steam-running-poll' boot step, no JEST_WORKER_ID guard"
  - "P-03: stop at stdin EOF via a new required releaseOnStdinEof dep, log text unchanged"
  - "P-04: pin the observed watch-first frame sequence; no cross-sender dedupe"
  - "P-05: createTestSteamProcesses().runningPoll inert by default"
  - "P-06: Windows Stop captured as a pending todo only"
metrics:
  tasks: 3
  completed: 2026-11-11
actuals:
  tokens: 4500
  tasks: 3
  commits: 3
plan_head_before: fee5617e8913bfeb8cf3363afb1acfe1c537a9d2
plan_head_after: 4661ccf96562bb11e7f8ab5c39b55534f39f7bc3
requirements-completed: []
---

# Phase quick-261111-7wo Plan 01: Revive the Steam RunningAppID poller Summary

The RunningAppID poller now starts from a dedicated `'steam-running-poll'` sidecar boot step and stops at stdin EOF, so Windows `steam://launch` launches reach Playing and return to Play, with the poller/launch-watch interplay pinned in exact-frame tests.

## What changed

- **Boot step** (`bootstrap.ts`): `'steam-running-poll'` sits after `'installed-json-watcher'` and before `'playtime-lock-clear'`, in `BOOT_STEP_NAMES` and `buildBootSteps()`. It calls `requireSteamProcesses(state).runningPoll.start()` (5000 ms default) in a try/catch with `logWarning`, so it can never fail boot. No `JEST_WORKER_ID` guard: every test boot carries a fake clock.
- **EOF stop** (`stdinEofRelease.ts`): new required dep `stopRunningGamePoll`, called once in its own try/catch after `stopAllSteamDownloadMonitors()` and before `SteamUser.releaseForShutdown()`. The poller is documented as NOT a fourth loop-holder (unref'd clock timer). The `'[sidecar] stdin closed: releasing Steam CM session, ...'` log text is byte-identical (grep count 1, plus a new test pinning it). The `'rpc-server'` step passes `() => services.steamProcesses.runningPoll.stop()`.
- **Dead start removed**: `SteamLibraryManager.init()` no longer starts the poller; the boot step is the single owner.
- **Test double**: `createTestSteamProcesses().runningPoll` is inert by default (reuses `createInertSteamProcesses().runningPoll`), like `macSteamOffline`.
- **Comments corrected**: `bootstrap.ts` `'command-runner'` step, `steamProcesses.ts` header, `steamLaunchWatch.ts` "Why" paragraph, and the pointer comment in `init()`.
- **Todos**: the source todo gains a `## Status (quick 261111-7wo)` section and stays `ready: live-gate`; the new pending todo `2026-11-11-windows-steam-launch-stop-is-a-no-op.md` records the Windows Stop gap (`severity: medium`, `platform: windows`, `ready: live-gate`). No code for Stop.

## Decisions restated

**P-01 (runner/DI): no move needed, the todo's premise was stale.** `readRunningAppId()` already probes through the injected `ProcessRunner.run` (Phase 66.2 plan 06); `runningPoll.ts` imports no `child_process`. It was not touched. The ceilings stay unchanged because the plan adds no `child_process` site, no counted module state and no `jest.mock`.

**P-04 (duplicate `playing`, accepted).** Where both senders can report (Linux reaper scan, or a Mac Steam that ever writes RunningAppID), the wire carries `[watch playing, poller playing, poller done]`: the watch shows `playing` at its 2 s scan, the poller's first 5 s tick sends a second `playing`, the watch then sees `pollerReports` and ends quietly with no `done`, and the poller sends the single `done`. `libraryState.handleGameStatus` already drops the repeated status (collapses to `[playing, done]`). A cross-sender dedupe (shared "last status sent") was NOT added because it would suppress a legitimate `playing` after a `done` sent by another route (Stop, `bottleProcessMonitor`, the launcher). On Windows (watch is `unsupported-platform`) and on today's macOS (poller reads 0) the wire carries exactly one `playing` and one `done`.

## Tests

- **Tracer (RED observed first, then GREEN):** `bootstrap.test.ts` "steam running-game poller boot wiring": a booted win32 sidecar on the fake clock with scripted `reg` (0x407e0 then repeating 0x0) makes zero `reg` calls at boot, exactly one `playing` frame after the first 5000 ms advance, then exactly one `done` after the second. No new `jest.mock`.
- **EOF (RED observed, then GREEN):** `stdinEofRelease.test.ts` covers not called while open, called exactly once despite `'end'` and `'close'`, a throwing stop still lets `releaseForShutdown` and `destroyOutboundHttp` run, and the unchanged log line.
- **Coexistence (pin existing behaviour; passed against unchanged code):** `library.runningPoll.test.ts` "poller + launch watch coexistence": C1 poller-first `[poller playing, poller done]` (watch sends nothing, zero ps calls), C2 watch-first `[watch playing, poller playing, poller done]` with exactly one `done`, last, collapsing to `[playing, done]`, C3 win32 `[playing, done]` from the poller alone via the real `readRunningAppId` over scripted `reg`. Fixture paths are built from the host `path` module, so they pass on Windows and ubuntu. File stays at 4 `jest.mock`s.
- `bootSourceShape.test.ts` anchor `'steam-running-poll'` added between `'online-monitor'` and `'rosetta'`.

## Baseline vs new Windows-local failures

- `bootstrap.test.ts`: baseline failures "boot-time asset-root self-check ... healthy arm" and "legacy-zoom cleanup removes seeded data under ctx.paths.userData" fail as before. A third failure, a rosetta-step test (`probes exactly once per boot` / `does not probe before the i18n promise...`), intermittently appears in the full-file run. It is the same Windows `EPERM` rename of `gamelib.log` (an in-flight append from a prior boot), and it reproduces with the new test excluded (`-t "^(?!.*running-game poller)"`, 1 of 3 runs). It is a pre-existing Windows-local flake, not caused by this change. The new test passes every run.
- `steamLaunchWatch.test.ts`: T1, T2, T3, T7, T8, T9, T10 fail exactly as the baseline (POSIX fixture literals); untouched.
- No NEW failures. `stdinEofRelease.test.ts` (11 tests), `library.runningPoll.test.ts` (23), `bootSourceShape.test.ts` and `library.test.ts` all pass.

## Gates

- `pnpm backend-di-ceilings`: `PASS moduleState=233 (116 files) childProcess=1 (1 files) jestMock=2363 (447 files) sanctioned=3` (identical to the planning-time baseline).
- `pnpm steam-line-ceiling`: PASS (170 files scanned). `pnpm planning-gates`: 12/12. `pnpm codecheck`: clean. `pnpm lint`: 0 errors, `production: PASS | tests: PASS`. `npx prettier --check` clean on every `src/` path changed.

## Deviations from Plan

**1. [Rule 3 - Blocking] Boot test flush.** The tracer ends with `await flush()` so the poller's fire-and-forget log appends land before the next boot rotates the shared `gamelib.log` on Windows. Test-only.

**2. [Rule 3 - Blocking] C2 time stepping.** The coexistence `step()` advances the shared fake clock in 1000 ms increments; one 3000 ms jump made the watch's chained timers re-arm from the wrong time. Test-only.

**3. Comment wording.** The corrected `bootstrap.ts` and `steamProcesses.ts` comments avoid the literal phrase "starts in", so the plan's stale-comment re-grep returns nothing.

**4. Pre-commit protected-branch assertion.** The checkout is on `main`, no worktree, `git.branching_strategy: "none"`, and the orchestrator directed per-task commits in place; repo history is direct-to-main. The commits were made on `main` as directed rather than creating a branch.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or trust-boundary file access; the boot step reuses the existing bounded `reg`/`ps` probe (T-7wo-01 mitigated by unref'd clock timer, bounded unref'd probes, nothing at boot, stop at EOF).

## Not closed by this plan: operator live gate

The source todo `2026-11-11-revive-steam-runningappid-poller-under-tauri.md` stays in `pending/` with `ready: live-gate`. It closes only when the operator's live gate passes:

- (a) Windows: launch a Steam title from GameLib. The card shows Playing, and returns to Play after quitting from inside the game. gamelib.log shows 'Steam: started running-game poller' at boot and 'running-game poller: game <id> started/stopped'.
- (b) Mac: WazHack 264160 still gets exactly one Playing and one Done, with no flicker.

Observation for the gate: a reg/ps probe that times out reads as 0, so it would show as a `done` followed by a `playing` on the next tick, a flicker from the poller alone.

## Commits

- `894398840` feat: start the RunningAppID poller from a sidecar boot step (tracer)
- `4892a7e38` feat: stop the running-game poller at stdin EOF and pin poller/launch-watch coexistence
- `4661ccf96` refactor: retire the dead init() poller start, correct stale comments, record the Windows Stop gap

## Self-Check: PASSED

All 12 modified/created files exist, and commits `894398840`, `4892a7e38` and `4661ccf96` are in `git log`.
