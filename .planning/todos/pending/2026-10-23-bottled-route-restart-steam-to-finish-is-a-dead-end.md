---
created: 2026-10-23
title: "Bottled route: \"Restart Steam to finish\" is a dead end (disabled button, no way to start bottled Steam)"
source: phase 51-28 live gate item 17 (XCOM, 200510, bottled Steam)
area: steam-bottle
files:
  - src/backend/storeManagers/steam/games.ts
severity: major
platform: macos
ready: code
---

After a GameLib-direct download into the GameLibSteam bottle fails closed to StateFlags=1026 (see `2026-10-22-unresolved-cross-depot-file-collisions-leave-install-stuck-at-1026.md`), the tile shows "Restart Steam to finish" as a disabled button. Bottled Steam was not running, and nothing in the app starts it, so the manifest is never adopted. The operator had to start it by hand with `wine --bottle GameLibSteam steam.exe steam://install/<appId>`; bottled Steam then adopted and repaired the files and polling flipped to installed (20:42:29).

Fix direction: when the state is 1026 on the bottled route and bottled Steam is not running, make the button actionable (start bottled Steam with `steam://install/<appId>`), or start it automatically. Either way, say what is happening instead of leaving a disabled control.
