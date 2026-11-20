---
sketch: 009
name: game-settings-dialog
question: "How should the per-game settings dialog fix its header, hints, disclosures, default tab and grouping?"
winner: "B"
tags: [settings, dialog, game-settings, macos, steam, multi-theme]
---

# Sketch 009: Game settings dialog

## Design Question

The 2026-11-21 UX review of the per-game settings dialog (`SettingsModal` → `GamesSettings`) found:
the X has no reserved header space (#1), neutral hints use the danger fill (#2), Engine and
Steam overlay hide behind "(advanced)" twisties (#3), bridged Mac games open on the near-empty
Wine tab (#4), Launch without Steam repeats its losses twice (#5), labels mix three grammars (#6),
the Advanced tab has no grouping (#7), the title reads "X (Settings)" (#9), the autosave/App ID
footer is only visible after scrolling (#10), and the fixed 80% height (#11). Which overall
direction fixes them best?

Modelled on a bridged macOS Steam title (Low Magic Age, 576770).

## How to View

open .planning/sketches/009-game-settings-dialog/index.html

Deep links: `?v=a|b|c|t&tab=run|wine|winetricks|advanced&title=long&lws=api|clean|drm&lwson=1&theme=dracula`

## Variants

- **Today (reference)**: what ships now, so the problems are visible side by side.
- **A: Targeted fixes**: same MUI Dialog/Tabs; X gets its own header column, neutral note, no
  twisties, opens on Run, uppercase section rules, pinned footer, fit-to-content height.
- **B: Header card + grouped cards**: thumbnail header whose subline carries Game settings · App
  ID · Saved; Run-first tabs; each tab a stack of cards; fixed height.
- **C: Side-nav dialog**: tier-2 style vertical nav in a 210px sidebar holding title and Saved/App
  ID; content headed by the tab name with the X beside it.

## What to Look For

- Long title (toolbar) against the X in each variant.
- Switch tabs in A and watch the height change; compare with B/C's fixed height.
- Run tab with "Launch without Steam" on: one description plus one warning, not two lists.
- LWS: Steam DRM: the disabled toggle with (i) on the title line.
- Theme switcher: the neutral note and amber warning in gruvbox and dracula.
- Change any control: where the "Saved" confirmation shows.
- Review #s toggle maps each change to the review item number.

## Outcome (2026-11-21)

**Winner: B, for every item.** Decided item by item against the review numbers:

| # | Item | Decision |
|---|------|----------|
| 1 | Close X vs title | B: X in the header row beside a thumbnail; title clamps to two lines |
| 2 | Wine-tab hint | B: neutral accent-tinted note inside a "Wine engine" card; red kept for real warnings (Legacy) |
| 3 | Engine / Steam overlay twisties | B: plain always-visible fields, help in (i), no "(advanced)" suffix |
| 4 | Opening tab | B (= C): Run opens first and is first in order (Run, Wine, Winetricks, Advanced) for Mac engine games |
| 5 | Launch without Steam | B: losses listed once in the description; on-state adds an amber, theme-token risk-only warning; DRM = disabled + (i) |
| 6 | Labels | B: noun labels, explanation in (i) |
| 7 | Grouping | B: bordered cards: Run = Launch, Steam; Advanced = Launch target, Scripts, Wrappers & environment, Diagnostics & updates |
| 9 | Title | B: game title alone; "Game settings" in the subline |
| 10 | Saved / App ID | B: header subline "Game settings · Steam App ID · Saved automatically", flashing "Saved" on change; footer removed |
| 11 | Height | B: fixed 80% |

Also in scope for the fix (not sketched, no visual):

- **#8**: route the "Wine" and "Winetricks" tab labels through `t()`.
- **#12**: key the remembered tab by runner + app_name, not app_name alone (keep reading the old key once so existing choices survive).

Note: the 2026-11-21 todo "advanced-settings-twisties-to-headings" assumed the twisties were on
the Advanced tab; they are on Wine (Engine) and Run (Steam overlay). #3 and #7 here supersede it.
