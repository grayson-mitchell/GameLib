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
status: "RESOLVED 2026-10-25 by quick 261025-rkj (items 1 and 3) after 261025-mfz (item 2). The live check is a human UAT item recorded in the 261025-rkj SUMMARY."
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

## Status and 53-20 diagnosis (2026-10-25, quick 261025-mfz)

The registry step is DONE by quick 261025-mfz. Known-fixes now has a `registry` key. It is honoured
only from bundled sources (`public/fixes/`, packaged as `build/fixes`) or local sources
(`fixes/local/<appId>-steam.json`), and it is stripped from the remote layer. The bundled profile
`public/fixes/284100-steam.json` sets `IsInstalled` = `REG_DWORD 1` under the WMP Active Setup key,
in both registry views, on every bridge launch. The applied-fix ledger and reversal (decision 5)
are deferred. Item 2 of the work list is therefore covered by that profile.

Correction to the "53-20 evidence" section above: the 53-20 "error on startup ... serious problem"
dialog is Wine's crash dialog ("... has encountered a serious problem and needs to close"). It is
not a WMP failure, and it is not unidentified. It is the
`unimplemented function steam_api64.dll.SteamAPI_InitSafe` crash recorded live in 53-UAT item 11,
tracked in `2026-10-24-x64-shim-lacks-old-sdk-csteamworks-exports-and-interface-versions.md`. The
GameLib log at 14:21 on 2026-10-25 shows INIT ok, shims placed, process alive 51 s, and no Wine
stderr captured.

Correction to the census note: the Arch column printing x64 for this PE32 exe is correct. It is an
AnyCPU .NET assembly, which runs as x64 (D-53-10).

Still open: item 1 (reading appinfo/redist dependency data) and item 3 ("Installing Windows
components..." on the Play button). Whether music and video play is still unknown until the shim
crash is fixed.

## Closed (2026-10-25, quick 261025-rkj)

Items 1 and 3 are done. A bridge launch now installs the VC++ and DirectX redistributables the
game's appinfo declares (`depotfromapp: 228980`) from the Steamworks Common Redistributables app,
by running each depot's own `installscript.vdf` in the `GameLibSteamBridge-<appId>` bottle, the way
Steam's first-launch step does. The Play button shows the `redist` status with the component
label, for example `Installing Redistributables (DirectX Jun2010)`. .NET, PhysX, XNA, OpenAL and
any depot whose kind cannot be established are skipped and logged. A trusted (bundled or local)
`steamSharedRedists` known-fixes key can opt a title into one of those, and only for depots the
game itself declares. Item 2 was done by quick 261025-mfz.

Corrections to the measurements in this todo:
- Depot 229033 is PhysX 9.14.0702, not VC++. It is verified from its installscript path
  (`_CommonRedist\PhysX\9.14.0702\installscript.vdf`) and is not installed automatically.
- 284100 does declare shared depots: 228990 (DirectX Jun2010) and 229004 (.NET 4.5.2). It gets
  DirectX automatically with this change. .NET stays on Wine Mono unless a trusted profile opts in.
  The earlier line "284100 declares nothing" was wrong.

The live check (a real 1363080 or 219990 bridge launch installing VC++/DirectX, then a second launch
showing no redist step) is a human UAT item recorded in the 261025-rkj SUMMARY. It did not block
closing this todo. The 284100 shim crash remains tracked in
`2026-10-24-x64-shim-lacks-old-sdk-csteamworks-exports-and-interface-versions.md`.
