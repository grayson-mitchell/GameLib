# Game Settings Dialog

The per-game ⚙ dialog (`SettingsModal` → `GamesSettings`). Sketch 009 winner **B**, shipped in
261121-dzl. Read this before adding a setting to the dialog or a new tab.

## Design Decisions

Decided item by item against the 2026-11-21 UX review numbers:

| # | Item | Decision |
|---|---|---|
| 1 | Close X vs title | Header row: 44px thumbnail · title (clamps to **2 lines**) · X in its own column |
| 2 | Hints | Neutral **accent-tinted note** for information; red only for real danger (Legacy) |
| 3 | Twisties | None. Engine and Steam overlay are plain, always-visible fields; help in an **(i)** popover; no "(advanced)" suffix |
| 4 | Opening tab | **Run** opens first and is first: Run · Wine · Winetricks · Advanced (Mac engine games) |
| 5 | Launch without Steam | Losses listed **once** in the description; on-state adds one amber, theme-token **risk-only** warning; DRM titles = disabled switch + (i) |
| 6 | Labels | **Noun labels**; explanation goes in (i), not the label |
| 7 | Grouping | Each tab is a stack of **bordered cards**: Run = Launch, Steam; Advanced = Launch target, Scripts, Wrappers & environment, Diagnostics & updates |
| 9 | Title | Game title alone; "Game settings" lives in the subline |
| 10 | Saved / App ID | Header subline `Game settings · Steam App ID 576770 · Saved automatically`; "Saved" flashes success-green on change; footer removed |
| 11 | Height | Fixed **80%** — tabs don't resize the dialog |

Also in scope (no visual): #8 route "Wine"/"Winetricks" tab labels through `t()`; #12 key the
remembered tab by **runner + app_name** (read the old app_name-only key once).

### Additions from 012 (decided 2026-11-21, not yet built)

- **EOS overlay** switch moves in from ⋮ to **Run → Launch** (Linux + Epic only).
- **Logs** becomes a tab after Advanced (today `'log'` is a separate `GameSettingsModalType`
  opening the same modal). Contents: session picker, Copy, Open folder, monospace log box.
  Advanced → Diagnostics & updates gets a "Game log → Open the Logs tab" link next to Verbose logs.
- **Wine prefix** field (Wine tab) gets a folder button (mirrors the Install tab's "Open prefix").

Rule: **⚙ holds what changes how the game runs.** Library state and install facts do not go here
(see `game-page.md`).

Rejected: **A targeted fixes** (height jumps per tab; uppercase rules group less clearly than
cards) and **C side-nav dialog** (210px sidebar costs width in a 900px dialog for 4–7 tabs).

## CSS Patterns

```css
/* header card */
.hB { display: flex; gap: 14px; align-items: center; padding: 16px 12px 14px 20px; border-bottom: 1px solid var(--color-border); }
.hB .thumb { width: 44px; height: 44px; border-radius: 8px; flex: none; }
.hB h2 { font-size: var(--text-lg); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.hB .subline { font-size: var(--text-xs); color: var(--color-text-muted); display: flex; gap: 10px; flex-wrap: wrap; }
.hB .subline .saved.flash { color: var(--color-success); }
.hB .subline code { font-family: ui-monospace, Menlo, monospace; user-select: all; }

/* body + cards */
.dlg.h80 { height: 80%; }
.dlg .body { padding-top: 16px; background: color-mix(in srgb, var(--color-bg) 35%, var(--color-surface)); }
.card { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 8px; padding: 14px 16px 2px; margin: 0 0 14px; }
.card > h3 { margin: 0 0 12px; font-size: var(--text-sm); font-weight: 600; }

/* neutral note vs risk warning */
.note { display: flex; gap: 10px; font-size: var(--text-sm); color: var(--color-text-muted); padding: 10px 12px; border-radius: 6px;
  background: color-mix(in srgb, var(--accent) 8%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent); }
.warn { display: flex; gap: 10px; font-size: var(--text-sm); padding: 10px 12px; border-radius: 6px; margin: -6px 0 16px 48px;
  background: color-mix(in srgb, var(--color-warning) 12%, transparent); border: 1px solid color-mix(in srgb, var(--color-warning) 40%, transparent); }

/* (i) help popover on the label line */
.info { width: 16px; height: 16px; color: var(--accent); background: none; border: 0; }
.pop { position: absolute; top: 100%; left: 0; width: 320px; background: var(--color-surface-raised);
  border: 1px solid var(--color-border-strong); border-radius: 8px; padding: 10px 12px; font-size: var(--text-xs); box-shadow: var(--shadow-md); }
```

## HTML Structures

```html
<div class="hB">
  <span class="thumb"></span>
  <div class="tt"><h2>Low Magic Age</h2>
    <div class="subline">Game settings · Steam App ID <code>576770</code> · <span class="saved">Saved automatically</span></div></div>
  <button class="x" aria-label="Close">×</button>
</div>
<div class="bTabs"><div class="mtabs">Run · Wine · Winetricks · Advanced</div></div>
<div class="body">
  <div class="card"><h3>Launch</h3> …fields… </div>
  <div class="card"><h3>Steam</h3> Launch without Steam (i) · Steam overlay (i) </div>
</div>
```

## What to Avoid

- Danger-red fills for neutral information.
- `<details>` twisties and "(advanced)" suffixes — they hide settings people need.
- Repeating a setting's consequences in both description and warning.
- Verb/sentence labels; put the "why" in (i).
- Dialog height that follows content (jumps on tab switch).
- A footer that's only visible after scrolling.

## Origin

Synthesized from sketch 009 (plus the ⚙ additions decided in 012).
Source files: `sources/009-game-settings-dialog/` — deep links
`?v=a|b|c|t&tab=run|wine|winetricks|advanced&title=long&lws=api|clean|drm&lwson=1&theme=dracula`.
