---
created: 2026-11-13T00:00:00.000Z
title: 'Remove the orphan delta journal when a run is cancelled after the journal write'
area: steam
severity: minor
platform: any
ready: code
source: '.planning/phases/74-steam-game-updates/74-REVIEW.md IN-02 (deferred by the 74 gap-closure scope, 2026-11-13)'
files:
  - src-tauri/crates/gamelib-depot/src/delta.rs:1509-1527
---

## Problem

A cancel after the journal write leaves an orphan journal. On a fresh run, the next run treats
the orphan as a resume and hashes every file. If the next run targets a newer build, it forces
the whole-install fallback.

## Fix direction

Delete the journal on cancel when no resumable state was kept, or key resume on the target
build so a journal for another build is discarded rather than forcing the fallback. Coordinate
with the WR-03 todo (verified temps kept on pause), since that one makes some journals
intentionally resumable.

## Done when

A cancel followed by a fresh run, and a cancel followed by a run for a newer build, neither
hashes every file nor falls back to a whole-install reconcile.
