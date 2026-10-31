---
status: resolved
trigger: "Raft world save fails in the bottle: Unknown error (0x2a605360) on every save"
created: 2026-10-31
updated: 2026-10-31
source_todo: .planning/todos/pending/2026-10-31-raft-world-save-fails-in-bottle-unknown-error.md
---

## Current Focus

hypothesis: CONFIRMED-ish: generic Wine(macOS)+Unity Mono bug, not GameLib. (earlier candidate follows)  Leading candidate from the orchestrator's first look: Mono's `Directory.Delete(recursive)` fails on an EMPTY directory under Wine/CrossOver, and the error code it reports is not a real Win32 code. That points at a GetLastError value that is wrong or clobbered, not at a real filesystem refusal. Not yet known whether this is generic Wine+Mono behaviour (a non-DRM bottle would show it too) or something the DRM steamclient layer causes.
next_action: none required; report to operator. Optional: operator loads the world to confirm newest -Latest loads. (old plan:) (1) Decide whether the save actually fails or only the old-save cleanup fails: check that the newest `-Latest` folder holds a valid world and that the world loads. (2) Compare against a non-DRM run of the same bottle if one is practical. (3) Find what returns the garbage error code.

## Symptoms

- expected: Raft saves the world with no errors, and CheckSaveLimit deletes old save folders.
- actual: Every "Saving world" line in Player.log is followed by `Unknown error (0x…) : '\\?\C:\…\World\volgarn\2026.10.31-15.53-Latest'`. Some saves also throw a full `System.IO.IOException` for `…\2026.10.31-15.53` at
  `System.IO.FileSystem.RemoveDirectoryRecursive [0x00163]` → `FileSystem.RemoveDirectory` → `Directory.Delete(path, recursive)` → `SaveAndLoad.CheckSaveLimit(folderPath, limit)`.
- error codes: the code is different in each session. It was 0x2a605360 in the 58-09 gate run and 0xf8705430 in Player-prev.log (2026-10-31 18:52–18:53). It never matches a real Win32 error, so it looks like an uninitialized value or a pointer.
- timeline: first seen during the 58-09 live gate (2026-10-31), in DRM mode (steamclient-layer). Not known whether it ever worked.
- reproduction: launch Raft (648800) from GameLib in DRM mode on macOS, host or load world "volgarn", and save (autosave or manual).
- environment: bottle `~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-648800`. Logs are in `drive_c/users/crossover/AppData/LocalLow/Redbeet Interactive/Raft/Player.log` and `Player-prev.log`. The current Player.log shows no error.

## Evidence

- timestamp: 2026-10-31 (orchestrator)
  observation: The world folder `…/Raft/User/User_<id>/World/volgarn/` holds `2026.10.31-15.53` and `2026.10.31-15.53-Latest`. Both are EMPTY (link count 2, size 64), so these are the two folders the delete fails on. It also holds seven further `-Latest` folders (16.03, 16.42, 16.43, 16.47, 16.55, 18.52, 18.53), each with one entry. So new saves ARE being written, and old ones are not being pruned past the limit.
  implication: The user-visible "save fails" may really be "pruning fails". A Mono RemoveDirectory/FindNextFile path is getting a bad last-error value under Wine.
- timestamp: 2026-10-31 (orchestrator)
  observation: The macOS folders carry the `com.apple.provenance` xattr and are owned by the user with mode 755. No obvious permission problem.

- timestamp: 2026-10-31 (debugger)
  observation: Mono's RemoveDirectoryRecursive throws after its FindNextFile loop when GetLastWin32Error != ERROR_NO_MORE_FILES(18). Contents are deleted (files gone) but the dir stays, matching the empty leftovers. Wine itself is fine: native mingw probe (create, enumerate, delete in loop, FindNextFile end) returned GetLastError=18 on 3/3 runs in this bottle, and `cmd rmdir` deletes the leftover empty dirs when Raft is not running.
  implication: the garbage error arises inside Unity's Mono P/Invoke last-error path, not in Wine kernel32 and not in the DRM layer (layer only touches SetLastError inside Steam API calls; ntdll-patch is a loader detour).
- timestamp: 2026-10-31 (debugger)
  observation: Wine bug 60220 (Cities: Skylines II, Wine 10 on macOS, Sikarugir, no GameLib layer) reports the same Unity Directory.Delete(recursive) failure; reporter's stale-GetLastError theory was retracted, symptom stands.
  implication: reproduces without GameLib. Not a GameLib defect.
- timestamp: 2026-10-31 (debugger)
  observation: Each saved -Latest folder holds a ~330 KB volgarn.rgd; the failure is only in old-save pruning.
  implication: saves persist.

## Eliminated

- hypothesis: DRM steamclient layer clobbers last-error / causes the failure
  evidence: layer has no kernel32 file hooks; plain Wine probe is correct; same symptom reported on Wine without the layer.
  timestamp: 2026-10-31

## Resolution

root_cause: Unity Mono under Wine on macOS gets a garbage Marshal.GetLastWin32Error() after FindNextFile in Directory.Delete(recursive); generic upstream issue, not GameLib.
fix: none (no GameLib fix warranted)
verification: operator confirmed world "volgarn" loads from the newest -Latest save (2026-10-31); todo closed as upstream.
files_changed:
