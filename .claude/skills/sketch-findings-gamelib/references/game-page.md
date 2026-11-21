# Game Page

Layout, action placement and the ⋮-free information architecture of `screens/Game/GamePage`.
Read this before touching `GamePage/index.tsx`, `GameSubMenu/`, `DotsMenu.tsx`, the right-panel
tabs, or anything that adds a per-game action.

## Design Decisions

### 1. Page frame — 008 A′ (shipped 261114-1fi)

- **Grid `3fr 2fr`** (was `1fr 1fr`). Left column is **one card** with theme-token borders — the
  hard-coded `#8a8a8a` outline is gone.
- **Left card = two rows:** a single scroll area (art band → meta → title → notices → About) above a
  **docked footer**. The footer is its own flex row, *not* `position: sticky` inside a scroller
  (the 261103-w9l workaround is retired). At short heights the title scrolls away; Play and status
  never do.
- **Footer order:** status line **above** the action bar (operator UAT changed 008's original
  "status under"). Status is always rendered — no container query hides `.gameStatus`.
- **Notices** sit under the title inside the scroll area, never after the buttons. Warning stripe
  uses theme tokens, never `color: black`.
- **Back** button lives on the art band; the old header row is gone.
- Rejected: **B full-width hero** (eats ~40% height at 520px; overlay text needs scrims over bright
  art) and **C collapsing sticky header** (two copies of the action bar to sync; scroll observer).

### 2. No ⋮ menu — 012 A (decided 2026-11-21, not yet built)

**Principle: every action sits next to the thing it changes.** The page already has three homes;
⋮ was a junk drawer duplicating them.

| Home | Holds | Rule of thumb |
|---|---|---|
| **Left card** | the game — same for everyone | identity + your library state |
| **Right panel → Install tab** | your copy | facts, each carrying its own actions |
| **⚙ dialog** (009) | how it runs | anything that changes launch behaviour |
| **Footer** | tier one only | Play / Install, launch option, ⚙ |

