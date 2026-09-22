---
created: 2026-09-11
title: "Humble Keys GAME column header label sits ~5.5 CSS px left of the row titles; cause unestablished"
area: humble-keys-ui
status: "RESOLVED 2026-09-13 by quick-260912-d84 -- cause established statically (the shared column-gap resolved two different pixel values off two different font-sizes); fixed by pinning the gap to a fixed-length token. RE-MEASURED LIVE 2026-09-18 and PASSED (Phase 43 UAT run 4; recorded here 2026-09-22 by quick-260922-juw): header 340.0 CSS px vs six row titles 340.0-341.0, divergence max 1.0 against the +/-2 threshold; the header moved right 4.5 CSS px against d84's predicted 4.89. ONE bullet of the three the NOT-verified-live section asked for is STILL OWED -- the TYPE/KEY re-confirmation was never taken."
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

## NOT verified live (SUPERSEDED 2026-09-22 -- see "Verified live" below; body preserved verbatim)

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

## Verified live 2026-09-22 (Phase 43 UAT run 4, measured 2026-09-18)

**The re-measurement the section above says is owed has now been taken, and it PASSED.** The
figures below are transcribed from `43-UAT.md` test 9, committed `a1f2f2d0d`, which is the
durable record; this section exists so that this todo stops asserting an un-taken measurement.

**Build identity.** HEAD `63e140d03`, `gamelib-shell` sha256
`8edbf95eabda0a53e1c37ed94ad1167318c04f875e882c3f49b6e9d702dd382d`, DMG-recovered and
hash-verified against `target/release/`. The fix was confirmed present in `build/renderer`
BEFORE any measurement was taken -- the same pre-measurement check run 3 introduced after run
1's verdict was undermined by a build that predated its own fix.

**Geometry.** Window 1280x800 pt at device origin (232,130), SCALE 2.0 exact (screen capture
2940x1912).

| | run 3 (2026-09-11) | run 4 (2026-09-18) |
|---|---|---|
| `Game` header label ink left edge | 335.5 | **340.0** |
| six row title ink left edges | 340.0-341.0 | 340.0, 340.5, 341.0, 341.0, 340.0, 340.0 |
| header-vs-titles divergence | 5.5 (**FAIL**) | **max 1.0 (PASS, threshold +/-2)** |

The header moved **right by 4.5 CSS px**. `260912-d84` predicted **4.89**. Direction and
magnitude both agree, which is what makes `column-gap: var(--space-md-fixed)` the thing that
moved it rather than a coincidence measured after the fact.

**Not an antialiasing artifact.** Re-scored at ink thresholds 28 / 60 / 100 / 140: the header
reads 340.0 / 340.0 / 340.5 / 340.5 against titles spanning 340.0-341.5, so the divergence
stays <=1.5 across the sweep. This is the same threshold-sweep discipline that established the
original 5.5 offset was real.

**The scanner was negative-controlled, not trusted blind.** Before measuring run 4, the same
pure-Python PNG leftmost-ink scanner was pointed at run 3's OWN committed evidence
(`43-12-evidence/capture-2-top.png`) and reproduced run 3's published numbers exactly -- header
335.5, titles 340.0 / 341.0 / 341.0 / 340.0 / 340.5 / 341.0. A tool that could not reproduce
the old FAIL would not have been trusted to certify the new PASS.

**Band identity confirmed visually, not inferred from geometry.** The 340.0 band was cropped and
read as the literal word "Game" sitting above "Asguaard", so the number is the header label and
not some other ink at a similar x.

### Still owed: the TYPE/KEY re-confirmation

The superseded section above asks for THREE things. Bullets 1 and 2 are discharged by the table
above. **Bullet 3 is NOT** -- "Re-confirm TYPE and KEY remain at their prior near-zero offsets
(0.0 and 0.5 respectively)" was never taken; test 9's measured block carries no TYPE or KEY
figures at all. The fix moves only the header's gap from 11.11px to 16px and leaves the rows
pixel-unchanged, and TYPE sits upstream of any gap while KEY's track is anchored off the
container's right edge -- so both are expected to be untouched. **Expected is not measured.**
Recorded here as outstanding rather than rounded up into the PASS.

### Evidence durability

`43-UAT.md` test 9 is the committed record and the one to cite. The raw run-4 captures
(`run4-capture-1.png`, `crop-game-header.png`, `test9-threshold-stability.txt`) were written to
an ephemeral session scratchpad under `/private/tmp/claude-501/` and are **NOT committed** --
unlike run 3's evidence, which lives in `43-12-evidence/`. Anyone re-opening this defect should
expect the run-4 captures to be gone, leaving the transcribed figures above as all that survives.

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
what stood between the phase and closure. The source-side fix is in, guarded by tests, and
**live-confirmed by Phase 43 UAT run 4 on 2026-09-18** (see "Verified live" above) -- so this
todo no longer blocks Phase 43. What remains is bookkeeping in `43-LIVE-GATE.md`, whose stated
verdict still reads `FAIL -- 28 PASS / 1 FAIL` and carries no record of run 4 at all.
