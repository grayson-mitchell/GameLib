---
phase: quick-261011-vl0
plan: 01
subsystem: library-ui
tags: [css, gamecard, focus-row-strip, geometry, source-gates]
requires: [261011-ulj, 261011-t4y]
provides:
  - content-driven library card height (3:4 art + pinned 51px icons bar)
  - pre-reveal placeholder equal to the revealed card height
  - strip hero equal to neighbour height by construction, letterboxed wide art
affects:
  - src/frontend/screens/Library/components/GameCard/index.css
  - src/frontend/screens/Library/components/FocusRowStrip/index.css
tech-stack:
  added: []
  patterns:
    - custom properties --game-card-art-height / --game-card-bar-height on .gameCard
    - ".gameCard:empty" placeholder styling
key-files:
  modified:
    - src/frontend/screens/Library/components/GameCard/index.css
    - src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts
    - src/frontend/screens/Library/components/FocusRowStrip/index.css
    - src/frontend/screens/Library/libraryTileSize.ts
decisions:
  - "Bar pinned with block-size: var(--game-card-bar-height) (51px), not min-height"
  - "Placeholder styled with .gameCard:empty, no TSX change"
  - "Letterbox bands painted on the hero img as background-image"
  - "libraryTileSize.ts and FocusRowStrip/index.css changed in comments only"
metrics:
  tasks: 2
  files: 5
  commits: 2
commits: 2
plan_head_before: bef92ec40dbb5cf11f2b8c0e421525a4d5f9857a
plan_head_after: 5cda5495cc326254f41ab51de6fa3b2300e89290
actuals:
  tokens: 30000
  tasks: 2
  commits: 2
status: complete
completed: 2026-10-11
---

# Phase quick-261011-vl0 Plan 01: Library card geometry follow-ups Summary

Library card height is now content (3:4 art plus one pinned 51px icons bar) at every tile width in grid and strip, in both input modes; the strip hero is its neighbours' height by construction and shows its whole wide art letterboxed over the card gradient.

## Commits

- `891b95339` Task 1: content-driven card height, placeholder, controller invariance, gates G1-G8, strip clearance gate retargeted
- `5cda5495c` Task 2: hero height by construction, letterbox, gates H1-H4, strip hero gates retargeted

## What changed

- `.gameCard` lost `aspect-ratio: 173/275` and gained `--game-card-art-height` (`calc(var(--focus-row-card-width, var(--library-tile-css-width, 156px)) * 4 / 3)`) and `--game-card-bar-height` (`calc(35px + 2 * var(--space-xs-fixed))`).
- `.gameCard > a` lost `height: 100%`; `.gameCard > .icons` gained `block-size: var(--game-card-bar-height)`; `.gameCard.gamepad > .icons` stopped zeroing padding (only `background: transparent` remains).
- New `.gameCard:empty` rule gives the pre-reveal placeholder `block-size: calc(art + bar)`.
- `.gameCard.justPlayed` rule deleted. `.justPlayedImg` is now `display: block; block-size: var(--game-card-art-height); object-fit: contain; width: 100%; background-image: var(--gradient-gamecard)`.
- Card heights: 237.67 / 259 / 301.67 / 317.67 / 424.33 / 477.67 px at 140 / 156 / 188 / 200 / 280 / 320.
- `FocusRowStrip/index.css` and `libraryTileSize.ts`: comments only (verified by a comment-stripped diff against `bef92ec40`).

## Verification

- RED recorded before each CSS edit. Task 1: controller suite failed G1-G7, strip suite failed (collection, then the rest) until CSS landed. Task 2: H1-H3 and the strip hero construction test failed.
- Targeted set (Task 1 and Task 2 command): 10/10 suites; 384 tests after Task 1, 389 after Task 2 (baseline 380).
- Broad Library set: 47/47 suites, 1269 tests (baseline 1260).
- `npx eslint` on the changed test and ts files: exit 0. `pnpm codecheck`: exit 0.
- Prettier: all changed paths `ignored: false`, `--check` passes.
- Comment-only gate: both `FocusRowStrip/index.css` and `libraryTileSize.ts` print "comment-only diff".
- `git diff --name-only bef92ec40 -- src` lists exactly the five files_modified; "out-of-scope files untouched" printed.
- `graphify update .` ran.

## Deviations from Plan

None in scope. Two minor implementation notes:

- The `--game-card-art-height` and `.gameCard:empty` declarations were reflowed by prettier across lines; the G5 regex in `gameCardControllerGeometry.test.ts` tolerates the resulting single space after `calc(` and before `)`.
- G8 and H3's numeric parts compute revealed and placeholder heights from the same two parsed terms (as the plan specifies), so they are arithmetic over parsed inputs rather than independent measurements. G3-G6 and H2/H3's `toContain` carry the structural proof.

## Residuals

- `.gameCard`'s `background-color: var(--gradient-gamecard)` paints nothing (a gradient is not a `<color>`), so the card gradient is never painted on the card itself; left as is. The hero now paints its own gradient via `background-image`, so the hero bands will look different from the card body.
- `.gameList.firstLane` in `Library/index.css:17-23` is dead (`isFirstLane` is never passed). Not touched.
- Card heights change: +11px at 156 (248 to 259) and -31px at 320 (508.67 to 477.67), so rows per screen change accordingly.
- The controller-mode bar region is now a constant 51px transparent band under the art (badge centred). The operator should judge that look.
- **Live check owed (not run):** Games library with Recently played as the focus row, at tile sizes 140, 188, 200, 280 and 320: bar directly under the art with no overlap and no gap; hero exactly its neighbours' height; hero art uncropped with gradient bands; mouse/controller handoff does not change card height or move the badge; themes midnightMirage, gruvbox_dark and dracula. Please note the Accessibility zoom in use (zoom-1 maths puts the old hero crossover at 181px while the operator saw it near 280).

## Known Stubs

None.

## Threat Flags

None. Display-only CSS and test changes; no new endpoints, storage or data paths.

## Self-Check: PASSED

- All five files_modified exist and are in the diff against `bef92ec40`.
- Commits `891b95339` and `5cda5495c` exist on `quick-261002-b63`.
