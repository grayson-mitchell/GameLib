---
created: 2026-09-25T21:53:43.000Z
title: "The run-scoped stall failure is counted alongside per-file failures, so the aggregate log reports N+1 for N failed files"
area: steam-depot
severity: minor
platform: any
ready: code
source: "debug/depot-stall-bound-did-not-fire, 2026-09-26 — named there as 'residual, named not fixed' under finding W-2"
files:
  - src/backend/storeManagers/steam/depot.ts
---

## Problem

Second residual from `.planning/debug/resolved/depot-stall-bound-did-not-fire.md`, named there
under finding W-2 and, like its sibling, tracked nowhere until now.

`62f916e58` made `downloadDepotFiles`' file-worker loop record a **run-level** failure when
`stallTracker.hasStalled()` trips, so the run stops taking new jobs with an honest reason instead
of grinding through its queue. That record is pushed into the same `failures` array as the
per-file ones, and `result.failures.length` counts it — so `downloadSteamDepots`' aggregate error
line reports **N+1 for N failed files**.

The consequence is a miscount in a diagnostic log, not a behavioural defect: the run still stops,
with the right reason, naming how many files were abandoned. This repo has been burned repeatedly
by trusting a counted population, though, and this is one more counter that does not mean what its
name says.

## Solution

Not simply "stop counting it" — **the run-level record IS a real failure and belongs in the
list.** The debug session was explicit that separating run-level from file-level failures is a
shape change, and declined it on those grounds rather than leaving it unexamined.

So the work is to decide the shape first: either tag the run-level record so consumers can
partition it (the lighter option, and consistent with how `.eresult` / `.code` / `isStallError`
are already used as property markers on this path), or split the array. Then correct the aggregate
line to report the file count it claims to report.

Check every reader of `failures` / `failures.length` before changing the shape — the census in the
closed sibling todo found seven `failures.length` sites in `depot.ts` alone (`:1228 :2596 :2602
:2673 :2711 :2746 :3229`), of which `2596`/`2602` are a `FAILURE_LOG_CAP=10` logging cap and the
rest are post-loop verdicts. That census predates this change and should be re-run, not reused.
