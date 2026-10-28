---
created: 2026-10-28
title: "The install route notice shows the scan-miss warning for a DRM-mode title"
area: steam-bridge
severity: minor
platform: macos
ready: human
source: "phase 56 live gate (56-16), session /tmp/gamelib-gate-20261028T081115Z, 2026-10-28"
files:
  - src/backend/storeManagers/steam/games.ts
---

## Problem

Installing Grim Dawn (a SteamStub title routed to DRM mode) showed the "may not work with the native Steam bridge ... probably not run" dialog, based on a stale scan-miss verdict. The route notice does not know about DRM mode. The install went to GameLibSteamBridge-219990 correctly after the operator clicked through.

## Next

Make the route notice consult the DRM routing before warning.

## 56-26 gate result (G2)
Confirmed live. Zero `requires a user notice before any install` lines for appId 219990 across the reinstall; no route-notice dialog appeared. The only install-time dialog was an unrelated sign-in refusal (no stored Steam refresh token), filed separately.
