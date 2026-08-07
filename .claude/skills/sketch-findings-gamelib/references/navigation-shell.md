# Navigation Shell

The app-level navigation: two tiers, tier 1 horizontal, tier 2 vertical. Replaces the left
sidebar (`components/UI/Sidebar/`). Implemented by **Phase 34.10**.

---

## Design Decisions

### 1. Tier 1 is card / folder tabs — not underline, not segmented pills

The active tab **merges into the content surface below it**: same background, matching left/top/right
border, and its bottom border is painted in the content colour so the seam disappears. The tab
visibly owns the panel.

Chosen over two alternatives that both look fine in the default theme:

| Rejected | Why it lost |
|---|---|
| Underline + sliding indicator | Cheapest to build (MUI `<Tabs>` already renders it at `WineManager/index.tsx:222`) and matches Steam/GOG Galaxy convention — but it depends on the navbar reading as a distinct band from the content, which not every shipped theme provides. |
| Segmented pill (`NSSegmentedControl`) | Reads native on macOS, but the recessed track is a fixed-width object that degrades fastest as items are added, and it relies on the same figure/ground assumption as underline. |

**The deciding factor was theme survival, not aesthetics.** See §3.

### 2. macOS traffic lights force a 78px left inset — non-negotiable

Whenever the Tauri titlebar is transparent or overlaid, the window controls occupy roughly **78px**
at the top-left. No top-mounted bar may begin at `x=0`.

```css
:root { --traffic-light-inset: 78px; }
.navbar { padding-left: var(--traffic-light-inset); }
```

All four sketches reserve this. Toggle **Annotate** in any source HTML to render the reserved zone.
This is a platform constraint, not a style choice — a bar that ignores it puts the wordmark under
the close button.

### 3. Theme survival: the navbar is not always darker than the body

`src/frontend/themes.scss` ships themes where `--navbar-background` is **lighter** than
`--body-background`:

| Theme | navbar | body | Relationship |
|---|---|---|---|
| `midnightMirage` (default) | `#161c1e` | `#070a0b` | navbar lighter |
| `gruvbox_dark` | `#32302f` | `#1d2021` | navbar lighter |
| `dracula` | `#44475a` | `#282a35` | **navbar much lighter — highest contrast inversion** |

Any nav style that encodes "the bar is the dark band and content is the light field" breaks in at
least one shipped theme. Card tabs survive because they define the active state **relationally**
(tab background == content background) rather than absolutely.

**Rule: verify every nav change against `midnightMirage`, `gruvbox_dark` and `dracula` before
calling it done.** Two of the three sketch themes exist purely as this stress test.

### 4. Tier 2 is vertical, and it means two different things

Tier 1 holds exactly four tabs. Tier 2 is a ~204px vertical panel whose content depends on the tab:

| Tier 1 tab | Tier 2 | Kind |
|---|---|---|
| Manage Accounts | **none** — content runs full-bleed | — |
| Games | search + views + collections + facets | **filters** (see `library-filtering.md`) |
| Stores | GOG, Steam, Epic, Amazon, Deals, Store Search, Humble Keys, Redeem a Steam key | nav list |
| Settings | General, Game Defaults, Advanced, Wine Manager, Accessibility, Console Mode, Logs, Documentation, Ko-fi | nav list |

That tier 2 is *filters* on one tab and *navigation* on two others is a deliberate accepted
inconsistency, not an oversight. The Games panel earns its 204px by doing real work on the busiest
screen; a nav list there would just be a filter panel wearing the wrong clothes.

### 5. The 204px layout shift on Manage Accounts is accepted

Manage Accounts drops the panel, so crossing into or out of that tab moves content width by 204px.

Three behaviours were built and compared:

| Option | Behaviour | Verdict |
|---|---|---|
| Always populated | Invent tier 2 for childless tabs; nothing ever shifts | Rejected — permanently narrows the Games grid to avoid a rare transition |
| **Collapse when empty** | Panel disappears on childless tabs | **Chosen**, scoped to Manage Accounts only |
| User-collapsible rail | Persistent, `«` shrinks it to a 50px icon rail | Rejected for now — a real option if width pressure appears later |

Confining the childless case to **one infrequent tab** is what made the shift acceptable. It fired
on two tabs (including Games) in the original tree, which was not acceptable. **Do not "fix" this
shift** — it is a decision with a recorded rationale.

### 6. Downloads is ambient state, not a destination

Downloads has live progress and an active count. It is **not** a tab and **not** a tier-2 entry —
it sits top-right as a conic-gradient progress ring with a count beside it. You glance at it; you
do not browse to it.

### 7. A "More" overflow menu was rejected

Promoting five tabs and hiding nine behind `⋯` is the simplest build, but navigating into a hidden
item leaves **no tab lit** — the user is somewhere the navigation cannot represent. Sketch 002
variant A demonstrates this live (open `⋯`, click any item, watch the tab bar go dark). Two visible
tiers were preferred precisely to avoid that orphan state.

### 8. The problem that forced two tiers

`components/UI/Sidebar/components/SidebarLinks/index.tsx` carries **~14 destinations**. A horizontal
tab bar comfortably holds 5–7. Any "replace the sidebar with tabs" plan must answer where the
remainder goes *before* the tab styling matters.

---

## CSS Patterns

### Card / folder tab

