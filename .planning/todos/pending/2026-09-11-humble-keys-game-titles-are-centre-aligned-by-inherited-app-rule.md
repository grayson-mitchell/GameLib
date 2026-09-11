---
created: 2026-09-11
title: "Humble Keys GAME titles and column headers are centre-aligned by an inherited .App rule"
area: humble-keys-ui
status: OPEN
severity: minor
platform: any
ready: human
source: "Phase 43 plan 43-10 Task 2 live gate, REQ-43-19 item 3, operator run 2026-09-11"
files:
  - src/frontend/App.css (.App text-align: center, :24)
  - src/frontend/screens/Humble/Keys/index.css (.humbleKeyGameCell :251-256, .humbleKeyColumnCell :262-266)
resolves_phase: null
---

## Problem

The Humble Keys GAME column's titles, and all three column-header labels, render **centre-aligned**
while the TYPE and KEY cells' contents render left-aligned. Measured across 18 rows in two
packaged-build captures: title-text left edges spread **216.5 CSS px** (486.0 … 702.5), while all
18 title *centres* land within **723.3 … 724.0** against a track centre of 724.0 (spread 0.7).

This is not a deliberate choice anywhere in the styling. `.App { text-align: center }`
(`src/frontend/App.css:24`, inherited from Heroic) applies app-wide. `.humbleKeyColumnCell` (KEY)
happens to be insulated by `align-items: flex-start`; `.humbleKeyGameCell` sets no alignment, so
its title stretches the full track and the inherited `center` takes effect.

**The column geometry is not affected** — the grid tracks are immovable (TYPE content left edge
220.0 and KEY content left edge 1124.0 on all 18 rows, spread 0.0). This is purely about where the
text sits inside a correctly-sized box.

It matters for two reasons:

1. `43-UI-SPEC.md` calls the title "the primary visual anchor … the only element a scanning eye
   should land on first", and centres it between two left-aligned columns, which works against
   scannability in a list.
2. It made REQ-43-19 item 3 score FAIL. That gate measures "title-text left edge agrees within
   ±2 CSS px across rows" as a proxy for "the column's left edge never shifts". The proxy only
   holds under left alignment. **If the alignment is deliberate, the gate's metric is wrong and
   should be restated against track boundaries; if the alignment is accidental, the code is
   wrong.** One of the two needs to change, and the same question answers both.

## Solution

**This is a design decision, not a defect with an obvious fix — hence `ready: human`.**

If left alignment is wanted: add `align-items: flex-start` to `.humbleKeyGameCell` (matching how
`.humbleKeyColumnCell` already defends itself), or set `text-align: start` on
`.humbleKeyRowTitle` and the `.humbleKeysColumnHeader` spans. Prefer the local fix over touching
`.App { text-align: center }`, which is inherited by the entire application and whose blast radius
is every screen.

If centring is wanted: restate `43-LIVE-GATE.md` item 3's threshold against the GAME **track**
boundary rather than the title-text left edge, and record the alignment choice in
`43-UI-SPEC.md` § Column Geometry Contract, which is currently silent on it.

## Related

- `43-LIVE-GATE.md` § Verdict, item 3's two FAIL rows and the note beneath them.
