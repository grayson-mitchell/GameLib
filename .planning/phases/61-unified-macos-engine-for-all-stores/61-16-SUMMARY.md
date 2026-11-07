---
phase: 61-unified-macos-engine-for-all-stores
plan: 16
subsystem: engine
tags: [launch-deadline, process-watch, spike-068, crossover]
requires: [61-01, 61-04, 61-14]
provides:
  - "watchForGameProcess / deriveGameProcessPrefix(es): non-Steam first-match signal"
  - "armEngineLaunchDeadline(game, key) armed at the end of prepareWineLaunch"
  - "getLaunchOverlayContext(key) accessor"
key-files:
  created:
    - src/backend/engine/gameProcessWatch.ts
    - src/backend/engine/__tests__/gameProcessWatch.test.ts
    - src/backend/engine/__tests__/launchEngine.deadline.test.ts
  modified:
    - src/backend/engine/launchEngine.ts
    - src/backend/engine/launchSettings.ts
    - src/backend/launcher.ts
    - src/backend/__tests__/launcher.engineStep.test.ts
key-decisions:
  - "Deadline branch: armed (z-path); no todo created (that is only for verdict none)"
  - "Match = command starts with the prefix OR carries it as a later argument preceded by whitespace, quote or '=' (GPTK wine64-preloader keeps the path as an argument)"
  - "exe-basename parameter omitted: the verdict is z-path, so no basename matcher exists"
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 61 Plan 16: Non-Steam launch deadline Summary

Bottle-backed non-Steam launches get Phase 59's 180 s "Game didn't start" deadline, armed only on spike 068's case-insensitive install-dir prefix signal (unix, `Z:` and home-relative `Y:` forms, trailing separator).

Deadline branch: armed (z-path)

## What was built

- `gameProcessWatch.ts`: `deriveGameProcessPrefixes` (all three forms, lowercased, `[]` when the path is not absolute), `deriveGameProcessPrefix` (unix form or null), `watchForGameProcess` (1500 ms setTimeout chain, stops on first match, `maxDurationMs` cap of deadline + 5 s, gives up after 20 consecutive listing failures, returns null when no prefix is derivable). Logs only the pid, never other processes' command lines.
- `launchEngine.ts`: `armEngineLaunchDeadline(game, key, overrides?)` arms the deadline for a `bottle` overlay context with a registered selection, then `bindDeadlineToMonitor(deadline, watcher, log)`; a null watcher stands the deadline down (`monitor-unavailable`). On expiry: stop watcher, kill this bottle's wineserver (CrossOver: `<binDir>/wineserver` with `CX_ROOT`; fallback: `sel.wineserverBin`; 15 s cap; selection from the registry or captured at arm time, G5), `game.stop(false)`, `endEngineLaunch`, then the existing `gamelib:steam.engine.didntStart.*` dialog with `seconds: 180`. No retry, no bridge-failure marking, no reroute. `endEngineLaunch` now also stops the watcher.
- `launcher.ts`: one call, after `installFixes` and the known-fix overlay env, immediately before `prepareWineLaunch` returns success.
- Plain-prefix (pinned/Wine Manager) launches and legacy/skip steps are not armed (documented in the module header).

## New timers and their unref

| Timer | Where | unref |
|---|---|---|
| deadline | launchDeadline.ts (existing) | `handle.unref?.()` |
| poll chain | gameProcessWatch.ts `schedule` | `timer.unref?.()` |
| max-duration cap | gameProcessWatch.ts | `capTimer.unref?.()` |

Nothing runs at import or boot. `pnpm smoke:sidecar` passes.

## Verification

- `pnpm exec jest src/backend/engine src/backend/__tests__`: 1994 passed, 1 failed (known tauriShellSource, pre-existing).
- `pnpm boundaries` clean; `tsc --noEmit` clean; prettier clean on all touched files.
- Lint totals unchanged: tests 664, src 1117 (0 errors).
- Key links checked by grep: `armEngineLaunchDeadline(` appears once in launcher.ts; `bindDeadlineToMonitor(` in launchEngine.ts; no `markBridgeFailedThisSession|steamBridgeSetupRequired` in launchEngine.ts.
- Launcher arming position is asserted by a source-order test (prepareWineLaunch is not run end to end in that suite).

## Deviations from Plan

None in behavior. The `<behavior>` "launch deadline" tests use injected watch/kill/dialog deps via an `overrides` argument. Caveat from the spike carried forward: the CrossOver exec shape is confirmed only synthetically (live run was GPTK); a bare-basename launch cannot be matched, so that launch gets no deadline. A fast-starting game whose process is missed would be killed at 180 s; this is the verdict's accepted trade-off.

## Known Stubs

None.

## Self-Check: PASSED

Commits 6c1872834 and 0f063bf77 exist; all listed files exist.
