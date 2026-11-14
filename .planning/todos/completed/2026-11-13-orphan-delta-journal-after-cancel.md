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

## Resolution

Fixed in quick task 261114-lat: test commit c35dc9bcc, fix commit 5833fc56f.

Rule: the abort branch of `delta_body` removes the commit journal when this run wrote it and was
not itself a commit-resume. No rename has happened at that point, so the journal describes
nothing. A cancel-then-retry of the same build is now a plain Chunk delta that reuses the paused
run's verified temps (WR-03), and a newer build no longer hits the Stale file fallback. A cancelled
commit-resume keeps its journal.

Rejected: re-keying resume on the target build. The journal is already target-keyed
(`Journal::matches` compares new and old gids), and a journal for a different build can be a
genuine mid-commit kill with a mixed tree, which only a file reconcile handles safely.

Back-compat: the journal format is unchanged. An orphan already on a user's disk is still treated
conservatively (one resume hash pass for the same build, or one fallback for another build) and
the run then removes it.

Test seam: feature `test-hooks` (`gamelib_depot::test_hooks::cancel_after_journal_write`), enabled
only through the crate's self dev-dependency. Coverage: `delta_resume.rs`
`orphan_journal_removed_and_same_build_runs_as_chunk`,
`orphan_journal_does_not_force_fallback_for_newer_build`, `cancelled_commit_resume_keeps_journal`.

Not live-verified.
