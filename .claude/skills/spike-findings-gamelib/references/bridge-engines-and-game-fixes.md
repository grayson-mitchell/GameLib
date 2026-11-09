# Bridge engines, OpenGL paths, per-game known fixes and prefix choice (macOS)

This covers the layer **underneath** the macOS Steam bridge (`references/macos-steam-bridge.md`):
which Wine runtime runs the game, how a game that crashes in its bridge bottle gets fixed without
touching its files, and which prefix it runs in. The overlay injection runner is separate, in
`references/steam-overlay-in-bottles.md`.

**Key finding:** the bridge (shim, helper, cfg, TCP) is engine-independent. Every failure in these
spikes was in the **graphics or media stack, before `steam_api` loaded**. So "engine choice" is
really a D3D/GL-path choice, and per-game fixes are **data** (a tier-2 profile written into
`gamelib_bridge.cfg`, or an env var plus a GameLib-owned overlay directory), never per-game code and
never modified game files.

> **Operator decisions override older spike conclusions** (memory
> `steam-engine-crossover-first-staging-fallback`, 2026-10-31, refined 2026-11-02;
> `bottled-steam-is-narrow-fallback`, 2026-10-23):
>
> - **CrossOver is the first-choice engine** for Windows Steam games. A **pinned, GameLib-managed
>   Wine-Staging + DXVK** is the automatic fallback when CrossOver is missing, expired or broken. It
>   runs on the **same bottle** with `USER=crossover`.
> - There is **no engine picker by default**. A per-game override exists only as an advanced option,
>   and it is **unsupported unless it picks CrossOver**. Picking CrossOver explicitly is supported,
>   the same as Automatic, with no warning or badge. Known-fixes and the census do not apply to
>   non-CrossOver overrides.
> - **GPTK and `-DXMT` are not in the supported set.** 056 and 058 show the bridge _works_ on them.
>   That is not a reason to offer them.
> - A game that doesn't run (`does-not-run`, such as Hoard) **launches through the bridge** behind a
>   one-time notice. It must **not** be rerouted to bottled Steam. Only `drm-wrapped` goes there. Fix
>   it with a known-fix profile instead.

## Requirements

- **Per-game shim fixes are tier-2 data.** `KnownFixProfile.shimFeatures` in a `.profile.json`
  (local or bundled, never remote, never tier-1) becomes `fix.<feature>=<value>` lines in the
  existing `gamelib_bridge.cfg`. The shim reads them itself at `DLL_PROCESS_ATTACH`. Feature names
  are a closed, generic list on **both** sides. No `fix.` line means no hook. _(034)_
- **`wgl.hideExtensions` is the shipping fix for games that ask for a GL 3.x compatibility
  context.** It's an IAT hook on the exe's `OPENGL32!wglGetProcAddress` that filters
  `wglGetExtensionsString{ARB,EXT}`. It replaces 030's byte patch, which Steam verify would undo.
  _(030 → 033 → 034)_
- **Game files are never modified.** Fixes go into the shim, a profile, env, a per-exe registry key,
  or a GameLib-owned directory. _(030, 033, 034, 042)_
- **The shim ships as a release build** (`-O2 -fno-sanitize=undefined`). A Debug/UBSan shim panics
  the game on legal x86 misaligned pointers. Fixed in quick `261023-tyf`. _(033, 034)_
- **Media codecs: GStreamer overlay via `GST_PLUGIN_PATH`.** CrossOver's GStreamer lacks libav. An
  external x86_64 gst-libav plus LGPL ffmpeg set, placed in a GameLib-owned directory and _appended_
  to `GST_PLUGIN_PATH`, fixes WMV/WMA titles. The binary payload is tier-2 only. _(042)_
- **Non-CrossOver engines run the bridge unchanged.** On Wine-Staging, `-DXMT` and GPTK, x86 and
  x64 probes all got HELLO and the real SteamID64. The CrossOver coupling is confined to
  `provisionBridgeBottle` (cxbottle) and `stockBridgeBottleSettings` (runner). _(056, 058)_
- **The fallback engine is Wine-Staging + DXVK-macOS, on the existing CX bottle, with
  `USER=crossover`.** Bare wined3d can't create a Unity 6 D3D11 device, and `WINEUSERNAME` is
  ignored. _(057, 059)_
- **Launch health is never `pgrep` alone.** winedbg keeps a crashed process "alive". Use the strict
  bridge-verified criterion: HELLO plus a clean game-side Steam init. _(030, memory
  `bridge-verified-criterion-is-strict`)_

