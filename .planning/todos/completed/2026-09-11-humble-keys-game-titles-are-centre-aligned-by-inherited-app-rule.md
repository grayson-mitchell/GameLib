---
created: 2026-09-11
title: "Humble Keys GAME titles and column headers are centre-aligned by an inherited .App rule"
area: humble-keys-ui
status: RESOLVED
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

## Update (2026-09-11, quick task 260911-qds) — REQ-43-19 run 2: the same rule fails a SECOND column

**Still `status: OPEN`, still `ready: human` — this update does not close the todo.** The gift-gate
fix (`2c68c17fe`) made item 2's side-by-side-pair sub-check reachable for the first time in run 2,
and once measured, it fails the same way item 3 already did, against the same inherited rule.

Measured (session `/tmp/gamelib-gate-20260911T062945Z`, preserved at `43-11-evidence/`): the
KEY column's **content** left edge is **934.0 CSS px** across all 7 sampled shapes (Hard West 2,
Asguaard, Californium, Crusader Kings III, CryoFall, Darkest Dungeon, Dex), spread **0.0** — the
column box itself is exactly as immovable as items 1 and 7 already proved, same as TYPE (220.0)
and the original KEY-content reading (1124.0) in run 1. But the `"Key"` **header label**'s left
edge is **1085.5** — a **151.5 CSS px** divergence from the content it sits above.

The arithmetic is centring, not drift: the KEY column spans **934.0 → 1254.0**, centre **1094.0**;
a ~17 CSS px `"Key"` label centred there starts at **1085.5**, which is what was measured. This is
the same `.App { text-align: center }` (`src/frontend/App.css:24`) rule, reaching a different
column's header cell this time — `.humbleKeyColumnCell`'s `align-items: flex-start` insulates its
*row content* (the button/text-link cells item 2 already tracked in run 1) but its **header**
label was never given the same defence, so the inherited centring reaches it.

**One rule, two columns, two runs.** Item 2's run-2 row is scored FAIL against the literal
header-vs-content metric in `43-LIVE-GATE.md`, the same way item 3 was — not re-scored against the
friendlier content-vs-content reading (934.0 vs 934.0, spread 0.0, which trivially passes) after
seeing the number. As with GAME, the metric failed and the property did not: the same
either-the-alignment-is-wrong-or-the-metric-is-wrong decision this todo already poses for the GAME
column now governs the KEY column's header too. Not decided here — that is what `ready: human`
means, and it now covers one more sub-check than it did when filed.

## Resolution (2026-09-11, quick task 260911-r8u)

**The operator's decision: left-aligned.** The `ready: human` fork this todo posed — "if the
alignment is deliberate, the gate's metric is wrong; if the alignment is accidental, the code is
wrong" — was answered in favour of the **CODE being wrong**. Both the GAME title and all three
column-header labels (Type, Game, Key) are now left-aligned.

**The CODE changed and the gate metric did NOT.** `43-LIVE-GATE.md` items 2 and 3 keep their
thresholds exactly as written, unedited — see "what was deliberately left untouched" below.

**Exactly which declarations were added**, all three in
`src/frontend/screens/Humble/Keys/index.css`:

- `align-items: flex-start` on `.humbleKeyGameCell` — places the title box at the track start,
  matching the defence `.humbleKeyTypeCell` and `.humbleKeyColumnCell` already carry.
- `text-align: start` on `.humbleKeyRowTitle` — the one that handles WRAPPED two-line titles,
  which `align-items: flex-start` alone does not left-align (it only shrink-wraps the box to its
  longest line; the shorter line inside that box would still be centred without this).
- `text-align: start` on the **standalone** `.humbleKeysColumnHeader` block (the typography-only
  block, not the combined `.humbleKeysColumnHeader, .humbleKeyRow` grid declaration that fixes
  column boundaries) — the header is a grid container, not flex, so the flex-only instrument used
  on `.humbleKeyGameCell` does not apply; its three labels stretch to their tracks and
  `text-align` is the mechanism that moves the text inside them.

**What was deliberately left untouched, and why:**

- `src/frontend/App.css`'s `.App { text-align: center }` (`:24`) — blast radius is every screen
  in the application; this todo's own prescribed fix was the local defence added above, not
  touching the inherited rule.
- `.humbleKeysEmptyState` and `.humbleKeysFilteredEmptyState` — both deliberate empty-state
  messages, both still declare `text-align: center`. A new gate assertion now protects both so a
  future start-alignment sweep of this file cannot silently de-centre them.

**The new gate**: `src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts` gained
five new positive assertions (three alignment, two empty-state-preservation), each with a paired
SANITY negative control firing the same regex at an inline known-bad fixture, plus two
regex-hazard-specific SANITY controls (the `.humbleKeysColumnHeader` anchor excludes the combined
grid form; the `.humbleKeysEmptyState` anchor excludes the nested `... h5` rule) and one more
stripper-integrity SANITY test proving the new rationale comments in `index.css` — which
deliberately name `align-items: flex-start` and `text-align: start` as prose — cannot fake either
assertion. Same honest limitation the rest of that file carries: the Frontend jest project is
`testEnvironment: 'node'` with no CSS engine, so this proves the SOURCE says the right thing and
can never prove it RENDERS.

**`43-LIVE-GATE.md` items 2 and 3 remain FAIL**, the file itself unedited, pending a future live
re-measurement against a packaged build containing this fix. Re-scoring them from a source change
would be substituting an inference for a measurement — exactly the substitution this todo's own
fork warned against. **This re-measurement is now the ONLY thing blocking Phase 43 closure.**
