---
created: 2026-10-31T00:00:00.000Z
title: "Wine-Staging-macOS -DXMT engine cannot present any D3D11 swapchain: winemac.so exports none of the metal-view symbols DXMT v0.80 needs"
area: wine
severity: major
platform: macos
ready: live-gate
source: spike 057 (wine-staging-real-title, 2026-10-31), trail step 4; incidental finding, independent of Steam
files:
  - src/backend/tools/dxmt.ts
  - src/backend/launcher.ts:468
  - src/backend/launcher.ts:1235
  - src/backend/tools/index.ts:241
  - src/backend/utils/compatibility_layers.ts
---

# `-DXMT` engine is broken for every D3D11 game

## What happens

Installing Wine-Staging-macOS from the Wine Manager makes a second engine,
`Wine-Staging-macOS-latest-DXMT`, with DXMT v0.80's DLLs copied in as builtins (`tools/dxmt.ts`).
Any game that presents a D3D11 swapchain on it fails. Measured on The Planet Crafter (Unity
6000.3, x64):

- D3D11 is created on the Apple GPU (`Renderer: Apple M5 Ultra`, feature level 11.1)
- then DXMT logs `err: Failed to create metal view, it seems like your Wine has no exported symbols
  needed by DXMT.`
- `CreateSwapChain` fails and Unity exits with rc 3 after 10 s

This affects Epic, GOG and Amazon titles that run on `-DXMT`, not just Steam. A non-D3D11 title
(Avernum 6) runs fine on the same engine, which is why the engine looks healthy at a glance.

## Root cause (`nm -gU`)

- DXMT v0.80 `winemetal.so` resolves `macdrv_view_create_metal_view`,
  `macdrv_view_get_metal_layer` and `macdrv_view_release_metal_view` (or a `macdrv_functions`
  table) from Wine's `winemac.so`.
- Gcenx Wine-Staging 11.20 `lib/wine/x86_64-unix/winemac.so` exports **only**
  `___wine_unix_call_funcs` and `___wine_unix_call_wow64_funcs`.
- CrossOver's `winemac.so` exports `_macdrv_functions`, which is why DXMT works there.

## Options (decide with a live D3D11 run)

1. Pair DXMT with a Wine build that exports the macdrv metal-view symbols (a DXMT-patched Wine).
2. Detect the missing exports when the `-DXMT` copy is created, then skip creating it or label it
   "no D3D11", rather than offering a broken engine.
3. Stop making the `-DXMT` copy until a compatible Wine is pinned.

## Done when

A D3D11 title (The Planet Crafter, 1284190, is a known reproducer) renders on whatever `-DXMT`
engine GameLib offers, or GameLib no longer offers one that cannot. Evidence:
`.planning/spikes/057-wine-staging-real-title/logs/crafter-dxmt.{Player.log,wine.out}`.
