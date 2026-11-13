---
created: 2026-11-13T00:00:00.000Z
title: 'Update button flashes about 2s before the badge clears after InstallApp completion'
area: steam
severity: minor
platform: macos
ready: live-gate
source: '74-UAT item 17 (2026-11-13): polish note, button flash looked rough'
files:
  - src/frontend/screens/Game/GamePage
---

After Steam finishes a registered InstallApp update, the Update button reappears for about 2 s before the badge and Updating state clear. Hold the Updating state until the update list refresh lands.

Resolved by 74-27: updateRegisteredSteamGame returned done right after the hand-off and the queue finally cleared the status early. It now returns handedOffToSteam and updateQueueElement holds updating (managedBySteam) until the poll ends; Task 3 audits the terminal done. Live proof is deferred to 74-29.
