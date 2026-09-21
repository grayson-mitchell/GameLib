---
created: 2026-09-21
title: "Agents emit a stray trailing closing tag into planning files — recurring authoring artifact, now gated"
area: todos
severity: minor
platform: any
status: "RESOLVED 2026-09-22 by quick-260922-7pv"
source: "quick-260921-pvt, surfaced while repairing six pending todos that carried the artifact"
resolved_by: quick-260922-7pv
files:
  - .planning/planning-envelope-tag-gate.py
  - meta/runPlanningGates.py
---

## What happened

Six pending todos carried a stray XML-style closing tag — split spelling `` `</content` `` +
`` `>` `` so this todo does not reintroduce the literal string it documents — as their FINAL line.
It is a leaked fragment of an agent's own tool-call envelope that got written straight into the
file body instead of being consumed by whatever wraps file-creation output. Affected files (the
original six):

- `2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md`
- `2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md`
- `2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md`
- `2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md`
- `2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md`
- `2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md`

The tag was ORPHANED: there is no opening tag anywhere under `.planning/todos/`, so it was never
half of a pair and nothing ever read it. It sat there inert. Quick task `260921-pvt` deleted
exactly that one trailing line from each of the six files and changed nothing else
(`git diff --numstat` reads `+0/-1` per file).

## The census this todo originally took was wrong — corrected here

This todo was filed scoped to "todo bodies", because that is the only place the six files that
prompted it happened to live. **That scope was an artifact of where the discovery started, not a
property of the defect.** Quick task `260922-7pv` took a real census — every git-tracked
`.planning/**/*.md` file, not just `.planning/todos/` — and found the true population is **43
files**, of which **zero** are under `.planning/todos/`. The six that triggered this todo had
already been hand-repaired by `260921-pvt` before the census ran, so they are not part of the 43;
they are the reason the 43 were ever looked for.

**Real population: 43 files, 68 orphan lines, 33 distinct introducing commits, spanning
2026-07-05 → 2026-09-21 (78 days).**

Directory split:

| directory | files |
| --- | --- |
| `.planning/phases/` | 19 |
| `.planning/quick/` | 23 |
| `.planning/debug/` | 1 |
| `.planning/todos/` | 0 |
| outside `.planning/` | 0 |

Shape split (trailing contiguous run of bare envelope-tag lines): 18 files lost a single trailing
line, 25 files lost two — 18 + 25×2 = 68, matching the total exactly. No file needed a third line
removed.

So the defect was never "agents leak a tag into todo bodies." It is "agents leak a tag into the
trailing lines of ANY planning markdown file they author" — todos were simply the first place a
human happened to notice it, in a corpus dominated by phase plans and quick-task plans, not todos.

## It recurred — that is the point

This is not one agent's one-off slip. It happened in TWO INDEPENDENT SESSIONS, on TWO DIFFERENT
DATES, before the corrected census even widened the count to 43:

- `30630b9d2` ("docs(quick-260921-nub): file three adjacent findings and close the parent todo",
  2026-09-21) birthed the three `2026-09-20-*` files with the tag already present at creation.
- `82ac54d86` ("docs(todos): file Linux compile-failure and Windows install-deps todos",
  2026-09-17) — an unrelated, earlier session — birthed the three `2026-09-17-*` files the same
  way.

The corrected 43-file, 33-commit, 78-day population confirms this was never a two-incident
anomaly: it is a steady background rate across nearly three months of sessions, across two
different planning-file genres (phase plans, quick-task plans) that share nothing but being
authored the same way.

## Why nothing caught it

`.planning/todos/todo-frontmatter-gate.py` validates `severity`/`platform`/`ready` inside the
FRONTMATTER block only, so it could never have seen a body-trailing artifact regardless of scope.
But the deeper reason nothing caught this for 78 days is that no gate anywhere looked at a
planning file's TRAILING LINES for this shape — not a todo-specific gap, a planning-corpus-wide
one. All eleven gates existing before this fix stayed green the entire time, because the property
"does this file's last line accidentally repeat an agent's own tool envelope" had never been
asked of ANY `.planning/**/*.md` file, todo or otherwise.

## The self-referential trap facing any future gate — and how the fix avoided it

Any gate that matched the literal tag string as a raw pattern would be tripped by the very
documentation that describes the tag — including this file, and including the gate's own source,
which lives under `.planning/`. `.planning/planning-envelope-tag-gate.py` avoids this two ways:
every tag-shaped literal in the gate's source and self-test is built by string concatenation
(`"<" + "/" + name + ">"`), never written as a contiguous string, so widening the gated corpus to
`.py` files would not make the gate self-convict; and the discriminating predicate — a bare
closing tag, alone on its line, in the file's trailing run, with no matching opening tag anywhere
earlier in the file — is narrow enough that prose describing the artifact (like this file) never
matches it, because prose does not put an isolated closing tag as literally the file's last
non-blank line.

The gate's hardest job was proving that predicate does not also convict the ~800 (867
post-sweep) files that legitimately end in a genuinely paired `</output>` closing tag — a gate
that convicted those would have been deleted within the day. It passes an anti-vacuity check
pinned to `> 0` on that count for exactly this reason: a floor pinned to the measured figure would
go stale and could silently stop testing the thing that makes this gate hard to get right.

## Resolution

**Fixed by quick task `260922-7pv` (2026-09-22).** Two changes, landed as three atomic commits:

1. **`.planning/planning-envelope-tag-gate.py`** (new) — the twelfth planning gate. Discovers
   every git-tracked `.planning/**/*.md` file, walks each file's trailing contiguous run of bare
   closing-tag lines, and fails if any tag in that run is an unpaired `content` or `invoke` (the
   two envelope tag names observed in the wild). Its predicate function is shared, unmodified,
   between the live scan, its own 11-case self-test, and the sweep script that used it to fix the
   43 files — never reimplemented.
2. **`meta/runPlanningGates.py`** — `MINIMUM_EXPECTED_GATES` raised from 11 to 12, so the new
   gate's own future deletion cannot go unnoticed the way the underlying defect did.

The 43 files were swept by importing the gate's own `orphan_tag_lines()` predicate and deleting
exactly the trailing orphan run from each — nothing else. `git diff --numstat` over `.planning`
confirmed `0 added, 68 deleted` across the 43 files, matching this todo's corrected census exactly.

No exemption ledger was added, and none should be: the discriminating predicate was chosen so that
none is ever needed. If the gate ever names a new offender, the fix is to delete the stray tag from
that file, not to widen the envelope-tag set or exempt the path.

## What remains open

The gate is a ratchet against files that already exist at scan time — it runs as part of
`pnpm planning-gates`, which is not a pre-commit hook, so a 34th introducing commit could still
land before the next gate run catches it. That residual gap was accepted deliberately: a
diff-scoped pre-commit check was one of the options this todo originally sketched and it was not
built, because the corpus-wide gate already answers "is anything currently wrong" cheaply and
CI-enforced, and a pre-commit hook adds friction to every commit for a defect whose cost, once
caught, is a one-line deletion.
