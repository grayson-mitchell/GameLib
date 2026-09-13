---
phase: quick-260912-csq
plan: 01
subsystem: planning-tooling
tags: [planning-gates, audit-uat, uat-visibility, census, gsd-sdk]
requirements: ['QT-260912-csq']
dependency-graph:
  requires: []
  provides:
    - "An eleventh planning gate that counts UAT items invisible to audit-uat and ratchets the count in four directions"
    - "A measured census: 59 invisible items across 12 UAT-type files, pinned to gsd-sdk v1.42.3's parseUatItems"
  affects:
    - .planning/uat-visibility-gate.py
    - meta/runPlanningGates.py
tech-stack:
  added: []
  patterns:
    - "Ledger literal GENERATED from a machine-written census JSON and injected through loud-failing anchors, never retyped from prose"
    - "Ratchet fails in four directions (regression, new offender, stale-high entry, vanished file) so an improving corpus cannot leave the pin silently stale"
    - "scan() takes its ledger as a parameter so all four ratchet directions are exercisable by the self-test through the real function"
key-files:
  created:
    - .planning/uat-visibility-gate.py
  modified:
    - meta/runPlanningGates.py
decisions:
  - "Recorded the VERIFICATION exclusion as a MEASURED decision with its evidence in the gate docstring, not as a scoping convenience: four VERIFICATION files are emitted by audit-uat WITH ITEMS today, so the pre-narrowing corpus would have booked 17 items as hidden in files the tool visibly surfaces."
  - "Defined verificationEmittedWithItems as the CONTRADICTION SET (emitted AND would-be-ledgered) after measuring that 7 VERIFICATION files are emitted with items, not 4. The plan's expected 4 is the intersection with the old ledger, and it reproduced exactly; the plan's wording was loose, the number was not wrong."
  - "Left the `result:` vocabulary filter (uat.js:154) entirely out of the gate's predicate and confined it to Task 1's comparison layer, so an item the regex matches counts as VISIBLE even when the tool later drops it."
metrics:
  duration: "~55m"
  completed: "2026-09-12"
---

# Quick 260912-csq: an eleventh planning gate makes `audit-uat` suppression LOUD

## What this measures, and what it does NOT fix

**59 UAT items across 12 files are invisible to `gsd-sdk query audit-uat`, and after this task they
are still invisible.** Nothing was restored. `audit-uat` goes on printing a confident, well-formed
audit over the items it can see while saying nothing whatsoever about these 59. What changed is that
the number is now counted, pinned, and ratcheted: a twelfth file joining the population, or a new
invisible item in any of the twelve, turns `pnpm planning-gates` RED and names the file.

Three things this task explicitly does **not** do, each by instruction:

- **`.planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md` REMAINS
  OPEN and unmodified.** This gate makes the suppression loud; it does not restore the hidden items.
  That todo is not closed, not touched, and not superseded by this work.
- **VERIFICATION-file item visibility is a KNOWN UNMEASURED GAP: 55 `### N. ` headings across 16
  VERIFICATION files whose reachability nobody has established.** They may be reachable via
  `parseVerificationItems`' frontmatter array, via its body scrape, or not at all. **No todo was
  filed and no work was planned** — it is recorded here, and in the gate's own docstring, as an open
  question for the operator.
- **No UAT or VERIFICATION content file was edited**, and no body `expected:` block scalar was
  flattened. Quick task `260912-9v7` measured and declined that sweep because `uat render-checkpoint`
  handles those blocks correctly today (`uat.js:81-82`). Editing the documents this gate measures is
  the cheapest way to make it green and the worst available move.

A body `expected:` block scalar is the **only** suppression mechanism anyone has identified, and it
explains only part of the population — **what suppresses the rest remains unestablished.** That is
precisely why the gate's predicate is mechanism-independent: it asks only whether `parseUatItems`'
regex can engage with the text at all. A gate that grepped for the known mechanism would report green
over every item hidden by a mechanism nobody has found yet.

## The ledger

Corpus: every `*UAT*.md` under `.planning/` whose path does not contain `VERIFICATION` — **35 files,
143 candidate item headings, 84 visible, 59 invisible across 12 files.** All three candidate
detectors (unanchored, anchored zero-width, anchored whitespace-required) agree exactly on this
corpus, with **zero divergent headings**; every heading that separated them lived in a VERIFICATION
file the narrowing removes, so the detector choice is defensive rather than load-bearing.

