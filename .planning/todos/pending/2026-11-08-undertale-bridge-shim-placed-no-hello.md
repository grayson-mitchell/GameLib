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
