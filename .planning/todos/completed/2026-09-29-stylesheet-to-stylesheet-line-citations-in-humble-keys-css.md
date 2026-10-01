---
created: 2026-09-29
title: Eight stylesheet-to-stylesheet line citations remain in Keys/index.css
area: frontend
severity: minor
platform: any
ready: code
files:
  - src/frontend/screens/Humble/Keys/index.css
---

## What

`src/frontend/screens/Humble/Keys/index.css` carries **eight** comment citations of the form
`<stylesheet>.css:NNN`, pointing at other stylesheets:

| target | count |
| ------ | ----- |
| `App.css:24` | 3 |
| `SelectField` | 2 |
| `DiscountCard` | 1 |
| `StoreSearch` | 1 |
| `GameCard` | 1 |

They are the same defect class as the 32 `file.ts(x):NNN` citations closed by quick tasks
`260929-uw6` (`ea8b3de02`), `260929-w93` (`086bb8480`) and `260929-wyk` (`7acbb4208`): a line
number in a comment that rots silently when the cited file shifts, leaving a confident pointer
into unrelated code.

**Staleness is UNMEASURED.** Nobody has resolved these eight against their targets. Do not
assume they are stale, and do not assume they are fine — the last three tasks in this family each
found the accurate/stale split was not what the prior step had implied (`260929-wyk` measured 9
of 18 already accurate, against an inherited claim of "16 stale").

## Why it was not done with the rest

`260929-wyk` deferred them deliberately and disclosed them. The reason is **not** the circular one
its plan first gave (that widening the gate pattern to `\.(tsx?|css):` would make that task's gate
unsatisfiable — that justifies scope by gate design rather than the reverse). The plan-checker
supplied the sound reason, recorded here so it is not lost:

> That task's mandate was the `file.ts(x):NNN` family from the outset — it is in the task title
> and in `260929-w93`'s explicit deferral. The orchestrator's "the family is defined by the
> defect, not the file extension" principle was invoked to settle a narrower question — whether
> `index.css`, as a *citing* file, belonged in scope despite not being `.ts(x)` — and does not
> automatically extend to *target*-side `.css:NNN` citations, which are the same shape but a
> practically distinct defect spanning five unrelated stylesheets and needing their own staleness
> assessment.

## How to apply

Same convention as the three completed tasks: **name a stable anchor and drop the number.** For a
stylesheet the anchor is the selector (e.g. ``(`.discountCardBadge`, `DiscountCard/index.css`)``),
which is the CSS equivalent of the symbol-plus-bare-path form, and which survives the line drift
that a number cannot.

Watch for the same two traps this family has already sprung:

- **Case B.** If a citation describes a rule that was *replaced* rather than moved, re-pointing it
  manufactures a confident false statement about current CSS — worse than the stale pointer,
  because a stale number announces its own rot on inspection and a re-pointed claim does not.
  Reword as history instead.
- **The gate must be satisfiable.** `index.css` is read as source text by
  `humbleKeysStylesheet.test.ts`; that gate runs `stripSourceComments` first, so comment edits
  should be invisible to it — verify rather than assume. And a comment-only gate that classifies
  diff lines by prefix **false-fails on this file**: `index.css` uses single-star `/*` openers and
  its comment interiors are bare prose with no marker. Compare comment-*stripped* content instead,
  as `260929-wyk` did.

## Closed 2026-10-01 (quick task 261001-q9v)

**The title's own count was never measured either — not just the staleness.** This todo's title
and "What" section claim **eight** `.css:NNN` citations. The measured figure is **nine**: the
ninth sits line-wrapped across lines 657-658 (`(SelectField/index.css:` ending one line, `60-64)`
opening the next), invisible to any regex anchored on a digit immediately after the colon — the
blind spot is the newline, not the hyphen. Plus a tenth site this todo's own census never
recorded: a same-file bare `` `:465` `` line-number citation, not of the form `<stylesheet>.css:NNN`
at all. So the family this todo named was ten sites, not eight, before the orchestrator's amended
boundary rule (below) widened it to twelve by pulling in two `.scss`-target citations that sat
inside an already-rewritten comment block. State this plainly so a reader does not take "eight" as
a verified baseline this task failed to match — it was unmeasured from the start, the same way
this todo's own staleness disclaimer already said staleness was unmeasured.

