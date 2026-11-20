---
quick_id: 260921-kpd
date: 2026-09-20
status: planned
description: "STATE.md's Quick Tasks Completed ledger omits 16 quick-task directories; the todo reporting it undercounts commits via `git log --grep` and undercounts orphan rows"
closes_todo: .planning/todos/pending/2026-09-20-state-md-quick-task-ledger-is-missing-16-rows.md
files:
  - .planning/STATE.md
  - .planning/todos/pending/2026-09-20-state-md-quick-task-ledger-is-missing-16-rows.md
must_haves:
  truths:
    - "Every `.planning/quick/<YYMMDD-xxx>-*/` directory except this task's own has a row in the `### Quick Tasks Completed` ledger."
    - "Each of the 16 backfilled rows is a single line with exactly 5 cells, and its Directory cell path resolves to a directory that exists on disk."
    - "Every pre-existing ledger data row is byte-identical to its pre-edit self."
    - "The `stopped_at` YAML scalar in STATE.md's frontmatter is byte-identical to its pre-edit self."
    - "The closed todo names the `git log --grep` undercount as a correction, so no future reader repeats it."
  artifacts:
    - path: .planning/STATE.md
      provides: "16 backfilled ledger rows inserted at their chronological positions"
      contains: "260821-iri"
    - path: .planning/todos/completed/2026-09-20-state-md-quick-task-ledger-is-missing-16-rows.md
      provides: "Closed todo carrying both measurement corrections"
  key_links:
    - from: "each backfilled row's Directory cell"
      to: ".planning/quick/<dir>/"
      via: "markdown link path that resolves on disk"
      pattern: "\\]\\(\\.planning/quick/[a-z0-9-]+/\\)"
---

# Quick Task 260921-kpd — backfill 16 ledger rows, and correct the todo that reported them

## Objective

`.planning/STATE.md`'s `### Quick Tasks Completed` table is the audit surface for quick tasks. It
is incomplete: 16 quick-task directories exist on disk with no corresponding row, 10 of them
code-bearing. Backfill those 16 rows, sourced from each directory's own `SUMMARY.md`.

The todo reporting this carries **two measurement errors of its own**. Closing it unchanged would
publish both as settled fact. Correct the body before moving it — this repo already carries the
lesson that closing a todo on a false claim discards information.

## Established facts — measured at HEAD `d90f17c1e`, do NOT re-derive

**Ledger location.** `### Quick Tasks Completed` is at `.planning/STATE.md:5552`. The ledger region
runs to the next `## ` heading (`## Deferred Items`). The region is 344 lines: 1 leading blank, a
header row, a separator row, **340 data rows**, 1 trailing blank.

**The 340 is not 327.** The todo says "327 ledger rows". That number came from a narrower regex.
340 is the count of lines in the region starting with `| `. Do not reconcile the two — **measure
your own baseline** with the census in Task 1 and assert against that.

**The table is already ragged. This is pre-existing and out of scope.** Pipe-count census over the
region: 232 lines with 5 pipes (4 cells, the old shape), 95 with 6 pipes (5 cells, the current
shape), 4 with 3 pipes (2 cells — lines 5837–5840), and 12 lines with 7–14 pipes (rows carrying
unescaped `|` inside a cell). **Do not restructure any of them.** The 5-cell requirement applies to
the 16 new rows only.

**The 16 missing ids**, and what each has on disk. `union` is commits from
`git log --grep=<id>` ∪ `git log -- <dir>` — see the correction below for why neither alone is
sufficient:

| id | SUMMARY.md filename | PLAN.md | union commits |
| --- | --- | --- | --- |
| 260819-s8p | `260819-s8p-SUMMARY.md` | yes | 4 |
| 260820-fyl | `SUMMARY.md` | yes | 2 |
| 260820-ic0 | `SUMMARY.md` | yes | 2 |
| 260820-u29 | `260820-u29-SUMMARY.md` | yes | 11 |
| 260821-iri | **NONE** | yes | 4 |
| 260822-elw | `260822-elw-SUMMARY.md` | yes | 3 |
| 260823-cis | `SUMMARY.md` | yes | **1** |
| 260826-s2f | `SUMMARY.md` | yes | 3 |
| 260826-sil | `SUMMARY.md` | yes | 1 |
| 260826-w4c | `SUMMARY.md` | yes | **1** |
| 260826-y8n | `SUMMARY.md` | **NO** | 1 |
| 260903-itr | `260903-itr-SUMMARY.md` | yes | 6 |
| 260907-odi | `260907-odi-SUMMARY.md` | yes | 2 |
| 260908-k3x | `260908-k3x-SUMMARY.md` | yes | 7 |
| 260908-vo4 | `260908-vo4-SUMMARY.md` | yes | 7 |
| 260919-u23 | `260919-u23-SUMMARY.md` | yes | 4 |