Full item map (today's ⋮ → new home):

| ⋮ item today | New home |
|---|---|
| Install with options… / Locate existing installation… | Footer **Install split ▾**; Locate also as a "Already installed elsewhere?" link in the Install tab when not installed |
| Edit Game | Left: **"Edit details"** pencil on the art band (shows on hover/focus) |
| Logs | ⚙ dialog: new **Logs** tab (merges the `'log'` `GameSettingsModalType`) |
| Hide / Unhide | Left: quiet **Hide** toggle at the end of the library row + hidden-state notice with **Unhide** |
| Add To / Remove From Favourites | Left: **heart** beside the h1 |
| Add / Remove shortcuts | Install tab: switch row |
| Uninstall / Remove all copies… (Steam) | Install tab: **danger zone** at the bottom |
| Force Update if Available | Install tab, Version row: **Check for updates** |
| Move Game | Install tab, Location row: **Move…** |
| Change Install Location | Install tab, Location row: **"Wrong folder?"** link → "Set install folder…" (re-points, moves nothing) |
| Verify and Repair | Install tab, Version row: **Verify** |
| Enable / Disable EOS Overlay | ⚙ dialog: switch in **Run → Launch** (Linux + Epic only) |
| Add to / Remove from Steam | Install tab: **Show in Steam** switch |
| Categories | Left: outlined category **chips** + "+ Category" |
| Store | Left: the **store badge** in the meta row becomes a link ↗ |
| Show Changelog | "What's new" in the update status line and on the Version row |
| Check Compatibility (ProtonDB) | **Ratings** tab: ProtonDB row links out |
| Requirements | **Removed** — the Requirements tab already shows it |
| Modify Installation | Install tab, Size row: **Modify…** |
| Browse Files | Install tab, Location row: **Open** |
| Browse Wine Prefix | Install tab, Engine row: **Open prefix**; plus a folder button by the ⚙ → Wine prefix field |
| (TimeContainer on the left card) | Removed — status line already says "Played 12 h 40 m" |

**Right-panel tabs:** `Install · Achievements · Ratings · Requirements` ("Install info" → "Install";
"Extra info" → "Ratings"). Labels must fit at 3fr/2fr without clipping — 012 clipped "Requirements"
with "Ratings & compatibility"; the tab bar also gets `overflow-x: auto` as a backstop.

**Install tab, installed (top → bottom):**
1. Location — path (ellipsised, full path in `title`) · `[Open]` `[Move…]` `Wrong folder?` (Move/Set only Epic/GOG)
2. Size — `48.2 GB · 2 of 3 components` · `[Modify…]` (Epic/GOG)
3. Version — `1.4.2 · up to date` / `· 1.5.0 available` (warning colour) · `[Verify]` (not sideload) `[Check for updates]` (Epic/GOG) `What's new`
4. Engine (Wine platforms, non-Steam) — `CrossOver 25 · bottle "GameLib"` · `[Open prefix]`
5. Cloud saves — `Synced 3 days ago` · `[Open saves folder]`
6. **Library & integration** — switch rows: Runs for me (macOS), shortcuts (label per OS:
   *Applications shortcut* / *Desktop & Start menu shortcuts* / *Desktop & app menu shortcuts*),
   Show in Steam (non-Steam)
7. **Danger zone** — one-line consequence text + `Uninstall…` (+ `Remove all copies…` for Steam)

**Not installed:** Download / Install size / Platforms, the Locate link (non-Steam), and only the
Show in Steam switch.

**Uninstall stays out of the footer.** Rejected 012-B (trash icon beside ⚙): one misclick from Play
for a rare, destructive action. Rejected 012-C ("the game | your copy", Play moves to the right
column, info tabs move left): coherent, but reverses 008's "Play at the bottom of the left card".

### 3. Left card library row — 010 A (absorbed into 012)

- **Heart** right after the h1 (`aria-pressed`, `aria-label="Favourite"`, title flips Add/Remove).
  Off = outline heart in `--color-text-muted`; on = filled in a per-theme `--fav`
  (midnight `#ff5c8a`, gruvbox `#fb4934`, dracula `#ff79c6`). 0.3 s scale pulse on toggle.
- **Category chips** under the title: **outlined** + tag icon so they never read as store genres
  (genres are filled accent chips). × appears on hover/focus. `+ Category` dashed chip opens a
  checklist popover with "New category…" input (replaces the Categories modal for the common case).
  Zero categories → dashed chip reads "+ Add to Category".
- **Hide** — low-emphasis text toggle pushed to the row end (`margin-left: auto`), amber when on;
  while hidden, a notice under the title: "Hidden from your library. It only appears when 'Show
  hidden' is on. **Unhide**".
- Rejected 010-B (heart + eye icon toggles in the footer: four unlabeled icons, an eye beside Play
  reads as "preview") and 010-C (labelled "Library" strip: clearest, but a permanent heavy block).

### 4. Integration switch rows — 011 A2 (absorbed into 012)

- Row = label + right-aligned **switch track** + one-line description under it. Labels stay normal
  weight when on (the app's ToggleSwitch goes bold-accent, which shouts when several are on).
- **Per-row pending:** the row's track pulses and a "Adding…/Removing…" aside replaces nothing else
  — no list jump (today's menu swaps the item for a spinner).
- **Per-row failure:** inline red text under the row + **Retry** link; never a modal. The state
  flips only on the backend's answer (same rule as `shortcutsToggle.ts`).
- Rows render only when they apply; an empty group does not render.
- Rejected 011-A (existing ToggleSwitch checkbox-square: reads as "agree to terms"), 011-B (chip row:
  no visible explanations — "EOS overlay" means nothing to most users), 011-C (checkmarks in ⋮:
  fixes the flipping labels but keeps state hidden).
- **Open:** the switch track is a new ToggleSwitch variant — verify in every theme (dracula's
  `--color-primary` is pink; `--on-primary` knob colour is per theme).

### 5. Footer action bar

`[status line]` / `[Primary] [launch option] ··· [⚙]`

- Primary: Install **split** (main = default folder, ▾ = "Install with options…" for Steam or
  "Choose folder and options…" otherwise, + "Locate existing installation…" non-Steam) · Play ·
  Update + "Play anyway" · Pause · Stop.
- Launch-option select only when installed.
- No ⋮, no trash.

## CSS Patterns

Fact row with attached actions (Install tab):

```css
.fact { display: grid; grid-template-columns: 112px 1fr; gap: 2px 14px; padding: 10px 2px;
  border-bottom: 1px solid var(--color-border); font-size: var(--text-sm); align-items: baseline; }
.fact > b { font-weight: 500; color: var(--color-text-muted); }
.fact .val { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fact .acts { grid-column: 2; display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.sbtn { height: 28px; padding: 0 10px; border-radius: var(--radius-md);
  border: 1px solid var(--color-border-strong); background: none; color: var(--color-text);
  font: 500 var(--text-xs) var(--font-sans); display: inline-flex; align-items: center; gap: 6px; }
.sbtn:hover { border-color: var(--color-text-muted); background: color-mix(in srgb, var(--color-text) 6%, transparent); }
```

Danger zone:

```css
.danger-zone { margin-top: 18px; padding: 12px; border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--color-danger) 35%, var(--color-border));
  display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.btn.dangerghost { background: transparent; color: var(--color-danger);
  border: 1px solid color-mix(in srgb, var(--color-danger) 60%, transparent); height: 34px; }
```

Switch row:

```css
.tsw { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; align-items: center;
  padding: 9px 2px; border-bottom: 1px solid var(--color-border); cursor: pointer; }
.tsw .desc { grid-column: 1 / 3; font-size: var(--text-xs); color: var(--color-text-muted); }
.track { width: 34px; height: 20px; border-radius: 9999px; background: var(--color-border-strong); position: relative; }
.track::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
  border-radius: 50%; background: var(--neutral-06); transition: transform .2s; }
.tsw[aria-checked="true"] .track { background: var(--color-primary); }
.tsw[aria-checked="true"] .track::after { transform: translateX(14px); background: var(--on-primary); }
.tsw.busy .track { animation: fading 1.2s infinite; }   /* per-row pending */
```

Category chip vs genre chip:

```css
.chip { background: color-mix(in srgb, var(--color-accent) 18%, transparent); }          /* store genre: filled */
.cat  { border: 1px solid var(--color-border-strong); background: transparent; }        /* your category: outlined + tag icon */
.addcat { border: 1px dashed var(--color-border-strong); color: var(--color-text-muted); }
```

Docked footer (008 A′):

```css
.main { display: flex; flex-direction: column; overflow: hidden; }
.scrollall { flex: 1; min-height: 0; overflow-y: auto; }
.dock { flex: none; border-top: 1px solid var(--color-border); padding: 12px 24px 14px;
  background: color-mix(in srgb, var(--color-bg) 35%, var(--color-surface)); }
@container stage (max-width: 820px) { .dock { position: sticky; bottom: 0; } }  /* stacked layout only */
```

## HTML Structures

```html
<!-- left card head -->
<div class="meta"><a class="store" href="…">Epic Games ↗</a> <span class="dev">…</span> · 2024 <span class="chip">Adventure</span></div>
<div class="titlerow"><h1>Hollow Depths</h1><button class="heart" aria-pressed="true" aria-label="Favourite">♥</button></div>
<div class="libgroup">
  <span class="cat">🏷 Backlog <button class="x" aria-label="Remove Backlog">×</button></span>
  <button class="addcat" aria-haspopup="menu">+ Category</button>
  <button class="hidebtn" aria-pressed="false">👁 Hide</button>
</div>

<!-- Install tab fact -->
<div class="fact"><b>Location</b><span class="val" title="full path">~/Games/…</span>
  <div class="acts"><button class="sbtn">Open</button><button class="sbtn">Move…</button><button class="tlink">Wrong folder?</button></div></div>

<!-- switch row -->
<div class="tsw" role="switch" tabindex="0" aria-checked="true"><span class="lbl">Show in Steam</span><span class="track"></span>
  <span class="desc">Adds a non-Steam shortcut, so it appears in Big Picture and on Steam Deck.</span></div>
```

## What to Avoid

- **Re-adding a ⋮ "just for one thing."** If an action has no home, it is a sign it belongs next to
  a fact that is not shown yet — add the fact.
- **Labels that flip** ("Add To Favourites" ↔ "Remove From Favourites"). State is shown by the
  control (pressed heart, switch position), the label stays a noun.
- **Swapping a control for a spinner** — pending lives inside the control.
- **Destructive actions in the footer** or mid-list; Uninstall is last and red, behind confirm.
- **Duplicating a tab's content in an action** (the old Requirements item).
- **Filled chips for user categories** — they must not read as store genres.
- Hard-coded colours (`#8a8a8a`, `color: black`); every colour is a theme token.

## Origin

Synthesized from sketches: 008, 010, 011, 012
Source files: `sources/008-game-page-action-bar/`, `sources/010-game-page-title-row/`,
`sources/011-integration-toggles/`, `sources/012-game-page-no-menu/` (012 has a "Where did each
item go?" overlay and a "Show moved items" toggle; ⚙ opens a dialog mock with the Logs tab).
