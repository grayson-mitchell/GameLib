---
quick_id: 260911-vox
title: Block-scalar frontmatter sweep — convert 160 block-scalar fields across 68 `.planning/` files to single-line single-quoted scalars
date: 2026-09-11
status: in-progress
resolves_todo: .planning/todos/pending/2026-09-11-54-historical-planning-md-frontmatters-fail-to-yaml-parse.md
---

# Block-scalar frontmatter sweep

Discharges the one remaining item in
`.planning/todos/pending/2026-09-11-54-historical-planning-md-frontmatters-fail-to-yaml-parse.md`.
Everything else that todo tracked is already closed: the parser convention was decided in quick
`260911-hyy`, `planning-frontmatter-gate.py` was fixed in `260911-j88`, and the two genuine record
defects among the original 53 js-yaml failures are repaired. **What remains is the sweep.**

## The population, re-measured live at HEAD `0265026ba`

The todo records "59 fields / 55,178 chars across 66 files". **That is an undercount and must not
be quoted.** It came from a census that walked only top-level frontmatter keys. Re-measured at HEAD
with a census that walks nested values too (`scratchpad/census2.mjs`, output in `census2.json` /
`census2.txt`):

| | todo's recorded figure | measured at `0265026ba` |
| --- | --- | --- |
| `.planning/` frontmatter-bearing `.md` files | 2444 | **2876** |
| js-yaml parse failures (COSMETIC, out of scope) | 51 | **51** |
| files holding block-scalar frontmatter fields | 66 | **68** |
| block-scalar frontmatter fields | 103 | **160** |
| fields read as a bare indicator through the SDK | 59 | **160 — every one of them** |
| characters of narrative invisible to every GSD tool | 55,178 | **at least 87,962** |

Indicator breakdown: `>` x113, `|` x27, `>-` x19, `|-` x1. No `+` chomping and no explicit indent
indicators anywhere in the population — those four shapes are the whole of it.

**64 of the 160 are top-level keys; 96 are nested inside list items** (`  - reason: >`,
`human_verification_resolved.[1].method_note`, and so on). Those 96 are what the todo's census
never saw. Most-affected keys: `prior_state` x27, `notes` x22, `reason` x11, `description` x11,
`disposition_note` x8, `result` x6. Longest single value: 4,967 chars.

103 of the 160 sit in files js-yaml can parse, so their lengths are measurable — that is where
87,962 comes from. The other **57 sit in the two files js-yaml cannot parse**, so their true
character count is unknown and 87,962 is a floor, not a total.

## The live consumer the todo could not find — it exists, and this measures it

The todo's severity justification rests on a bounded check that "found no codepath reading
`description`, `notes`, `disposition_note`, `evidence`, `rationale`, `resolution` or `gap_*` from
frontmatter." That check was scoped to **`audit-open`**. It never checked `audit-uat`.

`gsd-sdk query audit-uat` at HEAD emits **59 items across 8 phases, and 4 fields in that output are
the bare indicator string**:

```
27  27-UAT.md           test 4  ->  reason     "|"
27  27-UAT.md           test 5  ->  reason     "|"
38  38-VERIFICATION.md  test 6  ->  expected   ">"
38  38-VERIFICATION.md  test 6  ->  why_human  ">"
```

That is a live GSD tool emitting `"|"` where an operator expects a sentence. The todo's
`severity: medium` reasoning is wrong on its stated premise, and the closure note must say so.

**But the two pairs are NOT the same population.** Phase 38's two are frontmatter fields and this
sweep fixes them. Phase 27's two are **not in frontmatter at all**: `27-UAT.md`'s frontmatter is
lines 2-6, while its `reason: |` lines sit at file lines 31 and 51, inside a YAML block in the
document **body** that `audit-uat`'s item parser also reads. That is a second, separate population
this sweep does not touch. See "Out of scope".

That asymmetry is a gift to verification. It gives the sweep a **positive** post-condition (38's
two fields must carry real prose afterwards) and a **negative** one (27's two must still read
`"|"`), which together prove the sweep landed exactly where this plan says it does.

