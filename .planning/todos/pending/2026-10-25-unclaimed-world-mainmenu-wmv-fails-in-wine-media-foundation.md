---
created: 2026-10-25
title: "Unclaimed World's main-menu WMV fails to open in the bridge bottle's Media Foundation (HRESULT 0xC00D36BB), so the game exits with a fatal error"
source: 261025-t7i live check, Unclaimed World (284100)
area: steam-bridge
files:
  - public/fixes/284100-steam.profile.json
  - src/backend/storeManagers/steam/bridgeKnownFixes.ts
  - src/backend/storeManagers/steam/bridge/bridge-allowlist.json
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

## Root cause (debug/unclaimed-world-wmv-mf, 2026-10-26)

CrossOver 26.3's bundled GStreamer 1.24.4 (x86_64) has no WMV3 or WMA9 (Pro) decoder: there is no
gst-libav, and `winedmo.so` is an ffmpeg-less stub. Wine's `winegstreamer` builds the Media
Foundation media source on `decodebin`, which logs "Missing decoder: Windows Media Video 9 / Windows
Media Audio 9", so `CreateObjectFromURL` returns 0xC00D36BB (MF_E_UNSUPPORTED_BYTESTREAM_TYPE). The
ASF byte-stream handler, the URL scheme and `MFCreateFile` are all fine (asfdemux parses the streams
as WMV3 1280x720 and WMA9). A standalone MF probe reproduces it with no game, 32- and 64-bit, so
the bridge and the game are not involved. All 17 bridge bottles have identical MF registry, so no
per-bottle registry tweak can add a codec.

Tested on a clone of `GameLibSteamBridge-284100` (clone deleted afterwards):

- `winetricks wmv9vcm`: installs the VfW codec `wmv9vcm.dll`; MF does not use VfW. Still 0xC00D36BB
  (32- and 64-bit).
- `winetricks wmp11`: installs, but replaces Wine's `mfplat`/`wmvcore`/`wmasf` with the 2006 native
  XP builds. 64-bit system32 is left without `mfplat`/`wmvcore`, and the 32-bit native `MFPlat.dll`
  has no `MFCreateSourceResolver` ("unimplemented function"), so MF is worse than before.

Outcome: 284100 is marked `does-not-run` in `bridge-allowlist.json` `knownBad` (the existing
mechanism; it stays on the bridge behind the informational notice and is not rerouted to bottled
Steam). The WMP Active Setup marker in `284100-steam.profile.json` is still needed to get this far.

Route proven by spike 042 (`.planning/spikes/042-crossover-gst-libav-overlay/`, VALIDATED
2026-10-27). An x86_64 gst-libav plugin plus LGPL ffmpeg (10 dylibs, 19 MB, thinned from the
official GStreamer 1.24.13 universal pkg) on `GST_PLUGIN_PATH` makes CrossOver's GStreamer decode
WMV3, WMA9 Pro and WMA8 (`avdec_wmv3`, `avdec_wmapro`, `avdec_wmav2`). A live GameLib bridge
launch then reached the main menu with video and music. That run used a temporary local tier-1
file (`fixes/local/284100-steam.json`, `envVariables.GST_PLUGIN_PATH` only) pointing at a scratch
copy of the payload, so nothing shippable exists yet. The `Options.xml` `PlayVideo=false` tip
from ProtonDB does not work under CrossOver: the game still loads a WMA8 music track at startup
(`MusicEnabled=false` makes no difference).

Decisions and remaining work (decisions closed 2026-10-27, so `ready: live-gate`):
1. **Decided 2026-10-27 (operator): GameLib-hosted on-demand download.** The thinned 19 MB x86_64
   set is published as a release asset on `grayson-mitchell/GameLib`, fetched only when a profile
   needs it, and verified against a sha256 pinned in GameLib's code, never one fetched from the
   same host. Rejected: bundling, because every macOS install would pay 19 MB for a few titles and
   the dylibs would need signing for notarization. Also rejected: fetching the upstream
   freedesktop.org pkg directly, because 1.24.4 has already been removed from that server and
   1.24.13 can go the same way.
2. LGPL obligations follow from 1, because GameLib is now the distributor. Publish the licence
   texts and the exact upstream source tarballs (gst-libav 1.24.13 and its ffmpeg) beside the
   asset, and add a notice to GameLib's licences page. The binaries are unmodified and dynamically
   loaded. **Patent position decided 2026-10-27 (operator):** accepted for GameLib-hosted
   distribution.
3. Then build the tier-2 `overlays` plugin-directory target kind: place the sha-pinned payload in a
   GameLib-owned directory (never the game folder or the bottle) and add `GST_PLUGIN_PATH` at
   launch, appending rather than replacing. Give 284100's profile the entry. The fix is generic, so
   other WMV/WMA titles can reuse it.
4. Log the known-fix env vars applied at launch. The live run could only be confirmed by its
   effect.

Done-when (unchanged): 284100 reaches its main menu in the bridge bottle through the shipped
profile, without the temporary local file. Then lift the knownBad entry and delete
`fixes/local/284100-steam.json`.

Local workaround (2026-10-27, operator's machine only): the spike 042 payload was moved out of the
scratchpad into `~/Library/Application Support/gamelib/overlays/gst-libav-1.24.13/` (sha256 per file
in its `SHA256SUMS`), and `fixes/local/284100-steam.json` now points `GST_PLUGIN_PATH` there, so the
game keeps playing across reboots. This is a hand-applied stand-in for the unbuilt tier-2 target,
not a shipped fix; the done-when above is unchanged.

Relaunch from the moved payload confirmed by the operator, 2026-10-27: the game reached the main
menu. Both overlay launches (spike 042 and this one) paused for about a minute before the game
appeared. Resolved by quick 261027-m1m: the cause was not the overlay. Each launch spent two extra
cold Wine sessions rewriting the WMP registry marker, and CrossOver can stall about 80 s in
`wineboot --init` on a cold session start. Values already present are now skipped, and three
live launches came up in 1-2 s.
