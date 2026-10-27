---
status: diagnosed
trigger: "Unclaimed World (284100) main-menu WMV (Content/MainMenu/TauCetiMainMenu.wmv) fails in bridge bottle Media Foundation: SharpDX SourceResolver.CreateObjectFromURL returns HRESULT 0xC00D36BB, game exits with fatal error. Todo: .planning/todos/pending/2026-10-25-unclaimed-world-mainmenu-wmv-fails-in-wine-media-foundation.md. Done-when: 284100 reaches main menu in bridge bottle via known-fixes data or a generic building block; never modify game files."
created: 2026-10-26
updated: 2026-10-26
---

## Symptoms

- expected: Unclaimed World 284100 launched through the macOS Steam bridge (bottle `GameLibSteamBridge-284100`) reaches its main menu, with the background video `Content/MainMenu/TauCetiMainMenu.wmv` (ASF, 9.8 MB) playing or at least not fatal.
- actual: Gets to HELLO, `GINIT fn=SteamAPI_InitSafe ok=1`, `CALL SteamUtils007.GetAppID`, then shows "Whoops - fatal error … HRESULT: [0xC00D36BB]" and exits. Reproduced on both live runs, 2026-10-25 21:43 and 22:00.
- errors: Game-dir `Errors.txt` (21:47:37, "Fatal error 1.0.3.5"), Wine Mono stack: SharpDX.Result.CheckError ← SharpDX.MediaFoundation.SourceResolver.CreateObjectFromURL ← Microsoft.Xna.Framework.Media.Video.PlatformInitialize ← VideoReader.Read ← UWGame.Control.BackgroundScreen.LoadContent ← Controller.LoadContent ← UnclaimedWorld.Initialize. 0xC00D36BB = MF_E_UNSUPPORTED_BYTESTREAM_TYPE (per MF error tables; verify).
- timeline: Never worked. Became reachable only after quick 261025-t7i (`4d26c70d1`) fixed the Steam path; earlier blockers were the WMP Active Setup marker (261025-mfz, `public/fixes/284100-steam.json` registry key) and DirectX Jun2010 (261025-rkj).
- reproduction: Launch 284100 from GameLib on macOS; it routes to the bridge bottle. Bottle system32 has Wine `mf.dll`, `mfplat.dll`, `mfreadwrite.dll`, `mfasfsrcsnk.dll`, `winegstreamer.dll`, `wmvdecod.dll`, `wmvcore.dll`.

## Constraints

- Never modify game files (compat-fixes decision 4): re-encoding/replacing the WMV is out.
- Fix must be known-fixes data (`public/fixes/284100-steam.json`; keys incl. `winetricks`, `runInPrefix`, `envVariables`, `registry`) or a generic building block in `src/backend/storeManagers/steam/bridgeKnownFixes.ts` / bridge launch.
- CrossOver ignores `WINEDEBUG`; use `CX_DEBUGMSG` channels `+mfplat,+mf,+gstreamer`.
- Follow `Skill("gamelib-conventions")` for any child-process spawn (fake-HOME), sidecar handles, and `<verify>` prettier checks. `tauri dev` does not rebuild the sidecar (restart dev before live tests).
- Bridge "verified" is strict: HELLO + clean game Steam-init log; In-Game never counts.

## Investigate (from todo)

1. Which step fails: ASF byte-stream handler registration, WMV decoder missing from CrossOver's macOS GStreamer, or scheme/URL issue in CreateObjectFromURL.
2. Whether a CrossTie / winetricks verb fixes it that known-fixes can apply.
3. How other MonoGame/XNA WMV titles behave under CrossOver.

## Current Focus

- hypothesis: CONFIRMED root cause - CrossOver 26.3 bundled GStreamer 1.24.4 (x86_64) has no WMV3/WMA9 decoder (no gst-libav), so winegstreamer's decodebin media source fails.
- next_action: none. Option B failed, option C applied (knownBad does-not-run). Awaiting caller review/commit.

## Evidence

- 2026-10-26 standalone repro (zig-built MF probe, scratchpad mft64.exe/mft32.exe, run via CrossOver wine --bottle GameLibSteamBridge-284100, CX_DEBUGMSG=+mfplat,+mf,+gstreamer,+wmvcore,+quartz): CreateObjectFromURL(TauCetiMainMenu.wmv) -> 0xC00D36BB for both 32- and 64-bit. No game needed.
- Log: asfdemux identifies video WMV3 1280x720 and WMA9 (wmaversion=3, Pro); decodebin then errors "Missing decoder: Windows Media Video 9 ... / Windows Media Audio 9 ..." -> wg_parser_connect "Failed to play stream" -> stream_handler "Failed to create media source" -> 0xC00D36BB. ASF handler registration is fine (.asf/.wmv ByteStreamHandlers present); the first-tried mfasfsrcsnk path logs "Unsupported demuxer, status 0xc000007a" (winedmo.so is a stub with no ffmpeg linked), then falls to the winegstreamer path.
- CrossOver gstreamer-1.0 plugins (lib64): applemedia, asf, audioconvert, audioparsers, audioresample, avi, coreelements, deinterlace, id3demux, isomp4, opengl, playback, typefind, videoconvertscale, videofilter, videoparsersbad, wavparse. No libav, no wmv/wma decoder. applemedia (VideoToolbox) does not do WMV3.
- Scheme/URL hypothesis eliminated: URL resolves, MFCreateFile succeeds, byte stream passed on. Same failure in all 17 bridge bottles' MF registry (identical), so a per-bottle registry/winetricks tweak cannot add a codec.
- 2026-10-26 option B on a clone (zz-probe-wmv, deleted): winetricks wmv9vcm installs, probe still 0xC00D36BB (mft32 and mft64). winetricks wmp11 installs but swaps in native 2006 MFPlat (32-bit syswow64 only; 64-bit system32 loses mfplat/wmvcore); mft32 aborts "unimplemented function MFPlat.DLL.MFCreateSourceResolver", mft64 prints nothing. Both eliminated.

## Eliminated

- hypothesis: ASF byte-stream handler not registered / bad URL scheme
  evidence: handlers registered, file opened, asfdemux parses streams; failure is at decodebin decoder lookup.
  timestamp: 2026-10-26

## Resolution

- root_cause: CrossOver's bundled GStreamer lacks WMV3 and WMA9 (Pro) decoders (no gst-libav; winedmo is also an ffmpeg-less stub), so Wine's winegstreamer cannot create an MF media source for any WMV3/WMA9 ASF. Not fixable by registry/winetricks/env known-fixes data alone; needs a decoder supplied from outside CrossOver.
- fix: option C. 284100 added to bridge-allowlist.json knownBad as does-not-run (stays on bridge with informational notice; no bottled-Steam reroute). Notes and todo updated (todo ready: blocked, kept open).
- verification: allowlist/bridge/census jest suites pass (853 tests); planning gates 12/12; prettier clean on touched ts/json. No live run (codec gap not fixed).
- files_changed: [src/backend/storeManagers/steam/bridge/bridge-allowlist.json, src/backend/storeManagers/steam/bridge/allowlist.ts, src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts, .planning/notes/per-game-compat-fixes-architecture.md, .planning/todos/pending/2026-10-25-unclaimed-world-mainmenu-wmv-fails-in-wine-media-foundation.md]
