---
created: 2026-11-05T22:25:00.000Z
title: "steam://install and steam://uninstall are silently dropped by a signed-out Steam; GameLib sticks on Installing/Uninstalling"
area: steam-install
files:
  - src/backend/storeManagers/steam/games.ts (uninstall delegation via steam://uninstall)
  - src/backend/storeManagers/steam/library.ts (startUninstallPolling ~3957, pollUninstallOnce, MAX_TICKS 2213)
severity: medium
platform: macos
ready: live-gate
---

## Problem

Found by the operator during the 261105-ord live gate (2026-11-05, appId 112100,
Mac Steam pid 10645 at its sign-in screen):

- 22:18:13: `SteamGame: delegating uninstall for appId 112100 via
  steam://uninstall/112100`, then `starting uninstall polling`.
- Signed-out Steam silently dropped the request. There was no dialog and
  nothing was removed, but GameLib stayed on **Uninstalling**.
- 22:18:58: the operator signed in and uninstalled by hand in Steam. Steam's
  content_log shows `finished uninstall (No Error)`.
- 22:19:01: the GameLib poll saw the manifest gone and flipped to
  not-installed. That recovery is correct.

Without that manual step, the uninstall poll runs until its safety cap,
`MAX_TICKS = 7200` (about 6 h at 3 s), and keeps showing Uninstalling. The
grace logic for "a plain installed manifest means uninstall hasn't started or
was cancelled" did not revert the status within the ~48 s observed.

This is not specific to the InstallApp setting. **Confirmed for install too**
(gate item 6b, 22:25:29): with downloader OFF and Steam signed out, InstallApp
reported `not-signed-in` and GameLib fell back to `steam://install/112100` with
an install poll (`delegatedToSteamClient true`). Steam only raised its sign-in
window. After sign-in it queued nothing, and GameLib stayed on **Installing**.
As with uninstall, the user can recover only by doing the action by hand in
Steam (the poll would then see the manifest), by cancelling in GameLib, or by
waiting out the cap. Nothing tells them which. In practice, cancelling did not
clear it: the operator had to restart GameLib to get rid of the stuck
Installing state (2026-11-05, after 6b).

## Solution (to decide)

- **Before delegating:** detect a signed-out Steam and either tell the user
  to sign in to Steam, or use GameLib's direct removal. Direct removal already
  exists for never-adopted installs; see the 22:16:08 log line `removing it
  directly instead of steam://uninstall`.
- **After delegating:** if no uninstall activity appears within a short window
  (StateFlags 0x800, or the manifest changes), stop the poll and restore the
  Installed status with a notice, instead of waiting up to 6 h.
- **Reliable sign-in detection** is the shared dependency. The bridge helper's
  `not-signed-in` check does not fire at the sign-in screen (261105-ord gate
  item 6). See
  `.planning/todos/pending/2026-11-05-steam-restart-hold-brittle-discuss.md`.

## Fix landed, live check pending (quick 261105-vfq, 2026-11-05)

`a171c7a02`, `c4c6d434f`. Delegated install and uninstall polls now give up
after 40 ticks (~2 min) with no Steam activity. A dropped install reverts to
Not installed and a dropped uninstall stays Installed; each shows a "make sure
Steam is signed in" notice. Downloads > Managed by Steam > Cancel stops a
delegated install poll at once. No sign-in pre-check, by decision (see
261105-vfq CONTEXT.md). Close this todo after a live run on a signed-out Mac
Steam:
- steam://install reverts with the notice after ~2 min.
- steam://uninstall stays Installed with the notice after ~2 min.
- Cancel clears a stuck delegated install immediately.
