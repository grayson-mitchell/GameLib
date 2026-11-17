---
created: 2026-11-13T00:00:00.000Z
title: 'Spike: load a pinned libsteam_api.dylib in the bridge helper instead of the Steam client copy'
area: steam
severity: medium
platform: macos
ready: human
source: 'Bridge outage 2026-11-13: the Nov 10 Mac Steam client update dropped SteamAPI_SteamUser_v023 (quick 261113-n39 fixed it with runtime version probing + diagnostics; this is the deferred option 3)'
files:
  - native/steam-bridge/helper/bridge_helper.c
  - native/steam-bridge/generated/bridge_dispatch.h
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
---

## Problem

The macOS bridge helper dlopens the `libsteam_api.dylib` that ships inside the Steam client
(`Steam.AppBundle/.../Steam Helper.app/Contents/MacOS/libsteam_api.dylib`). Valve replaces that
file on every client update, so its exported accessor versions can change under us at any time.
On 2026-11-10 it dropped `SteamAPI_SteamUser_v023` for `_v024`, and every bridge launch failed
("Steam bridge unavailable") until quick 261113-n39.

261113-n39 makes the helper probe accessor versions at runtime and report a missing symbol
plainly. That covers version bumps, but a removed or renamed flat method can still break a
feature after a client update.

## Idea

Load a fixed, known-good `libsteam_api.dylib` (a Steamworks SDK redistributable build) instead.
The Steam client must keep serving old SDK versions indefinitely, because shipped games bundle
their own old `steam_api` for years. A pinned dylib would therefore not move when Steam updates.

## Open questions (decide before building)

- Source: fetch a genuine Valve dylib from the CDN (allowed by the DRM-boundary memory: genuine
  Valve files from CDN are OK) vs. bundling it, plus the licensing and redistribution position.
- Does the macOS client accept IPC from a pinned older dylib the same way it accepts the copy it
  ships itself (InitFlat, SteamUser, overlay, callbacks)? Spike it against the live client.
- Code signing and notarization implications of shipping or fetching a dylib next to the helper.
- Keep the Steam-copy path as a fallback?

## Resolution (2026-11-17)

Spiked: all three spikes VALIDATED. Build follow-up: `2026-11-17-build-pinned-bridge-libsteam-api.md`.

- **IPC from a pinned older dylib (087):** the live client serves it identically to its own copy
  (InitFlat, identity, manual dispatch, call results). The pin must match the SDK the dispatch is
  generated from (MMS v003 today).
- **Source, signing, licensing (089):** Valve's client-update CDN (`webhelpers_osx` package,
  `sha2vz` + dylib sha256 + Valve team `MXGJJ98X76`). It is genuine and standalone-signed, and GameLib ships no Valve binary.
  The helper is unhardened, so there is no library-validation change. A hardened build needs
  disable-library-validation either way.
- **Real game (088):** the real helper on the pin ran ELEX (shim mode) end to end. Shim attach,
  game `SteamAPI_Init`, stats/achievement callbacks and the in-game overlay all worked. DRM-mode
  titles never spawn the helper.
- **Keep the Steam-copy fallback?** Yes, as a logged `UNPINNED` last resort (089).
