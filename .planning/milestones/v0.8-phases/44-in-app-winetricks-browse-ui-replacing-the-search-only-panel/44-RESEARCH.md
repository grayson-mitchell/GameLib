# Phase 44: In-app Winetricks browse UI replacing the search-only panel - Research

**Researched:** 2026-09-16
**Domain:** React/TypeScript frontend rendering — categorised disclosure UI, remount-safety, i18n catalog mechanics
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Curated "Commonly needed" group**
- **D-01:** Ship ~8 verbs, not the spec's provisional 12: `vcrun2019`, `vcrun2013`, `vcrun2010`, `dotnet48`, `d3dx9`, `xact`, `corefonts`, `physx`. Hand-maintained exported constant (decision #3), not data-derived.
- **D-02:** A curated verb also appears in its own category. Curated is a shortcut view, not a partition.
- **D-03:** Curated verbs missing from the parsed set skip silently in the UI, AND a unit test over the committed parser fixture asserts every curated verb resolves.
- **D-04:** Category expand/collapse state resets on every dialog open to the spec's Default state (curated open, five categories collapsed). No new persistence surface.

**Category group component and scrolling**
- **D-05:** Build a new panel-scoped group (e.g. `.WinetricksBrowse__group`) on the same `Dropdown` primitive that `FilterFacetGroup` itself wraps. Copy its header treatment and its CR-01/CR-03 token-survival fallback chains. Do NOT de-scope `FilterFacetGroup` from `.NavShell__tier2Portal`. Accepted cost: caret/badge CSS in two places. `FilterFacetRow` is not reusable here regardless — it is a `role="checkbox"` toggle, not an install-action row.
- **D-06:** Drop the per-category 240px inner scroll. OVERRIDES `44-UI-SPEC.md` Layout. An expanded category grows to its natural height; the 50vh/420px browse region is the only inner scroll. Resolves the spec's own flagged-and-unresolved P-7.
- **D-07:** Render all rows, no virtualisation. 328 rows in the largest category is within what WKWebView handles; no windowing library exists in `package.json`.

**Localisation**
- **D-08:** The 48-locale fill is a dedicated task inside Phase 44, gated on `lintTranslations` going green and `gamelibCatalogParity` passing — not a follow-on. The `gamelib` namespace IS gated.
- **D-09:** Trim to 11 new keys by dropping the 5 `winetricksBrowse.category.*` keys → 11 × 48 = 528 strings, not 768. Category headers render the parser's own category values uppercased via CSS. Consequence: the header reads `DLLS`, not the spec's drawn `DLLS & LIBRARIES`.
- **D-10:** Re-measure `pnpm machine-fill-gamelib` once, then hand-fill. If it still 401s, hand-fill using `t13`'s pre-flight validator (locale-set check, placeholder parity both directions, glossary survival, no empty values) run before any file is touched.

**Installed components**
- **D-11:** Retire the bottom `installedWrapper` "Installed components: a, b, c" summary (`Winetricks/index.tsx:199-221`) — not kept, not merged, not replaced by a count.
- **D-12:** No reinstall affordance on an installed row — badge only, per the spec.
- **D-13:** Installed components appear in search results, badged. REVERSES shipped behaviour at `WinetricksSearch/index.tsx:42`.
- **D-14:** Parser order within a group, no sort.

**Scope, todos, and what this phase claims**
- **D-15:** Close `2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md` (major, `ready: live-gate`) — but only after D-16.
- **D-16:** Before closing, fold Half A into `2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md`. Half A ("typing needs repeated attempts before it filters usably") has no other home.
- **D-17:** Fold `2026-09-15-winetricks-installwrapper-remounts-on-install-completion-via-loadinginstalled.md` into scope — this IS C-1's second half and the phase closes it or fails.
- **D-18:** Prove D-17 by test, not by assertion: a component test that drives an install start and an install completion (the `onInstallingChange` → `listInstalled()` → `setLoadingInstalled(true)` path) and asserts the same row nodes stay mounted throughout. Then revert the fix and confirm the test turns red. Both triggers, not just `installing`.
- **D-19:** Port `WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx` to the new Row component rather than deleting it with `WinetricksSearch/`.
- **D-20:** Remove the orphaned `translation.json` `winetricks.*` keys (`search`, `no-components`, `installed`, `nothingYet`, `installing`). Two obligations: (a) grep `src/` for each key before removal; (b) this touches 47 locale dirs, not 49 (`br`/`sl` have no `translation.json`). `winetricks.install`, `winetricks.openGUI`, `winetricks.loading-available` are REUSED and must survive.

**Verification**
- **D-21:** Component tests plus one live gate.
- **D-22:** The live gate must measure exactly two things: (1) a real mouse-click install runs to completion with the list staying mounted through both transitions; (2) the Installed badge appears in place afterwards, with no list reflow and no scroll jump.
- **D-23:** Needs-GUI routing and pointer-driven browse/search were NOT selected for the live gate — component tests only.
- **D-24:** Theme checking is the existing undefined-custom-property gate plus a spot-check in one dark and one light theme.

### Claude's Discretion

No area was answered "you decide" as a distinct category. Left to the planner within the locked decisions above: file/module layout under `WinetricksBrowse/`, how the curated constant is exported and imported, the exact shape of the per-row action-slot component, and how the pre-flight locale validator from `t13` is re-used or re-derived.

### Deferred Ideas (OUT OF SCOPE)

- Fixing `.autoComplete`'s focus-conditional overlay for `LibrarySearchBar` — tracked by `2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md` (inherits Half A per D-16). Not this phase.
- Row virtualisation — revisited only if a real bottle produces a measured jank number (D-07).
- Persisted category expand state across dialog opens — rejected for now (D-04).
- A standing "N components installed" count — considered and rejected with the flat summary (D-11).
- Batch install (select several, install once) — no such IPC surface exists; would be its own phase.

**Folded todos (reviewed, not folded into this phase's scope):** `2026-08-29-import-game-is-unlabelled-and-over-promoted…`, the two code-signing todos (`2026-09-04` macOS, `2026-09-14` Windows) — matched the phase query on generic keywords only, unrelated to Winetricks.
</user_constraints>

## Summary

This phase replaces a single search-only Winetricks panel with a browse-first, categorised
checklist UI, modelled on winetricks' own zenity `--gui`. **All backend/data plumbing already
shipped** — `listAvailable()` returns `{verb, title, category, cached}` for 567 verbs via
`src/backend/tools/winetricksListParse.ts` (`quick-260915-ajd`). This phase is pure frontend
rendering: no new IPC, no new npm packages, no backend changes.

Every hand-written file:line citation in `44-CONTEXT.md` and `44-UI-SPEC.md` that this research
checked against source was found accurate as of 2026-09-16 — a notable result given this
project's documented history of plans built on stale citations (see Common Pitfalls for the two
exceptions found: an incomplete key-removal list and an undesigned error-attribution mechanism).

The two hardest technical problems are (1) the D-17/D-18 "second remount gate" — `Winetricks/
index.tsx:156`'s outer `!loadingInstalled` gate re-fires on install *completion*, not just
start, and must be proven fixed by a test that reverts to red — and (2) building a
`.WinetricksBrowse__group` category component on the shared `Dropdown` primitive without falling
into the two CSS traps this codebase has already paid for twice (`Dropdown/index.scss` styling
its panel's contents at higher specificity than a tier-scoped row rule, and undefined CSS custom
properties silently dropping whole declarations in a theme block that lacks a fallback).

**Primary recommendation:** Treat this as three sequenced work packages — (A) a pure-render
`WinetricksBrowse/` component tree built on `Dropdown` + copied `FilterFacetGroup` CSS patterns,
with the curated-verb constant and per-row state derivation as the core new logic; (B) the
`loadingInstalled` stale-while-revalidate fix proven by a revert-to-red test; (C) the 48-locale
11-key fill using the `t13` precedent's pre-flight-validate-then-write pipeline. (A) and (B) are
tightly coupled (the new rows are what D-18's test asserts stay mounted); (C) is independent and
can run in parallel once the English key set is final.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Category/curated grouping, row rendering | Browser/Client | — | Pure React component tree, no server involvement; `listAvailable()` data is already in the renderer's state |
| Row install-state derivation (Available/Installing/Installed/Errored/Needs-GUI) | Browser/Client | — | Derived client-side from existing `installing`/`installed`/`guiOpen`/log-line state; no new backend field |
| Remount-safety (D-17/D-18) | Browser/Client | — | Pure state-shape fix in `Winetricks/index.tsx`'s React state machine; no IPC involved |
| Localisation catalog fill (D-08/09/10) | Build/tooling (not a runtime tier) | Browser/Client (consumption via `react-i18next`) | Static JSON catalogs compiled into the app; `i18next` resolves them client-side at render time |
| Winetricks verb listing / parsing | API/Backend (already shipped, out of scope) | — | `winetricksListParse.ts` runs in the Tauri sidecar; this phase only consumes its already-shipped output shape |
| Install execution (`winetricksInstall` IPC) | API/Backend (unchanged, out of scope) | Browser/Client (triggers via existing `window.api` call) | Existing IPC surface; this phase only changes what triggers the same call and how progress is displayed |

**Why this matters:** every capability this phase adds or changes lives in the Browser/Client
tier. There is no capability in this phase that belongs in the API/Backend, CDN, or Database
tiers — if a plan proposes touching `src/backend/` or the Tauri IPC surface, that is a scope
violation of the phase boundary stated in CONTEXT.md ("This phase is rendering, not plumbing").

## Standard Stack

### Core

No new dependencies. This phase is built entirely on packages and internal primitives already
present and in use elsewhere in the codebase.

| Library/Primitive | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | (project-pinned, existing) | Component tree | Existing framework; no version change needed |
| `react-i18next` (`useTranslation`) | existing | Localised copy | Same pattern every other panel uses; `gamelib` namespace already wired |
| `@fortawesome/react-fontawesome` + `free-solid-svg-icons` | existing | Icons (`faChevronDown`, `faTriangleExclamation`, etc.) | Already the icon system for `FilterFacetGroup`, `HumbleExpiryToast` |
| MUI `Dialog` (`src/frontend/components/UI/Dialog/components/Dialog.tsx`) | existing | Dialog shell — unchanged (C-6) | Locked by CONTEXT.md; do not touch `scroll="paper"`/`maxWidth="md"` at lines 101-102 |
| `classnames` | existing | Conditional class composition on row/group elements | Already used throughout `FilterFacetGroup`/`Dropdown` consumers |

### Supporting

| Library/Primitive | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Dropdown` (`src/frontend/components/UI/Dropdown/`) | existing | Disclosure primitive for each category group | Per D-05 — wrap every `.WinetricksBrowse__group` in this, do not build a new disclosure widget |
| `SearchBar` (`src/frontend/components/UI/SearchBar/`) | existing | Input chrome only | Per CONTEXT.md code_context — pass no `suggestionsListItems` so `.autoComplete` stays functionally inert; its 34px control height is an operator-sanctioned exception, do not "fix" to 36px |
| `ProgressDialog` (`src/frontend/components/UI/ProgressDialog/`) | existing | Install progress log display | Unchanged per C-6; only its `hideProgress` boolean expression (currently reading `loadingInstalled` at `Winetricks/index.tsx:232-234`) needs re-deriving once the gates change |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Render-all-328-rows (D-07, locked) | A virtualisation library (e.g. `react-window`) | Rejected by CONTEXT.md: no windowing library exists in `package.json`, adding one is a new-dependency package-legitimacy checkpoint for an unmeasured problem, and it interacts badly with the mousedown-capture install pattern and breaks find-in-page |
| Copy `FilterFacetGroup`'s CSS pattern (D-05, locked) | De-scope `FilterFacetGroup/index.scss` from `.NavShell__tier2Portal` and share it literally | Rejected: would make every rule in that file live app-wide, turning the Games filter panel into a regression surface. This codebase has already paid for two cross-context CSS leaks (`Dropdown` styling panel contents; unscoped `.MuiTabs-root`) |
| `pnpm machine-fill-gamelib` for all 528 strings (D-10) | Hand-fill directly without re-measuring the script | CONTEXT.md requires re-measuring once first — a key can be rotated since `t13`'s 401, and one command is cheaper than assuming it still fails |

**Installation:** None required — no `npm install` / `pnpm add` step for this phase.

**Version verification:** N/A — no new package versions to verify. If the planner's package
audit turns up any unexpected new dependency during implementation, that is a deviation from
this phase's scope and should be flagged, not silently added.

## Package Legitimacy Audit

**Not applicable.** This phase installs no external packages. Every primitive and library used
(`Dropdown`, `SearchBar`, `ProgressDialog`, MUI `Dialog`, `react-i18next`, FontAwesome,
`classnames`) is already a dependency in `package.json` and already imported elsewhere in the
codebase. `slopcheck` was not run because there is nothing to check.

If the planner or an implementer later discovers a genuine need for a new package (e.g. for
virtualisation, contrary to D-07), that decision must be escalated — CONTEXT.md's D-07 already
records the rationale against it, so re-opening it needs an explicit operator decision, not a
silent `pnpm add`.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ Winetricks/index.tsx (mount point — orchestrates state, unchanged   │
│ shell)                                                                │
│                                                                        │
│  listInstalled() ──sets──▶ installed: string[]                       │
│  (IPC, unchanged)          loadingInstalled: bool (⚠ D-17 target)    │
│                                                                        │
│  winetricksInstall(verb) ─IPC (unchanged)─▶ backend                  │
│       │                                                                │
│       ▼ (progress events)                                             │
│  onInstallingChange(evt, component) ──▶ if component === ''          │
│       │                                    listInstalled() [refetch] │
│       ▼                                    setInstalling(false)      │
│  installing: bool                                                     │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ NEW: WinetricksBrowse/ (this phase, pure render)              │   │
│  │                                                                 │   │
│  │  props: components (from listAvailable, 567 verbs w/          │   │
│  │         {verb,title,category,cached}), installed, installing, │   │
│  │         guiOpen, onInstall(verb)                               │   │
│  │                                                                 │   │
│  │  SearchBar (input chrome only, no suggestions) ──▶ filters    │   │
│  │       │                                             flat list  │   │
│  │       ▼ (no search text)                                       │   │
│  │  Curated group (open by default, D-01: 8 verbs)                │   │
│  │  5x Category .WinetricksBrowse__group (Dropdown-wrapped,       │   │
│  │      collapsed by default, D-04: resets every dialog open)     │   │
│  │       │                                                         │   │
│  │       ▼                                                         │   │
│  │  Row (mousedown-capture pattern ported from                    │   │
│  │       WinetricksSearch, D-19) ── per-row state derivation:      │   │
│  │       Available / Available+Cached / Installing-this-row /     │   │
│  │       Installing-elsewhere / Installed / Needs-GUI / Errored   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ProgressDialog (unchanged, C-6) ── hideProgress expression must      │
│       be re-derived once loadingInstalled stops gating mount          │
└─────────────────────────────────────────────────────────────────────┘
```

A reader can trace the primary use case: `listAvailable()` data flows in as props →
`WinetricksBrowse` derives per-row state → user mousedown on a row → `onInstall(verb)` fires the
existing unchanged IPC call → progress events flow back through `onInstallingChange` →
`listInstalled()` refetches → the fixed stale-while-revalidate render updates the Installed
badge in place without remounting the list.

### Recommended Project Structure

CONTEXT.md leaves file/module layout to the planner's discretion. Based on the existing
`WinetricksSearch/` sibling-directory precedent and `FilterFacetGroup/`'s co-located
`index.tsx`+`index.scss`+`__tests__/` shape, the natural seam is:

```
src/frontend/components/UI/Winetricks/
├── index.tsx                       # mount point, largely unchanged shell + gate fix
├── WinetricksBrowse/
│   ├── index.tsx                   # top-level browse component (search + curated + categories)
│   ├── index.scss                  # .WinetricksBrowse__group styles (CR-01/CR-03 fallback chains copied)
│   ├── curatedVerbs.ts             # D-01's hand-maintained ~8-verb exported constant
│   ├── Row/
│   │   ├── index.tsx               # per-row component, mousedown-capture pattern (D-19)
│   │   └── deriveRowState.ts       # pure function: verb + installed/installing/guiOpen/logs → row state
│   └── __tests__/
│       ├── WinetricksBrowse.test.tsx
│       ├── remountSafety.test.tsx  # D-18's test, with documented revert-to-red proof
│       └── winetricksInstallMouseRace.test.tsx   # ported from WinetricksSearch (D-19)
└── WinetricksSearch/                # RETIRED — directory removed, not kept alongside
```

### Pattern 1: Mousedown-capture install intent (D-19, port from `WinetricksSearch`)

**What:** Capture user intent on `mousedown` (before any DOM remount can occur), and suppress
the subsequent synthetic `click` so keyboard activation via `Enter`/`Space` still works.

**When to use:** Every clickable row button/element in the new `WinetricksBrowse` Row component.

**Example (verified pattern, `WinetricksSearch/index.tsx:79-104`):**
```typescript
// Source: src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx:79-104
// ROOT CAUSE FOUND (Phase 35 Plan 25): a parent state flip unmounted-and-remounted
// the whole list as a single batch, ~4ms after mousedown and ~60ms before mouseup,
// so mouseup landed on an unrelated element and `click` never fired.
const suppressNextClick = useRef(false)

const handleMouseDown = () => {
  suppressNextClick.current = true
  onInstall(verb) // fire the actual intent here, on mousedown
}

const handleClick = () => {
  if (suppressNextClick.current) {
    suppressNextClick.current = false
    return // mousedown already handled it; don't double-fire
  }
  onInstall(verb) // keyboard activation (Enter/Space) still reaches here
}
```

### Pattern 2: Token-survival fallback chains (copy from `FilterFacetGroup/index.scss`, D-05)

**What:** An undefined CSS custom property with no fallback silently drops the ENTIRE
declaration at computed-value time, in whichever theme block lacks it.

**When to use:** Every colour/border declaration in `.WinetricksBrowse__group`'s new stylesheet.

**Example (verified, `FilterFacetGroup/index.scss` CR-01/CR-03):**
```scss
// Source: src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss
// CR-01 / CR-03 fallback chains — copy verbatim, do not invent new ones.
color: var(--navbar-inactive, var(--navbar-accent));
color: var(--text-hover, var(--accent));
border-color: var(--navbar-active, var(--accent-overlay, var(--accent)));
```

### Pattern 3: Out-specifying `Dropdown`'s generic content rules (D-05 risk, confirmed by memory + source)

**What:** `Dropdown/index.scss`'s `.dropdownContainer .dropdown button` rule sits at specificity
(0,2,1) and styles ANY button rendered inside a `Dropdown` panel (margin, alignment, font-size,
padding) — written for its original MainButton-menu consumer, not for row primitives moved in
later. A naive `.WinetricksBrowse .WinetricksBrowse__row` rule at (0,2,0) loses on every
contested property. This has already recurred twice (`FilterFacetRow`, `NavItem`).

**When to use:** Any row/button styling nested inside the new `.WinetricksBrowse__group`'s
`Dropdown`.

**How to avoid:** Add an extra ancestor class to reach at least (0,3,0) — class-count, not
source order, is what wins, because the row stylesheet and `Dropdown/index.scss` are imported by
different components and neither can rely on loading second.
```scss
// (0,2,1) generic rule this must beat: .dropdownContainer .dropdown button { ... }
// Reach (0,3,0) or higher with an extra ancestor/self class:
.WinetricksBrowse .WinetricksBrowse__group .WinetricksBrowse__row {
  margin-inline-start: 0; // restore the row's own spec, don't invent new values
}
```
Verify the emitted selector with `npx sass --style=expanded <file>` rather than trusting nesting
to produce the intended specificity — do not assume, measure the compiled CSS.

**Also watch:** `.dropdownContainer .button` sits at (0,2,0) and matches ANY descendant
carrying class `.button` regardless of nesting — never name a new row element `.button`
verbatim (use e.g. `.WinetricksBrowse__installButton`).

### Pattern 4: Dropdown's "free" side effects when reused

Building the new group on `Dropdown` automatically wires two behaviours the component gets for
free, without extra code:
- `useSuppressStoreEmbedWhile(isExpanded)` — automatic store-embed suppression while expanded (via `NavShell/StoreEmbedSuppressionContext`).
- `window.api.gamepadAction({ action: 'tab' })` fired on expand — gamepad-navigation wiring.

### Anti-Patterns to Avoid

- **Reusing `FilterFacetRow` for install rows:** It is a `role="checkbox"` toggle component with
  `aria-checked` semantics — semantically wrong for an install-action button. D-05 explicitly
  rejects this; build a new Row component instead.
- **Bare `var(--token)` without a fallback:** Silently drops the whole declaration in any theme
  block that doesn't define the token. Always chain to a known-universal fallback (see Pattern 2).
- **`<div onClick>` for disclosure:** This codebase has already paid for the `<li onClick>`
  version of this mistake (see `SearchBar`'s mouse-race comment history). Use a real
  `<button aria-expanded>`, matching `FilterFacetGroup`/`Dropdown`'s existing pattern.
- **Sorting rows within a category:** D-14 locks parser emission order (already dedup'd,
  first-occurrence-wins). Do not add a `.sort()` — it would diverge from the zenity GUI's own
  order and introduce locale/collation exposure on the title column.
- **Re-round-tripping locale catalogs through a JSON serialiser:** `public/locales/` is in
  `.prettierignore`. A `json.load` → `json.dump` cycle reformats all 47/49 files and buries the
  real diff (see Common Pitfalls — Localisation removal traps).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Disclosure/expand-collapse | A new collapsible widget | `Dropdown` (`src/frontend/components/UI/Dropdown/`) | Already handles `max-height: 50vh` scroll, `aria-expanded`, gamepad wiring, store-embed suppression — D-05 mandates building on it |
| Search input chrome | A new text input + clear button | `SearchBar` (input chrome only, no suggestions passed) | Already handles the virtual-keyboard `input` event wiring and the focus-race mitigation history; reuse for chrome, do not reimplement |
| Row virtualisation | A custom windowing/virtual-scroll implementation | Nothing — render all 328 rows (D-07, locked) | No library exists in `package.json`; adding one is an unjustified new dependency for an unmeasured problem |
| Locale catalog pre-flight validation | A new validator from scratch | Re-derive/reuse the `t13` quick-task's pre-flight validator (locale-set check, bidirectional placeholder parity, glossary survival via repo's own boundary regexes, no-empty-values) | Precedented twice (`260908-iq8`, `260915-t13`); re-deriving from scratch risks missing a trap already discovered (e.g. the last-key-in-object trailing-comma issue) |
| Placeholder/glossary parity checking | A hand-rolled regex check | `validateTranslation()` (`meta/machineFillGamelib.ts`) | Already the function `gamelibCatalogParity.test.ts` applies to every committed catalog; don't duplicate its logic |

**Key insight:** Every "don't hand-roll" item in this phase already has a working, in-repo
implementation from a directly analogous prior feature (`FilterFacetGroup`/`Dropdown` for
disclosure, `SearchBar` for input chrome, `t13`'s validator for locale fills). The engineering
risk in this phase is almost entirely in *composition and state-shape correctness*, not in
needing new infrastructure.

## Common Pitfalls

### Pitfall 1: D-20's key-removal list omits `winetricks.loading`

**What goes wrong:** D-20 lists exactly 5 `translation.json` `winetricks.*` keys to remove
(`search`, `no-components`, `installed`, `nothingYet`, `installing`) and 3 to keep (`install`,
`openGUI`, `loading-available`). Verified via direct read of
`public/locales/en/translation.json` (lines 1410-1420), the full block has **9** keys, not 8.
The 9th, bare `"loading": "Loading"`, is consumed only at `Winetricks/index.tsx:210` — inside
the `installedWrapper` block D-11 retires wholesale. D-20's list does not mention it at all.

**Why it happens:** D-20 was likely written by cross-referencing the search/status copy that
`WinetricksSearch` and the zero-state directly use, and missed that `installedWrapper`'s own
internal "Loading" sub-state uses a 9th, differently-scoped key from the same object.

**How to avoid:** The planner should explicitly decide the disposition of `winetricks.loading`
as part of the D-11/D-20 implementation task — either add it as a 6th key to the removal set
(same 47-locale-dir mechanics as the other 5) or explicitly document why it's kept. Grep
`src/frontend` for `winetricks.loading` (excluding `winetricks.loading-available`, which is
reused) before deciding — this research confirmed via grep that its only consumer is the
retired `installedWrapper` block.

**Warning signs:** If the phase ships with `winetricks.loading` still present in `translation.json`
across 47 locale dirs but with zero consumers in `src/`, that's the exact "orphaned key" pattern
D-20 was written to close for the other 5 — just missed for this one.

### Pitfall 2: No existing data-model support for the row-level "Errored" state

**What goes wrong:** UI-SPEC's row-level state table includes an "Errored" state, citing reuse
of "the existing heuristic ProgressDialog already applies". Verified: `ProgressDialog/index.tsx`
(lines 70-88) applies a `.toLowerCase().includes(' err')` string heuristic **per log line**, in
a single flat, ever-accumulating `logs` array shared across ALL installs (not per-verb). It
classifies lines for CSS styling only (`log-error`/`log-warning`/`log-info`). There is **no
existing mechanism that attributes an error line to the specific verb/row that caused it.**

**Why it happens:** The UI-SPEC's citation is accurate about the string-matching heuristic
existing, but doesn't address that today's heuristic operates on an undifferentiated log stream,
while a row-level Errored state requires knowing *which verb* an error line belongs to.

**How to avoid:** This needs new derivation logic — likely a `Record<verb, RowStatus>` built by
correlating `onWinetricksProgress`'s `payload.installingComponent` (available on each progress
event) with the error-matching heuristic, updated as log lines arrive. This is a genuine
implementation task that isn't explicitly designed anywhere in CONTEXT.md or UI-SPEC and should
be called out as its own task/seam in the plan, not assumed to be "just reuse the heuristic".

**Warning signs:** A plan task that says "reuse the ProgressDialog error heuristic for row
state" without specifying how per-verb attribution is derived is under-specified and will likely
produce either (a) every row flashing Errored on any install's failure, or (b) no row ever
reaching Errored state.

### Pitfall 3: CSS specificity out-specification trap recurs for every new row primitive in a `Dropdown`

**What goes wrong:** `Dropdown/index.scss`'s `.dropdownContainer .dropdown button` rule at
(0,2,1) specificity styles margin/alignment/font-size/padding for ANY button inside a `Dropdown`
panel. A naive row-scoped rule at (0,2,0) loses on all four contested properties. Confirmed by
project memory: this has already recurred twice (`FilterFacetRow` at `260815-mk1`, `NavItem` at
`260815-nmq`) — documented as "a class of bug that recurs for every new row primitive moved into
a Dropdown panel," with the first fix's comment not preventing the second occurrence.

**Why it happens:** `Dropdown/index.scss` was written for its original MainButton-menu consumer
and its generic content-styling rules are broader than any single consumer expects.

**How to avoid:** Add an extra ancestor/self class to any new row rule to reach (0,3,0) or
higher — class-count wins regardless of load order, which matters because the row stylesheet and
`Dropdown/index.scss` are imported by different components. Never name a new row element
`.button` verbatim (the `.dropdownContainer .button` rule at (0,2,0) matches any descendant
carrying that class). Verify emitted specificity with `npx sass --style=expanded <file>` rather
than trusting nesting.

**Warning signs:** New row content renders with unexpected indent (~33px) or grows its own
0.8rem padding while its group header stays at the correct gutter — this is the exact symptom
recorded for both prior occurrences.

### Pitfall 4: Locale-key removal has population and structural traps beyond D-20's stated ones

**What goes wrong:** D-20 correctly notes 47 not 49 locale dirs have `translation.json`. Project
memory (`removing-a-locale-key-has-three-traps`, measured 2026-09-11 on a directly analogous
removal) adds two further traps not mentioned in D-20: (1) `da`, `id`, and `nl` hold Winetricks
keys as the LAST entry in their locale's object — deleting that line strands a trailing comma on
the *preceding* line and breaks JSON parsing, requiring structural detection (next non-empty
line starts with `}`) rather than blind line deletion; (2) `public/locales/` is
`.prettierignore`'d, so round-tripping any file through a JSON serialiser (`json.load` →
`json.dump`) reformats the whole file and buries the actual diff — edit lines in place and
re-parse as the verification step, never serialise-and-rewrite.

