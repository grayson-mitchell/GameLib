---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
plan: 09
subsystem: steam-bridge
tags: [uat, census, live-run]
requires: [53-08]
provides:
  - scored 53-UAT.md (5 pass, 8 issue) with Gaps for a gap plan
affects: [phase-53-gap-plan]
key-files:
  modified:
    - .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-UAT.md
    - .planning/todos/pending/2026-10-23-bridge-shim-lacks-steamworks-flat-api-for-unity-steamworks-net-games.md
    - .planning/todos/pending/2026-10-24-x64-shim-lacks-interface-versions-ue5-titles-request.md
    - .planning/todos/pending/2026-10-24-x64-shim-lacks-old-sdk-csteamworks-exports-and-interface-versions.md
    - .planning/todos/completed/2026-10-24-bridge-census-misses-unreal-layout-steam-api.md
metrics:
  completed: 2026-10-25
---

# Phase 53 Plan 09: Live UAT Scoring Summary

One live session over the 16-title D-53-14 sample, scored from gamelib.log, engine logs and the census: the done-when is NOT met (`6 of 18 Steamworks-using rows verified (majority: no)`).

## Census majority line (verbatim)

`6 of 18 Steamworks-using rows verified (majority: no)`

Verified rows: 1284190, 1363080, 1603180, 230070, 411300, 648410. A majority needs 10.

## Per-appid verdicts

| appid | Title | Engine | HELLO | Evidence | Verdict |
|---|---|---|---|---|---|
| 1691190 | Rogue Waters | Unity | y | Player.log `SteamAPI_Init() failed`; NOVER STEAMSCREENSHOTS_INTERFACE_VERSION003 | issue |
| 1167950 | Vampire's Fall | Unity | y | Player.log init failed; same NOVER | issue |
| 1284190 | Planet Crafter | Unity | y | Player.log clean; census verified | pass |
| 1782460 | Hell Clock | Unity | y | Player.log init failed; same NOVER x2 | issue |
| 1603180 | Mining Mechs | not detected | y | 10 CALLs; D3D dialog is Wine graphics, game played | pass |
| 3410180 | Overlooting | Godot | n | NULL call from the exe, no shim entry | issue |
| 1119730 | Ranch Simulator | Unreal | n | Shipping exe exits <1 s, code 0x35 | issue |
| 1363080 | Manor Lords | Unreal | y | 7 CALLs, no 0x0 crash | pass |
| 427410 | Abiotic Factor | Unreal | y | 5 CALLs, clean Saved log, hang at load | issue |
| 648410 | Colony Ship | Unreal | y | 2 CALLs | pass |
| 648800 | Raft | Unity | y | SteamStub DRM, FWD only | issue |
| 206060 | Avernum 6 | x86 | y | no game-originated call | issue (unverified) |
| 230070 | Age of Decadence | other | y | 2 CALLs | pass |
| 411300 | ELEX | other | y | 1 CALL; hang at load | issue |
| 219990 | Grim Dawn | other | y | SteamStub DRM, FWD only | issue |
| 284100 | Unclaimed World | MonoGame | n | `SteamAPI_InitSafe` unimplemented | issue |

Items: 5 pass (3, 5, 8, 10, 12), 8 issue (1, 2, 4, 6, 7, 9, 11, 13).

## Root-cause notes

- Rogue Waters, Vampire's Fall, Hell Clock: init fails; only fault line is the unserved flat lookup STEAMSCREENSHOTS_INTERFACE_VERSION003 (Planet Crafter logs the same NOVER and passes, so the Steamworks.NET build matters). Rogue Waters also stubs SteamUtils (SteamUtils009) and SteamController/006, so its two former misses did not resolve.
- Overlooting: it is Godot, not Unity as the item header said. No HELLO/CALL/NOVER, 0-byte Godot logs, return address 0x1400607f1 in the exe. All 13 steam_api64 imports of libgodotsteam are exported by the placed shim. Not traceable to a Steam method; likely a Godot/Wine start-up function pointer. Needs a wine trace.
- Unclaimed World: `SteamAPI_InitSafe` missing from the x64 shim, called by CSteamworks64. Evidence appended to the open old-SDK todo.
- Ranch Simulator: shim placed in Steamv161/Win64, original backed up; UE Shipping exe exits with 0x35 in under a second, before any UE log and before HELLO. Install log does not record the resolved interface version, so D-53-12 divergence is not observable.
- Abiotic Factor: bridge side is clean; hang follows `LogOnlineIdentity: STEAM: Failed to acquire Steam auth session ticket for 0`. Census wrongly says init-failed because it reads the stale `AbioticFactor-backup-2026.10.23-21.35.54.log`.
- ELEX: census counts it verified (one CALL) though the operator saw a load hang; class known-bad; SteamGameServer012 coverage miss.
- Raft, Grim Dawn: SteamStub DRM, steamstub-forwarded:launch-check-unsatisfiable, only FWD CreateInterface lines. Kept in the denominator; no reroute to bottled Steam.

## Todos

- Closed: `2026-10-24-bridge-census-misses-unreal-layout-steam-api.md` (census rows for 1119730, 1363080, 427410 are off `no-steam-api`).
- Left pending with evidence appended: flat-API todo (items 1, 2, 4 fail), UE5 interface-versions todo (item 7 and 9 fail), old-SDK todo (step 3 shipped; steps 1, 2, 4, 5 remain; Unclaimed World evidence).

## Deviations from Plan

- The checkpoint run used the bare `gamelib-shell` binary, not `open GameLib.app` (same bundled sidecar).
- Item 5 scored pass despite a clicked-through D3D dialog (graphics, not Steam); item 9 scored issue on the operator's loading hang although the census row would be scoreable from this session's log.
- Found a census defect (stale backup and prev logs counted); logged as a Gap, not patched (D-53-06).

## Phase done-when

Not met: 6 of 18 (7 of 18 if the stale-log defect is corrected), majority needs 10. A gap plan is required (`/gsd-plan-phase 53 --gaps`).

## Self-Check: PASSED
