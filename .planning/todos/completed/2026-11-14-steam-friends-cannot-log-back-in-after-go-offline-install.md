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

## Resolution (2026-11-17)

Closed without a code change: Phase 79 removed the cause. The go-offline wrap
(`macSteamOffline.ts`, `macSteamOfflineOwedFile.ts`) was deleted (`ad5a128ad`) after
79-WRAP-RETEST returned `verdict: PASS`: an unwrapped authenticated logon leaves Mac Steam's
Friends signed in. Nothing in `src/` or `src-tauri/` issues `steam://open/gooffline` now. The
only code left is the owed-record restore in `gamelib-steamcm` `wrap.rs`, which sends
`goonline` to pay a record that an older build left behind.

Live evidence (79-UAT item 23, `e9fa6f180`): with Mac Steam running, ADOM (333300) installed
through the Rust CM path (`CM logon mode=authenticated reason=user-install`,
`[depot-rust] ... status=completed`). Friends stayed online, and Steam adopted the game via
InstallApp without a restart, so Steam did not have to be closed. Items 13, 21, 24 and 25
recorded Friends staying online across Refresh, sign-in and quit.