**How to avoid:** Derive the actual population with `grep -rl "winetricks\." public/locales/*/translation.json`
rather than assuming all 47 non-`br`/`sl` dirs have every key in a removable shape. Check each
target file's key ordering (is the key being removed last in the object?) before writing a
blanket removal script.

**Warning signs:** A removal script that doesn't special-case last-key-in-object locales will
produce a parse error in at minimum `da`, `id`, `nl` (confirmed by prior measurement on the
directly analogous `accessibility.disable_smooth_scrolling` removal, `260911-srh`) — though the
exact set of affected locales should be re-verified for the specific 5-6 Winetricks keys, since
"last entry" is a per-locale, per-key fact that can differ from the prior removal's keys.

### Pitfall 5: `--status-*` raw tokens vs `--success`/`--danger` theme-adaptive aliases

**What goes wrong:** The Errored/warning row states need foreground (text/icon) colour. This
codebase has two parallel colour-token families that look similar but are not interchangeable:
`--status-success`/`--status-danger`/etc. are raw Figma constants declared once with **no
light-theme override**, while `--success`/`--danger` are theme-adaptive aliases declared in
`themes.scss`'s base `body {}` block and overridden per-theme. Measured: `color:
var(--status-danger)` renders at 2.27:1 contrast on the `nord-light` theme's background — a
WCAG failure — while `color: var(--danger)` resolves correctly per-theme.

**How to avoid:** For any row-state foreground colour (Errored text/icon, Needs-GUI badge text,
etc.), use `--success`/`--danger`/`--warning` (the aliases), never `--status-*` directly. Reserve
`--status-*` for background/fill colours only. This directly reinforces D-24's theme
spot-check requirement — testEnvironment is `node` with no CSS engine, so no automated test can
catch a contrast regression; the spot-check in one light + one dark theme is the only gate.

**Warning signs:** Any new CSS rule in `.WinetricksBrowse__group`/Row stylesheets using
`color: var(--status-*)` for text is very likely the exact defect class this codebase has
already shipped and fixed once (`.humbleKeyOwnedBadge`, `260911-t0p`) with ~10 other sites still
outstanding.

## Code Examples

### Curated verb list source of truth (D-01, D-02)

Confirmed shape and count against `src/backend/tools/winetricksListParse.ts` and its test
fixture — no verified code example exists for the constant itself since it's new to this phase.
Structural example based on locked decisions:

```typescript
// Source: new file, per D-01/D-02 — hand-maintained, NOT data-derived
// A curated verb also appears in its own category (D-02) — do not filter it
// out of the category list when rendering the curated group.
export const CURATED_WINETRICKS_VERBS = [
  'vcrun2019',
  'vcrun2013',
  'vcrun2010',
  'dotnet48',
  'd3dx9',
  'xact',
  'corefonts',
  'physx'
] as const
```

### `hideProgress` expression that must be re-derived (Winetricks/index.tsx:232-234, verified)

```tsx
// Source: src/frontend/components/UI/Winetricks/index.tsx:232-234 (CURRENT, pre-phase)
const hideProgress =
  !guiOpen && !installing && !loadingInstalled && !loadingAvailable