## Target shape — already decided, already live, not up for debate

Quick `260911-hyy` settled it and `.planning/STATE.md` ships it today: **a single-quoted scalar on
ONE line with zero newlines.** `STATE.md`'s `stopped_at` is 7,501 chars on one line and
`last_activity` is 15,790. Length is not a blocker and is not a reason to reach for a block scalar.
Apostrophes are doubled (`''`); js-yaml folds that back to one character and the SDK's parser does
not, and that one-character-per-apostrophe divergence is the **accepted** price of the convention
(`planning-frontmatter-gate.py` deliberately declines to convict it).

Confirmed empirically during planning (`scratchpad/sdktest.mjs`) that the target shape survives
everything this population will throw at it: the SDK's hand-rolled parser read a 565-char
single-quoted value correctly at **two levels of nesting inside a list item**, with an embedded raw
`"`, a `:`, a `#`, a `|`, and a doubled `''`, and `sdkValue.replace(/''/g, "'")` equalled the
js-yaml value exactly.

## The transform — programmatic, line-slice, never retype

Per field:

1. Find the field line matching `^(\s*)(-\s+)?([A-Za-z0-9_-]+):[ \t]*([|>][-+]?\d*)[ \t]*$`. Let
   `N` = length of group 1 plus the `- ` prefix (group 2) if present.
2. Collect the body: consecutive following lines that are blank OR indented `> N`. Stop at the
   first non-blank line indented `<= N`. **Drop trailing blank lines from the collected body and
   LEAVE them in the file** — they are spacing between fields, not content.
3. `flat = body.join('\n').replace(/\s+/g, ' ').trim()`.
4. Rewrite the field line by slicing everything up to and including the `:` **byte-for-byte from
   the original line**, then appending a space, a `'`, `flat.replace(/'/g, "''")`, and a closing
   `'`. Never rebuild the prefix — `  - reason:` must stay `  - reason:`.
5. Delete the consumed body lines.

Because step 3 collapses to a single line, the fold-vs-literal and chomping differences between
`>`, `>-`, `|` and `|-` all produce the same result. That is why one rule covers all four
indicators and why this needs no per-indicator code path.

## The cost, stated plainly — this conversion is NOT lossless

Flattening **destroys paragraph structure in 25 fields** (they contain blank-line paragraph breaks)
and **list structure in 3** (bullet or numbered lists). After the sweep those read as one
continuous run of prose to a human opening the raw `.md`. No markdown tables are affected — 0 in
the population — which is the one shape that would have become unreadable rather than merely worse.

This is a real, irreversible readability regression for a human reader. It is accepted because the
SDK's parser is line-based, has no block-scalar support at all, and no other shape satisfies both
parsers. **The SUMMARY must repeat this.** Do not let the record describe the sweep as a pure win.

`.planning` is listed in `.prettierignore` (line 29), so the long single lines carry no rewrap risk.

## Out of scope — say so, do not quietly widen

- **The 51 js-yaml-only failures stay broken.** Quick `260911-j88` proved repairing them is the
  wrong remedy: 51 of them contain an apostrophe, and single-quoting them to satisfy js-yaml would
  inject the `''` divergence into 51 SDK reads that are **correct today**. Do not touch them.
- **Do not widen `planning-frontmatter-gate.py`'s `TARGETS`** to hold the line over these 68 files
  afterwards. That is D3 in quick `260911-j88`, deliberately deferred. **This sweep ships with no
  gate behind it** — a regression in any of the 68 files will turn nothing red. Record that
  residual honestly in the SUMMARY and in the todo closure note.
- **The body-YAML population found above is a separate finding.** `27-UAT.md`'s two `reason: |`
  fields live in a body block, not frontmatter; the census that produced the 160 scanned
  frontmatter only, so the body population is **unmeasured**. File a todo for it in Task 3. Do not
  sweep it here and do not guess its size.

## Verification — this is the work, not a formality

