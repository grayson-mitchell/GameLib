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
