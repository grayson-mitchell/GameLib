---
sketch: 004
name: games-filter-panel
question: "What goes in the Games tier-2 panel — search, categories and filters, Steam/Playnite style?"
winner: null
tags: [navigation, filtering, library, information-architecture]
---

# Sketch 004: Games Filter Panel

## Design Question

Tier 2 under **Games** is not a nav list — it's the library's search, categories and filters,
following Steam and Playnite. So: how much filtering power belongs in a 218px panel, and how is
it organised?

## How to View

```
open .planning/sketches/004-games-filter-panel/index.html
```

**The filtering is real.** 24 games with store, install state, platform, genre, favourite,
recency and collection. Search, views, collections and facets all actually filter the grid, and
counts recompute live. You can judge this by using it, not by looking at it.

## Variants

- **A: Steam-style** — search, a flat list of views, then collections. Single-select, no facets.
- **B: Playnite-style** — search, views, then collapsible multi-select facet groups (Store /
  Platform / Genre) with live counts.
- **C: Hybrid** — A's top half verbatim, B's facets collapsed underneath, plus removable filter
  chips above the grid.

## What to Look For

- **Try "installed macOS roguelikes I own on GOG."** In B it's four clicks. In A it's impossible —
  and that matters more here than in most launchers, because spanning four stores is GameLib's
  entire reason to exist. A panel that can't answer "just my GOG games" is under-serving the
  product.
- **Then judge B cold.** Open it as if you'd never seen the app. It's a wall of controls before
  a single game. That's the honest cost of the power in the previous point.
- **In C, apply two or three filters and watch the chips.** Neither A nor B tells you *why*
  you're looking at 6 games instead of 24. Chips make the filter state legible and one-click
  reversible — arguably the most valuable idea in the sketch, and portable to whichever variant
  wins.
- **Counts exclude their own facet.** Tick `GOG`, then look at the Store counts — the others
  still show what they'd yield rather than collapsing to 0. Verify that behaviour feels right;
  it's the difference between counts that guide you and counts that lie.
- **Zero-result state.** Filter down to nothing (e.g. Linux + Amazon + RPG). Check the recovery
  path is obvious.
- **Narrow width (`820`).** The panel is fixed at 218px, so the grid absorbs the loss. Watch how
  few columns survive, and whether the panel starts to feel expensive.

## Structure This Assumes

Settled in 001–003, shown in the shell above each panel:

| Tier 1 tab | Tier 2 |
|---|---|
| Manage Accounts | **none** — runs full-bleed |
| Games | **this sketch** — search + views + collections + filters |
| Stores | nav list (GOG, Steam, Epic, Amazon, Deals, Store Search) |
| Settings | nav list (General, Game Defaults, Advanced, Wine Manager, Accessibility) |

Downloads remains top-right as ambient state with a progress ring.

## Notes

- **Platform filtering is not decoration here.** GameLib runs Windows games on macOS through
  Wine/CrossOver bottles, so "will this actually run on my machine" is a real question the panel
  can answer. Worth considering whether the platform facet should surface *playable* rather than
  *native*.
- Collections (Roguelikes / Cozy / Backlog / Co-op) are shown as user-defined and mocked. Whether
  they're manual, rule-based, or both is out of scope here.
- Genre data is invented for the mock. Real genre metadata would come from the store APIs, and
  coverage will be uneven across the four stores — a facet that's empty for Amazon titles will
  look broken. Worth checking before committing to a genre facet.
