---
created: 2026-10-22
title: "Unresolved cross-depot file collisions leave a GameLib-direct install stuck at StateFlags=1026 (XCOM 200510: \"restart Steam to finish\")"
source: phase 51-19 live gate item 5 (XCOM, 200510), fresh Mac, packaged debug bundle
area: steam-depot-download
files:
  - src/backend/storeManagers/steam/depot/pathCollisions.ts
  - src/backend/storeManagers/steam/depot/
severity: major
platform: any
ready: code
---

Installing XCOM: Enemy Unknown (200510, 9 depots, 9723 files) through GameLib's own depot
downloader ended, on two installs in a row (21:13:11 and 21:25:23), with:

`downloadDepotFiles: appId=200510 post-download structural re-verification found 11 of 9723
planned entries damaged or missing — failing closed to StateFlags=1026 instead of an unproven
StateFlags=4: "XEW\XComGame\CookedPCConsole\IpDrv.upk" wrong-size (expected=67223 found=67211) …`

The same 11 files failed both times, so this is not network corruption. They are real files
that depots 200522 and 225341 both ship at the same path under `XEW/`, the Enemy Within
expansion. `resolveDepotPathCollisions()` (`pathCollisions.ts`) only resolves the
directory-marker-vs-file shape (Fallout 2). For two real files it deliberately logs
`UNRESOLVED cross-depot path collision … no winner guessed` and leaves both in the plan.
Whichever write lands last wins on disk, and verification against the other claim's size then
fails. The tile stays on the downloading icon with "restart Steam to finish", and the game cannot
be launched.

The 51-19 gate worked around it by hand: the bridge bottle's `appmanifest_200510.acf` was set to
`StateFlags 4`, with the original saved in the session scratchpad. The base game,
`Binaries/Win32/XComGame.exe`, is unaffected.

Fix direction: find out how the real Steam client picks a winner when two depots of one app
ship the same path. Candidates are depot order in the app's `depots` section, a
language/DLC-specific depot overriding the base depot, or the later manifest. Implement that
rule in `resolveDepotPathCollisions`, then verify against the claim that actually won. Do not
guess. Until then, the verifier should judge a collided path against the content that was
written, not against an arbitrary claim, so the install is not reported as damaged.
