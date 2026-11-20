---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 02
subsystem: steam-polling
tags: [parity, jest, timelines, i18next, steam]
requires: [80-01]
provides:
  - timeline + stream format (timeline.ts, timelines/README.md)
  - runTsTimeline(timeline) driving the real TS loops over fake deps and a fake clock
  - 39-scenario corpus and frozen TS streams (expected-ts/) for the Rust replay (plans 17, 19)
affects: [80-17, 80-19, 80-30, 80-31]
tech-stack:
  added: []
  patterns: [jest.mock factories in a helper module via requireActual, global setInterval/Date.now patched onto FakeClock, golden files behind an env var]
key-files:
  created:
    - src/backend/testUtils/steamPollReplay/timeline.ts
    - src/backend/testUtils/steamPollReplay/tsDriver.ts
    - src/backend/testUtils/steamPollReplay/mocks.ts
    - src/backend/__tests__/steamPollTsDriver.test.ts
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/timelines/README.md
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/timelines/*.json (39)
    - src-tauri/crates/gamelib-steampoll/tests/fixtures/expected-ts/*.json (39)
decisions:
  - "Stream `file` records use RecordingHost's real shape {op, appId, record}, not the plan's {path, op}"
  - "Notify records carry body (real en text) plus key/default/params; RecordingHost today serialises only the key, plan 17 must reconcile"
  - "pushGameToLibrary is not recorded: it is the sidecar's own push, covered by the preceding state record"
metrics:
  tasks: 2
  files: 83
  completed: 2026-11-16
---

# Phase 80 Plan 02: TS parity harness Summary

The TS half of the D-14 parity harness: a timeline format, a driver that runs the real `startInstallPolling` / `pollInstallOnce` / `pollUpdateOnce` / `startUninstallPolling` / `createRunningPoll` / `rearmPersistedSteamRestartHolds` loops under a fake clock, 39 scenarios, and their frozen output streams. `pnpm exec jest src/backend/__tests__/steamPollTsDriver.test.ts` is green (80 tests), `pnpm codecheck`, eslint and prettier clean.

## Commits

- ec088e2b1: timeline types, TS driver, mock factories, README
- b32fc4035: corpus, frozen streams, Jest test

## Branch proof (one record per timeline, read from the generated streams)

Install:
- install-grace-expiry: single `gameStatusUpdate done` after 20 absent ticks.
- install-max-ticks: progress emitted at tick 1 and tick 7199 (20%), none for tick 7201 (30%): silent stop at 7200.
- install-max-ticks-holding-release: `D:clear` (hold released by the cap) then `state installed` + done + Installation Finished.
- install-manifest-gone: `installing/managedBySteam` (start), progress, then `done` after 10 absent ticks.
- install-no-activity-signed-out-mac: `done` then `steamRequestNotice kind install-not-started` (darwin).
- install-native-handoff-upgrade: `state installed source=bottle` after the native->bottle retarget, plus the depotSkipped and Restart Steam notices (skippedDepots adopted).
- install-restart-hold-release: `file record`, waiting-for-restart x5, restart notice, then `file clear` + `state installed` after `adoptedBySteamClient`.
- install-restart-hold-steam-not-running: `file record`, hold, then `file clear` + installed once steamPids is empty.
- install-restart-hold-unprobed-steam-absent: `file clear` then `state installed` at once (no hold armed).
- install-steam-paused-stall: `installing/steam-paused` appears on the 4th frozen tick and clears when bytes advance.
- install-progress-nettop: progress `10%@2.00` with the ACF frozen at 0, `99%` cap at full.
- install-bridge-finishing: `state installed source=bridge` then `installing/steam-bridge-finishing`, no finished notice.
- install-bridge-finalized-silent: `state installed` only; no status emitted.
- install-depot-skipped: finished, `steam.download.notify.depotSkipped` with `2001, 2002`, then the Restart Steam notice.
- install-installed-mac-arch-32: `state macArchVerdict 32` after the installed flow.
- install-delegated-cancel: third tick `cancelDelegated` yields `gameStatusUpdate done`, nothing after.
- install-bottle-handoff-1026-incomplete: `file clear`, `state installIncomplete`, `done` (bottle at 1026).
- install-handoff-1026-waiting: `installing/steam-waiting-for-restart` each tick, the restart notice exactly once.

Update:
- update-bit4-alone-never-completes: 40 `updating` records, then `updateDone completed=false` + done (never completes).
- update-build-change-completes: `state updateDone completed=true`, `updating`, `done` on the build change.
- update-abandoned-20-settled: 1 + 19 `updating` records, then `updateDone completed=false` + done on the 20th settled tick.
- update-quiet-end-no-activity: `updateDone completed=false` + done at tick 40 with no manifest.
- update-installapp-retry-cadence: 49 `updating` records before the quiet end (vs 40 without the successful 3rd-cadence retry at tick 9).

Uninstall:
- uninstall-flag-0x800: `uninstalling` x2, then `state uninstalled` (survivor null), done, "Uninstalled".
- uninstall-bit4-cleared: silent on bit-4-set, `uninstalling` once the manifest is not installed, then completes.
- uninstall-manifest-gone: `state uninstalled`, done, notice on the first tick.
- uninstall-copy-survives: `state uninstalled` with `survivor.source=bottle`, copySurvives notice.
- uninstall-bridge-authoritative: survivor is `bridge` although a bottle copy also exists (bottle ignored).
- uninstall-bottle-forced-windows-cleared: `state forcedWindowsViaBottleCleared` before `uninstalled` (bottle source).
- uninstall-no-activity: `done` + `steamRequestNotice uninstall-not-started` at tick 40.

Running:
- running-one-playing-one-done: exactly one `playing` and one `done`.
- running-claim-drain-20s: no `playing` while claimed; `playing` republished once, 20 s after the terminal release; then `done`.
- running-windows-missing-value: `playing` then `done` (null reg value reads as 0).

Rearm:
- rearm-arm: waiting-for-restart x3, `file clear`, `state installed`, done after Steam exits (resumed tick count).
- rearm-drop-expired: `file clear` (age over MAX_TICKS*3000).
- rearm-drop-pid-reused: `file clear` (token mismatch).
- rearm-unknown-probe: empty stream by design (`expectEmptyStream`): nothing armed, record kept.

Transport (Rust-only fields):
- sidecar-not-ready-latest-wins, ack-timeout-emits-anyway: TS baseline is a plain completion (`state installed`, done, finished); the queue and ack wait have no TS counterpart (explained differences, README).

## Deviations from Plan

**1. [Rule 3 - Blocking] Driver runs only inside a Jest suite with module mocks.** The plan said "runs in Jest and in a script". The real loops import the sidecar's module graph (electron-era stores, utils), which loads only under the mock set; `mocks.ts` exposes the factories and the test wires them. The driver header documents this. No script entry exists.

**2. [Rule 1 - Format] `monitor` is the live reading, not raw nettop rows.** Plan Tick had `monitor: {nettopRows, contentLog}`; the poll only consumes the monitor's output, and the raw parsing belongs to plan 06's ported tests. Tick `monitor` is `{bytesDone, bytesTotal, speedBytesPerSec?} | null`.

**3. [Rule 2 - Missing fields] Added Tick fields** the corpus needs: `bridgeFinalized`, `startAgain`, `cancelDelegated`, `runningHold`, `runningRelease`, `repeat` (run-length, for the 7200-tick scenarios), and Timeline `expectEmptyStream`. `store` gained `metadata` and `bridgeAllowlisted`. `running: null` models a missing Windows value.

**4. `file` record shape** follows RecordingHost (`{op, appId, record}`) instead of the plan's `{path, op}`; `notify` additionally carries `key/default/params`.

**5. Corpus is 39 timelines, not 34.** Extra scenarios for branches found while reading the loops: restart-hold-unprobed-steam-absent, bridge-finalized-silent, bottle-handoff-1026-incomplete, handoff-1026-waiting, uninstall-bottle-forced-windows-cleared.

**6.** `ack` and `sidecarReadyAtTick` are Rust-replay inputs only (the TS loops have no outbox); `bridgeUninstalled` and `rearmSettled` have no TS-produced record (documented in the README normalisation table).

## Notes for plans 17 and 19

- `RecordingHost` serialises `notify` as `{title, body}` with `body = key` for key-based text; the frozen TS streams use the rendered English `body` plus `key/default/params`. Plan 17 must render through `gamelib-i18n` (or the diff normalises both to key + params).
- `clearForcedWindowsViaBottle` is recorded unconditionally on a confirmed-absent bottle or bridge tick (the real TS call only writes when the stored verdict is set).
- `release hold` clears the store record even when none exists (TS `store.delete`), so several streams contain `file clear` records with no preceding `record`.

## Known Stubs

None.

## Threat Flags

None. T-80-04: timelines use appId 1000, `Test Game` and `/fake/...` paths only. T-80-05: goldens are written only when `UPDATE_STEAMPOLL_GOLDENS=1`; a plain run compares and the orphan check fails on any missing or extra file.

## Self-Check: PASSED

Created files exist, both commits (ec088e2b1, b32fc4035) present, 39 timelines and 39 expected-ts files match one-to-one.
