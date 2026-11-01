---
spike: 064
name: d3dmetal-d3d12-overlay
type: standard
validates: "Given Manor Lords (1363080, UE5, D3D12) on CrossOver's D3DMetal, when Steam's own overlay dylibs are injected (062's recipe) and the operator presses Shift+Tab, then the overlay draws correctly; if not, name what is wrong and whether NotProton's Metal shim fixes it"
verdict: PARTIAL
related: [061, 062, 063]
tags: [steam, macos, overlay, gameoverlayrenderer, d3dmetal, d3d12, gptk, metal, pixel-format, rgb10a2, notproton, unreal, manor-lords, live]
---

# Spike 064: the Steam overlay on D3D12 via D3DMetal

## What This Validates

062 and 063 showed Steam's own `steamloader.dylib` + `gameoverlayrenderer.dylib` give a working
overlay on two D3D11 paths (DXVK, D3DMetal) with no third-party shim. This spike tries D3D12 on
D3DMetal, CrossOver's only D3D12 path, using Manor Lords (UE5).

## How to Run

```sh
cd ../062-bridge-overlay-attach
APP=1363080 GAMEDIR="Manor Lords" EXENAME="ManorLords/Binaries/Win64/ManorLords-Win64-Shipping.exe" \
  NEEDLE="manorlords" BACKEND=d3dmetal GAME_ARGS="-dx12 -windowed" \
  ./run.sh ../../064-d3dmetal-d3d12-overlay/logs/<label> 0 <shim 0|1>
```

The Shipping exe is launched directly, not the `ManorLords.exe` stub GameLib uses. If the stub
exited early, the harness would restore the cfgs and stop the helper under a running game.

## Investigation Trail

- **The bottle is clean.** No `d3d11`/`d3d12`/`dxgi` overrides in `user.reg` (063's gotcha).
- **Run 1 (Steam dylibs only).** `vmmap` of `ManorLords-Win64-Shipping.exe` showed GPTK's
  `d3d12.dll` + `dxgi.dll`, `D3DMetal`, `libmetalirconverter.dylib` and `libdxccontainer.dylib`,
  with no DXVK lines in Wine's log, so this was a real D3D12-on-D3DMetal run. Steam attached
  `gameoverlayui -pid 29912 -gameid 1363080` itself. Operator: the game rendered normally
  (windowed and fullscreen), but the overlay was **"very distorted"**. Only the overlay was
  affected, and its clicks still worked.
- **Run 2 (adds NotProton's `overlay-shim.dylib`).** Operator: "it worked that time". The shim's
  trace names the cause:

  ```
  hook_set_pixel_format: layer=WineMetalLayer format=90 (RGB10A2Unorm) overlay_pipeline=missing
  variant_for: built RGB10A2Unorm pipeline for base BGRA8Unorm
  hook_set_pipeline_state: pipeline … BGRA8Unorm bound to RGB10A2Unorm attachment, substituted
  ensure_mtl4_queue_hooks: AGXG17XFamilyCommandQueue_mtlnext hooks=1
  ```

  D3DMetal gives this game a **10-bit `RGB10A2Unorm`** `WineMetalLayer`. Steam's renderer builds its
  overlay pipelines for 8-bit `BGRA8Unorm`, so it renders into an attachment whose format the
  pipeline was not built for. The shim catches the `setRenderPipelineState:` bind, builds a
  `RGB10A2Unorm` variant of Steam's pipeline and substitutes it. The D3D11 titles used BGRA8
  layers (061 Grim Dawn: `format=80 (BGRA8Unorm)`), which is why they never needed it.
- **The bridge did not attach in either run** (no `HELLO`). The likely cause is launching the
  Shipping exe directly rather than through the stub; GameLib's normal launch is recorded live in
  quick 261024-j4l / 261026-dv2. It does not affect the overlay finding, because Steam attached
  `gameoverlayui` to the game's pid regardless. It does mean this spike says nothing about Manor
  Lords' bridge.

## Results

**PARTIAL.** The overlay attaches and takes input on D3D12/D3DMetal, but Steam's own renderer
draws it **corrupted** whenever the game's Metal layer is not 8-bit BGRA. Correct drawing needed a
pipeline-format fix, which NotProton's shim supplies.

| Run | Shim | Layer format | Overlay |
|---|---|---|---|
| 1 | no | (RGB10A2, per run 2) | distorted, clicks worked |
| 2 | NotProton `overlay-shim.dylib` | `RGB10A2Unorm` → substituted pipeline | correct |

**What it changes for the build (revises 062's conclusion 4 and 063):**

- **Steam's dylibs alone are enough only for BGRA8 layers.** A 10-bit (and likely `RGBA16Float`
  HDR) swapchain needs Steam's overlay pipeline rebuilt for the layer's format. Which games hit
  this depends on the game and the backend, not on DXVK vs D3DMetal as such.
- **The fix is small and well-defined:** watch `CAMetalLayer` `setPixelFormat:` and, when Steam's
  overlay binds its BGRA8 pipeline to a non-BGRA8 attachment, substitute a pipeline built from the
  same descriptor with the attachment's format. A GameLib build can (a) ship NotProton's shim, if
  its licence allows, or (b) reimplement this one fix in GameLib's own dylib. (b) avoids the
  dependency but means owning Objective-C runtime swizzles of Apple's private `AGX*` classes,
  which is fragile across macOS and GPU generations.
- **Workaround not tried:** forcing the game or D3DMetal onto a BGRA8 swapchain would sidestep the
  mismatch but costs the game its 10-bit output.

**Open:** NotProton's licence; DXMT and WineD3D-GL paths; HDR (`RGBA16Float`) titles; Manor Lords
through GameLib's normal stub launch with the bridge attached.

## Artifacts

- `logs/run1/`: Steam dylibs only (`run.log` holds the vmmap list and operator line).
- `logs/run2/`: with NotProton's shim (`wine.log` holds the `overlay_shim` format trace).
- The harness is `../062-bridge-overlay-attach/run.sh`.
