---
spike: 042
name: crossover-gst-libav-overlay
type: standard
validates: "Given CrossOver 26.3's bundled GStreamer 1.24.4, when an external gst-libav plugin directory is put on GST_PLUGIN_PATH, then Media Foundation's CreateObjectFromURL succeeds on Unclaimed World's WMV3/WMA9 menu video"
verdict: VALIDATED
related: []
tags: [crossover, gstreamer, media-foundation, known-fixes, overlays, steam-bridge]
---

# Spike 042: CrossOver gst-libav overlay

## What This Validates

Given CrossOver 26.3's bundled GStreamer 1.24.4 (x86_64, loaded by winegstreamer), when a
directory holding an externally built gst-libav plugin is put on `GST_PLUGIN_PATH`, then
`CreateObjectFromURL` on `TauCetiMainMenu.wmv` (WMV3 + WMA9 Pro) succeeds and decodebin picks the
libav decoders. Informs a tier-2 `overlays` target kind for a GStreamer plugin directory. Root
cause: `.planning/debug/unclaimed-world-wmv-mf.md`.

Sub-questions: 042a env reach; 042b obtain plugin (official GStreamer 1.24.x universal pkg,
user's choice); 042c end-to-end probe.

## How to Run

All runs use the throwaway APFS clone `zz-spike042-wmv` of `GameLibSteamBridge-284100`
(`cp -Rc`, new BottleID). The live bottle and game files are never touched.

    zig cc -municode -target x86_64-windows-gnu mfprobe.c -o mfprobe64.exe -lmfplat -lmf -lmfreadwrite -lmfuuid -lole32
    zig cc -municode -target x86-windows-gnu    mfprobe.c -o mfprobe32.exe -lmfplat -lmf -lmfreadwrite -lmfuuid -lole32
    ./run.sh <label> <32|64> [ENV=value ...]

`mfprobe` opens the file with `CreateObjectFromURL` (plain Windows path, as MonoGame passes it),
then asks a source reader for RGB32/PCM on every stream and decodes one sample each. Prints
`VERDICT=DECODE_OK|DECODE_FAILED`.

## Investigation Trail

1. **Baseline (clone, no changes):** `CreateObjectFromURL=0xc00d36bb` on 32- and 64-bit. Log:
   `Unsupported demuxer, status 0xc000007a` (winedmo stub), then decodebin `Missing decoder:
   Windows Media Video 9 (... WMV3, 1280x720)` and `Missing decoder: Windows Media Audio 9
   (wmaversion=3)`. Matches the debug session. (A first probe build that passed a `file:///` URL
   got 0x80070003 instead; MonoGame passes the plain path, so the probe does too.)
2. **042a env reach: YES.** With `GST_PLUGIN_PATH=<scratch>/plugdir`,
   `GST_REGISTRY=<scratch>/registry-a.bin` and `GST_DEBUG=GST_PLUGIN_LOADING:5,GST_REGISTRY:5` set
   on the `wine` wrapper's environment, the unix side logs `GST_PLUGIN_PATH set to …/plugdir`,
   `scanning path …/plugdir`, and attempts to load the `.dylib` there, before it scans
   CrossOver's own `lib64/gstreamer-1.0`. (The control was a renamed copy of
   `libgstwavparse.dylib`, so "Could not find plugin entry point" is expected: the entry symbol is
   derived from the filename.) Unlike `WINEDLLOVERRIDES`, CrossOver's wrapper passes `GST_*`
   through.
3. **Music is affected too.** The game's 9 `Content/Music/*.wma` tracks are WMA8 (wmaversion=2).
   The probe gets `0xc00d36bb` on them as well (`Missing decoder: Windows Media Audio 8`). So
   any fix that only skips the video still leaves music without a decoder; avdec_wmav2 is needed
   alongside avdec_wmv3 and avdec_wmapro.
4. **Workaround reported by the user (ProtonDB):** `<PlayVideo>false</PlayVideo>` in
   `Options.xml`. That file is in `Documents/Unclaimed World/`, which is user settings, not a game
   file. In GameLib bottles `drive_c/users/crossover/Documents` is a symlink to the real
   `~/Documents`, so the file is shared with any other install and the clone cannot isolate it.
   Not yet tested under CrossOver. Proton ships a full GStreamer with libav, so music works there.
   Under CrossOver, music would still fail per item 3, and whether the game survives a failed
   `Song` load is unknown.

