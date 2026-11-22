---
spike: 094
idea: steam-verify-and-move
name: steamclient-addlibraryfolder
type: standard
validates: "Given an arbitrary folder and running native Mac Steam, when a separate process calls IClientAppManager::AddLibraryFolder(path), then Steam registers it as a new library folder with no window, and MoveApp(appId, returnedIndex) moves a game into it that still launches"
verdict: VALIDATED
related: [066, 090, 091]
tags: [steam, macos, move, library-folder, steamclient, iclientappmanager, ipc, signature-drift, folder-gaps]
---

# Spike 094: Registering a new Steam library folder through IClientAppManager::AddLibraryFolder

## What This Validates

**Given** an arbitrary folder the user picks (not yet a Steam library) and Mac Steam running and
signed in, **when** a separate native process calls `AddLibraryFolder(path)` and then
`MoveApp(appId, returnedIndex)`, **then** Steam registers the folder as a library with no window,
moves the game into it, and the game launches from there.

This is option 1 for Steam Move (quick 261122-9sl, todo
`2026-11-20-implement-steam-move-install.md`). GameLib keeps the free folder picker: when the
picked folder isn't a Steam library, GameLib adds it as one and then moves the game. Spike 090
proved the move half; this spike proves the add half and the two together.

## Research

066's slot map named the library-folder methods. Each slot was checked on the current build
(steamclient.dylib of 2026-11-13, 53,044,832 B, via `addr.c`) and was unchanged:

| Slot | Method | Function ID | Shape on this build (from proxy disassembly) |
|---|---|---|---|
| 75 | GetNumLibraryFolders | 0xab50… | `uint32 ()`: counts gaps too (see below) |
| 76 | GetLibraryFolderPath | 0xf27c… | `int32 (idx, char *buf, int32 cap)`: returns 0 and an empty string for a gap |
| 77 | AddLibraryFolder | 0x16a14c18 | **`int32 (const char *path)`**. The path goes through the C-string writer at `0xda37c` (strlen, capped at 255). The reply is a 4-byte int |
| 78 | SetLibraryFolderLabel | 0x908b… | not called |
| 79 | GetLibraryFolderLabel | 0x6cb2… | not called |
| 80 | RemoveLibraryFolder | 0xbc0b4ad0 | **`int32 (int32 idx, bool, bool)`**. All three arguments are sent; each bool is 1 byte. The bools have no names in the binary and could mean "delete files" or "uninstall apps", so this spike only sent `false, false` |
| 83 | RefreshLibraryFolders | 0x553c… | not called |

The probe resolves both methods by their unique ID high half, as production does, and only calls
them when Remove sits exactly 3 slots after Add (`guard: true`).

## How to Run

```bash
cd .planning/spikes/094-steamclient-addlibraryfolder
clang -arch arm64 -Wno-unused-function -o /tmp/probe094 probe.c
clang -arch arm64 -Wno-unused-function -o /tmp/probe090 ../090-steamclient-moveapp/probe.c
/tmp/probe094 folders              # the production list (fails on a gap)
/tmp/probe094 rawfolders           # every slot, gaps included
/tmp/probe094 add "$HOME/SomeDir"  # AddLibraryFolder
/tmp/probe094 remove <idx>         # RemoveLibraryFolder(idx, false, false); refuses idx 0
/tmp/probe090 move 264160 <idx>    # MoveApp (spike 090)
/tmp/probe090 validate 264160      # StartValidatingApp (spike 091): the post-move nudge
```

This needs Mac Steam running and signed in. `run.log` holds every JSON line from the session;
`content_log.txt` is Steam's own log over the same period.

## Investigation Trail

Local times, 2026-11-22.

1. **Baseline.** Steam listed 2 folders (0 = `~/Library/Application Support/Steam`, 1 =
   `~/GameLibParity/SteamLibrary/steamapps`). WazHack (264160) was in folder 0, state 4.
   `libraryfolders-before.vdf` and `before.sha1` (171 files) were saved.
2. **`AddLibraryFolder("~/GameLibSpike094/Lib")` → 2** (07:48:21), on an empty folder.
   - The return value is the new folder's index.
   - Steam stored the path **exactly as given**, without appending `steamapps`.
   - It created `<path>/libraryfolder.vdf` and `<path>/steamapps/`.
   - It rewrote `libraryfolders.vdf` straight away, adding entry `"2"` with a fresh `contentid` and an empty `apps` block.
   - Content log: `Mounted library folder …`, `Loaded 0 apps…`, `Triggered async write … (3 libraries)`.
   - No GameLib-visible UI. The operator wasn't watching for a Steam window (see 9).
3. **Edge cases** (07:48:33):

   | Path | Result |
   |---|---|
   | The same path again | 2: idempotent, returns the existing index |
   | The same path with a trailing `/` | 2: normalized |
   | A path that doesn't exist | **-1**. Nothing logged and nothing created; Steam does not mkdir |
   | A relative path | **-1** |
   | A subfolder of an existing library (`Lib/steamapps/inside`) | **-1**, logged `Failed adding library folder … : subfolder of existing folder`. **It still left a `libraryfolder.vdf` and `steamapps/` inside that folder** |
   | A non-empty folder (`HasFiles` with `keep.txt`) | 3. Steam's stub was added next to the user's file, which was left alone |
   | A **parent** of an existing library (`~/GameLibSpike094`, which contains `Lib`) | **4: accepted.** Steam blocks nesting a new library inside an existing one, but not the reverse |