**The summary filename is not uniform** — 8 are `<id>-SUMMARY.md`, 7 are bare `SUMMARY.md`, 1 is
absent. Glob `"$dir"/*SUMMARY.md`; do not hardcode either spelling.

**Census regex traps, each one hit while measuring this plan.** All three produce a confidently
wrong count:

- `^[0-9]{6}-[a-z0-9]{3}` without a trailing `-` matches `260820-i18n-gate-scope-dialog` and
  invents the id `260820-i18`. Anchor the hyphen: `^[0-9]{6}-[a-z0-9]{3}-`.
- Two directories under `.planning/quick/` are not quick-task id dirs at all:
  `20260824-installmodal-native-platform-default` and `260820-i18n-gate-scope-dialog`. The
  hyphen-anchored regex correctly excludes both. **339** directories match it — a number that
  includes this task's own `260921-kpd-*` dir.
- Scanning the whole of `STATE.md` for `^| <id> |` rather than the ledger region over-counts.
  Scope the scan to the region.

**Your own directory is expected to show as missing.** After the edit, the directories-with-no-row
set must be **exactly `{260921-kpd}`** — not empty. `/gsd-quick`'s Step 7 writes this task's own row
after the executor finishes. Do **not** backfill it here.

## Correction 1 — `git log --grep` undercounts, and the todo built a conclusion on it

The todo states `260823-cis` and `260826-w4c` have "**0 commits** (planning-only; may be
legitimately abandoned)" and warns that "backfilling a row for `260823-cis` or `260826-w4c` would
assert work that has no commits behind it."

That is wrong. The count came from `git log --grep=<id>`, which **only sees commits whose message
names the id**. Re-measured by path (`git log -- <dir>`), both have **1 commit each**. They are not
abandoned, and both get a row like the other fourteen.

Five ids where the two methods disagree:

| id | `--grep` | `-- <dir>` | union |
| --- | --- | --- | --- |
| 260821-iri | 4 | 1 | 4 |
| 260823-cis | 0 | 1 | **1** |
| 260826-s2f | 3 | 2 | 3 |
| 260826-w4c | 0 | 1 | **1** |
| 260907-odi | 1 | 2 | 2 |

Neither method alone is complete — `--grep` misses commits that do not name the id, `-- <dir>`
misses commits that touch only source files. **Use the union.**

## Correction 2 — the orphan-row count is 8, not 4

The todo reports "**4** ledger rows point at directories that do not exist": `260710-d7b`,
`260815-lng`, `260823-wr3`, `260824-u8b`.

Measured over the ledger region against a `find .planning -type d` search, there are **8**:

- Same shape as the four already named, plus **`260722-c2i`** — 5 rows carrying a `YYMMDD-xxx` id
  with no directory anywhere under `.planning/`.
- Three `fast-`-prefixed rows — `fast-260816-mkr`, `fast-260822-3qw`, `fast-260822-v3n`. There is
  **no `.planning/fast/` directory**, so these plausibly never had a directory by design. That is
  an observation about the tree, not a verified claim about `/gsd-fast`'s behaviour — write it as
  such.

The todo's census missed `fast-`-prefixed first cells entirely and missed `260722-c2i`.

**This whole anomaly stays OUT OF SCOPE.** Do not delete, rewrite, or repair any of the 8 rows. The
correction is recorded in the todo body and nowhere else.

## The row shape — verbatim, confirmed by reading `STATE.md:5894`

Five cells, one line, no trailing content:

```
| <id> | <description> | <YYYY-MM-DD> | <status> | [<dirname>](.planning/quick/<dirname>/) |
```

- **Directory cell path is `.planning/quick/<dirname>/`** — repo-root-relative, with a trailing
  slash. Not `./quick/...`. Confirm against a recent row before writing; do not trust this line
  alone.
- **Date cell is `20YY-MM-DD`** derived from the id's `YYMMDD` prefix. If a commit date disagrees,
  the id prefix wins, and the row says nothing about the disagreement — it is a date cell, not
  prose.
- No cell may contain a literal `|` or a newline. Both break the table **silently**; no gate
  catches it.
- `.planning/` is in `.prettierignore`, so long rows will not be reflowed on pre-push. Line length
  is not a constraint.

## Register

The recent neighbours are long and narrative — bolded lede, then measured detail. **Match that
register only where the underlying `SUMMARY.md` supports it.** Honesty over symmetry: a
four-line summary gets a short row. Do not pad 16 rows to 300 characters to make the column look
even.

