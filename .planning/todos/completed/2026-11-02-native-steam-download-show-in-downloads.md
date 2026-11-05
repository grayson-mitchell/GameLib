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

## Closed 2026-11-05 (debug steam-dl-missing-in-downloads)

The todo's premise was wrong. A Steam install does enter the download queue. Downloads stayed
empty because, with `enableSteamNativeInstall` off, a Mac-native title is handed to Mac Steam via
`steam://install`, and the queue element counts as done on hand-off, 30 ms after it starts.

- `a530e7279`: delegated installs get a "Managed by Steam" section in Downloads for the life of
  the ACF poll (`managedBySteam` on `gameStatusUpdate`). Pause/Cancel are disabled with "Pause or
  cancel it in Steam". The game page and tile show "Installing… N%". The native-depot queue path
  is unchanged.
- `311c98271`: the live percent never arrived because the spike-050 nettop monitor saw two active
  updates. A stale 2026-10-25 `update started` for 284100, with no end line in the 256 KB
  content_log tail, made `activeCount !== 1`. The tracker now resets on each `Client version:`
  line (Steam start-up). Mac Steam rewrites the ACF only on suspend or commit, so without the
  monitor the percent moved only when the download was paused.
- Operator live check passed 2026-11-05: a Downloads row with a live, moving percent.
- Pause/Cancel for Steam-performed downloads stay with Steam by design.
- Follow-ups: `2026-11-05-localise-steam-managed-download-keys.md` (5 new en keys, recorded in the
  presence baseline) and `2026-11-05-orphaned-nettop-after-sidecar-kill.md`.
- The launch-time engine first-need download (games.ts ~4441) still runs outside the queue by
  design. It was not exercised here.
