---
sketch: 008
name: game-page-action-bar
question: "Where should the game page's primary actions live so Play is never pushed down or clipped?"
winner: "A′"
tags: [game-page, layout, action-bar, menu, multi-theme]
---

# Sketch 008: Game Page Action Bar

## Design Question

Today `GamePage/index.tsx` renders Play + Settings as the **last** child of the left column,
after description, notices, status and launch options. It is kept visible only by
`position: sticky` (quick 261103-w9l). The ⋮ menu opens on hover from the header, and the
important-info banner sits *after* the buttons. Where should the action bar go, and what page
structure does that imply?

Fixed for every variant (from the 2026-11-14 UI assessment):

- Notices and the warning banner sit **above** the action bar, never after it.
- The status line sits directly under the action bar and is **never hidden** by height-based
  container queries.
- ⋮ is a **click-opened** popover (`aria-expanded`, Esc closes and returns focus), grouped as
  Manage install / Library / Links / Uninstall.
- Every color is a theme token; the hard-coded `#8a8a8a` outline is gone.
- One scroll area per column (C: one per page).

## How to View

open .planning/sketches/008-game-page-action-bar/index.html

Deep links for review: `?v=a|b|c|now&theme=default|gruvbox|dracula&state=notInstalled|installing|installed|update|playing&w=980&h=520`.
In C, add `&scroll=700` to see the collapsed header.

## Variants

- **Current (ref)**: today's layout, kept for comparison.
- **A: Under title, 3fr/2fr**: same two-column grid, reordered. The left column becomes a card:
  art band, meta, title, notices, action bar, status; only About scrolls.
- **A′: A + docked action bar** ★ Selected (synthesis, from feedback "I like A, but keep the action bar at the
  bottom"): A's card and grid, with the action bar and status in a footer docked to the bottom of the card.
  The footer is a real row, not `position: sticky` inside a scroll area. Art, title, notices and
  About scroll together above it. ⋮ joins the gear in the footer and opens upward. A toolbar
  toggle puts the notices under the title or just above Play.
- **B: Full-width hero**: the art spans the page with title, notices, action bar and status
  overlaid; About and the info tabs sit in two columns below.
- **C: Collapsing sticky header**: the whole page scrolls once; when the hero's action bar
  scrolls away, a compact header (thumbnail, title, status, the same actions) slides in. The
  info panel stays pinned.

## What to Look For

- Cycle **game state** (Not installed → Downloading → Installed → Update → Playing). Does the
  primary button stay in the same place and read as the main action every time?
- Toggle **Notices** on and off. Does Play move? In A, it doesn't. In B and C, the title moves.
- **Short** height (520): B's hero takes most of the window and the tab panel nearly vanishes.
  A degrades best; C relies on scrolling.
- **760** width: all three stack to one column. Check where Play lands.
- Themes: dracula (light surfaces, pink primary) and gruvbox (muted primary). The primary text
  color is a per-theme sketch variable (`--on-primary`). The app has no such token today; see Open Questions.

## Open Questions

- The app has no "text on primary" token; `MainButton` inherits `.button` colour. Any
  variant needs one, or a verified pairing per theme.
- B/C overlay text on the art: real backgrounds can be bright. The bottom fade is the only
  protection; a scrim may be needed.

## Outcome

**A′ selected (2026-11-14), with notices under the title.** The user preferred A's layout but
wanted the action bar to stay at the bottom, where people already expect it. Decisions:

- **Grid:** `3fr 2fr`, replacing `1fr 1fr`. The left column is one card with theme-token borders,
  not the hard-coded `#8a8a8a` outline.
- **Left card, two rows:** a scroll area (art band → meta → title → notices → About) above a
  **docked footer** (action bar → status line). The footer is its own flex row, so the
  `position: sticky` workaround from quick 261103-w9l goes away. At short heights the title
  scrolls away; Play and status never do.
- **Notices:** under the title, inside the scroll area. The important-info banner moves from
  after the buttons to here, styled as a warning stripe with theme tokens and no hard-coded
  `color: black`.
- **Footer contents:** primary button (Install split / Play / Update + Play anyway / Pause /
  Stop), launch-option select only when installed, then gear and ⋮ right-aligned. ⋮ leaves the
  header, opens on **click**, and drops **upward**, grouped as Manage install / Library / Links
  / Uninstall.
- **Status line:** always rendered under the action bar. The container queries that hide
  `.gameStatus` at short heights are dropped.
- **Header row:** only the Back button is left; it moves onto the art band.

Still open for implementation: a text-on-primary token (see Open Questions).

**Implemented in quick 261114-1fi (2026-11-14).** Operator UAT changed one thing: in the docked footer the
status line sits **above** the action bar, not under it.