Every one of the 160 fields must clear all of the following. Write the verifier as a script; do not
eyeball diffs. **Memory records that a rendered `cat` of exactly this kind of region has been
observed silently dropping a substring — compare bytes programmatically, never by reading a
terminal render.**

- **V1 — js-yaml value preservation** (66 files, 103 fields). Re-parse after the rewrite and assert
  `norm(newValue) === norm(oldValue)` where `norm = s => s.replace(/\s+/g,' ').trim()`. Not a
  tautology: it catches quote-escaping errors, YAML re-interpretation of the flattened text, and
  truncation.
- **V2 — SDK value correctness** (all 68 files, all 160 fields). Re-parse with the SDK's
  `extractFrontmatter`, assert the value at the same key path is no longer a bare indicator, and
  assert `sdkValue.replace(/''/g, "'") === jsYamlValue` for every field where a js-yaml value
  exists. Then re-run the census and require `bareThroughSDK: 0` and `blockScalarFields: 0`
  corpus-wide.
- **V3 — the two js-yaml-failing files** (57 fields). V1 is unavailable for
  `phases/38-.../38-VERIFICATION.md` (50 fields) and `phases/34.4.1-.../34.4.1-VERIFICATION.md`
  (7). Substitute: diff the **full SDK-parsed object** before vs after and assert it is identical
  **except** that each affected leaf changed from the bare indicator to the expected flattened
  text. That does not require the SDK's read of a malformed file to be *correct*, only *unchanged
  apart from the intended leaves* — which is the right assertion here.

  Also assert both files' js-yaml status is **unchanged** (both still fail). Measured during
  planning, both failures originate **outside** any block scalar: 38's is a `bad indentation of a
  mapping entry` inside the long unquoted plain `score:` scalar on frontmatter line 4; 34.4.1's is
  the same error inside a double-quoted `discharge:` scalar around frontmatter line 84. The sweep
  touches neither, so "still fails" is a prediction with a reason behind it. **If either file's
  js-yaml status changes in either direction, stop and surface it** — that means the transform
  moved something it should not have.
- **V4 — live tool gate on Phase 38.** `38-VERIFICATION.md` holds the entire deferred-hardware
  backlog in one `human_verification` array, and its own `audit_tool_note` warns that breaking it
  makes the backlog vanish with nothing turning red. Capture `gsd-sdk query audit-uat` before and
  after, and assert **all four** of:
  1. Phase 38 item count is **34**, unchanged. A flat or zero count means the array was dropped —
     hard stop, revert.
  2. Phase 38 `status` is still `human_needed`.
  3. Overall shape unchanged: 8 phases, 59 items (27:2, 30:2, 32:2, 33:3, 34:2, 34.13:7, 35:7,
     38:34).
  4. The bare-indicator scan over the audit output drops from **4 fields to exactly 2** — Phase
     38's `test 6 expected` and `test 6 why_human` now carry real prose, while Phase 27's two
     `reason` fields **still read `"|"`** because they are body-block, not frontmatter. Both halves
     must hold. Only the first holding would mean the sweep over-reached.

  A planning-time baseline sits at `scratchpad/audit-uat-before.json`, but **re-capture your own**
  — the working tree may have moved.
- **V5 — nothing outside frontmatter moved.** For every touched file, assert the bytes after the
  closing `---` fence are **byte-identical**.
- **V6 — gates.** `pnpm planning-gates` and `python3 .planning/planning-frontmatter-gate.py`.
  **Capture a BEFORE baseline of both.** Memory records that this repo's gates have re-reddened
  silently, so the real assertion is "no gate that was green is now red", not an unanchored "green
  afterwards". Blast-radius check done during planning: of the 10 `*-gate.py` files in the repo,
  **none reads any file in the 68**. They read `*-PORTED-CHANNELS.md`, `IPC-PORT-INVENTORY.md`,
  `SEAM.md`, `34.4.1-SEAM-PARITY-SWEEP.md`, `STATE.md`/`ROADMAP.md`, and `todos/pending/*.md`, and
  no file in the population is any of those — in particular, zero of the 68 live in
  `todos/pending/`. Exposure is expected to be nil; prove it rather than assume it.

## Tasks

<task type="auto">
  <name>Task 1: Re-assert the population, write the converter, dry-run it</name>
  <files>scratchpad/convert.mjs, scratchpad/verify.mjs, scratchpad/check-audit.mjs (session scratchpad, NOT the repo)</files>
  <action>
    Work in
    `/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/0ef28f39-89f4-4ac6-b0ce-4043b7ab6569/scratchpad/`.
    **Write nothing into `meta/` or `.planning/`.** This is a one-shot historical sweep, not a
    shipped tool. The only repo writes across this whole plan are the 68 swept files, this plan's
    SUMMARY, and the todo move in Task 3.

    Preconditions, re-asserted at execution time. Do not trust this plan's numbers blindly — this
    todo's own history is three rounds of a population moving under the previous author's feet.
    - `git rev-parse HEAD`; note it. Planning baseline was `0265026ba`.
    - Re-run `scratchpad/census2.mjs`. It imports js-yaml from the repo's `node_modules` and
      `extractFrontmatter` from the resolved SDK at
      `~/.npm/_npx/4db0de1f85c3165e/node_modules/get-shit-done-cc/sdk/dist/query/frontmatter.js`.
      Expect `filesWithBlockScalars: 68`, `blockScalarFields: 160`, `bareThroughSDK: 160`,
      `charsLost: 87962`, `bareWithUnknownLen: 57`. **If any differs, stop and report before
      converting anything** — a moved population is exactly how this todo went wrong twice.
    - Capture `gsd-sdk query audit-uat` to `audit-uat-before.json`; record per-phase item counts
      and the 4 bare-indicator fields. That is the V4 baseline.
    - Capture `pnpm planning-gates` and `python3 .planning/planning-frontmatter-gate.py` output to
      files. Record which gates are green **before** anything is touched. That is the V6 baseline.

    Write `convert.mjs` implementing the five-step transform above, exactly. Slice the field-line
    prefix from the original line; never rebuild it. Give it a **dry-run mode** that writes nothing
    and emits, per field, the file, line, key path, indicator, body line count and flattened
    length, plus a summary tally.

    Write `verify.mjs` covering V1, V2, V3 and V5 against a before/after snapshot pair. It must
    read the before-state from a byte snapshot that `convert.mjs` copies into `scratchpad/before/`,
    not from git, so it works regardless of staging state. It must exit non-zero on any failure and
    name the failing file and key path.

    Write `check-audit.mjs` covering V4: load `audit-uat-before.json` and `audit-uat-after.json`,
    compare the per-phase `phase:status:count` shape for exact equality, and count fields whose
    value matches `/^[|>][-+]?\d*$/` in each. Require before = 4 and after = 2, and require the two
    survivors to be Phase 27's `reason` fields specifically — not merely two of anything.
  </action>
  <verify>
    <automated>cd "$SCRATCH" &amp;&amp; node census2.mjs   # must print filesWithBlockScalars 68, blockScalarFields 160, bareThroughSDK 160, charsLost 87962</automated>
    <automated>cd "$SCRATCH" &amp;&amp; node convert.mjs --dry-run   # must account for 160 fields in 68 files, tally: &gt; x113, | x27, &gt;- x19, |- x1</automated>
    <automated>git status --porcelain .planning   # must show NO modification from this task</automated>
  </verify>
  <done>
    Population re-asserted at the executor's own HEAD, or the difference reported and resolved.
    `audit-uat` and both gate baselines captured to scratchpad files. `convert.mjs --dry-run`
    accounts for exactly 160 fields in 68 files with the expected indicator tally. `verify.mjs` and
    `check-audit.mjs` exist. Nothing in the repo has been modified.
  </done>
</task>

<task type="auto">
  <name>Task 2: Apply the sweep, discharge V1-V5, commit path-scoped</name>
  <files>the 68 `.planning/` files enumerated in scratchpad/census2.json</files>
  <action>
    Snapshot each target file's original bytes to `scratchpad/before/`, then run `convert.mjs` for
    real. Then run `verify.mjs` and require V1, V2, V3 and V5 to pass with zero exceptions:

    - V1: 103 fields across the 66 js-yaml-parseable files, `norm(new) === norm(old)`.
    - V2: all 160 fields non-bare through the SDK, and
      `sdkValue.replace(/''/g,"'") === jsYamlValue` wherever a js-yaml value exists. Then re-run
      `census2.mjs` and require `bareThroughSDK: 0` and `blockScalarFields: 0`.
    - V3: for `38-VERIFICATION.md` and `34.4.1-VERIFICATION.md`, a full SDK-object diff before vs
      after — identical except at the 50 and 7 intended leaves — **and** both files still fail
      js-yaml with the same error at the same location. If a js-yaml status flips in either
      direction, stop and report; do not proceed.
    - V5: for all 68 files, the bytes after the closing `---` fence are identical.

    Then V4 via `check-audit.mjs`. **A flat or zero Phase 38 count is a hard stop: revert with
    `git checkout -- <the 68 paths>` and report.**

    Do not trust a rendered diff for the two malformed files. Compare bytes and parsed objects in
    code.

    Commit **path-scoped**. The working tree carries unrelated uncommitted work
    (`M .planning/todos/completed/2026-09-11-humble-keys-...md`, untracked `.claude/skills/archify/`,
    `skills-lock.json`) that must **not** be absorbed. Stage only the 68 paths and commit with
    `--only` naming those paths. Then verify with `git show --stat HEAD` that the commit contains
    exactly the swept files and nothing else, and with `git status --porcelain` that the three
    unrelated entries are still uncommitted.
  </action>
  <verify>
    <automated>cd "$SCRATCH" &amp;&amp; node verify.mjs   # V1 + V2 + V3 + V5; exits non-zero on any failure</automated>
    <automated>cd "$SCRATCH" &amp;&amp; node census2.mjs   # must now print bareThroughSDK 0 and blockScalarFields 0</automated>
    <automated>gsd-sdk query audit-uat &gt; "$SCRATCH/audit-uat-after.json" &amp;&amp; cd "$SCRATCH" &amp;&amp; node check-audit.mjs   # V4: shape identical, bare fields 4 -&gt; 2, survivors are Phase 27's two reason fields</automated>
    <automated>git show --stat HEAD | tail -3   # must name only swept .planning files; git status --porcelain must still list the 3 unrelated entries</automated>
  </verify>
  <done>
    All 160 fields converted. V1, V2, V3, V4 and V5 all pass. Corpus-wide bare-indicator count is
    0. Phase 38 still reports 34 `human_needed` items and its test 6 `expected` / `why_human` now
    carry real prose; Phase 27's two body-block `reason` fields still read `"|"`. One path-scoped
    commit contains exactly the 68 files; the three unrelated working-tree entries are untouched.
  </done>
</task>

<task type="auto">
  <name>Task 3: Gates, the out-of-scope todo, and the todo closure</name>
  <files>
    .planning/todos/pending/2026-09-11-54-historical-planning-md-frontmatters-fail-to-yaml-parse.md (moved to completed/),
    .planning/todos/pending/&lt;new&gt;-audit-uat-reads-block-scalars-in-document-bodies.md,
    .planning/quick/260911-vox-block-scalar-frontmatter-sweep-convert-1/260911-vox-SUMMARY.md
  </files>
  <action>
    **V6.** Run `pnpm planning-gates` and `python3 .planning/planning-frontmatter-gate.py`. Compare
    against the Task 1 baseline: assert no gate that was green before is red now. If a gate was
    already red at baseline, say so by name in the SUMMARY rather than reporting an unqualified
    "gates green" — "pre-existing" is a claim about a chosen baseline and must name the sha.

    **File the out-of-scope todo** for the body-YAML population. It must record: `audit-uat`'s item
    parser reads YAML blocks in the document **body**, not only frontmatter; `27-UAT.md` lines 31
    and 51 carry `reason: |` in a body block and reach `audit-uat`'s output as the literal `"|"`
    today; this sweep deliberately did not touch them because the census that defined its scope
    walked frontmatter only; **the body population has never been measured**, so the todo must ask
    for a census before any fix. Frontmatter per CLAUDE.md — `severity`, then `platform`, then
    `ready`, bare lowercase, in that order. `severity: medium`, `platform: any`, `ready: code`.

    **Close the original todo.** `git mv` it from `pending/` to `completed/` and append a dated
    closure note recording, explicitly:
    - The corrected population: **68 files / 160 fields / at least 87,962 chars** — NOT the
      59 fields / 55,178 chars the todo's body records. State that the old figure was an undercount
      produced by a top-level-only census.
    - **96 of the 160 were nested inside list items and were previously uncounted.**
    - The correction to the todo's own severity reasoning: its "no live consumer found" check was
      scoped to `audit-open` and never checked `audit-uat`, which was emitting the bare indicator
      for 4 fields at HEAD `0265026ba` — 2 from Phase 38's frontmatter (fixed here) and 2 from
      `27-UAT.md`'s body (out of scope, todo filed).
    - The **un-gated residual**: `planning-frontmatter-gate.py` still covers only `STATE.md` and
      `ROADMAP.md`, so nothing holds the line over these 68 files. Widening `TARGETS` remains D3 in
      quick `260911-j88`, deliberately out of scope.
    - The **readability cost**: paragraph structure lost in 25 fields, list structure in 3.

    **Write the SUMMARY.** It must repeat the readability cost and the un-gated residual verbatim
    — those are the two facts most likely to be lost if only the headline number survives. Record
    the V4 before/after bare-field count (4 -> 2) as the evidence that the sweep reached a live
    tool's output rather than only a file on disk.

    Commit path-scoped again: the todo move, the new todo, and the SUMMARY. Do not absorb the three
    unrelated working-tree entries.
  </action>
  <verify>
    <automated>pnpm planning-gates   # compare against the Task 1 baseline; no green-to-red transitions</automated>
    <automated>python3 .planning/planning-frontmatter-gate.py</automated>
    <automated>git show --stat HEAD | tail -5   # must name only the todo move, the new todo, and the SUMMARY</automated>
    <automated>git status --porcelain   # the 3 unrelated entries must still be present and uncommitted</automated>
  </verify>
  <done>
    `pnpm planning-gates` and the frontmatter gate show no green-to-red transition against the Task
    1 baseline. The body-YAML todo exists in `todos/pending/` with correct triage frontmatter. The
    original todo is in `todos/completed/` carrying a closure note with the corrected population,
    the 96-nested correction, the `audit-uat` severity correction, the un-gated residual, and the
    readability cost. SUMMARY written, repeating the cost and the residual. Commit path-scoped.
  </done>
</task>

## Success criteria

1. All 160 block-scalar frontmatter fields across all 68 files are single-line single-quoted
   scalars. A fresh census reports `blockScalarFields: 0` and `bareThroughSDK: 0` corpus-wide.
2. No recorded narrative was lost: V1 holds for all 103 measurable fields, V3 holds for the other
   57, V5 holds for all 68 files.
3. `gsd-sdk query audit-uat` reports the identical 8-phase / 59-item shape, Phase 38 still at 34
   `human_needed` items, and its bare-indicator field count drops from 4 to exactly 2 — the two
   survivors being `27-UAT.md`'s body-block `reason` fields.
4. Both js-yaml-failing files still fail js-yaml, with the same error at the same location.
5. No gate that was green at the Task 1 baseline is red afterwards.
6. Three path-scoped commits; the three unrelated working-tree entries are never absorbed.
7. The original todo is closed with the **corrected** population, and the body-YAML finding is
   filed rather than silently dropped.
