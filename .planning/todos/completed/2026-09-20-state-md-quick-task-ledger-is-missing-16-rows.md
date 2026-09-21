---
created: 2026-09-20T00:00:00.000Z
title: "STATE.md's Quick Tasks Completed ledger is missing 16 rows, 10 of which shipped source changes"
area: planning
severity: major
platform: any
ready: code
found_by: "quick-260921-jfk"
files:
  - .planning/STATE.md
---

## Observed

`.planning/STATE.md`'s `### Quick Tasks Completed` table is the audit surface for quick tasks. It
is **incomplete**: 16 quick-task directories exist on disk with no corresponding row.

Measured at HEAD `58d69f525` by comparing every `.planning/quick/<id>-<slug>/` directory against
every `^| <id> |` row in the table:

- **339** quick-task directories on disk
- **327** ledger rows
- **16** directories with **no row at all**

**CORRECTED 2026-09-21 (quick-260921-kpd) — "327 ledger rows" is not the same number as "340
data rows".** Both are correct, about different things: the ledger region has **340** total data
rows, which decompose as **327** plain `YYMMDD-xxx`-id rows (the figure this todo compares
against the 339 directories) **+ 7** `fast-`-prefixed rows (a different task class, `/gsd-fast`,
not `/gsd-quick`) **+ 6** other-shaped first cells (`fast`, `260803-fast`, `260805-fast`,
`260905-fast`, `260912-e6k-fu`, `260915-ajd-fu`). 327 + 7 + 6 = 340, re-measured fresh against
the pre-edit ledger. Do not reconcile these into one number — 327 is the correct denominator for
comparing against quick-task ids; 340 is the correct denominator for "how many lines does the
region hold".

## Measured — the 16, and what each shipped

Source-file counts come from walking `git log --grep=<id>` for every commit naming the id and
counting the distinct non-`.planning/` paths they touch.

**CORRECTED 2026-09-21 (quick-260921-kpd) — the `commits` column below undercounts for 5 ids.**
`git log --grep=<id>` only sees commits whose message names the id; it misses commits that touch
the task's directory or source files without naming the id. Re-measured as the **union** of
`git log --grep=<id>` and `git log -- <dir>`, three of the five disagreeing counts change:
`260823-cis` 0 → **1**, `260826-w4c` 0 → **1**, `260907-odi` 1 → **2**. Two others in the
disagreement set (`260821-iri`, `260826-s2f`) already showed their correct union value below by
coincidence. The table itself is left as originally measured (rather than silently rewritten) —
this note is the correction; see quick-260921-kpd's own SUMMARY.md for the corrected union figures
if needed.

| id | PLAN | SUMMARY | commits | source files shipped |
| --- | --- | --- | --- | --- |
| 260819-s8p | yes | yes | 4 | 2 |
| 260820-fyl | yes | yes | 2 | 2 |
| 260820-ic0 | yes | yes | 2 | 1 |
| 260820-u29 | yes | yes | 11 | 3 |
| 260821-iri | yes | **NO** | 4 | 9 |
| 260822-elw | yes | yes | 3 | 4 |
| 260823-cis | yes | yes | 0 (**union: 1**) | 0 |
| 260826-s2f | yes | yes | 3 | 0 |
| 260826-sil | yes | yes | 1 | 0 |
| 260826-w4c | yes | yes | 0 (**union: 1**) | 0 |
| 260826-y8n | **NO** | yes | 1 | 0 |
| 260903-itr | yes | yes | 6 | 2 |
| 260907-odi | yes | yes | 1 (**union: 2**) | 0 |
| 260908-k3x | yes | yes | 7 | 4 |
| 260908-vo4 | yes | yes | 7 | 3 |
| 260919-u23 | yes | yes | 3 | **98** |

**10 of the 16 shipped source changes.** `260919-u23` is the largest at 98 files — the
`SideloadDialog` import-hint namespace migration plus its 48-locale fill.

Three of the 16 are shaped differently and may not all be the same defect:

- **`260821-iri`** has **no SUMMARY.md** yet has 4 commits touching 9 source files. It shipped
  without a summary as well as without a row.
- **`260823-cis`** and **`260826-w4c`** were measured above as **0 commits** via `git log
  --grep=<id>` alone. **CORRECTED 2026-09-21 (quick-260921-kpd): that undercounts. Both have 1
  commit each by path** (`git log -- <dir>`) — `10f4d200e` for `260823-cis`, `fe7a1f6fa` for
  `260826-w4c`. Neither is abandoned; both got ordinary ledger rows backfilled from their
  summaries, same as the other fourteen.
- **`260826-y8n`** has a SUMMARY.md but **no PLAN.md**.

## Measured — a separate, smaller anomaly in the other direction

**4 ledger rows point at directories that do not exist** anywhere under `.planning/`:
`260710-d7b`, `260815-lng`, `260823-wr3`, `260824-u8b`. **Re-confirmed 2026-09-21
(quick-260921-kpd): this figure is correct as originally measured — 4, not more.**

These were plausibly archived by `/gsd-cleanup`. **That is UNVERIFIED** — it is a guess about the
mechanism, not a measurement, and should be confirmed before anyone deletes or rewrites those rows.

**CORRECTED 2026-09-21 (quick-260921-kpd) — two adjacent shapes that are NOT part of the 4 above,
recorded here so a future census does not conflate them with real orphans:**

