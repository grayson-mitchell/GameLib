---
phase: quick-261011-ulj
plan: 01
subsystem: library-focus-row-strip
tags: [css, layout, paging, focus-row, tile-size]
requires: [261011-t4y]
provides:
  - wide just-played hero slot in the focus-row strip (D-01)
  - uniform-card paging pitch and grid-column-count page size (D-02)
  - strip end clip at the grid content edge (D-03)
  - forward chevron held at its physical position (D-04)
key-files:
  modified:
    - src/frontend/screens/Library/components/FocusRowStrip/index.css
    - src/frontend/screens/Library/components/FocusRowStrip/index.tsx
    - src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts
decisions:
  - "Hero hover/focus scale is 1.025 inside the strip (not the grid's 1.05): reach 13.43px at a 320px tile, inside the list's 15px padding"
  - "fitAllowance = gap - lead padding is read live (measureFitAllowance), not restated"
duration: single session
completed: 2026-10-11
status: complete
commits: 3
plan_head_before: cec63a68c82fd26b8f805dddd758c4b57c78c0b3
plan_head_after: c5a4eef256a37a96e548122e2a0215925505035d
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
---

# Phase quick-261011-ulj Plan 01: Focus-row strip follow-ups Summary

The focus-row strip now shows the wide just-played hero again (two tile widths plus one gap), clips its end at the grid's content edge so it never shows a full card in a column the grid cannot fit, keeps the forward chevron where it was, and pages by the grid's column count.

## Commits

| Task | Commit | Message |
| ---- | ------ | ------- |
| 1 (tracer) | `4dc7d4d88` | feat(quick-261011-ulj): restore the wide just-played hero in the focus-row strip; pitch measures a uniform card |
| 2 | `35658ca83` | feat(quick-261011-ulj): keep the strip hero's hover ring inside the 15px start clearance at every tile size |
| 3 | `c5a4eef25` | fix(quick-261011-ulj): clip the focus-row strip at the grid content edge, hold the forward chevron, page by the grid's column count |

## What changed

- **D-01 hero slot.** New rule `.focusRowTrack .gameList > :is(.justPlayed, :has(.justPlayed))` sets `flex` and `width` to `calc(2 * var(--focus-row-card-width, 156px) + 1.5rem)`. Both GameCard forms are covered (pre-reveal direct child; revealed plain div, then ContextMenu div, then `.gameCard.justPlayed`). `isFirstLane` is deliberately not passed.
- **D-02 paging.** `measureCardPitch` measures the list's second child (falls back to the first, then the default), so a hero cannot double the pitch. `pageScrollDelta` takes a third `fitAllowance` (default 0, non-finite treated as 0). New exported `measureFitAllowance(track)` returns gap minus the larger inline padding (24 - 15 = 9; total, 0 on any failure). `page()` in `index.tsx` passes it.
- **D-03 end clip.** Viewport is `margin-inline-start: -15px; margin-inline-end: 0`. Track clientWidth is now C + 15.
- **D-04 chevron.** `.focusRowStrip__control--forward` is `inset-inline-end: -15px` (same physical spot); back control unchanged.
- **Hero ring (discretion).** `.focusRowTrack .gameCard.justPlayed:hover, ...:focus-within { transform: scale(1.025) }` at (0,4,0); every existing `transform: none` reset ((0,4,1), (0,7,1)) still wins; no `!important`. GameCard CSS untouched.

## Tests rewritten / added

Rewritten: Test G (start bleed == list padding), Test H (start bleed < 16), the forward half of the logical-properties test (negative offset), P1 (clientWidth C + 15, allowance 9, tile widths MIN / DEFAULT / 188 / MAX), the clearance describe comment. Added: Test G2, chevron offset, hero slot gate (selector, identical calc text, N and G parity, descendant-`:has` gate, no minmax/1fr), hero ring gate (scale below grid scale, reach at 664px = 13.425 <= 15, grid-scale non-vacuity 21.85 > 16, vertical cover, no `!important`), hero-first and lone-child pitch cases, bare-count 360 vs allowance 540, allowance totality, `measureFitAllowance` cases, P1 non-vacuity, the `measureFitAllowance(track)` argument pin in index.tsx.

## Verification

| Check | Result |
| ----- | ------ |
| Targeted set baseline (cec63a68c) | 7/7 suites, 312 tests |
| Targeted set after Task 1 | 7/7, 320 |
| Targeted set after Task 2 | 7/7, 324 |
| Targeted set after Task 3 | 7/7, 333 |
| Broad Library set after Task 3 (baseline 47/47, 1239) | 47/47 suites, 1260 tests |
| eslint over written ts files | 0 errors (1 pre-existing `React.memo` warning at index.tsx:293, untouched code) |
| `pnpm codecheck` | exit 0 after each task |
| prettier `--file-info` | `ignored: false` for all five paths; `--check` passes |
| Scope | `git diff --name-only cec63a68c -- src` lists exactly the five files_modified; GameCard, Library/index.css, libraryTileSize.ts, tile-size slider, package.json and lockfile unchanged |
| `graphify update .` | ran |

No regression: nothing that passed at baseline fails.

## Deviations from Plan

None - plan executed as written. Note: the TDD "RED" run was observed for Task 2 (the strip hero scale rule was absent and the suite failed at collection on the missing `transform: scale()` match). For Task 3 the new assertions were written together with the implementation in one pass and the suites went green on the first run, so a separate RED run was not observed; the P1 non-vacuity assertion (allowance 0 pages one short at least once, allowance 9 never) proves the allowance is load-bearing.

## Residuals (carried from the plan)

- **Hero height delta across the range.** Against the untouched 275/205 hero ratio and the 173/275 portrait ratio the hero is +4.1px taller at a 140px tile, +2.5px at 156, -0.7px at 188 and 13.7px shorter at 320 (equal near 181px) - the same residual the old span-2 lane had.
- **Lone-hero overflow at large tiles.** A lone hero wider than a one-column grid overflows the strip, as it did the old lane; the oversized pitch then pages to the end of travel, which the browser clamps.
- **Controls' nudge band** keeps its width but moves from a card span in (C+1, C+15] to (C-14, C+1].
- **Owed live check (not done, not a checkpoint).** Operator re-test at a 188px tile on the Recently played strip under midnightMirage, gruvbox_dark and dracula: hero two columns wide with 16:10 art and PLAY at about its neighbours' height; strip shows as many full cards as the grid has columns; forward chevron has not moved; paging advances one grid row's worth of cards; hovering the hero at scrollLeft 0 shows its full ring on the start side; an RTL locale mirrors the strip. Also glance at the 140px and 320px slider ends.

## Known Stubs

None.

## Threat Flags

None - CSS and layout arithmetic only; no new network, auth, file or schema surface.

## Self-Check: PASSED

- All five files_modified exist and carry the changes.
- Commits `4dc7d4d88`, `35658ca83`, `c5a4eef25` exist in `git log`.
