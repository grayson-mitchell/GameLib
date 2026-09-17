# Phase 44: In-app Winetricks browse UI — Pattern Map

**Mapped:** 2026-09-16
**Files analyzed:** 14 (9 new/modified frontend files, 1 backend test fixture, 2 locale-catalog
populations, 1 retired directory)
**Analogs found:** 12 / 14 (2 have no analog — called out explicitly below, not forced)

CONTEXT.md D-09 overrides UI-SPEC's 16-key locale budget to **11 keys** (drops the 5
`winetricksBrowse.category.*` keys). This document follows D-09, not the UI-SPEC's 16.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `Winetricks/index.tsx` (MODIFY) | component (mount/orchestrator) | event-driven (IPC listeners) + request-response (invoke) | itself, pre-fix (own history) | n/a — edit in place |
| `WinetricksBrowse/index.tsx` (NEW) | component | transform (filter/group render) | `WinetricksSearch/index.tsx` (search-filter logic) + `FilterStoreFacet/index.tsx` (multi-group composition) | role-match, composite |
| `WinetricksBrowse/index.scss` (NEW) | config/style | n/a | `FilterFacetGroup/index.scss` | exact (explicitly mandated by D-05) |
| `WinetricksBrowse/curatedVerbs.ts` (NEW) | config | batch (static list) | none in-repo (hand-maintained constant is new to this phase) | no analog — see below |
| `WinetricksBrowse/Row/index.tsx` (NEW) | component | event-driven (mousedown/click) | `WinetricksSearch/index.tsx` (suggestion `<li>`/button) | exact (D-19 explicit port) |
| `WinetricksBrowse/Row/deriveRowState.ts` (NEW) | utility (pure transform) | transform | `ProgressDialog/index.tsx` (log-line heuristic) — **partial only, see Gap 2** | partial / no full analog |
| `WinetricksBrowse/__tests__/WinetricksBrowse.test.tsx` (NEW) | test | request-response (function-call harness) | `WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx` | exact (harness template) |
| `WinetricksBrowse/__tests__/remountSafety.test.tsx` (NEW) | test | event-driven (mount/effect sequencing) | same harness, + `Winetricks/index.tsx`'s own gate logic as the thing under test | role-match |
| `WinetricksBrowse/__tests__/winetricksInstallMouseRace.test.tsx` (PORTED) | test | event-driven | `WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx` (source of the port) | exact |
| `WinetricksSearch/` (DELETE, whole dir) | — | — | — | retirement, not a pattern target |
| `src/backend/tools/__tests__/winetricksListParse.test.ts` (MODIFY — fixture extension) | test | batch (fixture-driven unit test) | its own existing test cases (see excerpt) | exact — extend in place |
| `public/locales/*/gamelib.json` (MODIFY, 49 dirs) | config | batch | `public/locales/en/gamelib.json`'s existing `winetricks` block (lines 386-389) | exact (sibling key, same file) |
| `public/locales/*/translation.json` (MODIFY, 47 dirs — key removal) | config | batch | the `t13`/`260908-iq8` locale-fill precedent + `winetricks` block itself (lines 1410-1420) | exact |

## Pattern Assignments

### `Winetricks/index.tsx` (component, event-driven + request-response)

**File itself is the analog** — this is a targeted edit of existing gates, not a net-new pattern.
Full file already read (239 lines); load-bearing excerpts:

**Both gates that must stop hiding the mount** (lines 156-158, current):
```tsx
{!declined && !loadingInstalled && (
  <div className="installWrapper">
    {!installing && allComponents.length !== 0 && (
      <div className="actions">
```
Per D-17/D-18/UI-SPEC Component Inventory, **both** `!loadingInstalled` (outer) and `!installing`
(inner) must stop gating whether `WinetricksBrowse` is mounted. `listInstalled()` (lines 37-52)
sets `loadingInstalled` back to `true` on every post-install refetch, which is what makes the
outer gate re-fire on install *completion*, not just initial load — this is D-17's exact target.

