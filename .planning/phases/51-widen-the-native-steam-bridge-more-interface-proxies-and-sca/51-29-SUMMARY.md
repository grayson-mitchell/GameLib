---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 29
subsystem: steam-bridge
tags: [uat, census, d-51-15, sample]
requires: [51-28]
provides:
  - rule-drawn representative sample of 12 owned Windows-only titles, installed and played through the default route
  - per-title route, HELLO, in-game Steam-init and play evidence for 51-30
affects: [51-30]
key-files:
  modified:
    - .planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-UAT.md
key-decisions:
  - "Sample rule fixed before install: seed gamelib-51-29, sha256 ascending, 12 titles, at most 2 per developer, known size <= 15 GB"
  - "Verified-running criterion: HELLO and no Steam-init failure in the game's own log; Mac Steam In-Game is not evidence"
metrics:
  completed: 2026-10-24
  tasks: 3
requirements-completed: [D-51-15, D-51-06, D-51-14]
---

# Phase 51 Plan 29: Representative sample Summary

Twelve owned Windows-only titles from 12 developers, drawn by a mechanical rule before any install, all routed to the bridge. None is verified running through it: 6 play offline and 6 do not run. 51-UAT.md item 19 stays `result: pending` for 51-30 to compute from.

## Sample rule and approval

Operator answer at Task 2, verbatim: "Known size only, redraw (Recommended)". Rule: 197 owned Windows-only titles (`is_windows_native && !is_mac_native`), minus already-measured and allowlist seed/knownBad appIds; eligible = Steam type game, known developer, known parseable size <= 15 GB (75 titles); ordered by sha256("gamelib-51-29:" + appId) ascending; first 12 with at most 2 per developer. Drawn total about 69.8 GB. Developer and size came from public store appdetails (size is approximate, from minimum-requirements text); ratings from the cached CrossOver index. Already-measured titles (206060, 411300, 63000, 648410, 230070, 200510 and others) were excluded from the draw; 51-30 should count them separately, with the dual-arch caveat for 230070.

## Verified-running criterion

Per todo `2026-10-23-bridge-shim-lacks-steamworks-flat-api-for-unity-steamworks-net-games.md`: HELLO from the shim AND no Steam-init failure in the game's own log. Mac Steam In-Game is not evidence, because it comes from the helper's own SteamAPI_Init. Under this criterion verified-through-bridge K = 0 of 12. The 51-28 anchors stand: AoD 230070 (item 18) and XCOM CEG (item 17).

## Per-title operator evidence (gamelib.log, 2026-10-23 22:0x to 2026-10-24 10:47)

| appId | Title | Engine | Route | HELLO | Steam init in game | Plays | Cause |
|---|---|---|---|---|---|---|---|
| 1167950 | Vampire's Fall: Origins | Unity | bridge | yes (after quick 261023-ue0) | no: EntryPointNotFound SteamAPI_ISteamClient_GetISteamUser | yes, offline | flat API |
| 219990 | Grim Dawn | custom | bridge | no | n/a | NO, exits after 2s | SteamStub .bind (spike 038), then modern-SDK exports |
| 1284190 | The Planet Crafter | Unity | bridge | yes 22:26:11 | no: same flat-API failure | yes, offline, 116s | flat API |
| 1782460 | Hell Clock | Unity | bridge | no | no: EntryPointNotFound SteamInternal_SteamAPI_Init (Steamworks.NET InitEx) | yes, offline, 137s | modern-SDK exports |
| 1363080 | Manor Lords | UE5 | bridge, `no-steam-api, no helper` | n/a (no shim placed) | no (Valve DLL, no Steam) | yes, offline | scan reads UE bootstrap exe |
| 1691190 | Rogue Waters | Unity | bridge | yes 10:19:34 | no: GetISteamUser + SteamAPI_ISteamUtils_IsSteamRunningOnSteamDeck | NO, hangs on loading screen (twice) | flat API |
| 427410 | Abiotic Factor | UE | bridge, no-steam-api | n/a | no | yes, offline, 82s | UE scan miss |
| 648800 | Raft | Unity | bridge (SteamStub .bind logged as informational) | no | n/a | NO, exits after ~4s | SteamStub |
| 284100 | Unclaimed World | MonoGame/.NET 4.5.1 | bridge | no | n/a | NO: startup error, Windows Media Player missing | missing Windows runtime components in the bottle, not a bridge defect |
| 1119730 | Ranch Simulator | UE | bridge, no-steam-api | n/a | no (likely RestartAppIfNecessary with the Valve DLL) | NO, exits after 2-3s | UE scan miss, then modern-SDK exports |
| 1603180 | Mining Mechs | GameMaker | bridge | no | n/a | NO: "encountered a serious problem" dialog, gone after 44s | modern-SDK exports (Steamworks_x64.dll imports SteamInternal_SteamAPI_Init/ContextInit/FindOrCreateUserInterface) |
| 3410180 | Overlooting | Godot (GodotSteam) | bridge | no | n/a | NO: same dialog as Mining Mechs | modern-SDK exports; the DRM detector could not parse the 322 MB exe as PE |

Not captured in this record: per-title `prescreenBridgeDepots ... result=` lines and persisted `bridge.scan` arch/status for each title were not supplied with the operator report; 51-30 should read them from gamelib.log and steam_metadata.json before computing the prescreen live half. No dual-arch title was flagged in the sample.

## Totals

12/12 bridge-routed (none used bottled Steam); 0 verified; 6 play offline; 6 do not run (SteamStub 2, modern-SDK exports 2, flat-API hang 1, Windows runtime component 1). Titles with no steam_api (Manor Lords, Abiotic Factor, Ranch Simulator as scanned) are outside the Steamworks-using denominator. Every non-running case except Unclaimed World is a fixable bridge or scan defect; none belongs in knownBad (Unclaimed World is a bottle-dependency gap, SteamStub is in scope via the forwarder).

Defect classes, ranked by sample reach:
1. Modern-SDK SteamInternal exports: 219990, 1782460, 1603180, 3410180, plus 1119730 once the scan is fixed. Todo `2026-10-23-x64-shim-lacks-modern-sdk-steaminternal-exports-and-scan-misses-dll-importers.md`.
2. Flat API (Unity/Steamworks.NET): 1167950, 1284190, 1691190. Todo `2026-10-23-bridge-shim-lacks-steamworks-flat-api-for-unity-steamworks-net-games.md`.
3. UE stub-exe scan miss: 1363080, 427410, 1119730. Todo `2026-10-24-bridge-scan-reads-unreal-bootstrap-exe-and-misses-the-shipping-binary.md`.
4. SteamStub forwarder: 219990, 648800. Todo `2026-10-23-forwarding-steamclient-dll-for-steamstub-titles.md` (spike 038).
5. Bottle runtime components: 284100. Todo `2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md`.

## UI defects found (filed as todos, already committed)

- `2026-10-24-play-button-flickers-back-to-play-between-launching-and-playing.md`
- `2026-10-24-stop-is-a-no-op-for-bridge-launched-games.md`
- `2026-10-24-request-macos-app-management-permission-at-first-run.md`

## Confound

During part of the session another session's spike 036 ran bottled Steam on the same account (ending ...7096) and signed Mac Steam out. In-Game still worked each time. This has no bearing on the verdicts, since In-Game is not used as evidence.

## Deviations from Plan

None. Task 2 was an adjust-rule redraw as the plan allows; item 19 records the final rule and list.

## Self-Check: PASSED
