---
created: 2026-09-11
title: "56 fields across 64 `.planning/` files read as the literal `|-`/`>-` through every GSD tool — the 53 js-yaml failures were the wrong population"
area: planning-records
severity: medium
platform: any
ready: code
source: "quick task 260911-ayu Task 3 (M-11); RE-SCOPED 2026-09-11 after quick 260911-hyy proved the original remedy harmful; RE-SCOPED AGAIN 2026-09-11 by quick 260911-j88 after the gate itself was fixed and the real population was measured"
files:
  - .planning/planning-frontmatter-gate.py
resolves_phase: null
---

# 56 block-scalar fields across 64 files are invisible to every GSD tool — the 53 js-yaml failures were cosmetic

## RE-SCOPED 2026-09-11 (quick 260911-j88) — read this before acting on any older version

This todo has been re-scoped twice now. Each time, the previously-recorded population turned out
to be the wrong one to act on. Read "The corrected population" below before doing anything.

## The corrected population — the 53 js-yaml failures are COSMETIC, not the defect

The original (260911-ayu) and first-rescope (260911-hyy) versions of this todo both centered on
**53 of 2444** `.planning/` frontmatter-bearing `.md` files that fail to parse under `js-yaml`.
That count is real and reproducible, but quick 260911-j88 measured, live at baseline
`1b8dda82734b56c30a8509fc7f4a35c926ad1b2b`, that **fixing those 53 for js-yaml would have made
things worse, not better**:

- The SDK's own hand-rolled frontmatter reader (`sdk/dist/query/frontmatter.js`'s
  `parseFrontmatterYamlLines`, used by `gsd-sdk query frontmatter.get`, `audit-uat`, `progress`,
  `state`, `phase-lifecycle`, `workstream`, and `audit-open`/`audit.cjs`) already reads **all 53
  of them correctly** — every one yields at least 3 keys, cosmetic failure only, zero live impact.
- Of those 53, **51 contain an apostrophe**. The single-quoting convention this repo settled on
  (see `260911-hyy`) has exactly one known divergence: js-yaml folds a doubled apostrophe (`''`)
  back to one character, the SDK's parser does not. Single-quoting those 51 files to satisfy
  js-yaml would have **injected a live divergence into 51 reads that are perfect today.** The
  remedy would have degraded the only parser that matters.

**The real defect runs the other direction: files that are GREEN in js-yaml and WRONG through the
SDK**, which is exactly what `260911-ayu` shipped into `STATE.md` (both narrative fields as `|-`
block scalars — js-yaml parsed them fine; the SDK returned the literal two-character string `|-`
for both, and `phase-lifecycle.js:1122`'s `stopped_at:` regex rewrite would have orphaned the
narrative beneath the field on the next write). `260911-hyy` fixed `STATE.md` itself. `260911-j88`
then fixed `planning-frontmatter-gate.py`'s own self-test, which had — undetected until then —
documented that exact `|-` shape as its ACCEPTED positive control, teaching the bug back to any
future author who copied the example. The gate now REJECTS `|-`/`>-`/backslash-escaped-`\"`
scalars on `STATE.md` and `ROADMAP.md`.

## The real defect, measured (quick 260911-j88, at baseline `1b8dda82`)

Across the corpus, **64 files contain 92 block-scalar fields** (`|`, `|-`, `>`, `>-`, etc. — the
shape the gate now rejects on its two named targets). Of those 92, **56 fields totaling 53,081
characters of recorded narrative are read as the literal indicator string (`"|-"` or `">-"`) by
every SDK consumer** — i.e. invisible to every GSD tool except a human reading the raw file.
Affected keys include `notes` (22 occurrences), `description` (11), `disposition_note` (8),
`evidence`, `rationale`, `resolution`, and five `gap_*` fields.

