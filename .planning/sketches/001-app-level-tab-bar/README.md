---
sketch: 001
name: app-level-tab-bar
question: "What should an app-level horizontal tab bar look like, replacing the sidebar?"
winner: "C"
tags: [navigation, tabs, shell, macos]
---

# Sketch 001: App-level Tab Bar

## Design Question

GameLib's primary navigation is a left sidebar. If it becomes a horizontal tab bar at the top
of the window, what should that bar *look* like — and does the shell still hold together?

## How to View

```
open .planning/sketches/001-app-level-tab-bar/index.html
```

## Variants

- **A: Underline** — text tabs with a cyan indicator bar that slides between them. Hairline
  divider separates the bar from content.
- **B: Segmented pill** — a recessed track holding raised pills, mirroring macOS
  `NSSegmentedControl`.
- **C: Card / folder** — the active tab merges into the content surface below, so the tab
  visibly owns the panel.

## What to Look For

- **The macOS traffic-light collision.** Every variant reserves `78px` at the left of the bar.
  Hit **Annotate** in the toolbar to see the reserved zone. This is a hard constraint under
  Tauri whenever the titlebar is transparent or overlaid — the tab bar cannot start at x=0.
- **Theme survival.** Switch the theme dropdown through `midnightMirage` → `gruvbox_dark` →
  `dracula`. Dracula is the stress case: its navbar is *lighter* than the body, which inverts
  the figure/ground assumption that A and B lean on. C is the only variant that reads the same
  in all three.
- **Narrow widths.** At `760` the wordmark, five tabs, traffic-light inset, and right-hand
  icons are all competing for one row. Watch which variant breaks first.
- **Indicator motion (A).** Whether the sliding bar reads as helpful or fussy at this size.
- **Chrome weight.** C is the loudest. Decide whether that presence is worth the pixels for a
  bar you look at all day.

## Notes

- Variant A is the path of least resistance: `WineManager/index.tsx:222` already renders MUI
  `<Tabs>/<Tab>`, and `components/UI/TabPanel/index.tsx` already exists. A is largely a restyle
  of an existing pattern rather than a new component.
- All colours come from real tokens in `src/frontend/styles/_colors.scss` and `themes.scss` —
  nothing here is invented.
- Content panels are functional (tabs switch, toggles toggle, buttons respond) so the bar can
  be judged in motion rather than at rest.

## Open Question Carried to 002

Five tabs are shown here. The real sidebar has **~14 destinations**. Sketch 002 addresses where
the other nine go — and that answer may retroactively kill variant B, whose fixed-width track
degrades fastest as items are added.
