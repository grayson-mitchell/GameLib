---
created: 2026-11-20
title: "Opt-in DLC has no enable path in the install dialog (follow-up to quick 261120-tbr)"
source: quick 261120-tbr
area: steam-depot-download
files:
  - src/frontend/screens/Library/components/InstallModal/index.tsx
  - src/backend/storeManagers/steam/depot/select.ts
  - src/backend/storeManagers/steam/depot/plan.ts
  - src/backend/storeManagers/steam/depot/planModel.ts
severity: minor
platform: any
ready: human
resolved: 2026-11-22
resolution: quick 261122-rgi
---

After quick 261120-tbr an installed opt-in DLC stays enabled: `buildDepotRefs` maps the installed
depots through `config.optionaldlc` and passes the DLCs as `enabledOptInDlc`, so updates, verify and
the update estimate keep them. But no GameLib path enables an opt-in DLC that is not installed yet
(e.g. Dota 2 Workshop Tools 313250, depot 381450, 5.9 GB). The workaround is to tick it in Steam;
GameLib then keeps it.

**What a fix needs.**

- A tick for owned opt-in DLC in the install dialog.
- An add-to-existing-install path, so a user can enable a DLC after the base game is installed.
- An untick path. `decideRetirement` keeps still-on-branch depots today, so a disabled DLC's depots
  would never be removed.

**Where to persist the choice.** Carry over the unverified lead that Steam may record an enabled
opt-in DLC in the appmanifest's `UserConfig`/`MountedConfig` `optionaldlc` key. None of the 24 ACFs
in the operator's Mac Steam library carried it on 2026-11-20, so this is unconfirmed.

`ready: human` because the install-dialog tick is a UX decision, not only code.

## Resolution

Closed by quick 261122-rgi (operator decisions D-01..D-06 in its CONTEXT).

- **Install dialog (D-01).** On a GameLib depot install route (native installs on, or a bottle/bridge
  route) the Steam install dialog lists an "Optional content" group, one unticked tick per owned
  opt-in DLC with name and size. Ticked ids ride the install as `steamOptInDlc` and reach
  `buildDepotRefs` as `chosenOptInDlc`, which replaces the installed-derived enabled set. With nothing
  ticked the selection is byte-identical to before. Commits: `3d4340bc0` (pipeline and the
  `getSteamOptInDlc` listing; swept into another session's docs commit by a shared index),
  `315beaacc` (dialog ticks).
- **Install tab (D-01, D-02).** `OptInDlcRows` adds an "Optional content" switch row per owned opt-in
  DLC. Switching on queues a bridge delta update that downloads the DLC's depots into the existing
  install; switching off queues one that deletes them and drops them from the ACF, because
  `decideRetirement` now takes `disabledOptInDepots` and retires them even though they are still on
  the branch. Commit `93e6d145e`.
- **Steam-registered and bottled-Steam copies (D-04).** Their rows are read-only, with a reason
  pointing at Steam, because Phase 74 keeps GameLib's delta updater on bridge installs only.
- **Ownership (D-05).** Ownership needs the licence list, so it is unknown (`null`) unless a
  signed-in session is already open; listing never opens one. Unknown ownership is still shown. The
  depot ownership gate stops an unowned DLC from downloading, and the Install-tab row then reports the
  failure inline.
- **Persistence (D-03).** Installed depots are the only record of "enabled". No store, setting or ACF
  key was added; the unconfirmed `UserConfig`/`MountedConfig` `optionaldlc` lead above was not used.
