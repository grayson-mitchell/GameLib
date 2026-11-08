---
spike: 069
name: steamclient-update-installed
type: standard
validates: "Given an app installed in running native Mac Steam with an update pending that Steam has deferred, when a separate process calls IClientAppManager::InstallApp(appId), then Steam starts and finishes the update immediately, with no window or dialog"
verdict: VALIDATED
related: [065, 066, 067]
tags: [steam, macos, update, steamclient, iclientappmanager, ipc, no-ui, buildid, validate, phase-74]
---

# Spike 069: Updating an installed app through IClientAppManager::InstallApp

## What This Validates

**Given** an app installed in the running native Mac Steam, with an update pending that Steam
has deferred ("Update Required", auto-update scheduled for later), **when** a separate native
process calls `IClientAppManager::InstallApp(appId, 0, false)`, **then** Steam starts the update
now and finishes it, and no window or dialog appears.

This is Phase 74's case 1 (Steam-registered games). The question comes from todo
`2026-11-07-implement-steam-game-updates.md`: spike 065 called `InstallApp` only on an
uninstalled app. If `InstallApp` did not start an update, the fallback was to look for an
update or validate method next to it in the method map.

## Research

Same steamclient build as 065–067 (`steamclient.dylib` mtime 2026-10-22 11:15, 52628544 B), so
066's `slotmap.txt` applies. This build has **no separate "update" method**. The neighbours that
matter, each matched by its proxy's IPC function-ID high half in 066's slot map, with arg shapes
from OpenSteamClient's `dumped_data/IClientAppManagerMap.json`:

| Slot | Method | Args → return |
|---|---|---|
| 0 | InstallApp | appId, libraryFolder, bLegacy → EAppUpdateError |
| 20 | GetUpdateInfo | appId, `AppUpdateInfo_s*` (120 B serialized) → bool |
| 21 | BIsAppUpToDate | appId → bool |
| 27 | StartValidatingApp | appId → bool |
| 36 / 37 | SetActiveBeta / GetActiveBeta | appId, branch → bool |
| 42 | GetDownloadingAppID | → appId |
| 48 / 49 | Get/SetAppAutoUpdateBehavior | appId, enum (0 always, 1 on launch, 2 high priority; this build also reported 3 for an uninstalled app) |
| 56 | ChangeAppDownloadQueuePlacement | appId, EAppDownloadQueuePlacement → bool (not called) |
| 58 / 59 | GetAppDownloadQueueIndex / GetAppAutoUpdateDelayedUntilTime | appId → int / RTime32 |

**Making a real pending update.** No installed game had one. The depot cache held one manifest
per depot, so there was nothing to roll back to. Anonymous PICS (`branches.mjs` →
`branches.jsonl`) found ADOM (333300, ~570 MB, one Mac depot 333302) with many unprotected old
branches; `release-101` is build 3512046 against public 5820078.

## How to Run

```bash
clang -arch arm64 -o /tmp/probe069 probe.c
/tmp/probe069 status 333300          # read-only
/tmp/probe069 autoupdate 333300 1    # "only update when launched"
/tmp/probe069 setbeta 333300 release-101
/tmp/probe069 install 333300         # the call under test
/tmp/probe069 validate 333300
PROBE=/tmp/probe069 ./watch.sh 333300   # 2 s status + ACF poll → watch.jsonl, content log → content_log.txt
node branches.mjs <appId>...            # from the repo root (needs steam-user)
```

## Investigation Trail

Times are UTC. `content_log.txt` lines are local time (+13 h).

1. **Read-only status works** (09:00). ADOM: state 4, `BIsAppUpToDate` 1. `GetUpdateInfo`'s layout
   **differs from OpenSteamClient's struct**. This build puts the current build at offset `0x20`
   and the target build at `0x24` (ADOM `aece5800` = 5820078 at both while up to date;
   5820078 / 3512046 during the branch switch). The documented `m_unBytesToDownload` slot holds
   `0xffff…`. Treat the struct as opaque apart from those two words, verified only on this build.
2. **`SetAppAutoUpdateBehavior(333300, 1)` → 1**, and Steam wrote `"AutoUpdateBehavior" "1"`
   to the ACF at once.
3. **`SetActiveBeta(333300, "release-101")` → 1** (09:00:54). **Steam started downloading straight
   away despite behavior 1.** A branch switch is user-initiated, so it cannot be used to make a
   *pending* update. The rollback finished at 09:02:03: 2 MB downloaded, ACF `buildid` 3512046,
   StateFlags 4.
