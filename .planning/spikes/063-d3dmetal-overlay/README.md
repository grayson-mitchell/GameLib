---
spike: 063
name: d3dmetal-overlay
type: standard
validates: "Given a GameLib-bridged game rendering through CrossOver's D3DMetal (not DXVK), when only Mac Steam's own steamloader.dylib + gameoverlayrenderer.dylib are injected (no NotProton shim) and Steam is left to attach gameoverlayui itself, then Shift+Tab draws a working overlay"
verdict: VALIDATED
related: [061, 062]
tags: [steam, macos, overlay, gameoverlayui, gameoverlayrenderer, bridge, crossover, d3dmetal, gptk, d3d11, unity, planet-crafter, live]
---

# Spike 063: the Steam overlay on D3DMetal

## What This Validates

062 run 5 showed Steam's own two overlay dylibs are enough on the DXVK → MoltenVK path. D3DMetal
is CrossOver's other main D3D11/D3D12 path and draws to Metal by a different route, so it might
be where NotProton's `overlay-shim.dylib` matters. This spike runs the production-shaped
configuration from 062 (no shim, no `gameoverlayui` started by GameLib) on a D3DMetal title.

## How to Run

062's `run.sh`, generalised by environment variables (defaults are still Schedule I, so 062's
runs reproduce):

```sh
cd ../062-bridge-overlay-attach
APP=1284190 GAMEDIR="The Planet Crafter" EXENAME="Planet Crafter.exe" NEEDLE="planet crafter" \
  BACKEND=d3dmetal GAME_ARGS="-screen-fullscreen 0" \
  ./run.sh ../../063-d3dmetal-overlay/logs/<label> 0 0
```

`BACKEND` sets `CX_GRAPHICS_BACKEND`. `GAME_ARGS` is appended to the exe (`-screen-fullscreen 0`
keeps Unity windowed). The clone and its re-signed loaders are as in 062.

## Investigation Trail

- **Run 1 (Schedule I, `BACKEND=d3dmetal`): not a valid D3DMetal test.** The game exited after
  21 s, before the bridge attached (no `HELLO`), and Steam never attached the overlay. Wine's log
  shows **DXVK's** `D3D11DXGIDevice` running on D3DMetal's `dxgi`
  (`Failed to create shared resource: VK_KHR_EXTERNAL_MEMORY_WIN32 not supported`). Schedule I's
  bottle carries `"d3d11"="native,builtin"` in `user.reg` from the pinned engine's dxvk-macOS
  install (see `.planning/debug/resolved/fullscreen-3440-dx11-crossover.md`), so forcing D3DMetal
  gave it a mixed stack. **Gotcha: a bottle that has ever had DXVK installed is not a D3DMetal
  bottle, whatever `CX_GRAPHICS_BACKEND` says.** Check `user.reg` DllOverrides before choosing a
  test title.
- **Picking a clean title.** Of 11 candidate bridge bottles, none had a `d3d11`/`dxgi` override
  (the check was confirmed against Schedule I's, which it catches). The Planet Crafter (1284190:
  Unity, D3D11, no known-fix file) was chosen.
- **Run 2 (The Planet Crafter, D3DMetal, Steam dylibs only).** `vmmap` of `Planet Crafter.exe`
  showed `D3DMetal.framework`, `libd3dshared.dylib` and GPTK's `dxgi` mapped alongside
  `steamloader.dylib` + `gameoverlayrenderer.dylib`, with **no** DXVK lines in Wine's log. The
  bridge attached (`HELLO`, `GINIT fn=SteamAPI_Init ret=1 ok=1`). Steam attached
  `gameoverlayui -pid 28679 -gameid 1284190` by itself. Operator: "shift-tab worked and was
  responsive".

## Results

**VALIDATED.** On D3DMetal the overlay works with Steam's own two dylibs alone, the same as on
DXVK.

| Path | Title | NotProton shim | Steam attached gameoverlayui | Operator |
|---|---|---|---|---|
| DXVK → MoltenVK | Schedule I (062 run 5) | no | yes | drew, clicks worked |
| D3DMetal | The Planet Crafter (063 run 2) | no | yes | worked, responsive |

**What it settles:** both of CrossOver's main D3D11 paths take the overlay with no third-party
code. The build recipe from 062 holds unchanged: a cloned runner with both loaders allowing dyld,
Steam's two dylibs plus `SteamOverlayGameId` through `CX_ENV`, and nothing else.

**Still open:**

- **D3D12 on D3DMetal** (e.g. Manor Lords 1363080, UE5): only D3D11 was tried.
- **DXMT and WineD3D-GL** titles are untested. The GL path is where NotProton's shim carries
  `CGLFlushDrawable` hooks.
- **Fullscreen** on either path (both tests were windowed or at the menu).
- **Bottle hygiene for the build:** an overlay feature does not change backend choice, but test
  matrices must not assume `CX_GRAPHICS_BACKEND` alone decides the D3D stack (run 1).

## Artifacts

- `logs/run1/`: Schedule I mixed-stack exit (`wine.log` shows the DXVK-on-GPTK `dxgi` failure).
- `logs/run2/`: Planet Crafter D3DMetal run (`run.log` with the vmmap list and operator line,
  `helper.log`, `wine.log`, `watch.log`).
- The harness is `../062-bridge-overlay-attach/run.sh` (APP/GAMEDIR/EXENAME/NEEDLE/BACKEND/GAME_ARGS).
