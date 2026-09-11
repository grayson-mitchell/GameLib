---
quick_id: 260911-vox
title: Block-scalar frontmatter sweep — 160 fields across 68 `.planning/` files converted to single-line single-quoted scalars
date: 2026-09-11
status: complete
baseline_head: 0265026ba
sweep_commit: e890f658c
resolves_todo: .planning/todos/completed/2026-09-11-54-historical-planning-md-frontmatters-fail-to-yaml-parse.md
filed_todo: .planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md
---

# Block-scalar frontmatter sweep — SUMMARY

Every block-scalar frontmatter field in `.planning/` is now a single-line single-quoted scalar. A
fresh corpus census reports `blockScalarFields: 0` and `bareThroughSDK: 0`. The one remaining item
in the parent todo is discharged.

## Two facts that must not be lost if only the headline number survives

### 1. The conversion is NOT lossless

Flattening each block scalar to one line **destroyed paragraph structure in 25 fields and list
structure in 3**, irreversibly, for any human reading the raw `.md`. Those fields now read as one
continuous run of prose. Measured independently at execution time against the before-snapshots —
25 / 3 / 0, matching the plan's figures exactly. 0 markdown tables were affected, which is the one
shape that would have become unreadable rather than merely worse.

This is accepted **because the SDK's parser is line-based, has no block-scalar support at all, and
no other shape satisfies both parsers — not because it costs nothing.** Do not let a later record
describe this sweep as a pure win.

### 2. The sweep ships with NO gate behind it

`planning-frontmatter-gate.py` covers only `STATE.md` and `ROADMAP.md`. **Nothing checks the 68
files this sweep touched**, so a regression in any of them will turn nothing red. Widening the
gate's `TARGETS` remains D3 in quick `260911-j88`, deliberately out of scope here. Blast-radius
check confirmed at execution: of the swept files, exactly one lives under `todos/`, and it is in
`completed/` — `todo-frontmatter-gate.py` scopes to `pending/` only, so zero of the 68 are read by
any gate in the repo.

## What was actually swept

Population re-asserted live at my own HEAD `0265026ba` before touching anything — it reproduced
the plan's figures exactly, so no scope drift occurred:

| | todo's recorded figure | measured and swept |
| --- | --- | --- |
| files holding block-scalar frontmatter fields | 66 | **68** |
| block-scalar frontmatter fields | 103 | **160** |
| fields read as a bare indicator through the SDK | 59 | **160 — every one** |
| characters of narrative invisible to every GSD tool | 55,178 | **at least 87,962** |

Indicators: `>` x113, `|` x27, `>-` x19, `|-` x1. **64 fields were top-level keys; 96 were nested
inside list items** and had never been counted by any previous census — that is the entire reason
the todo's recorded figure was an undercount. Most-affected keys: `prior_state` x27, `notes` x22,
`reason` x11, `description` x11, `disposition_note` x8, `result` x6. Flattened text totals 116,220
chars across the 160; 87,962 is a floor because 57 fields sit in the two files js-yaml cannot parse
and their true length is unmeasurable.

Commit `e890f658c`: 68 files changed, 160 insertions, 1,637 deletions.

## Evidence the sweep reached a live tool, not just files on disk

This is the load-bearing result. `gsd-sdk query audit-uat` was captured before and after:

**Bare-indicator fields in audit-uat's output: 4 -> exactly 2.**

| audit-uat path | source | before | after |
| --- | --- | --- | --- |
| `results[7].items[5].expected` | `38-VERIFICATION.md` frontmatter | `">"` | real prose |
| `results[7].items[5].why_human` | `38-VERIFICATION.md` frontmatter | `">"` | real prose |
| `results[0].items[0].reason` | `27-UAT.md` **body block** | `"\|"` | **still `"\|"`** |
| `results[0].items[1].reason` | `27-UAT.md` **body block** | `"\|"` | **still `"\|"`** |

