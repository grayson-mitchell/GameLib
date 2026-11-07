---
status: resolved
trigger: "Cat Quest (593280) launches through the bridge with the shim withheld, so its Steam init fails — from todo .planning/todos/pending/2026-11-07-cat-quest-bridge-shim-withheld-steam-init-fails.md"
created: 2026-11-08
updated: 2026-11-08
---

# Debug: Cat Quest (593280) shim withheld → Steam init fails

## Symptoms

DATA_START
- **Expected:** Cat Quest (593280, Unity, Steamworks.NET) routes to the native bridge and launches with the shim injected; the game's `SteamAPI_Init()` succeeds. Strict verified bar: shim HELLO plus a clean game Steam-init line in `output_log.txt` / `error.log`.
- **Actual:** Routes to `bridge/pending-scan` but launches "via the Steam bridge bottle directly (shim withheld: coverage gaps …, no helper)". The install-time import scan of its `steam_api.dll` reports hundreds of flat-API and interface-version exports as uncovered (SteamAPI_ISteamApps_*, SteamAPI_ISteamFriends_*, SteamAPI_ISteamUserStats_*, SteamUser020, SteamFriends017, SteamUtils009, SteamController@ambiguous(SteamController006,SteamController007), …).
- **Errors:** `GameLibSteamBridge-593280/drive_c/users/crossover/AppData/LocalLow/The Gentlebros Pte_ Ltd_/Cat Quest/error.log`: `[Steamworks.NET] SteamAPI_Init() failed`, then `InvalidOperationException: Steamworks is not initialized` at `SteamUser.GetSteamID`. Game plays without achievements or any Steam feature.
- **Timeline:** Found in quick 261107-lum live gate (forced-Windows install of a dual-build Unity title). Not caused by forced-Windows routing — a Windows-only title shipping the same steam_api would hit it too.
- **Reproduction:** Install Cat Quest (forced Windows build) via the bridge, launch, inspect launch log + error.log.
- **Questions to answer:** (1) Is the export set really all uncovered, or is the scan miscounting a full-export DLL whose game only calls a few? (2) Why is the helper absent ("no helper")? Then extend coverage or decide withheld-shim behaviour is right.
- **Related:** Undertale (391540, GameMaker) logged `shim coverage miss … steam_api.dll@runtime-loaded`, launched with helper `READY init=ok`, but no shim HELLO and no game-originated call. Check whether same class before splitting out.
DATA_END

## Current Focus

hypothesis: CONFIRMED - Cat Quest is a 32-bit (PE32 i386) Mono Unity title; the x86 shim has no generated flat C API and serves only older interface versions, so the gaps are genuine. Withhold is the designed behaviour.
test: file(1) on exe and steam_api.dll; read shimCoverage.ts, gen_vtables.ts, shimPlacement.ts, gameBridgeLaunch.ts
expecting: n/a
next_action: decision checkpoint - extending x86 coverage is a new-phase feature, not a quick fix

## Evidence

- checked: file(1) on Cat Quest.exe and Cat Quest_Data/Plugins/steam_api.dll in the bridge bottle
  found: both PE32 Intel 80386 (32-bit); steam_api.dll sits in Plugins, Mono build (Managed/Assembly-CSharp-firstpass.dll)
  implication: x86 shim path applies
- checked: shimCoverage.ts SHIM_EXPORTED_SYMBOLS vs SHIM64_GENERATED_EXPORTS (948 flat SteamAPI_ISteam* names)
  found: x86 export list is hand-pinned (~50 symbols, bare accessors only); the generated flat API exists for x64 only. meta/gen_vtables.ts L2886 records "x86 stays deferred (D-53-09)"
  implication: Q1 - not a miscount. Steamworks.NET's firstpass DllImports the flat methods of served families (partitionManagedImports makes them required); x86 exports none. P/Invoke is lazy so the scan cannot tell which are called, but SteamUser020/Friends017/Utils009 are core-family version gaps (x86 serves 023/016 user, 018/013/011 friends, 005 utils only) so they would block regardless
- checked: gameBridgeLaunch.ts L387-396
  found: 'withheld' status launches direct and skips helper spawn by design
  implication: Q2 - "no helper" is deliberate; a game with no shim has nothing to talk to the helper
- checked: Undertale class
  found: shim placed over runtime-loaded dll and helper READY, but no HELLO - shim placed vs withheld, GameMaker loading path
  implication: different class, do not merge

## Eliminated

## Resolution

root_cause: x86 shim coverage gap by design (D-53-09): no generated flat C API on x86, and core interface versions SteamUser020/SteamFriends017/SteamUtils009 (plus SteamApps/UserStats versions) are not served on x86. Cat Quest is 32-bit only, so coverage verdict blocks placement and launch goes direct without helper.
fix: none applied - needs x86 flat-API generation + x86 manifests/vtables (new phase)
verification: n/a — closed as by-design (user decision 2026-11-08); follow-up ROADMAP backlog 999.2
files_changed:
