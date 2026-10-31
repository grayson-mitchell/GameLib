---
created: 2026-10-31
title: "Raft world save fails in the bottle: Unknown error (0x2a605360) on every save"
source: debug session raft-drm-build-id-mismatch (secondary observation a)
area: steam
files:
  - .planning/debug/resolved/raft-drm-build-id-mismatch.md
severity: medium
platform: macos
ready: code
---

## Problem

Raft (648800) in DRM mode on macOS fails every world save. Player.log shows
`Unknown error (0x2a605360) : '\\?\C:\users\crossover\AppData\LocalLow\Redbeet Interactive\Raft\User\User_<id>\World\<name>\2026.10.31-15.53-Latest'`.
Seen during the 58-09 live gate; multiplayer join itself works after the
GetAppBuildId fix, so this is separate. Not investigated: unknown whether it is
a bottle filesystem/path-length/`\\?\` prefix issue or a DRM-layer effect.

## Next step

Reproduce with a host launch, inspect the bottle path permissions and the
`\\?\` long-path handling, and compare against a non-DRM (bottled Steam) run.

## Resolution

2026-10-31: closed as an upstream Wine/Unity-Mono issue. No GameLib fix is warranted. Debug session: `.planning/debug/resolved/raft-save-unknown-error.md`.

The save does not fail. Each save writes a new `-Latest/<world>.rgd` of about 330 KB. The operator confirmed the world loads from the newest save. What fails is Raft's pruning of old saves (`SaveAndLoad.CheckSaveLimit` → `Directory.Delete(path, recursive)`). Unity's Mono deletes the folder's files, then reads a garbage `Marshal.GetLastWin32Error()` after the final `FindNextFile` instead of ERROR_NO_MORE_FILES (18). It throws `Unknown error (0x…)` and leaves the empty folder behind. Because the value is garbage, the code differs per session.

The DRM layer is not involved: it has no file-API hooks. Wine itself returns 18 correctly; a mingw probe in the bottle did so on 3 of 3 runs. The same symptom is reported without GameLib in Wine bug 60220 (Cities: Skylines II on macOS). The user impact is log noise, plus empty old save folders that accumulate past the save limit.
