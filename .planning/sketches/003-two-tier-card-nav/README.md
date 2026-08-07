---
sketch: 003
name: two-tier-card-nav
question: "Under card tabs, how should a vertical tier 2 behave when two of four tabs have no children?"
winner: "Synthesis — only Manage Accounts goes full-bleed; Games' panel becomes filters, not nav"
tags: [navigation, information-architecture, shell]
---

# Sketch 003: Two-Tier Card Nav

## Design Question

Tier 1 is settled: **card / folder tabs** (001-C). Tier 2 runs **vertical**. The proposed tree:

```
Manage Accounts          (no children)
Games                    (no children)
Stores                   Settings
 ├ GOG                    ├ General
 ├ Steam                  ├ Game Defaults
 ├ Epic                   ├ Advanced
 ├ Amazon                 ├ Wine Manager
 ├ Deals                  └ Accessibility
 ├ Store Search
```

Two of the four tier-1 tabs have no tier 2. So: does the vertical panel persist, collapse, or
get filled with something? Each answer trades layout stability against content width, and you
pay that trade on every single tab switch.

## How to View

```
open .planning/sketches/003-two-tier-card-nav/index.html
```

## Variants

- **A: Always populated** — childless tabs get *views* instead of destinations. Games gets
  All / Installed / Recently played / Favourites / Hidden; Manage Accounts gets per-store scopes.
  The panel never empties, so the layout never shifts.
- **B: Collapses when empty** — faithful to the tree as written. Stores and Settings show a
  panel; Games and Manage Accounts run full-bleed.
- **C: User-collapsible rail** — always populated like A, plus a `«` control that shrinks the
  panel to a 50px icon rail. The user owns the trade, and the choice persists across tabs.

## What to Look For

- **Switch tabs repeatedly in B** (Games → Stores → Games). Content width jumps by 204px each
  time you cross between a tab with children and one without. Decide whether that reads as
  responsive or as the layout twitching.
- **Then do the same in A.** Nothing moves. The cost is that the Games grid — the screen you
  look at most — is permanently 204px narrower.
- **In C, hit `«`.** The panel becomes an icon rail. Ask whether the icons survive without
  labels, and whether one more control is worth the width it buys back.
- **The card-tab seam.** The active tab merges into the page surface below. Check that the seam
  still reads correctly now that the surface is split into panel + content — especially in
  `dracula`, where the navbar is lighter than the body.
- **Narrow width (`760`).** Four tabs, the traffic-light inset, and a 204px panel all compete.
  This is where C's collapse stops being a nicety.

## Placements Claude Made — Confirm or Move

Six destinations from `SidebarLinks/index.tsx` were not in the proposed tree. They are marked
**`NEW`** in the sketch so they are easy to spot and overrule:

| Destination | Placed under | Reasoning |
|---|---|---|
| Humble Keys | Stores | Key management is store-adjacent |
| Redeem a Steam key | Stores | Same |
| Console Mode | Settings | Behaves as a display mode |
| Logs | Settings | Existing Settings sub-item in the current sidebar |
| Documentation | Settings (below a separator) | Meta, low frequency |
| Support on Ko-fi | Settings (below a separator) | Meta, low frequency |
| **Downloads** | **Top-right, not a tab** | Ambient state with live progress, not a place you browse to. Rendered as a progress ring + count. This is the placement most worth arguing with. |

## Open Questions

- **"Manage Accounts" as a peer of Games and Stores** gives a low-frequency task first-position
  prominence. Worth confirming that's intentional rather than alphabetical accident.
- **Games vs Library** — the tree renames it. Consistent renaming has i18n key implications
  across the fork's translation surface.
- **Stores tier 2 mixes kinds** — GOG/Steam/Epic/Amazon are storefronts; Deals and Store Search
  are cross-store tools. A separator between them may help; not applied yet.
