---
created: 2026-11-17T00:00:00.000Z
title: 'Build: load a pinned, CDN-fetched libsteam_api.dylib in the macOS bridge helper'
area: steam
severity: medium
platform: macos
ready: live-gate
source: 'Spikes 087/088/089 (all VALIDATED), from completed todo 2026-11-13-pin-bridge-libsteam-api-dylib'
files:
  - native/steam-bridge/helper/bridge_helper.c (resolve_dylib_path)
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/steam/bridge/helperSpawn.ts
  - native/steam-bridge/generated/bridge_dispatch.h
---

## Problem

The bridge helper dlopens the Steam client's own `libsteam_api.dylib`, which Valve replaces on every
client update (the Nov 10 update broke every bridge launch). 261113-n39's runtime version probe
softens version bumps but not removed or renamed flat methods.

## Solution

The shape is from spike 089's Results. 087 and 088 show it works live.

1. **Pin record** in code: package name, `sha2vz`, dylib sha256, expected `SteamUser_vNNN`. Bump it
   only together with a `bridge_dispatch.h` regeneration. Today's pin is the Oct 21 build used by
   088 (SteamUser v023, MMS v003); see `089/fetch-pin.sh`.
2. **Fetch and verify in Rust** (reqwest + sha2 + a vz/LZMA decode), never in the sidecar at boot
   (sidecar exit contract, half 2). Cache under
   `~/Library/Application Support/GameLib/steam-api/<sha>/`.
3. **Resolve order:** cached pin → snapshot the client copy if its sha equals the pin → CDN fetch →
   client copy as a last resort, logged `UNPINNED`.
4. **Pass the resolved path to the helper** (argv flag or env from `helperSpawn.ts`).
   `resolve_dylib_path()` keeps its Steam-tree lookup only as the fallback. Log which path loaded.
5. Optional: a CI HEAD check that the pinned CDN package is still served (retention is proven to
   only about 4 weeks).

Live gate: two shim-mode titles (ELEX plus Avernum 6 or XCOM: EU) launch with `HELLO` + `GINIT ok=1`
and a working Shift+Tab overlay. The identity-only (480) fallback still works. With the cache and
network removed, the helper falls back to the client copy and logs `UNPINNED`.

## Resolution (2026-11-20)

Built in quick 261117-ubb (`1aff893bb`). Live gate passed on the operator's Mac:

1. Cold cache, ELEX (411300): `steam api pin: source=fetched … elapsedMs=728`, helper `PIN source=pinned`,
   `HELLO` + `GINIT ok=1`, Shift+Tab overlay opened. Cache dir 0700, dylib 0444.
2. Avernum 6 (206060): `source=cached … elapsedMs=12`, pinned, `GINIT ok=1`, overlay opened.
3. Identity-only (480) fallback: skipped, no family-shared or licence-refused title to hand. It is
   covered by `helperIntegration.test.ts` (the identity-only helper loads the pinned dylib) but has not been run live.
4. No cache, network off, Avernum 6: `UNPINNED (cache=miss;client=mismatch;cdn=…:connect;cdn=…:connect)`,
   helper `PIN source=UNPINNED reason=no-flag … loaded=1`, `GINIT ok=1`, game launched.
