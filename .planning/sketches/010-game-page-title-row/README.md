---
sketch: 010
name: game-page-title-row
question: "Where do Favourite, Hide and Categories live on the game page so their state is visible without opening ⋮?"
winner: "A (absorbed into 012)"
tags: [game-page, favourites, categories, hide, menu, multi-theme]
---

# Sketch 010: Game Page Title Row

## Design Question

`GameSubMenu/index.tsx` puts Favourite, Hide and Categories in a flat ⋮ list of up to 20 items.
Their state shows only as wording that flips ("Add To Favourites" or "Remove From Favourites"). Where
should they live on the page instead? Built on 008's A′ layout as it shipped in 261114-1fi
(status above the action bar in the docked footer).

Fixed for every variant: ⋮ is regrouped as Manage / Library / Open / (danger), which is what 008
decided and 261114-1fi did not build. Uninstall is last and red. Requirements leaves ⋮ (the tab
covers it). "Force Update if Available" is now "Check for update", and "Change Install Location"
is now "Set install folder…".

## How to View

open .planning/sketches/010-game-page-title-row/index.html

Deep links: `?v=now|a|b|c&theme=default|gruvbox|dracula&store=steam|epic|gog|sideload&platform=darwin|linux|win32&installed=0&fav=1&hid=1&menu=1`

## Variants

- **Current (ref)**: today's flat menu in its real order, with the flipping labels.
- **A: Heart on the title**: heart toggle beside the h1, your categories as outlined chips
  under the title with "+ Category", Hide stays in ⋮ as a checkmark item.
- **B: Toggles in the footer**: heart and eye icon toggles in the docked footer beside the gear
  and ⋮; categories go in the meta row after the genres.
- **C: Library strip**: a labelled strip under the title with Favourite and Hidden as text pills,
  plus the category chips.

## What to Look For

- Toggle Hidden: every variant shows a "Hidden from your library · Unhide" notice. Is that
  enough on its own to justify Hide staying in ⋮ (A)?
- Category chips vs genre chips: can you tell your categories from store genres at a glance?
- Cycle Categories (0 / 1 / 4) in the toolbar: how does each variant handle none and many?
- Width 760 and dracula: does the heart stay visible, and do the pills or icons stay readable?