Both halves had to hold. The positive half proves the sweep reached a live consumer's output; the
negative half proves it did not over-reach into the body-block population it was scoped to leave
alone. Overall audit shape unchanged: 8 phases / 59 items (27:2, 30:2, 32:2, 33:3, 34:2, 34.13:7,
35:7, 38:34), and **Phase 38 still reports 34 `human_needed` items** — the hard-stop condition,
since that file holds the entire deferred-hardware backlog in one array and its own
`audit_tool_note` warns that losing it turns nothing red.

## The todo's severity reasoning was wrong on its stated premise

The parent todo justified `severity: medium` on a bounded check that found "no codepath that reads
`description`, `notes`, `disposition_note`, `evidence`, `rationale`, `resolution` or `gap_*` from
frontmatter at all." **That check was scoped to `audit-open` and never checked `audit-uat`**, which
was emitting the bare indicator for 4 fields at HEAD `0265026ba`. The live consumer the todo could
not find existed the whole time. Recorded in the closure note.

## Unplanned finding: the SDK FABRICATES keys out of prose

Not in the plan, found by verification. The SDK's line-based parser did not merely return the bare
indicator — where a block-scalar body line happened to contain `word:`, it read that as a mapping
key. The sweep eliminated **19 phantom keys across 12 files**, every one proven absorbed into its
converted parent value (containment asserted programmatically, not eyeballed).

The clearest case, in `38-VERIFICATION.md`: the sentence "That is now fixed: meta/trayIconVariants.ts
generates icon-tray-{dark,light}{,@2x,@3x}.png from the same hue-segmented mask..." sat inside a
`prior_state: >` body. The SDK truncated it at "That is now " and manufactured a leaf
`human_verification.[0].fixed` from the remainder. Other fabricated keys: `VERDICT`, `ARITHMETIC`,
`RESOLVED`, `UNCHANGED`, `PASS`, `FAIL`, and the bare date `2026-08-22`. Affected files included
`23.2-VERIFICATION.md`, `28-VERIFICATION.md`, `34.2-HUMAN-UAT.md` (4), `34.2-VERIFICATION.md`,
`34.4.1-LIVE-GATE.md` (2), `34.4.2-LIVE-GATE-RERUN-3.md`, `34.5-LIVE-GATE-RERUN-2.md` (3),
`34.5-LIVE-GATE-RERUN-4.md`, `34.9-LIVE-GATE.md`, `34.9-VERIFICATION.md` (2), `37-VERIFICATION.md`,
`38-VERIFICATION.md`.

So the damage was worse than the todo recorded: not only invisible narrative, but
**plausible-looking structure that was never written**, in files whose whole purpose is to be an
accurate record.

## Verification discharged

All checks were scripted and compared programmatically. Nothing was verified by reading a terminal
render — memory records a rendered `cat` of exactly this kind of region silently dropping a
substring, and that hazard is live here.

- **V1 — js-yaml value preservation.** 103 fields across the 66 parseable files. Whole-object
  equality under whitespace normalisation, not just the target leaves. PASS.
- **V2 — SDK correctness.** 0 bare indicators across all 68 files; 103 exact
  `sdkValue.replace(/''/g,"'") === jsYamlValue` pairs. Corpus census re-run: `blockScalarFields: 0`,
  `bareThroughSDK: 0`. PASS.
- **V3 — the two js-yaml-failing files.** 57 fields. Full SDK-object diff before vs after,
  identical except at the intended leaves plus the proven phantoms. Both files **still fail
  js-yaml**, same reason, same column, byte-identical offending line. PASS.
- **V4 — live tool gate.** As tabulated above. PASS.
- **V5 — nothing outside frontmatter moved.** Bytes after the closing `---` fence byte-identical in
  all 68 files. PASS.
- **V6 — gates.** See below. PASS.

### One V3 result that needed judgement, not a hard stop