4. **`RemoveLibraryFolder(4, false, false)` → 0**: `Unmounted library folder … (0 apps)`, and
   `libraryfolders.vdf` was rewritten. **An immediate `RemoveLibraryFolder(3, false, false)` in the
   same second → 7**, logged `Install folder  not mounted.`, and nothing was removed. Called again
   on its own 30 s later → 0, removed. So 7 looks like a transient busy or failure, and 0 means
   OK. With `false, false`, the user's `keep.txt` and Steam's own stub (`libraryfolder.vdf`,
   `steamapps/`) were all left on disk.
5. **Removal leaves a gap in the in-memory list.**
   - After removing index 4, `GetNumLibraryFolders` still said 5, and `GetLibraryFolderPath(4)` returned 0 with an empty string. `libraryfolders.vdf` on disk had no gap.
   - Production `gl_ia_list_folders()` returns -1 as soon as one entry is empty or not a directory. So **after any library removal, `--steam-installapp --library` and `--steam-moveapp` would fail with `library-lookup-unverified` until the gap goes away** (probably at a Steam restart; untested).
   - Whether removing a library from Steam's own Storage UI leaves the same gap is untested; it probably calls the same method.
6. **Gaps are reused from the top.** With gaps at 3 and 4, `AddLibraryFolder(HasFiles)` → **4**,
   not 3. **The index must come from `AddLibraryFolder`'s return value, never from a list
   position.**
7. **`MoveApp(264160, 2)`, into the newly added library** (07:49:42).
   - `CanMoveApp` → 0, then `MoveApp` → 0. Progress read 1 (118,009,358 bytes), then 0. The game's folder changed 0 → 2 within a second.
   - `Finished moving install folder (118009358 bytes, 176 files)`.
   - All 171 files are byte-identical at `Lib/steamapps/common/WazHack` and the source folder is gone. The ACF and workshop content moved too.
8. **Unlike spike 090, Steam's post-move verify did NOT start on its own.**
   - The state stayed at **46** (`Update Required, Fully Installed, Update Queued, Files Missing`) for over 2 minutes. The scheduler had queued it as `Priority Auto Update`.
   - Steam was signed in (connection log: `Logged On`). Nothing else was downloading, and `AutoUpdateWindowEnabled` was 0.
   - **`StartValidatingApp(264160)` (spike 091) → 1, and the queue ran within a second.** `Verifying Installed`, `has no changes`, workshop verified, back to state 4 with StateFlags 4 in the ACF.
   - The move back to folder 0 later (16:36:31) verified on its own within 1 s, as in 090. So the stall is **intermittent**: 1 of 3 moves across 090 and 094. The trigger is unknown; it may be the first move into a freshly added library.
9. **Operator check:** WazHack **launched and played** from the new library. Steam → Settings →
   Storage **listed `~/GameLibSpike094/Lib` with WazHack in it**. The operator wasn't watching
   for a Steam window or toast during the adds, removes and moves.
10. **Cleanup.**
    - Moved WazHack back to folder 0 (byte-identical) and removed library 2 → 0. `libraryfolders.vdf` is **identical to the baseline**, and `~/GameLibSpike094` was deleted.
    - The running Steam still reports 5 folders, with gaps at 2–4, until it restarts.

## Results

**VALIDATED (macOS, n=1 game, same APFS volume).** `AddLibraryFolder(path)` makes a folder a
Steam library with no GameLib-visible UI, and returns its index. `MoveApp` into that index works,
and the game launches from there. Option 1 (free picker, then add, then move) is feasible.

**Signal for the build:**

- **Add:** `int32 AddLibraryFolder(const char *absPath)`.
  - Use the returned index as the move target. ≥0 is the index; -1 is a refusal (missing, relative, or nested inside an existing library).
  - Calling it on a path that's already a library is safe: it returns the existing index.
  - Guard the slot with its neighbours: Remove at Add + 3. If anything about the call shape doesn't match, refuse rather than call.
- **GameLib must refuse some folders itself**, before calling Add:
  - a parent of an existing library, which Steam accepts and so nests libraries;
  - a folder inside an existing library: Steam refuses it, but leaves stub files behind;
  - anything that isn't an existing absolute directory.

  Create the folder if the picker allows a new one; Steam won't create it.
- **The picked folder is the library root.** Games land in `<picked>/steamapps/common/<installdir>`,
  and Steam writes `libraryfolder.vdf` and `steamapps/` into the picked folder. The UI should say so.
- **Fix `gl_ia_list_folders()` for gaps.** Treat an empty path as a gap: skip it but keep each
  remaining folder's real index. A gap must not abort the lookup, or every `--library` install and
  move fails after any library removal until Steam restarts. This is a bug in shipped code, not
  just in the new code.
- **Post-move nudge.** If, after the move, the game is in the target folder with `Files Missing`
  set and no work running for a few seconds, call `StartValidatingApp` once. Then wait for state 4.
  The current 60 s `GL_IA_MOVE_SETTLE_FALLBACK_S` reports success while state 46 is still set. The
  game would be left as "Update Queued, Files Missing"; whether Play still works in that state is
  untested.
- **Don't build Remove into the product.** It isn't needed for Move, and the meaning of its two
  bools is unknown. Only `false, false` has been tested, and only on folders with no apps. If
  GameLib ever offers it, spike the bools first. A remove → 7 right after another remove means
  retry later.
- **Stale cache:** as in 090, GameLib's cached `install_path` must follow the move. Quick
  261122-9sl's `refreshInstallState` `pathStale` already covers that.

**Untested:** cross-volume or external-drive moves, a folder on a read-only or unmounted volume,
Steam signed out, a game running during the move, whether a Steam window appears, whether the gaps
clear on restart, and whether Steam's own Storage → Remove leaves the same gaps.
