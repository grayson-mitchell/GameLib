---
created: 2026-10-22
title: "Unresolved cross-depot file collisions leave a GameLib-direct install stuck at StateFlags=1026 (XCOM 200510: \"restart Steam to finish\")"
source: phase 51-19 live gate item 5 (XCOM, 200510), fresh Mac, packaged debug bundle
area: steam-depot-download
files:
  - src/backend/storeManagers/steam/depot/pathCollisions.ts
  - src/backend/storeManagers/steam/depot/appinfoOrder.ts
  - src/backend/storeManagers/steam/depot/reconcile.ts
severity: medium
platform: any
ready: live-gate
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

## Recurrence 2026-10-23 (51-28, 51-UAT item 17)

Reproduced on the bottled-Steam route. After the operator chose "Use bottled Steam", GameLib's own depot download into GameLibSteam failed closed at 20:22:07 with the same 11 wrong-size files under `XEW\XComGame\...` (XComGame.upk, Engine.upk, DefaultGame.ini and others), correlating with `buildDepotPlan: UNRESOLVED cross-depot path collision ... claimed by depot(s) 200522,225341`. Bottled Steam later adopted and repaired the files by itself, which suggests the real client's winner rule is observable: compare the on-disk bytes after the Steam repair against each depot's manifest entry to see which claim wins.

## Fix landed 2026-10-24 (debug/cross-depot-collision-1026), live gate outstanding

The 1026 symptom is fixed in code; the rule is implemented but unproven in general. Debug session: `.planning/debug/cross-depot-collision-1026.md`.

- **Winner rule:** the depot later in the owning app's raw PICS appinfo `depots` order wins, and the loser's entry is dropped from the plan (`resolveDepotPathCollisions`, logged `RESOLVED cross-depot file collision ... winner depot <id>`). steam-user sorts depot keys numerically when it parses appinfo, so `depot/appinfoOrder.ts` reads the order from the raw VDF text by briefly wrapping steam-user's private `_send` around the two `getProductInfo` calls in `depot.ts`. A resolved path is verified strictly against the winner.
- **Fallback:** when the order is unknown (no `_send`, no raw buffer, depot id missing from the text) or the claimants belong to different owning apps, the collision stays UNRESOLVED. `verifyStructuralIntegrity` (`depot/reconcile.ts`) then passes the path if the bytes on disk match any claim by size and whole-file sha1, so the install is not failed closed to 1026.
- **Evidence:** the bottle's `appinfo.vdf` lists 225341 before 200522, and the 11 files bottled Steam repaired on 2026-10-23 have exactly 200522's sizes. That matches the rule.
- **Not proven:** XCOM's single pair cannot tell "later in appinfo order" from "lowest depot id" or "later manifest gid"; 200522 satisfies all three. A second title with a cross-depot real-file collision where those rules disagree would settle it.

**Remaining before this can close:**

1. Live gate: a fresh GameLib-direct XCOM 200510 install logs `RESOLVED cross-depot file collision ... winner depot 200522` for the 11 `XEW/` paths and finishes at StateFlags=4. This also confirms that the PICS text response orders depots the same way as the local binary `appinfo.vdf` (unverified; the capture has only run against fakes).
2. Rule confirmation from a second collided title (see Not proven above).
