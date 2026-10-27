---
created: 2026-10-26
title: "SteamStub-wrapped bridge titles (Grim Dawn) still fail the DRM launch check; also decide never-withhold for DRM titles and skipping first-launch redists on bottles that already ran"
source: 261026-lif and 261026-mhg live relaunches
area: steam-bridge
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
severity: medium
platform: macos
ready: live-gate
---

## 1. Grim Dawn (219990) fails on the SteamStub launch check

After 261026-mhg the route is consistent on every launch: the shim is placed (non-core gaps only),
the steamstub forwarder is placed at `Grim Dawn\x64\steamclient64.dll`, the helper logs HELLO and
`FWD CreateInterface ver=SteamClient017 / SteamClient014 native=present`, the window is raised, and
the game still quits (42s on 2026-10-26 16:35:37-16:36:19; 12s at 15:54). GameLib itself logs
`[bridge-notice] reason=steamstub-forwarded:launch-check-unsatisfiable`: SteamStub's own launch
check wants a running Windows Steam the bridge bottle does not have. Raft (648800) carries the same
`.bind` section and the same notice.

Not a regression from 261026-lif/mhg; it predates both. Per the standing direction, rerouting to
bottled Steam is **not** the fix (bottled Steam is a narrow fallback to be eliminated; DRM is the
only case that may justify it, and that is a decision, not a default). Investigate what SteamStub's
check actually probes (the forwarder already answers CreateInterface) and whether it can be
satisfied in-bottle.

## 2. Never withhold the shim for a DRM-wrapped title

261026-mhg research: withholding the shim cannot work for a SteamStub title in a bottle with no
Windows Steam (the 2026-10-26 15:58 Grim Dawn launch was withheld and died after 2s). 261026-mhg
made all of Grim Dawn's gaps non-core so it is placed today, but a DRM title with a *blocking* gap
would still be withheld into a guaranteed failure. Deliberately excluded from 261026-mhg (it has a
grep gate against a drmWrapper rule in shimGenerate.ts); decide it here.

## 3. First-launch shared redists on bottles that already ran

261025-rkj replicates Steam's first-launch "Installing..." step (VC++/DirectX per appinfo). On
2026-10-26 it ran once each for Rogue Waters, Grim Dawn, The Age of Decadence, ELEX and Raft
(about 1.5-3 min per bottle), all of which had launched fine before without them. Option: skip it
for a bottle where the title has already launched successfully, so only fresh installs get it. Keep
Steam parity for new installs.

Done-when: Grim Dawn either launches through the bridge or has a recorded reason it cannot, and
items 2 and 3 each have a recorded decision (implemented or explicitly declined).

## Resolution

Closed 2026-10-27 by operator decision. Each item has a recorded outcome.

- **1. Grim Dawn: recorded reason, follow-up is Phase 56.** The investigation this item asked for
  is already done in spikes 040, 041 and 044. SteamStub 3.1 on Grim Dawn and Raft arms module
  verification, and the stub checks that the file in `ActiveProcess\SteamClientDll64` is Valve's
  signed client. GameLib's forwarder fails it (`Application load error 3:0000065432`, 041 a1),
  however well it answers `CreateInterface`. The user's genuine `steamclient64.dll` passes the file
  check, then looks for `Steam3Master_SharedMemLock` and falls back to `steam://run` (041 b1). No
  change to the forwarder can satisfy this in-bottle. Spike 044 got Grim Dawn to its menu with a
  genuine CDN-fetched client trampolined to `lsteamclient` under NotProton, which is 043's adoption
  option 2. The user ruled it in bounds on 2026-10-27. Phase 56 (*Bridge steamclient-layer DRM mode
  for SteamStub titles*) builds it. Raft and Ranch Simulator are targets there too.
- **2. Never-withhold for DRM titles: declined.** A SteamStub title fails today whether the shim is
  placed or withheld. Placed, it fails the file check above; withheld, it finds no Windows Steam
  (the 15:58 run). Never-withhold would swap one failure for another. Under Phase 56's mode the
  game's own `steam_api` runs behind the genuine client with no GameLib shim at all, so forcing
  placement for DRM titles points the wrong way. `shimGenerate.ts` is unchanged, and 261026-mhg's
  grep gate against a drmWrapper withhold rule stays.
- **3. Skipping first-launch redists on bottles that already ran: declined.** The redist step is
  gated by the per-bottle ledger `gamelib-shared-redists.json` and never re-runs once settled, so the
  cost is once per bottle. On 2026-10-27, 13 of the 15 `GameLibSteamBridge-*` bottles on the dev
  machine had a settled ledger; only 1119730 and 648410 had none. GameLib also has no reliable
  "launched successfully before" signal to gate a skip on. Steam parity is kept for every bottle.
