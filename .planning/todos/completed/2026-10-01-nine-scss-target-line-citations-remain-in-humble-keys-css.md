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

## Closed 2026-10-01 (quick task 261001-rj1)

**The todo's table was RIGHT, and that is now measured rather than inherited.** All seven
citations sat at exactly the lines this table names (30, 116, 147, 150, 156, 194, 375), unchanged
despite three intervening commits to this file since it was written. Re-measured live at
`5339770f1` rather than trusted, since this family's own ancestors each carried an un-measured
count that turned out wrong.

**The measured split: five of seven citations fully accurate, one stale, one MIXED** — or, counted
by line-number member, six of eight accurate. Per citation: `_spacing.scss:8` was **stale by 1**
(line 8 is the `--space-lg` declaration; the `--space-md` declaration this comment names is at 7);
`_spacing.scss:12,17` was **mixed**, with `17` accurate and `12` pointing at a **blank line** whose
intended referent (`--space-unit-fixed`) is one line lower, at 13. The other five were accurate,
with `_typography.scss:29-33` and `NavShell/index.scss:101-159` both exactly bounded ranges rather
than loose spans.

**This is the FOURTH consecutive overturn of this family's inherited assumption, and the fourth in
the SAME direction** — the majority of citations were already accurate and were converted anyway.
Predecessors: `260929-wyk` (measured 9 of 18 already accurate against an inherited claim of "16
stale"), `261001-q9v` (measured 8 of 12 accurate against this todo's own ancestor's un-measured
"eight" headline), and this task's own un-measured premise (inherited from `261001-q9v`'s deferral
as "staleness is UNMEASURED for all seven" — resolved here as mostly accurate, again).

**The two stale members drift in OPPOSITE directions** (`_spacing.scss:8` cited 8 / referent 7;
`_spacing.scss:12,17`'s `12` cited 12 / referent 13), so no single line shift in `_spacing.scss`
explains both, and a mechanical renumbering would have been wrong. This is the finding that forbids
the obvious shortcut.

**Site 3's stale pointer landed on a sibling token of the same family** (`--space-lg: 1.5em` in
place of `--space-md: 1em`) — the most misleading class of off-by-one, because the wrong line still
looks like a plausible spacing declaration. Only the value stated in the comment (`1em`) contradicted
line 8's actual value (`1.5em`).

**No Case B reword was needed, and this was verified rather than skipped.** All seven referents
still exist and every predicate is true, including the set's one quantified claim — that the only
`--line-height` token is button-scoped — checked by an app-wide declaration census (every `.css`/
`.scss` file under `src/` for `--line-height:`) that returned exactly one declaration,
`_buttons.scss`'s `.button` rule. The check was run, not skipped; the absence of a reword is a
measurement.

**Two of the seven were UNBACKTICKED** (`_buttons.scss:13`, `NavShell/index.scss:101-159`) and were
normalised to the backticked bare-path form the file already used elsewhere, so one grep now
answers for the whole family (ten backticked bare `.scss` paths total, up from three at HEAD).

**The comma trap was reproduced live, not quoted:** the range-only pattern
`[A-Za-z0-9_/.-]+\.scss:[0-9]+(-[0-9]+)?` also returns 7 matches, but its fifth match is the
truncated `_spacing.scss:12` rather than the full `_spacing.scss:12,17` — the count looks right
while the parse is wrong.

**The gate was proven satisfiable, not merely strict.** A real comment-only re-anchor of the first
rewritten block passed the strip-equivalence check (comment-stripped content byte-identical to
`HEAD`) before the remaining sites were touched. The gate's validation arms measured during
planning: a declaration change correctly FAILED, and a deleted comment delimiter (`*/`) also
correctly FAILED, dropping the stripped line count from 462 to **450** — delimiter integrity, not
prose, is the residual hazard of a comment-only edit.

**Tooling findings worth not re-deriving:** `grep` on this machine is ugrep 7.8.4, where
`--include=GLOB` exits 2 while still printing correct output (an unquoted `--include=*.scss` is
also eaten by zsh before grep sees it); and the prettier `--file-info` braces rendered unspaced in
the terminal, for a second consecutive pass in this family — `od -c` shows the spaced form CLAUDE.md
documents. CLAUDE.md is correct both times; the terminal render collapsed the whitespace.

**No successor todo is filed — this closes the family.** Every citation this todo named has been
re-anchored and verified; no residual `.scss:NNN` or `.css:NNN` member remains in this file.