The seam is the whole trick: `border-bottom` on the active tab is painted in the **content**
background, and `top: 1px` pulls it down over the navbar's bottom border.

```css
.navbar {
  background: var(--navbar-background);
  display: flex;
  align-items: flex-end;              /* tabs sit on the baseline */
  padding-left: var(--traffic-light-inset);
  height: 50px;
  border-bottom: 1px solid var(--color-border);
}

.tab {
  border: 1px solid transparent;
  border-bottom: none;
  background: transparent;
  color: var(--color-text-dim);
  padding: 8px 16px 9px;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  position: relative;
  top: 1px;                            /* overlap the navbar's bottom border */
  transition: all .15s ease;
}

.tab:hover { color: var(--color-text-muted); background: rgba(255,255,255,.04); }

.tab.active {
  background: var(--color-bg);                       /* == content surface */
  color: var(--color-text);
  border-color: var(--color-border);
  border-bottom: 1px solid var(--color-bg);          /* erases the seam */
  font-weight: var(--semibold);
  padding-bottom: 10px;                              /* +1px replaces the border */
}
```

### Tier-2 panel, with the collapse case

```css
.page { display: flex; background: var(--color-bg); }

.tier2 {
  width: 204px;
  flex: none;
  border-right: 1px solid var(--color-border);
  padding: var(--space-4) var(--space-2);
  overflow: hidden;
  transition: width .22s cubic-bezier(.4,0,.2,1), padding .22s ease, opacity .18s ease;
}

/* Manage Accounts only */
.tier2.hidden {
  width: 0;
  padding-left: 0;
  padding-right: 0;
  opacity: 0;
  border-right-color: transparent;
}

.content { padding: var(--space-6); flex: 1; min-width: 0; }   /* min-width:0 or the grid overflows */
```

### Downloads progress ring

Pure CSS, no SVG. The `::after` inset must be filled with the **navbar** colour, so it changes
with the theme.

```css
.dl-ring {
  width: 15px; height: 15px; border-radius: 50%;
  background: conic-gradient(
    var(--color-primary) 0turn .59turn,      /* .59turn == 59% progress */
    var(--color-border)  .59turn 1turn
  );
  position: relative;
}
.dl-ring::after {
  content: '';
  position: absolute; inset: 3px;
  border-radius: 50%;
  background: var(--navbar-background);
}
```

### macOS traffic lights (mock only)

Real window controls come from the OS. This is for mockups:

```css
.tl { width: 12px; height: 12px; border-radius: 50%; }
.tl.r { background: #ff5f57; }
.tl.y { background: #febc2e; }
.tl.g { background: #28c840; }
```

---

## HTML Structures

```html
<div class="titlebar">
  <span class="tl r"></span><span class="tl y"></span><span class="tl g"></span>
  <span class="win-title">GameLib</span>
</div>

<div class="navbar">
  <div class="wordmark"><span class="dot"></span>GameLib</div>

  <div class="tabs">
    <button class="tab">Manage Accounts</button>
    <button class="tab active">Games</button>
    <button class="tab">Stores</button>
    <button class="tab">Settings</button>
  </div>

  <div class="nav-right">
    <button class="icon-btn">⌕</button>
    <button class="icon-btn dl-btn">
      <span class="dl-ring"></span><span class="n">2</span>
    </button>
    <div class="avatar">G</div>
  </div>
</div>

<div class="page">
  <div class="tier2"><!-- filters on Games, nav list on Stores/Settings, .hidden on Accounts --></div>
  <div class="content"><!-- … --></div>
</div>
```

Accessibility: the sketches use plain `<button>`s for clarity. Real tabs need `role="tablist"` /
`role="tab"` / `aria-selected` and arrow-key roving focus. `components/UI/TabPanel/index.tsx`
already emits `role="tabpanel"` with `aria-labelledby="tab-{index}"`, so the tab elements must use
matching `id="tab-{index}"`.

---

## What to Avoid

- **Do not assume the navbar is darker than the content.** `dracula` inverts it. Define active
  states relationally.
- **Do not start a top-mounted bar at `x=0`.** 78px belongs to the macOS window controls.
- **Do not add a `⋯` overflow menu** — it produces a state with no tab lit.
- **Do not "fix" the 204px shift on Manage Accounts.** It is a recorded decision; the fix
  (always-populated panels) permanently narrows the Games grid.
- **Do not make Downloads a tab.** Ambient progress ≠ destination.
- **Do not introduce a new tab library.** MUI `<Tabs>/<Tab>` is already a dependency and already
  in use; `components/UI/TabPanel/index.tsx` already exists.
- **Do not test only in `midnightMirage`.** Two of three sketch themes exist to catch what it hides.
- **Watch the i18n gate.** Phase 34.8's hardcoded-string scanner rides `pnpm test:ci`; raw nav
  labels will fail it. Every destination already has a key across **49 locale directories**, so
  renaming `Library` → `Games` and reparenting sub-items is a key migration, not a string edit.

---

## Origin

Synthesized from sketches: **001**, **002**, **003**
Source files: `sources/001-app-level-tab-bar/`, `sources/002-sidebar-overflow-strategy/`,
`sources/003-two-tier-card-nav/`

All three are interactive. Each has a toolbar (bottom-right) with a theme switcher, viewport
widths, and an **Annotate** toggle that reveals the traffic-light reserve.
