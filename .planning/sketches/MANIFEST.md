# Sketch Manifest

## Design Direction

Introducing horizontal tabs to GameLib at **app level** — replacing the left sidebar with a top
navigation bar. Sketches render inside a simulated macOS window using GameLib's real design
tokens (`styles/_colors.scss`, `themes.scss`, Rubik/Cabin) so choices are judged in the app's
actual palette rather than an invented one. Three real themes ship with the sketches
(`midnightMirage`, `gruvbox_dark`, `dracula`) because a tab style that only works in cyan is not
a usable tab style.

## Reference Points

- MUI Tabs — already in the stack, already used at `WineManager/index.tsx:222`
- Vercel Geist tabs — underline weight and indicator motion
- macOS `NSSegmentedControl` — segmented pill direction
- Ant Design card tabs — folder direction
- Steam / GOG Galaxy — precedent for underline tabs in game launchers

## Hard Constraints Discovered

| Constraint | Source | Effect on design |
|---|---|---|
| macOS traffic lights occupy ~78px at window top-left | Tauri transparent/overlay titlebar | No top-mounted bar can start at x=0; every variant reserves the inset |
| Sidebar carries ~14 destinations | `SidebarLinks/index.tsx` | A 5–7 item tab bar cannot absorb them; overflow strategy required (sketch 002) |
| Multiple user-selectable themes, some with navbar *lighter* than body | `themes.scss` (dracula) | Tab styles relying on bar-darker-than-content invert and fail |

## Sketches

| # | Name | Design Question | Winner | Tags |
|---|------|----------------|--------|------|
| 001 | app-level-tab-bar | What should an app-level tab bar look like? | **C — card / folder** | navigation, tabs, shell, macos |
| 002 | sidebar-overflow-strategy | Where do the other ~9 destinations go? | **B, adapted** — 2nd level vertical, not horizontal | navigation, information-architecture, shell |
| 003 | two-tier-card-nav | How does a vertical tier 2 behave under card tabs? | _pending_ | navigation, information-architecture, shell |

## Decisions So Far

**Tab style: card / folder (001-C).** The active tab merges into the content surface, so it
visibly owns the panel below. It is also the only style of the three that survives every shipped
theme — including `dracula`, whose navbar is lighter than its body.

**Structure: two tiers, tier 1 horizontal, tier 2 vertical.** The sidebar is not deleted; it is
demoted to a contextual panel scoped to the selected tab. Proposed tree:

```
Manage Accounts
Games
Stores            Settings
 ├ GOG             ├ General
 ├ Steam           ├ Game Defaults
 ├ Epic            ├ Advanced
 ├ Amazon          ├ Wine Manager
 ├ Deals           └ Accessibility
 ├ Store Search
```

This creates the question 003 exists to answer: **two of the four tier-1 tabs have no tier-2
children.** Whether the vertical panel persists, collapses, or is always populated decides
whether the layout jumps every time you switch tabs.
