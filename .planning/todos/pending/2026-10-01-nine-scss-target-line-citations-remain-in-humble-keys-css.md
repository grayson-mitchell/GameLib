---
created: 2026-10-01
title: Seven .scss-target line citations remain in Keys/index.css
area: frontend
severity: minor
platform: any
ready: code
files:
  - src/frontend/screens/Humble/Keys/index.css
---

## What

`src/frontend/screens/Humble/Keys/index.css` carries **seven** remaining comment citations of the
form `<stylesheet>.scss:NNN`, pointing at other SCSS source files:

| target | line in `index.css` |
| ------ | -------------------- |
| `components/UI/SearchBar/index.scss:3` | 30 |
| `_buttons.scss:13` | 116 |
| `_spacing.scss:8` | 147 |
| `_typography.scss:29-33` | 150 |
| `_spacing.scss:12,17` | 156 |
| `NavShell/index.scss:101-159` | 194 |
| `styles/_colors.scss:101` | 375 |

This filename says "nine" because that was the count measured when quick task 261001-q9v
discovered this family mid-task; two of the original nine (`styles/_colors.scss:26` and
`themes.scss:100`) were absorbed by that task because they sat inside a comment block the task was
already rewriting for an unrelated `.css:NNN` citation, under the boundary rule below. The filename
is kept unchanged because this plan and the closing note on the now-completed sibling todo both
reference it by this exact path — only the body's count is corrected, to **seven**.

This is the same defect class as the `.css:NNN` family closed by quick task 261001-q9v and the
`file.ts(x):NNN` family closed by `260929-uw6` / `260929-w93` / `260929-wyk`: a line number in a
comment that rots silently when the cited file shifts, leaving a confident pointer into unrelated
code.

**Staleness is UNMEASURED for all seven.** Do not assume they are stale, and do not assume they
are fine in either direction. This family has now had that exact assumption overturned three
times in its ancestors (`260929-wyk` measured 9 of 18 already accurate against an inherited claim
of "16 stale"; `261001-q9v` measured 8 of 12 accurate against this todo's own un-measured "eight"
headline).

## The working pattern, and its one trap

`[A-Za-z0-9_/.-]+\.scss:[0-9]+([,-][0-9]+)*` is the pattern that correctly counts all seven,
including the comma form. **`_spacing.scss:12,17` (line 156) uses a comma, not a range.** A
range-only pattern (`[0-9]+(-[0-9]+)?`) still scores it as one occurrence, but by truncating the
match at `12` — so a census built on the range-only pattern looks right while silently mis-parsing
one member. Use the comma-aware pattern, not the range-only one, when re-measuring this family.

## The boundary rule that produced this cut — quoted, so the scope is auditable

The orchestrator amended 261001-q9v's planned scope with this rule:

> Within any comment block a task already rewrites, re-anchor EVERY citation in that block
> regardless of target extension — `.css`, `.scss`, comma forms and wrapped forms alike. Outside
> those blocks, defer.

Comment-block ranges in `index.css` were measured by matching `/\*.*?\*/` non-greedily and mapping
match offsets to 1-based lines, at the state of the file *before* 261001-q9v's edits:
**(217,233) (295,299) (432,447) (601,612) (647,676)**. All seven survivors named above sit outside
every one of those ranges — that is the entire reason they were deferred rather than swept in, and
a future reader can re-derive the cut from these ranges rather than trusting this note.

## How to apply

Same convention as every prior task in this family: **name a stable anchor and drop the number.**
For a stylesheet the anchor is the selector, mixin, or token name the citation is about (e.g.
``(`_buttons.scss`)`` with the `--line-height` token named in prose), which survives the line
drift a number cannot.

Watch for the same traps this family has already sprung:

- **Case B.** If a citation describes a rule that was *replaced* rather than moved, re-pointing it
  manufactures a confident false statement about current CSS — worse than the stale pointer,
  because a stale number announces its own rot on inspection and a re-pointed claim does not.
  Reword as history instead.
- **The gate must be satisfiable, and must not be a diff-line-prefix classifier.** `index.css` is
  read as source text by `humbleKeysStylesheet.test.ts`, which runs `stripSourceComments` first —
  comment edits are invisible to it, but verify with a strip-equivalence check (comment-stripped
  content byte-identical to the prior commit) rather than assuming. 261001-q9v *measured*, not
  merely asserted, that a diff-line-prefix classifier false-fails on this exact file (2
  unclassifiable lines on a correct comment-only edit), because `index.css` uses single-star `/*`
  openers with bare-prose interiors and no per-line marker.
- **Raw-literal invariants.** `HumbleKeyRow/__tests__/index.test.tsx` does an un-stripped
  `readFileSync` over this file and counts `grid-template-columns` exactly twice;
  `humbleKeysStylesheet.test.ts` counts `var(--status-success)` exactly once file-wide. Neither
  literal may appear in rewritten prose, or the count becomes a false extra occurrence. This file
  already has existing comments naming this trap — honour them, do not write the literals out.

## Pointer

See `.planning/quick/261001-q9v-re-anchor-the-eight-stylesheet-to-styles/261001-q9v-PLAN.md` for
the validated convention, the gate shapes (strip-equivalence plus paired positive/negative greps),
and the measured block-range extraction method.