**`onInstallingChange` — the refetch trigger** (lines 97-103):
```tsx
async function onInstallingChange(e: IpcRendererEvent, component: string) {
  if (component === '') {
    listInstalled()
  }
  setInstalling(false)
}
```

**`hideProgress` expression that must be re-derived** (lines 232-234):
```tsx
hideProgress={
  !guiOpen && !installing && !loadingInstalled && !loadingAvailable
}
```
Once `loadingInstalled` stops gating mount, this term conflates "no data yet" with "background
refresh in flight." RESEARCH.md's Open Question 3 recommends splitting into e.g.
`hasInstalledData` + `isRevalidatingInstalled` — not resolved by any existing pattern in this
repo; the planner must define the new state shape explicitly (own task/seam).

**`installedWrapper` block being retired wholesale by D-11** (lines 199-221) — do not port any
part of this to the new Row component; its function (surfacing installed status) is fully
replaced by the per-row Installed badge.

**`WINETRICKS_DECLINED_GUARD`** (line 91) — unchanged by this phase, still the outermost gate; do
not touch its wiring, only the two gates beneath it.

---

### `WinetricksBrowse/index.tsx` (component, transform) — composite analog

No single existing file matches this component's shape (search input + curated group + N
collapsible category groups + flat search-results fallback), so two analogs compose it:

**A. Search-filter effect pattern** — copy from `WinetricksSearch/index.tsx` lines 28-45 (full
file already read above): the `useEffect` keyed on `search`, the ≥2-character threshold, the
case-folded verb-or-title substring match. **D-13 requires removing line 42's installed-filter**
(`filtered = filtered.filter((c) => !installed?.includes(c.verb))`) — this line must NOT be
carried into the new component; installed components now appear in search results, badged.

**B. Multi-group composition pattern** — `FilterStoreFacet/index.tsx` (full file read, 87 lines)
shows the shape for wrapping `FilterFacetGroup`-style groups with per-group row-mapping and a
header count badge:
```tsx
// Source: src/frontend/components/UI/NavShell/components/FilterStoreFacet/index.tsx:43-84
<FilterFacetGroup
  title={...}
  className="FilterStoreFacet"
  selectedCount={selectedCount}
  selectedCountLabel={...}
>
  {connectedStores.map((value: StoreFacetValue) => (
    <FilterFacetRow key={value} label={...} count={...} checked={...} onToggle={...} />
  ))}
</FilterFacetGroup>
```
`WinetricksBrowse`'s per-category groups follow this shape but wrap rows in the **new** Row
component (an install-action row, not a `role="checkbox"` toggle — `FilterFacetRow` itself is
explicitly NOT reusable per D-05).

**D-04 (reset-on-open) note:** unlike `FilterStoreFacet`'s `checked`/`storeFacet` state (which is
lifted to `LibraryContext` and persists), category expand/collapse state here must be **local**
and re-initialize to Default (curated open, categories collapsed) every time the dialog mounts —
`Dropdown`'s own `useState(false)` for `isExpanded` (see below) already does this for free simply
by being freshly mounted each dialog open; do not lift this state to a context or a ref that could
survive a remount.

---

### `WinetricksBrowse/index.scss` (style) — exact analog, D-05-mandated copy

**Analog:** `FilterFacetGroup/index.scss` (full file read, 308 lines)

**CR-01/CR-03 token-survival fallback chains — copy verbatim, do not invent new ones:**
```scss
// Source: FilterFacetGroup/index.scss:43-46 (file-local declaration, not imported)
--filter-active-color: var(
  --navbar-active,
  var(--accent-overlay, var(--accent))
);
```
```scss
// Source: FilterFacetGroup/index.scss:88 / :231 (consumers of the chain)
color: var(--navbar-accent);      // base header/row text
// on hover/focus/checked:
color: var(--filter-active-color); // the chain above, never bare --navbar-active
```
`--navbar-active` is declared in only 4 of 11 theme blocks; consuming it bare drops the entire
declaration silently in the other 7 (measured: `.FilterFacetRow--checked .FilterFacetRow__box`
lost both `background` and `border-color`). **Declare the chain locally in this new file too** —
the project's convention (per this file's own header comment) is that every consumer carries its
own copy rather than importing one, so a census gate can assert they match.