## Scope

**In:** the 16 backfilled rows; correcting and closing the todo.

**Out:** the 8 orphan rows; the 4 two-cell rows at 5837–5840; the 232 four-cell legacy rows; the 12
rows with unescaped pipes; `260921-kpd`'s own row; the `stopped_at` scalar; the hypothesis about
`/gsd-quick` Step 7 as mechanism (untested against 15 of 16 cases — leave it labelled a hypothesis).

**No gate.** Do not add a ledger-completeness check and do not widen any existing gate's vocabulary.
Whether such a check earns its keep is a separate decision on its own merits; this plan does not
make it. Say so in the summary rather than building one.

## Working directory for scripts and intermediates

Every script and intermediate in this task lives under the session scratchpad, referred to below
as `$SCRATCH`:

```
export SCRATCH=/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/36f6f904-9274-4b74-80ae-31493f44c1f4/scratchpad
```

Nothing in `$SCRATCH` is committed. The three `<verify>` commands below each invoke a checker
script you write there, so that the verification logic is itself readable and re-runnable rather
than a one-line shell chain that is hard to audit.

## Tasks

<task type="auto">
  <name>Task 1: Measure the pre-edit baseline and draft the 16 rows from their summaries</name>
  <files>/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/36f6f904-9274-4b74-80ae-31493f44c1f4/scratchpad/baseline.json, /tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/36f6f904-9274-4b74-80ae-31493f44c1f4/scratchpad/rows-draft.txt</files>
  <action>
    Touch no repo file in this task. Write both outputs to the scratchpad.

    First, measure your own baseline rather than trusting the numbers in this plan. Extract the
    ledger region from `.planning/STATE.md` — from the `### Quick Tasks Completed` line to the next
    line beginning `## ` — and record: the region's start and end line numbers; `ROWS_BEFORE`, the
    count of region lines starting with a pipe-space; `DIRS`, the sorted set of directory basenames
    under `.planning/quick/` matching `^[0-9]{6}-[a-z0-9]{3}-`, truncated to their 10-character id;
    `ROW_IDS`, the sorted set of ids appearing as a row's first cell, allowing an optional `fast-`
    prefix; and `MISSING = DIRS - ROW_IDS`. Assert `MISSING` is exactly the 17 ids listed in this
    plan's table plus `260921-kpd`. If it is not, stop and report the discrepancy rather than
    proceeding — a census that disagrees with the plan means one of them is wrong and writing rows
    on top of that is how fabrications enter the ledger. Also record a SHA-256 of the sorted
    pre-existing data-row set and a SHA-256 of the `stopped_at` scalar's value, both for Task 3.

    Then, for each of the 16 ids, read its directory's `*SUMMARY.md` (glob it — the filename is
    `<id>-SUMMARY.md` for 8 and bare `SUMMARY.md` for 7) and draft one row. Source the Description
    and Status cells from the summary's own text, not from `git log` prose: a rebase or cherry-pick
    replay preserves the author date while changing the commit date, so `git log` can date or
    attribute a filing wrongly. Name the relevant sha(s) in the row where the summary itself names
    them or where they add something the summary does not. Get shas from the union of
    `git log --grep=<id>` and `git log -- <dir>` — per Correction 1, neither alone is complete.

    Two ids need explicit, non-default treatment. `260821-iri` has **no SUMMARY.md**: its Status
    cell must say plainly that no summary exists and state what the commits show (4 commits, 9
    source files), rather than manufacturing an outcome from the diff. `260826-y8n` has a summary
    but **no PLAN.md** — note that in its Status cell.

    `260823-cis` and `260826-w4c` get ordinary rows sourced from their summaries. Per Correction 1
    they are not abandoned; ignore the todo's warning about them, which rests on the undercount.

    Before writing each draft line, assert it contains no newline and no literal pipe outside the
    five cell delimiters, and that its Directory cell path resolves to an existing directory.
    Leave `rows-draft.txt` as 16 lines in ascending id order.

    Then write `$SCRATCH/check_draft.py`, the Task 1 verifier. It must exit non-zero unless:
    `rows-draft.txt` has exactly 16 non-blank lines; every line contains exactly 6 `|` characters
    (5 cells) and no newline; every line's Directory cell matches
    `\]\(\.planning/quick/[a-z0-9-]+/\)` and that path is an existing directory; the 16 leading
    ids are exactly the expected set and are in ascending order; and `260821-iri`'s row does not
    claim an outcome the absent summary cannot support — assert its Status cell contains the word
    "summary" so an invented outcome cannot pass silently.
  </action>
  <verify>
    <automated>
