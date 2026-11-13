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

## Resolution

Fixed by quick task 261114-gki (`a4f46948d` tests, `51f47623d` fix). Pausing a delta update (a
cancel before the commit) now keeps every temp that already passed its whole-file SHA-1 and deletes
the partial ones. The kept temps are recorded in `{steamapps}/gamelib-delta/{appId}.temps.json`,
which also carries the target build as `newGids` (depotId to manifest GID).

Reuse rule: the next run of the same target build re-hashes each kept temp against the NEW
manifest and reuses it only when its size and SHA-1 both match; a temp that fails either is
deleted and rebuilt. Reused files are left out of the CDN plan, so none of their chunks is
requested.

Cleanup rules: an error deletes every temp (reused ones included) and the ledger. A different
target build, or a missing, unreadable or malformed ledger, starts clean. A delta run that falls
back to a file-level install (stale journal, old manifest unavailable) deletes the kept temps and
the ledger first. The ledger is removed just before the commit; the journal governs after that.

How a resume shows: the log carries "resuming paused update: reusing N verified files (M bytes)"
(a `warning` event), and the progress counters start at the reused bytes and files (`doneBytes`,
`filesDone` seeded). Net bytes count only the fresh transfer. A pause logs "update paused: kept N
verified files (M bytes) for resume".

Not yet live-verified: the operator has NOT run a pause and resume on a real bridge update.
Coverage so far is the crate integration tests (`delta_resume.rs`, `delta.rs`).
