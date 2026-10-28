---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 20
subsystem: steam-bridge
tags: [drm, gap-closure, redist-status, diagnostics, wine-log]
requires: [56-18]
provides:
  - "Final 'done' status after the install-time shared-redist step (Gap 3)"
  - "Per-launch bounded DRM wine log plus GAMELIB_DRM_WINEDEBUG passthrough"
  - "stageDrmBottle staged-check mismatch and timeout process diagnostics"
affects: [56-22, 56-26]
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/stageDrmBottle.test.ts
    - .planning/todos/pending/2026-10-28-stale-redist-status-after-bridge-install-disables-play.md
key-decisions:
  - "Wine log and WINEDEBUG log lines use the SteamGame: drm launch appId N: prefix, not bridge drm [N]:, which is the reserved relog prefix"
  - "drmRegistryStagedInUserReg now delegates to drmRegistryMismatches, so the two cannot disagree"
requirements-completed: [D-05, D-11, D-13, D-15]
duration: 30min
completed: 2026-10-29
---

# Phase 56 Plan 20: Gap 3 fix and DRM diagnostics Summary

installBridgeGame now sends a final 'done' status in a `finally` after the install-time redist step, and every DRM launch writes a bounded wine log beside its trace.

## What was done

- **Gap 3 (task 1).** `sendGameStatusUpdate({appName, runner:'steam', status:'done'})` is sent in a `finally` around `installSteamBridgeSharedRedists`, so a resolving or rejecting redist step both clear 'redist'. Two tests (order after the redist call; rejection still ends in 'done'). The todo got a `## Resolution (56-20)` and stays in pending/.
- **DRM wine log (task 2).** `drmWineLogPathFor`, `drmWineDebugFromEnv` (strict allowlist, 200 chars), `createDrmWineLogAppender` (0600, sync, 8 MiB cap with one truncation line). `prepareDrmTraceFile` removes the `.wine.log` sibling when it prunes a trace. The DRM `runWineCommand` gets `options.onOutput`; the appender closes when the wine promise settles. The path is logged. `GAMELIB_DRM_WINEDEBUG` appends WINEDEBUG to the DRM launch env only.
- **Stage diagnostics.** `drmRegistryMismatches` logs which values forced a reg re-run; a reg add timeout logs `pid:pcpu:basename` of bottle/runner processes (at most 20, never full command lines).

## Deviations from Plan

**1. [Already done upstream] Gaps 7 and 9 fixed before this plan ran**
- `98837f09b` (launch cwd) and `5ff2dbd8c` (`sameSteamPath` trailing-backslash tolerance) landed first. The plan's behavior bullet "a trailing-backslash SteamPath is reported as differing" is therefore obsolete; `drmRegistryMismatches` reports it as staged, matching the current staged rule (tested).
- Gap 7/9 instrumentation was kept but small: the wine log still has value for the open winebus abort-spin residual risk (56-17), and the mismatch/process lines are cheap. Nothing else was added.

**2. [Rule 1 - Bug] Log prefix collision**
- The plan's `bridge drm [<appId>]: ...` lines match `drmRelogPrefix`, which two existing relog tests count. Changed to `SteamGame: drm launch appId <id>: wine log <path>` / `WINEDEBUG=<v> (GAMELIB_DRM_WINEDEBUG)`. `formatBridgeDrmAnchor` is untouched.

**3.** Gap 3 uses `sendGameStatusUpdate` from `backend/utils` as the plan said; `games.test.ts` mock of `backend/utils` gained `sendGameStatusUpdate`.

## Not covered

No test asserts the launch-site wiring (onOutput passed, wine log path logged, WINEDEBUG env appended); helpers and the pruning are unit tested. Live behavior is for 56-22.

## Known Stubs

None.

## Threat Flags

None. T-56-20-01..03 mitigations are implemented (allowlist, 8 MiB cap, 0600, basename-only process listing).

## Task commits

| Task | Commit |
| --- | --- |
| 1 Gap 3 | e2592448f |
| 2 stage diagnostics | 3e385651f |
| 2 wine log and WINEDEBUG | 4782d62a5 |

Verification: games.test.ts, bridge/drm suites, fakeHomeIsolation pass (720); prettier and `pnpm codecheck` pass.

## Self-Check: PASSED