`34.4.1-VERIFICATION.md`'s js-yaml error moved from line 83 to line 68. Its *status* did not
change: same reason (`bad indentation of a mapping entry`), same column (151), and the offending
`discharge:` line is **byte-identical** before and after. The line *number* shifted purely because
the sweep removed 15 lines above it. The verifier was tightened to compare reason + column + line
bytes rather than the raw line number, and to report renumbering separately. The hard stop
("js-yaml status changes in either direction") did not fire, and both files still fail as predicted.

The other V3 finding — one SDK leaf disappearing in `38-VERIFICATION.md` — turned out to be the
phantom-key defect described above, and generalised into a corpus-wide check that found 18 more.

## Gates — baseline named, per the honesty rule

Captured **before** anything was touched, at HEAD `0265026ba`:

| gate | before | after |
| --- | --- | --- |
| `pnpm planning-gates` | 10/10 passed, exit 0 | 10/10 passed, exit 0 |
| `python3 .planning/planning-frontmatter-gate.py` | 0 targets failed, exit 0 | 0 targets failed, exit 0 |

The per-gate PASS/FAIL line sets diff **identical** before vs after. Both gates were green at the
baseline, so this is an unqualified green with the baseline named — **not** a "pre-existing failure"
claim. No green-to-red transition.

## Out of scope — stated, not quietly widened

- **The 51 js-yaml-only failures stay broken.** Post-sweep census still reports `jsyamlFail: 51`,
  unchanged. Quick `260911-j88` proved repairing them is the wrong remedy: 51 contain an apostrophe,
  and single-quoting them to satisfy js-yaml would inject the `''` divergence into 51 SDK reads that
  are correct today.
- **The body-YAML population is filed, not fixed.** `audit-uat`'s item parser reads YAML blocks in
  document **bodies**, not only frontmatter. `27-UAT.md`'s frontmatter fences sit at lines 1 and 7
  while its `reason: |` lines sit at 31 and 51 — and a third, `detail: |` at line 86, whose reach
  into `audit-uat`'s output is unknown. The census that defined this sweep's scope walked
  frontmatter only, so **the body population has never been measured**. Filed as
  `.planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md`, which
  asks for a census *before* any fix rather than guessing a size. Nothing was scaled down by filing
  it — it was never in this plan's scope.
- **Gate `TARGETS` not widened.** D3 in quick `260911-j88`, deliberately deferred. See fact 2 above.

## Commits

| commit | contents |
| --- | --- |
| `e890f658c` | the 68 swept `.planning/` files (160 insertions, 1,637 deletions) |
| (this task's second commit) | todo move to `completed/` + closure note, and the new body-YAML todo |

Both path-scoped with `git commit --only -- <paths>`. The three unrelated working-tree entries
(`M .planning/todos/completed/2026-09-11-humble-keys-...md`, untracked `.claude/skills/archify/`,
untracked `skills-lock.json`) were never staged and remain uncommitted. `SUMMARY.md` and `PLAN.md`
are deliberately left uncommitted for the orchestrator's docs commit.

## Scope completed in full

All three tasks executed; nothing was left out. The parent todo's remaining item is discharged, its
closure note carries the corrected population (68 / 160 / >=87,962, with the 96-nested correction),
the `audit-uat` severity correction, the un-gated residual and the readability cost.

## Self-Check: PASSED

All three created/modified records exist on disk; both commits (`e890f658c`, `ffd25adec`) exist in
git; `e890f658c` contains exactly 68 files. Final gate run after the todo changes diffs **identical**
to the Task 1 baseline (10/10, exit 0; frontmatter gate 0 failures, exit 0), and the final corpus
census still reports `blockScalarFields: 0` / `bareThroughSDK: 0` / `jsyamlFail: 51`.

Not run: `graphify update .`. The 68 swept files are graph nodes, but the plan enumerated the only
sanctioned repo writes (the 68 files, this SUMMARY, the todo move), and `graphify update` writes
`graphify-out/` and is known to delete `graph.html`. Left for a caller who wants it.