**CSS specificity out-specification trap (RESEARCH Pitfall 3 / Pattern 3, recurred twice already
— `FilterFacetRow` `260815-mk1`, `NavItem` `260815-nmq`):**
```scss
// Source: Dropdown/index.scss:104-109 — the (0,2,1) rule that must be beaten
.dropdownContainer .dropdown button {
  margin-inline-start: 0.5rem;
  align-self: center;
  font-size: 1rem;
  padding: 0.3rem 0.8rem;
}
// Also watch: .dropdownContainer .button (0,2,0) — Dropdown/index.scss:4-6 —
// matches ANY descendant carrying class .button verbatim.
```
```scss
// Source: FilterFacetGroup/index.scss:208-211 — the fix pattern (reach (0,3,0)+)
.FilterFacetGroup .dropdown {
  padding: 0;
  gap: 0;
}
.FilterFacetGroup .FilterFacetRow {
  margin-inline-start: 0;   // resets the leaked 0.5rem from Dropdown's rule
  align-self: stretch;
  padding: var(--space-2xs) var(--tier2-row-padding-inline);
  ...
}
```
Apply the same technique: `.WinetricksBrowse .WinetricksBrowse__group .WinetricksBrowse__row { }`
(3 classes, (0,3,0)) to beat Dropdown's (0,2,1) generic button rule regardless of import order.
Never name a new row element `.button` verbatim. **Verify the compiled selector with
`npx sass --style=expanded <file>`** — this codebase has a dedicated regression test for exactly
this (`FilterFacetGroup`'s own `__tests__/facetGroupBadgeStyles.test.ts` asserts against compiled
CSS, not source nesting); the planner should add an equivalent compiled-CSS assertion for the new
stylesheet rather than trusting nesting.

**Disclosure scroll region — copy from `Dropdown/index.scss:8-14`:**
```scss
.dropdown.expanded {
  max-height: 50vh;
  overflow-y: auto;
  box-shadow: inset 0 0 0 1px var(--divider);
}
```
Per D-06 this is what governs the **50vh/420px outer browse region only** — do NOT add a nested
per-category 240px inner scroll on top of it (that's the UI-SPEC's Layout section, explicitly
overridden by D-06).

