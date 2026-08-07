# Library Filtering

The Games tier-2 panel: search, views, collections and cross-store facets. Implemented by
**Phase 34.11**. Sits in the tier-2 slot defined in `navigation-shell.md`.

---

## Design Decisions

### 1. Hybrid panel — the easy path stays easy, the power sits below

Panel order, top to bottom:

```
⌕ Search…                          scoped to the library
─────────────────────
VIEWS            single-select     All games · Installed · Recently played · Favourites
─────────────────────
COLLECTIONS      single-select     user-defined, + New collection
─────────────────────
▸ STORE          multi-select      GOG · Steam · Epic · Amazon      (collapsed by default)
▸ PLATFORM       multi-select      macOS · Windows · Linux          (collapsed by default)
▸ GENRE          multi-select      Action · RPG · Indie · …         (collapsed by default)
```

Views and collections answer the common case in one click. Facets are present but collapsed, so a
first-time user does not meet a wall of controls before seeing a single game.

Two alternatives were built and rejected:

| Rejected | Why it lost |
|---|---|
| **Views only** (Steam-style) | Calmest and smallest build, but it **cannot answer "show me only my GOG games."** Spanning Epic, GOG, Amazon and Steam is GameLib's reason to exist, so a panel that can't express a store filter under-serves the product. This is the decisive argument. |
| **Facets only** (Playnite-style) | Genuinely powerful — "installed macOS roguelikes on GOG" is four clicks — but it is a dense control surface with no fast path, and it has no way to show *why* the result set shrank. |

### 2. Facet counts exclude their own facet

When computing the count beside a facet option, apply **every active filter except that facet's
own**. Ticking `GOG` must leave `Steam 9`, `Epic 6`, `Amazon 3` showing what they *would* yield —
not collapsing to `0`.

Counting a facet against itself makes every unselected sibling read `0`, which tells the user
"there is nothing else" when the truth is "there is nothing else *that is also GOG*". Counts that
guide the next click versus counts that lie.

```js
function countFor(state, kind, value) {
  return filtered(state, { skip: kind })          // <-- the whole trick
    .filter(g => matches(g, kind, value)).length;
}
```

### 3. Filter chips make the state legible

Every active filter renders as a removable chip above the grid, plus **Clear all** when more than
one is active. Chips carry the view, the collection, each facet value, and the search term.

Neither rejected variant could answer "why am I looking at 6 games instead of 214?" without the
user re-reading the whole panel. Chips answer it at a glance and make each filter one click to
undo. **This is the most portable idea in the sketch** — it would improve the other two variants
too.

### 4. Zero-result state needs a recovery path

Filters intersect, so empty results are easy to reach (Linux + Amazon + RPG). The empty state must
carry a **Clear all filters** action inline — not just say "no games match".

### 5. Semantics still open at hand-off

Deliberately unresolved by the sketch; belongs in `/gsd-discuss-phase 34.11`:

- **Filter persistence** — do filters survive navigation, restart, or neither?
- **Collections** — manual, rule-based, or both? The sketch mocks them as user-defined labels.
- **Facet combination across kinds** — the sketch ANDs across kinds and ORs within a kind
  (`(GOG OR Steam) AND (macOS)`). Conventional, but never validated with a user.

---

## Constraints to Verify Before Building

### Genre metadata coverage is unverified — this may kill the genre facet

Genre data in the sketch is **invented**. Real genres come from four different store APIs with
independent coverage. A genre facet that is empty for every Amazon title reads as broken software.

**Measure actual coverage per store first.** Dropping the genre facet is an acceptable outcome;
shipping it half-populated is not.

### Platform filtering should probably mean "will this run", not "is this native"

GameLib runs Windows games on macOS through Wine/CrossOver bottles. So the question a user has is
**"will this run on my machine"** — which is not the same predicate as "is this a native build".

The data to answer the better question already exists in the fork:

- **Phase 19** — CrossOver Compatibility Index (macOS), ~2,866 rated titles, medal ratings
- **Phase 18** — macOS 32-bit detection (GPTK is wine64-only and aborts 32-bit executables)
- **Phase 3 / native-install arc** — `is_mac_native`, per-OS after the Phase 23 reversal

A facet reading `Playable on this Mac` beats one reading `macOS`. Confirm before implementing.

---

## CSS Patterns

### Panel width and scroll

