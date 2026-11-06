---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 22
subsystem: steam-engine-install-progress
tags: [gap-closure, G1, IN-05, engine-download, status-label]
requires: [59-14, 59-17, 59-21]
provides:
  - phase-encoded engine-download status context
  - engineDownloadLabel shared formatter
affects: [steam install flow, Library card, game page, console LaunchOverlay]
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/frontend/hooks/constants.ts
    - src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx
    - src/frontend/screens/Game/GamePage/components/MainButton.tsx
    - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
  created:
    - src/frontend/hooks/engineDownloadLabel.ts
    - src/frontend/hooks/__tests__/engineDownloadLabel.test.ts
decisions:
  - engineDownloadLabel lives in its own module (hooks/engineDownloadLabel.ts) and is re-exported from constants.ts, because constants.ts reads window.localStorage at import time and broke the MainButton/GameStatus component tests.
  - The status returns to 'installing' once the engine bottle is provisioned; the engine-download status is the only thing that was ever left standing.
metrics:
  completed: 2026-11-02
---

# Phase 59 Plan 22: Engine download progress (G1, IN-05) Summary

Engine status now carries one size-weighted overall percent plus verify, unpack and set-up phases, hands back to `installing` once the bottle exists, and every surface renders it through one formatter.

## G1 root cause: FOUND (operator-confirmed 2026-11-02)

Operator-confirmed on 2026-11-02 in a third live run. Dungeons of Dredmor (98800) went through the i386-recovery path with no CrossOver and the engine moved aside. The run was a clean sidecar rebuild with the trace removed. The phases showed in order, and the install button was greyed out at the right point. The operator then asked for one change: the button should read "Installing…" rather than repeat the phase that GameStatus already shows above it. The orchestrator made that change in `158bc680e`, with the test updated. Two live traces came before the confirmation:

