---
created: 2026-11-20T00:00:00.000Z
title: 'Linux "Open Steam" in the signed-out adoption note does not bring Steam sign-in window forward'
area: steam-adoption
severity: minor
platform: linux
ready: code
files:
  - src/backend/storeManagers/steam/adoptionStatus.ts
  - src-tauri/src/steam_window.rs
---

## Problem

Found in the Phase 81 item 11(e) retest on Linux (2026-11-20), native Debian Steam. With
Steam signed out, the note now correctly shows "Sign in to Steam to finish setup" with "Open
Steam", but pressing Open Steam does not bring the sign-in window forward (`gamelib.log`
shows `SteamGame: opening Steam from the adoption note` at 05:48:06, 05:48:07, 05:48:11).

Cause: `openSteamForAdoption` (`adoptionStatus.ts:226`) only sends `steam://open/main` on
Linux. A signed-out Steam holds that URL until login finishes (see the doc comment on
`raiseSteamWindowForAdoption`), and only `win32` first calls `RUST_STEAM_WINDOW_RAISE`
(`steam_window.rs`), so Linux has no raise path.

## Direction

Add a Linux raise (X11 via the window manager; Wayland may not allow one, so decide whether
to degrade to a short hint in the note) behind the same `RUST_STEAM_WINDOW_RAISE` channel,
log the outcome, and keep the URL after it. Confirm live: sign out, press Open Steam, the
sign-in window comes to the front.