```css
.panel {
  width: 218px;
  flex: none;
  border-right: 1px solid var(--color-border);
  padding: var(--space-3) var(--space-2) var(--space-4);
  overflow-y: auto;
  max-height: 620px;         /* real app: bound to viewport, not a magic number */
}
```

### Facet row — checkbox, label, count

```css
.item {
  display: flex; align-items: center; gap: 9px;
  width: 100%; text-align: left;
  padding: 6px var(--space-3);
  background: transparent; border: none; cursor: pointer;
  color: var(--color-text-muted);
  border-radius: var(--radius-sm);
  transition: all .12s ease;
}
.item:hover  { background: rgba(255,255,255,.06); color: var(--color-text); }
.item.active { background: var(--color-surface-raised); color: var(--color-text); font-weight: var(--semibold); }
.item.zero   { opacity: .38; }                    /* count is 0 and not selected */

.item .lbl { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item .ct  { font-size: 10px; color: var(--color-text-dim); font-variant-numeric: tabular-nums; }

.chk {
  width: 14px; height: 14px; border-radius: 3px;
  border: 1px solid var(--color-border-strong);
  display: grid; place-items: center;
  font-size: 10px; color: transparent; line-height: 1;
  transition: all .12s ease;
}
.item.on .chk { background: var(--color-primary); border-color: var(--color-primary); color: #08191b; }
```

`font-variant-numeric: tabular-nums` keeps the count column from jittering as numbers change.

### Collapsible facet group

```css
.grp-label .caret { transition: transform .16s ease; }
.grp-label.collapsed .caret { transform: rotate(-90deg); }

.grp-body { overflow: hidden; max-height: 600px; transition: max-height .2s ease; }
.grp-body.collapsed { max-height: 0; }
```

### Filter chip

```css
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border-strong);
  color: var(--color-text);
  font-size: var(--text-xs);
  padding: 3px 8px;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all .13s ease;
}
.chip:hover { border-color: var(--color-danger); color: var(--color-danger); }   /* removal affordance */
.chip.clear { border-style: dashed; color: var(--color-text-dim); }
.chip.clear:hover { color: var(--color-primary); border-color: var(--color-primary); }
```

Hovering a chip previews **removal** (danger colour); `Clear all` is dashed to read as a different
kind of action.

---

## Filter Engine

The whole model, as validated in the sketch over 24 games:

```js
function blankState() {
  return {
    q: '', view: 'all', coll: '',
    stores: new Set(), plats: new Set(), genres: new Set(),
    sort: 'name'
  };
}

// `skip` omits one facet so counts can be computed without self-reference
function filtered(st, { skip } = {}) {
  return LIB.filter(g => {
    if (st.q && !g.name.toLowerCase().includes(st.q.toLowerCase()))        return false;
    if (skip !== 'view'  && !passesView(g, st.view))                       return false;
    if (skip !== 'coll'  && st.coll && g.collection !== st.coll)           return false;
    if (skip !== 'store' && st.stores.size && !st.stores.has(g.store))     return false;
    if (skip !== 'plat'  && st.plats.size && !g.platforms.some(p => st.plats.has(p)))  return false;
    if (skip !== 'genre' && st.genres.size && !g.genres.some(x => st.genres.has(x)))   return false;
    return true;
  });
}
```

Search is substring, case-insensitive, name-only. Whether it should also match developer or
publisher was not decided.

---

## What to Avoid

- **Do not ship a views-only panel.** It cannot express a store filter, which is the product's
  central question.
- **Do not count a facet against itself.** Every unselected sibling reads `0` and the counts
  actively mislead.
- **Do not hide filter state in the panel alone.** Without chips the user cannot tell why the
  result set shrank.
- **Do not ship the genre facet on unmeasured metadata.** Verify per-store coverage first.
- **Do not equate platform with native.** Bottled Windows games run on macOS; `Playable on this
  Mac` is the more useful predicate.
- **Do not leave the empty state without a Clear all action.**
- **Do not let the grid container omit `min-width: 0`** — a flex child with grid content overflows
  the panel without it.

---

## Origin

Synthesized from sketch: **004**
Source file: `sources/004-games-filter-panel/index.html`

The source is a **working filter engine**, not a mockup — 24 games with store, install state,
platform, genre, favourite, recency and collection. Search, views, collections and facets all
filter live and counts recompute. Variant C is the winner; A and B are preserved for comparison.
