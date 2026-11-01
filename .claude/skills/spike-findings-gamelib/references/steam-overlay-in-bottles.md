# Steam overlay in bottled (bridged) games on macOS

## Requirements

From `.planning/spikes/MANIFEST.md` → _Requirements (Idea B — Steam overlay in bridged games)_:

- **Inject, don't spawn.** Loading `steamloader.dylib` + `gameoverlayrenderer.dylib` (with
  `SteamOverlayGameId`) into the game process is the whole trigger. Mac Steam attaches
  `gameoverlayui` to that pid itself, even though it only knows the bridge helper as "the game".
  GameLib must **not** start `gameoverlayui` (you get two). _(062 run 4)_
- **Injection channel = `CX_ENV` on a cloned runner.** Plain `DYLD_*` env is dropped by CrossOver's
  wrapper and by its hardened loaders. **Both** `bin/wineloader` and `lib/wine/x86_64-unix/wine`
  need `com.apple.security.cs.allow-dyld-environment-variables`, with every stock entitlement kept.
  Clone the inner `SharedSupport/CrossOver` (never the `.app`) and `xattr -cr` it. _(062)_
- **Steam's dylibs alone are enough only for BGRA8 layers.** A 10-bit (`RGB10A2Unorm`) layer draws
  the overlay corrupted without a pipeline-format fix. Vendor NotProton's
  `overlay-shim/overlay_shim.m` (GPLv3, compatible with GameLib's `GPL-3.0-only`) and build it
  ourselves. _(064)_
- Existing Idea B rules still hold: never modify the user's CrossOver in place (clone, as DRM mode
  does); the bridge helper/shim/TCP path is unchanged.

## How to Build It

The proven recipe from 062–064, mapped onto GameLib's code.

### 1. Runner: a clone whose loaders allow dyld

GameLib already has this machinery for DRM mode: `src/backend/storeManagers/steam/bridge/drm/runnerClone.ts`
(`DYLD_ENTITLEMENT`, `STOCK_LOADER_ENTITLEMENTS`, `LOADER_REL`, re-hash on every launch, `0700`
runners root). It re-signs **only** `lib/wine/x86_64-unix/wine` today. The overlay needs
`bin/wineloader` re-signed the same way. Without it, run 2 of 062 showed the insert list stripped
and nothing drawn. The DRM clone also carries a **patched ntdll**, which the overlay does not need:
the overlay-only clone should be the unpatched copy plus two re-signs.

What the spike did by hand:

```sh
cp -c -R /Applications/CrossOver.app/Contents/SharedSupport/CrossOver <runners>/CrossOver  # APFS clone, ~1 s
xattr -cr <runners>/CrossOver
for L in <runners>/CrossOver/lib/wine/x86_64-unix/wine <runners>/CrossOver/bin/wineloader; do
  codesign -d --entitlements - --xml "$L" > ent.plist          # keep every stock key
  plutil -insert com\.apple\.security\.cs\.allow-dyld-environment-variables -bool true ent.plist
  codesign -f -s - --options runtime --entitlements ent.plist "$L"
done
```

Stock keys on CrossOver 26.3 for both loaders: `allow-unsigned-executable-memory`,
`disable-executable-page-protection`, `disable-library-validation`, `device.audio-input`,
`device.camera`.

### 2. Launch: carry the insert list through `CX_ENV`

Keep the normal bridge launch (`fireBridgeWineLaunch`: helper spawn, cfg port/secret, `CX_BOTTLE`
+ `bin/wine <exe>`). Run it on the clone and add `CX_ENV` tokens. GameLib already builds `CX_ENV`
for DRM mode in `games.ts` (the `cxTokens` / `setKey('CX_ENV', …)` block, single-quoted values,
which reject a value containing `'`):

```sh
SBIN="$HOME/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS"
CX_ENV="DYLD_INSERT_LIBRARIES='<overlay_shim.dylib>:$SBIN/steamloader.dylib:$SBIN/gameoverlayrenderer.dylib' \
        SteamOverlayGameId=<appid> SteamGameId=<appid> SteamAppId=<appid>"
```

The Steam dylibs come from the user's own Mac Steam install, so GameLib redistributes nothing of
Valve's. Paths with spaces are fine inside the single quotes.

### 3. The Metal fix: vendor NotProton's overlay shim

- Source: `NotProtonNot/NotProton` → `overlay-shim/overlay_shim.m` (1,058 lines, Objective-C, last
  changed `0c798e714`, 2026-10-29). GPLv3 by the repo default; `NOTICE` exempts only
  `lsteamclient`, `steam-shim`, fonts, Sparkle and JsonCpp/cJSON. Keep its copyright and licence
  notice, and build it in GameLib's pipeline as a universal dylib. Don't ship NotProton's prebuilt
  binary.
- What it does that we need: catches `CAMetalLayer setPixelFormat:` and, when Steam's BGRA8
  overlay pipeline is bound to a non-BGRA8 attachment, builds and substitutes a variant
  (`variant_for: built RGB10A2Unorm pipeline for base BGRA8Unorm`). Its header also claims HDR and
  **Metal 4** fixes: D3DMetal 4 commits on `MTL4CommandQueue`, which Valve's overlay doesn't hook,
  and the shim bridges `signalDrawable:` to a Metal 3 present. Manor Lords logged
  `ensure_mtl4_queue_hooks`.
