---
created: 2026-11-13T00:00:00.000Z
title: 'Keep SHA-verified temps when a bridge update is paused so resume does not re-download'
area: steam
severity: medium
platform: any
ready: code
source: '.planning/phases/74-steam-game-updates/74-REVIEW.md WR-03 and 74-UAT.md item 6a (deferred by the 74 gap-closure scope, 2026-11-13)'
files:
  - src-tauri/crates/gamelib-depot/src/delta.rs:1273-1287
  - src-tauri/crates/gamelib-depot/src/delta.rs:1527-1535
---

## Problem

Temps are deleted at the start of every delta run and on any cancel or failure before commit.
Pause maps to cancel, so every built and SHA-verified temp is thrown away and resume
re-downloads the whole delta. UAT 6a measured it: 70 MB lost on a 101 MB delta, and about
916 MiB lost on Manor Lords.

## Fix direction

On cancel, keep temps that passed the whole-file SHA. On resume, reuse a temp whose size matches
and whose re-hash matches. Delete temps only on error or when the target build changes.

## Done when

Pausing a bridge update part-way and resuming it transfers only the bytes not already built
into verified temps (observable in the progress counters and the log), and a changed target
build still starts clean.
