---
created: 2026-09-27T00:00:00.000Z
title: "The depot aggregate log's classifier and \"first:\" fragment read a non-deterministic failures[0] when a run-level stall fires alongside per-file failures"
area: steam-depot
severity: minor
platform: any
ready: code
source: "quick/260927-tpm-tag-the-run-scoped-depot-stall-failure-s (D-C residual, deliberately not fixed there)"
files:
  - src/backend/storeManagers/steam/depot.ts
---

## Problem

`downloadSteamDepots`' error path classifies and describes a failed run from exactly one record:
`result.failures[0]`. `classifyDepotError(result.failures[0].cause ?? result.failures[0].error)`
decides the user-facing message and `errorAction`; `formatDownloadFailureSummary`'s `first:`
fragment (quick `260927-tpm`) reads the same record. Neither is new — `260927-tpm` only made the
existing `failures[0]` read visible in more places (the aggregate line now also prints the
run-level reason as its own fragment), it did not introduce the read.

`failures[0]`'s identity is **non-deterministic** whenever a run-level stall give-up fires
alongside one or more per-file failures, because array order there reflects real async completion
order across `FILE_CONCURRENCY` concurrent workers, not any semantic priority. Three orderings are
possible for the same underlying condition (a run that stalls after some files have already
failed):

- **Ordering A** — a file-level failure lands first, the run-level give-up is appended after.
  `failures[0]` is the file failure; `classifyDepotError` and `first:` both describe it. The
  run-level reason is visible only in the aggregate line's `; run:` fragment.
- **Ordering B** — the run-level give-up is recorded before any of the in-flight files' own
  catches run (their per-chunk retries had not yet thrown when the outer loop's `hasStalled()`
  check tripped). `failures[0]` is the run-level record; `classifyDepotError` and `first:` both
  describe the stall instead of the file failure that a user would more naturally want explained.
- **Ordering C** — a run-level-only failure (no per-file failure ever recorded — the coverage-gap
  case, a tracker already stalled at construction). `failures[0]` is necessarily the run-level
  record; there is nothing else it could be. This ordering is not ambiguous, only orderings A and B
  are.

The user-facing consequence: the SAME underlying condition (a run that both had a real per-file
failure and then stalled) can present two different classified messages and two different
`errorAction` affordances to the user, depending purely on which worker's catch happened to run
first — a race, not a decision.

`260927-tpm`'s aggregate LOG line now makes this visible in two ways it was not before: the file
count is correct (so a reader can see "1 file failure(s)" alongside a `; run:` fragment and notice
`first:` describes the run instead of the file), and the run-level reason is always printed as its
own fragment regardless of which record `first:` happens to land on — surfacing the mismatch
between what `first:` describes and what the `; run:` fragment separately reports, in cases where
they diverge (ordering A/B).

## Solution (not implemented here — scope declined in `260927-tpm`)

Prefer the run-level record deterministically when both exist, since it is the more actionable
diagnosis (the run gave up; a single upstream file failure is usually a symptom, not the cause a
user should be told to retry against). Concretely: `classifyDepotError` and `first:` would both
read `failures.find((f) => f.scope === 'run') ?? failures[0]` instead of unconditionally
`failures[0]`.

**Cost, and why this was out of scope for `260927-tpm`:** this changes case B's outcome not at all
(it already reads the run-level record) but changes ordering A's outcome — a run that currently
classifies and reports the FILE failure (because it happened to land at `failures[0]` first) would,
under the fix, always classify and report the RUN-level stall instead. That is a genuine
user-facing message change for an ordering that occurs today, not a pure bugfix — it needs its own
decision record and test coverage for both orderings, which `260927-tpm`'s scope (one aggregate log
line) did not extend to.
