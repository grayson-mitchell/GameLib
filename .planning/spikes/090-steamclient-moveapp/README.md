---
spike: 090
idea: steam-verify-and-move
name: steamclient-moveapp
type: standard
validates: "Given an app installed in running native Mac Steam, when a separate process calls IClientAppManager::CanMoveApp then MoveApp(appId, folderIndex), then Steam moves the files and ACF to another registered library folder with no window, progress is readable, and the game still launches"
verdict: VALIDATED
related: [065, 066, 067, 069, 091]
tags: [steam, macos, move, library-folder, steamclient, iclientappmanager, ipc, no-ui, signature-drift]
---

# Spike 090: Moving an installed app between library folders through IClientAppManager::MoveApp

## What This Validates

**Given** WazHack (264160, 117 MB, 171 files) installed by Mac Steam in library folder 0,
**when** a separate native process calls `CanMoveApp(appId)` and then `MoveApp(appId, 1)`,
**then** Steam moves the install folder and its ACF into library folder 1 with no window, the
move's progress can be read, and the game still launches from the new place.

This is the Steam-registered half of Move in todo
`2026-11-07-implement-steam-verify-and-move-install.md`. The fallback, if Steam had no usable move
method, was for GameLib to copy the folder and ACF itself and have Steam adopt them.

## Research

066's slot map (steamclient build of 2026-10-22) names the move methods. **steamclient.dylib
changed on 2026-11-13** (53,044,832 B), so no slot was taken from 066 directly. The probe
`#include`s the production helper's `native/steam-bridge/helper/gamelib_installapp.h`. It finds the
getter with the fork()ed RTTI scan and each method by its unique IPC function-ID high half, which is
how production finds them. Every method matched exactly one slot, and on this build the slots are
the same as 066's:

| Slot | Method | ID high half | Shape on this build (from proxy disassembly) |
|---|---|---|---|
| 67 | CanMoveApp | 0x68b2 | **`EAppUpdateError (appId, uint32 *out)`**. Only appId is sent; the reply writes 4 bytes into `*out` |
| 68 | MoveApp | 0x4780 | `EAppUpdateError (appId, int32 folderIndex)`. Both are sent as 4-byte values |
| 69 | GetMoveAppProgress | 0x5523 | `uint32 (appId, uint64 *, uint64 *, uint32 *)`. The reply writes 8 + 8 + 4 bytes |
| 70 | CancelMoveApp | 0x4309 | not called |
| 82 | GetAppLibraryFolder | 0x166e | `int32 (appId)`: -1 when not installed |

**OpenSteamClient's `CanMoveApp(AppId_t, LibraryFolder_t)` is wrong for this build.** Called with
that shape, folder 0 returned 0, because the reply wrote into a NULL pointer, and folder 1
segfaulted, because the reply wrote to address 1. Disassembling the proxy (`addr.c` for the offset,
then `lldb disassemble`) showed that the second argument is never serialized and is used as a
destination after the reply. **Lesson: verify each proxy's argument serialization before calling a
method with an unknown shape.** Matching the function ID alone does not guarantee the call is safe.

## How to Run

```bash
clang -arch arm64 -Wno-unused-function -o /tmp/probe090 probe.c     # from this dir
/tmp/probe090 status 264160       # state, folder, install dir, verified slots, library folders
/tmp/probe090 canmove 264160
/tmp/probe090 move 264160 1       # the call under test
/tmp/probe090 progress 264160
PROBE=/tmp/probe090 ./watch.sh 264160 180 > watch-move.jsonl
clang -arch arm64 -Wno-unused-function -o /tmp/addr090 addr.c && /tmp/addr090 67 68 69   # proxy offsets
```

Needs Mac Steam running and signed in. Library folder 1 on this machine is
`~/GameLibParity/SteamLibrary/steamapps`. That registered path ends in `steamapps`, so Steam keeps
the apps under `<path>/steamapps/` (`…/steamapps/steamapps/common/WazHack`).

## Investigation Trail

Times are local (+13 h); the watcher's `ts` is UTC.

1. **Status (read-only).** The getter is slot 43 again. WazHack: state 4, up to date, folder 0. Steam
   lists 2 library folders. Baseline taken: `before.sha1` (171 files), `acf-before.acf`,
   `libraryfolders-before.vdf`.
2. **`CanMoveApp(264160, 1)` segfaulted (exit 139).** The OpenSteamClient shape was wrong; the
   disassembly found the out-pointer shape described under Research.
3. **`CanMoveApp` with the corrected shape.** Results: WazHack (folder 0) → 0, out 0. Stellaris
   281990 (folder 1, state 6) → 0, out 0. World of Goo 22000 → 0, out 0. TF2 440 (not installed) →
   **18** NotInstalled, out 0. So the return is an `EAppUpdateError`. `out` stayed 0 in every case
   and its meaning is unknown, so don't rely on it.
