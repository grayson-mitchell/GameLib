---
quick_id: 260921-kpd
date: 2026-09-21
status: complete
description: "Backfill 16 missing rows into STATE.md's Quick Tasks Completed ledger from each directory's own SUMMARY.md, and correct two measurement errors in the todo before closing it"
commit: 5b50683af
---

# Quick Task 260921-kpd — complete

## What shipped

`.planning/STATE.md`'s `### Quick Tasks Completed` ledger gained 16 rows, one per quick-task
directory that existed on disk with no corresponding ledger row. Each row was sourced from its
own directory's `SUMMARY.md` — never from `git log` alone — and inserted at its correct
chronological position among the existing rows, not appended at the end. The one exception,
`260821-iri`, has no `SUMMARY.md`; its Status cell states that plainly and describes what its 4
commits touch instead of fabricating an outcome.

Row count: **340 → 356** (+16), measured fresh both before and after the edit.

`.planning/todos/pending/2026-09-20-state-md-quick-task-ledger-is-missing-16-rows.md` was
corrected and moved to `.planning/todos/completed/` in commit `5b50683af`.

## The two todo corrections

1. **`--grep`-only commit census undercounted three ids.** The todo's original commits table used
   `git log --grep=<id>` alone, which misses commits that touch a task's files without naming the
   id in the message. Re-measured as the union of `--grep=<id>` and `-- <dir>`: `260823-cis` 0 → 1,
   `260826-w4c` 0 → 1, `260907-odi` 1 → 2. The false "may be legitimately abandoned" conclusion for
   `260823-cis`/`260826-w4c` was struck and replaced — both have one real commit each
   (`10f4d200e`, `fe7a1f6fa`) and were backfilled normally, same as the other 14.
2. **"327 rows" vs "340 rows" was a category confusion, not a contradiction.** The ledger's 340
   total pre-existing data rows decompose as 327 plain `YYMMDD-xxx`-id rows (the number that
   compares against the 339 on-disk task directories) + 7 `fast-`-prefixed rows (a different task
   class, `/gsd-fast`) + 6 other-shaped first cells. 327 + 7 + 6 = 340. Both numbers were correct
   about different populations; the todo now says so explicitly rather than reconciling them into
   one wrong number.

Also clarified, without changing the underlying finding: `260722-c2i` is two loose files directly
under `.planning/quick/`, not a directory — an `os.path.isdir()`-less census would misclassify it
as a 5th orphan, and it is not one (it already has its own ledger row). The 7 `fast-`-prefixed
ledger rows belong to `/gsd-fast`, a different task class, and are not orphans either.

## The orphan count stayed at 4 — the plan's own draft claimed 8, and that was wrong

The plan's own "Correction 2" section asserted the orphan-row count was 8, not 4. That is not
what shipped: re-measured fresh this session, the genuine orphan rows — ledger rows pointing at
directories that do not exist anywhere under `.planning/` — are exactly **4**: `260710-d7b`,
`260815-lng`, `260823-wr3`, `260824-u8b`. `260722-c2i` (loose files) and the 7 `fast-`-prefixed
rows are not orphans and must not be counted as such; conflating them with the 4 is precisely how
a naive `plain_ids - dirs` set difference (without an isdir check) would wrongly reach 8, when
the true figure is 4. All 4 orphan rows were left untouched — no mechanism for them has been
confirmed, and the todo still flags the `/gsd-cleanup` archival guess as unverified.

Because the plan document itself carried this same error into its own Task 3 `<verify>` spec
(instructing a check for "8 orphan rows"), that check was not implemented as written. The
verifier built for Task 3 instead asserts the todo names the 4 real orphans, re-confirms "4, not
more," and contains no claim of 8.

## Verification (measured this session)

- **MISSING after edit == exactly `{260921-kpd}`** — the only quick-task directory ID with no
  ledger row is this task's own, whose row is written by `/gsd-quick`'s Step 7, not by this task.
- **Row count**: 340 (baseline) + 16 = 356 (measured after edit) — matches.
- **All 16 new rows**: single line each, exactly 5 cells (6 pipes), Directory path resolves to an
  existing directory on disk — all 16 pass.
- **Pre-existing 340 rows byte-identical**: SHA-256 of the sorted pre-existing row set unchanged
  (`06491baa54789d8b0830f64cb350ae2a3a30d934819656df84e9181eeb92fd46`) before and after.
- **`stopped_at` byte-identical**: SHA-256 unchanged
  (`b92bd32a3f383e31b3859b2fa256a5386d6dd429006ba7d3de381164d067e86f`), length 54056, confirmed via
  a manual quote-aware scalar scan and independently via Node `js-yaml`.
- **`pnpm planning-gates`**: 11/11 passed, same as at HEAD `d90f17c1e` before this task started —
  no regression introduced.

## Explicit non-decision

No ledger-completeness gate was added, and no gate vocabulary was widened to accommodate this
task. Whether one is worth adding is left as a separate decision, per the todo's own "Scope note"
and this repo's standing pattern against gates that appear to cover more than they do.

## Deviations from the plan

- **Orphan count corrected to 4, per the orchestrator's instruction, not the plan's own draft of
  8.** The plan's "Correction 2" section and its Task 3 `<verify>` spec both assert 8; both are
  wrong. Documented above and in the todo itself.
- **Task 3's verifier does not check for "8 orphan rows"** as the plan's `<verify>` text literally
  specifies, because that would have required asserting a false claim. It instead checks for the
  4-orphan fact and the absence of a false 8-orphan claim.
- No third error was found in the orchestrator's own corrections beyond what is already covered
  above — the plan's "8 orphan rows" verifier spec is a symptom of the same Correction-2 mistake
  already flagged, not a separate, third defect.

## Known false-positive and same-day-closure observations (not corrected in the todo, noted here)

- `git log --grep=260908-vo4` includes `8262da1df`, which mentions the id in unrelated prose
  rather than being a commit that shipped `260908-vo4`'s own work — a `--grep` false positive in
  the other direction from the undercount above. Not corrected in the todo because it does not
  change any conclusion there (the 7-commit union figure for `260908-vo4` was already correct).
- `260908-k3x`'s union commit set includes two docs commits (`6c197c78c`, `0dd78afbc`) not named in
  its own SUMMARY.md; the latter shows a related live-gate todo was closed the same day. Neither
  changes the row backfilled for `260908-k3x`.

## Files touched

- `.planning/STATE.md` — 16 rows inserted into `### Quick Tasks Completed` (committed by the
  orchestrator, not by this task).
- `.planning/todos/completed/2026-09-20-state-md-quick-task-ledger-is-missing-16-rows.md` — moved
  from `pending/`, corrected in place, commit `5b50683af`.
