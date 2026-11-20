---
created: 2026-11-20
title: "Opt-in DLC depots have no enable path and drop from updates (config.optionaldlc filter, quick 261120-st3)"
source: quick 261120-st3
area: steam-depot-download
files:
  - src/backend/storeManagers/steam/depot/select.ts
  - src/backend/storeManagers/steam/depot/plan.ts
  - src/backend/storeManagers/steam/depotRust/retire.ts
  - src-tauri/crates/gamelib-depot/src/acf.rs
severity: medium
platform: any
ready: code
---

Quick 261120-st3 made `selectAllDepots` skip `config.optionaldlc` depots of opt-in DLC (the DLC
app's `extended.optionaldlc` is "1") unless the caller passes `DepotSelectOpts.enabledOptInDlc`.
`buildDepotRefs` in `plan.ts` does not pass it, so two gaps remain.

- **No enable path.** No caller supplies `enabledOptInDlc`, so no GameLib path installs opt-in DLC
  (e.g. Dota 2 Workshop Tools 313250, depot 381450). The user has to use Steam for it.
- **Installed opt-in depots drop from updates.** An existing install whose ACF `InstalledDepots`
  already holds an opt-in DLC depot (Steam-ticked and then adopted, or a Windows native install
  GameLib made before 261120-st3) now loses it on update. `decideRetirement`
  (`depotRust/retire.ts`) keeps its files as `still-on-branch`. The Rust finalize writes
  `InstalledDepots` from attempted depots only (`gamelib-depot/src/acf.rs`, the `attempted` map near
  line 195). So the depot drops out of the ACF and stops being updated, and Steam may re-download it
  or leave the files orphaned. `verify.ts` also calls `buildDepotRefs`, so verify has the same
  effect.

**Proposed fix.** Treat an installed opt-in depot as enabled. In `buildDepotRefs`, map each
installed depot (`opts.delta?.oldGidByDepot` keys on update, the ACF `InstalledDepots` for verify)
through its `config.optionaldlc` to a DLC appId and pass the set as `enabledOptInDlc`. A tick in the
install dialog is a separate UX decision, out of this todo's scope.

**Unverified lead.** Steam may record a user's enabled opt-in DLC in the appmanifest's
`UserConfig`/`MountedConfig` `optionaldlc` key. None of the 24 ACFs in the operator's Mac Steam
library carried it on 2026-11-20, so this is unconfirmed.

**Scope.** Arms for `os: 'windows'` (Windows native installs and the bottle path). macOS native Dota
2 installs never selected these windows-only depots.
