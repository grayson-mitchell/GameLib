---
status: resolved
trigger: "Gothic 1 Remake (appId 1297900) bridge install failed, then Play re-downloaded it via bottled Steam (EULA prompt, then a fresh 33 GB download)."
created: 2026-11-21
updated: 2026-11-21
---

# Debug: Gothic 1 Remake bridge install failed, Play re-downloaded via bottled Steam

## Symptoms

- expected: Bridge install of Gothic 1 Remake (1297900) completes; Play launches the game through the bridge bottle `GameLibSteamBridge-1297900`.
- actual: Depot download finished (33 GB) but install failed at shim placement. Play then launched via bottled Steam (`GameLibSteam` bottle), which showed the EULA and started a fresh 33 GB download into its own library (suspended at ~3.6 GB).
- error: `installBridgeGame shim placement failed for appId 1297900: could not read ".../Gothic 1 Remake/G1R.exe": No such file or directory` (09:42:29); bottled Steam `LaunchApp failed with AppError_18` (10:38:17); `bottleProcessMonitor [1297900]: installPath ... does not live under bottle GameLibSteam's drive_c` (10:37:47).
- timeline: First seen 2026-11-21. First title observed with a dev-beta-only launch entry ahead of the public one.
- repro: Bridge-install a title whose PICS `config.launch` lists a windows-tagged entry gated to non-public betakeys before the public `type: default` entry (1297900). Then press Play in the same session.

## Current Focus

hypothesis: Both root causes confirmed and fixed.
next_action: none (live re-test by the operator after rebuilding the sidecar).

## Evidence

- 2026-11-21 launchTarget.ts: `pickWindowsLaunch` took the first `oslist=windows` entry and read neither `config.betakey` nor `type`. Live PICS for 1297900 lists entry "0" (`G1R.exe`, windows, betakey `calom, magicbarrier, releasebranch_dev, ...`, type option1) ahead of entry "3" (`G1R-Win64-Shipping.exe`, windows, betakey `public, ...`, type default). The depot has no `G1R.exe`. The wrong target was persisted at `store_cache/steam_metadata.json` -> `/1297900/bridge/launchTarget`.
- 2026-11-21 gameLaunch.ts: `launch()` sent a bridge-bottle install to bottled Steam whenever `bridgeFailedThisSession` held the appId. The install failure at 09:42:29 armed that breaker (`gameInstallBridge.ts` marks it on every failure path). Bottled Steam has no copy, so `-applaunch` answered AppError_18 and Steam started a full download.
- 2026-11-21 bridge bottle ACF `appmanifest_1297900.acf` is `StateFlags 4`, buildid 26394867, depot 1297901 at 38445892181 bytes, and `steam_library.json` already holds `is_installed: true` with the bridge-bottle `install_path`. The 33 GB copy is complete and intact; only shim placement and launch were never reached.
- 2026-11-21 `install()` routes through `bridgeRoute`, whose row 2 (`failedThisSession` -> bottle) is the breaker. That is correct for NEW installs and was left alone; the defect was only that `launch()` also honored it for bits already in a bridge bottle.

## Eliminated

- A stale persisted `launchTarget` as the primary cause: it was a consequence (PICS wrote it), and PICS overwrites it on a successful resolve.
- Removing the breaker from `bridgeRoute`: out of scope; it governs where a new install goes, not where existing bits are.

## Resolution

- root_cause: (1) `pickWindowsLaunch` ignored `config.betakey` and `type`, so a windows-tagged dev-only entry listed first shadowed the public `type: default` entry, resolving to an exe the depot does not contain; shim placement failed and the failure was persisted. (2) `launch()` let the session circuit breaker divert a launch of bits that live in a bridge bottle to bottled Steam, which cannot launch them and re-downloads the game.
- fix: (1) `launchTarget.ts`: only entries whose comma-separated, trimmed `betakey` list names the branch (default `public`) or that carry no betakey are considered; within the windows-tagged then untagged tiers the `type: "default"` entry wins, then an untyped entry, then the rest (stable, so PICS order breaks ties). (2) `gameLaunch.ts`: a launch whose bits sit in a bridge bottle always goes to the bridge, even after the breaker is armed; the bridge launch re-resolves everything and surfaces its own `steamBridgeSetupRequired` on a real failure. The one exception is a persisted Steam CEG verdict (`bridge.drm === 'ceg'`), where bottled Steam is the only place the title can run and the setup dialog's explicit "Fall back to bottled Steam" button re-enters `launch()`.
- verification: launchTarget.test.ts 33/33 (4 new tests, all fail against the old launchTarget.ts, built from the live 1297900 PICS shape); games.test.ts 757/757 (the incident test and a CEG-exception test are new; 3 existing tests that encoded the old reroute and the CEG test now assert the new contract; the incident test and the three rewritten ones fail against the old gameLaunch.ts); `jest src/backend/storeManagers/steam` 4427 passed; `tsc --noEmit` clean; eslint 0 errors on the two source files; scoped prettier clean.
- files_changed: src/backend/storeManagers/steam/bridge/launchTarget.ts, src/backend/storeManagers/steam/gameLaunch.ts, src/backend/storeManagers/steam/bridge/__tests__/launchTarget.test.ts, src/backend/storeManagers/steam/__tests__/games.test.ts
- not_covered: `resolveBridgeLaunchExe` does not read the installed ACF `BetaKey`, so it resolves for the `public` branch. A title installed from a non-public beta whose only launch entries are gated to that beta now resolves to nothing instead of to a dev-only exe. Threading the branch needs a rust slice on the resolver's deps and was left out.
- residual: for a launch-time bridge failure other than CEG, the setup dialog still shows "Fall back to bottled Steam" (`fallbackAvailable: true`). For an installed game that button calls `launch()`, which now retries the bridge instead of rerouting, so it behaves as a retry. Hiding it for bridge-bottle installs is a small follow-up across the `gameBridgeLaunch.ts` / `gameBridgeWineLaunch.ts` message sites and their tests.

## Prevention

- why not caught: the breaker's launch behavior was a pinned, intentional contract (finding #3) and three tests asserted it, so the gate protected the defect. No test used a real multi-entry PICS launch map with beta gating.
- guard: the real 1297900 PICS shape is now a fixture in launchTarget.test.ts; the incident test in games.test.ts pins "bridge-bottle bits never reach bottled Steam on Play".

## Operator cleanup (done 2026-11-21, user-approved)

- Bottled `GameLibSteam` Steam shut down cleanly with `steam.exe -shutdown` through the CrossOver wine, run with `WINEESYNC=1 WINEMSYNC=1` (without them the client refuses: "Server is running with WINEMSYNC but this process is not"). All bottle processes exited, including the wineserver. Mac Steam and the `GameLibSteamBridge-1297900` bottle were not touched.
- Removed from `GameLibSteam/.../steamapps`: `downloading/1297900` (3.6 GB), `downloading/state_1297900_1297901.patch`, `temp/1297900`, `appmanifest_1297900.acf`.
- Cleared `bridge.launchTarget` for 1297900 in `~/Library/Application Support/GameLib/store_cache/steam_metadata.json` (that path and `gamelib/store_cache` are the same directory on this case-insensitive volume); `bridge.steamApi: "x64"` kept.
- Left in place: an empty `GameLibSteam/.../steamapps/common/Gothic 1 Remake` folder and one stale `1297900` line in that bottle's `libraryfolders.vdf`; Steam rewrites the latter on its next start.
