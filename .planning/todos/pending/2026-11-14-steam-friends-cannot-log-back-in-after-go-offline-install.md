---
created: 2026-11-14T00:00:00.000Z
title: 'Mac Steam Friends cannot be logged back in after a go-offline install'
area: steam
severity: major
platform: macos
ready: live-gate
source: '.planning/phases/70-split-gameinfo-into-shared-and-per-store-shapes/70-UAT.md item 3 (D-16 live gate, 2026-11-14)'
files:
  - src/backend/storeManagers/steam/macSteamOffline.ts
  - src/backend/storeVersioning/macSteamOfflineOwedFile.ts
---

## Problem

During the phase-70 live gate, starting a Steam install made GameLib set the running Mac Steam
client offline (the go-offline wrap). Steam Friends was left logged out, which is expected. The
operator then could not log Steam Friends back in, and had to close Steam for the install to
proceed. Being signed out is fine; being unable to sign back in is the defect.

Phase 70 did not touch the go-offline wrap (`macSteamOffline.ts`, `macSteamOfflineOwedFile.ts`,
`steamProcesses.ts` have no phase-70 commits since 7ab23fe27), and no IPC_INVALID_ARGS or schema
error appears in the logs that survive, so this is filed as pre-existing Steam-client integration
behaviour. The gate session's own sidecar log had already rotated, so the Steam-side evidence is
the operator's report only.

## Next

Reproduce on a profile with Mac Steam running and signed in: start a Steam install, then try to
sign Friends back in. Check the owed-goonline record and whether `steam://open/goonline` is
issued/owed at the right time. Decide whether the install should proceed without needing Steam
closed.
