---
created: 2026-10-07T08:05:00.000Z
title: Focus-row strip chevrons reach 3:1 contrast in only 12 of 40 theme/card/edge combinations, and a hovered card paints over the control
area: ui
severity: major
platform: macos
ready: code
found_by: "Phase 48 plan 08 live gate (48-UAT.md item 4); classified UI-SPEC polish, not a locked requirement, by the 2026-10-07 re-verification"
source: ".planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-UAT.md"
files:
  - src/frontend/screens/Library/components/FocusRowStrip/index.css
  - src/frontend/screens/Library/components/FocusRowStrip/index.tsx
---

## Problem

Two measured defects on the strip's forward/back controls, both from `48-UAT.md` item 4 (10 themes
enumerated live from the Settings theme selector; C1-C4 reference cards = max and min mean art
luminance in the strip at 1280px; all captures converted Display P3 → sRGB before any ratio).

1. **Contrast.** Against the adopted bar of WCAG 2.2 SC 1.4.11 (≥ 3:1 for a UI component against its
   adjacent colours), the chevron glyph over its 55% scrim reaches 3:1 in **12 of 40**
   theme × card × edge combinations. Only `midnightMirage` passes all four. Overall minimum is
   **1.005** (`gruvbox_dark`). The scrim is a flat alpha over arbitrary artwork, so a bright card
   under a light-glyph theme drives the ratio to ~1.0. Per-theme minima are in the UAT evidence log.

2. **Stacking.** `.gameCard:hover` is `transform: scale(1.05)` with `z-index: 2`; the control is
   `z-index: 1` in the same stacking context. A real-pointer hover on an edge card paints the card
   over the control: chevron-coloured pixels inside the icon rect fall from 122/640 to **0/640** at
   both edges. Whether the control is still *clickable* through the card was not probed (UAT used
   `element.click()`, which bypasses hit-testing) — that is UAT item 9 / the re-verification's
   human item 2. If the card swallows the click this is an R3 gap, not polish.

## Why it is not a Phase 48 gap

The 2026-10-07 re-verification maps the 3:1 figure to no locked SPEC requirement: R3 specifies
"forward/back controls revealing any that do not fit" with no legibility clause; the bar was adopted
by 48-08's plan from UI-SPEC prose ("stays legible over any artwork"). So it closes as a follow-up,
not a blocker. The stacking half is one real-pointer probe away from being promoted.

## Fix shape (not decided)

- Contrast: an opaque or near-opaque control chip (`--accent` on a solid surface) rather than a
  scrim over art; or a glyph with its own halo. Measure, don't assume — `--border-color` is invisible
  in 10/13 themes and `--status-*` tokens are raw.
- Stacking: lift the control above the hovered card (`z-index` ≥ 3, or isolate the strip's
  stacking context so card hover cannot outrank the controls).
- Re-measure with the same C1-C4 rule and the 40-combination grid; that re-measure is `48-UAT.md`
  item 10.