## How to Build It

### 1. Diagnose a "crashes on launch" title under CrossOver

- CrossOver's `wine` **ignores `WINEDEBUG`**. Use `CX_DEBUGMSG=+wgl,+seh,+loaddll` and
  `CX_LOG=<file>`. _(030)_
- A crash right after start on a GLEW-era game that ProtonDB rates platinum is the fingerprint of a
  **compat-profile GL request**. Grep the `+wgl` log for `OS X only supports forward-compatible 3.2+
  contexts` or `Compatibility profiles for GL version >= 3.2 not supported`. _(030)_
  - macOS offers only **legacy 2.1** (all fixed-function features) or **core 3.2–4.1**. There is no
    compat context above 2.1, so the request can't be met. Linux works only because Mesa and NVIDIA
    provide compat profiles. Proton has **no** per-game config for Hoard.
- Find the real game process by its args. CrossOver's `winewrapper.exe` is a separate process
  (`sources/030-hoard-macos-opengl/ps-probe.sh`).
- To profile a freeze, use an **in-shim sampler**, never `+relay`. Relay tracing changes the timing
  enough to hide the freeze, and its call counts misled 030. _(033)_

### 2. Ship a per-game shim fix as data (034, VALIDATED)

The profile file (`public/fixes/<appid>-steam.profile.json` when bundled,
`fixes/local/...` when local):

```json
{
  "title": "HOARD",
  "evidence": ".planning/spikes/033-shim-gamefixes-hoard/README.md",
  "shimFeatures": { "wgl.hideExtensions": ["WGL_ARB_create_context*"] }
}
```

The backend side is `sources/034-known-fixes-v2-hoard/prototype.patch`. It was not committed in
`src/`, so `git apply` it:

- Add `shimFeatures` to `KnownFixProfile` (`src/common/types.ts`) and to `TIER2_PROFILE_KEYS`.
- `steamShimFeatureCfgLines(appId)` in `bridgeKnownFixes.ts` is the backend's copy of the feature
  list. It drops an unknown feature with a warning. Each `wgl.hideExtensions` pattern must match
  `^[A-Za-z0-9_]{1,62}\*?$`, with 1–16 patterns, or the whole feature is dropped. These limits
  mirror the shim's (16 patterns, under 64 bytes each).
- `writeBridgeConfig({ fixLines })` appends the lines after `port`/`appid`/`iface.*`. It drops any
  line that doesn't start with `fix.` or that contains CR/LF, a second guard against cfg injection.
- `launchBridgeGame` passes `fixLines: steamShimFeatureCfgLines(this.appId)`.

The resulting cfg line is `fix.wgl.hideExtensions=WGL_ARB_create_context*`.

Shim side: `sources/034-known-fixes-v2-hoard/shim_features.c`, compiled **beside** the unmodified
generated `steam_api_shim.c`. The generated shim has no `DllMain`, so there is no conflict. Build it
for both `x86-windows-gnu` and `x86_64-windows-gnu`. The core:

```c
// DLL_PROCESS_ATTACH: read gamelib_bridge.cfg beside THIS module (same resolution as
// load_bridge_port_once). Only `fix.` lines are parsed; unknown ones are logged and ignored.
if (g_npatterns)  // no pattern => IAT never touched
  hook(GetModuleHandleW(NULL), "OPENGL32.dll", "wglGetProcAddress",
       my_wglGetProcAddress, (void **)&real_wglGetProcAddress);

static PROC WINAPI my_wglGetProcAddress(LPCSTR name) {
  PROC p = real_wglGetProcAddress(name);
  if (!p || !name || ((ULONG_PTR)name >> 16) == 0) return p;      // ordinals pass through
  if (!strcmp(name, "wglGetExtensionsStringARB")) { real_extARB = (PFN_extARB)p; return (PROC)my_extARB; }
  if (!strcmp(name, "wglGetExtensionsStringEXT")) { real_extEXT = (PFN_extEXT)p; return (PROC)my_extEXT; }
  return p;
}
// my_ext*: rebuild the space-separated string, dropping exact tokens or `prefix*` matches.
```

**Why `DLL_PROCESS_ATTACH`:** the shim's own cfg loader runs lazily at the first Steam call. A game
can create its GL context before then.