```
Once D-17's fix decouples "do we have data yet" from "is a background refresh in flight", this
expression's `!loadingInstalled` term needs re-deriving — it currently means "no install-list
refetch in flight, of any kind", conflating initial load with post-install revalidation. The
planner must define what replaces it (likely a separate `isRevalidating` flag that does NOT gate
`hideProgress`, since a background refetch after a successful install should not hide the
progress dialog prematurely, nor should it block it).

### `.dropdown.expanded` scroll region (verified, `Dropdown/index.scss`)

```scss
// Source: src/frontend/components/UI/Dropdown/index.scss
.dropdown.expanded {
  max-height: 50vh;
  overflow-y: auto;
  box-shadow: inset 0 0 0 1px var(--divider);
}
```
Per D-06, this becomes the ONLY inner scroll region — no per-category 240px scroll is added on
top of it.

## State of the Art

| Old Approach | Current Approach (this phase) | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Search-only panel (`WinetricksSearch/`), type-to-reveal, 370 verb-only entries | Browse-first categorised checklist, 567 verbs with `{verb,title,category,cached}` | This phase | Matches the operator's stated preference for winetricks' own zenity GUI shape |
| Installed components hidden from search (`filtered.filter((c) => !installed?.includes(...))`) | Installed components shown in search, badged (D-13) | This phase | Reverses a false-negative UX (searching an installed component returned "nothing") |
| Flat "Installed components: a, b, c" text summary (`installedWrapper`) | Per-row Installed badges in place | This phase (D-11) | Same fact surfaced with category/cached context the flat list never had |
| Two nested mount gates (`!loadingInstalled` outer, `!installing` inner) both hide the whole list | Stale-while-revalidate: list stays mounted; only an overlay/badge state changes during refetch | This phase (D-17/D-18) | Closes the confirmed-real remount defect; the "second remount" only became reachable once this phase removes the inner gate that was masking it |

**Deprecated/outdated:**
- `WinetricksSearch/index.tsx` and its directory: fully retired, not kept alongside the new
  component (its test is ported, not the component itself).
- The `installedWrapper` block (`Winetricks/index.tsx:199-221`): retired wholesale by D-11.
- 5 (or 6, pending Pitfall 1 resolution) `translation.json` `winetricks.*` keys: orphaned by
  this phase, removed per D-20.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The exact set of locales where a Winetricks key is the last entry in its object (triggering the trailing-comma structural trap) may differ from the `da`/`id`/`nl` set measured for the prior, different key removal (`accessibility.disable_smooth_scrolling`). This research did not re-verify per-locale ordering for the specific 5-6 `winetricks.*` keys. | Common Pitfalls — Pitfall 4 | A removal script tuned only to `da`/`id`/`nl` could still break JSON parsing in a locale not in that set; the fix (structural last-key detection) is cheap regardless, so risk is contained if the general detection method is used rather than a hardcoded locale list |
| A2 | The `WinetricksBrowse/` file/module layout proposed in Architecture Patterns → Recommended Project Structure is this research's own extrapolation from sibling precedents (`WinetricksSearch/`, `FilterFacetGroup/`), not a decision recorded anywhere in CONTEXT.md (which explicitly leaves layout to planner discretion). | Architecture Patterns | Low — CONTEXT.md explicitly defers this to the planner, so any reasonable layout is compliant; this is offered as a starting point, not a constraint |
| A3 | The proposed `Record<verb, RowStatus>` shape for per-row error attribution (Pitfall 2) is this research's own design suggestion, not verified against any existing pattern in the codebase — no prior feature in this repo correlates `onWinetricksProgress` events to a per-key status map. | Common Pitfalls — Pitfall 2 | Medium — if the planner adopts a different shape, that's fine; the risk is only in under-specifying this as "just reuse the heuristic" without any per-verb correlation mechanism at all |

**If this table is empty:** N/A — see entries above. All other claims in this research were
verified directly against source files, project memory (dated and flagged as point-in-time), or
CONTEXT.md/UI-SPEC's own locked text.

## Open Questions (RESOLVED)

> All four questions below were resolved during planning of this phase. Each carries an inline
> **Resolved** note naming the plan and the mechanism that answered it. Nothing in this section
> is outstanding.

1. **Should `winetricks.loading` be added to D-20's removal set?**
   - What we know: it's the 9th key in the `translation.json` `winetricks` block, orphaned by
     D-11's retirement of `installedWrapper`, and not mentioned by D-20.
   - What's unclear: whether this was a deliberate omission (e.g. reserved for reuse elsewhere)
     or an oversight.
   - Recommendation: the planner should grep `src/frontend` for `winetricks.loading` (excluding
     `.loading-available`) as part of the D-11/D-20 implementation task and decide explicitly;
     this research's grep found zero other consumers, suggesting it should be added to the
     removal set as a 6th key.
   - **Resolved (plan 44-06):** yes. 44-06 removes **6** keys, not 5 — `winetricks.loading` is included, on the strength of the grep census run in 44-05 (D-20(a)), which must show zero surviving consumers for all 6 before any removal.

2. **How should per-row Errored-state attribution be implemented?**
   - What we know: the existing `' err'` string heuristic works on individual log lines in a
     single shared flat log; `onWinetricksProgress` events carry `payload.installingComponent`.
   - What's unclear: no existing code correlates the two into a per-verb status; UI-SPEC assumes
     reuse without specifying the correlation mechanism.
   - Recommendation: plan this as its own explicit task (a pure derivation function taking the
     log array + the currently-installing verb + install history, returning a `Record<verb,
     RowStatus>`), with its own unit tests — not folded silently into "port the heuristic".
   - **Resolved (plan 44-01):** a dedicated pure derivation, `attributeProgressEvent(current: VerbErrorMap, payload: { messages, installingComponent }) => VerbErrorMap`, exported alongside `deriveRowState()` and `clearVerbError()` and covered by its own unit tests — not folded into the ported `' err'` heuristic.

3. **What replaces `hideProgress`'s `!loadingInstalled` term once D-17 ships?**
   - What we know: the current expression conflates "still loading initial data" with "a
     background refresh is in flight" via one boolean.
   - What's unclear: the exact replacement shape (a second boolean? a derived value?) is not
     specified in CONTEXT.md.
   - Recommendation: treat this as part of the D-17/D-18 task's acceptance criteria — the plan
     should explicitly define the new state shape (e.g. `hasInstalledData: boolean` +
     `isRevalidatingInstalled: boolean`) rather than leaving `hideProgress` to be patched
     reactively after the fact.
   - **Resolved (plan 44-05):** the one `loadingInstalled` boolean splits into three — `hasInstalledData` (sticky, first load only), `isRevalidatingInstalled` (drives the stale-while-revalidate overlay only, never a mount) and `hasAttemptedInstall` (sticky per dialog session). `hideProgress` is redefined against all three.

4. **Does the curated-verb parser fixture (D-03) need to be built, or does one already exist?**
   - What we know: `src/backend/tools/__tests__/winetricksListParse.test.ts`'s existing fixtures
     are minimal synthetic single-line examples for specific parser edge cases (header ordering,
     `prefix` skip, charset) — none contain a realistic/complete dataset covering all 8 of D-01's
     curated verbs.
   - What's unclear: whether D-03's "unit test over the committed parser fixture" means extending
     the existing fixture file, or adding a new one scoped to `WinetricksBrowse/`.
   - Recommendation: plan a task to either extend `winetricksListParse.test.ts`'s fixture with a
     realistic multi-category chunk containing all 8 curated verbs, or add a small dedicated
     fixture under the new component's `__tests__/` — either satisfies D-03's letter, but the
     planner should pick one explicitly rather than leaving it to be discovered at execution time.
   - **Resolved (plan 44-01, Task 3):** extend the existing `src/backend/tools/__tests__/winetricksListParse.test.ts` fixture with a realistic multi-category chunk covering all 8 curated verbs, plus D-03's curated-resolution assertion. No new fixture file.

## Environment Availability

Skipped — this phase has no external tool/service/runtime dependencies beyond what's already
installed and working in this repository (Node/pnpm/Jest, already verified functioning via
`package.json` scripts). No new CLI, database, or service dependency is introduced.

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` (not absent, explicitly
enabled) — this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29 (via `ts-jest`), **`testEnvironment: 'node'`, NOT jsdom** — no `jest-environment-jsdom`/`react-test-renderer` installed |
| Config file | `src/frontend/jest.config.js` (frontend project); root `jest.config.js` lists 5 projects: `src/backend`, `src/common`, `src/frontend`, `src/preload`, `meta` |
| Quick run command | `pnpm test -- src/frontend/components/UI/Winetricks` (or narrower path once files exist) |
| Full suite command | `pnpm test:ci` (= `jest --runInBand --silent`, root script) |

