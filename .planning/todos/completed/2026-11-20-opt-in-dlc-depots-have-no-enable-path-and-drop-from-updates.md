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
resolved: 2026-11-20
resolution: "fixed by quick 261120-tbr: buildDepotRefs treats installed opt-in DLC depots as enabled (update delta, verify, update estimate); the enable path moved to 2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog.md"
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

## Resolution (2026-11-20, quick 261120-tbr)

**The fix.** `select.ts` gained `optInDlcOfInstalledDepots(appinfo, dlcInfos, installedDepotIds)`,
which maps each installed depot id through its PICS `config.optionaldlc` to a DLC appId.
`buildDepotRefs` (`plan.ts`) unions the update delta's `oldGidByDepot` keys with a new
`DownloadSteamDepotsOpts.installedDepotIds` and passes the result as `enabledOptInDlc` to
`selectAllDepots` (one ids-only log line when non-empty). `verify.ts` and the update estimate
(`updateEstimate.ts`) supply `installedDepotIds` from the ACF's installed depots. An installed
opt-in depot therefore stays in the plan, is retained as `selected`, stays in the attempted set and
so stays in the ACF `InstalledDepots`.

**Fresh installs still skip opt-in DLC.** With no delta and no `installedDepotIds`, nothing is passed
as `enabledOptInDlc`, and Steam's unticked default holds. An installed set holding only depots
without `config.optionaldlc` enables nothing.

**Correction to the verify claim above.** `verify.ts` (quick 261120-p2j) already pinned every ACF
installed depot, so the opt-in depot never left the verify job. After 261120-st3 the plan skipped
it, so its key came from the fallback with owner `dlcappid` (313250 instead of the base app 570).
Whether Steam issues the 381450 key under 313250 was not tested. The fix restores the base-app
owner, because the plan selects the depot again.

**No Rust change.** `gamelib-depot/src/acf.rs` needed none: once `buildDepotRefs` selects the depot it
is in the job and in the attempted set. Commits: `38ade8ea5` (select, plan, planModel and tests) and
`d566c2770` (verify and update estimate).

The enable path (an install-dialog tick, add-to-existing-install, untick) is filed as
`2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog.md`.
