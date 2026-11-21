---
sketch: 011
name: integration-toggles
question: "Where do the per-game integration settings (shortcuts, Add to Steam, EOS overlay) go once they stop being ⋮ actions with flipping labels?"
winner: "A2 (absorbed into 012)"
tags: [game-page, toggles, settings, menu, install-info, multi-theme]
---

# Sketch 011: Integration Toggles

## Design Question

Shortcuts, Add to Steam and EOS Overlay are yes/no settings shown as ⋮ actions whose wording
flips. While pending, each one is swapped for a spinner, so the list jumps. Where should they go,
and how should pending and failed states look?

The gates mirror the real code: shortcuts only when installed; Add to Steam for non-Steam games;
EOS only for installed Epic games on Linux; "Runs for me" only on macOS (RunsForMeToggle).

## How to View

open .planning/sketches/011-integration-toggles/index.html

Toolbar: Slow backend (1.5 s per toggle) and Steam fails (the next Add to Steam errors) show the
pending and failure states. Deep links: `?v=a|a2|b|c&store=&platform=&installed=0&menu=1&err=1&busy=1`

## Variants

- **A: Toggle group in Install info**: a "Library & integration" group using the app's real
  ToggleSwitch (accent square + check), joining "Runs for me". Pending is shown per row;
  failures show inline with Retry.
- **A2: Same, with switches**: A's rows with a switch track on the right (would need a new
  ToggleSwitch variant).
- **B: Chip row**: pill chips at the top of Install info; descriptions in tooltips.
- **C: Checkmarks in ⋮**: the easiest build. They stay in the grouped menu as checkbox items
  with a ✓, and the menu stays open on click.

## What to Look For

- Click several toggles quickly with Slow backend on: does anything jump or block?
- Turn on Steam fails: is the inline error (A/A2), red chip (B) or "!" (C) noticeable enough?
- Switch to Steam on Windows, not installed: is the group empty? Then it should not render.
- dracula: chip on/off contrast (B), switch track contrast (A2).