- **`260722-c2i` is not a directory and is not an orphan.** It exists as two loose files directly
  under `.planning/quick/` — `260722-c2i-PLAN.md` and `260722-c2i-SUMMARY.md` — with no
  `260722-c2i-*/` directory. It already has its own ledger row (line 5592), pointing at those
  loose files directly (`[260722-c2i-PLAN.md](.planning/quick/260722-c2i-PLAN.md) /
  [260722-c2i-SUMMARY.md](.planning/quick/260722-c2i-SUMMARY.md)`), and is neither missing nor an
  orphan. A census that does `plain_ids - dirs` without an `os.path.isdir()` check on the
  directory side will misclassify this id as a 5th orphan; it is a third, distinct on-disk shape
  (loose files, not a directory, not absent).
- **7 `fast-`-prefixed ledger rows** (`fast-260816-mkr`, `fast-260822-v3n`, `fast-260822-3qw`,
  `fast-73ee87f3`, `fast-0800e7d8`, `fast-b8a4b8e`, `fast-parse22`) belong to a different task
  class (`/gsd-fast`), not `/gsd-quick`. There is no `.planning/fast/` directory at all under
  `.planning/`, so these plausibly never had one by design — an **observation about the tree, not
  a verified claim about `/gsd-fast`'s behaviour**. They are not orphans of the 4 above and must
  not be conflated with them.

## Why `severity: major` and not `medium`

Because the contaminated thing is a **measurement**, which is what `major` means in CLAUDE.md's
triage table — not because any feature is broken.

This repo already carries the recorded lesson that a quick task can ship code and never be
recorded, and that the correct response is to **audit by table ROW, not by `git log`** — precisely
because `git log` is unreliable here (a rebase or cherry-pick replay preserves the author date while
changing the commit date, so a replayed filing can look older than the close that superseded it).
The ledger is the surface that was supposed to be trustworthy instead. A ledger that silently omits
16 entries, 10 of them code-bearing, is not a cosmetic gap: it is the audit surface returning a
confident wrong answer.

## Hypothesis for the mechanism — NOT a finding

`/gsd-quick` writes the ledger row in its **Step 7**, which runs **after** the executor has already
committed the code. A run that ends, errors out, or is abandoned between the executor's last commit
and Step 7 therefore ships code and leaves no ledger trace.

This is **consistent with** `260821-iri` (commits present, SUMMARY.md absent — an executor that did
not reach its own final step), but it has not been confirmed against the other 15, and no mechanism
has been checked for the 4 orphan rows. **Treat this paragraph as a hypothesis to test first, not
as the diagnosis.** Do not build a fix on it until it has been checked against more than one case.

## Traps for whoever fixes this

- **Do not reconstruct rows from `git log` alone.** See above — a replayed commit can carry a
  misleading date, and duplicate filings are indistinguishable by subject. Source each row from the
  directory's own `SUMMARY.md` and name the sha.
- **Ledger rows are single-line Markdown table rows.** A newline or an unescaped `|` inside any
  cell breaks the table silently — there is no gate that would catch it.
- **`stopped_at` is a single-quoted YAML scalar roughly 52k characters long.** Prepend INSIDE the
  quotes, never wrap or reflow it, and assert the pre-existing suffix survives the edit. `gsd-sdk`
  state writes have corrupted this file before.
- **The header declares 5 columns but the oldest rows carry only 4 cells** (no Status). Match the
  recent 5-cell shape for anything new; do not restructure the 327 existing rows to match the
  header.
- ~~Backfilling a row for `260823-cis` or `260826-w4c` would assert work that has no commits
  behind it. Verify before writing.~~ **STRUCK 2026-09-21 (quick-260921-kpd): false, rested on the
  `--grep` undercount above.** Both have 1 commit each by path and were backfilled normally like
  the other 14. The real trap this bullet should have named: measuring commits by `--grep=<id>`
  alone silently produces false "0 commits, may be abandoned" conclusions — use the union of
  `--grep` and `-- <dir>` instead.

## How this was found

Noticed while completing `quick-260921-jfk`: `260919-u23` had shipped code in `98a1586e6` and
`2e81cbd84` but appeared nowhere in STATE.md. It was flagged in both `260921-jfk` and `260921-k2d`
rather than fabricating a row for work that had not been verified. Censusing the full
directory-vs-row population then turned one suspected oversight into 16.

## Scope note

No gate is proposed here, and the gate vocabulary must not be widened to accommodate this. Whether
a ledger-completeness check is worth adding is a separate decision to be made on its own merits —
this repo has a standing pattern of rejecting gates that appear to cover more than they do.

## Resolution (quick-260921-kpd, 2026-09-21)

All 16 rows backfilled into `.planning/STATE.md`'s `### Quick Tasks Completed` ledger, each
sourced from its directory's own `SUMMARY.md` (or, for `260821-iri`, stated plainly that no
summary exists and described what its 4 commits show), each inserted at its chronological
position rather than appended. The two measurement corrections above (`--grep` undercount;
327-vs-340) were made in this todo's body before closing it, rather than closing it unchanged.
**The 4 orphan rows are left alone** — untouched, unrewritten, exactly as this todo originally
found them; the `/gsd-cleanup` mechanism guess is still unverified and still flagged as such. The
`/gsd-quick` Step 7 hypothesis two sections above is left labelled a hypothesis — it was tested
against none of the 16 in this pass and remains unconfirmed. No gate was added and no gate
vocabulary was widened; that decision is left exactly where the Scope note above leaves it.
