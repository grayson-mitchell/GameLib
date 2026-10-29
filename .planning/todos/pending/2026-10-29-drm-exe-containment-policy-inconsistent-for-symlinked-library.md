---
created: 2026-10-29
title: "DRM exe containment checks the Shipping exe but not the bootstrap, and rejects a symlinked steamapps/common library"
area: steam-bridge
severity: medium
platform: any
ready: human
source: "phase 56 code review round 3 (56-REVIEW.md WR-03; CR-01 half closed), 2026-10-29"
files:
  - src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts
  - src/backend/storeManagers/steam/bridge/drm/__tests__/drmScanExe.test.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
---

## Problem

56-29 made `detectLaunchDrmWrapper` symlink-safe for a symlinked Bottles directory. It realpaths the bottle root and each Shipping candidate, and rejects any candidate whose real path lies outside the bottle (`drmScanExe.ts:38-43`, `:50-70`). When `drive_c/.../steamapps/common` (or any ancestor of the game folder) is a symlink to another volume, the Shipping exe's real path falls outside the bottle. It is then skipped as `escapes bottle`, and the resolver returns `own` (`'none'` for a UE bootstrap). The title goes to the TCP bridge stamped `drmWrapper: none`, so DRM routing is lost for UE SteamStub titles in that library layout. `findUnrealLayout` lets the layout through, because its `isRealDir` checks start below `ueRoot`.

The policy is also inconsistent. `detect(exePath)` at line 40 reads the bootstrap exe in the same symlinked folder with no containment check, contradicting `detectDrmWrapper`'s documented precondition (`shimGenerate.ts:503-505`). Either out-of-bottle bytes may be read or they may not; today the bootstrap's are read and the Shipping exe's are refused.

Not hit live: Grim Dawn is not UE, and Raft and Ranch routed correctly in the 56-34 gate.

## Decision needed

Pick one policy and apply it to both exes:

- **Strict:** reject out-of-bottle reads. Realpath-check `exePath` against the bottle root before `detect(exePath)` too, and surface a user-visible diagnostic when either check fails, not only a log line.
- **Library-aware:** accept a symlinked library the user set up. Realpath `dirname(exePath)` once to get `ueRootReal`, and require each candidate's real path to be inside the game's own folder rather than the bottle root. Keep returning the lexical `resolve(candidate)` so `stageDrmBottle`'s `drive_c` check still passes.

Once decided, this is desk work: `ready: code`, with tests for both a symlinked Bottles dir and a symlinked `steamapps/common`.
