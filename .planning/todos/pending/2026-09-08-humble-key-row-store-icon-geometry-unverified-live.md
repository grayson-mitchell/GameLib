---
created: 2026-09-08
title: "HumbleKeyRow store icon size, position, and alignment are code-level only — never verified against a live render"
area: humble-keys-ui
status: OPEN
severity: minor
platform: any
ready: live-gate
source: "quick task 260908-vo4 (operator-directed row redesign, 2026-09-08)"
files:
  - src/frontend/screens/Humble/Keys/index.css (.humbleKeyRowStoreLogo, .humbleKeyRowTitle)
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
resolves_phase: null
---

# Store icon geometry never proven against a live render

## Defect

Quick task 260908-vo4 moved the Humble store logo to be the first flex
child of `.humbleKeyRow`, sized it from the title's line box instead of
the caption's, and pinned it to the row's content-box top with
`align-self: flex-start`. All of this is code-level reasoning only. The
Frontend jest project (`src/frontend/jest.config.js`) has no jsdom and no
browser automation — component tests invoke `HumbleKeyRow` as a plain
function and inspect the returned React-element graph, which cannot
compute layout, box sizes, or resolved CSS. None of the following was
measured by anything that can see actual pixels:

1. The icon renders at the title's line-box height (target
   `calc(var(--text-md) * var(--humble-key-row-title-line-height))`, i.e.
   `calc(var(--text-md) * 1.2)` = 1.2rem = ~19px at the default 16px root),
   and that this size reads as "the icon is sized to the row" to the
   operator — rather than looking too large, or still too small relative
   to the title text it now sits beside.
2. `align-self: flex-start` actually lands the icon's box on the title's
   first line box, on BOTH a one-line row (no `ownedElsewhere` badge) and
   a two-line row (an `ownedElsewhere` row is the cheapest two-line case
   — the badge renders below the title inside `.humbleKeyRowInfo`).
3. The icon sits at the row's true left edge in all THREE tabs it renders
   in (All Keys, Keys-waiting, Giftable Spares). It is now the first flex
   child, so in Keys-waiting and Giftable Spares it precedes the fixed
   `9.5rem` `.humbleKeyRowAction` column and pushes every following
   column right — this is the literal reading of the operator's "put at
   begining of row" direction, which has never been seen rendered. If the
   operator instead meant "first in the info column" (i.e. still left of
   the title but not left of the action column), the fix is a one-line
   JSX reposition inside `.humbleKeyRowInfo` rather than the row root — so
   capture the operator's live reaction to the actual rendered position
   rather than guessing which reading they meant.
4. Declaring `line-height: var(--humble-key-row-title-line-height)`
   (`1.2`) on `.humbleKeyRowTitle`, where the font's UA `normal` line
   height previously applied with no declared value, did not visibly
   shift the title's own rendering or change the row's overall height.
   `1.2` was chosen specifically to sit close to UA `normal`, but "close"
   was reasoned from typical UA defaults (roughly 1.15-1.2 for common
   system fonts), not measured against the actual fonts GameLib ships
   with in any theme.

## What's known vs. unknown

- KNOWN: the DOM move itself is correct and jest-verified — the icon is
  pinned as the first non-falsy child of `<li className="humbleKeyRow">`
  by `HumbleKeyRow/__tests__/index.test.tsx`'s `firstRowChild` test.
- KNOWN: the icon carries `role="img"` + `aria-label={platformDisplay.name}`
  and no `aria-hidden`, jest-verified per platform.
- UNKNOWN: whether 1.2rem actually reads, to a human eye, as appropriately
  sized next to the title text at `--text-md`.
- UNKNOWN: whether `flex-start` truly aligns to the title's first line box
  in a live WebKitGTK/Chromium render, on both row heights.
- UNKNOWN: whether "first child of the row" (current implementation) or
  "first child of the info column" (an alternative, cheaper-to-swap
  reading of the same instruction) is what the operator actually wants
  once they see it rendered in Keys-waiting/Giftable Spares, where a fixed
  action column now sits to the icon's right.

## Suggested verification

Run the app, open Humble Keys with Steam/GOG rows and at least one
no-logo row (the operator holds a `generic` key — this is a live case,
not hypothetical) visible in the All Keys, Keys-waiting, and Giftable
Spares tabs, in both a light and a dark theme, and screenshot each.
Specifically check a two-line row (`ownedElsewhere` badge present) for
vertical alignment. Verify together with the amended colour todo
(`2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live.md`)
in one session — both need the same screenshot set.
