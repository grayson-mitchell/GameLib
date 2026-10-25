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

## Live gate passed 2026-10-25

Item 1 below PASSED on a fresh GameLib-direct XCOM 200510 install.

- **Setup:** packaged debug bundle (`pnpm build-steam-bridge` + `pnpm tauri:dev:packaged`) at HEAD
  2a72ccc6e, GameLib.app built 15:57:49. The build's final updater-signing step failed for lack of
  TAURI_SIGNING_PRIVATE_KEY; the .app itself was complete and unaffected. SHIM32 290304 bytes,
  SHIM64 498176 bytes. Prior log archived as
  `~/Library/Logs/GameLib/gamelib.log.pre-collision-gate-20261025-155910`.
- **Route:** operator uninstalled XCOM (bottle install removed 15:59:47; `common/XCom-Enemy-Unknown`
  and `appmanifest_200510.acf` confirmed gone), then Install -> known-bad notice -> "Use bottled
  Steam", which runs GameLib's own depot downloader into the GameLibSteam bottle (XCOM is knownBad
  drm-wrapped, so this is the route, as in 51-UAT item 17). The bottled Steam client was not
  running throughout. This exercises GameLib's depot downloader, which is what item 1 asks for,
  though via the bottled-Steam target rather than a native-Steam target.
- **Plan time** (16:01:15, identical on every re-plan after pause/resume, e.g. 16:06:59): 75
  `RESOLVED cross-depot file collision` lines for appId 200510, every one
  `winner depot 200522 (appinfo rank 26)`, dropped 225341 (rank 14), rule "later in the app's
  appinfo depot order wins". Exactly 11 of the 75 differ in size between the depots and they are
  the same 11 that failed on 2026-10-22/23 (examples: IpDrv.upk winner 67211 vs 67223;
  DefaultGame.ini 12721 vs 46800; XComStrategyGame.upk 1496773 vs 1493416). The other 64 are
  byte-size-identical claims. 22 `UNRESOLVED cross-depot path collision` lines remain, all
  directory-vs-directory (`size=0 chunks=0 flags=64` on every claim); no real file is unresolved.
- **PICS order:** the live PICS text response ranks 225341 before 200522, matching the bottle's
  local binary `appinfo.vdf`. This closes the "unverified" note in item 1.
- **Download:** operator paused twice (16:06:47 and 16:07:50, both `status=cancelled`) for poor
  speed, then resumed. Final run ended 17:11:43 `status=done`:
  `steam-flags-census stage=download-complete ... executableFlagged=2 chmodAttempts=2 jobCount=8732 reconciledSkipped=915`,
  then `Writing StateFlags=4 full-ownership manifest for appId 200510 (sizeOnDisk=19888329199, buildid=848157)`.
  ACF reads StateFlags 4, SizeOnDisk 19888329199 (identical to the 2026-10-23
  bottled-Steam-repaired install). No structural re-verification failure and no 1026 fail-close on
  the completed run. All 75 collided paths on disk match the winner's size (checked with stat
  against the log's winner sizes; the 11 differing ones all at 200522's size).
- **Verdict:** item 1 PASSED. Not checked: whether the tile shows installed or "Restart Steam to
  finish" on the bottled route; that dead end is tracked by a separate existing todo and is out of
  scope here.
- **Side findings filed as separate todos:**
  `2026-10-25-paused-depot-download-logs-chmod-fail-close-as-integrity-failure.md` and
  `2026-10-25-empty-cdn-auth-token-for-depot-200511-and-high-chunk-timeout-rate.md`.

**Remaining before this can close:**

1. ~~Live gate: a fresh GameLib-direct XCOM 200510 install logs `RESOLVED cross-depot file collision ... winner depot 200522` for the 11 `XEW/` paths and finishes at StateFlags=4. This also confirms that the PICS text response orders depots the same way as the local binary `appinfo.vdf` (unverified; the capture has only run against fakes).~~ — **done 2026-10-25**, see Live gate passed 2026-10-25
2. Rule confirmation from a second collided title (see Not proven above). **Still open.**