4. **`MoveApp(264160, 1)` → 0 at 18:03:51.** Content log: `moving from "…/Steam/steamapps/common/WazHack" to "…/GameLibParity/SteamLibrary/steamapps/steamapps/common/WazHack"`,
   state `Fully Installed,Moving Folder`, then `Finished moving install folder (118009358 bytes, 176 files)`
   at 18:03:52. **Steam then ran a verify on its own:** state 38 (`Update Required,Fully Installed,Files Missing`)
   for about 1 s, then `Verifying Installed`, `has no changes`, `0 updated, 0 moved, 0 deleted files`,
   back to state 4 at 18:03:53. The whole move took about 2 s on the same APFS volume.
5. **Result on disk:** all 171 files are byte-identical (sha1) at the new place and the source folder
   is gone. The ACF moved to the folder-1 `steamapps/`. Its only changes are `DownloadType 2→1` and
   `TargetBuildID 0→9044149`, both written by the post-move verify. The workshop ACF
   (`appworkshop_264160.acf`) and `workshop/content/264160` moved too.
   `GetAppLibraryFolder` → 1 and `GetAppInstallDir` → the new path, both straight away.
6. **`libraryfolders.vdf` was not rewritten.** Its `apps` block still lists 264160 under folder 0
   (mtime is the day before). GameLib uses that block only as an adoption signal
   (`gamelib-steamfiles` `read_library_folder_apps`), not to locate games, so the stale entry
   does no harm. Location comes from the ACF scan.
7. **GameLib after the move (operator).** GameLib, started after the move, showed WazHack as
   "not available", and Play gave the launch-without-Steam toast. The log shows
   `stale nonAvailableGames entry: 264160` and `direct launch refused for appId 264160: binary is missing`.
   The cause: `store_cache/steam_library.json` still held the old `install_path`
   (`isGameAvailable()` checks that it exists on disk). A restart re-scanned the ACFs but did not
   rewrite the cached path. **A library Refresh fixed it:** the cache took the new path, and the
   operator confirmed WazHack plays from folder 1.
8. **Moved back: `MoveApp(264160, 0)` → 0 at 18:35:47.** It finished in 1 s, then Steam verified it
   the same way. Files are byte-identical again, the ACF is back in the main `steamapps`, folder 0,
   state 4. **Progress caught mid-move:** `GetMoveAppProgress` → `ret 1, a 118009358, b 0, c 0`.
   When nothing is moving it returns `ret 0` with all three zero.
9. **Operator:** wasn't watching for a Steam window or toast, and didn't check Steam's Installed
   Files pane. The move went through Steam's own flow (the content log above), not a GameLib file
   copy.

## Results

**VALIDATED (macOS, n=1, same volume).** `MoveApp(appId, folderIndex)` through the existing helper
pattern makes Steam move an installed app (files, ACF and workshop content) to another registered
library folder, then verify it at the new location. GameLib needs no copy-and-adopt fallback for
Steam-registered games.

Signal for the build:

- **Move = `CanMoveApp(appId, &out)` (error 0 means OK) then `MoveApp(appId, folderIndex)`.** Use
  the helper's existing runtime verification, with a guard for each proxy's argument shape. Resolve
  `folderIndex` from Steam's own folder list (`GetNumLibraryFolders` / `GetLibraryFolderPath`;
  `--steam-installapp --library` already does this) and offer only registered folders.
- **Progress:** poll `GetMoveAppProgress`. A return of 1 means a move is running, and `a` is the
  total in bytes. `b` is probably bytes done but was only ever seen as 0, because the move took
  about 1 s. `c` is unknown. Completion: return 0, `GetAppLibraryFolder` = the target folder,
  and install state back to 4. During the follow-up verify the state passes through 38
  (Files Missing), so don't treat state 38 as broken during that window.
- **GameLib must refresh the install path after a move.** The cached `install_path` is not
  re-derived at startup. Re-read the ACF location (or `GetAppInstallDir`) when the move completes,
  and also when an ACF turns up in a different library (a move made in Steam), so the game doesn't
  show "not available".
- **Don't read `libraryfolders.vdf`'s `apps` block to find where a game is.** Steam rewrites it
  later.
- **Not tested (the classifier blocked these error-path calls as beyond what the operator approved):**
  `MoveApp` to the current folder, to an invalid index, for an uninstalled app (expect 18 by analogy
  with `CanMoveApp`), and while the game is running (expect 16 `ApplicationRunning`; GameLib should
  refuse first anyway). Also untested: cross-volume moves (likely a slow copy, where progress `b`
  matters), signed-out Steam, `CancelMoveApp`, whether Steam shows a toast or window, and Windows
  and Linux.

## Files

- `probe.c`: modes `status`, `canmove`, `move`, `progress`, `cancelmove`, `validate`, `cancelvalidate`.
  It includes the production helper header. Spike 091 uses it too.
- `addr.c`: prints each app-manager slot's proxy offset in steamclient.dylib, for `lldb disassemble`
- `watch.sh` / `watch-move.jsonl`: 1 s poll of status, move progress and ACF location (3 min from the move)
- `content_log.txt`: Steam content-log lines for 264160 over both moves
- `before.sha1`: file hashes before the move. They matched exactly after each move.
- `acf-before.acf`, `acf-after-move.acf`, `libraryfolders-before.vdf`, `libraryfolders-after-move.vdf`
- `run.log`: every probe call and its result
