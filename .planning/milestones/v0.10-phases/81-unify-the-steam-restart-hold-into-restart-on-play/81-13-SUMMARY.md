---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 13
subsystem: steam-polling
status: complete
tags: [steam, boot-migration, adoption-watch, state-events, ipc-contract]
requires: [81-12]
provides:
  - migrateRestartHolds in adoptionWatch.ts and the migrate-then-resume boot step
  - rearmSettled removed from the Rust enum, the wire fixture, the zod union, the handler and the parity table
affects: [81-14]
tech-stack:
  added: []
  patterns: [boot step chains two bounded rustInvoke halves in one detached promise, discard only after every record was handled]
key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/adoptionWatch.ts
    - src/backend/storeManagers/steam/__tests__/adoptionWatch.test.ts
    - src/backend/sidecar/bootstrap.ts
    - src-tauri/crates/gamelib-steampoll/src/events.rs
    - src-tauri/crates/gamelib-steampoll/src/outbox.rs
    - src-tauri/crates/gamelib-steampoll/tests/contracts.rs
    - src-tauri/crates/gamelib-steampoll/tests/outbox.rs
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/state-events.json
    - src/common/types/ipc/sidecarInternal.ts
    - src/backend/sidecar/steamPollEventRegistration.ts
    - src/backend/sidecar/__tests__/steamPollEventRegistration.test.ts
    - src/backend/sidecar/__tests__/steamPollStateEventParity.test.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/__tests__/ipcSchemas/sidecarInternal.test.ts
    - src/backend/storeManagers/steam/library/index.ts
decisions:
  - "migrateRestartHolds keeps steam_restart_hold.json when any hold could not be evaluated (the library list or find_acf rejected, or the Rust ACF read failed): nothing was learned, so discarding would lose the hold; the next boot retries"
  - "getSteamLibraries is called with strict:true in the migration so a rejected library list cannot read as 'every ACF is gone'"
  - "StateEvent::app_id returns &str (not Option) because every remaining event carries an appId; the outbox call sites and one outbox test lost their unwrap_or"
metrics:
  tasks: 2
  files: 15
  completed: 2026-11-18
commits: 2
plan_head_before: e6fd67d65bf72ac5b0ddac86c242df3b6df64190
plan_head_after: a049d9959931da9132c8b608d3327e4159195f8b
actuals:
  tokens: 28000
  tasks: 2
  commits: 2
---

# Phase 81 Plan 13: boot hold migration and rearmSettled removal Summary

An upgrade from a build that persisted "Restart Steam to finish" holds now turns each still-unadopted hold into a watched pending-adoption record (the restart-on-Play note) and deletes `steam_restart_hold.json`; the `rearmSettled` re-arm event is gone from both sides of the wire.

## Commits

- 9c3fbed3a: feat(81-13) boot migrates persisted restart holds into watched pending records (tracer)
- a049d9959: refactor(81-13) remove rearmSettled from both sides of the wire

## What was built

- **`migrateRestartHolds(deps)`** (adoptionWatch.ts). `steampoll_hold_drain` via `invokeSteamPoll` (no args), then per hold: `steamfiles_find_acf` over `getSteamLibraries(deps, {strict: true})` joined with `steamapps`; not found is `acf-gone`; `readAcfSnapshot` null is `acf-gone`; the candidate `{steamPid, manifestPath, baseline: snapshot, recordedAt: recordedAtMs}` goes through `readSteamAdoption` and an adopted reading is `already-adopted` (RESEARCH Pitfall 5); otherwise `recordAndWatchPendingAdoption` (overwrites an existing record for the appId, so a re-run after a crash is idempotent). `steampoll_hold_discard` runs exactly once after every record was handled. Logs carry appId and outcome only. Never rejects, resolves the count written, opens no URL and signals nothing.
- **Boot.** The `steam-adoption-resume` step is now `void migrateRestartHolds(deps).then(() => resumeAdoptionWatches(deps)).catch(...)`, one detached chain of bounded rustInvoke calls, no timer or handle (sidecar exit contract). The step name and position are unchanged, so the ordering test (directly after `mac-steam-online-restore`, after `rpc-server`) holds; the comment states D-12, D-13 and the crash-safety rule.
- **`rearmSettled` removal (D-11).** `StateEvent::RearmSettled`, its `kind`/`app_id`/`seq` arms, the contracts.rs samples and the fixture entry (regenerated with `GAMELIB_REGEN_STATE_EVENTS=1`, kind count 9 to 8), the zod arm, the handler case and `refreshInstallState` parameter, the `handlers.ts` argument and its import, the parity KINDS entry, and the two handler tests. The schema test now lists a `rearmSettled` payload under `invalid`, and `steamPollEventRegistration.test.ts` asserts `validateInbound` rejects it. The `library/index.ts` comment describes the removed re-arm and points at the migration. With the `RearmSettled` arm gone every event has an appId, so `app_id()` returns `&str`, the `'appId' in ev` branches in the handler collapse, and `Outbox::note_applied` loses its `if let`.

