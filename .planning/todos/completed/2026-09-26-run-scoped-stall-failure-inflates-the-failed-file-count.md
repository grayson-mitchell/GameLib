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
closed sibling todo found seven `failures.length` sites in `depot.ts` alone. That census is stale;
see `260927-tpm-PLAN.md`'s `<census>` section (`.planning/quick/260927-tpm-tag-the-run-scoped-depot-stall-failure-s/260927-tpm-PLAN.md`)
for the freshly-measured, authoritative line-number map — do not re-derive it from this paragraph.

## Resolution

Closed by quick task `260927-tpm`, commit `fe0e8d199`.

**Shape chosen: the lighter option — a property marker, not an array split.** `DepotDownloadFailure`
gained an optional `scope?: 'run'` field, set only at the run-level push site. This is the exact
`.eresult`/`.code`/`isStall` property-marker discipline already used on this path
(`installStallWatchdog.ts`), not a new convention.

**The run-level record deliberately STAYS in the unfiltered `failures` array.** Every completeness
gate that reads it — `canWriteFullOwnership` (`depot.ts:1264`), the `allModesApplied` verdict
(`:2868`), the `runLooksComplete` verdict (`:2906`), the `allFilesVerifiedThisRun` field, and the
error-path entry gate (`if (result.failures.length)`, `:3424`) — is byte-for-byte unchanged and
still fails closed on a run-level-only failure exactly as it did before this fix. Verified by diff
against HEAD and by a new regression-guard unit test (A7) asserting a run-scoped-only failure
still makes `canWriteFullOwnership` return `false`.

**The corrected aggregate line has three parts**, produced by a new exported
`formatDownloadFailureSummary(appId, failures, classificationKey)`:
1. the FILE-level failure count only (`failures.filter((f) => f.scope !== 'run').length`) — this is
   the actual fix, N failed files now logs as N, never N+1;
2. `first: file="..."` — unchanged, still `failures[0]` verbatim (see the D-C residual below, not
   re-derived from the file-only partition);
3. a distinct trailing `; run: <message>` fragment when a run-level record is present, so the run
   reason stays visible even though it no longer inflates the count.

**Two residuals named, not closed:**
- The `FAILURE_LOG_CAP` off-by-one (D-D): the cap comparison (`failures.length <= FAILURE_LOG_CAP`)
  still reads the unfiltered array, so a run that both hits the cap AND later stalls can be off by
  one against the per-file total the corrected comment now describes. Three reasons it was left
  open: (1) it is a logging-cap edge case, not the aggregate line this task was scoped to fix; (2) a
  correct fix has to decide whether the cap itself should partition by scope, which is a small but
  separate behavioural decision; (3) fixing it would touch the per-file catch's log-suppression
  logic, widening this task's diff beyond the one aggregate line it set out to correct.
- The `failures[0]` ordering non-determinism feeding `classifyDepotError` (D-C): tracked by the new
  todo `2026-09-27-the-depot-aggregate-classifier-reads-a-non-deterministic-failures-0.md`.
