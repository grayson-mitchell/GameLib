---
spike: 054
name: gptk-engine-bridge
type: standard
validates: "Given Gcenx Game Porting Toolkit 3.0-3 installed via GameLib's Downloads tab, when spikes 052 (handshake probe) and 053 (real titles) are repeated in a fresh GPTK prefix, then the bridge is verified, or the exact blocker is named"
verdict: PARTIAL
related: [052, 053]
tags: [steam, macos, bridge, gptk, d3dmetal, wine32on64, toolkit, unity, engine]
---

# Spike 054: gptk-engine-bridge

## What This Validates

Given GPTK 3.0-3 (Gcenx `game-porting-toolkit`, installed by the operator through GameLib's own
Downloads tab into `tools/game-porting-toolkit/Game-Porting-Toolkit-latest`), when 052's probe and
053's two real titles run from a fresh GPTK `wineboot -i` prefix, then either the bridge is
verified on the strict criterion or the blocker is named.

## Research

- **GPTK 3.0-3 layout differs from Wine-Staging:** `bin/` has `wine64`, `wine64-preloader`,
  `wineserver` only (no `wine`); 32-bit runs via CrossOver-style **`x86_32on64-unix`
  (wine32on64)**, not new-WoW64; ships `lib/external/D3DMetal.framework` + `libd3dshared.dylib`.
  Detected by `getGamePortingToolkitWine` as `type: 'toolkit'`, bin `.../wine64`.
- **Production `toolkit` launch env** (`launcher.ts`): `WINEPREFIX` (`:1208`); with
  `enableMsync` (default `isMac`, `config.ts:379`) → `WINEMSYNC=1` **and** `WINEESYNC=1`
  (`:1239`); `ROSETTA_ADVERTISE_AVX=1` only if `advertiseAvxForRosetta` (default only when the
  global default wine is a toolkit, `config.ts:395`). No DXVK (`launcher.ts:473`). Requires
  Sonoma+ (`:1434`).
- **3.0-3 is the newest Gcenx release** (2026-03-03; prior 3.0-2, 3.0-1, 3.0, 2.1).
- GPTK prefixes name the Windows user **`crossover`** (CrossOver lineage), not `$USER`.

## How to Run

```bash
../052-plain-prefix-bridge-handshake/run.sh gptk        # probe, x86 + x64
../053-wine-staging-real-title/run.sh crafter gptk      # real titles (operator quits the game)
../053-wine-staging-real-title/run.sh avernum6 gptk
```

The `gptk` engine lives in those two harnesses (prefix `052/prefixes/gptk`); evidence logs are
in `053-wine-staging-real-title/logs/{crafter,avernum6}-gptk.*` and `052/logs/gptk-*`.

## Investigation Trail

1. **Probe (052 harness) — PASS both arches.** Fresh prefix in 25 s (`#arch=win64`); x86 via
   wine32on64 and x64: HELLO, `SteamAPI ready`, real SteamID64 via vtable.
2. **`bloggedon=1` here vs `0` in 052's earlier runs** — re-ran staging + cx immediately: all
   now `1`. It tracks Mac Steam's logon state at the time, not the engine (noted back in 052).
3. **Planet Crafter / gptk — crash before Steam (engine too old for Unity 6).** D3DMetal brought
   up D3D11 FL 11.1 (`Renderer: AMD Compatibility Mode` — D3DMetal's adapter identity). Then:
   `wine: Call from ... to unimplemented function USER32.dll.IsMouseInPointerEnabled, aborting`
   → Unity `Crash!!!`, rc 1 after 15 s, no HELLO (Unity loads steam_api after input init).
   Harness bug found and fixed on the way: Player.log lookup assumed `users/$USER`; GPTK uses
   `users/crossover` — `run.sh` now discovers the user dir.
4. **Avernum 6 / gptk — bridge verified, game crashed in wine32on64.** HELLO +
   `GINIT fn=SteamAPI_Init ret=1 ok=1 session=1` (strict criterion met), then 2 s later
   `Assertion failed: (end <= pages_vprot_size << pages_vprot_shift), function alloc_pages_vprot,
   file virtual.c, line 1032.` — rc 1. A wine32on64 virtual-memory failure; no window for the
   operator to play.

## Results

**PARTIAL.** The bridge itself works on GPTK — the probe passes on both arches and a real x86
title initialises Steam from the game process — but **neither real title is playable** on GPTK
3.0-3, for engine reasons unrelated to the bridge:

| Case | Bridge | Game |
|---|---|---|
| probe x86 / x64 | **verified** (HELLO, SteamID64) | — |
| Planet Crafter (x64 Unity 6000.3) | not reached | crashes: `USER32.IsMouseInPointerEnabled` unimplemented |
| Avernum 6 (x86) | **verified** (HELLO + GINIT ok=1) | crashes: wine32on64 `alloc_pages_vprot` assertion |

**Signals for the build:**

- GPTK is a **poor general-purpose target**: an old CrossOver-derived Wine whose 32-bit path
  (wine32on64) and USER32 surface trail modern titles. D3DMetal itself works.
- Offering GPTK for Steam titles would need per-title evidence; it should not be a default and
  is not a blanket alternative to CrossOver. Wine-Staging + DXVK (053) is the stronger
  non-CrossOver path today.
- The `toolkit` launch shape (`WINEPREFIX` + `wine64` + `WINEMSYNC`/`WINEESYNC`) needs no bridge
  changes; GPTK's Windows user is `crossover` — any per-prefix path logic (save/log lookup) must
  not assume `$USER`.

**Not covered:** `ROSETTA_ADVERTISE_AVX=1`; GPTK 2.1; a DX12 title (D3DMetal's main draw); an
older-Unity or non-Unity x64 title that avoids `IsMouseInPointerEnabled`.
