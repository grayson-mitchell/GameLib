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
