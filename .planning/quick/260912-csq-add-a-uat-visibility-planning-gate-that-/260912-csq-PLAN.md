---
quick_id: 260912-csq
title: Add an eleventh planning gate that makes UAT items invisible to `audit-uat` LOUD — a ratcheting visibility census over UAT-type files, not a content fix
date: 2026-09-13
status: in-progress
baseline_head: 39e1e62bba57b1599369f2a04b7a8ba1b6e55b7c
files_modified:
  - .planning/uat-visibility-gate.py
  - meta/runPlanningGates.py
  - .planning/STATE.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "`pnpm planning-gates` reports 11/11 at HEAD — the new gate is green the day it lands"
    - "`python3 .planning/uat-visibility-gate.py --self-test` passes standalone"
    - "Adding a new invisible item to any UAT-type file turns the gate RED and names the file"
    - "Making an invisible item visible ALSO turns the gate RED, instructing the author to tighten the ledger"
    - "Deleting the gate turns `pnpm planning-gates` RED via MINIMUM_EXPECTED_GATES"
    - "The re-implemented regex is proven to agree with the live `gsd-sdk query audit-uat` on the intersection where agreement is possible"
    - "No ledger entry contradicts observable tool output — VERIFICATION files are excluded by measured decision"
    - "The ledger reads as a census of what is currently hidden: sorted, repo-relative, total asserted"
  artifacts:
    - path: ".planning/uat-visibility-gate.py"
      provides: "The eleventh planning gate: four-direction ratcheting visibility census over UAT-type files"
      contains: "LEDGER"
      min_lines: 300
    - path: "meta/runPlanningGates.py"
      provides: "MINIMUM_EXPECTED_GATES raised 10 -> 11 with a house-style comment block"
      contains: "MINIMUM_EXPECTED_GATES = 11"
    - path: ".planning/quick/260912-csq-add-a-uat-visibility-planning-gate-that-/260912-csq-SUMMARY.md"
      provides: "The record: the ledger, the VERIFICATION exclusion, the known unmeasured gap, and the explicit statement that this does NOT close the block-scalar todo"
  key_links:
    - from: "meta/runPlanningGates.py"
      to: ".planning/uat-visibility-gate.py"
      via: "rglob('*-gate.py') suffix discovery under .planning/"
      pattern: "uat-visibility-gate\\.py"
    - from: ".planning/uat-visibility-gate.py"
      to: "sdk/dist/query/uat.js:150 parseUatItems"
      via: "verbatim regex re-implementation, pinned to gsd-sdk v1.42.3 and cross-checked live in Task 1"
      pattern: "1\\.42\\.3"
---

# An eleventh planning gate: make `audit-uat` suppression LOUD

Creates `.planning/uat-visibility-gate.py` and raises `MINIMUM_EXPECTED_GATES` from 10 to 11.

The gate's predicate is **VISIBILITY**: *can `audit-uat`'s item parser see this item at all.* It is
deliberately **mechanism-independent** — it does not care *why* an item is invisible, because a gate
that greps for the one known mechanism (a body `expected:` block scalar) would report green over most
of the hidden population.

**Corpus: UAT-type files only** — `*UAT*.md` under `.planning/`, excluding any path containing
`VERIFICATION`. **35 files · 143 candidates · 84 visible · 59 invisible across 12 files** at
`39e1e62bb`. Why VERIFICATION files are excluded is a measured decision, recorded as Correction 3
below; it is the single most important thing a future reader of this gate needs to understand.

---

## PLANNER'S CORRECTIONS TO THE BRIEF — READ ALL THREE BEFORE TASK 1

Three findings from planning-time measurement. **Corrections 1 and 2 have been verified by the
operator and are retained in full**, because they are the reasoning that produced Correction 3 and
must not be deleted now that they have been acted on.

### Correction 1 — the live cross-check as specified would fail 8/8, for reasons unrelated to regex fidelity

The brief asks Task 1 to "prove the Python predicate's per-phase visible-item counts AGREE with the
real tool's emitted output, for every phase the tool emits", anticipating exactly one confound (the
milestone filter). **Measured at `39e1e62bb`: the naive form of that comparison disagrees on all 8
emitted phases.** Three independent confounds, only one anticipated:

