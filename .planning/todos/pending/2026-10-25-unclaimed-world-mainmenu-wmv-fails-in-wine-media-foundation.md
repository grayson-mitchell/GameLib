---
created: 2026-10-25
title: "Unclaimed World's main-menu WMV fails to open in the bridge bottle's Media Foundation (HRESULT 0xC00D36BB), so the game exits with a fatal error"
source: 261025-t7i live check, Unclaimed World (284100)
area: steam-bridge
files:
  - public/fixes/284100-steam.json
  - src/backend/storeManagers/steam/bridgeKnownFixes.ts
severity: medium
platform: macos
ready: live-gate
---

With the Steam path working (quick 261025-t7i, `4d26c70d1`), Unclaimed World 284100 gets through
startup to HELLO, `GINIT fn=SteamAPI_InitSafe ok=1` and `CALL SteamUtils007.GetAppID`. It then shows
"Whoops - fatal error … HRESULT: [0xC00D36BB], Module: [Unknown], ApiCode: [Unknown/Unknown],
Message: Unknown" and exits. This happened on both live runs, 2026-10-25 21:43 and 22:00.

The game's own `Errors.txt` (game dir, entry dated 21:47:37, "Fatal error 1.0.3.5") records this
stack, running on Wine Mono:

    SharpDX.Result.CheckError
    SharpDX.MediaFoundation.SourceResolver.CreateObjectFromURL
    Microsoft.Xna.Framework.Media.Video.PlatformInitialize
    Microsoft.Xna.Framework.Content.VideoReader.Read
    UWGame.Control.BackgroundScreen.LoadContent
    UWGame.Control.Controller.LoadContent
    GameStateManagement.UnclaimedWorld.Initialize

The asset is `Content/MainMenu/TauCetiMainMenu.wmv` (9.8 MB, `file`: Microsoft ASF), which is the
main-menu background video. The bridge bottle `GameLibSteamBridge-284100` has Wine's `mf.dll`,
`mfplat.dll`, `mfreadwrite.dll`, `mfasfsrcsnk.dll`, `winegstreamer.dll`, `wmvdecod.dll` and
`wmvcore.dll` in system32, plus the WMP Active Setup marker from `public/fixes/284100-steam.json`.
DirectX Jun2010 was installed by quick 261025-rkj. Even so, the source resolver cannot create a
media source for the ASF file.

This is the open question from the closed runtime-components todo
(`completed/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md`): whether the
game's music and video actually play.

Investigate:
1. Which step fails. Candidates: the ASF byte-stream handler, a WMV decoder missing from
   CrossOver's macOS GStreamer, or a scheme/URL issue in `CreateObjectFromURL`. Use a diagnostic
   launch with `CX_DEBUGMSG` channels `+mfplat,+mf,+gstreamer` (CrossOver ignores `WINEDEBUG`).
2. Whether CrossOver offers a component that fixes it (a CrossTie or winetricks verb) that
   known-fixes can apply. The `winetricks` key already works for the bridge, as of 261024-tny.
3. How other MonoGame/XNA titles that use WMV behave under CrossOver.

Constraint: never modify game files (compat-fixes decision 4). Re-encoding or replacing the WMV is
out.

Done-when: 284100 reaches its main menu in the bridge bottle without the fatal error, through a fix
expressed as known-fixes data or a generic building block.
