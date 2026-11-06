---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 12
subsystem: steam-bridge
tags: [drm, launch, games.ts, i18n]
requires: [56-05, 56-11]
provides: [DRM-mode launch branch, D-13 notices, [bridge-drm] anchor, trace re-log]
affects: [56-13, 56-15]
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/bridge/drm/drmTrace.ts
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
decisions:
  - "dllpath_channel: not-needed; dlloverrides_channel: dll-option (56-01-SUMMARY.md lines 44-45)"
  - "DRM failures never mark the session breaker and never send steamBridgeSetupRequired"
metrics:
  tasks: 3
  completed: 2026-10-28
---

# Phase 56 Plan 12: DRM launch wiring in games.ts Summary

`launchBridgeGame` now calls `drmLaunchSetup` before any shim placement; a `.bind` exe without CEG markers launches `steam.exe <game C:\ path>` under the clone runner with the trace env, a `[bridge-drm]` anchor and a post-exit trace re-log, and every DRM failure is a once-per-step D-13 notice with no session breaker.

## Commits
- 18be410ca: games.ts helpers, DRM branch, notices, launch, re-log; games.test.ts; drmTrace.ts prune-comment removal
- 2fa6c72c9: en `steam.bridge.drm.*` strings and presence baseline

## Channels used (56-01-SUMMARY.md)
- `dllpath_channel: not-needed` (line 44): no WINEDLLPATH key is set. Note: the SUMMARY's consequence text says anything outside the clone must go through CX_ENV, but the recorded verdict is `not-needed`, and the plan says to follow the verdict. The builder supports `env`/`cx_env` if 56-15 shows steamDirHost must be on WINEDLLPATH.
- `dlloverrides_channel: dll-option` (line 45): argv `--dll=steamclient=n;steamclient64=n;lsteamclient=b` placed before the helper path in `commandParts`. No CX_ENV quoting was needed.

## Emitted line shapes (for the 56-15 census)
- Anchor: `[bridge-drm] appId=<id> mode=steamclient-layer crossover=<build> client=<ver> trace=<file>` from `formatBridgeDrmAnchor`, logged once, immediately before `runWineCommand`.
- Re-log: `bridge drm [<id>]: [drm-trace] appId=<id> pid=<n> role=<game|helper> event=<create-interface iface=...|call name=...>` per valid event, plus a non-prefixed summary `SteamGame: DRM trace for appId <id> relogged events=<n> rejected=<m>`.
- Notice: `[bridge-notice] appId=<id> reason=drm-<step> cause=<token>`.

## i18n
New keys `steam.bridge.drm.{title,detail,step.{steamNotRunning,unsupportedCrossover,componentMissing,componentVerify,runnerClone,runnerPatch,valveFetch,valveVerify,bottleStage}}`. `meta/i18nCatalogPresenceBaseline.json` was regenerated (outline deviation, stated in the plan); the diff adds only `steam.bridge.drm.*` plus generatedAt/totalPairs.

## For 56-13
The Phase 52 forwarder block, `maybeNotifySteamStub*`, their Sets and the `setupSteamClientForwarder` import are still present and unreachable in DRM mode. 56-13 must regenerate the presence baseline after removing `steamstub.*` keys. The `../bridge/steamClientSetup` jest mock stays until then.

## For 56-15
Trace dir `<appFolder>/steam-bridge/drm/trace/` (0700, 8-file retention per appId). `STEAM_COMPAT_CLIENT_INSTALL_PATH` = `~/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS`. First live launch must confirm the wrapper/loader handle the clone path containing a space (`Application Support`), as 56-08 flagged. The registry channel's reg runs use `wait: true` per the plan; not exercised by the live channel.

## Deviations from Plan
- Commit granularity: tasks 1-3 are in one code commit plus one i18n commit (the helpers' imports and the branch/launch code are interdependent, and tests were written alongside rather than as separate RED/GREEN commits).
- [Rule 3] Removed the orchestrator-added `// ts-prune-ignore-next` above `DRM_TRACE_ENV` in drmTrace.ts: now imported by games.ts and findDeadcode stays clean.
- The en-catalog test compares the catalog against the default strings declared in games.ts source (the i18next spy returns keys), rather than only against spy-captured defaults.

## Verification
- games.test.ts: 42 "steamclient-layer" cases pass; only the known pre-existing `quick 261024-tny` failure remains in the file. fakeHomeIsolation, logSecretGate, drm suites and bridgeCensus pass.
- codecheck, prettier (scoped), eslint on edited files (no errors), lint-translations:gamelib (0 hard failures) pass. `findDeadcode` reports only the three known pre-existing findings. Repo-wide `pnpm lint` is polluted by `.claude/worktrees/` (pre-existing, not run to green).
- `pnpm i18n-churn-guard` passes; `requirements.mark-complete`: REQUIREMENTS.md missing (known).

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
games.ts, games.test.ts, gamelib.json, baseline exist; commits 18be410ca and 2fa6c72c9 exist.
