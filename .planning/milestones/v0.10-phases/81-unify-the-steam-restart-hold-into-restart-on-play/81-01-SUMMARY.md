---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 01
subsystem: steam-polling
status: complete
tags: [rust, tokio, steam, adoption, state-event, zod]
requires: []
provides:
  - StateEvent::AdoptionState (wire kind adoptionState) on both sides of the wire, with fixture, zod arm and TS handler that clears the pending-adoption record
  - gamelib-steampoll adoption module (AdoptionWatch, AdoptionWatchArgs, AdoptionReading, validate_watch_args, acf_rewritten_by_steam)
  - PollKind::Adoption singleton task keyed "adoption"
affects: [81-02, 81-03, 81-04, 81-05, 81-08, 81-09]
tech-stack:
  added: []
  patterns: [Rust observes then typed state event then TS applies (Phase 80 D-02/D-05), RunningPoll gen/token lifecycle, content-only file compare]
key-files:
  created:
    - src-tauri/crates/gamelib-steampoll/src/adoption.rs
    - src-tauri/crates/gamelib-steampoll/tests/adoption.rs
  modified:
    - src-tauri/crates/gamelib-steampoll/src/events.rs
    - src-tauri/crates/gamelib-steampoll/src/constants.rs
    - src-tauri/crates/gamelib-steampoll/src/registry.rs
    - src-tauri/crates/gamelib-steampoll/src/lib.rs
    - src-tauri/crates/gamelib-steampoll/tests/contracts.rs
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/state-events.json
    - src/common/types/ipc/sidecarInternal.ts
    - src/backend/sidecar/steamPollEventRegistration.ts
    - src/backend/sidecar/__tests__/steamPollEventRegistration.test.ts
    - src/backend/sidecar/__tests__/steamPollStateEventParity.test.ts
decisions:
  - "ACF adoption compare is content-only (no mtime): TS statSync and Rust SystemTime milliseconds are not bit-equal, so a timestamp compare would read GameLib's own StateFlags 4 ACF as adopted"
  - "pid-change evidence is macOS only; spikes 087/088 r4 show sign-out restarts Steam on Windows and Linux"
  - "adoptionState is not an install-state kind: it uses the per-(appId, kind) seq guard"
metrics:
  tasks: 2
  files: 12
  completed: 2026-11-18
commits: 2
plan_head_before: f98f1d5f71d47be80d43e6f0b2fd1173be285d04
plan_head_after: 9fb1da91c13e19b3663345fd0a223723f40314c8
actuals:
  tokens: 85000
  tasks: 2
  commits: 2
---

# Phase 81 Plan 01: adoptionState event and the Rust adoption-watch task Summary

The `adoptionState` state event now round-trips from a Rust variant through the wire fixture and zod schema to a TS handler that clears the pending-adoption record, and `gamelib-steampoll` has a singleton adoption-watch task that detects Steam's ACF rewrite on every OS and a Steam restart (pid gone) on macOS only.

## Commits

- ba12ce0f8: feat(81-01) adoptionState event end to end (tracer)
- 9fb1da91c: feat(81-01) adoption-watch task with ACF-rewrite and macOS pid evidence

## What was built

- **Task 1 (tracer).** `StateEvent::AdoptionState { app_id, seq, adopted, signed_in }` with kind, app_id and seq arms; two fixture samples (regenerated via `GAMELIB_REGEN_STATE_EVENTS=1`, not hand-edited); a strict zod arm; `case 'adoptionState'` in the registration handler clearing the record via `clearPendingAdoption` when `adopted` is true. `signedIn` is carried but unused until 81-09. Not added to `INSTALL_STATE_KINDS`.
- **Task 2.** `adoption.rs`: `AdoptionWatch` (`watch`, `unwatch`, `watched_app_ids`, `read`), validation of the watch args (T-81-01), `acf_rewritten_by_steam` (content differs, StateFlags bit 4, real buildid), a 5 s `Delay` tick task registered as `PollKind::Adoption` that emits `AdoptionState` only when `(adopted, signedIn)` changes, removes adopted entries and exits when none remain. 16 paused-time tests in `tests/adoption.rs`.

## Verification

`cargo test -p gamelib-steampoll --test contracts --test adoption` (adoption 17, contracts 11 passed), `cargo clippy --all-targets -D warnings` clean, `cargo fmt -p gamelib-steampoll --check` clean; Jest `steamPollEventRegistration`, `steamPollStateEventParity`, `diPhaseGates` 191 tests passed. Re-confirmed green before committing. The pre-commit hook ran on both commits (ipc contract up to date).

## Deviations from Plan

**1. [TDD order] Task 2 written implementation-first.** Task 2's implementation preceded its tests (no RED run). Mitigated by a mutation check: forcing pid evidence on for all platforms made the Linux/Windows pid test fail, restoring made it pass. Task 1's RED was observed. The plan is `type: execute`, so no plan-level TDD gate applies.

**2. [Ambiguity, no impact] Task 1 reply wording.** The behaviour bullet said "no record replies {applied:true}" while the action said "always return {applied:true, title}". Followed the action; the test asserts `applied` and that nothing is written.

**3. [Out of scope] Pre-existing gate failures, logged to `deferred-items.md`.** `pnpm backend-di-ceilings` (launchWithoutSteam.test.ts, NativePortInfo.test.tsx, LaunchWithoutSteam.test.tsx) and `pnpm find-deadcode` (NativePortDataStyle, NativePortMac) are red and unrelated to steamPoll. Pre-existing eslint `import-x/no-duplicates` warnings on `installRoot` in `steamPollEventRegistration.ts` were not introduced here.

**4. [Process] Commit guard.** The first executor could not commit because of the protected-branch guard; the operator then set `git.allow_default_branch_commits: true`, and this continuation committed both tasks by explicit paths.

## Known Stubs

None. `signedIn` is intentionally unused by the handler until 81-09 (documented in a code comment); the Rust side emits `None` until 81-03/81-04.

## Threat Flags

None beyond the plan's threat model (T-81-01 through T-81-05 mitigated as specified).

## Self-Check: PASSED

Created files and both commits (ba12ce0f8, 9fb1da91c) verified present.