**Census correction, in full:** line 440 carries two `.css:` occurrences (`StoreSearch/index.css:183`,
`DiscountCard/index.css:96`), not three — the third (`GameCard/index.css:259`) is on line 441. The
parenthetical spans both lines, so the task premise's "three on line 440" framing was off by a line.

**The measured accurate/stale split: 8 of 12 accurate, 4 stale.** Of the nine `.css:` occurrences,
7 were accurate and 2 stale: `GameCard/index.css:259` was stale by 62 lines (the real referent,
`.gameCardCrossoverBadge--gold`, is 62 lines away at line 321, not the sepia-filter rule at 259);
`SelectField/index.css:60-64` was stale by 6 lines (the real referent, `.selectFieldWrapper label`,
opens at line 66, not 60). The same-file `` `:465` `` was the worst of the ten: stale by 44 lines
and resolving to `color: var(--text-secondary)` inside a `background: transparent` text button —
a line that directly contradicted the sentence citing it, which claimed a solid-fill badge. The
real referent is `.humbleKeyStateBadge--REDEEMED` at line 421, independently corroborated by
`humbleKeysStylesheet.test.ts:489-490`'s own title. Of the two `.scss:` citations the amended
boundary pulled into scope, `styles/_colors.scss:26` was accurate and `themes.scss:100` was stale
by 43 lines (line 100 is `--icon-disabled`, nothing to do with success colour; the real referent,
the `--success` declaration inside the default theme `body.midnightMirage`, is at line 143). The
majority of citations were already accurate and were converted anyway — the same "don't assume
either direction" caution this todo stated for staleness was vindicated a third time in this
family, after `260929-wyk` and `260929-w93` each found the same pattern.

**Case B outcome.** The GameCard site needed a predicate reword, not just a re-point. Its real
referent, `.gameCardCrossoverBadge--gold`, is a 10x10px `border-radius: 50%` dot with
`pointer-events: none` and no text content at all — the shared sentence's predicate ("paint the
raw status-success token as a solid fill behind `--neutral-01` text") is false for it, since
`--neutral-01` there is a 1px border colour, not a text colour. Re-pointing the number alone would
have satisfied every gate while manufacturing exactly the confident false statement this todo's
own Case B warning forbids. The sentence was reworded to describe the dot as a text-free marker,
unaffected by the contrast defect for a different reason than the two true badge sites.

**The boundary amendment, and who made it.** Planning first proposed re-anchoring only within an
already-rewritten *parenthetical list*. The orchestrator replaced that with: within any comment
block a task already rewrites, re-anchor every citation in that block regardless of target
extension — `.css`, `.scss`, comma forms and wrapped forms alike; outside those blocks, defer. The
orchestrator's stated reason: the narrower cut was the exact half-fix this family keeps shipping —
two `.scss` numbers surviving inside a paragraph otherwise rewritten is precisely how the next
reader concludes the surviving numbers were deliberate, rather than merely out of scope. Under that
rule, exactly two of nine `.scss:`-target citations in this file landed inside a block this task
rewrote (both inside the status-success block spanning lines 432-447) and were absorbed; the
remaining seven sit outside every rewritten block and are deferred, filed as a successor todo
rather than silently dropped.

**Arm 1 of the validation set measured, not merely inspected, the prefix-classifier trap this
todo's own "How to apply" section warned about.** A throwaway comment-only edit produced 2
unclassifiable changed lines under a diff-line-prefix classifier while the comment-stripped
content stayed byte-identical to `HEAD` — a false failure. `260929-wyk` could only corroborate this
claim by inspection; this task reproduced it as a measurement, upgrading the family's evidence for
why the strip-equivalence check, not a prefix classifier, is the correct comment-only proof.

**Deferred:** the remaining seven `.scss:`-target citations outside every rewritten block, filed as
`.planning/todos/pending/2026-10-01-nine-scss-target-line-citations-remain-in-humble-keys-css.md`.
