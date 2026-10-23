---
created: 2026-10-24
title: "Bridge bottles get no Windows runtime components (Media Foundation / WMP, .NET, VC++), so games that need them fail at startup"
source: 51-29 representative sample, Unclaimed World (284100)
area: steam-bridge
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
severity: medium
platform: macos
ready: code
---

Unclaimed World (284100) routes to the bridge. The helper reaches `INIT SteamAPI ready`, and
`UnclaimedWorld.exe` starts (2026-10-24 10:40:11). The game then shows a startup error saying
Windows Media Player is missing, and its process was gone after 56 s. No `HELLO` appeared.
The game is a MonoGame/XNA .NET 4.5.1 title (`UnclaimedWorld.exe.config`). It plays music and
video through `SharpDX.MediaFoundation`, and steam_api is reached through the old
`CSteamworks.dll` wrapper. It fails before reaching Steam init.

Not a bridge defect: the per-app `GameLibSteamBridge-<appId>` bottle is a bare CrossOver bottle.
On Windows, Steam's first launch runs each game's install script and redistributables
(`_CommonRedist`, the `installscript.vdf` steps, and the per-app dependency list in appinfo).
GameLib's native install does none of that, and this game ships no `_CommonRedist`, so nothing
says what it needs.

Work:
1. Read the per-app dependency data that Steam itself uses, from appinfo `depots`/`installscript`
   and the shared redist depots (228980 "Steamworks Common Redistributables"). Install the listed
   components into the bridge bottle on first launch with CrossOver's CrossTie or winetricks
   equivalents, the way Steam's "Installing ..." first-launch step does.
2. Where nothing is declared, as here, keep a small per-appId override list (e.g.
   `284100: [mediafoundation/wmp]`) next to the bridge allowlist.
3. Show "Installing Windows components…" on the Play button while it runs.

Measurement note for 51-29/51-30: bridge-routed, does not run, cause a missing Windows runtime
component in the bottle. Not a bridge defect, and not `knownBad` (bottled Steam would hit the same
gap unless its own redist step happens to install it). Count it as "blocked before Steam init"
rather than as a bridge failure.
