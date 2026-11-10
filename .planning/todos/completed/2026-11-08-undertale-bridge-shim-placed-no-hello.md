---
created: 2026-11-08T00:00:00.000Z
title: 'Undertale (391540) launches with the shim placed and helper READY, but the shim never says HELLO'
area: steam
severity: medium
platform: macos
ready: live-gate
found_by: 'quick 261107-lum live gate; split out of the Cat Quest todo by debug session cat-quest-shim-withheld'
---

Undertale (391540, GameMaker) logged `shim coverage miss … steam_api.dll@runtime-loaded`, launched with the helper `READY init=ok`, but produced no shim HELLO and no game-originated call. This is a different class from Cat Quest (593280): there the shim was **withheld** (x86 coverage gap, by design, see ROADMAP backlog 999.2). Here it was **placed** over a runtime-loaded `steam_api.dll`, yet never loaded or never initialised.

Find out whether GameMaker loads `steam_api.dll` from a path or name the placed shim does not cover (e.g. a different directory, an extension DLL loading it by absolute path), or loads it and the shim fails before HELLO. Also check whether the game is 32-bit, since the x86 shim's coverage is narrow. Strict verified bar applies: shim HELLO plus a game-originated bridge call (non-Unity criterion, D-53-13).

## Resolution (2026-11-11, debug undertale-shim-placed-no-hello)

Root cause: the Undertale runner is a 32-bit GMS 1.4 exe that resolves `SteamAPI_InitSafe`, `SteamAPI_GetHSteamPipe` and `SteamAPI_GetHSteamUser` from the runtime-loaded `steam_api.dll`. The hand-pinned x86 shim exports none of them (D-53-09 x86 gap), so init never reached the shim and no HELLO was sent.

Fix: `placeShimForGameInner` now withholds the x86 shim for a runtime-loaded `steam_api.dll` when the launch exe carries `SteamAPI_*` names the shim does not export (narrowed to names the original dll exports). A previously placed shim is restored from `.gamelib-orig`, so Undertale launches direct with no helper, like Cat Quest. x64 is unchanged. NOT bridged and NOT verified; Undertale is recorded as a second acceptance title in ROADMAP backlog 999.2. Live confirmation of the withheld launch is pending.
