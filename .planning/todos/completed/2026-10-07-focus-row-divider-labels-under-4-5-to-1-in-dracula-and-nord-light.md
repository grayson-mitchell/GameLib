---
created: 2026-10-07T08:05:00.000Z
title: FOCUS ROW panel divider labels miss 4.5:1 in dracula (4.25) and nord-light (1.52)
area: ui
severity: minor
platform: any
ready: code
found_by: "Phase 48 plan 08 live gate (48-UAT.md item 7); classified UI-SPEC polish, not a locked requirement, by the 2026-10-07 re-verification"
source: ".planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-UAT.md"
files:
  - src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss
---

## Problem

The four divider labels in the Games tier-2 FOCUS ROW section (Views / Collections / Store /
Runnability — order verified live) are measured against the panel background in all 10 offered
themes (`48-UAT.md` item 7, sampled sRGB pixels → WCAG relative-luminance ratio). Eight themes pass
4.5:1 (SC 1.4.3, the bar 48-08 adopted). Two do not:

| theme      | ratio |
|------------|-------|
| dracula    | 4.25  |
| nord-light | **1.52** |

nord-light is the severe case — the label is effectively invisible.

## Why it is not a Phase 48 gap

R2 requires the section, single-select, clear, fixed group order and no collections group when
empty — all verified. It carries no contrast clause; the 4.5:1 bar came from UI-SPEC D-08. The
2026-10-07 re-verification files it as follow-up polish.

## Fix shape

Likely a `--text-secondary` (or equivalent theme-adaptive token) swap on `.FilterFocusRow__divider`
in place of whatever low-alpha colour it uses now. Measure every theme after — the trap in this repo
is a token that is correct for one surface and 1.1:1 on another. Re-measure is `48-UAT.md` item 10.

## Resolution (2026-10-08)

Fixed in phase 48 plan 11, Task 2 (`6fc84469a` RED then `782285b5e` GREEN): a nested
`body.dracula &, body.nord-light &` override in `FilterFocusRow/index.scss` paints the divider with
the tier-2 row colour chain `var(--navbar-inactive, var(--navbar-accent))`. Census values against
`--navbar-background`: dracula 7.48 (was 4.27 at the desk, 4.25 live) and nord-light 7.38 (was
1.52). The other eight themes keep `--text-secondary` and are unchanged (marine 5.43 lowest,
midnightMirage 13.23 highest). The census in `themeTokens.test.ts` holds all ten themes at 4.5:1
and reads the shipped SCSS.

Live recheck is owed: `48-UAT.md` item 10 (divider half). This todo closes the code work, not the
live gate.
