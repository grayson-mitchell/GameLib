---
name: sketch-findings-gamelib
description: Validated design decisions, CSS patterns, and visual direction from GameLib's navigation-redesign sketches — app-level card/folder tabs replacing the sidebar, the two-tier nav structure, the macOS traffic-light inset, multi-theme survival rules, and the Games library filter panel (search, views, collections, cross-store facets, filter chips). Auto-loaded during UI implementation on GameLib, especially Phases 34.10 and 34.11.
---

<context>
## Project: GameLib

Introducing horizontal tabs at **app level** — replacing the left sidebar
(`components/UI/Sidebar/`) with a top navigation bar. Every sketch renders inside a simulated
macOS window using GameLib's real design tokens (`src/frontend/styles/_colors.scss`,
`src/frontend/themes.scss`, Rubik/Cabin) so choices were judged in the app's actual palette rather
than an invented one.

Three real themes ship with the sketches — `midnightMirage` (default), `gruvbox_dark`, `dracula` —
because a tab style that only works in cyan is not a usable tab style. That decision is what
picked the winner.

Reference points during intake: MUI Tabs (already in the stack), Vercel Geist, macOS
`NSSegmentedControl`, Ant Design card tabs, Steam and GOG Galaxy library sidebars, Playnite's
filter panel.

Sketch session wrapped: 2026-08-07
</context>

<design_direction>
## Overall Direction

**Two-tier navigation.** Tier 1 is a horizontal row of four **card/folder tabs** where the active
tab merges into the content surface below it. Tier 2 is a ~204px **vertical panel** whose content
is scoped to the selected tab — filters on Games, nav lists on Stores and Settings, absent on
Manage Accounts.

The sidebar is not deleted so much as **demoted**: it stops being global navigation and becomes a
contextual panel that earns its width per tab.

**Palette** — real tokens, unchanged:

| Token | Value | Role |
|---|---|---|
| `--brand-primary` | `#1de8f5` | accent, active states, progress |
| `--brand-primary-hover` | `#0db4be` | accent hover |
| `--brand-text-01` | `#caf3fd` | primary text |
| `--neutral-01` | `#070a0b` | body background |
| `--neutral-02` | `#161c1e` | navbar / surface |
| `--neutral-03` | `#272f31` | raised surface, borders |
| `--neutral-04` | `#51595a` | strong border, dim text |
| `--neutral-05` | `#a8aeaf` | muted text |

**Typography** — `Rubik` primary, `Cabin` secondary, 1.2 scale ratio on a 16px root
(`styles/_typography.scss`).

**Shape and motion** — 6px radius on controls, 10px on containers, pills at `9999px`. Transitions
are `.12s–.22s ease`; the one cubic-bezier is `cubic-bezier(.4,0,.2,1)` for panel width.

**Two constraints override aesthetics:**

1. **78px** at the window's top-left belongs to the macOS traffic lights whenever the Tauri
   titlebar is transparent or overlaid. No top-mounted bar starts at `x=0`.
2. Some shipped themes make the **navbar lighter than the body** (`dracula` most severely). Active
   states must be defined relationally, never as "the bar is the dark band".
</design_direction>

<findings_index>
## Design Areas

| Area | Reference | Key Decision |
|---|---|---|
| Navigation shell | `references/navigation-shell.md` | Card/folder tabs won on **theme survival**, not looks; tier 2 is vertical; Downloads is an ambient progress ring, not a tab |
| Library filtering | `references/library-filtering.md` | Hybrid panel — views and collections one click, facets collapsed below, removable chips above the grid; facet counts **exclude their own facet** |

## Phase Mapping

- **Phase 34.10** — navigation shell → read `references/navigation-shell.md`
- **Phase 34.11** — library filtering → read `references/library-filtering.md`

## Theme

`sources/themes/default.css` is the winning theme (`midnightMirage`, real token values).
`sources/themes/gruvbox.css` and `sources/themes/dracula.css` exist as **stress tests** — verify
any nav change against all three. Dracula is the one that breaks naive implementations.

## Source Files

Original sketch HTML is preserved in `sources/`. All four are interactive and self-contained —
open them directly in a browser. Each carries a toolbar (bottom-right) with a theme switcher,
viewport widths, and an **Annotate** toggle that renders the 78px traffic-light reserve.

Sketch 004 is a **working filter engine** over 24 games, not a static mockup.
</findings_index>

<metadata>
## Processed Sketches

- 001-app-level-tab-bar — winner: **C** (card / folder)
- 002-sidebar-overflow-strategy — winner: **B adapted** (two tiers, second level vertical)
- 003-two-tier-card-nav — winner: **Synthesis** (only Manage Accounts full-bleed)
- 004-games-filter-panel — winner: **C** (hybrid)

Planning record: `.planning/sketches/MANIFEST.md` and each sketch's `README.md`.
</metadata>
