---
created: 2026-10-01T00:00:00.000Z
title: Library game tiles stretch with window width — consider a fixed or user-selectable tile size
area: ui
severity: minor
platform: any
ready: human
found_by: "Phase 38 38-E04 Linux live gate, operator observation, 2026-10-01"
files:
  - src/frontend/screens/Library/index.css:1-8
  - src/frontend/screens/Library/components/GameCard/index.css
---

## Problem

The Library grid is `grid-template-columns: repeat(auto-fill, minmax(156px, 1fr))`
(`.gameList`, `Library/index.css:4`). The `1fr` maximum makes tiles grow to absorb leftover width, so
tile size changes as the window is resized. The operator, while drag-resizing during the `38-E04` gate,
noticed this and does not think it is required.

## Solution

TBD, needs a design decision (hence `ready: human`). Options to weigh:

- Fixed tile width: `repeat(auto-fill, 156px)` with `justify-content`, so only the column count changes.
- A user-selectable "set size" (small / medium / large, or a slider) stored in settings, feeding the column
  width as a CSS custom property.
- Keep the current behaviour as an explicit "fill" option.

Check how `GameCard` art, the list view and the controller layout cope with a fixed width before choosing.

## Resolution (2026-10-11, quick 261011-t4y, commits fa3f581ce, ae196e6f9, 74f51d6ec)

**(a) The decision.** The operator chose a tile-size slider at the bottom of the Library's left panel,
over a fixed width and over a small/medium/large picker. Their four requirements, quoted as the plan
numbered them: D-01 there is a tile-size slider; D-02 it sits at the bottom of the left panel on the
Library screen; D-03 window size does not change tile size, the slider does (columns are fixed-width and
only the column count changes with window width); D-04 the Accessibility size setting (its Zoom range)
no longer changes tile size.

**(b) What shipped.** A labelled `Tile size` range input is the last child of `.Header__footer`, below the
game count row. It persists to `localStorage` key `libraryTileWidth` and writes `--library-tile-width` on
the document root; `Library/index.tsx` restores it in a mount-only `useLayoutEffect` before the first
paint. `.gameList` is now `repeat(auto-fill, var(--library-tile-css-width, 156px))` with
`justify-content: start`, so leftover width collects at the inline end and tiles never grow.

**(c) The range, and why.** 140 to 320px in 4px steps, default 156px. 140 is the first step-aligned value
above the controller-mode art-fit floor of 136.6px (`w * (275/173 - 4/3) >= 35`). 320 is inside the 336px
supremum the strip-end clearance gate was already proven at (ring reach `0.025w + 5.25` against the
strip's 15px inline padding). 156 is today's old `minmax` floor and every existing
`var(--focus-row-card-width, 156px)` fallback, so a fresh profile tiles like the narrowest old layout.
Both geometry gates were retargeted to the slider minimum and maximum rather than deleted.

**(d) List layout is unaffected.** `.gameListLayout` never used the column rule. The slider stays visible
in list layout because the focus-row strip above the list still renders cards at the tile width.

**(e) Strip width sync retired.** Strip cards are exactly one grid tile wide by construction: `.focusRowTrack`
aliases `--focus-row-card-width` to `--library-tile-css-width`, the same variable the grid columns read.
The JavaScript grid-arithmetic sync (column count, column width, scrollbar allowance, the flip-hold and
the `gridShown` prop) was deleted, because left running it would overwrite the strip with the old `1fr`
share and break the operator's 2026-10-07 "match the grid" ruling.

**(f) The zoom mechanism (D-04).** Accessibility Zoom is whole-webview page zoom (`setZoom`), which scales
every CSS px including the track. `tauriSetZoomFactor` now publishes the applied factor as `--webview-zoom`
on the document root once `setZoom` resolves, and `.listing` divides the slider value by it:
`calc(var(--library-tile-width, 156px) / var(--webview-zoom, 1))`. Text and every other control still
zoom as before; the 1.5rem gap stays zoom-scaled by choice.

**(g) Residuals, recorded plainly.**

- At zoom above 100%, a card's chrome (badges, buttons, titles) still zooms inside a fixed-size tile. The
  narrowest tiles therefore crop controller-mode art; the geometry gates are proven at zoom 1 only.
- At an effective zoom below 1 with large tiles, a hovered edge card's ring can reach past the strip's 15px
  inline padding, because that padding is a plain px value and is not divided by the zoom.
- After an in-session zoom change, a `window.location.reload()` (the TauriLoginPanel retry path) may leave
  the webview zoomed while `--webview-zoom` resets to absent, until the next zoom change or restart.
  The new pending todo `2026-10-11-accessibility-zoom-is-not-reapplied-at-startup-under-tauri` would close
  this when it re-applies the saved zoom at boot through `tauriSetZoomFactor`.

**(h) NOT live-verified.** Owed: a live run on midnightMirage, gruvbox_dark and dracula; drag-resizing the
window (tile width must not move, only the column count); Accessibility zoom at 60%, 100% and 200%; list
layout (slider visible, strip cards at tile width); controller layout; and an RTL locale (slider track
direction and label alignment).
