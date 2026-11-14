---
created: 2026-11-13T00:00:00.000Z
title: 'Call ManifestStore::prune from production so the manifest cache stops growing'
area: steam
severity: minor
platform: any
ready: code
source: '.planning/phases/74-steam-game-updates/74-REVIEW.md IN-01 (deferred by the 74 gap-closure scope, 2026-11-13)'
files:
  - src-tauri/crates/gamelib-depot/src/manifest.rs:529
---

## Problem

`ManifestStore::prune(protected)` has no production caller. The installed-GID protection is
dead code and the manifest cache grows unbounded.

## Fix direction

Call prune after a successful install or update, passing the installed GIDs as the protected
set.

## Done when

After several updates of one game the cache holds only the installed manifests (plus any
protected ones), checked by a test or by listing the cache directory.

## Resolution

Fixed in quick task 261114-lsl.

Rule: `download::run_install` prunes the manifest cache of every job depot after a Completed
install or update that wrote its ACF (`manifest::prune_after_install`, on the blocking pool).
Cancelled, errored, verify_only, select_files and no-finalize jobs never prune.

Protected set: every InstalledDepots GID in every appmanifest across the steamapps dirs GameLib
has finalized into (registry `<cache>/steamapps-dirs.json`, missing dirs dropped). It fails
closed: if any ACF there is unreadable nothing is deleted and a warning is logged. A prune
failure never changes the job outcome.

Bound: the installed GID(s) plus one newest other per depot (prune's KEEP_GIDS slot, unchanged),
so after several updates the older builds are gone.

Known gaps: a library GameLib never finalized into is not consulted (cost if it bit: one
manifest refetch, or the D-14 file fallback), and retired depots' dirs are not pruned.

Coverage: `tests/manifest.rs` `prune_after_install_several_updates`,
`prune_after_install_protects_other_apps_gids`, `prune_after_install_skips_on_unreadable_acf`,
`prune_after_install_drops_missing_dirs`; `tests/delta.rs` `delta_prunes_superseded_manifests`,
`delta_prune_failure_keeps_completed_outcome`.

Not live-verified.