| count | file |
| --- | --- |
| 3 | `05-HUMAN-UAT.md` |
| 4 | `06-HUMAN-UAT.md` |
| 1 | `13-HUMAN-UAT.md` |
| 3 | `23.2-HUMAN-UAT.md` |
| 5 | `26-HUMAN-UAT.md` |
| 1 | `28-HUMAN-UAT.md` |
| 2 | `32-HUMAN-UAT.md` |
| 5 | `34.3-HUMAN-UAT.md` |
| 5 | `34.3-UAT.md` |
| **22** | `34.5-UAT.md` |
| 5 | `34.6-UAT.md` |
| 3 | `260905-d33-UAT.md` (in `.planning/quick/`, not `.planning/phases/`) |
| **59** | **12 files** |

Suppression is currently **all-or-nothing per file**: every one of these twelve has zero visible
items, and every other file in the corpus has zero invisible ones (partial-suppression count measured
as **0**). The gate handles the partial case per-file anyway, because one edit to `34.5-UAT.md`
creates it.

The ledger literal was **generated from `$SCRATCH/census.json` and injected through loud-failing
anchors** — never retyped from the plan's prose table. Transcription error is the named failure mode
here, and it had already produced a 115-vs-114 discrepancy during planning. The gate's own import-time
assertions re-derive `LEDGER_TOTAL` and the file count from the literal, and a verify step re-parsed
the literal out of the source and compared it **per-file** against the census.

**The census reproduced the plan's figures exactly, to the digit** — 35 / 143 / 84 / 59 / 12, plus the
55-across-16 gap and the zero partial-suppression count. This was expected: the orchestrator measured
`git diff 39e1e62bb..HEAD -- '.planning/**/*UAT*.md'` as empty, so no UAT-type file had changed since
the plan's baseline. Nothing was tuned to reach a number.

## The VERIFICATION exclusion is a measured decision, not a scoping convenience

This is the part a future reader is most likely to "fix" wrongly by widening the corpus back.

`parseUatItems` **never runs on VERIFICATION files.** `auditUat` calls it only for files whose name
contains `-UAT` (`uat.js:286-288`); VERIFICATION files are routed to a different reader,
`parseVerificationItems` (`uat.js:302-307`), which runs only when frontmatter `status` is
`human_needed` or `gaps_found`, reads the frontmatter `human_verification:` array first
(`uat.js:183`), and otherwise scrapes a `## Human Verification` body section (`uat.js:231-261`). The
`### N.` / `expected:` / `result:` shape is not their interface at all.

Measured live today, **four VERIFICATION files are emitted by `audit-uat` with items** while the
pre-narrowing 98-file corpus would have booked their headings as invisible:

| file | `audit-uat` emits today | old corpus would claim invisible |
| --- | --- | --- |
| `32-VERIFICATION.md` | 2 | 2 |
| `33-VERIFICATION.md` | 3 | 3 |
| `34-VERIFICATION.md` | 2 | 2 |
| `35-VERIFICATION.md` | 7 | 10 |
| | | **17 items** |

That is **17 items that would have been booked as hidden in four files the tool visibly surfaces** — a
false fact, not merely an unvalidated one. A ledger calling itself a census of what is hidden cannot
carry 17 entries of a category error, and a gate that convicts correct files gets deleted rather than
fixed.

**The narrowing costs no signal**, and this is the control that licenses it: VERIFICATION files
contribute **zero** visible items, so `visible == 84` in the 35-file corpus *and* in the full 98-file
corpus. Measured both ways; both 84. Removing them removed only noise. And none of the twelve ledger
files is emitted by the tool at all, so no entry in the ledger contradicts observable output.

## The live cross-check

The gate re-implements a regex from a package this repo neither commits nor version-locks, so a
re-implementation nobody validated would not be evidence.

- **SDK pinned:** `gsd-sdk` resolves to
  `/Users/graysonmitchell/.npm/_npx/4db0de1f85c3165e/node_modules/get-shit-done-cc/bin/gsd-sdk.js`,
  **version 1.42.3** — read from that package's own `package.json`, not assumed. Every line citation
  in the gate docstring was confirmed against that tree. The stale `9785a834b31d581d` cache (v1.27.0)
  was not read.
