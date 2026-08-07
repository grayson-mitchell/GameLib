---
sketch: 002
name: sidebar-overflow-strategy
question: "If the sidebar becomes 5 top tabs, where do the other ~9 destinations go?"
winner: "B (adapted — second level runs vertical, not horizontal; see 003)"
tags: [navigation, information-architecture, shell]
---

# Sketch 002: Sidebar Overflow Strategy

## Design Question

`components/UI/Sidebar/components/SidebarLinks/index.tsx` carries roughly **14 destinations**:

| Kind | Destinations |
|------|-------------|
| Content | Library, Stores (Epic / GOG / Steam / Amazon), Deals, Store Search, Humble Keys |
| Utility | Downloads, Wine Manager, Console Mode, Redeem a Steam key |
| Account / meta | Manage Accounts, Accessibility, Settings (5 sub-items), Documentation, Ko-fi |

A horizontal tab bar comfortably holds 5–7. So the nine that don't fit need somewhere to live.
This is the question that decides whether the top-nav direction works at all — a beautiful tab
style is wasted if the rest of the app becomes unreachable.

## How to View

```
open .planning/sketches/002-sidebar-overflow-strategy/index.html
```

All three variants deliberately reuse **sketch 001's underline style**, so what you're judging
here is structure, not appearance.

## Variants

- **A: Five tabs + "More" menu** — promote the daily five, hide nine behind `⋯`.
- **B: Two-level bar** — four broad sections on top (Library / Stores / Tools / Settings), each
  revealing a contextual second row. Nothing is hidden.
- **C: Icon rail + top tabs** — split by *kind*: content becomes top tabs, utilities become a
  52px persistent icon rail. Nothing is hidden.

## What to Look For

- **Open the `⋯` menu in A, then click any item.** The tab bar goes dark — no tab is lit,
  because you're somewhere the tab bar cannot represent. That orphaned state is A's real cost,
  and it's worth deciding whether you can live with it.
- **In B, switch between the four top tabs.** The second row rewrites itself each time. Judge
  whether that shifting row is orienting or disorienting.
- **In C, hover the rail icons.** Utilities are always one click away and always visible — but
  they're icon-only, so tooltips are doing the teaching. Ask whether 🍷 and ▣ are learnable.
- **Vertical chrome budget.** A = 46px, B = 84px, C = 46px plus a 52px vertical strip. B spends
  the most screen height; C keeps a vertical strip, which is the thing removing the sidebar was
  supposed to reclaim.
- **Migration risk.** C is the smallest change from today — it keeps a vertical strip and just
  demotes it. B maps almost 1:1 onto the submenu structure `SidebarLinks` already has.

## What This Sketch Does Not Cover

Panel contents are placeholders. 002 tests navigation structure only; the screens themselves are
out of scope here.

## Honest Framing

There is a fourth answer this sketch doesn't build: **keep the sidebar.** It holds 14
destinations without strain, which is exactly what horizontal tabs struggle with. If none of A/B/C
feels better than what's there now, that is a legitimate and useful outcome — the sketch will have
earned its cost by saving the refactor.