| # | Confound | Evidence at `39e1e62bb` |
| --- | --- | --- |
| 1 | **`parseUatItems` DISCARDS most matches.** `uat.js:154` pushes an item only when `result` is `pending`, `skipped` or `blocked`. Everything else parses fine and is dropped. | `27-UAT.md`: the regex matches **7**; the tool emits **2**. |
| 2 | **VERIFICATION files are not parsed by `parseUatItems` AT ALL.** `auditUat` calls `parseUatItems` only for `-UAT` files (`uat.js:288`); VERIFICATION files go to `parseVerificationItems` (`uat.js:302-307`), which runs only when frontmatter `status` is `human_needed` or `gaps_found`, reads the `human_verification` frontmatter array first (`uat.js:183`), and otherwise scrapes a `## Human Verification` body section for table / numbered / bullet lines (`uat.js:231-261`). The `### N.` / `expected:` / `result:` shape is **not their interface**. | 7 of the 8 emitted results are `type: "verification"`, with `tool_items > 0` and `my_predicate = 0`. |
| 3 | **The milestone phase filter** (`state.js:34-52`, driven by `#### Phase N:` headings in ROADMAP.md's *current* milestone). | The predicate says `14-UAT.md` (4) and `17-UAT.md` (1) should emit; the tool emits neither. |

**Task 1 therefore runs the corrected cross-check defined below**, which validates the regex against
the only surface where validation is possible and models the other two confounds explicitly rather
than treating them as noise. The brief's "STOP, do not tune the regex" instruction stands in full
force for any disagreement that survives this modelling. The `27-UAT.md` intersection is unaffected
by Correction 3's narrowing — `27-UAT.md` is a UAT-type file and stays in corpus.

### Correction 2 — the full-corpus census was 114 across 28 files, not 115 across 29

Measured over the original 98-file corpus, frontmatter stripped. **The visible count of 84 was
confirmed exactly.** The candidate count depended entirely on how an "item heading" is detected:

| detector | candidates | invisible | files |
| --- | --- | --- | --- |
| `###\s*\d+\.` **unanchored** (closest mirror of the tool's own unanchored regex) | 219 | 135 | 32 |
| `^###\s*\d+\.` anchored, zero-width `\s*` after the dot — **reproduced the brief's figure exactly** | 199 | **115** | **29** |
| `^###\s*\d+\.\s` anchored, **whitespace required** after the dot — **this plan's choice** | 198 | **114** | **28** |

Both deltas were measured and named:

- **Unanchored → anchored (20 headings across 5 files).** `#### 1. QR Code Login` *contains* the
  substring `### 1.`, so the tool's unanchored regex genuinely engages inside four-hash sub-headings
  (`01-VERIFICATION` 5, `05-VERIFICATION` 3, `08.1-VERIFICATION` 5, `35-VERIFICATION` 7). Excluded
  deliberately: `####` is a sub-heading shape, not an item shape.
- **Zero-width → whitespace-required (exactly 1 heading, 1 file).** The entire 115-vs-114 and
  29-vs-28 difference was `34.14-VERIFICATION.md:111` — `### 34.13 Decisions Explicitly Checked for
  Regression`, confirmed byte-exact by the operator via `od -c`. The tool's `\s*` is zero-width, so
  `\d+` captures `34` and the name becomes `13 Decisions Explicitly Checked for Regression`. It is a
  **section heading, not an item**, in a file with **zero** real `### N. ` items. The brief's 115/29
  carried that false positive.

**Under Correction 3's narrowed corpus, all three detectors now agree exactly — 143 candidates, 59
invisible, 12 files, with ZERO divergent headings.** Every heading that separated them lived in a
VERIFICATION file the narrowing removes. The detector choice is therefore **no longer load-bearing
for the ledger**. The whitespace-required form is still used, defensively, and the accept-side
self-test cases for both shapes are still required — so that a four-hash or decimal-section heading
arriving in a UAT file tomorrow cannot silently manufacture a false ledger entry.

### Correction 3 — VERIFICATION files are excluded from the corpus: their counts would be FALSE, not merely unvalidated

Correction 1 under-priced its own consequence. Recording VERIFICATION entries as "unvalidated by the
cross-check" and adding a docstring caveat was not enough. **Measured: those counts contradict
observable tool output.** Cross-referencing `gsd-sdk query audit-uat` against the previously proposed
ledger:

| file | `audit-uat` emits **today** | old ledger claimed **invisible** |
| --- | --- | --- |
| `32-VERIFICATION.md` | 2 items | 2 |
| `33-VERIFICATION.md` | 3 items | 3 |
| `34-VERIFICATION.md` | 2 items | 2 |
| `35-VERIFICATION.md` | 7 items | 10 |

That is **17 items booked as hidden in four files the tool visibly surfaces.** Across all 16
VERIFICATION files the number was not a measurement at all — it counted `### N.` headings through a
parser that never runs on them. A ledger calling itself "a census of what is currently hidden" cannot
carry 55 entries of a category error, and the house style's sharpest rule is that **a gate which
convicts correct files gets deleted rather than fixed.**

**The narrowing costs no signal.** The 84 visible items in the 35-file UAT corpus are the *same* 84
as in the 98-file corpus: **VERIFICATION files contribute ZERO visible items** under this pattern.
Removing them removes only noise. And **none of the 12 ledger files is emitted by the tool**, so —
unlike the VERIFICATION set — no entry contradicts observable output.

### KNOWN UNMEASURED GAP — an open question for the operator, not work to schedule

**VERIFICATION-file item visibility is now explicitly unmeasured: 55 `### N.` headings across 16
files whose reachability nobody has established.** They may be reachable via
`parseVerificationItems`' frontmatter array or its body scrape, or not reachable at all; this task
does not find out.

**Do NOT file a todo for this and do NOT plan the work.** It is recorded here and must be recorded in
the SUMMARY as an open question for the operator to decide on. Stating it as a known gap is the
honest position; silently dropping 16 files would not be, and ledgering them with false numbers would
be worse than either.

---

## The measured ledger — a HYPOTHESIS for Task 1 to confirm, NOT a table to transcribe

Measured at `39e1e62bb` over the UAT-type corpus. **Task 2 must consume Task 1's machine-generated
ledger and never retype this table** — transcription error is the named failure mode here, and it
already produced the 115-vs-114 discrepancy in Correction 2.

| count | file |
| --- | --- |
| 3 | `.planning/phases/05-branding-about-polish/05-HUMAN-UAT.md` |
| 4 | `.planning/phases/06-library-game-status-ux/06-HUMAN-UAT.md` |
| 1 | `.planning/phases/13-keys-waiting-giftable-spares-views/13-HUMAN-UAT.md` |
| 3 | `.planning/phases/23.2-steam-depot-selection-…/23.2-HUMAN-UAT.md` |
| 5 | `.planning/phases/26-steam-key-redemption/26-HUMAN-UAT.md` |
| 1 | `.planning/phases/28-tauri-keyring-…/28-HUMAN-UAT.md` |
| 2 | `.planning/phases/32-tauri-ipc-re-plumb-slice-3-downloads-and-queue/32-HUMAN-UAT.md` |
| 5 | `.planning/phases/34.3-tauri-ipc-re-plumb-slice-6-…/34.3-HUMAN-UAT.md` |
| 5 | `.planning/phases/34.3-tauri-ipc-re-plumb-slice-6-…/34.3-UAT.md` |
| **22** | `.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-…/34.5-UAT.md` |
| 5 | `.planning/phases/34.6-tauri-ipc-re-plumb-slice-9-…/34.6-UAT.md` |
| 3 | `.planning/quick/260905-d33-convert-about-to-an-in-app-animated-moda/260905-d33-UAT.md` |
| **59** | **12 files** |

Note the last row's location — `.planning/quick/`, **not** `.planning/phases/`. The corpus includes
it deliberately, and it is also a file `auditUat` would never open even if it were well-formed, since
`auditUat` reads `paths.phases` only. That asymmetry belongs in the docstring.

---

## SCOPE FENCE — what this task must NOT do

1. **Do NOT flatten or edit ANY body `expected:` block scalar, or ANY UAT/VERIFICATION content
   file.** Quick task `260912-9v7` measured that sweep and **DECLINED** it: flattening body
   `expected:` blocks regresses `uat render-checkpoint`, which handles them correctly today
   (`uat.js:81-82`). **The gate exists to make the suppression LOUD, not to fix it.** The ledger is
   the deliverable; the 59 hidden items stay hidden. Making the gate pass by editing content files is
   the exact wrong move.
2. **Do NOT enforce a `result:` vocabulary.** Of 77 out-of-vocabulary results on *visible* items, 50
   are `pass` — which `audit-uat` is **correct** to omit, because it audits open items, not passes.
   The genuine loss is 22 items (`issue` 12, `ready-for-retest` 5, `partial` 2, `tracked` 2,
   `remediated` 1) and closing it needs a vocabulary decision the operator has not made. **Out of
   scope.** Design consequence: the status filter lives in Task 1's *comparison layer only* and must
   **never** appear in the gate's predicate — an item the regex matches is VISIBLE even if the tool
   later drops it for its `result:` value.
3. **Do NOT modify**
   `.planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md`.
   This gate does **not** close that todo, and the SUMMARY must say so explicitly.
4. **Do NOT file a todo for the VERIFICATION gap and do NOT plan that work.** Record it as an open
   question for the operator, in the plan, the gate docstring, and the SUMMARY.
5. **Do NOT touch `ROADMAP.md`.** Do not touch `STATE.md` beyond appending the one quick-task row.
6. **Never widen the ledger to make a real failure go away.** The ledger ratchets down, never up.

---

## Scratchpad

`/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/58132634-fcf0-488d-8bd7-15f85936a5aa/scratchpad/`

Referred to below as `$SCRATCH`; export it as `SCRATCH` at the start of each task. Nothing here earns
a home in the repo. Never `/tmp`.

---

<tasks>

<task type="auto">
  <name>Task 1: Re-derive the UAT-type census and VALIDATE the re-implemented regex against the live tool — zero repo writes</name>
  <files>$SCRATCH/census.py, $SCRATCH/census.json, $SCRATCH/crosscheck.json, $SCRATCH/auditbaseline.json</files>
  <action>
**This task writes nothing into the repo and makes no commit.** It must be possible to stop here and
still have delivered the measurement.

**Part A — re-derive the census over the UAT-TYPE corpus.** Write `$SCRATCH/census.py`.

Corpus discovery: every `.md` under `.planning/` whose **basename contains `UAT`**, **excluding any
path containing `VERIFICATION`** (case-insensitive). Planner measured **35 files** at `39e1e62bb`;
**re-derive it, do not assume it**. Note that `VERIFICATION` does not contain the substring `UAT`, so
the exclusion is belt-and-braces against a directory name or a compound filename — keep it anyway,
and say in the census output how many paths it actually excluded.

For each file strip frontmatter — first `---` line through the next `---` line; a `---` later in the
body is a horizontal rule and must not re-open the block — and count, **over the body only**:

  - `visible` — matches of the **verbatim** `parseUatItems` pattern at `uat.js:150`:
    `###\s*(\d+)\.\s*([^\n]+)\nexpected:\s*([^\n]+)\nresult:\s*(\w+)(?:\n(?:reported|reason|blocked_by):\s*[^\n]*)?`
    This carries a trailing optional group the brief's transcript omitted. The group is optional, so
    match/no-match should be identical either way — **confirm that equivalence rather than assuming
    it**, by counting under both forms and asserting equality.
  - `candidates` — under **all three** detectors: unanchored `###\s*\d+\.`; anchored zero-width
    `^###\s*\d+\.`; anchored whitespace-required `^###\s*\d+\.\s` (the latter two with `re.MULTILINE`).

**Expected at `39e1e62bb`: 35 files, 143 candidates, 84 visible, 59 invisible across 12 files — and
all three detectors agreeing exactly, with zero divergent headings.** State in writing whether this
reproduces. If any figure differs, yours governs, and you must say which and why before continuing.

**The decisive control: `visible` must be 84 — the SAME 84 as the full 98-file corpus.** That is what
proves the narrowing removed only noise. Verify it by also counting `visible` across the full
`*UAT*.md` + `*VERIFICATION*.md` corpus and asserting both equal 84, i.e. that VERIFICATION files
contribute **zero** visible items. If they contribute any, the narrowing loses signal and you must
STOP and report rather than proceed.

Assert per file that `visible &lt;= candidates`. Any violation is a **hard stop**.

Also report the partial-suppression count (files with `visible &gt; 0` AND `invisible &gt; 0`). Expected
**0**; if non-zero, the structural finding has moved and the SUMMARY must say so.

**Part B — the live cross-check. This is the load-bearing half.**

The gate re-implements a regex from an npx package this repo neither controls nor version-locks. **A
re-implementation nobody validated is not evidence.** This runs once, here, at authoring time — never
in CI, which has no `gsd-sdk`.

1. **Pin the resolution.** Record `readlink -f "$(command -v gsd-sdk)"` and the `version` from that
   package's `package.json`. Expected
   `~/.npm/_npx/4db0de1f85c3165e/node_modules/get-shit-done-cc`, **v1.42.3**. A second, stale cache
   exists at `9785a834b31d581d` (v1.27.0, no `sdk/dist/query/`) — do not read it by accident. **If
   the resolved version is not 1.42.3, every line-number citation in this plan is void** and must be
   re-derived before use.
2. Run `gsd-sdk query audit-uat` and capture to `$SCRATCH/auditbaseline.json`.
3. **Compare only where comparison is possible — the intersection — and say so explicitly.** Filter
   the tool's `results` to `type == "uat"` (the only ones `parseUatItems` produces). For each, apply
   the tool's own status filter — keep only regex matches whose `result` is `pending`, `skipped` or
   `blocked` (`uat.js:154`), **in this comparison layer only, never in the gate's predicate** — and
   require **exact** agreement on both the item COUNT and the set of `test` numbers. At `39e1e62bb`
   this is one file: `27-UAT.md`, 7 regex matches, **2** surviving items, tests **4** and **5**.
4. **Account for every file the predicate says should emit but the tool did not.** Measured: exactly
   two — `14-UAT.md` (4 surviving) and `17-UAT.md` (1 surviving). Reconstruct the milestone-admitted
   phase set from ROADMAP.md's current-milestone `#### Phase N:` headings (`state.js:34-52`) and
   confirm both 14 and 17 are absent from it. **If any OTHER file is unexplained, STOP and report.**
   Treating a milestone-filtered absence as a disagreement would be a false alarm; treating an
   unexplained absence as benign would be the real failure.
5. **Confirm the Correction 3 evidence for the docstring.** From the captured output, record the
   `type: "verification"` results that are emitted **with items today** — expected
   `32-VERIFICATION.md` (2), `33-VERIFICATION.md` (3), `34-VERIFICATION.md` (2),
   `35-VERIFICATION.md` (7). These four are the named evidence that ledgering VERIFICATION headings
   would record a false fact. Also record the size of the unmeasured gap: `### N.` headings in
   VERIFICATION files (expected **55 across 16 files**).
6. **If the counts disagree, STOP and report. Do NOT tune the regex until it matches.** A predicate
   tuned to fit the answer measures nothing.

Write `$SCRATCH/census.json` (per-file ledger under all three detectors, totals, corpus size,
excluded-path count, partial count, the full-corpus `visible` control) and `$SCRATCH/crosscheck.json`
(`sdkResolvedPath`, `sdkVersion`, `intersectionFiles`, `agreements`, `disagreements`,
`milestoneExcluded`, `verificationEmittedWithItems`, `unmeasuredGap`).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; python3 -c "
import json,os
S=os.environ['SCRATCH']
c=json.load(open(S+'/census.json'))
for k in ['files','visible','visibleFullCorpus','byDetector','perFile','partialSuppressionCount']:
    assert k in c, 'census missing '+k
assert c['visible']==84, 'visible count moved: '+str(c['visible'])
assert c['visibleFullCorpus']==84, 'VERIFICATION files contribute visible items - narrowing loses signal: '+str(c['visibleFullCorpus'])
assert c['files']==35, 'UAT-type corpus size moved: '+str(c['files'])
inv={k:v for k,v in c['perFile'].items() if v}
assert sum(inv.values())==59 and len(inv)==12, 'ledger moved: %d across %d'%(sum(inv.values()),len(inv))
d=c['byDetector']
assert len(set(map(tuple,[d[k] for k in d])))==1 or len({tuple(sorted(d[k].items())) if isinstance(d[k],dict) else d[k] for k in d})==1, 'detectors disagree on the narrowed corpus'
x=json.load(open(S+'/crosscheck.json'))
for k in ['sdkResolvedPath','sdkVersion','intersectionFiles','agreements','disagreements','milestoneExcluded','verificationEmittedWithItems','unmeasuredGap']:
    assert k in x, 'crosscheck missing '+k
assert x['sdkVersion']=='1.42.3', 'SDK version drifted: '+str(x['sdkVersion'])
assert not x['disagreements'], 'CROSS-CHECK DISAGREED - STOP, do not tune the regex: '+str(x['disagreements'])
assert len(x['intersectionFiles'])&gt;=1, 'intersection empty - the cross-check validated nothing'
assert len(x['verificationEmittedWithItems'])==4, 'Correction 3 evidence moved: '+str(x['verificationEmittedWithItems'])
print('OK 35 files, 59 invisible across 12, visible=84 both corpora, sdk=1.42.3, gap='+str(x['unmeasuredGap']))
"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; test "$(git status --porcelain | grep -vc 'humble-keys-title-wrap\|skills-lock.json\|.claude/skills/archify\|260912-csq')" = "0" &amp;&amp; echo "TASK 1 TOUCHED NOTHING IN THE REPO - correct"</automated>
  </verify>
  <done>
`$SCRATCH/census.json` carries the UAT-type per-file ledger under all three detectors: 35 files, 143
candidates, `visible == 84`, 59 invisible across 12 files, all three detectors agreeing, plus the
decisive control that the full 98-file corpus also yields `visible == 84` (VERIFICATION files
contribute zero). `$SCRATCH/crosscheck.json` records the pinned SDK path and version 1.42.3, a
non-empty intersection with **zero** disagreements, `14-UAT.md` and `17-UAT.md` accounted for by the
milestone filter, the four VERIFICATION files emitted with items today, and the size of the
unmeasured gap. `git status` proves the repo was not modified.
  </done>
</task>

<task type="auto">
  <name>Task 2: Author the gate from Task 1's machine-generated ledger, and raise the floor 10 -> 11</name>
  <files>.planning/uat-visibility-gate.py, meta/runPlanningGates.py</files>
  <action>
**Generate the `LEDGER` literal programmatically from `$SCRATCH/census.json`. Never retype the table
from this plan's prose** — transcription error is the named failure mode, and it already produced the
115-vs-114 discrepancy Correction 2 had to reconcile.

**Model `.planning/todos/todo-frontmatter-gate.py` closely** — it is the house-style template;
`.planning/planning-frontmatter-gate.py` is the second reference and this gate's sibling. Required
properties:

- **A long module docstring explaining WHY the gate exists**, and — the part that earns its keep —
  **what NOT to do when it fails**. State plainly: the correct response to a red gate is to fix the
  item so `audit-uat` can see it, **or** to tighten the ledger when an item has been made visible. It
  is **never** to widen the ledger, and it is **never** to flatten a body `expected:` block scalar
  (quick `260912-9v7` measured and declined that sweep; flattening regresses `uat render-checkpoint`,
  which handles those blocks correctly at `uat.js:81-82`).

- **THE VERIFICATION EXCLUSION IS A MEASURED DECISION, NOT AN OVERSIGHT — say so, with the
  evidence.** This is the docstring's most important section. A future reader will otherwise "fix"
  the corpus by widening it back and reintroduce 55 false entries. Record:
  (i) `auditUat` calls `parseUatItems` only for `-UAT` files (`uat.js:288`); VERIFICATION files are
  routed to `parseVerificationItems` (`uat.js:302-307`), which reads frontmatter `human_verification`
  or scrapes a `## Human Verification` body section — the `### N.`/`expected:`/`result:` shape is
  **not their interface**;
  (ii) **four VERIFICATION files are emitted by `audit-uat` WITH ITEMS today** — name them with their
  emitted counts (`32-VERIFICATION.md` 2, `33-VERIFICATION.md` 3, `34-VERIFICATION.md` 2,
  `35-VERIFICATION.md` 7) — so ledgering their `### N.` headings as "invisible" would record a **false
  fact** about files the tool visibly surfaces;
  (iii) the narrowing **costs no signal**: VERIFICATION files contribute **zero** visible items, so
  the 84 visible in this corpus are the same 84 as in the full 98-file corpus.

- **THE KNOWN UNMEASURED GAP**, stated in the docstring as an open question: **55 `### N.` headings
  across 16 VERIFICATION files whose reachability nobody has established.** They may be reachable via
  `parseVerificationItems`' frontmatter array or body scrape, or not at all. This gate does not
  measure them and does not claim to. **No todo is filed and no work is scheduled** — it is the
  operator's call.

- **Record the other honest limits**:
  (a) the **SDK PIN** — `gsd-sdk` **v1.42.3**, resolved at
  `~/.npm/_npx/4db0de1f85c3165e/node_modules/get-shit-done-cc`, regex from `sdk/dist/query/uat.js:150`,
  cross-checked live on 2026-09-13 — and state plainly that **upstream drift will silently invalidate
  this gate**. Do **not** `require()` or vendor the SDK: the npx content-hash path is absent in CI, so
  depending on it would make this gate fail-open or fail-spuriously, and a vendored copy would drift
  into asserting agreement with a fiction (the reasoning `planning-frontmatter-gate.py` records for
  its own parser choice).
  (b) `auditUat` reads `paths.phases` only, under a milestone filter — so `.planning/quick/` items
  (e.g. `260905-d33-UAT.md`) are in this corpus but would never be opened by the tool even if
  well-formed.
  (c) this gate measures **engagement**, not emission: `parseUatItems` additionally discards every
  item whose `result` is not `pending`/`skipped`/`blocked` (`uat.js:154`). That vocabulary question is
  **deliberately out of scope** (50 of 77 out-of-vocabulary results are `pass`, which `audit-uat` is
  correct to omit), so a matched item counts as VISIBLE even when the tool later drops it.

- **All paths resolved from `__file__`, NEVER from cwd** — `meta/runPlanningGates.py` runs each gate
  with the gate's own directory as cwd, a human runs it from the repo root. Assert
  `PLANNING_DIR.name == ".planning"` explicitly, as both reference gates do.

- **Corpus discovery in code**: basename contains `UAT`, path does not contain `VERIFICATION`
  (case-insensitive). Assert the exclusion predicate explicitly and comment it with Correction 3's
  reason, so widening it is a deliberate, visible act.

- **A pure predicate function over file text**, used by BOTH the live walk and the self-test — never
  a reimplementation in the test. Suggested shape: `count_items(text) -> (candidates, visible)`, no
  I/O, no `sys.exit`. Strip frontmatter before counting; **body-only parsing is load-bearing**,
  because these documents are prose *about* UAT items and a whole-file read would convict correct
  files on their own explanatory text.

- **Use the whitespace-required detector** `^###\s*\d+\.\s` (`re.MULTILINE`) for candidates and the
  **verbatim** `uat.js:150` pattern for visible. Comment that all three detectors currently agree on
  this corpus (143/59/12, zero divergent headings) because every heading that separated them lived in
  a VERIFICATION file — so the choice is defensive, not load-bearing, and the two accept-side cases
  below exist to keep it that way.

- Per file, assert `visible &lt;= candidates`; a violation is a **hard failure**, never a silent clamp.

**The four-direction ratchet.** All required, all reported in ONE run — the walk never stops at the
first finding, because fixing a 12-file corpus one CI run at a time is how it never gets fixed:
  1. a file's invisible count **EXCEEDS** its ledger entry → FAIL (regression);
  2. a file **ABSENT** from the ledger has ANY invisible item → FAIL (new offender);
  3. a file's count **DROPS BELOW** its ledger entry → FAIL, instructing the author to tighten the
     ledger to the new number. A ratchet that only catches regressions rots upward-stale and silently
     stops measuring;
  4. a ledger entry whose **file no longer exists** → FAIL (stale entry). A ledger that names files
     that are gone is not a census.

**The LEDGER is simultaneously the CENSUS.** Write it as one: a dict literal of sorted, repo-relative
paths to counts, readable, with `LEDGER_TOTAL` and the file count asserted against
`sum(LEDGER.values())` / `len(LEDGER)` at import time. Head it with a comment naming the measurement
date (2026-09-13), the baseline sha (`39e1e62bb`), the corpus definition, and the fact that
suppression is currently all-or-nothing per file — with the note that the gate nevertheless handles
partial suppression per-file, because one edit to `34.5-UAT.md` creates that case.

**Anti-vacuity, both halves:** FAIL if zero UAT-type files are discovered, and FAIL if zero items are
matched across the whole corpus (`visible == 0` means the regex stopped engaging — an upstream-drift
tripwire, not a green).

**Self-test — reject side AND accept side. The accept side matters most**, because a gate that
convicts a correct file gets deleted rather than fixed. Every case discharged through the same
`count_items` the live walk uses. At minimum:

  - *reject:* an item whose `expected:` is a block scalar (the one known mechanism);
  - *reject:* an item whose `result:` is not on the line immediately after `expected:`;
  - *reject:* a `### N.` heading with no `expected:` line at all;
  - *reject* (scan-level, against a real temp dir): an empty corpus; and a corpus of real files with
    zero visible items — each exercising the real scan function, with its `GATE FAILED:` message
    **captured, not printed**, so a literal `GATE FAILED:` line never appears in a passing run and
    misleads the next reader who greps the log (both reference gates do exactly this);
  - *accept:* a legitimately **visible** item — the positive control for every reject above;
  - *accept:* **body prose that merely looks like an item** — a paragraph containing the words
    `expected:` and `result:`, and a fenced code block quoting the item shape as documentation. This
    is the case a careless whole-file grep convicts;
  - *accept:* a `#### 1. Some sub-heading` four-hash heading — must NOT count as a candidate;
  - *accept:* a `### 34.13 Decisions Explicitly Checked for Regression` section heading — must NOT
    count as a candidate. Both of these shapes are absent from the UAT corpus today; the cases exist
    so that one arriving tomorrow cannot manufacture a false ledger entry;
  - *accept:* a file whose `### N.` items are ALL visible (zero invisible, absent from the ledger);
  - *accept* (discovery-level): a path containing `VERIFICATION` must be **excluded from the corpus**
    — proving Correction 3's narrowing is actually in force and not just described in the docstring.

Route every mutation of a base fixture through a `mutate()`-style helper that **fails loudly when its
anchor is missed** (see `planning-frontmatter-gate.py:404`) — a stale anchor makes `str.replace()`
silently no-op and hands a REJECT case an unmutated, still-valid document.

**No `--write` flag.** No-argument invocation IS the CI path. `--self-test` runs only the self-test.
**Self-test runs FIRST in CI mode**, matching both reference gates.

**Then raise the floor.** In `meta/runPlanningGates.py` change `MINIMUM_EXPECTED_GATES` from `10` to
`11`, and add a comment block in the **same house style as the existing `9 -> 10` block** — same
voice, same length, placed immediately after it. It must name the eleventh gate and explain **why
leaving the floor at 10 would let it be deleted with everything else still reporting green.** Make
the specific argument: this gate's entire subject is a suppression that **ten green gates could not
see**, so its own deletion would be equally invisible — precisely the property this constant exists
to hold.

**Do not commit in this task.**
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; python3 .planning/uat-visibility-gate.py --self-test</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; python3 .planning/uat-visibility-gate.py</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; pnpm planning-gates 2>&amp;1 | tail -3 | grep -q '11/11 planning gates passed' &amp;&amp; echo "11/11 CONFIRMED"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; grep -qE '^MINIMUM_EXPECTED_GATES = 11$' meta/runPlanningGates.py &amp;&amp; grep -q '10 -> 11' meta/runPlanningGates.py &amp;&amp; echo "floor raised with its house-style comment block"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; python3 -c "
import json,os,re,pathlib
S=os.environ['SCRATCH']
src=pathlib.Path('.planning/uat-visibility-gate.py').read_text()
c=json.load(open(S+'/census.json'))
per={k:v for k,v in c['perFile'].items() if v}
ns={}
exec(compile(re.search(r'LEDGER\s*[:=].*?\n\}', src, re.S).group(0), 'x', 'exec'), ns)
led=ns['LEDGER']
assert sum(led.values())==sum(per.values())==59, 'ledger total wrong: %d vs %d'%(sum(led.values()),sum(per.values()))
assert len(led)==len(per)==12, 'ledger file count wrong: %d vs %d'%(len(led),len(per))
assert not [k for k in led if 'VERIFICATION' in k.upper()], 'VERIFICATION file in the ledger - Correction 3 not applied'
for tok in ['1.42.3','uat.js:150','uat.js:302','32-VERIFICATION','35-VERIFICATION']:
    assert tok in src, 'docstring missing required evidence token: '+tok
print('OK ledger=59 across 12, no VERIFICATION entries, SDK pinned, Correction 3 evidence present')
"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; cp .planning/phases/27-tauri-shell-walking-skeleton/27-UAT.md "$SCRATCH/27-UAT.bak" &amp;&amp; printf '\n### 99. A deliberately invisible probe item\nexpected: |\n  multi-line, so the regex cannot complete\nresult: pending\n' >> .planning/phases/27-tauri-shell-walking-skeleton/27-UAT.md; python3 .planning/uat-visibility-gate.py > "$SCRATCH/probe.out" 2>&amp;1; RC=$?; cp "$SCRATCH/27-UAT.bak" .planning/phases/27-tauri-shell-walking-skeleton/27-UAT.md; git diff --quiet -- .planning/phases/27-tauri-shell-walking-skeleton/27-UAT.md &amp;&amp; test "$RC" != "0" &amp;&amp; grep -q '27-UAT' "$SCRATCH/probe.out" &amp;&amp; echo "NEGATIVE CONTROL PASSED: an added invisible item turns the gate RED and names the file; fixture restored byte-identical"</automated>
  </verify>
  <done>
`.planning/uat-visibility-gate.py` exists, passes `--self-test` and the no-argument CI path, and
carries a docstring recording: the SDK pin (v1.42.3, `uat.js:150`, cross-checked 2026-09-13); the
"do not flatten block scalars" instruction; **the VERIFICATION exclusion as a measured decision with
its four named emitted files and the zero-visible-items evidence**; the known unmeasured gap (55
headings / 16 files) as an open question with no todo filed; and the remaining limits. The LEDGER
matches Task 1's census exactly — 59 items across 12 files, **zero VERIFICATION entries** — with
`LEDGER_TOTAL` asserted at import. The four-direction ratchet, both anti-vacuity checks, and the full
reject/accept self-test (including the discovery-level VERIFICATION-exclusion case) are present.
`MINIMUM_EXPECTED_GATES = 11` with a house-style `10 -> 11` comment block. `pnpm planning-gates`
reports **11/11**. The negative control proves the gate turns RED on a newly added invisible item and
that the probe fixture is restored byte-identical.
  </done>
</task>

<task type="auto">
  <name>Task 3: Record it and commit with explicit pathspecs only</name>
  <files>.planning/STATE.md, .planning/quick/260912-csq-add-a-uat-visibility-planning-gate-that-/260912-csq-SUMMARY.md</files>
  <action>
**Write the SUMMARY.** It must lead with what the gate measures and what it does **not** fix — not
with the work done. Required content:

  - the ledger: **59 invisible items across 12 UAT-type files**, corpus 35 files / 143 candidates /
    84 visible;
  - **the VERIFICATION exclusion and why it is a measured decision, not a scoping convenience.** Name
    the four files `audit-uat` emits with items today (`32`, `33`, `34`, `35`-VERIFICATION) and state
    that the old 98-file corpus would have booked 17 items as hidden in those four alone — a false
    fact about files the tool visibly surfaces. State the no-signal-lost control: VERIFICATION files
    contribute **zero** visible items, so 84 is unchanged;
  - **the KNOWN UNMEASURED GAP**, stated plainly as an open question for the operator: **55 `### N.`
    headings across 16 VERIFICATION files whose reachability nobody has established.** Say explicitly
    that **no todo was filed and no work was planned** for it, by instruction;
  - **the cross-check result**, with the SDK path and version, the intersection it validated
    (`27-UAT.md`, 2 items, tests 4 and 5), and the three confounds that make the brief's naive form
    impossible: the `pending|skipped|blocked` status filter, `parseVerificationItems` being a
    different reader, and the milestone filter (accounting for `14-UAT.md` and `17-UAT.md`);
  - that upstream SDK drift will silently invalidate the gate;
  - **an explicit statement that this task does NOT close**
    `.planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md`. The
    gate makes suppression loud; it does not restore the hidden items. That todo stays open and
    unmodified;
  - that a body `expected:` block scalar explains only part of the population and **what suppresses
    the rest remains unestablished** — which is why the predicate is mechanism-independent;
  - that no UAT/VERIFICATION content file was edited, and that `result:` vocabulary enforcement was
    deliberately left out of scope.

**Append ONE row to `.planning/STATE.md`'s `### Quick Tasks Completed` table.**

Measured geometry at `39e1e62bb`: heading at line **5548**, column header at **5550**, separator at
**5551**, first data row at **5552**, **last data row at 5847** (`260912-bul`). Line 5848 is blank;
`## Deferred Items` begins at **5849**. **Append immediately after line 5847** — inside the table, NOT
at end of file, and NOT into the narrative scalars.

**TRAP — there is a SECOND, unrelated table at EOF** (lines 7591-7598) using a four-column
`| date | fast | description | ✅ |` shape. **That is NOT this table. Do not append there.**

**READ a complete recent data row first** (5846 and 5847) and match its conventions exactly rather
than inventing them. The row has **exactly five cells** and begins with `|` at column 0:

`| <quick id> | <Description> | <Date> | <Status> | <Directory> |`

  - **cell 1** — `260912-csq`
  - **cell 2** — Description; recent rows open with a bolded finding sentence. **Must not contain a
    literal `|`.** A handful of historical rows do, which splits them into more than five cells —
    that is **pre-existing damage, OUT OF SCOPE: do not repair it and do not file anything about it.**
  - **cell 3** — `2026-09-13`
  - **cell 4** — Status. Recent convention is `Verified (<what was independently re-measured>)`:
    free prose in parentheses naming the specific thing checked, not a bare word. Older rows use
    `complete` / `Complete` / `Verified`; match the recent parenthetical form.
  - **cell 5** — exactly
    `[260912-csq-add-a-uat-visibility-planning-gate-that-](.planning/quick/260912-csq-add-a-uat-visibility-planning-gate-that-/)`
    Link text AND target both carry the full directory name; target prefixed `.planning/quick/`, with
    a trailing slash. **The trailing hyphen in the directory name is real — do not tidy it away.**
    `.planning/quick/` is the live convention (263 rows); `./quick/` (13 rows) is the GSD workflow
    template's form and is **not** what this file uses.

**NEVER use gsd-sdk to write STATE.md or ROADMAP.md — it corrupts them.** Do not touch `STATE.md`'s
frontmatter or its ~28KB single-quoted narrative scalars; a careless rewrite truncates them silently.

**Commit with explicit pathspecs only. NEVER `gsd-sdk query commit` — it stages the entire tree.**
Three paths are dirty at baseline and must stay uncommitted and unmodified:
`.planning/todos/completed/2026-09-11-humble-keys-title-wrap-sort-label-and-owned-badge-contrast-unverified-live.md`,
`.claude/skills/archify/`, `skills-lock.json`. Use `git commit --only -- <explicit paths>` naming
exactly: the gate, `meta/runPlanningGates.py`, `.planning/STATE.md`, and this quick task's PLAN and
SUMMARY. **Verify the resulting commit's file list with `git show --name-only --format= HEAD` and
stop if any of the three appears.**
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; pnpm planning-gates 2>&amp;1 | tail -3 | grep -q '11/11 planning gates passed' &amp;&amp; echo "11/11 at final state"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; test "$(git show --name-only --format= HEAD | grep -c 'humble-keys-title-wrap\|skills-lock.json\|.claude/skills/archify')" = "0" &amp;&amp; echo "commit excludes all three baseline-dirty paths"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; git show --name-only --format= HEAD | grep -q 'uat-visibility-gate.py' &amp;&amp; git show --name-only --format= HEAD | grep -q 'meta/runPlanningGates.py' &amp;&amp; test "$(git show --name-only --format= HEAD | grep -c 'ROADMAP.md')" = "0" &amp;&amp; echo "gate + floor committed; ROADMAP untouched"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; test "$(git status --porcelain | grep -vc 'humble-keys-title-wrap\|skills-lock.json\|.claude/skills/archify')" = "0" &amp;&amp; echo "working tree clean apart from the three known baseline paths"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; T=.planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md &amp;&amp; git diff HEAD --quiet -- "$T" &amp;&amp; test "$(git show --name-only --format= HEAD | grep -c 'audit-uat-reads-block-scalars')" = "0" &amp;&amp; echo "block-scalar todo untouched"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; S=.planning/quick/260912-csq-add-a-uat-visibility-planning-gate-that-/260912-csq-SUMMARY.md &amp;&amp; grep -qi 'does not close\|not close' "$S" &amp;&amp; grep -q '55' "$S" &amp;&amp; grep -qi 'unmeasured' "$S" &amp;&amp; grep -q '32-VERIFICATION' "$S" &amp;&amp; echo "SUMMARY records the todo non-closure, the 55-heading unmeasured gap, and the Correction 3 evidence"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; test "$(git show --name-only --format= HEAD | grep -c '^.planning/phases/\|^.planning/milestones/')" = "0" &amp;&amp; test "$(ls .planning/todos/pending/*.md | wc -l | tr -d ' ')" = "$(git ls-tree --name-only 39e1e62bba57b1599369f2a04b7a8ba1b6e55b7c .planning/todos/pending/ | wc -l | tr -d ' ')" &amp;&amp; echo "NO content file committed; no new todo filed for the VERIFICATION gap"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; test "$(grep -cE '^\| 260912-csq \|' .planning/STATE.md)" = "1" &amp;&amp; echo "exactly one 260912-csq row present"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; test "$(awk -F'|' '/^\| 260912-csq \|/{print NF-2}' .planning/STATE.md)" = "5" &amp;&amp; echo "the appended row has exactly five cells"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; R='/^### Quick Tasks Completed/{f=1;next} f&amp;&amp;/^## /{f=0} f&amp;&amp;/^[|]/{n++} END{print n+0}' &amp;&amp; W=$(awk "$R" .planning/STATE.md) &amp;&amp; B=$(git show 39e1e62bba57b1599369f2a04b7a8ba1b6e55b7c:.planning/STATE.md | awk "$R") &amp;&amp; test "$((W-B))" = "1" &amp;&amp; echo "Quick Tasks table grew by exactly one row ($B -> $W); ragged historical rows counted as lines, so they cannot make this red"</automated>
  </verify>
  <done>
The SUMMARY leads with what the gate measures and what it does not fix; records the 59/12 ledger, the
VERIFICATION exclusion with its four named emitted files and the zero-visible-items control, the
55-heading / 16-file **known unmeasured gap** stated as an open question with no todo filed, the
cross-check result with its SDK pin and three named confounds, the upstream-drift caveat, and an
explicit statement that the block-scalar todo is NOT closed. One `2026-09-13` row is appended to
STATE.md's `### Quick Tasks Completed` table, appended after line 5847 in the real five-cell shape
with the measured Directory-link and Status conventions, and the table grew by exactly one row.
The commit contains only the gate, the runner, STATE.md, and this
task's PLAN and SUMMARY — none of the three baseline-dirty paths, no ROADMAP.md, and **no
UAT/VERIFICATION content file**. `pnpm planning-gates` is 11/11.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repo working tree to git index | three unrelated baseline-dirty paths could be swept into this task's commit |
| npx content-hash SDK cache to this gate's correctness | the re-implemented regex is pinned to a package this repo neither commits nor version-locks |
| `.planning/` content files to the gate | the cheapest way to silence this gate is to edit the documents it measures — which destroys a behaviour `uat render-checkpoint` relies on |
| the gate's corpus definition to its own truthfulness | widening discovery back to VERIFICATION files reintroduces 55 entries that contradict observable tool output |
| Task 1's measurement to Task 2's ledger literal | a hand-transcribed ledger is a false census that still reports green |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-CSQ-01 | Tampering | Task 3's git commit | mitigate | `git commit --only -- <explicit paths>`; `gsd-sdk query commit` forbidden; Task 3 verify greps `git show --name-only --format= HEAD` for all three dirty paths and requires a count of 0 |
| T-CSQ-02 | Spoofing | the re-implemented `uat.js:150` regex asserting agreement with a fiction | mitigate | Task 1 drives the real `gsd-sdk` binary and requires exact agreement on the intersection; vendoring or `require()`-ing the SDK forbidden; path + version 1.42.3 pinned into `crosscheck.json` AND the gate docstring; STOP-not-tune on disagreement |
| T-CSQ-03 | Tampering | the LEDGER widened to silence a real failure | mitigate | docstring forbids it in the same voice as `todo-frontmatter-gate.py`; the ratchet is four-directional so downward drift and stale entries are ALSO red; `LEDGER_TOTAL` and file count asserted at import |
| T-CSQ-04 | Denial of service | a gate that is red on arrival, or that convicts correct files, gets deleted rather than fixed | mitigate | the ledger makes it green at HEAD; seven accept-side self-test cases (body prose, fenced code, four-hash heading, `### 34.13`, all-visible file, visible item, VERIFICATION-path exclusion) prove it does not convict correct documents |
| T-CSQ-05 | Destruction of data | "fixing" the gate by flattening body `expected:` block scalars regresses `uat render-checkpoint` | mitigate | scope fence in this plan AND in the gate's own docstring, citing `260912-9v7`'s declined sweep and `uat.js:81-82`; Task 3 verify asserts no file under `.planning/phases/` or `.planning/milestones/` is in the commit |
| T-CSQ-06 | Elevation of privilege | the gate silently stops measuring and reports a vacuous green | mitigate | dual anti-vacuity (zero files discovered; zero visible items corpus-wide) plus the stale-ledger-entry check; `MINIMUM_EXPECTED_GATES = 11` makes deletion of the gate itself red |
| T-CSQ-07 | Tampering | transcription error in the ledger | mitigate | the LEDGER literal is generated from `$SCRATCH/census.json`, never retyped; Task 2 verify re-parses the literal and asserts total, file count, and absence of VERIFICATION keys |
| T-CSQ-08 | Repudiation | the VERIFICATION exclusion being mistaken later for an oversight and "fixed" | mitigate | Correction 3 retained in this plan; docstring states it as a measured decision carrying the four emitted filenames and the zero-visible-items control; a discovery-level self-test case proves the exclusion is in force |
| T-CSQ-09 | Information disclosure | the 55-heading VERIFICATION gap being silently dropped and forgotten | mitigate | recorded as a KNOWN UNMEASURED GAP in the plan, the gate docstring, and the SUMMARY, framed as an open question for the operator; Task 3 verify greps the SUMMARY for it |
| T-CSQ-SC | Tampering | npm/pip/cargo installs | accept | this plan installs nothing — no package-manager task exists, so no legitimacy gate is required |
</threat_model>

<verification>
- **The no-signal-lost control is what licenses the narrowing.** VERIFICATION files contribute **zero**
  visible items, so `visible == 84` in both the 35-file and the 98-file corpus. Task 1 asserts both.
  If VERIFICATION files ever contribute a visible item, the narrowing loses signal and the executor
  must STOP rather than proceed.
- **The negative control is the gate's real proof.** A gate that has never been observed turning red
  has not been shown to measure anything. Task 2 appends a deliberately invisible item to a real
  file, requires the gate to fail and to name that file, then restores the fixture and proves
  restoration with `git diff --quiet`.
- **The cross-check is one-directional and says so.** It validates the regex on the intersection
  where `parseUatItems` is genuinely the reader (`27-UAT.md`). Every non-comparable case is named
  with its reason rather than ignored.
- **No ledger entry may contradict observable tool output.** Task 2 asserts zero VERIFICATION keys in
  the LEDGER — the mechanical form of Correction 3.
- **Task 1 mutates nothing.** Measurement that edits the thing it measures is not measurement.
- **`pnpm planning-gates` is 10/10 at `39e1e62bb`**, captured before Task 2 edits anything, so any
  red can be attributed honestly rather than claimed "pre-existing" against an unnamed baseline.
- **Nothing is verified by reading a rendered `cat`.** A rendered read of exactly this kind of region
  is on record in this repo as having silently dropped a substring. Compare programmatically.
- The gate must pass **both** invocation paths — `--self-test` standalone and the no-argument CI path.
</verification>

<success_criteria>
- `.planning/uat-visibility-gate.py` exists, is discovered by the runner's `*-gate.py` suffix glob,
  and `pnpm planning-gates` reports **11/11**.
- The corpus is UAT-type only; the LEDGER carries **59 items across 12 files** and **zero**
  VERIFICATION entries.
- The gate fails in all four directions: count exceeds ledger, unledgered file with any invisible
  item, count drops below ledger, and ledger entry whose file is gone.
- The gate fails on a vacuous corpus and on zero visible items corpus-wide.
- The gate does **not** convict correct documents: body prose, fenced-code examples, four-hash
  sub-headings, `### 34.13`-shaped section headings, all-visible files, and VERIFICATION paths are
  all correctly left alone.
- The docstring states the VERIFICATION exclusion as a **measured decision**, naming the four files
  emitted with items today and the zero-visible-items control, and records the **55-heading /
  16-file known unmeasured gap** as an open question with no todo filed.
- The regex is validated against the live `gsd-sdk` v1.42.3 on a non-empty intersection with zero
  disagreements.
- `MINIMUM_EXPECTED_GATES = 11` with a comment block in the same house style as `9 -> 10`.
- No UAT/VERIFICATION content file is edited; no body `expected:` block is flattened; no `result:`
  vocabulary is enforced; the block-scalar todo is untouched and the SUMMARY says so.
- Commit is path-scoped; `ROADMAP.md` untouched; the three baseline-dirty paths still uncommitted and
  unmodified.
</success_criteria>

<output>
Write `.planning/quick/260912-csq-add-a-uat-visibility-planning-gate-that-/260912-csq-SUMMARY.md`
when done. Lead with the ledger total, what the gate measures, and what it explicitly does **not**
fix — not with the work done. The first paragraph must state that the 59 items remain hidden, that
VERIFICATION-file visibility is a known unmeasured gap of 55 headings across 16 files, and that
`2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md` remains open.
</output>
