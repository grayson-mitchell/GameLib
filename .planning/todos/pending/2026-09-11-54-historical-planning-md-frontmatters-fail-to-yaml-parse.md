---
created: 2026-09-11
title: "`.planning/` frontmatter is read by TWO parsers that disagree — resolve that before widening `planning-frontmatter-gate.py` repo-wide over the 53 js-yaml failures"
area: planning-records
severity: medium
platform: any
ready: code
source: "quick task 260911-ayu Task 3 (M-11); RE-SCOPED 2026-09-11 after quick 260911-hyy proved the original remedy harmful"
files:
  - .planning/planning-frontmatter-gate.py
resolves_phase: null
---

# Two frontmatter parsers disagree; the 53 js-yaml failures are a symptom, not the defect

## RE-SCOPED 2026-09-11 — read this before acting on the old version

This todo previously said: *53 historical documents fail to YAML-parse; fix them, then widen
`planning-frontmatter-gate.py` to a repo-wide walk.* The measurement was sound and still
reproduces. **The prescribed remedy was wrong and would have multiplied a live defect by 53.**

The count re-measured clean at `bab7a5dae`: **53 of 2444** frontmatter-bearing `.md` files under
`.planning/` fail `js-yaml@4.1.1`. That part stands. What was false is the old "Not urgent"
section's claim that *"none of these 53 files are read by tooling as YAML today; they are only
ever read as prose."*

## The actual finding

`.planning/` frontmatter has **two readers that do not agree**:

| reader | parser | behaviour on malformed YAML |
| --- | --- | --- |
| `.planning/planning-frontmatter-gate.py` | real `js-yaml` 4.1.1 | throws — this is the gate |
| every GSD consumer (`gsd-sdk query frontmatter.get`, `audit-uat`, `progress`, `state`, `phase-lifecycle`, `workstream`) | `sdk/dist/query/frontmatter.js` → `parseFrontmatterYamlLines`, a hand-rolled indentation stack parser | never throws; silently returns something |

The hand-rolled parser matches `^(\s*)([a-zA-Z0-9_-]+):\s*(.*)`, strips only *surrounding* quotes,
and has **no block-scalar support at all**. So a document can be green in the gate and read as
garbage by every tool that actually consumes it.

Measured against both parsers on the same real narrative string:

| frontmatter shape | js-yaml | gsd-sdk | agree |
| --- | --- | --- | --- |
| raw `"` inside a double-quoted scalar (the original STATE.md defect) | THROWS | reads it fine | NO |
| `\|-` block scalar (what 260911-ayu shipped) | fine | returns the literal string `"\|-"` | NO |
| double-quoted, inner `"` escaped | fine | keeps the `\"` backslashes | NO |
| single-quoted, no apostrophes present | fine | fine | **YES** |
| single-quoted, text contains `don't` / `it's` | fine | returns `don''t` | NO |

**There is no shape that is faithful to both parsers for general English narrative.** That is the
blocker. Fixing 53 files for js-yaml alone means picking, 53 times, which reader to break.

## What this already cost (now fixed — do not re-do)

Quick task 260911-ayu fixed STATE.md's frontmatter by converting `stopped_at` and `last_activity`
to `|-` block scalars. Through the SDK — i.e. what every workflow actually reads:

```
BEFORE 260911-ayu (712a7b31d)        AFTER it (through gsd-sdk)
stopped_at:    "Completed 43-09-PLAN.md -- gog_keyless…"   ->   "|-"
last_activity: "2026-08-25 -- Phase 34.16 LIVE GATE…"      ->   "|-"
```

Both narrative fields read as the literal two-character string `|-` for every GSD tool, and the
gate was green over it the whole time — legitimately, because by *its* parser the file was
perfect. The gate structurally cannot see this defect class.

Worse, `phase-lifecycle.js:1122` rewrites the field with `frontmatter.replace(/stopped_at:\s*.+/,
…)`. `.` does not cross newlines, so against a `|-` block it replaced the `stopped_at: |-` line and
**orphaned the narrative beneath it**. Simulated against the real file, the next phase-completion
write produced `bad indentation of a mapping entry (6:103)` and stranded the old value under the
new one — the same silent-narrative-loss shape recorded elsewhere in this project.

**Quick task 260911-hyy fixed STATE.md** (both fields are now single-line single-quoted scalars,
17/17 verification checks, time bomb defused, body byte-identical). STATE.md is NOT part of this
todo's remaining work.

## What is actually left

1. **Decide the parser question first — this is the real work, and it is a decision, not a sweep.**
   Options, roughly: (a) make the consumers use a real YAML parser (upstream change to
   `get-shit-done-cc`, outside this repo); (b) adopt a repo convention of
   *single-line scalars only* in `.planning/` frontmatter, which both parsers can agree on as long
   as apostrophes are avoided or tolerated; (c) accept the divergence and gate only the documents
   tooling genuinely reads. Nothing below is safe to start before this is settled.
2. **Only then** fix the 53 files, to whatever shape (1) chose. Re-measure first — the corpus
   moves constantly. Shapes present: 46 are an unquoted narrative scalar containing `: `, 3 are
   flow-collection `[...]` values with unquoted commas, 2 are duplicate keys, 2 are unknown escape
   sequences.
3. **Only then** widen the gate — and the gate worth having asserts **the two parsers agree**, not
   merely that js-yaml parses. A js-yaml-only repo-wide walk would re-bless exactly the `|-`
   corruption described above. Nothing in the repo performs an agreement check today.

## Two things found in passing, not yet filed separately

- `.planning/phases/34.1-…/34.1-VERIFICATION.md` — its `duplicated mapping key` failure is hiding a
  genuinely **misfiled record**: the fields at frontmatter lines 93–97 (`moved_as: "38-W01"`,
  `was_uat_item: "1a"`, a `platform_gate` naming `App.tsx:79`) describe the *Window buttons* item
  but sit inside the *tray dark/light* item's mapping, after a stray blank line. Reading it as
  prose is also wrong, not just as YAML. Needs a human judgement call, not a mechanical fix.
- `.planning/debug/resolved/epic-login-non-interactive.md` — duplicate `finding:` key with an
  identical value on both lines. Safe to fix by deleting the redundant line; no information lost.
