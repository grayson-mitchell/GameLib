---
spike: 091
idea: steam-verify-and-move
name: steamclient-validate-repair
type: standard
validates: "Given a Mac-native game installed by running Mac Steam with a corrupted and a deleted file, when a separate process calls IClientAppManager::StartValidatingApp(appId), then Steam verifies and repairs it, completion is observable, and the result matches steam://validate/<appId>"
verdict: VALIDATED
related: [065, 067, 069, 090]
tags: [steam, macos, verify, validate, repair, steamclient, iclientappmanager, ipc]
---

# Spike 091: Repairing an installed app through IClientAppManager::StartValidatingApp

## What This Validates

**Given** WazHack (264160, 171 files, 117 MB) installed by Mac Steam in library folder 0, with
`UnityEngine.VehiclesModule.dll` overwritten in place (same size, same mtime) and
`UnityEngine.ARModule.dll` deleted,
**when** a separate native process calls `StartValidatingApp(264160)`,
**then** Steam re-hashes the install, downloads only the damaged chunks, restores both files, and
GameLib can see when it has finished.

This is the Steam-registered half of Verify in todo
`2026-11-07-implement-steam-verify-and-move-install.md`. Spike 090 covers Move.

## Research

The method is found the same way as in 090: the probe (`../090-steamclient-moveapp/probe.c`, mode
`validate`) includes the production helper header and matches the IPC function-ID high half
`0x5078` (full ID `0x507803d4`). It matched exactly one slot, **27**. Proxy disassembly (offset
`0x920f80` on the 2026-11-13 steamclient.dylib) shows that only appId is serialized and the return
is a 1-byte bool. The shape is `bool (appId)`, so no drift like 090's `CanMoveApp`.

## How to Run

```bash
clang -arch arm64 -Wno-unused-function -o /tmp/probe090 ../090-steamclient-moveapp/probe.c
/tmp/probe090 status 264160      # installState 4 = Fully Installed
/tmp/probe090 validate 264160    # {"ret":1} = started; 0 = refused
```

Damage the install first. Example:
`printf X | dd of=<file> bs=1 seek=4096 conv=notrunc`, then `touch -r` to restore the mtime.
Watch `~/Library/Application Support/Steam/logs/content_log.txt`.

## Investigation Trail

Times are local (NZDT).

1. **Baseline:** `good.sha1` holds the hashes of the two target DLLs. The full 171-file tree
   matches 090's `before.sha1`.
2. **Damage:** VehiclesModule overwritten in place (sha `e8b199b2…`, `corrupt.sha1`, same size and
   mtime); ARModule deleted. **Steam did not notice by itself:** the install state stayed 4.
3. **`StartValidatingApp(264160)` → 1 at 18:37:42.** Content log: verifying, 2 mismatching files,
   a download of 6,992 bytes, `2 updated, 0 moved, 0 deleted files`, `finished update`. Install
   state 268 → 1326 → 4 within about 2 s (`watch.jsonl`). The workshop content was re-verified too
   (no changes). Both hashes were restored, and all 171 files match the baseline. ACF: `StateFlags 4`,
   `DownloadType 2`.
4. **The URL path, for comparison:** corrupted VehiclesModule again in the same way, then
   `open steam://validate/264160` at 19:50:24. Steam logged
   `Validation: corrupt chunk 8af25c7e… has 79580ca5…`, found `1/171 mismatching files`, downloaded
   3,904 B, committed `1 updated`, and finished by 19:50:25 (`content_log_url.txt`).
5. **The helper again, on the same corruption:** `StartValidatingApp` → 1 at 19:50:41. Repaired by
   19:50:42. **The Steam content-log lines for 264160 are identical to the URL run** once
   timestamps and the "not played for N seconds" counter are removed (`content_log_helper.txt`).
   The URL and the IPC call start the same internal validate.
6. **On screen (operator):** "steam came to front, progress bar quickly filled". The operator
   couldn't say whether that was for the URL run, the helper run or both, since they were
   17 s apart. **Unresolved:** Assume the helper validate may raise Steam's window, unlike
   InstallApp in 065.
7. **Game running:** WazHack launched (pid 34372). `StartValidatingApp` → **0** at 19:51:55.
   Steam logged **nothing** in content_log, and the install state read **8196**
   (`4 | 0x2000`, probably the app-running bit). Steam refuses cleanly and the return value shows it.
   GameLib should still refuse first if the game is running.
8. **End state:** game quit, state 4, folder 0, all 171 files match the 090 baseline.

## Results

**VALIDATED (macOS, n=1, small game).** `StartValidatingApp(appId)` through the existing helper
pattern runs Steam's full verify-and-repair. It finds same-size, same-mtime corruption (Steam
hashes content, not metadata) and missing files, downloads only the bad chunks, and commits them.
It is the same flow as `steam://validate/<appId>`.

Signal for the build:

- **Verify = `StartValidatingApp(appId)`.** It returns a bool: 1 means started, 0 means refused
  (seen while the game is running). Find the slot by function ID `0x5078` with the helper's runtime
  verification.
- **Completion:** the install state passes through 268 / 1326 / 38 (Update Running, Files Missing,
  and so on) and goes back to **4**. Poll `GetAppInstallState` until it is 4 again with the
  update-running bits clear. The content log `finished update` line confirms it. Don't treat the
  in-between states as broken. No percent-progress API was tried for validate; on a small game it
  finishes in about 2 s.
- **The URL is a usable fallback:** `steam://validate/<appId>` produces the same repair when the
  helper can't attach.
- **Window behaviour is unresolved:** Steam came to the front with a progress bar on at least one
  of the two runs. Plan for Steam possibly appearing.
- **Not tested:** signed-out Steam, `CancelValidation`, large games (progress over minutes),
  validate during an update, Windows and Linux.

## Files

- `run.log`: every probe call and its result
- `watch.jsonl`: 1 s poll of install state during the first repair
- `content_log.txt`: Steam content-log lines for the first (helper) repair
- `content_log_url.txt`, `content_log_helper.txt`: the URL run and the helper run on the same corruption
- `good.sha1`, `corrupt.sha1`: target-file hashes
