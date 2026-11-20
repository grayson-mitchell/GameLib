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