**Critical constraint verified from `src/frontend/jest.config.js`'s own header comment:** this
project deliberately has no DOM. Component tests **call function components directly** (no
`ReactDOM`/render tree) and mock `'react'` (`useState`/`useEffect`/`useRef`) and `'react-i18next'`
(`useTranslation`) at the module level, inspecting only the returned React-element object graph.
`winetricksInstallMouseRace.test.tsx` (full contents verified, ~280 lines) is the working
template for this pattern in this exact domain:
- `jest.mock('react', ...)` reimplements `useState`/`useEffect`/`useRef` with manual state-slot
  arrays and a cursor, mimicking React's hook-call-order contract.
- `mount()` / `reinvoke()` helpers drive (re-)renders by invoking the component function directly.
- A `walk()` helper manually traverses the returned React-element object graph to find elements
  by `props.className` / `type`, since there is no real DOM to query.

Any RTL-style (`render()`, `fireEvent`, `screen.getByRole`) test plan is **inapplicable** to this
codebase — the planner must specify tests in this hand-rolled-harness style, or explicitly plan
adding `jest-environment-jsdom` as a new dependency (which the existing config comment flags as
requiring a human package-legitimacy checkpoint — almost certainly out of scope for a
rendering-only phase that CONTEXT.md scopes tightly).