Still to do for production (034): fold `shim_features.c` into `buildShimCompileArgv` for both arches
(either generated by `meta/gen_vtables.ts` or as a hand-written sibling, like the steamclient
forwarder). Drop the spike's `gamelib_shimfix.log`, or route it through the helper log. Ship Hoard's
profile **bundled**. Then lift Hoard's `does-not-run` entry, but only after a packaged build reaches
single-player and meets the strict bridge-verified bar.

### 3. Missing media codecs: GStreamer libav overlay (042, VALIDATED)

- **Symptom:** `CreateObjectFromURL=0xc00d36bb`, then `Missing decoder: Windows Media Video 9 /
  Audio 8/9` from decodebin. The cause is that CrossOver 26.3's GStreamer 1.24.4 has no libav.
- **Payload:** take 10 x86_64 dylibs from the official GStreamer **1.24.13** universal pkg
  (`pkgutil --expand-full`, then `lipo -thin x86_64`, and install nothing): `libgstlibav.dylib`,
  `libavcodec.60`, `libavformat.60`, `libavutil.58`, `libavfilter.9`, `libswresample.4`,
  `libswscale.7`, `libpostproc.57`, `libz.1` and `libbz2.1`. That's 19 MB, and the ffmpeg is the
  LGPL build. The pkg is **unsigned**, so pin its sha256.
- **Layout:** `overlay/lib/gstreamer-1.0/libgstlibav.dylib` plus `overlay/lib/*.dylib`. The
  plugin's `@loader_path/..` rpath finds ffmpeg, and its GStreamer/GLib deps resolve to CrossOver's
  already-loaded libraries. The compat-version gap (2414 vs 2405) is harmless.
- **Launch:** `GST_PLUGIN_PATH=<gamelib-owned>/overlay/lib/gstreamer-1.0`. **Append it; never
  clobber the existing value.** CrossOver's wrapper passes `GST_*` through, unlike
  `WINEDLLOVERRIDES`. One x86_64 overlay serves both 32- and 64-bit games, because the unix side is
  always x86_64.
- **Probe gotcha:** ask a source reader for RGB32 and the I420 decoder output fails with
  `0xc00d5212` unless `MF_SOURCE_READER_ENABLE_VIDEO_PROCESSING` is set. Media-session topologies
  such as MonoGame's provide that converter.
