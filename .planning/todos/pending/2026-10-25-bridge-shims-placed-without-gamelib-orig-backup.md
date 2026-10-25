---
created: 2026-10-25
title: "Bridge shims placed before backups existed have no .gamelib-orig, so their interface pins and withhold path depend on stale persisted data"
source: 261025-t7i research and live check
area: steam-bridge
files:
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/depot.ts
severity: medium
platform: macos
ready: human
---

The 261025-t7i research found 15 placed shims across 12 bridge bottles that have no `.gamelib-orig`
backup of the game's original `steam_api*.dll`. Their originals were overwritten before backups
existed. For those titles:
- **The original's interface version strings cannot be read again.** Placement falls back to the
  persisted verdict's `interfaceVersions`, which may be `{}` or out of date. For 284100 that is
  exactly what left `gamelib_bridge.cfg` with no `iface.` pins.
- **The withhold/restore path has nothing to restore.**

284100 was fixed by hand on 2026-10-25 with the operator's help. The operator ran
`download_depot 284100 284101 3159369609451446961` in the Mac Steam console; it fetches the Windows
depot fine. The two originals were then copied over the shims, and the next placement created
`.gamelib-orig` itself.

Needs a decision, which is why `ready` is `human`:
1. Restoring originals on the other 11 bottles changes how already-verified titles are scanned and
   placed. A fresh scan of a restored original could change pins, coverage or the class. So restore
   all of them, or only titles that fail?
2. Mechanism:
   - **Option A:** a GameLib depot single-file restore. Use a filtered `buildDepotPlan` +
     `downloadDepotFiles`; the reconciler already re-downloads files whose size doesn't match. This
     also gives `SteamGame.repair()` a real body. Today `repair()` is a stub (games.ts ~3357), and
     the "Verify integrity" hint in `shimGenerate.ts` ~628 points at nothing.
   - **Option B:** document the Mac Steam console route as the operator procedure.
3. Clearing the stale persisted verdict when an original reappears. A 284100 relaunch with
   `already-placed` would otherwise reuse the persisted `{}`.

Done-when: every placed bridge shim has a `.gamelib-orig`, or a recorded reason why not, and
`repair()` either restores originals or is explicitly out of scope.
