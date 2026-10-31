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