## Verification

- `cargo test -p gamelib-steampoll` (all test binaries ok), `cargo test -p gamelib-steampoll-cli` (9 + 1 ok), `cargo test --bin gamelib-shell steampoll` (17 ok), `cargo clippy -p gamelib-steampoll --all-targets -D warnings` clean, `cargo fmt -p gamelib-steampoll --check` clean.
- `pnpm exec jest src/backend/storeManagers/steam src/backend/sidecar src/backend/__tests__ src/common`: 10289 passed, 2 failed, both logged pre-existing reds (`acfUpdateReplay`, `storeKinds`).
- `pnpm codecheck` clean. `pnpm -s backend-di-ceilings` 4 FAIL lines and `pnpm -s find-deadcode` 2 FAIL lines, all the logged reds (launchWithoutSteam, NoticeStack, NativePortInfo, LaunchWithoutSteam tests; NativePortDataStyle, NativePortMac); nothing from this plan. Prettier clean and none of the touched TS or JSON files is prettier-ignored. ESLint on the touched TS files: 0 errors (warnings pre-existing in bootstrap.ts). The commit hook confirmed `src-tauri/src/ipc_contract.rs` is up to date.
- Acceptance greps: `migrateRestartHolds` in bootstrap.ts 2, `steam://` in adoptionWatch.ts 0, `RearmSettled` in events.rs 0, `rearmSettled` in the four listed files 0, `refreshInstallState` in steamPollEventRegistration.ts only in the header caveat prose.

TDD note: Task 1 was red-first (11 of 29 failing on the missing export, the 18 existing passing) then green. Task 2 is a removal; the parity "fixture covers every kind" check and the compile-time exhaustive KINDS table were the drift signal, so no separate red was observed.

## Deviations from Plan

**1. [Rule 2 - Correctness] discard is skipped when a hold could not be evaluated.** The behavior list says discard runs once after every record is handled. A record whose library list, `find_acf` or Rust ACF read rejected was not learned about, so treating it as handled and discarding would drop a valid hold on a transient shell failure. Such a record is `unevaluated` and keeps the file for the next boot (the same rule as a rejected or malformed drain). The `getSteamLibraries` call is `strict` for the same reason. Test: "a hold that could not be evaluated keeps the file".
- **Files:** src/backend/storeManagers/steam/adoptionWatch.ts, __tests__/adoptionWatch.test.ts
- **Commit:** 9c3fbed3a

**2. [Plan latitude] `app_id()` signature changed to `&str`.** The plan allowed keeping `Option<&str>`; the ripple was five call sites in `outbox.rs` (in the plan's file list) plus one line in `tests/outbox.rs` (not listed), so the always-Some option was removed. **Files:** events.rs, outbox.rs, tests/outbox.rs. **Commit:** a049d9959.

## Deferred / pre-existing

None new. The reds in `deferred-items.md` are unchanged.

## Known Stubs

None.

## Threat Flags

None. T-81-34 holds: Rust validates records (81-12), migration never quits or signals Steam, and Play re-reads the ACF and the Rust adoption read. T-81-36: the file is discarded only after a successful drain and every hold evaluated; a re-run overwrites the same pending records and adopted candidates are skipped. T-81-42: the outbox is in-memory per shell process. T-81-56: plans 81-10 through 81-13 now exist together; nothing was tagged or published (release coupling, operator decision 2026-11-17).

## Self-Check: PASSED

Both commits (9c3fbed3a, a049d9959) are ancestors of HEAD; `adoptionWatch.ts`, `adoptionWatch.test.ts` and the fixture exist; acceptance greps as listed.
