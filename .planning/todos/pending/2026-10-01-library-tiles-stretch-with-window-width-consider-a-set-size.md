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
