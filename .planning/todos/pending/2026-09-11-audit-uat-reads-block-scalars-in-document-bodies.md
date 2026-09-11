---
created: 2026-09-11
title: "`audit-uat` reads YAML blocks in document BODIES, not just frontmatter — a second, never-measured block-scalar population reaches its output as the literal `|`"
area: planning-records
severity: medium
platform: any
ready: code
source: "quick task 260911-vox (the frontmatter block-scalar sweep) — found while proving that sweep's V4 post-condition; deliberately left OUT OF SCOPE there"
files:
  - .planning/phases/27-tauri-shell-walking-skeleton/27-UAT.md
resolves_phase: null
---

# `audit-uat` parses body YAML too, and that population has never been counted

## What was proved

Quick `260911-vox` swept every block-scalar field in `.planning/` **frontmatter** — 160 fields
across 68 files — to single-line single-quoted scalars, because the GSD SDK's frontmatter parser is
line-based and returned the bare indicator (`|`, `>`) instead of the narrative beneath it.

That sweep's live-tool gate captured `gsd-sdk query audit-uat` before and after. Before the sweep
its output carried **four** fields whose entire value was a bare block-scalar indicator. After the
sweep it carries **two** — and the two survivors are not frontmatter at all:

| audit-uat path | file | source line | in frontmatter? | status |
| --- | --- | --- | --- | --- |
| `results[0].items[0].reason` | `27-UAT.md` | L31 | **no — body** | **still `"\|"` today** |
| `results[0].items[1].reason` | `27-UAT.md` | L51 | **no — body** | **still `"\|"` today** |
| `results[7].items[5].expected` | `38-VERIFICATION.md` | frontmatter | yes | fixed by `260911-vox` |
| `results[7].items[5].why_human` | `38-VERIFICATION.md` | frontmatter | yes | fixed by `260911-vox` |

`27-UAT.md`'s frontmatter fences sit at file lines **1 and 7**. Its `reason: |` lines sit at **31
and 51** — thirty-odd lines below the closing fence, inside a YAML block in the document **body**.
They reach `audit-uat`'s output regardless. So `audit-uat`'s item parser reads body YAML, and the
same no-block-scalar-support defect applies there.

A third body-block line exists in that one file — `detail: |` at **L86** — and it is **not** known
whether it reaches `audit-uat`'s output. That ambiguity is the point of this todo.

## Why this was not fixed in `260911-vox`

The census that defined that sweep's scope (`filesWithBlockScalars: 68`, `blockScalarFields: 160`)
walked **frontmatter only** — it matched block-scalar lines between the opening and closing `---`
fences and ignored everything after. The body population was therefore invisible to it, and
widening the sweep mid-flight would have meant converting files against a scope nobody had
measured. `260911-vox` recorded the finding and left it here instead.

## What this todo asks for — a census FIRST, not a fix

**Do not sweep anything before measuring.** The history of the todo this one descends from
(`2026-09-11-54-historical-planning-md-frontmatters-fail-to-yaml-parse.md`, now in `completed/`) is
three consecutive rounds of a population moving under the previous author's feet, each round
producing a figure that was wrong by the time someone acted on it. Repeat that mistake here and it
will be the fourth.

1. **Measure the body population.** How many `.planning/*.md` files carry block-scalar fields
   *after* their closing frontmatter fence, how many fields, how many characters. One file
   (`27-UAT.md`) is known to hold 3 such lines; that is a floor of one file, not a census.
2. **Establish which body blocks any GSD tool actually reads.** This is the part that decides
   severity. `audit-uat` demonstrably reads *some* body YAML — it surfaced L31 and L51. It is not
   established which body blocks it reads, by what rule it finds them, or whether any other SDK
   verb (`audit-open`, `phase-lifecycle`, `frontmatter.get`) does the same. A body block no tool
   reads is a legibility problem; one a tool reads is a live contamination problem.
3. **Only then decide the remedy.** The frontmatter convention (single-line, single-quoted,
   apostrophes doubled — quick `260911-hyy`) may or may not be the right shape for body blocks,
   because the body parser's quoting behaviour has not been characterised the way
   `scratchpad/sdktest.mjs` characterised the frontmatter one in `260911-vox`.

## Known cost of the frontmatter remedy, if it is reused here

Flattening a block scalar to one line is **not lossless**. Across `260911-vox`'s 160 fields it
destroyed paragraph structure in 25 and list structure in 3, irreversibly, for any human reading
the raw file. Accept that cost again only against a measured benefit.

## Severity and readiness, justified

- **`severity: medium`.** A live GSD tool (`audit-uat`) emits `"|"` where an operator expects a
  sentence — so this is a real defect with a live consumer, not mere legibility. It stays below
  `major` because the blast radius is bounded and known: two fields, one file, one tool, and the
  operator sees an obviously-wrong `"|"` rather than plausible-but-false prose. If the census in
  step 1 finds the body population is large, or step 2 finds more tools reading it, revisit.
- **`ready: code`.** Census and conversion are desk work — read, measure, convert, verify against
  both parsers. No live gate, no OS dependency, no human decision outstanding.
- **`platform: any`.** No OS dependency.

## Residual worth knowing

`planning-frontmatter-gate.py` covers only `STATE.md` and `ROADMAP.md`. It does not check
frontmatter across the 68 files `260911-vox` swept, and it certainly does not check document
bodies. **Nothing in CI will catch a regression in either population.** Widening the gate's
`TARGETS` remains D3 in quick `260911-j88`, deliberately deferred.