### Phase Requirements → Test Map

No requirement IDs are minted yet (`Requirements: TBD` in ROADMAP.md). The table below maps the
locked decisions (D-01..D-24) to natural test seams, in the same style the planner should use
once REQ-44-XX IDs are minted (see Candidate Requirement Seams below).

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-03 | Every curated verb resolves against the committed parser fixture | unit | `pnpm test -- winetricksListParse` | ❌ Wave 0 — fixture needs extension, see Open Question 4 |
| D-18 | Row nodes stay mounted across both install-start and install-completion transitions; revert-to-red proof required | component | `pnpm test -- remountSafety` | ❌ Wave 0 — new test file |
| D-19 | Mousedown-capture install pattern (ported) | component | `pnpm test -- winetricksInstallMouseRace` | ❌ Wave 0 — ported from `WinetricksSearch/__tests__/`, not yet at new location |
| D-13 | Installed components appear, badged, in search results | component | `pnpm test -- WinetricksBrowse` | ❌ Wave 0 — new test file |
| D-04 | Category expand/collapse resets to Default on every dialog open | component | `pnpm test -- WinetricksBrowse` | ❌ Wave 0 |
| D-08/09/10 | 528 strings (11 keys × 48 locales) pass parity | integration (repo-wide gate) | `pnpm lint-translations:gamelib && pnpm test -- gamelibCatalogParity` | ✅ gate exists (`meta/__tests__/gamelibCatalogParity.test.ts`), keys don't exist yet |
| D-20 | Orphaned keys removed, no surviving consumers, 47-dir mechanics respected | manual + grep verification | `grep -rn "winetricks\.\(search\|no-components\|installed\|nothingYet\|installing\)" src/frontend` (expect 0 hits post-removal) | N/A — grep-based verification, no dedicated test |
| D-22 | Live gate: mouse-click install completes with list mounted; Installed badge appears in place, no reflow/scroll jump | manual-only (live WKWebView run) | N/A — explicitly out of automated-test scope per D-21/D-23 | N/A |

### Sampling Rate