**`.NavShell__tier2Portal` scoping — do NOT literally reuse or de-scope.** `FilterFacetGroup`'s
entire stylesheet is wrapped in `.NavShell__tier2Portal { ... }` (line 37). D-05 requires the new
group be built under its **own** scope (e.g. `.winetricksDialog .WinetricksBrowse__group`), never
by widening `FilterFacetGroup/index.scss`'s selector — this codebase has already paid for
cross-context CSS leaks twice (`Dropdown` styling panel contents; the 34.10 unscoped
`.MuiTabs-root` incident, referenced directly in this file's own header comment).

**`--status-*` vs `--success`/`--danger` (RESEARCH Pitfall 5):** for the Errored/Needs-GUI/
Installed row states' text/icon colour, use the theme-adaptive aliases, never the raw tokens:
```scss
// WRONG — measured 2.27:1 on nord-light, a WCAG failure
color: var(--status-danger);
// RIGHT — resolves correctly per-theme
color: var(--danger);
```

---

### `WinetricksBrowse/Row/index.tsx` (component, event-driven) — exact analog, D-19 port

**Analog:** `WinetricksSearch/index.tsx` lines 79-104 (full pattern, already captured above under
"Established Patterns"). Reproduced here as the concrete excerpt to copy:

```tsx
// Source: WinetricksSearch/index.tsx:79 + :85-99 (suppressNextClick + button handlers)
const suppressNextClick = useRef(false)

<button
  className="button"
  onMouseDown={(e) => {
    e.preventDefault()
    suppressNextClick.current = true
    install(c.verb)
  }}
  onClick={() => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false
      return
    }
    install(c.verb)
  }}
>
  {t('winetricks.install', 'Install')}
</button>
```
Port to every clickable action in the new Row: Install, Retry (Errored state), Open GUI
(Needs-GUI state) — the mousedown/mouseup target-drift mechanism this guards against is general,
not specific to the original remount bug (UI-SPEC Interaction Contract §5: "worth keeping...
because it is free and correct" even after C-1 closes the original remount path).

**aria-label pattern (UI-SPEC CTA note, no existing analog for the specific resolved-label
construction — straightforward, not flagged as a gap):** the visible label stays the bare verb
("Install"/"Retry") but the accessible name must resolve the row's own title, e.g.
`aria-label={t('winetricksBrowse.installAriaLabel', 'Install {{title}}', { title: row.title })}` —
this is new copy the localisation task must account for if the planner adds it as its own key (not
counted in D-09's 11, worth flagging as a possible 12th if implemented as a distinct string rather
than composed client-side).

---

### `WinetricksBrowse/Row/deriveRowState.ts` (utility, transform) — **Gap 2, no full analog**

**What exists (partial only):** `ProgressDialog/index.tsx` lines 68-91 (full excerpt):
```tsx
// Source: src/frontend/components/UI/ProgressDialog/index.tsx:68-91
<div className="progressDialog log-box" ref={logRef}>
  {props.progress.map((line, key) => {
    if (line.toLowerCase().includes(' err')) {
      return <p key={key} className="progressDialog log-error">{line}</p>
    } else if (line.toLowerCase().includes(' warn')) {
      return <p key={key} className="progressDialog log-warning">{line}</p>
    } else {
      return <p key={key} className="progressDialog log-info">{line}</p>
    }
  })}
```
**This is NOT a per-row analog.** It classifies individual lines in one flat, ever-accumulating
`logs` array (shared across ALL installs, keyed by array index only) for CSS styling purposes. It
never attributes a line to the specific verb/row that produced it. `onWinetricksProgress`'s
payload (`Winetricks/index.tsx:105-118`) does carry `payload.installingComponent`, which is the
correlation key this new derivation function must use — but no existing code in this repo builds
a `Record<verb, RowStatus>` from it. **State plainly: this has no existing analog.** RESEARCH.md
Assumption A3 / Pitfall 2 already flags this as a genuine new-design task, not a reuse — the
planner should scope it as its own task with its own unit tests, taking the log array + current
`installingComponent` + install history and returning a per-verb status map, rather than folding
it silently into "port the ProgressDialog heuristic."

---

### Test files — exact analog, hand-rolled no-DOM harness (mandatory template)

**Analog:** `WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx` (full file read, 344
lines). **This repo's Frontend jest project has `testEnvironment: 'node'` — no jsdom, no RTL.**
Every new test file under `WinetricksBrowse/__tests__/` must copy this harness shape, not attempt
`render()`/`fireEvent`/`screen.getByRole`.

**The `react` module mock (state-slot arrays, cursor-based hook emulation)** — lines 50-118, copy
verbatim as the harness skeleton:
```tsx
jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let stateSlots: unknown[] = []
  let stateCursor = 0
  let effectDeps: (unknown[] | undefined)[] = []
  let effectCleanups: (void | (() => void))[] = []
  let effectCursor = 0
  let refSlots: { current: unknown }[] = []
  let refCursor = 0
  // ... useState/useEffect/useRef reimplementations, __beginRender, __resetMount
})
```

**`mount()`/`reinvoke()` helpers** — lines 127-146:
```tsx
function mount(props: Props): ReactElement {
  harness().__resetMount()
  harness().__beginRender()
  return WinetricksSearchBar(props) as unknown as ReactElement
}
function reinvoke(props: Props): ReactElement {
  harness().__beginRender()
  return WinetricksSearchBar(props) as unknown as ReactElement
}
```
For the ported test, retarget these two calls at the new Row (or WinetricksBrowse) component
function directly — the whole technique is invoking the component as a plain function, never
through a render tree.

**`walk()` element-graph traversal** — lines 153-163:
```tsx
function walk(node: unknown, visit: (el: ElementLike) => void): void {
  if (Array.isArray(node)) { node.forEach((child) => walk(child, visit)); return }
  if (!node || typeof node !== 'object') return
  const el = node as ElementLike
  if (!('props' in el) || !el.props) return
  visit(el)
  walk(el.props.children, visit)
}
```
Used to find elements by `props.className`/`type` since there is no real DOM to query
(`findInstallButton`, lines 165-178, is the concrete usage example).

**`react-i18next` mock** — lines 33-37 (copy for every new test file):
```tsx
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))
```

**For `remountSafety.test.tsx` (D-18's revert-to-red proof):** this needs a *new* driving pattern
not present verbatim in the analog — driving `Winetricks/index.tsx`'s own gate state through both
an install-start and install-completion transition and asserting the same row-node identity
survives. The analog file only exercises `WinetricksSearchBar` in isolation; the planner must
extend the harness to mount `Winetricks/index.tsx` (or `WinetricksBrowse` wired to the same gate
booleans) across `mount()` → `reinvoke()` calls simulating `onInstallingChange('')` firing, and
assert e.g. a stable row key/reference rather than a fresh element on each call. **D-18 explicitly
requires reverting the fix and confirming the test goes red** — no existing test in this repo
does a revert-and-confirm-red step as part of its own assertions; that is a manual verification
step for the plan/executor to perform and record, not something the test file itself encodes.

---

### `src/backend/tools/__tests__/winetricksListParse.test.ts` (test, batch) — extend in place

**Analog: itself.** Existing fixture style (verified, first two cases shown):
```ts
// Source: src/backend/tools/__tests__/winetricksListParse.test.ts:15-29
it('parses the plain printf shape (no publisher/year)', () => {
  const chunks = [
    '===== dlls =====\n' +
      'vcrun2019              Visual C++ 2019 Libraries [downloadable,cached]\n'
  ]
  const result = parseWinetricksListAll(chunks)
  expect(result).toEqual([
    { verb: 'vcrun2019', title: 'Visual C++ 2019 Libraries', category: 'dlls', cached: true }
  ])
})
```
D-03 needs a realistic multi-category chunk covering all 8 curated verbs (`vcrun2019`,
`vcrun2013`, `vcrun2010`, `dotnet48`, `d3dx9`, `xact`, `corefonts`, `physx`) so a new assertion
can confirm every curated verb resolves against the parser output — extend this file's fixture
set with one additional multi-line, multi-category `chunks` array rather than adding a parallel
fixture file (existing fixtures are minimal single-line synthetic cases; this is a structural
gap, not a defect — RESEARCH Open Question 4).

`WinetricksComponent` type (`src/common/types.ts:826-831`, confirmed):
```ts
export interface WinetricksComponent {
  verb: string
  title: string
  category: string
  cached: boolean
}
```

---

### Locale catalogs — `gamelib.json` (49 dirs) and `translation.json` (47 dirs)

**`gamelib.json` — analog is the existing sibling `winetricks` key in the SAME file** (verified,
`public/locales/en/gamelib.json:386-389`):
```json
"winetricks": {
    "unavailable": "Winetricks component management is unavailable on this build",
    "unavailableDetail": "Winetricks support is deferred to a future release (D-03, Phase 34.6) and cannot be listed or installed from this build."
}
```
This confirms the exact ambiguity CONTEXT.md/UI-SPEC describe: `winetricks` already exists in
`gamelib.json` with build-availability copy, and separately in `translation.json` (below) with
unrelated panel copy. The new key is a **sibling top-level key** `winetricksBrowse`, not nested
under either existing `winetricks` block — added at the same top level as this existing block, in
all 49 `gamelib.json` files.

**11 keys per D-09** (UI-SPEC's 16 minus the 5 `category.*` keys): `curatedGroup`, `cachedTag`,
`installedTag`, `needsGuiTag`, `installingRow`, `installFailedTag`, `retry`, `emptyHeading`,
`emptyBody`, `zeroResultHeading`, `clearSearch` = 11 × 49 = 539 strings (not 528 — D-09's own
"11 × 48 = 528" arithmetic undercounts by one locale; `en` also needs the 11 keys written, so the
correct total is 49 locales × 11 keys = **539**, and the non-English fill is 48 × 11 = 528. Confirm
which figure the planner's task tracking means before treating "528" as the total population.)

**`translation.json` key removal — analog: the block itself** (verified,
`public/locales/en/translation.json:1410-1420`, full 9-key block, not 8 as D-20 states):
```json
"winetricks": {
    "install": "Install",
    "installed": "Installed components:",
    "installing": "Installation in progress: {{component}}",
    "loading": "Loading",
    "loading-available": "Loading available components ...",
    "no-components": "No available components",
    "nothingYet": "Nothing was installed by Winetricks yet",
    "openGUI": "Open Winetricks GUI",
    "search": "Search fonts or components"
}
```
D-20's removal list (`search`, `no-components`, `installed`, `nothingYet`, `installing`) omits
the 9th key, `loading` — RESEARCH Pitfall 1 confirms via grep that its only consumer is the
retired `installedWrapper` block. The planner should explicitly add it as a 6th removal (or
document why not) rather than ship an orphaned key with zero consumers.

**Verified population fact (this session, corrects/narrows RESEARCH Assumption A1):** the
`removing-a-locale-key-has-three-traps` memory's last-key-in-object trailing-comma trap was
measured for a *different* key (`accessibility.disable_smooth_scrolling`) in `da`/`id`/`nl`. A
direct check of all 47 `translation.json` dirs run this session (`python3 -c "..."` over
`public/locales/*/translation.json`) found:
- **0 of 47** locale dirs are missing the `winetricks` key.
- **0 of 47** locale dirs have `winetricks` as the LAST key in their top-level object.

So the specific trailing-comma trap that hit the prior removal **does not recur for this key** —
every `translation.json` has at least one key after `winetricks`. This narrows RESEARCH's A1 risk
to effectively closed for this population, though the general detection method (structural
last-key check, not a hardcoded locale list) is still the right implementation regardless, per
RESEARCH's own "how to avoid" guidance.

**Pre-flight validator to reuse** — `meta/machineFillGamelib.ts:285` (verified signature):
```ts
export function validateTranslation(
  source: string,
  target: string,
  glossary: string[]
): string[]
```
Returns human-readable problems (never throws); checks bidirectional placeholder parity and
glossary-term survival. D-10 requires running this (or its equivalent) before writing any
hand-filled locale value — reuse this function directly rather than re-deriving the checks.

**Never round-trip through a JSON serialiser** — `public/locales/` is `.prettierignore`'d; a
`json.load`/`json.dump` cycle reformats all 47-49 files and buries the real diff. Edit lines in
place (regex/string-splice on the raw text) and re-parse only as a verification step.

---

## Shared Patterns

### Token-survival fallback chains
**Source:** `FilterFacetGroup/index.scss` header comment + lines 43-46
**Apply to:** every colour/border custom-property consumption in
`WinetricksBrowse/index.scss` and `Row/index.tsx`'s inline classes. Never consume `var(--token)`
bare without a chain ending in a token that resolves in all 11 theme blocks.

### Mousedown-capture + suppressNextClick
**Source:** `WinetricksSearch/index.tsx:79-104`
**Apply to:** every clickable action in the new Row component (Install, Retry, Open GUI).

### No-DOM hand-rolled hook harness
**Source:** `WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx:50-163`
**Apply to:** every new test file under `WinetricksBrowse/__tests__/`. This is not optional or a
convenience — RTL/jsdom is structurally unavailable in this jest project (`testEnvironment:
'node'`).

### Real `<button aria-expanded>` disclosure, never `<div onClick>`
**Source:** `Dropdown/index.tsx:47-53` (`aria-expanded={isExpanded}` on a real `<button>`)
**Apply to:** every category-group header in the new component — this codebase has already paid
for the `<li onClick>` version of this mistake once (documented in `SearchBar/index.tsx`'s own
comment history, lines 99-155).

### CSS specificity out-specification for anything nested in a `Dropdown`
**Source:** `FilterFacetGroup/index.scss:190-211` (the `260815-mk1` fix pattern)
**Apply to:** every row/button rule in `WinetricksBrowse/index.scss` — reach (0,3,0)+ specificity
via an extra ancestor/self class, verify against compiled CSS, never trust nesting alone.

### `--success`/`--danger`/`--warning` aliases, never raw `--status-*`
**Source:** UI-SPEC Color section + RESEARCH Pitfall 5 (measured 2.27:1 contrast failure)
**Apply to:** Errored (danger), Installed (success) row-state text/icon colour in
`Row/index.tsx`'s styling.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `WinetricksBrowse/curatedVerbs.ts` | config | batch | Hand-maintained, data-independent exported constant (D-01/D-02) — no prior feature in this repo ships a curated/hand-picked subset of a larger data-derived list as a static export. Structurally trivial (a `const … as const` array), so absence of an analog is low-risk; RESEARCH.md's own Code Examples section already sketches the shape. |
| `WinetricksBrowse/Row/deriveRowState.ts` (the Errored-state, per-verb attribution half specifically) | utility | transform | Confirmed no existing code in this repo correlates `onWinetricksProgress`'s per-event `installingComponent` with the `ProgressDialog` log-line error heuristic into a per-verb status map. `ProgressDialog`'s heuristic (analog, partial) operates on an undifferentiated flat log with no per-verb attribution — forcing it as "the" analog would be misleading; RESEARCH Pitfall 2 / Assumption A3 already flags this as a genuine new-design task requiring its own plan task and its own unit tests. |

## Metadata

**Analog search scope:** `src/frontend/components/UI/Winetricks/`,
`src/frontend/components/UI/NavShell/components/{FilterFacetGroup,FilterStoreFacet}/`,
`src/frontend/components/UI/{Dropdown,SearchBar,ProgressDialog}/`, `src/common/types.ts`,
`src/backend/tools/winetricksListParse.ts` + its test, `public/locales/en/{gamelib,translation}.json`,
`public/locales/{da,id,nl}/translation.json` (spot-check) + a full 47-dir population check,
`meta/machineFillGamelib.ts`.
**Files scanned (full reads):** 11. **Files scanned (targeted/grep):** 6.
**Pattern extraction date:** 2026-09-16

## PATTERN MAPPING COMPLETE

**Phase:** 44 - In-app Winetricks browse UI replacing the search-only panel
**Files classified:** 14
**Analogs found:** 12 / 14

### Coverage
- Files with exact analog: 8
- Files with role-match/composite analog: 4
- Files with no analog (called out explicitly, not forced): 2

### Key Patterns Identified
- All disclosure/collapsible UI in this codebase builds on `Dropdown` + copies
  `FilterFacetGroup`'s CR-01/CR-03 token-survival chains and (0,3,0)-specificity CSS fix — never
  literally shares the scoped stylesheet across unrelated panels.
- Every clickable row action in a list that can be remounted mid-gesture uses the
  mousedown-capture + `suppressNextClick` pattern from `WinetricksSearch/index.tsx`.
- This jest project has no DOM (`testEnvironment: 'node'`) — all component tests must copy the
  hand-rolled `react` hook-mock + `walk()` element-graph harness from
  `winetricksInstallMouseRace.test.tsx`; RTL-style tests are structurally inapplicable.
- Locale-catalog edits (`gamelib.json` additions, `translation.json` removals) follow the `t13`/
  `260908-iq8` precedent: pre-flight-validate with `machineFillGamelib.ts`'s `validateTranslation`,
  edit JSON text in place (never round-trip through a serialiser — the directory is
  `.prettierignore`'d), and verify the removal population directly rather than assuming a prior
  removal's locale set (this session's direct check found 0/47 `translation.json` dirs have
  `winetricks` as a last-key trailing-comma risk, narrowing but not eliminating RESEARCH's A1).
- Two files have no real analog and should not be forced into one: the hand-maintained curated-verb
  constant (trivial, low risk) and the per-verb Errored-state derivation (non-trivial, needs its
  own designed task per RESEARCH Pitfall 2).

### File Created
`.planning/phases/44-in-app-winetricks-browse-ui-replacing-the-search-only-panel/44-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns and concrete excerpts above
directly in PLAN.md task actions.
