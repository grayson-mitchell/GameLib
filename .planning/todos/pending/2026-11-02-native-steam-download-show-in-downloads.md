---
created: 2026-11-02
title: "Native Steam download show in Downloads"
area: steam-install
files:
  - src/frontend/screens/DownloadManager/index.tsx
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/storeManagers/steam/games.ts
severity: medium
platform: any
ready: live-gate
---

## Trigger

Operator report, 2026-11-02, during the Phase 59 gap-closure re-test (59-22, the Asgaard install
under the no-CrossOver profile): a native Steam download shows its progress on the game page, but
the Downloads screen stays empty for the whole install.

## What is known

- The game page gets its progress from `gameStatusUpdate` frames that `games.ts` sends. That path
  works, and 59-22 fixed its percent and phase labels.
- The Downloads screen lists the download manager queue (`downloadqueue.ts`, through `addToQueue`).
  No file under `src/backend/storeManagers/steam/` references the queue, so a Steam install looks
  like it never enters it. This is a grep observation, not a traced cause.

## Done when

A native Steam install, including the built-in-engine first-need download, appears in Downloads
with live progress, and pause/cancel there either works or is clearly unavailable for Steam rows.
Confirm it live.
