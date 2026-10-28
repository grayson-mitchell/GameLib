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