python3 "$SCRATCH/check_draft.py"
    </automated>
  </verify>
  <done>`baseline.json` records `ROWS_BEFORE`, the region bounds, the pre-existing row-set hash and the `stopped_at` hash; `MISSING` matched the expected 17. `rows-draft.txt` holds 16 single-line rows, each with exactly 5 cells and a Directory path that exists on disk. `260821-iri`'s Status cell states that no summary exists. No repo file was modified.</done>
</task>

<task type="auto">
  <name>Task 2: Insert the 16 rows at their chronological positions, asserting zero collateral damage</name>
  <files>.planning/STATE.md</files>
  <action>
    Do this with a Python script that reads `STATE.md` as bytes and asserts, not by hand-editing.
    `gsd-sdk` state writes have corrupted this file before; **do not use any `gsd-sdk query state.*`
    write command here.**

    Do not touch the frontmatter at all. The `stopped_at` scalar is a single-quoted YAML string of
    roughly 53k characters and this task has no reason to change it — leaving it untouched removes
    the whole hazard class. Task 3 asserts it is byte-identical.

    Rows appear in ascending id order, so each new row goes at its chronological position, **not
    appended at the end**. For each draft row, parse the leading id from each existing region data
    row's first cell (strip an optional `fast-` prefix and an optional `-fu` suffix; rows whose
    first cell does not parse as an id are skipped as ordering anchors), and insert the new row
    immediately before the first row whose parsed id sorts greater than the new id. The region is
    not perfectly sorted — the `fast-`, `260803-fast` and `-fu` rows break monotonicity — so after
    inserting, assert for each new row that its nearest parseable predecessor id is `<=` it and its
    nearest parseable successor id is `>=` it, and print both neighbour ids for each of the 16 so a
    reader can see where they landed.

    Before writing the file back, assert in-memory: the new region has exactly `ROWS_BEFORE + 16`
    data rows; the set of pre-existing data rows is byte-identical to the pre-edit set (compare the
    recorded SHA-256, and on mismatch print the symmetric difference rather than the whole file);
    the frontmatter bytes are unchanged; and everything outside the ledger region is unchanged.
    Write the file only if every assertion passes.

    Then write `$SCRATCH/check_ledger.py`, the Task 2 verifier, which re-reads `STATE.md` from disk
    after the write and re-asserts independently of the in-memory checks: region data rows equal
    `ROWS_BEFORE + 16`; each of the 16 draft lines appears verbatim in the region with exactly 5
    cells; the pre-existing row-set SHA-256 matches `baseline.json`; the `stopped_at` scalar's
    SHA-256 matches `baseline.json`; `js-yaml` (or `python3 -c "import yaml"`) parses the
    frontmatter as a mapping with zero unescaped quotes in `stopped_at`; and the bytes outside the
    ledger region are unchanged. It must print the counts it measured, not just "OK" — a verifier
    that only prints a verdict cannot be audited.
  </action>
  <verify>
    <automated>
python3 "$SCRATCH/check_ledger.py"
    </automated>
  </verify>
  <done>`.planning/STATE.md` carries `ROWS_BEFORE + 16` ledger data rows. All 16 new rows are present verbatim, each with exactly 5 cells. Every pre-existing data row hashes identically to its pre-edit self. Frontmatter bytes, including `stopped_at`, are unchanged. Neighbour ids were printed for each insertion and all 16 landed in ascending order.</done>
</task>