- **Per task commit:** `pnpm test -- <narrow path>` (component/unit tests touched by that task)
- **Per wave merge:** `pnpm test:ci` (full suite, `--runInBand --silent`) plus `pnpm lint-translations:gamelib` once the locale fill task lands
- **Phase gate:** Full suite green (`pnpm test:ci`), `pnpm lint-translations:gamelib` green,
  `pnpm planning-gates` 11/11, plus the D-22 live gate (manual/live-driven, not automatable in
  this environment) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/WinetricksBrowse.test.tsx` — covers row rendering, search-flat-list, curated group, D-13's installed-in-search reversal, D-04's reset-on-open
- [ ] `src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/remountSafety.test.tsx` — D-18's revert-to-red proof; both install-start and install-completion triggers
- [ ] `src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/winetricksInstallMouseRace.test.tsx` — ported from `WinetricksSearch/__tests__/` per D-19; can largely copy the existing file's harness/mock setup, retargeting the mounted component
- [ ] `src/backend/tools/__tests__/winetricksListParse.test.ts` fixture extension — D-03's curated-verb resolution assertion needs a realistic multi-category chunk covering all 8 curated verbs (currently only minimal synthetic single-line fixtures exist)
- [ ] No new test framework install needed — `ts-jest`/Jest 29 already configured; the hand-rolled hook-mock harness pattern is the one to replicate, not `jest-environment-jsdom`

## Security Domain

`security_enforcement` is not explicitly set to `false` in `.planning/config.json` — treated as
enabled, minimal applicability.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth surface touched by this phase |
| V3 Session Management | No | No session surface touched |
| V4 Access Control | No | No access-control surface; `WINETRICKS_DECLINED_GUARD` gating is unchanged by this phase |
| V5 Input Validation | Marginal — yes | The search filter text is client-side-only filtering against an already-fetched in-memory array (no query construction, no IPC payload built from it beyond what already exists); no new validation library needed. Existing `SearchBar` input-handling pattern is reused unchanged. |
| V6 Cryptography | No | Not applicable — no secrets/crypto surface in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| N/A — no new IPC surface, no new user-controlled data reaching backend/shell execution | — | This phase's search filtering operates entirely on already-fetched, already-trusted in-memory data (`listAvailable()`'s output); the install trigger (`winetricksInstall(verb)`) is unchanged and only ever invoked with a `verb` string sourced from the same already-shipped, already-validated parsed list — not from free-text user input |

No meaningful new attack surface is introduced by this phase. It is a pure rendering change over
already-fetched, already-typed data with an unchanged install IPC call.

## Sources

### Primary (HIGH confidence — direct source verification, 2026-09-16)

- `src/frontend/components/UI/Winetricks/index.tsx` (full read) — gates at lines 156/158, `listInstalled()` 37-52, `onInstallingChange` 97-103, `installedWrapper` 199-221, `hideProgress` 232-234, `WINETRICKS_DECLINED_GUARD` line 91
- `src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx` (full read) — installed-filter line 42, mouse-race comment/pattern lines 52-104
- `src/frontend/components/UI/Winetricks/WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx` (full read) — hand-rolled test harness template
- `src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.tsx` and `index.scss` (both full read) — CR-01/CR-03 fallback chains, `.NavShell__tier2Portal` scoping, `260815-mk1` specificity comment
- `src/frontend/components/UI/Dropdown/index.tsx` and `index.scss` (both full read) — disclosure primitive, side effects, `.dropdown.expanded` scroll rule, generic content-styling rules
- `src/backend/tools/winetricksListParse.ts` and `__tests__/winetricksListParse.test.ts` (both full read) — parser shape, existing fixture coverage
- `src/common/types.ts:826` — `WinetricksComponent` interface
- `src/frontend/components/UI/ProgressDialog/index.tsx` (full read) — error-line heuristic lines 70-88, no per-verb attribution
- `src/frontend/components/UI/Dialog/components/Dialog.tsx` — `scroll="paper"`/`maxWidth="md"` lines 101-102 (correcting the bare "Dialog.tsx" citation to its actual nested path)
- `src/frontend/components/UI/SearchBar/index.tsx` (full read) — `.autoComplete`/`clearSearchButton` gating nuance
- `public/locales/en/translation.json` (`winetricks` block, lines 1410-1420) — confirmed 9 keys, not 8 (Pitfall 1)
- `public/locales/en/gamelib.json` (`winetricks` block) — confirmed existing sibling-namespace ambiguity
- `src/frontend/jest.config.js` and root `jest.config.js` (both full read) — test infrastructure shape
- `.planning/phases/44-.../44-CONTEXT.md` (full read, this session) — all D-01..D-24 verbatim
- `.planning/phases/44-.../44-UI-SPEC.md` (full read, prior session, corroborated) — design contract
- `.planning/ROADMAP.md` §"Phase 44" — goal, scope fences, `Requirements: TBD`
- `.planning/config.json` (full read) — `nyquist_validation: true`, `ui_phase: true`, no explicit `security_enforcement`

### Secondary (MEDIUM confidence — project memory, dated and cross-checked against source)

- Memory `removing-a-locale-key-has-three-traps` (5 days old at research time) — 47/49 population, last-key trailing-comma trap, prettierignore round-trip trap; directly informed Pitfall 4
- Memory `dropdown-scss-leaks-into-panel-contents` (32 days old) — confirms and extends the `260815-mk1` specificity trap documented in-source; directly informed Pitfall 3
- Memory `status-tokens-are-raw-success-danger-are-theme-adaptive` (5 days old) — `--status-*` vs `--success`/`--danger` token families; directly informed Pitfall 5
- `.planning/quick/260915-t13-fill-17-humblekeys-across-48-locales/SUMMARY.md` (full read) — measured precedent for the D-10 locale-fill mechanics

### Tertiary (LOW confidence)

None used without cross-verification in this research.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; every primitive verified present and in current use
- Architecture: HIGH — all cited patterns verified against live source, two CSS traps independently corroborated by both source comments and project memory
- Pitfalls: HIGH for Pitfalls 1, 3, 4, 5 (directly verified against source/memory); MEDIUM for Pitfall 2 (the gap is confirmed real, but the proposed fix shape is this research's own suggestion, logged as Assumption A3)

**Research date:** 2026-09-16
**Valid until:** 2026-10-16 (30 days — stable, no external API surface; re-verify if `Winetricks/index.tsx`, `Dropdown/`, or `FilterFacetGroup/` receive unrelated changes before planning begins)
