---
spike: 083
name: adoption-signal-without-restart
type: standard
validates: "Given a GameLib-written ACF with Mac Steam running but signed out, when the helper polls the app's install state through IClientAppManager across the operator's sign-in, then GameLib observes adoption when Steam rescans, without a Steam restart"
verdict: VALIDATED
related: [047, 065, 066, 067, 084, 001]
tags: [steam, macos, adoption, steamclient, restart-hold, integration, live]
---

# Spike 083: Adoption signal without a restart

## What This Validates

Given a GameLib-written ACF and Mac Steam running but signed out, when a helper polls the app's
install state through `IClientAppManager` while the operator signs in, then GameLib sees the
adoption when Steam rescans, with no Steam restart.

This is the restart-hold case. `InstallApp` (065/066) needs a signed-in Steam: 067 measured a
signed-out call returning 18. So a depot install that finishes while Steam is signed out currently
ends in "Restart Steam to finish". The open questions were whether sign-in itself rescans, and
whether GameLib can observe it.

## Research

- 066: a running, signed-in Steam ignores an ACF written after startup. `RefreshLibraryFolders`
  does not rescan manifests. `InstallApp` adopts the app after a full file scan.
- 067: when signed out, `GetNumInstalledApps` is 0 and app-manager calls return 18, so install
  state cannot be read while signed out.
- 084: `BLoggedOn` and `GetSteamID` resolve by function ID on this build. The probe here
  re-attaches on every tick, so no handle has to survive the sign-in.
- Production ACF (`depot/appManifest.ts` `buildAppManifestText`): StateFlags 1026, real
  `buildid`, `LastOwner`, `InstalledDepots` manifest and size. The comment says 1026 makes
  "Steam run its own verify/repair pass".

## How to Run

```sh
clang -arch arm64 -O1 -Wall -o probe probe.c
./probe tick 264160      # BLoggedOn, GetSteamID, GetAppInstallState, GetNumInstalledApps
./probe install 264160   # InstallApp(264160, 0, false)
./watch.sh <run> [app] [passive_s=90] [max_s=900]
```

`watch.sh` ticks once a second. When `BLoggedOn` turns 1, it waits `passive_s` for Steam to adopt
on its own, then fires `InstallApp` once. It stops when state 4 has held for 10 s. Mac Steam's
`content_log.txt` and `connection_log.txt` are mirrored for the run.

Setup (WazHack 264160, 117 MB, files left in place):

1. Operator quits Steam. Steam's ACF is moved to `out/`.
2. Operator starts Steam, then signs out (Change Account / Sign Out).
3. `gamelib-1026.acf` is written atomically to `steamapps/`. It is byte-for-byte the
   `buildAppManifestText` format with WazHack's real buildid, depot manifest and size.
4. The watcher starts, and the operator signs in.

## What to Expect

Either Steam reaches state 4 within the passive window on its own (sign-in is a rescan), or it
stays at state 1 and the `InstallApp` fallback adopts the app as in 066. Both outcomes remove the
restart.

## Investigation Trail

1. **Signed out, before the ACF:** `loggedOn 0`, SteamID `76561197960265728` (the empty
   individual ID), WazHack state 1, 0 installed apps.
2. **GameLib ACF written while signed out:** state 1, unchanged, as expected.
3. **Sign-in at 19:29:29 UTC.** On the first tick Steam was still connecting (`loggedOn 0`), but
   the library was already loaded: 15 apps, and **WazHack at state 1026**, read straight from
   GameLib's file. One second later `loggedOn 1` and **state 4**. It held for 10 s, and
   `InstallApp` was **never fired**.
4. `content_log.txt` at sign-in:
   - `Loaded 14 apps from install folder …steamapps\appmanifest_*.acf`, plus 1 from the second
     library. Sign-in reloads every library folder.
   - `AppID 264160 … Update Required,Update Queued,Update Started`, then
     `has no changes, 1 active: 264162 (3306037234848478854), 1 target: 264162 (…)`, then a
     commit with `0 updated, 0 moved, 0 deleted files`, then `Fully Installed`.
   - **No `Validation: full scan` line**, and no file under `common/WazHack` is newer than the
     ACF. Steam trusted the `InstalledDepots` manifest ID and did not hash the files.
5. Steam rewrote the ACF itself: StateFlags 4, `TargetBuildID 9044149`, its own field set.
6. Operator observed: the main Steam window opened at sign-in. That is Steam's normal sign-in
   behaviour, and nothing ties it to the adoption. No separate dialog was reported.

## Results

**VALIDATED, and better than hypothesised.** A signed-out Steam needs no restart and no
`InstallApp`. **Signing in reloads every `appmanifest_*.acf`**, so a GameLib ACF written while
Steam is signed out is adopted on its own within about 1 s of sign-in. GameLib can observe this
by polling `GetAppInstallState` (1026 → 4) through a helper that re-attaches on each poll.

- **The restart hold becomes a sign-in hold.** For a finished install with Steam signed out, show
  "Sign in to Steam to finish" instead of "Restart Steam". Poll `BLoggedOn` and
  `GetAppInstallState`. If state is not 4 a few seconds after `BLoggedOn` becomes 1, fall back to
  `InstallApp` (066).
- **1026 does not force a file verify when the manifest ID matches.** Steam compared the
  `InstalledDepots` manifest with the target and committed 0 files. That contradicts
  `appManifest.ts`'s "Steam runs its own verify/repair pass" for the matching-manifest case. So
  sign-in adoption is **not** a second integrity check, unlike `InstallApp`'s full scan (066, 049).
  GameLib's own verification is the only one on this path. A `buildid` of "0" (the documented
  sentinel) may still force a verify; that was not tested here.
- A signed-out Steam reports 0 installed apps, so state polling is meaningful only once the
  library loads, which happens at the start of sign-in, about 1 s before `BLoggedOn`.
- Not tested: Steam not running at all (an ordinary launch also loads the folders, which is the
  existing restart path); a non-default library folder; `buildid "0"`; Windows/Linux.
