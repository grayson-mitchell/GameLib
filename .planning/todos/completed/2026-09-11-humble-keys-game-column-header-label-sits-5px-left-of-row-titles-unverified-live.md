---
created: 2026-09-11
title: "Humble Keys GAME column header label sits ~5.5 CSS px left of the row titles; cause unestablished"
area: humble-keys-ui
status: "RESOLVED 2026-09-13 by quick-260912-d84 -- cause established statically (the shared column-gap resolved two different pixel values off two different font-sizes); fixed by pinning the gap to a fixed-length token. The predicted 4.89px correction has NOT been re-measured live."
severity: minor
platform: any
ready: live-gate
source: "REQ-43-19 item 3, run 3 (20260911T075450Z), 43-12-evidence/measurements-run3.md; exposed by e344f589d fixing the larger centring defect"
files:
  - src/frontend/screens/Humble/Keys/index.tsx
  - src/frontend/screens/Humble/Keys/index.css
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
  - src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts
resolves_phase: null
---

# Humble Keys `GAME` column header label sits ~5.5 CSS px left of the row titles

## Measured

"Game" header label left edge **335.5**. Title left edges **341.0** (Aksun Playtest), **341.0**
(Dredge), **340.0** (Fabledom), **340.5** (Persona 5 Royal), **341.0** (Warhammer 40,000: Rogue
Trader), **341.0** (Settlement Survival). Offset **5.5 CSS px** against item 3's ±2 threshold.

## Masked until `e344f589d`

Run 1 measured a title-to-title spread of **216.5**; run 3 measures **1.0**. Fixing the large
centring defect exposed a small offset underneath it that was previously unmeasurable — the
216.5 spread swamped the 5.5 offset entirely.

## Cause established

`src/frontend/screens/Humble/Keys/index.css`'s combined `.humbleKeysColumnHeader,
.humbleKeyRow` selector declared its shared track geometry, including
`column-gap: var(--space-md)`, on ONE rule matched by two elements with different computed
font-sizes:

- `--space-md` is `1em` (`_spacing.scss:8`). An `em` length in a NON-`font-size` property
  resolves against the matched element's OWN computed font-size, not a shared ancestor's.
- The standalone `.humbleKeysColumnHeader` typography block (`index.css:674` at the time of
  this fix) sets `font-size: var(--text-xs)` = `1rem / 1.2^2` = **11.11px** at the 16px root
  (`_typography.scss:29-33`).
- `.humbleKeyRow` sets no font-size and inherits the app's **16px** root.

So the single declaration produced TWO different gaps: 11.11px for the header, 16px for the
rows. Track 1 (`6.5rem` = 104px) starts at the same x=220 for both, which is why **TYPE
measured 0.0 offset — track 1 precedes any gap, so the em/fixed divergence never reaches it**.
Track 2 therefore starts at `220 + 104 + gap`:

- Header: `324 + 11.11 = 335.11`
- Rows: `324 + 16 = 340`

A **4.89px** divergence — matching the measured 335.5 / 341.0 ink positions once each font's
left side bearing is allowed for. **KEY measured only 0.5px** because its `20rem` track is
anchored off the container's right edge, not off either gap, so it barely feels the
divergence.

Every one of the three findings recorded below under "Ruled out" is consistent with this
cause and no other. The `tauri:dev` inspector run this todo originally called for turned out
to be unnecessary — the cause was reachable from source plus the measurements already
recorded here, without a live DOM read. Recording that as a reusable lesson about this defect
class: an em-relative length shared across selectors with different font-sizes is diagnosable
statically once the font-sizes are known, and does not always need a live inspector session.

## Fix

`src/frontend/screens/Humble/Keys/index.css`: the combined selector's `column-gap` now reads
`var(--space-md-fixed)` instead of `var(--space-md)`. `--space-md-fixed` is
`calc(1 * var(--space-unit-fixed))` = `calc(1 * 16px)` (`_spacing.scss:12,17`) — exactly what
the rows already resolved to, so **the rows are pixel-unchanged**; only the header's gap moves
from 11.11px to 16px, closing the 4.89px divergence.

Guarded by `src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts`, describe
block `'Humble Keys shared row/column-header gap is font-size-independent (REQ-43-19 item 3,
260912-d84)'`: a block-scoped census pinning `column-gap: var(--space-md-fixed)` inside the
combined declaration's own body, with SANITY controls proving the anchor matches the real
combined form, fails against the pre-fix em-relative fixture, excludes the standalone header
block, and that the em-relative regex's anchored closing paren is load-bearing (it does not
false-fire on the fixed token, which contains it as a substring). A fifth SANITY test in the
file's `stripSourceComments integrity` describe guards against the fix's own rationale comment
(which names `--space-md` in prose) defeating the negative assertion.

## NOT verified live

**The 4.89px prediction has NOT been re-measured.** Verification here is by arithmetic and by
source-census test only. The Frontend jest project runs `testEnvironment: 'node'` with no
jsdom and no CSS engine, so no test in this repo can render anything or compute a used width —
a source-census test proves the string `column-gap: var(--space-md-fixed)` was written inside
the right block; it proves nothing about rendered geometry. The adjudicator of appearance
remains the next REQ-43-19 item 3 live run, which should:

- Re-measure the `GAME` column header label's ink left edge against the row titles' ink left
  edges, the same method used to produce the 335.5 / 341.0 figures above.
- Expect the offset to fall from **5.5 CSS px to within the ±2 threshold**.
- Re-confirm TYPE and KEY remain at their prior near-zero offsets (0.0 and 0.5 respectively),
  since this fix does not touch either of their tracks.

## Ruled out, with evidence

All three findings below are consistent with the established cause (a font-size-dependent
`em` gap on a shared declaration) and no other:

- **Not antialiasing:** the offset is stable at 4.5-5.0 across ink thresholds 28 / 60 / 100 / 140.
  Consistent — the cause is a computed-geometry difference, not a rendering/antialiasing
  artifact, so it does not vary with the ink threshold used to measure it.
- **Not a systematic header-vs-row offset:** TYPE header 220.0 vs row logo 220.0 (0.0); KEY
  header 934.5 vs KEY content 934.0 (0.5). GAME alone diverges. Consistent — TYPE precedes any
  gap and KEY's track is anchored off the container's right edge, so only GAME's track start,
  which is directly downstream of the one divergent gap, shows the effect.
- **Not markup:** the header is three plain `<span>` grid items (`Keys/index.tsx:634-638`); the
  title is a plain `<span>` with no padding (`HumbleKeyRow/index.tsx:729`, `.humbleKeyRowTitle`
  at `Keys/index.css:344-350`). Consistent — the cause is a CSS custom-property resolution
  difference, not markup structure; both elements are equally plain spans.
- **Confirmed visually** in `crop-game-column.png` (preserved at `43-12-evidence/`): every title
  sits exactly on the 341.0 rule while the header's "G" crosses left of it. Consistent — this is
  exactly the header-only leftward shift the arithmetic above predicts.

## Severity justification

`minor` is correct on its own terms — a ~5 px cosmetic misalignment in one column header, no
functional impact, no data at risk. It was nevertheless **the sole remaining blocker on Phase
43 closing**: every other REQ-43-19 item scored PASS across three runs, so this one offset was
what stood between the phase and closure. The source-side fix is now in and guarded by tests;
closure of that Phase 43 blocker still depends on the live re-measurement described above,
which has not happened.