- **Intersection validated:** `27-UAT.md` is the one file where comparison is possible. The
  re-implementation and the live tool agree **exactly** — 2 surviving items, test numbers **{4, 5}**.
  **Zero disagreements.** No regex was tuned.

The brief's naive form of this comparison would have failed on all 8 emitted phases, for three
reasons that are confounds rather than regex infidelity. All three were modelled explicitly:

1. **The status filter.** `parseUatItems` pushes an item only when `result` is `pending`, `skipped` or
   `blocked` (`uat.js:154`); everything else parses fine and is discarded. `27-UAT.md` matches **7**
   times and emits **2**. This filter lives in the comparison layer only and is deliberately absent
   from the gate's predicate.
2. **A different reader.** VERIFICATION results come from `parseVerificationItems`, not
   `parseUatItems` — 7 of the 8 emitted results are `type: "verification"`, and the predicate scores
   0 on them by construction.
3. **The milestone filter.** Reconstructed by calling the SDK's own `getMilestonePhaseFilter`
   (`state.js:34-52`) rather than reimplementing the ROADMAP parse: it admits **39 of 62** phase dirs.
   The predicate says three files should emit — `14-UAT.md` (4 surviving), `17-UAT.md` (1) and
   `27-UAT.md` (2) — and exactly the first two are milestone-excluded (`14-guided-claim-flow`,
   `17-steam-on-macos-via-crossover-...`), asserted programmatically. **No file was left
   unexplained.**

**Upstream SDK drift will silently invalidate this gate.** If `parseUatItems` changes, the pinned
pattern keeps measuring the old shape and keeps reporting a cheerful green. The SDK is deliberately
not `require()`d and not vendored — its npx content-hash path is absent in CI, so depending on it
would make the gate fail-open or fail-spuriously, and a vendored copy would drift into asserting
agreement with a fiction.

`result:` vocabulary enforcement was left **out of scope**: of 77 out-of-vocabulary results on visible
items, 50 are `pass`, which `audit-uat` is correct to omit because it audits open items. The genuine
loss is 22 items, and closing it needs a vocabulary decision the operator has not made.

## Negative controls — the gate was observed turning red

A gate never seen failing has not been shown to measure anything. Two controls, both restored:

- **An added invisible item turns the gate RED and names the file.** Appending one block-scalar item
  to the real `27-UAT.md` produced exit 1 and
  `NEW OFFENDER: .planning/phases/27-tauri-shell-walking-skeleton/27-UAT.md has 1 invisible item(s)`.
  Fixture restored and proved byte-identical with `git diff --quiet`.
- **Deleting the gate turns the runner RED.** With `uat-visibility-gate.py` moved aside,
  `pnpm planning-gates` exited 1 with `discovered only 10 planning gate(s), expected at least 11`.
  Gate restored.

`MINIMUM_EXPECTED_GATES` was raised **10 → 11** with a comment block in the same house style as the
`9 -> 10` one, making the specific argument: this gate's entire subject is a suppression that ten
green gates could not see, so its own deletion would be equally invisible.

## Verification

- `python3 .planning/uat-visibility-gate.py --self-test` — **exit 0, 18 cases.**
- `python3 .planning/uat-visibility-gate.py` (the no-argument CI path) — **exit 0**, reporting
  `35 UAT-type file(s), 143 candidate item heading(s), 84 visible to audit-uat, 59 invisible across 12 file(s)`.
- `pnpm planning-gates` — **11/11 planning gates passed**, re-confirmed after both negative controls
  restored their fixtures.

The 18 self-test cases are 10 document-level (3 reject: block-scalar `expected:`, an interposed line
before `result:`, a heading with no `expected:` at all; 7 accept) plus 8 scan-level (both anti-vacuity
halves, the discovery-level VERIFICATION exclusion, all four ratchet directions, and a positive
control). **The accept side is the half that matters**, because a gate that convicts correct documents
gets deleted rather than fixed: body prose containing the words `expected:`/`result:`, a fenced code
block quoting the item shape, a `#### 1.` four-hash sub-heading, a `### 34.13 Decisions Explicitly
Checked for Regression` section heading, an item shape inside frontmatter, an all-visible file, and a
legitimately visible item are all correctly left alone. Every case is discharged through the same
`count_items` / `discover` / `scan` the live walk uses; `scan()` takes its ledger as a parameter
specifically so the ratchet directions are testable through the real function rather than a
restatement of it.

