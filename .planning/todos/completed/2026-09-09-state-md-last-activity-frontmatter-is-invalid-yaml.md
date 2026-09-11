---
created: 2026-09-09
title: "STATE.md's `last_activity` frontmatter is invalid YAML — 10 raw `\"` inside the double-quoted scalar, and no gate detects it"
area: planning-records
severity: medium
platform: any
ready: code
source: "incidental finding during quick-260908-wk0's by-hand STATE.md row append"
status: 'RESOLVED 2026-09-11 by quick-260911-ayu -- both `stopped_at` and `last_activity` converted to `|-` literal block scalars, byte-preserving their prior values (verified by sha256, not by eye). `.planning/planning-frontmatter-gate.py` was added as the requested gate, `MINIMUM_EXPECTED_GATES` raised 9 -> 10, and the gate has been observed RED against the real pre-fix file and GREEN against the fixed one. THIS TODO''S "10 RAW QUOTES" COUNT WAS CORRECT WHEN WRITTEN. An earlier close-out note here claimed the 10 "included the scalar''s own delimiters and was measured against a stale offset". Both halves of that claim are FALSE and it has been retracted: the todo explicitly subtracted the two delimiters (12 - 2 = 10), and its cited offset 9453 was accurate for the file as it then stood. What actually happened is worth more than the correction. Traced through git history by counting unescaped quotes in `last_activity` at every STATE.md commit: the scalar held 10 interior raw quotes continuously from `e29bf8d7c` through `47cf59108`, growing 18681 -> 31165 chars. Commit `1ffa0b05d` ("docs(state): record phase 43 context session", 2026-09-09) then REPLACED that value wholesale with a 1475-char one, discarding ~29,700 characters of narrative and, incidentally, 8 of the 10 quotes. The remaining 2 still broke the parse, which is why the file was still red at HEAD two days later. So the count did not drift; the FIELD was overwritten by an unrelated by-hand STATE.md append. That is the same by-hand append path this todo blamed for the raw quotes in the first place, and it destroys narrative silently -- no gate saw a 29,700-character deletion. The `|-` block-scalar form now in place removes the escaping burden that motivated the truncation-prone editing, but nothing yet detects a large unexplained shrink in these fields. `stopped_at` needed no repair -- it was already correctly escaped -- and was converted only so both fields share one convention rather than one escaped and one not. The gsd-sdk-corruption hypothesis in "Why it may matter more than it looks" below is NEITHER confirmed NOR refuted by this work; the standing hand-write ban on gsd-sdk''s `state.*` verbs is unchanged either way.'
files:
  - .planning/STATE.md (frontmatter line 8, `last_activity:`)
resolves_phase: null
---

# STATE.md's frontmatter does not parse, and nothing notices

## The defect

`.planning/STATE.md`'s frontmatter is a YAML document. `last_activity:` (line 8) is a
double-quoted scalar. It contains **10 double-quote characters that are not backslash-escaped**,
which terminate the scalar early and break the mapping.

Measured on the pre-edit snapshot of the file (before quick-260908-wk0 touched it), so this is
**not** introduced by that task:

```
js-yaml: bad indentation of a mapping entry (7:9453)
```

Offset 9453 of the scalar lands here — note the raw, unescaped quotes:

```
... HYPOTHESIS A (registry clobber) REFUTED for that path; the "No in-flight download to
abort" warning was reproduced twice but ONLY on resolved-error paths ...
```

Counting quotes not preceded by a backslash across the whole line gives **12**, of which 2 are
the scalar's own delimiters, leaving **10 raw quotes inside the string**.

## Why nothing caught it

`pnpm planning-gates` is 9/9 green with the file in this state — none of the nine gates parses
STATE.md's frontmatter as YAML. Neither does any jest project. The file is only ever read as
prose, so the breakage is invisible to every automated check in the repo.

## Why it may matter more than it looks

`gsd-sdk` reads and rewrites this frontmatter (`gsd-sdk query frontmatter.get`, and every
`state.*` verb). A **hypothesis worth testing, not an established cause**: this malformed scalar
may be a contributing cause of the long-recorded `gsd-sdk` STATE.md corruption, where `state.*`
verbs report success while deleting hundreds of lines and inventing counters. A parser that
cannot read the existing `last_activity` value has no way to preserve it. That would explain why
the destruction consistently centres on the frontmatter block and the `stopped_at`/`last_activity`
narrative specifically.

If that hypothesis holds, fixing this is a prerequisite for ever trusting those verbs again — and
if it does not, the standing hand-write ban is unaffected either way.

## Fix sketch

1. Escape every interior `"` in the `last_activity` scalar as `\"`, or switch the field to a YAML
   block scalar (`last_activity: |`) so interior quotes need no escaping at all. The block-scalar
   form is the better target: it removes the escaping burden from every future by-hand append,
   which is how the raw quotes got in.
2. Sweep the other frontmatter fields for the same defect — `stopped_at` is the same shape and the
   same by-hand append path, so check it rather than assuming it is clean.
3. **Add a gate.** A defect that ten green gates cannot see is the real finding here. A check that
   simply `yaml.load`s STATE.md's and ROADMAP.md's frontmatter and fails on a parse error would
   have caught this the day it landed. Register it in `planning-gates` (mind
   `MINIMUM_EXPECTED_GATES`, which must go 9 -> 10, or the new gate could later be deleted with
   everything still green).

## Trap

Do not verify this by eye against a terminal render. The first render of the malformed region in
the discovering session silently dropped the substring `" to "`, which is exactly the kind of
detail this todo turns on. Read it with `od`/`JSON.stringify`/`cat -et`, not a visual scan.
