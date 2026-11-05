---
sketch: 007
name: settings-nav-icons
question: "Should every row in the Settings tier-2 nav carry an icon, or should icons mark only help & app actions?"
winner: "1"
tags: [navigation, tier-2, settings, icons, multi-theme]
---

# Sketch 007: Settings Nav Icons

## Design Question

The Settings tier-2 list (`NavShell/components/SettingsPanel/index.tsx`) has icons on 7 of 13
rows. The split is inherited, not designed: rows that were top-level items in Heroic's old
sidebar kept their icons, rows from its Settings submenu stayed text-only, and the two kinds are
interleaved. Which consistent treatment should replace it?

## How to View

open .planning/sketches/007-settings-nav-icons/index.html

## Variants

Rendered side by side rather than as tabs, at the user's request.

- **Current (reference)** — today's list, dimmed.
- **Option 1: icons on every row** ★ Selected — reordered into settings pages / help & app actions with a
  divider; six new glyphs; Appearance moves from `universal-access` to `palette`.
- **Option 3: icons mark actions** — same grouping; settings pages text-only, help & app
  actions keep icons. A toggle indents the text rows to the icon column.

## What to Look For

- Scanability of the first group: do General / Advanced / Log read faster with glyphs or without?
- Whether the six new glyphs are distinct or interchangeable at a glance.
- Option 3: does the text/icon split read as meaningful, or as inconsistent again?
- Option 3 label edge: hugging left vs indented to the icon column.
- Theme survival: gruvbox_dark (active text = inactive text) and dracula (light navbar).
- Windows: Game Defaults and Wine Manager disappear — does either option get lopsided?

## Outcome

**Option 1 selected (2026-11-05).** Every row carries an icon; the list is reordered into two
groups split by a divider — settings pages (General, Game Defaults, Advanced, Appearance, Wine
Manager, Log, System Information) then help & app actions (Report a problem, Documentation, App
Tour, About, Donate, Quit). The proposed glyphs were accepted as-is: `gear`, `compact-disc`,
`screwdriver-wrench`, `palette` (replacing `universal-access`), `file-lines`, `microchip`, `bug`;
existing glyphs unchanged. `gamepad` and `sliders` stay reserved for the tier-1 tabs.
