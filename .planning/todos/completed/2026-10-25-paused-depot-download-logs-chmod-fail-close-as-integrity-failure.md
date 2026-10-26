---
created: 2026-10-25
title: "Pausing a native depot download logs the chmodAttempts=0 fail-close as if it were an integrity failure"
source: quick 261025-rd0, XCOM 200510 cross-depot collision live gate, packaged debug bundle
area: steam-depot-download
files:
  - src/backend/storeManagers/steam/depot.ts
severity: minor
platform: any
ready: code
---

During the 2026-10-25 XCOM 200510 live gate, each user pause of the depot download logged:

`downloadDepotFiles: appId=200510 manifest claims executableFlagged=2 but this run's chmodAttempts=0 — failing closed to StateFlags=1026 instead of an unproven StateFlags=4 (G-23-02/T-23-27)`

at 16:06:47 and 16:07:50, each immediately followed by `status=cancelled` and
`Installation of 200510 paused!`.

Writing StateFlags=1026 for an incomplete install is correct. The defect is the message: it
presents a user pause as an integrity fail-close, which will mislead anyone reading the log.
The completed, resumed run correctly logged `chmodAttempts=2` and wrote StateFlags=4.

Fix direction: skip or reword the `executableClaimedByManifest && !modesActuallyAppliedThisRun`
warning (`depot.ts` ~3037-3050, the `chmodAttempts=` line is at ~3046) when the run status is
cancelled, keeping the 1026 outcome, and add or adjust a unit test for the cancelled case.
