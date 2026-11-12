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