- It goes **first** in the insert list. With it in place, `overlay_commit=missing` is normal, not
  a failure (061).

### 4. Verify (what "working" looked like)

- `vmmap <game pid>` lists `steamloader.dylib` + `gameoverlayrenderer.dylib` (+ the shim).
- Steam's `console_log.txt`: `GameOverlay: started '…/gameoverlayui' (pid N) for game process <game pid>`
  within about 6 s of launch.
- Shim trace on stderr (Wine log): `hook_set_pixel_format: layer=WineMetalLayer format=…`.
- The bridge is unaffected: `HELLO shim attached` + `GINIT … ok=1`.
- **The overlay drawing correctly is operator-verified only.** See What to Avoid.

### Coverage proven

| Path | Title | Layer | Steam dylibs only | + shim |
|---|---|---|---|---|
| DXVK → MoltenVK (Steam-launched, NotProton) | Grim Dawn 219990 (061) | BGRA8 | — | works |
| DXVK → MoltenVK (bridge) | Schedule I Free Sample 3205720 (062) | BGRA8 | **works** | works |
| D3DMetal D3D11 (bridge) | The Planet Crafter 1284190 (063) | BGRA8 | **works** | — |
| D3DMetal D3D12 (UE5) | Manor Lords 1363080 (064) | **RGB10A2** | distorted, clicks OK | **works** |

## What to Avoid

- **Re-signing inside a copied `CrossOver.app`.** It breaks the bundle seal. `syspolicyd` shows a
  prompt, then `GatekeeperPolicyScanError -67018`, and the wrapper is `Killed: 9`.
- **Re-signing only `lib/wine/x86_64-unix/wine`.** `bin/wine` (Perl) execs `bin/wineloader` first,
  which strips `DYLD_*`. Nothing loads, and nothing draws.
- **Plain env `DYLD_INSERT_LIBRARIES`** on any CrossOver launch: the wrapper drops it.
- **Starting `gameoverlayui` from GameLib.** Steam starts its own a second later, and you get two.
- **Trusting `CX_GRAPHICS_BACKEND` alone to pick the D3D stack.** A bottle with
  `"d3d11"="native,builtin"` in `user.reg` (left by an earlier dxvk-macOS install, e.g. Schedule
  I's) runs DXVK's `d3d11` on D3DMetal's `dxgi` under `d3dmetal`. That mix crashed before the
  bridge attached (063 run 1). Check DllOverrides before testing a path.
- **Screenshots as evidence.** `screencapture -l` returned byte-identical stale frames of the
  Metal surface even with the overlay open (062 run 3). Pixel evidence does not work here; use the
  operator.
- **Launching an Unreal `…-Shipping.exe` directly to dodge the stub's early exit.** The overlay
  still attached, but the bridge never did (no `HELLO`, 064). Test UE titles through the stub.
- **Editing a running `/bin/sh` script.** sh reads scripts incrementally, and a rewrite mid-run
  corrupted 062 run 1's tail (`rue: command not found`).
- **Starting NotProton (or anything needing App Management) from a Terminal shell.** TCC charges
  the write to `com.apple.Terminal`, and setup fails with "could not write files" even though
  NotProton's own toggle is on. Launch it from Finder (061).

## Constraints

- **Trust widening:** an ad-hoc re-signed, runtime-hardened loader with dyld env allowed and
  library validation off. It is the same class DRM mode already accepts (0700 root, re-hash per
  launch), extended to one more binary.
- **Fragility:** the shim swizzles Apple's private `AGX*` classes (`AGXG17XFamilyCommandQueue`,
  `…CommandBuffer`, `…RenderContext`, `AGXG17DDevice`). Expect breakage across macOS and GPU
  generations, and pin a tested macOS/CrossOver set as DRM mode does.
- **Steam side:** needs Mac Steam running and signed in; the overlay belongs to that client. No
  Steam.app patching is needed (NotProton's Steam-side half is irrelevant to GameLib).
- **CrossOver only so far.** Every run used CrossOver 26.3.0.39832. Wine-Staging, GPTK and the
  pinned DXVK engine are untested.
- **Untested:** HDR (`RGBA16Float`) titles, DXMT, WineD3D-GL (the shim has `CGLFlushDrawable`
  hooks), fullscreen on the D3D11 paths, and the interplay between the overlay's invite dialog and
  GameLib's own invite picker (`ActivateGameOverlayInviteDialog`, 58-29..36).

## Origin

Synthesized from spikes: 061, 062, 063, 064 (2026-11-01/02, operator-verified live).
Source files: `sources/061-notproton-overlay-render/` (staging into Mac Steam, window capture loop),
`sources/062-bridge-overlay-attach/` (`run.sh`, the reusable harness: helper spawn, cfg
swap/restore, `CX_ENV` injection; env `APP`/`GAMEDIR`/`EXENAME`/`NEEDLE`/`BACKEND`/`GAME_ARGS`),
`sources/063-d3dmetal-overlay/`, `sources/064-d3dmetal-d3d12-overlay/`.
