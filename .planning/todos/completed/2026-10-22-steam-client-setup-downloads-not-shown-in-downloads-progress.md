---
created: 2026-10-22
title: "Steam client / bottle setup downloads are invisible in the Downloads view — first-run setup shows no progress there"
source: phase 51-19 live gates, operator observation on a fresh Mac (no Steam, no CrossOver, no games installed)
area: downloads
files:
  - src/backend/storeManagers/steam/clientSetup.ts
  - src/backend/storeManagers/steam/bottle.ts
  - src/frontend/screens/DownloadManager/index.tsx
severity: minor
platform: any
ready: code
---

On a fresh machine, pressing Install on a Steam title (Avernum 6, 206060) diverts to guided setup
because the Steam side is not provisioned yet. Logged 2026-10-22 19:45:12:
`SteamGame: appId 206060 is bottle-eligible but the bottle is not yet provisioned — requesting
guided setup instead of installing`.

The setup work itself is downloads: `startGuidedClientInstall()` in `clientSetup.ts` fetches the
official Steam installer through `downloadFile()`, and bottle provisioning pulls its own payload.
None of these appear in the Downloads view. Downloads is where users look for progress, so on a
first run the app looks idle while a large fetch is running. The same 19:45:12 log also shows
`206060 added to download manager finished.` written immediately before the diversion. So the
queue records the game as finished while nothing was installed, and the real work is happening
somewhere the queue cannot see.

Operator ask (verbatim intent): "could include steam in the downloads progress".

Fix direction: give Steam client/bottle setup a queue entry, or at minimum a progress row with
a Steam/CrossOver label and byte progress, so first-run setup is visible in the same place as
game downloads. Also check whether the `finished` entry for a diverted install should be dropped
instead of recorded as finished.

## Closed 2026-10-27 (quick 261027-tot)

- Setup payload downloads (`steam-client`, and `steam-bottle` labelled "Steam for CrossOver") now push `steamSetupDownloadProgress` (kind, state, bytes, percent only; no url or path) and render in a Downloads "Setup" section with bytes and percent. The row disappears when the fetch finishes or fails and is never written to Completed.
- The bottle-not-provisioned `finished` entry quoted above was already fixed by 261024-cjq (`0194f89ad`, after the 2026-10-22 log).
- This task closed the remaining diversion: Steam client not installed / never launched used to be recorded as a finished error and raised "Installation Failed" over the guided-setup consent UI. It now resolves `{status: 'done', deferredToSetup: true}` on the native, bottle-native and bridge routes (a not-ready result carrying an error, e.g. a bad appId, stays an error).
- Still an operator live gate: the visible Setup row on a Mac with no cached installer.
