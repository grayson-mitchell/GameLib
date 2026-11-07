---
phase: quick-261107-lum
plan: 01
subsystem: steam
tags: [steam, bridge, macos, install-routing]
requirements: [TODO-2026-11-07-forced-windows-steam-install-routes-to-bridge]
key-files:
  modified:
    - src/backend/storeManagers/steam/gameEligibility.ts
    - src/backend/storeManagers/steam/gameInstall.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/sidecar/steamAuthFlowRegistration.ts
    - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx
  created:
    - .planning/todos/pending/2026-11-07-console-mode-steam-platform-row.md
commits: [7614188b7, 4d4dccdd1, 850819137]
status: complete (live gate: routing PASS; strict bridge-verified not met on either title, recorded below)
---

# Quick 261107-lum: forced-Windows Steam install routes through the bridge verdict

A forced-Windows install ("install the Windows version") of a Mac-native Steam game on macOS now resolves the normal bridge verdict and, when it says bridge, installs into its own `GameLibSteamBridge-<appId>` bottle. Bottled Steam is reached only through the verdict's own bottle rows.

## Status

Tasks 1-3 done and committed. Task 4 live gate run by the operator on 2026-11-07: the routing PASSES on two titles; the strict bridge-verified bar is NOT met on either, for bridge-coverage reasons independent of this change (see "Live gate result"). Operator chose to close the source todo on the routing evidence.

## Commits

| Task | Commit | Content |
|------|--------|---------|
| 1 | 7614188b7 | per-call `windowsBuildChosen` route option; install() passes it to both resolves; mark forced flag on completed bridge install; notice/setup payloads replay `forceWindowsViaBottle`; games.test.ts F1/F2/F3/F9 rewritten, F10-F14 added, W1-W5 pinned to the bottled terminal |
| 2 | 4d4dccdd1 | flag cleared on a confirmed-absent bridge uninstall; `getSteamBridgeRoute(appId, windowsBuildChosen?)` under the triple gate, location default when the arg is absent; launch D5c and verdict tests |
| 3 | 850819137 | SteamDialog re-requests the verdict with `gating.forceWindowsViaBottle`; route-notice and bridge-setup stores and retries replay the choice; Console comment/describe text corrected (assertions untouched); follow-up todo filed |

## Design as built

- `assembleBridgeRouteInput(steamGame, { windowsBuildChosen })` ORs the per-call choice into `platformsBottleEligible`. The persisted flag is still never read there (metadataCapture pin green). `bridgeRoute.ts` is doc-comment only and contains neither forbidden token.
- Reused `forcedWindowsViaBottle` (marked on a completed, non-deferred forced bridge install, cleared on a confirmed-absent bridge uninstall). `gameLaunch.ts` and `gameUninstall.ts` needed no change: both already route by location. Launch coverage is the new D5c test (forced flag plus bridge bottle holds the install, `launchBridgeGame` called, no `steam://rungameid`).
- Routing log line for the live gate: `forced-Windows install of appId <id> routed by the bridge verdict: <route>/<reason>`.

## Verification

- Jest: `src/backend/storeManagers/steam`, `src/backend/sidecar`, `src/preload`, `src/frontend` all run. Frontend: 297 suites / 5139 tests green. Backend: all green except the three pre-existing failures below.
- `pnpm codecheck` clean; eslint 0 errors on all touched files (warnings are pre-existing); `prettier --check` clean after confirming no path is prettier-ignored; `pnpm smoke:sidecar` PASS; `grep forcedWindowsViaBottle|steamMetadataStore bridgeRoute.ts` returns nothing.
- `pnpm planning-gates`: 11/12. The todo-frontmatter gate PASSES for the new todo. The failing gate is the STATE.md field-anchor check (`Plan: value 'Not started' does not start with '<N> of <M>'`), in a file this task does not own.
- `graphify update .` run.

## Deviations from Plan

1. [Rule 1] Existing W1-W5 specs (D-17 write discipline) now routed to the bridge because they use the forced fixture with no verdict; pinned them to the bottled terminal with `bridge: { userRoute: 'bottle' }` (same technique B3/W6 already use). F3 rewritten the same way (it asserted the bottled terminal for an un-pinned forced install). F11 asserts the drm-wrapped acknowledged case via `noticeAcknowledgedFor: 'known-bad'`.
2. `getBridgeRouteVerdict` calls `ensurePlatformsCaptured` itself before reading `is_windows_native` (plan said to order the capture first; done via the exported helper rather than through the stub).
3. `gameSessionState.ts` doc comment edited (bridge added to the clear's description). Comment only.

## Pre-existing failures (not caused by this task, not fixed)

- `games.test.ts` "Phase 56 ... channel constants equal the 56-01 SUMMARY values" and `bottle.test.ts` "DRM_LAUNCH_FORM equals launch_form in 56-01-SUMMARY.md": ENOENT, the 56-01 SUMMARY.md is absent from `.planning/phases`.
- `macArchKnownFixRouting.test.ts` "Intel: never seeds ...": fails identically on a clean checkout of 31edb7309 (verified in a temporary worktree, removed).
- One flaky sidecar bootstrap test failed once in a full run and passed on re-run.

## Known Stubs

None.

## Live gate (Task 4) hand-off notes

- `build/main/sidecar.js` was rebuilt by `pnpm smoke:sidecar` after the final backend edits (mtime 15:57, after the backend commits). `tauri dev` does not rebuild the sidecar: restart with `pnpm tauri:dev` (never `tauri:dev:run`) and re-check the mtime if more backend edits land.
- appIds used: 391540 (Undertale, GameMaker) and 593280 (Cat Quest, Unity). Evidence below.

## Live gate result (2026-11-07, operator's Mac, `pnpm tauri:dev`)

Desktop "Install with options…" (Console Mode has no Platform row yet, by design, follow-up todo `2026-11-07-console-mode-steam-platform-row.md`).

| Check | Undertale 391540 | Cat Quest 593280 |
|---|---|---|
| Forced-Windows install routed by the bridge verdict | PASS (`bridge/pending-scan`, 16:10:33) | PASS (`bridge/pending-scan`, 16:15:29) |
| Own `GameLibSteamBridge-<appId>` bottle, no manifest in `GameLibSteam` | PASS (created 16:10:45, no Windows Steam client) | PASS |
| Forced flag persisted only after a committed install | PASS (16:10:57) | PASS (16:15:50) |
| Launch via the bridge, no `steam://rungameid` | PASS (16:11:07, helper `READY init=ok`, overlay attached) | PASS (bridge bottle direct) |
| Uninstall, Platform defaults back to macOS | PASS (operator) | not run |
| Strict bridge-verified (shim HELLO + clean game Steam init) | NOT MET: `shim coverage miss … steam_api.dll@runtime-loaded`; no shim HELLO and no game-originated call. Helper READY does not count. | NOT MET: `shim withheld: coverage gaps … no helper`; game `error.log` shows `[Steamworks.NET] SteamAPI_Init() failed` then `Steamworks is not initialized`. |

Both titles count as "played through the bridge, unverified". The verified-bar misses are shim-coverage issues that a Windows-only title with the same steam_api would hit too; they are not caused by the forced-Windows routing. Cat Quest's gap is filed as `.planning/todos/pending/2026-11-07-cat-quest-bridge-shim-withheld-steam-init-fails.md`.

## Self-Check: PASSED

Commits 7614188b7, 4d4dccdd1, 850819137 exist; new todo file exists; SUMMARY created.
