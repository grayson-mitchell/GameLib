---
sketch: 012
name: game-page-no-menu
question: "If the game page drops ⋮ entirely, where does each of its ~20 items live: the left card, the ⚙ settings dialog, the right panel, or the button row?"
winner: "A"
tags: [game-page, information-architecture, menu, install-info, settings, layout, multi-theme]
supersedes: [010, 011]
---

# Sketch 012: Game Page Without ⋮

## Design Question

The page already has three homes: the left card (the game), the ⚙ settings dialog
(redesigned in 009, shipped in 261121-dzl), and the right info panel. Nearly everything in ⋮ is
either a setting, a fact about the install with an action attached, or library state, and each
fits one of those homes better. Can ⋮ go completely, and which actions (if any) earn a spot in the
button row?

Takes the likely winners of 010 (A: heart by the title, category chips) and 011 (A2: switch rows)
as given, and places them in the whole page.

## Principle

Put each action next to the thing it changes:

- **Left card = the game** (the same for everyone): store link, Edit details, Favourite,
  Categories, Hide.
- **Right panel → Install = your copy** (facts with their own actions): Location → Open / Move /
  Wrong folder?; Size → Modify; Version → Verify / Check for updates / What's new; Engine →
  Open prefix; Cloud saves → Open saves folder; integration switches; Uninstall.
- **⚙ dialog = how it runs**: EOS overlay (Run → Launch), Logs (new tab; today it is a separate
  `SettingsModal` type), prefix folder button (Wine).
- **Button row = tier one**: Install (split ▾ for options / locate) or Play + launch option, ⚙.
  Uninstall only in variant B.

## How to View

open .planning/sketches/012-game-page-no-menu/index.html

"Where did each item go?" shows the full map. "Show moved items" tags everything that came out of ⋮.
Click ⚙ to see the dialog's Run / Wine / Advanced / Logs tabs.
Deep links: `?v=a|b|c&store=&platform=&state=notInstalled|installed|update&settings=1&dlg=logs&map=1&anno=1`

## Variants

- **A: Install tab is the hub**: the right panel's first tab becomes "Install"; Uninstall sits in a
  danger zone at its bottom. Footer: Play, launch option, ⚙.
- **B: A + Uninstall in the button row**: a trash icon beside ⚙ (for Steam it offers this copy /
  all copies); no danger zone.
- **C: The game | Your copy**: the left card gets tabs About / Ratings / Requirements /
  Achievements; the right column becomes "Your copy" with status and the Play bar on top, the
  install hub and Uninstall below.

## What to Look For

- Run the map against the page: is any item harder to find than in ⋮? (Logs and EOS are the
  riskiest: they now need ⚙.)
- Not installed: the Install split ▾ carries "Install with options…" and "Locate existing
  installation…". Is that discoverable enough?
- Epic + Linux: the longest Install tab. Does it scroll acceptably at Short height?
- B: does a trash icon two buttons from Play feel risky or convenient?
- C: does moving Play to the right column break the 008 "Play at the bottom" habit?

## Outcome (2026-11-21)

**Winner: A. The Install tab is the hub, and ⋮ is removed.**

- **⋮ goes.** Every item moves to the home in the map ("Where did each item go?"). Requirements
  is dropped (the tab covers it), and so is the left card's play-time block (the status line covers it).
- **Footer:** status line, then Play (or an Install split ▾ holding "Install with options…" and "Locate
  existing installation…"), launch option, ⚙. No Uninstall here.
- **Left card:** the store badge links to the store page; an "Edit details" pencil on the art;
  a heart by the title (010-A); outlined category chips with "+ Category" (010-A); a quiet Hide
  toggle at the end of the library row, with an Unhide notice while hidden.
- **Right panel:** the first tab is renamed **Install** (from "Install info"). Facts carry their own
  actions: Location → Open / Move… / "Wrong folder?" (set install folder); Size → Modify…;
  Version → Verify / Check for updates / What's new; Engine → Open prefix; Cloud saves →
  Open saves folder. Then the **Library & integration** switch rows (011-A2: switch track,
  right-aligned), with Runs for me, shortcuts and Show in Steam. Last comes a **danger zone** with
  Uninstall… (and Remove all copies… for Steam).
- **⚙ dialog:** EOS overlay becomes a switch in Run → Launch (Linux, Epic). Logs becomes a tab
  in the dialog (merging the `log` SettingsModal type). The Wine prefix field gets a folder button.
- **Tab labels:** Install · Achievements · Ratings · Requirements.

Open for implementation:
- 011-A2's switch track is a new ToggleSwitch variant and needs a pass in every theme.
- The game card's right-click menu still has its own copy of these actions (quick-261115-szs
  made it match ⋮). Decide separately whether it keeps Favourite/Hide/Categories.
