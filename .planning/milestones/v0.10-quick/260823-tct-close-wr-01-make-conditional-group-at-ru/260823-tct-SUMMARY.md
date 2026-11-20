---
quick_id: 260823-tct
slug: close-wr-01-make-conditional-group-at-ru
date: 2026-08-23
status: complete
description: "WR-01 (34.10 code review): close the @media/@supports bypass in the muiTabsSelectorScoping guard by making conditional group at-rules transparent for scope depth"
commits:
  - 4f44ef280
files_touched:
  - src/frontend/__tests__/muiTabsSelectorScoping.test.ts
  - .planning/phases/34.10-navigation-shell-horizontal-card-tabs-replace-the-sidebar/34.10-REVIEW.md
  - .planning/ROADMAP.md
---

# Quick task 260823-tct — WR-01 CLOSED

Phase 34.10's last open code-review carry-forward. **34.10 is not reopened** — it closed
2026-08-09 on live gate run 4's 5/5 and stays closed; this is a carry-forward discharge.

## Task 1 — RED first, against the guard as it ships

The 11 new cases were added and run against the **unmodified** scanner before any fix was written.

```
Test Suites: 1 failed, 1 total
Tests:       7 failed, 9 passed, 16 total

✕ an unscoped .MuiTabs-root wrapped in @media is still an offender
✕ an unscoped .MuiTabs-root wrapped in @supports is still an offender
✕ an unscoped .MuiTabs-root wrapped in @container is still an offender
✕ an unscoped .MuiTabs-root wrapped in @layer is still an offender
✕ an unscoped .MuiTabs-root wrapped in @document is still an offender
✕ nested conditional at-rules do not stack into scope: @supports inside @media still yields an offender
✕ a preceding top-level declaration does not hide an unscoped selector
```

Every one failed identically: `Expected length: 1 / Received length: 0 / Received array: []`. That
reproduces WR-01's own empirical claim **in the file**, not in an extracted copy as the review did.
The 4 silence proofs passed both before and after, as they must — they are the other direction.

## Task 2 — the fix

`findUnscopedMuiTabsSelectors` tracked one `depth` counter and inspected a selector only at
`depth === 0`. A conditional group at-rule opens a brace of its own, so `@media (...)` consumed the
depth-0 slot and the wrapped rule was first seen at depth 1 — which the scanner's own comment
treats as "nested under an ancestor, therefore scoped". `@media` is not an ancestor: it contributes
nothing to specificity and nothing to the matched element set, so the 8px leak behind
F-34.10-03/-04 reproduces through one verbatim.

The counter is now a stack of block kinds. **Scope depth is the number of `rule` frames**;
`@media`/`@supports`/`@container`/`@layer`/`@document` push a `transparent` frame instead.
`@keyframes`/`@font-face` stay opaque — their contents are keyframe selectors and descriptors, not
class selectors, so treating them as transparent could only manufacture false positives on
`from`/`to`/percentage preludes. This is recorded as a deliberate exclusion, with a test.

### Deviation from the prescribed fix — deliberate

WR-01 prescribed "track a separate at-rule depth" and one regression test wrapping
`PRE_FIX_SPECIMEN` in `@media (min-width: 1px)`. That would have closed `@media`/`@supports` and
left `@container`, `@layer`, `@document` and the second miss below open. Per this project's
`review-prescribed-fix-can-carry-the-same-defect` lesson, the prescription was treated as a
starting point, not a spec.

### Second, independent miss, found while fixing the first

`selectorStart` was only reset when depth returned to 0, so any preceding top-level declaration or
SCSS variable was swept into the selector text. `$leak: 8px;` before `.MuiTabs-root {` made the
first compound read `$leak:` rather than `.MuiTabs-root`, and the offender went unreported. The
prelude is now taken as the text after the last `;` in the segment, with the offset carried so
reported line numbers stay correct. Not part of WR-01 as filed — same guard, same bypass shape, so
it is closed here rather than filed as a new finding.

This also has a real-world exerciser: `GamePage/index.css:811-822`'s multi-line
`@supports (\n  background-color: color-mix(...)\n) {` is preceded by `border: ...;`, so the
last-`;` slice is what lets its prelude be recognised as an at-rule at all.

## Task 3 — GREEN, and the fix did not widen the net

- Scoped run: **16 passed / 16 total**, suite green.
- Full `Frontend` jest project: **122 suites / 2005 tests, all passed**. Arithmetic checks out
  against the RED run — 1994 pre-existing + 11 new = 2005, and the RED run's 1998 passed / 7 failed
  is the same 2005. No pre-existing frontend test was ever red during this task.
- **Every pre-existing test in the file is unmodified.** `git diff` shows removals only inside
  `findUnscopedMuiTabsSelectors` and its doc comment; no `it(...)` body changed.
- **The repo-wide sweep stays green** — no stylesheet is newly convicted. Checked before writing
  the fix: the only stylesheets holding both a `MuiTab*` selector and an at-rule are
  `WineManager/index.css` (at-rules at :212/:245, MuiTabs at :65-73, disjoint) and
  `GamePage/index.css` (MuiTabs at :824+ sits under `.extraInfoTabs > .gameInfoTabs`, two real rule
  frames). Had the sweep gone red, that would have been a real find to report, not to suppress.
- `eslint --format json`: 0 errors (severity 2), 0 warnings. `tsc --noEmit`: no errors in the file.
- `prettier --check` measured **in place** (not on a temp copy, per
  `prettier-check-on-a-temp-copy-resolves-a-different-config`); formatted only this file, so no
  formatting sweep rides along in a behavioural commit.

## Task 4 — closure recorded

- `34.10-REVIEW.md` — WR-01 marked **CLOSED 2026-08-23** with mechanism, RED-proof output, the
  deviation from the prescribed fix, and the second miss.
- `ROADMAP.md` — 34.10's carry-forward paragraph updated, stating explicitly that the phase is not
  reopened.

## What this leaves open on 34.10

**Nothing in the phase.** One item remains anywhere in its lineage: **38-C05**, the gamepad
focus-scroll observation, owned by Phase 38 and gated on controller hardware
(`platform_gate: src/frontend/helpers/gamepad.ts:559,678`). WR-02 (untranslatable Steam/ZOOM
labels) was made moot by 34.11's filter rework — `RunnerToStore` is a plain string map in
`facetLabels.ts:26`, no longer `t()`-wrapped. IN-01 was superseded by 34.12's tour anchors.
CR-01/CR-02 were closed by 34.11 under D-31/D-32.