<task type="auto">
  <name>Task 3: Correct the todo's two measurement errors, then close it</name>
  <files>.planning/todos/pending/2026-09-20-state-md-quick-task-ledger-is-missing-16-rows.md, .planning/todos/completed/2026-09-20-state-md-quick-task-ledger-is-missing-16-rows.md</files>
  <action>
    Edit the body **in `pending/` first**, then stage, then move. `git mv` commits HEAD content and
    drops unstaged edits — that has bitten this repo twice, once undetected for 7 days.

    Two corrections, written as corrections rather than silent rewrites so a future reader sees what
    was believed and why it was wrong.

    First, the `--grep` undercount. Fix the `commits` column for the five ids where the methods
    disagree (`260821-iri`, `260823-cis`, `260826-s2f`, `260826-w4c`, `260907-odi`) to the union
    figures in this plan's Correction 1 table, and fix the sentence under the table that attributes
    the counts to `git log --grep=<id>` alone. Strike the bullet claiming `260823-cis` and
    `260826-w4c` have 0 commits and "may be legitimately abandoned", and the matching trap bullet
    warning against backfilling them — both are false, and both are the kind of claim that, left
    standing in `completed/`, fences a future task off from correct work. Replace them with the
    measured finding: 1 commit each, rows backfilled.

    Second, the orphan-row undercount. Correct "4 ledger rows" to 8, list all 8, and separate the
    5 `YYMMDD-xxx`-shaped ones from the 3 `fast-`-prefixed ones. Say that `.planning/fast/` does not
    exist, and label the inference from that — that `fast-` tasks never had directories — as an
    observation about the tree, not a verified claim about `/gsd-fast`. Keep the existing UNVERIFIED
    caveat about `/gsd-cleanup` as the mechanism; this task did not test it.

    Leave the `/gsd-quick` Step 7 hypothesis section labelled a hypothesis — it was not tested here
    either. Add a short resolution note recording what shipped: 16 rows backfilled, sourced from
    each directory's `SUMMARY.md`; the 8 orphan rows deliberately left alone; no gate added and no
    gate vocabulary widened.

    Then `git add` the pending file, `git mv` it to `.planning/todos/completed/`, commit, and verify
    the **committed** content with `git show HEAD:.planning/todos/completed/2026-09-20-state-md-quick-task-ledger-is-missing-16-rows.md` — read the committed blob, not the working tree.

    `severity`, `platform` and `ready` must survive the move intact and bare-lowercase.
    `todo-frontmatter-gate.py` scopes to `pending/` only, so it will not catch a frontmatter key
    lost in transit here — check it yourself.

    Then write `$SCRATCH/check_todo.sh`, the Task 3 verifier, reading the **committed blob** via
    `git show HEAD:<completed-path>` for every assertion. It must exit non-zero unless: the pending
    path no longer exists; the committed blob exists; it mentions the union-of-both-methods
    correction; it contains no surviving "legitimately abandoned" claim and no surviving trap bullet
    warning against backfilling `260823-cis`/`260826-w4c`; it names all 8 orphan rows; and its
    frontmatter still carries bare-lowercase `severity: major`, a `platform:` key and a `ready:` key.
  </action>
  <verify>
    <automated>
bash "$SCRATCH/check_todo.sh"
    </automated>
  </verify>
  <done>The todo lives in `completed/`, absent from `pending/`. Its **committed** blob carries the union-commit correction, the corrected 8-orphan-row count with the `fast-` split, no surviving "legitimately abandoned" claim, and intact bare-lowercase `severity`/`platform`/`ready` keys. The `/gsd-quick` Step 7 paragraph is still labelled a hypothesis.</done>
</task>

## Why grepping for the 16 ids is not verification

An id can be present in a row that is malformed, or in a row whose Directory cell points nowhere,
or appended at the wrong position. The failure modes worth catching are a **silently broken table**
and a **fabricated row**, and neither is visible to a presence grep. The four checks below are
scoped to see both.

## Verification

Run all four after Task 3. Each must pass on its own; a pass on three of four is a fail.

1. **Re-run the census.** Directories-with-no-row must be exactly `{260921-kpd}` — this task's own
   dir, whose row `/gsd-quick` Step 7 writes. Ledger data rows must equal the Task 1 `ROWS_BEFORE`
   plus exactly 16. Use the Task 1 census code so the before and after numbers are comparable.
2. **Well-formedness of the 16.** Each backfilled row is one line, has exactly 5 cells
   (`line.count('|') == 6`), and the path inside its Directory cell resolves to an existing
   directory.
3. **No collateral damage.** The pre-existing data-row set is byte-identical before and after —
   diff the extracted row sets, not the whole file. The `stopped_at` scalar is byte-identical, and
   `js-yaml` still parses the frontmatter as a mapping.
4. **`pnpm planning-gates` passes 11/11.** It was 11/11 at `d90f17c1e`, so a 10/11 is this task's
   doing and must be fixed, not rationalised as pre-existing.

## Success criteria

- 16 rows backfilled, each sourced from its directory's own `SUMMARY.md`, each at its chronological
  position, each a single line with 5 cells and a resolving Directory path.
- `260821-iri`'s Status cell states that no summary exists and what the commits show — no invented
  outcome.
- Zero pre-existing rows changed; `stopped_at` untouched; the 8 orphan rows untouched.
- The todo is in `completed/` with both measurement errors corrected in its **committed** blob.
- `pnpm planning-gates` 11/11.
- No gate added, no gate vocabulary widened.

## Output

`.planning/quick/260921-kpd-backfill-the-16-missing-quick-tasks-comp/260921-kpd-SUMMARY.md`. Record
the before/after row counts as measured by the executor, the two todo corrections, and the explicit
non-decision on a ledger-completeness gate.
