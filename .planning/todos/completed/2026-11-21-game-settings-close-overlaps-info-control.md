---
created: 2026-11-21
title: "Game settings dialog: the close (X) button overlaps an info control"
area: ui
files:
  - src/frontend/screens/Settings/components/SettingsModal/index.tsx
  - src/frontend/screens/Settings/sections/GamesSettings/index.tsx
severity: minor
platform: any
ready: live-gate
resolved: 2026-11-21
resolution: "The close X now has its own column in a header row beside the thumbnail and title (Dialog header slot, sketch 009 #1); live short/long-title check is the quick's post-execution UAT."
---

## Problem

Operator report (2026-11-21, while editing Low Magic Age 576770's per-game settings): the
game settings dialog's close button sits on top of an info control, so the two overlap.

`SettingsModal` renders `<Dialog showCloseButton>` and `<DialogHeader onClose=...>`. Check
whether that draws two close affordances, or whether the header's close collides with an
info icon (the `(i)` help icon on a label line, per the "help icon on title line" rule) at
the top-right of the first row or tab content.

## Fix shape

- Reproduce at the operator's window size, and check which info control it is (header,
  tab bar, or first field's help icon).
- Give the close button its own reserved space, or move the colliding control. Keep the
  macOS traffic-light and theme rules from the sketch findings in mind.
- Verify live in `pnpm tauri:dev` with both a short and a long game title.

## Resolution (2026-11-21, quick 261121-dzl)

The close X now has its own column in a header row beside the game thumbnail and title, through the new opt-in `header` slot on `Dialog` (`.Dialog__header`). `SettingsModal` no longer renders `DialogHeader`, so there is exactly one close button and nothing floats over the content. The long and short title live check is this quick's post-execution UAT (items 1 and 2).
