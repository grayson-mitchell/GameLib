---
status: resolved
trigger: "Undertale (391540) launches with the shim placed and helper READY, but the shim never says HELLO"
created: 2026-11-10
updated: 2026-11-11
todo: .planning/todos/pending/2026-11-08-undertale-bridge-shim-placed-no-hello.md
---

## Symptoms

DATA_START
- **Expected:** Undertale (391540, GameMaker, forced Windows build on the macOS bridge) launches with the shim placed over `steam_api.dll`; the shim says HELLO to the helper and a game-originated bridge call follows (strict verified bar, non-Unity criterion D-53-13).
- **Actual:** Launch log shows `shim coverage miss … steam_api.dll@runtime-loaded`; shim is **placed** (not withheld); helper reports `READY init=ok`; but no shim HELLO and no game-originated call.
- **Errors:** none beyond the coverage-miss line; no HELLO.
- **Timeline:** observed during quick 261107-lum live gate (.planning/quick/261107-lum-route-forced-windows-steam-installs-of-m/261107-lum-SUMMARY.md). Never verified working.
- **Reproduction:** Install Undertale via the bridge (forced Windows build), launch from GameLib on macOS, inspect launch log, helper log, shim log.
- **Related:** Cat Quest (593280) was a different class — shim withheld for x86 coverage gap by design (.planning/debug/resolved/cat-quest-shim-withheld.md, ROADMAP backlog 999.2). Also see .planning/todos/completed/2026-10-26-gamemaker-d3d11-titles-need-dxvk-on-the-bridge.md.
- **Questions to answer:** (1) Is the game / its steam_api.dll 32-bit? x86 shim coverage is narrow. (2) Does GameMaker load steam_api.dll from a path or name the placed shim does not cover (different directory, extension DLL loading by absolute path, e.g. a Steamworks extension dll)? (3) Or does it load the shim and the shim fails before HELLO?
DATA_END

## Current Focus

hypothesis: CONFIRMED (static) - Undertale's 32-bit GMS1.4 runner LoadLibrary's steam_api.dll then resolves SteamAPI_InitSafe (plus GetHSteamPipe/GetHSteamUser); the x86 shim (native/steam-bridge/generated/steam_api.def, 48 hand-pinned exports) exports none of them, so init never reaches the shim and HELLO is never sent. This is the by-design x86 coverage gap (D-53-09, backlog 999.2 class).
test: done - launch log, helper log, runner strings, shim vs original export tables
expecting: n/a
next_action: none - resolved by policy fix (withhold) + ROADMAP 999.2 acceptance title; live confirmation pending a human
reasoning_checkpoint:

## Evidence

- checked: bridge dir ~/Library/Application Support/gamelib/steam-bridge/391540, GamesConfig/391540.json, ~/Library/Logs/GameLib/*
  found: only steam_appid.txt remains; config is {}; no 391540/Undertale lines in any current log. The 2026-11-07 install was uninstalled; evidence is gone.
  implication: cannot run file(1) or read shim/helper logs without a live reinstall
- checked: .planning/todos/completed/2026-10-26-gamemaker-d3d11-titles-need-dxvk-on-the-bridge.md, 261107-lum-SUMMARY.md
  found: Undertale is GMS 1.4 (D3D9) with a native Mac build, forced-Windows only; live gate recorded coverage miss runtime-loaded, helper READY, no HELLO
  implication: GMS 1.4 Windows runner is 32-bit (inference, not observed), so the x86 shim path applies
- checked: file(1) on reinstall (2026-11-11 06:29) in bottle GameLibSteamBridge-391540, drive_c/Program Files (x86)/Steam/steamapps/common/Undertale/
  found: UNDERTALE.exe PE32 i386 (4136960 B); steam_api.dll PE32 i386 (333824 B, the placed shim); steam_api.dll.gamelib-orig PE32 i386 (215120 B, original). Only one steam_api*.dll in the install, sitting beside the exe.
  implication: OBSERVED 32-bit. The x86 shim is placed at the exe-adjacent path, so a "different directory" load path is unlikely. Still open: does the runner load it, and does the shim die before HELLO (launch logs needed)

- checked: 2026-11-11 06:30 gamelib.log launch of 391540 (UNDERTALE.exe pid 91543), overlay wine log
  found: placeShimForGame idempotent no-op (runtime-loaded shim present); helper LISTEN 62171, READY init=ok, CBQ lines from helper's own Steam client only; UNDERTALE.exe started, overlay attached, game ran to title. No `HELLO shim attached appid=391540`, no GINIT/game-originated call anywhere. Shim is placed at the exe-adjacent path, cfg copy written (port=62171). No shim-side log file exists (shim has no file log).
  implication: helper never saw the shim connect. Game process itself ran fine.
- checked: strings UNDERTALE.exe vs export tables (objdump -p) of placed steam_api.dll (shim) and .gamelib-orig
  found: runner contains "Error loading steam_api.dll", "SteamAPI_InitSafe", SteamAPI_GetHSteamPipe/GetHSteamUser, RestartAppIfNecessary, Register/UnregisterCallback(Result), RunCallbacks, Shutdown. Shim exports Init, InitFlat, RestartAppIfNecessary, RunCallbacks, Shutdown, Register/Unregister* but NOT SteamAPI_InitSafe, SteamAPI_GetHSteamPipe, SteamAPI_GetHSteamUser. Original dll exports all. 64-bit .def and gen_vtables.ts (L2885-2906) do provide InitSafe, x64-only, comment: x86 deferred (D-53-09).
  implication: GetProcAddress for InitSafe returns NULL on the shim; runner's init path cannot call into shim -> no HELLO. Not directly observed via WINEDEBUG=+loaddll (would need another live launch), but the missing-export mechanism is sufficient and static.

## Eliminated

- hypothesis: shim placed in a directory/path the runner does not search
  evidence: single steam_api.dll beside UNDERTALE.exe is the shim (333824 B); original kept as .gamelib-orig
  timestamp: 2026-11-11


## Resolution

root_cause: Undertale's 32-bit GMS 1.4 runner resolves SteamAPI_InitSafe / GetHSteamPipe / GetHSteamUser by name from the runtime-loaded steam_api.dll; the hand-pinned x86 shim exports none of them (D-53-09 x86 gap), so init never reaches the shim and HELLO is never sent.
fix: placeShimForGameInner withholds the x86 shim for a runtime-loaded steam_api.dll when the launch exe carries SteamAPI_* names the shim does not export (narrowed to the original dll's exports); runs before the idempotent no-op so a placed shim is restored from .gamelib-orig. Pure helpers extractSteamApiNames / findRunnerUnservedExports in shimCoverage.ts. Undertale added to ROADMAP 999.2 as second acceptance title. Withheld, not bridged, not verified.
verification: shimGenerate/shimCoverage jest (fresh install, previously placed restore, covered-only still placed, unrelated-names ignored, x64 unchanged). Live relaunch pending a human.
files_changed: [src/backend/storeManagers/steam/bridge/shimPlacement.ts, src/backend/storeManagers/steam/bridge/shimCoverage.ts, src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts, src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts, .planning/ROADMAP.md]
