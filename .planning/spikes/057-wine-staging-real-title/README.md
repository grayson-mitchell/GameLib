---
spike: 057
name: wine-staging-real-title
type: standard
validates: "Given a plain Wine-Staging prefix (056) plus a shadow tree of a real bridge-verified install, when the title is launched via WINEPREFIX + the engine's own wine with the shipped shim and a per-run helper, then it passes the strict bridge-verified criterion (HELLO + clean game-side Steam init) and plays"
verdict: VALIDATED
related: [056, 035, 034]
tags: [steam, macos, bridge, wine, wine-staging, dxmt, dxvk, unity, d3d11, wineprefix, engine]
---

# Spike 057: wine-staging-real-title

## What This Validates

Given spike 056's fresh `wineboot -i` prefixes, when two titles already strict-verified on
CrossOver (Phase 53 census) are launched from a **shadow tree** of their real install — the
current shipped shim placed beside the game, a per-run helper on the real AppID, nothing from
CrossOver in the process tree — then they pass the strict criterion
(`bridge-verified-criterion-is-strict`, judged with `meta/bridgeCensus.ts`'s own rules) and play.

| Title | AppID | Shape | Evidence rule |
|---|---|---|---|
| Avernum 6 | 206060 | x86, init/shutdown-only imports, 2D | D-53-15: HELLO + anchored `GINIT ... ok=1 session=1` |
| The Planet Crafter | 1284190 | x64 Unity 6000.3, D3D11, runtime-loaded `steam_api64.dll` | HELLO + no `NOVER` + Player.log free of `EntryPointNotFoundException` / `SteamAPI_Init ... failed` |

## Research

- **Production DX path for a `wine`-type engine on macOS** (`backend/tools/index.ts`):
  `autoInstallDxvk: isLinux || isMac` (`config.ts:348`) → Gcenx **DXVK-macOS v1.10.3**
  (`…-repack.tar.gz`, deliberately not `-builtin`), x64 → `system32`, x32 → `syswow64`, native
  DllOverrides. Skipped for any `-DXMT` engine (`tools/index.ts:241`).
- **`-DXMT` engine**: DXMT v0.80 DLLs copied into the Wine copy as builtins (`tools/dxmt.ts`);
  `launcher.ts:1235` sets `WINEMSYNC=1`.
- **No per-title DLL overrides** for either title (`bridge/bottleDllOverrides.ts` lists only
  3410180).
- **Shim placement**: production writes `gamelib_bridge.cfg` beside the exe **and** beside every
  placed shim (`bridgeConfig.ts`, quick 261023-ue0) — Unity reads it from
  `<X>_Data/Plugins/x86_64`.

## How to Run

```bash
./install-dxvk.sh                      # once: production's DXVK-macOS into a clone of 056's staging prefix
./run.sh <avernum6|crafter> <staging|dxmt|staging-dxvk|cx>
```

Blocks until the operator quits the game; each run appends one judged line to `logs/events.log`.
`shadow.py` builds the shadow tree (only the shim's directory chain is real). The real install and
bottle are never written; `cx` is an APFS clone used only as a control.

## Investigation Trail

1. **Avernum 6 / staging — verified.** HELLO + `GINIT fn=SteamAPI_Init ret=1 ok=1 session=1`,
   466 s, rc 0. Operator: played normally. One MoltenVK `failed assertion ... clearFramebufferData.
   missing clear mask bits` ~3 s in (wined3d → MoltenVK path); no visible effect.
2. **Avernum 6 / dxmt — verified.** Same evidence, 57 s, no assertion. Operator: played normally.
   Operator did not watch Friends status for runs 1–2 (never evidence anyway).
3. **Planet Crafter / staging (bare wined3d) — graphics-blocked, not a bridge result.** Unity:
   `d3d11: failed to create device and context (80004005)` → "Failed to initialize graphics"
   dialog. Steam is initialised after the GfxDevice, so the shim was never loaded (no HELLO).
4. **Planet Crafter / dxmt — graphics-blocked; a GameLib defect found.** D3D11 came up on the
   Apple GPU (`Renderer: Apple M5 Ultra`, FL 11.1), then DXMT logged
   `err: Failed to create metal view, it seems like your Wine has no exported symbols needed by
   DXMT.` and Unity exited rc 3 after 10 s. Root cause by `nm -gU`:
   - DXMT v0.80 `winemetal.so` resolves `macdrv_view_create_metal_view`,
     `macdrv_view_get_metal_layer`, `macdrv_view_release_metal_view` (or a `macdrv_functions`
     table).
   - Gcenx Wine-Staging 11.20 `winemac.so` exports **only** `___wine_unix_call_funcs` and
     `___wine_unix_call_wow64_funcs`.
   - CrossOver's `winemac.so` exports `_macdrv_functions`.

   **So GameLib's `Wine-Staging-macOS-latest-DXMT` engine cannot present any D3D11 swapchain
   with the current Wine-Staging build — for Epic/GOG/Amazon too, not just Steam.** Avernum 6
   passed on it only because it does not use D3D11.
5. **Pivot: test what production would actually do for a `wine`-type engine** — Wine-Staging +
   DXVK-macOS (`install-dxvk.sh` reproduces `DXVK.installRemove`). Installed `d3d10core` +
   `d3d11` (this build leaves `dxgi` to Wine).
6. **Planet Crafter / staging-dxvk — verified, strongest evidence of the spike.** HELLO, GINIT
   `ok=1 session=1`, **game-originated** `CALL`s (`STEAMAPPS_INTERFACE_VERSION008.BIsDlcInstalled`,
   `SteamUser023.GetSteamID`, `SteamFriends017.GetPersonaName`), no `NOVER`, Player.log clean.
   184 s, rc 0. Operator: "game worked, seemed a bit sluggish compared to crossover, friends
   showed as playing" (reported conversationally 2026-10-31). Side noise, not bridge:
   `WindowsVideoMedia error 0x80070057` on `sharedassets4.resource` (Media Foundation video in
   Wine-Staging) and 6× DXVK `VK_KHR_EXTERNAL_MEMORY_WIN32 not supported`.
7. **Why "sluggish": MoltenVK descriptor-pool exhaustion every frame.** The run's `wine.out` was
   **3.37 GB** in 184 s — ~20.5 M `[mvk-warn] VK_ERROR_OUT_OF_POOL_MEMORY: VkDescriptorPool
   exhausted pool of N ...` lines (~110 k/s), each falling back to "allocating descriptor
   dynamically". DXVK-macOS 1.10.3 (2023) sizes its pools for an older MoltenVK than the 1.4.0
   in Wine-Staging 11.20. The dynamic-allocation fallback plus the logging itself plausibly
   account for the sluggishness. The raw file is not committed; see
   `logs/crafter-staging-dxvk.wine.excerpt.txt` (head + whole-file repeat counts).
   **Build implication:** a production launch on this stack must not capture unbounded wine
   stdout into a log file, and `MVK_CONFIG_LOG_LEVEL` should be lowered.

## Results

**VALIDATED** — the bridge works end-to-end for real titles from a plain Wine-Staging prefix with
no CrossOver involved, on the strict criterion, for both an x86 init-only title and an x64 Unity
title with game-originated calls.

| Title | staging (wined3d) | staging-dxmt | staging + DXVK-macOS |
|---|---|---|---|
| Avernum 6 (x86, 2D) | **verified**, played | **verified**, played | — |
| The Planet Crafter (x64 Unity D3D11) | graphics-blocked (no D3D11 device) | graphics-blocked (DXMT metal-view symbols missing) | **verified**, played, sluggish vs CX |

**Signals for the build:**

- **The bridge is not the constraint; the graphics stack is.** Every failure in this spike happened
  before the game loaded `steam_api`. An engine picker for Steam titles is really a D3D-path
  picker.
- **The plain-staging path must carry DXVK** (production already does this for `wine`-type
  engines) — bare wined3d cannot make a D3D11 device for Unity 6.
- **`-DXMT` is currently broken for D3D11 on Wine-Staging 11.20** — independent GameLib defect
  worth a todo regardless of this idea (likely needs a DXMT-patched Wine build, or detection that
  hides `-DXMT` when `winemac.so` lacks the symbols).
- **Performance**: DXVK-macOS 1.10.3 (2023) through MoltenVK felt slower than CrossOver's stack,
  with ~110 k MoltenVK descriptor-pool-exhaustion warnings per second (trail step 7) — the
  pinned DXVK-macOS is mismatched with current MoltenVK.
  Media Foundation video is weaker in Wine-Staging. Non-CrossOver engines are a *choice*, not a
  drop-in replacement.
- **Shadow-tree launch shape** (cfg beside exe and beside the shim, helper on real AppID,
  `WINEPREFIX` + engine `wine`) needs no change from the CrossOver path beyond runner/env.

**Not covered:** the `cx` control was not re-run (both titles are already census-verified on CX);
32-bit D3D titles; GPTK (058); reusing an existing CX bottle (059).
