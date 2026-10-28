---
created: 2026-10-28
title: "A bridge-notice dialog is dispatched but the operator saw nothing (display=unconfirmed)"
area: steam-bridge
severity: minor
platform: macos
ready: human
source: "phase 56 live gate (56-16), session /tmp/gamelib-gate-20261028T081115Z, 2026-10-28"
files:
  - src/backend/storeManagers/steam/games.ts
---

## Problem

For the Grim Dawn drm-bottle-stage failure at 22:49:14 the log shows `[bridge-notice] appId=219990 dispatched=in-app-dialog+notify dialog-frame-sent=true display=unconfirmed`, but the operator saw nothing. For the Raft failure at 22:52:09 the operator did see the dialog. Failures can be silent from the user's side.

## Next

Find why the frame is sent but not shown (window state, modal queue), and make `display` confirmable.

## Closed 2026-10-29: hardened, display now confirmable

Root cause not reproduced; both candidate causes are fixed. Debug session:
`.planning/debug/resolved/bridge-notice-display-unconfirm.md`.

- Dialogs queue instead of overwriting an open one (`src/frontend/state/dialogQueue.ts`).
- A DRM-mode bridge notice raises the main window first (new Rust arm `main_window_raise`, via
  `app.raiseMainWindow()`).
- The renderer acks a dialog once it is rendered and the document is visible. The backend logs
  `[bridge-notice] appId=… display=confirmed elapsedMs=N`, or `display=unconfirmed timeout=15000`.

Live 2026-10-29 on Grim Dawn 219990 with Mac Steam quit (steam-not-running): GameLib in front,
`display=confirmed elapsedMs=69`; GameLib hidden with Cmd+H, window raised and
`display=confirmed elapsedMs=81`. The queue was not exercised live (unit tests only).
