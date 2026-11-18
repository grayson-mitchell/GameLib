---
created: 2026-11-18T00:00:00.000Z
title: '"Game Uninstalled" notification not seen on macOS (dev build), though notify() ran'
area: steam
severity: minor
platform: macos
ready: live-gate
files:
  - src/backend/dialog/dialog.ts
---

## Problem

Phase 81 live gate, item 9 (`81-HUMAN-UAT.md`, launch L2, 2026-11-18). The unadopted
uninstall of Wildermyth (763890) passed, and gamelib.log shows
`notify(): "Wildermyth" handed to tauri-plugin-notification (delivery not confirmable)`,
but the operator saw no "Game Uninstalled" notification. An earlier `notify()` in the same
launch (21:20:10) is not known to have been seen either.

Likely macOS delivery for the `pnpm tauri:dev` build (notification permission or the
bundle identity the dev binary runs under), not Phase 81 code. Investigation only.

## Direction

Check System Settings > Notifications for the dev app's entry and its permission state,
and the unified log for the notification request (`/usr/bin/log show --info`, see the
macOS TCC diagnosis memory). Compare with a packaged build. If dev builds simply cannot
deliver, record that and close; if packaged builds also drop it, it is a real defect.
`notify()` lives in `src/backend/dialog/dialog.ts`.