## Findings worth recording

**1. The self-test caught a defect in its own direction-1 case.** The first draft passed a ledger in
which the *all-visible* fixture was over-ledgered, so the case exited non-zero via direction 3
(`TIGHTEN`) rather than direction 1 (`REGRESSION`). Because `_expect_scan_fails` asserts on the
*reason*, not merely on a non-zero exit, it reported the mismatch instead of accepting a green. Fixed
by adding a two-invisible-item fixture so direction 1 fires on a genuinely too-small entry — a
1-invisible file ledgered at 0 would not do, since 0-valued entries are forbidden at import.

**2. The plan's own Task 1 verify block contains a latent `TypeError`.** Its detector-agreement
assertion reads `len(set(map(tuple,[d[k] for k in d])))==1 or len({...})==1`. `byDetector` maps to
integers, so `map(tuple, [143,143,143])` raises `TypeError: 'int' object is not iterable` when `set()`
consumes it — before the `or` can reach the working right-hand clause. Confirmed by running both
clauses in isolation. The right-hand clause was executed and passed, discharging the intended
property; the left clause is dead and would error on any input.

**3. Seven VERIFICATION files are emitted with items, not four.** The plan's Task 1 step 5 expected
"the `type: "verification"` results emitted with items today" to be four files. Measured, `audit-uat`
emits **seven**: `30`(2), `32`(2), `33`(3), `34`(2), `34.13`(7), `35`(7), `38`(34). The plan's four is
the **intersection** of that set with the files the old ledger would have booked as invisible — the
quantity Correction 3's table actually names — and it reproduced exactly: `{32, 33, 34, 35}` with
old-ledger claims summing to **17**. `verificationEmittedWithItems` is therefore recorded as that
contradiction set, with the full seven-file emission recorded alongside as
`verificationEmittedAll`. The plan's wording was loose; its number was not wrong, and nothing was
tuned to reach it.

## Orchestrator corrections applied

| # | Correction | How it was applied |
| --- | --- | --- |
| C1/C2/C3 | Task 3 restructured: no `STATE.md` edit, no commit | `.planning/STATE.md` was **not touched** and **no `git commit` was run**. Confirmed: `git diff HEAD --name-only` lists only `meta/runPlanningGates.py` and the pre-existing dirty todo. The void Task 3 verify blocks (table-grew-by-one, pending-todo equality, every `git show ... HEAD` commit-content check, the one-row and five-cell checks) were **skipped** — each would have fired falsely against a commit that does not exist or a baseline 18 commits stale. |
| C4 | Baseline-dirty exclusion list incomplete | Added `260912-d84` to Task 1's "touched nothing" grep. The full expected baseline-dirty set — modified `2026-09-11-humble-keys-title-wrap-...md`; untracked `.claude/skills/archify/`, `260912-csq-.../`, `260912-d84-.../`, `skills-lock.json` — is **all five present, unmodified and uncommitted**. |
| C5 | Use this session's scratchpad | All artifacts written to `.../de4e5ce0-5c62-42b9-a52b-51d32b1b037d/scratchpad`, not the path in the plan. |
| C6 | Census should reproduce exactly | It did, to the digit: 35 / 143 / 84 / 59 / 12, zero divergent headings, 0 partial suppression, 55-across-16 gap. No regex tuned, no new number quietly adopted. |
| C7 | Date is 2026-09-12 | Used throughout the gate docstring and this SUMMARY (the plan's frontmatter said 2026-09-13). |

## State left for the orchestrator

**Nothing was committed.** The working tree carries, beyond the five baseline-dirty paths:

- `.planning/uat-visibility-gate.py` (new, untracked)
- `meta/runPlanningGates.py` (modified — `MINIMUM_EXPECTED_GATES` 10 → 11 plus its comment block)
- this SUMMARY (untracked, inside the already-untracked quick-task directory)

`STATE.md`, `ROADMAP.md`, every UAT/VERIFICATION content file, and the block-scalar todo are all
untouched. The pending-todo count is unchanged at 24, matching `HEAD` — **no todo was filed**.