4. **Making the deferred state** (approved by the operator). Quit Steam. The AppleScript quit
   returned "User cancelled (-128)", but `steam_osx` had exited. Deleted both `BetaKey` lines
   from the ACF (`acf-before-restart.acf` → `acf-edited.acf`) and relaunched Steam (09:18–09:19).
   Steam then logged `Update Required,Fully Installed, (Update delayed for 28776 secs)` and
   `update prefetch finished : 1872128 bytes to download`. The probe showed state 6,
   `BIsAppUpToDate` 0, `GetAppAutoUpdateDelayedUntilTime` 1794158347, not downloading. This is
   the same state a real build shipping produces under "only update when launched".
5. **`InstallApp(333300, 0, false)` → 0** at 09:22:26. In the same second the log shows
   `update started : download 0/1872128`, then
   `Update Required,Fully Installed,Update Queued,Update Running,Update Started`, then
   `starting commit … 13 updated, 0 moved, 4 deleted files`, then
   `finished update, 1 mounted depots (BuildID 5820078) : 333302 (1735692159990042256)`.
   **The 8-hour deferral was ignored and the update finished in 2 s.** The ACF's `buildid` and
   `TargetBuildID` went to 5820078, the manifest GID matched public, `BIsAppUpToDate` went to 1
   and `delayedUntil` to 0.
6. **Edge: `InstallApp` on an up-to-date app → 0** (09:23:14). This runs a sub-second empty job:
   `has no changes, 1 active … 1 target`, then `0 updated, 0 moved, 0 deleted files`, then
   `finished update`. A second click on Update does no harm.
7. **Edge: `StartValidatingApp(333300)` → 1** (09:23:31). The log shows
   `Start validating appID 333300 on BuildID 5820078`, then `Verifying Installed`, then
   `scheduler finished … No Error` 2 s later.
8. **Restored.** `SetAppAutoUpdateBehavior(333300, 0)`. ADOM is on public, build 5820078,
   StateFlags 4, no `BetaKey`.
9. **Operator:** saw Steam open (the relaunch in step 4), saw no dialog, and wasn't watching
   closely enough to rule out a notification.

## Results

**VALIDATED (macOS, n=1).** Calling `InstallApp` on an installed app with a pending update starts
that update now, overriding Steam's own deferral. It is the same call 065 uses to install and
066 uses to adopt. No separate update method is needed.

Signal for Phase 74:

- **Update button = `InstallApp(appId)`** through the existing helper, with 065's runtime
  slot verification and fallback. It does no harm if the game turns out to be up to date already.
- **Detecting updates for Steam-registered games needs no PICS comparison.** Two sources, both
  verified here:
  - **Over IPC:** `BIsAppUpToDate` (0 while pending), `GetAppInstallState` (6 = Update
    Required | Fully Installed), `GetAppAutoUpdateDelayedUntilTime` (when Steam would start it).
  - **From the ACF, with no helper and Steam not running:** `StateFlags` 6 (bit `0x2`),
    `TargetBuildID` ≠ `buildid`, `BytesToDownload` > 0, `ScheduledAutoUpdate` = epoch
    (`acf-pending.acf`). Steam writes this only once it has noticed the update, so it lags
    while Steam is closed. PICS comparison is still needed for bridge games and as a check
    when Steam is not running.
- **"Verify files" is available too:** `StartValidatingApp(appId)` → true, no UI seen.
  Repairing a corrupted file was not tested.
- **Do not use a branch switch as a test fixture** for "pending update": Steam downloads at
  once. Quit Steam, edit the ACF, relaunch, as in step 4.
- `GetUpdateInfo`'s struct has drifted from OpenSteamClient's. Read only the build words at
  `0x20` / `0x24`, after the same runtime verification as the slots, or skip it.
- **Not tested:** the game running (todo: refuse in GameLib); signed out (067's UninstallApp
  returned 18 synchronously; expect the same); large or multi-depot updates; non-default
  library folder; an update needing a newer Steam client; whether Steam showed a toast.
  Windows and Linux.

## Files

- `probe.c`: 067's probe plus `status`, `setbeta`, `autoupdate`, `validate`, `queue`
- `branches.mjs` / `branches.jsonl`: anonymous PICS branch list for the installed apps
- `watch.sh` / `watch.jsonl`: 2 s status + ACF poll. Two watchers overlapped from 09:19 to
  09:24, so some rows are duplicated, and rows from while Steam was quit have an empty `s`.
- `content_log.txt`: Steam content log over the run (local time)
- `acf-before-restart.acf`, `acf-edited.acf`, `acf-pending.acf`: ADOM's ACF at steps 3, 4 and 5
- `run.log`: timestamps of each call