**Correction to a claim in this task's own authoring plan:** the plan that produced this rescope
asserted "`audit-open.js` genuinely reads `description`." A bounded check against the two
currently-resolved copies of that tool (`~/.claude/get-shit-done/bin/lib/audit.cjs`, and the
npx-cached `get-shit-done-cc@1.42.3`'s `sdk/{src,dist}/query/audit-open.{ts,js}`) found **no
codepath in either that reads a `description`, `notes`, `disposition_note`, `evidence`,
`rationale`, `resolution`, or `gap_*` field from frontmatter at all** — `scanQuickTasks`'
`description` variable is a hardcoded empty string, never assigned from `extractFrontmatter()`'s
result; the fields actually read across `audit-open`'s scan functions are `status`, `updated`,
`date`, `priority`, `area`, `title`, and `open_questions`. This does not mean the 56 fields are
harmless — a human reading the raw `.md` file still sees `"|-"` instead of the real narrative,
and a future consumer could easily add a `description`/`notes` read — but it means **severity
stays `medium`, not `major`**, because the specific "a feature is broken or a measurement is
silently contaminated" bar requires a live consumer, and this bounded check did not find one.
GSD's SDK resolves through content-hash npx caches that can differ in version across sessions and
machines, so this is a live snapshot against the versions resolved during this task, not a
permanent guarantee — a future author re-running this check should re-verify against whatever
version resolves for them rather than trusting this line indefinitely.

## What this todo has already discharged (do not re-do)

1. **The parser question is decided.** Single-line, single-quoted scalars are the repo convention
   (`260911-hyy`), with exactly one accepted divergence (doubled `''`). This is no longer open.
2. **`planning-frontmatter-gate.py` now enforces the decision**, on its two named targets
   (`STATE.md` required, `ROADMAP.md` optional): it REJECTS bare block-scalar indicators and
   backslash-escaped `\"` in double-quoted scalars, and ACCEPTS the one deliberate `''`
   divergence. Its own self-test no longer documents the `|-` shape as a positive control.
3. **The two genuine record defects found among the original 53** are fixed, byte-for-byte,
   values preserved:
   - `.planning/debug/resolved/epic-login-non-interactive.md` — duplicate `finding:` key deleted.
   - `.planning/phases/34.1-.../34.1-VERIFICATION.md` — five fields (`moved_as: "38-W01"`,
     `moved_on`, a `platform_gate` naming `App.tsx:79`, `was_uat_item: "1a"`, and a `note` naming
     plan `34.1-09`) were misfiled inside the *Tray* item's mapping after a stray blank line; they
     actually describe the *Window buttons* item and have been relocated there.
4. **"Widen the gate repo-wide over the 53 js-yaml failures" is superseded, not merely completed.**
   That step is now understood to have been the wrong remedy entirely (see "corrected population"
   above) — the gate widening that actually matters is the shape check on named targets (done in
   item 2), not a corpus-wide js-yaml walk that would have re-blessed the `|-` corruption.

## What remains

**The 64-file / 56-field block-scalar sweep** — converting those fields to a shape both js-yaml
and the SDK's hand-rolled parser read identically (single-line, single-quoted, following the
`260911-hyy` convention), so the recorded narrative in `notes`, `description`,
`disposition_note`, `evidence`, `rationale`, `resolution`, and the five `gap_*` fields becomes
readable by every tool, not just a human opening the raw file. This is desk work: read each file,
confirm the field's real content, convert the scalar shape, and diff-check the value is
byte-preserved (the same discipline used on the two fixes in this task — line-slice, never
retype; verify with both js-yaml and a manual read of the SDK's actual parse before and after).

**Note the new gate's stated limit, explicitly:** `planning-frontmatter-gate.py`'s
divergence-shape check covers exactly two targets (`STATE.md`, `ROADMAP.md`) and three known
shapes. It does **not** run against these 64 files, and will not catch a regression in any of
them — this sweep, once done, has no gate holding the line afterward. A future task could
reasonably ask whether `TARGETS` should widen to cover this population once it is clean (D3 in
quick 260911-j88 deliberately kept that out of scope: "the 64-file sweep is OUT OF SCOPE and stays
an open todo").

## Severity and readiness, justified

- **`severity: medium`** (unchanged from before this rescope). The vocabulary's `major` bar is "a
  feature is broken or a measurement is silently contaminated." The bounded check above did not
  find a live GSD tool reading any of the affected keys — the damage today is legibility to a
  human reader and to any *future* consumer that might read these keys, not a present, verified
  contamination of a running feature. If a future check finds a live reader of `notes`,
  `description`, or any `gap_*` field on one of the 64 files, this should be revisited.
- **`ready: code`** (unchanged). This is desk work — read, convert, verify with both parsers. No
  live gate is needed (no UI, no OS-specific behavior) and no human decision remains outstanding;
  the parser-choice decision that used to block this was resolved in `260911-hyy`.
- **`platform: any`** (unchanged) — correct, no OS dependency.
