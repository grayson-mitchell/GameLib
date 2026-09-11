---
created: 2026-09-11
title: "Humble Keys GAME column header label sits ~5.5 CSS px left of the row titles; cause unestablished"
area: humble-keys-ui
status: OPEN
severity: minor
platform: any
ready: code
source: "REQ-43-19 item 3, run 3 (20260911T075450Z), 43-12-evidence/measurements-run3.md; exposed by e344f589d fixing the larger centring defect"
files:
  - src/frontend/screens/Humble/Keys/index.tsx
  - src/frontend/screens/Humble/Keys/index.css
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
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

## Ruled out, with evidence

- **Not antialiasing:** the offset is stable at 4.5-5.0 across ink thresholds 28 / 60 / 100 / 140.
- **Not a systematic header-vs-row offset:** TYPE header 220.0 vs row logo 220.0 (0.0); KEY
  header 934.5 vs KEY content 934.0 (0.5). GAME alone diverges.
- **Not markup:** the header is three plain `<span>` grid items (`Keys/index.tsx:634-638`); the
  title is a plain `<span>` with no padding (`HumbleKeyRow/index.tsx:729`, `.humbleKeyRowTitle`
  at `Keys/index.css:344-350`).
- **Confirmed visually** in `crop-game-column.png` (preserved at `43-12-evidence/`): every title
  sits exactly on the 341.0 rule while the header's "G" crosses left of it.

## Cause NOT established

Both elements should resolve to the same grid track. The remaining candidates need a DOM read,
which a release build cannot provide — devtools are unreachable there by this repo's own P2
design constraint (`43-LIVE-GATE.md`'s Devtools-is-not-reachable finding), a structural
limitation this gate document already records. **The next step is therefore a `tauri:dev` run
with the inspector, not more pixel measurement.** Spending another packaged-build capture session
on this would not move it forward.

## Severity justification

`minor` is correct on its own terms — a ~5 px cosmetic misalignment in one column header, no
functional impact, no data at risk. It is nevertheless **the sole remaining blocker on Phase 43
closing**: every other REQ-43-19 item now scores PASS across three runs, so this one offset is
what stands between the phase and closure, even though its severity understates that schedule
impact.