- **Run 1 (Asgaard, normal queue install):** all hops delivered; backend producer contract was wrong (resets, 0% for verify/extract, no hand-back). Fixed in eea11d3ab.
- **Run 2 (Dredmor 98800, i386 recovery; re-test after fix, all-statuses trace):** every `gameStatusUpdate` frame reached `handleGameStatus` and `hasStatus` with the right status and context (installing -> downloading:0 -> verifying -> extracting -> downloading:1..100 -> verifying -> extracting -> setting-up -> installing -> done). Not an overwrite and not a dropped frame. The remaining defect was the **not-installed install button**: `MainButton.getButtonLabel` had no `downloadingEngine` branch, so on a title that is not yet installed the button read "Install" and was enabled for the whole engine setup (the operator's observation). `GameStatus` already rendered the phase. Fixed in 43829dc3e with `MainButton.engineDownloading.test.tsx` (RED seen: 4 cases read "Install"), and `downloadingEngine` added to `disabledInstallButtons`.

Original heading text follows.

**Hop:** the backend producer, `SteamGame.ensureBuiltInEngineForInstall` in `src/backend/storeManagers/steam/games.ts` (the status contract it emitted), not the transport or the renderer.

**Evidence (live trace, Asgaard 332380, 2026-11-02 15:25-15:26, `[g1-trace]` at six hops):** every hop delivered every frame in order: backend send, sidecar push, preload slot, `GlobalState.handleGameStatus` (prev/context chain 0 -> 5 -> 0 -> 12 -> 27 -> ... -> 100), `hasStatus` label and `GameStatus` render all showed the latest context within the same second. The earlier "never reaches the screen" reading is therefore wrong for this path. The real defects at the producer:

1. DXVK (small, ~2.8 MB) downloads first and reaches 5%, then Wine starts at 0%: the label went 5% -> 0% -> 12% ... 100% (a reset).
2. At 15:25:37 verify and extract events carry no `percentage`, mapped to `'0'`: the label read "Downloading built-in engine (0%)" while Wine was unpacked (33 s), DXVK was installed and the bottle created (to 15:26:18).
3. Nothing then replaced the `engine-download` status. The game depot download (15:26:18-15:26:34) and the redists ran with the label still reading "(0%)" until `done` at ~15:26:37. This is the operator's "stayed on 0 until the end". The "Reinstall" the operator saw is the installed state after completion; no non-installing status landed mid-install (the ACF poller only started at 15:26:34).

**Regression tests (where it lived, games.test.ts, RED commit 591c72a62):** "G1: real two-archive progress never resets the percent and labels verify/unpack/set-up" and "G1: once the bottle is ready the status leaves engine-download for installing before the game depots download". Both failed before the fix.

## What changed

- `ensureBuiltInEngineForInstall`: context is `downloading:<overall>` (size-weighted over DXVK and Wine, never decreasing), `verifying`, `extracting`, then `setting-up` after a successful download; consecutive identical contexts are sent once. The `Math.round(p.percentage ?? 0)` path is gone.
- `provisionBridgeBottleForInstall`: sends `installing` once a built-in-engine bottle is provisioned (before the depot download).
- Launch path: `prepareBottleForEngine` gets `onSwitching` that sends `setting-up` (IN-05); a launch-time download ends with `setting-up`.
- `engineDownloadLabel(context, t)`: four phases, legacy bare percent kept, anything else renders 0% (T-59-79). Used by `getStatusLabel`, `LaunchOverlay`, `MainButton` and `GameStatus`. The Library card goes through `getStatusLabel`.
- Temporary trace logging added and removed (`grep -rn "\[g1-trace\]" src/` prints nothing; the five trace-only files are byte-identical to before).

## Task 2 outcome

The live trace was run by the operator and orchestrator (Asgaard, no-crossover profile). Operator confirmation: **done** on 2026-11-02 (see the G1 root cause section). Follow-ups filed as todos: the button spinner renders black instead of the label colour (`2026-11-02-main-button-spinner-black-not-font-color.md`), and native Steam downloads are missing from the Downloads screen (`2026-11-02-native-steam-download-show-in-downloads.md`).

## Deviations from Plan

- [Rule 3 - Blocking] `engineDownloadLabel` split into `src/frontend/hooks/engineDownloadLabel.ts` (re-exported by `constants.ts`) because importing `constants.ts` from MainButton/GameStatus broke their jest suites (module-level `window.localStorage`). Files added beyond the list: `hooks/engineDownloadLabel.ts`, `MainButton.tsx`, `GameStatus.tsx`; trace-only files: `src/backend/utils.ts`, `src/backend/platform/index.ts`, `src/preload/api/library.ts`, `src/frontend/state/GlobalState.tsx`, `src/frontend/hooks/hasStatus.ts` (net zero change).
- The existing tests for `'40'` and the `'download'`-phase progress were updated to the new contexts (the old fixture used a phase name that does not exist in the type).
- `pnpm lint` substituted with `npx eslint <touched files>` (0 errors). `pnpm codecheck` substituted with `npx tsc --noEmit` (clean).
- Engine directory: the orchestrator's aside copy `steam-engines.g1-aside` and the fresh re-download `steam-engines` are both 864 MB with the same two pinned directories. Left both in place; nothing deleted. `steam-engines.bak` untouched.

## Out of scope / open

- Button spinner colour (black instead of the button font colour), reported on run 2: the new button branch reuses the existing `faSyncAlt fa-spin` icon the steam "Installing…" branch uses; whether that icon inherits the button colour was not investigated. Not part of this plan's gap; file as a todo.
- The label gap the operator described as "Installing" before the download was the ~3 s sign-in window (status `installing`, no engine frame yet) plus the button defect above; the wine archive downloaded in ~12 s on this run, so the download phase is short on a fast link.
- `MainButton.installClickRouting` R3 partition pin updated deliberately to include `downloadingEngine`.

## Known pre-existing failures (not from this plan)

`steamFlows.test.ts` Test C, `skeletonFlows.test.ts` Test 2 and the `getDefaultLegendarySavePathRefresh.test.ts` suite fail under `--findRelatedTests`; they concern the steam:// launch dispatch and `constants/paths.ts`, not this plan. `dxvkInstallRemove.test.ts` failed once in the batch and passes alone (flaky under parallel load).

## Commits

- ad39e815f chore: temporary G1 trace logging
- 591c72a62 test: failing G1 tests (RED)
- eea11d3ab fix: phase-encoded status, overall percent, hand back to installing (GREEN)
- 4f878077c chore: remove trace logging
- a57c1cfb5 feat: one engineDownloadLabel, setting-up on engine switch
- bff266524 chore: second temporary trace (all gameStatusUpdate frames); removed by the following revert commit
- 43829dc3e fix: install button shows the engine phase and is disabled (not-installed title)

## Self-Check: PASSED

Commits above exist; `grep -c "'setting-up'" games.ts` is 2; no `[g1-trace]` in `src/`.