- **Open questions:** whether to bundle or fetch the payload on demand with a pinned sha; the LGPL
  notice and source offer; the WMV/WMA patent posture; logging which known-fix env vars were applied
  (GameLib doesn't log this today).

### 4. Forcing a native DLL under CrossOver (031)

CrossOver's `bin/wine` wrapper **drops `WINEDLLOVERRIDES`**. Use a per-exe registry key, scoped to
that one exe, and remove it on cleanup:

```sh
CX_BOTTLE="$BOTTLE" "$CX/wine" reg add 'HKCU\Software\Wine\AppDefaults\Reuben.exe\DllOverrides' \
  /v opengl32 /t REG_SZ /d native /f
CX_BOTTLE="$BOTTLE" "$CX/wineserver" -w
```

`HKCU\Software\Wine\OpenGL\DisabledExtensions` does **not** filter the WGL extension string, and
`CX_FWD_COMPAT_GL_CTX=1` only reaches Apple's next refusal. Neither is a fix. _(030)_

### 5. Non-CrossOver engine: the fallback recipe (056, 057, 059)

**Reuse the game's existing CX bridge bottle (059, VALIDATED).** Don't create a new prefix:

```sh
WINEPREFIX="$HOME/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-<appid>" \
USER=crossover \
  "<tools>/wine/Wine-Staging-macOS-latest/Contents/Resources/wine/bin/wine" "C:\\...\\game.exe"
```

- `USER=crossover` keeps `%USERPROFILE%` at `C:\users\crossover`. Without it, Staging creates
  `users/<mac user>`, and saves in `Documents`, `AppData\Roaming` and `AppData\LocalLow` seem to
  vanish after the switch. **`WINEUSERNAME` is ignored** by Wine-Staging 11.20.
- Each engine runs a silent `wineboot --update` the first time it sees the prefix (`.update-timestamp`
  mismatch), taking about 5–7 s and printing one-off `err:` lines. Don't count that as a failure.
  CrossOver restores all 1,489 rewritten placeholder DLLs when it takes the prefix back. The net
  residue is 45 extra Staging-only placeholders and some registry keys. `cxbottle.conf` is
  untouched, so the bottle stays a valid CrossOver bottle and `isBridgeBottleReady` can stay keyed
  on that layout.
- **The engine needs DXVK.** Production installs Gcenx DXVK-macOS v1.10.3 (`…-repack.tar.gz`, not
  `-builtin`): x64 DLLs go to `system32`, x32 DLLs to `syswow64`, plus `native,builtin` overrides in
  `HKCU\Software\Wine\DllOverrides` (`sources/057-wine-staging-real-title/install-dxvk.sh`). This
  build installs `d3d10core` and `d3d11` and leaves `dxgi` to Wine.
- The bridge launch shape is unchanged from the CrossOver path. Write `gamelib_bridge.cfg` beside
  the exe **and** beside every placed shim, because Unity reads it from
  `<X>_Data/Plugins/x86_64`. The helper runs on the real AppID. Only the runner and env change:
  `WINEPREFIX` and `USER` replace `CX_BOTTLE`.
- **If you ever create a fresh plain prefix** (056): run
  `WINEPREFIX=… WINEDLLOVERRIDES="mscoree,mshtml=" wine wineboot -i`, **then
  `wineserver -w`**. `system.reg` is written only when the wineserver exits, so a readiness gate
  that checks right after `wineboot` returns will report "not ready". Wine-Staging 11.20 uses the
  new-WoW64 layout: one win64 prefix runs x86 PEs with no separate 32-bit unix side.

## What to Avoid

- **Patching game exes.** 030's one-byte `je`→`jmp` was only a proof, and Steam verify reverts it.
  Use the shim IAT hook (033, 034). _(030)_
- **`WINEDLLOVERRIDES`, `DisabledExtensions` or `CX_FWD_COMPAT_GL_CTX` under CrossOver.** They are
  dropped or have no effect. _(030, 031)_
- **Env-var-per-fix transport** (033's `GAMELIB_FIX_*`). It was rejected for cfg `fix.` lines: the
  CrossOver wrapper drops some env, and a new name for each fix isn't data. _(034)_
- **The seek cache (`SetFilePointerEx`/`GetFileSizeEx` virtualisation).** It is INVALIDATED. It
  removed 99.97 % of real seeks, the freeze stayed at about 24 s, and it caused an unexplained early
  exit. **This reverses 030's seek-storm theory.** The real cause is x87-heavy game code
  (`Reuben.exe+0x10db00…0x10e700`, FFT-like), which Rosetta 2 emulates slowly. It can't be fixed
  from a shim, so show a `launchNotice` instead. _(030 → 033)_
- **Zink for GPU-speed compat GL.** It is INVALIDATED at both bitnesses. CrossOver's MoltenVK
  1.2.290 advertises `VK_EXT_robustness2` but reports `nullDescriptor = 0`, which Zink 26.2.4
  hard-requires. `vkCreateDevice` is never reached, and no `MVK_CONFIG_USE_METAL_ARGUMENT_BUFFERS`
  value helps. Rerun `test_wgl.exe` and `mvk_probe` whenever CrossOver bumps MoltenVK. _(031 →
  032)_
- **The Mesa softpipe "fix" as a default.** It is PARTIAL. It gives a real
  `3.3 (Compatibility Profile)` and the game's full render path with 0 faults, but it is the slowest
  renderer and its playability is unmeasured. llvmpipe fails for **x86** (pixel format) and works
  for x64, which rules out 031's Rosetta-JIT guess (032). Use Mesa only for compat-GL games with
  **no** legacy fallback. Mesa is spike-034 option (b) and was never built. _(031, 032)_
- **`Options.xml` `PlayVideo=false` for Unclaimed World.** It is INVALIDATED under CrossOver: WMA8
  music is still loaded at startup, even with `MusicEnabled=false`. _(042)_
- **Offering GPTK or `-DXMT` as supported engines.** GPTK 3.0-3 (PARTIAL): the bridge works, but
  Avernum 6 dies 2 s in on a wine32on64 `alloc_pages_vprot` assertion, and Unity 6 aborts on an
  unimplemented `USER32.IsMouseInPointerEnabled`. `-DXMT` on Wine-Staging 11.20 **can't present any
  D3D11 swapchain**, for any store. DXMT v0.80's `winemetal.so` needs the
  `macdrv_view_create_metal_view` exports (or `macdrv_functions`), and Gcenx's `winemac.so` exports
  only `___wine_unix_call_funcs`. _(057, 058)_
- **Bare wined3d for D3D11 titles.** Unity 6 fails with
  `d3d11: failed to create device and context (80004005)`. _(057)_
- **Capturing unbounded wine stdout on the DXVK-macOS path.** One 184 s run wrote **3.37 GB**: about
  20.5 M `VK_ERROR_OUT_OF_POOL_MEMORY` MoltenVK warnings, around 110 k per second. DXVK-macOS 1.10.3
  sizes its pools for an older MoltenVK than Staging 11.20's 1.4.0. Lower `MVK_CONFIG_LOG_LEVEL` and
  cap the log. This storm is also why the fallback feels sluggish compared with CrossOver. _(057)_
- **Assuming the Windows user is `$USER`.** CrossOver bottles and GPTK prefixes use `crossover`.
  Save and log lookups must discover the user directory. _(058, 059)_
- **Probe ABI mistakes.** `SteamUser()` (unversioned) returns NULL. Use `SteamAPI_SteamUser_v023`.
  `GetSteamID` returns its CSteamID through an MSVC hidden sret pointer, not RAX. Run the CrossOver
  control first. Use `grep -a` on the 48 k-line generated shim, which grep otherwise treats as
  binary. _(056)_

## Constraints

- **Apple GL:** legacy 2.1 or core 3.2–4.1 only, so there is no compat profile above 2.1. This is
  Apple's limit, not wine's. GPU-speed compat GL is blocked on MoltenVK `nullDescriptor`. Possible
  unblockers, none verified: a newer MoltenVK, KosmicKrisp, or a Zink patch. _(030, 032)_
- **`wgl.hideExtensions` only covers an exe-imported `wglGetProcAddress`.** A renderer DLL, or an
  opengl32 loaded through `GetProcAddress`, isn't hooked. It also only helps games that **have** a
  legacy fallback. _(033, 034)_
- **Rosetta 2 x87 cost is unfixable from GameLib.** Hoard runs, but with a ~24 s splash pause and a
  second long pause at level load. One launch exited during a pause, unexplained. Treat this as a
  `launchNotice`, not `does-not-run`. _(033, 034)_
- **CrossOver env:** `GST_*`, `CX_*` and `USER` reach the game. `WINEDLLOVERRIDES` and `WINEDEBUG`
  don't. _(030, 031, 042)_
- **Fallback-engine performance:** slower than CrossOver, with weaker Media Foundation video and no
  D3D12. That is consistent with the operator's choice of CrossOver first. Only two titles have
  evidence on it (Avernum 6 x86, Planet Crafter x64 Unity). _(057, memory)_
- **`bloggedon` tracks Mac Steam's logon state at run time**, not the engine. _(056, 058)_
- **Not covered:** option (b) (Mesa overlays, `dllOverrides`, applied-fix ledger); any non-WGL shim
  feature; a bundled profile in a packaged build; 32-bit D3D titles on Staging; GPTK on a CX bottle;
  `ROSETTA_ADVERTISE_AVX`; DX12 titles; many repeated engine switches.

## Origin

Synthesized from spikes 030, 031, 032, 033, 034, 042, 056, 057, 058 and 059. Operator decisions
come from the memory notes `steam-engine-crossover-first-staging-fallback` and
`bottled-steam-is-narrow-fallback`, and from `.planning/spikes/MANIFEST.md` → _Requirements (Idea B
— non-CrossOver engines)_.

Verdicts: 030 PARTIAL · 031 PARTIAL · 032 INVALIDATED · 033 PARTIAL · 034 VALIDATED · 042
VALIDATED · 056 VALIDATED · 057 VALIDATED · 058 PARTIAL · 059 VALIDATED.

Reversals: 033 overturns 030's seek-storm diagnosis. 033 and 034 supersede 030's byte patch. 032
overturns 031's Rosetta-JIT guess for llvmpipe and closes Zink. 042 invalidates the `Options.xml`
workaround. The operator memory overrides 058's and 057's framing of GPTK, `-DXMT` and Staging as
engine choices: CrossOver comes first, pinned Staging + DXVK is the only supported fallback, and
there is no default picker.

Source files: `sources/030-hoard-macos-opengl/`, `sources/031-hoard-mesa-opengl/`,
`sources/032-zink-moltenvk-64bit/`, `sources/033-shim-gamefixes-hoard/`,
`sources/034-known-fixes-v2-hoard/` (`shim_features.c`, `prototype.patch`,
`63000-steam.profile.json`), `sources/042-crossover-gst-libav-overlay/`,
`sources/056-plain-prefix-bridge-handshake/`, `sources/057-wine-staging-real-title/`,
`sources/058-gptk-engine-bridge/`, `sources/059-reuse-cx-bottle-vs-fresh-prefix/`.
