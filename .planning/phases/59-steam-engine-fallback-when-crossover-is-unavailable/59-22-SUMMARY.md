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

## G1 root cause: FOUND

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

The live trace was run by the operator and orchestrator (Asgaard, no-crossover profile). Operator confirmation that the percent now advances through the phases after the fix is **still pending**: it needs a sidecar rebuild (`pnpm build:sidecar-sea`), a dev restart, and the engine directory moved aside again for a first-download re-test. Not done by this executor.

## Deviations from Plan

- [Rule 3 - Blocking] `engineDownloadLabel` split into `src/frontend/hooks/engineDownloadLabel.ts` (re-exported by `constants.ts`) because importing `constants.ts` from MainButton/GameStatus broke their jest suites (module-level `window.localStorage`). Files added beyond the list: `hooks/engineDownloadLabel.ts`, `MainButton.tsx`, `GameStatus.tsx`; trace-only files: `src/backend/utils.ts`, `src/backend/platform/index.ts`, `src/preload/api/library.ts`, `src/frontend/state/GlobalState.tsx`, `src/frontend/hooks/hasStatus.ts` (net zero change).
- The existing tests for `'40'` and the `'download'`-phase progress were updated to the new contexts (the old fixture used a phase name that does not exist in the type).
- `pnpm lint` substituted with `npx eslint <touched files>` (0 errors). `pnpm codecheck` substituted with `npx tsc --noEmit` (clean).
- Engine directory: the orchestrator's aside copy `steam-engines.g1-aside` and the fresh re-download `steam-engines` are both 864 MB with the same two pinned directories. Left both in place; nothing deleted. `steam-engines.bak` untouched.

## Known pre-existing failures (not from this plan)

`steamFlows.test.ts` Test C, `skeletonFlows.test.ts` Test 2 and the `getDefaultLegendarySavePathRefresh.test.ts` suite fail under `--findRelatedTests`; they concern the steam:// launch dispatch and `constants/paths.ts`, not this plan. `dxvkInstallRemove.test.ts` failed once in the batch and passes alone (flaky under parallel load).

## Commits

- ad39e815f chore: temporary G1 trace logging
- 591c72a62 test: failing G1 tests (RED)
- eea11d3ab fix: phase-encoded status, overall percent, hand back to installing (GREEN)
- 4f878077c chore: remove trace logging
- a57c1cfb5 feat: one engineDownloadLabel, setting-up on engine switch

## Self-Check: PASSED

Commits above exist; `grep -c "'setting-up'" games.ts` is 2; no `[g1-trace]` in `src/`.
