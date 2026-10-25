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

## Hand test, 2026-10-24 (after quick 261024-tny): 284100 needs a registry marker, not an installer

The "Missing Windows Media Player" box is the game's own check, in `UnclaimedWorld.exe`. It reads
`HKLM\Software\Microsoft\Active Setup\Installed Components\{22d6f312-b0f6-11d0-94ab-0080c74c7e95}`,
Windows Media Player's Active Setup marker. No GameLib bottle carries that key. The bottle already
has Wine's builtin `wmp.dll`, `wmvcore.dll` and the `mf*.dll` set, in both `system32` and
`syswow64`.

Adding only `IsInstalled` = `REG_DWORD 1` under that key, in both the `/reg:32` and `/reg:64`
views, got the game past the dialog. It then reached Steam init and crashed in the shim. That crash
is a separate bridge defect, tracked in
`2026-10-24-x64-shim-lacks-old-sdk-csteamworks-exports-and-interface-versions.md`. Whether music
and video actually play is not yet known, because the game dies before any media starts. The
bottle's pre-change registry is backed up outside the repo; the marker is still in place.

What this changes in the work list above:
- Item 2 (a per-appId override list) is now a known-fixes profile, `fixes/284100-steam.json`.
  Quick 261024-tny wired `winetricks`, `runInPrefix` and `envVariables` into the bridge launch.
- But this fix is a registry value, which known-fixes cannot express yet. The `registry` key from
  `.planning/notes/per-game-compat-fixes-architecture.md` (decision 3, honoured from bundled or local
  sources only per decision 6) is the next step, ahead of item 1.
- Item 1 (reading appinfo's redist list) still matters for games whose components are real
  installs, but it would not have found this case: 284100 declares nothing.
- The measurement note's "blocked before Steam init" no longer holds for 284100 with the marker in
  place: it reaches Steam init and fails on the shim.

## 53-20 evidence (2026-10-25)

Operator, 284100 in the 53-20 session: "error on startup ... serious problem" (dialog text not captured). Logs: x86 `UnclaimedWorld.exe`, helper INIT ok, both shims placed (290304 and 497664), process alive 51s, no window raised, no HELLO. The WMP Active Setup marker is present in the bottle's system.reg in both views (lines 66715, 77788), so the Windows Media Player dialog is not explained by a missing marker; the failure is unidentified. Next step: relaunch once, capture the dialog text and the Wine stderr. Note the census Arch column prints x64 for this title but the launch exe is PE32.