5. **Workaround tested: INVALIDATED under CrossOver (2026-10-27).** With `PlayVideo=false`, a
   live GameLib bridge launch still showed the "Whoops - fatal error" box. Running
   `UnclaimedWorld.exe` directly in the clone (`logs/game-playvideo-false.err`; the game tolerates a
   failed `SteamAPI_Init`) shows why: the menu video is no longer opened (0 `TauCeti` hits), but the
   game then calls `CreateObjectFromURL` on `Content/Music/Jesper Lundager - Prosperous
   Frontier_320.wma`, decodebin reports `Missing decoder: Windows Media Audio 8`, and the media
   source fails with `0x80004005`. Adding `MusicEnabled=false` changes nothing
   (`logs/game-nomusic.err`): the song is loaded at startup either way. No settings-only fix exists
   here; the game needs a WMA8 decoder even with video and music both off. `Options.xml` was restored
   from its backup afterwards.

6. **042b plugin source: official GStreamer 1.24.13 universal pkg.** 1.24.4 is no longer
   published; 1.24.13 is the only 1.24.x on `gstreamer.freedesktop.org/data/pkg/osx/`. The pkg is
   **unsigned** (`pkgutil --check-signature`: no signature); its only integrity check is the
   `.sha256sum` from the same server (`a18458c7…537839`, matched). Expanded with
   `pkgutil --expand-full`, nothing installed. From `gstreamer-1.0-libav-…pkg` and
   `base-system-…pkg`, `lipo -thin x86_64` of: `gstreamer-1.0/libgstlibav.dylib`, `libavcodec.60`,
   `libavformat.60`, `libavutil.58`, `libavfilter.9`, `libswresample.4`, `libswscale.7`,
   `libpostproc.57`, `libz.1`, `libbz2.1` (19 MB total). Layout `overlay/lib/gstreamer-1.0/` plus
   `overlay/lib/`, so the plugin's `@loader_path/..` rpath finds ffmpeg. Everything is `@rpath`;
   the GStreamer/GLib deps resolve to CrossOver's already-loaded libs. ffmpeg is the LGPL build
   (`libavutil license: LGPL version 2.1 or later`, no `--enable-gpl`).
7. **The compat-version gap does not matter.** The plugin records libgstreamer compat 2414
   (1.24.13); CrossOver ships 2405 (1.24.4). It loaded and ran anyway.
8. **042c probe: DECODE_OK, 32- and 64-bit.** With `GST_PLUGIN_PATH=overlay/lib/gstreamer-1.0`:
   `CreateObjectFromURL=0x0` on the menu video; video decodes to a full 1280x720 RGB32 frame
   (3,686,400 bytes) and audio to float PCM. Both WMA8 music tracks tested also decode. decodebin
   creates `asfdemux`, `avdec_wmv3`, `avdec_wmapro` (and `avdec_wmav2` for music). One pivot: the
   first probe asked a plain source reader for RGB32 and got `0xc00d5212` on video (no colour
   converter; the decoder emits I420). Setting `MF_SOURCE_READER_ENABLE_VIDEO_PROCESSING`, which
   is what a media-session topology like MonoGame's provides, fixed it. 32-bit Windows processes
   use the same x86_64 unix-side GStreamer, so one x86_64 overlay serves both.
9. **Game in the clone:** `UnclaimedWorld.exe` with the overlay opens the video and the music
   (0 `Failed to create media source`), no fatal entry in `Errors.txt`, and the operator saw the
   window open.
10. **Live GameLib bridge launch: main menu with video and music (operator, 2026-10-27).**
    Delivered as a temporary *local tier-1* file `fixes/local/284100-steam.json` with only
    `envVariables.GST_PLUGIN_PATH` pointing at the scratch overlay. Two launches (07:15:49,
    07:16:29), both HELLO + `GINIT SteamAPI_InitSafe ok=1`. Gap: GameLib does not log which
    known-fix env vars it applied.

## Results

**VALIDATED.** CrossOver 26.3's GStreamer loads an external libav plugin set from
`GST_PLUGIN_PATH`, and with it Unclaimed World reaches its main menu with video and music over the
Steam bridge. The `Options.xml` workaround is INVALIDATED under CrossOver.

Signal for the build (tier-2 `overlays`, plugin-directory target):
- Payload: the 10 x86_64 dylibs above, sha-pinned, in an `overlay/lib/gstreamer-1.0` + `overlay/lib`
  layout. Generic, not per-game: any WMV/WMA (and other libav-covered) title benefits.
- Placement: a GameLib-owned directory outside the bottle and the game folder (never game files);
  the profile adds `GST_PLUGIN_PATH` (append, do not clobber) at launch. The env var alone is
  tier-1-expressible, but the binary payload must stay tier 2 (bundled/local, never remote).
- Open: shipping or fetching the 19 MB payload (bundle vs on-demand download with pinned sha);
  LGPL obligations (notice + source offer for ffmpeg/gst-libav); WMV/WMA patent posture; whether
  to trim to a minimal LGPL ffmpeg build later; logging applied known-fix env vars.
