# Phase 43: Humble Keys screen — unified list — Pattern Map

**Mapped:** 2026-09-09
**Files analyzed:** 10 created/modified, 6 deleted, 3 gate/config edits
**Analogs found:** 10/10 modified-or-new files have a verified in-repo analog; the 6 deletions
are mapped by **import edge**, not by analog (see "Deletion Edge Map" — that is the correct
artifact for a deletion, per this task's scope notes).

This is a restructure of an existing screen. Per scope note 4, this document does not re-derive
what `43-CONTEXT.md`'s `<code_context>` block and `43-UI-SPEC.md`'s Component Inventory already
establish (SearchBar/SelectField/ToggleSwitch/UrgencyBadge/keyTypePresentation reuse) — it cites
those and adds the concrete excerpt + analog each cite is missing, plus the import-edge map for
the deletions that neither of those two documents worked out precisely.

## File Classification

| New/Modified/Deleted File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/frontend/screens/Humble/Keys/index.tsx` | screen/container component | request-response (filter+sort+render, replaces tab-router shell) | itself (pre-restructure) + `Waiting/index.tsx`'s annotation-lifecycle block (being merged in) | exact — same file, structural rewrite |
| `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` | component | request-response (props → render) | itself (pre-restructure, flex→grid) | exact — same file being edited |
| `src/frontend/screens/Humble/Keys/index.css` | stylesheet | transform (layout) | itself, `.humbleKeyRow` block | exact — same file, `display:flex`→`display:grid` |
| `src/common/humble/genericKeyPlatform.ts` (**new**) | utility (pure constant, leaf module) | transform | `src/common/humble/urgencyBadge.ts` / `expirationDisplay.ts` (single-purpose common/humble leaf modules) | exact — same tier, same directory, same one-export shape |
| Search predicate (new — file TBD, planner's discretion per RESEARCH Open Q2) | utility (pure predicate) | transform | `src/common/humble/viewFilters.ts`'s `WAITING_STATES`/`compareWaiting` | exact — same tier, same convention |
| `src/common/humble/viewFilters.ts` | utility (pure predicate/comparator) | transform | itself (import repoint + function removal) | exact |
| `src/common/humble/keyTypePresentation.ts` | utility (pure lookup table) | transform | itself (import repoint only, one line) | exact |
| `src/frontend/App.tsx` (route config) | route | request-response (router config) | itself, line 269's existing `<Navigate to="waiting" replace />` | exact — same file, same pattern, extended |
| `meta/i18nGateScope.json` | config | batch (static scope list) | itself, lines 94-98 | exact — same file, four lines removed |
| `HumbleKeyRow/__tests__/index.test.tsx` | test | transform (function-call component test) | itself — extend existing helpers | exact — same file |
| `src/backend/humble/__tests__/viewFilters.test.ts` | test | transform (pure-function unit test) | itself — extend/prune existing `describe` blocks | exact — same file |
| **DELETED:** `src/common/humble/groupKeys.ts` + `src/backend/humble/__tests__/groupKeys.test.ts` | utility + test | transform | — | n/a, see Deletion Edge Map |
| **DELETED:** `src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/` (index.tsx, index.css) | component | request-response | — | n/a, see Deletion Edge Map |
| **DELETED:** `src/frontend/screens/Humble/Keys/{Waiting,Spares,All}/index.tsx` (+ `Waiting/__tests__`, `All/__tests__`) | screen/container component | request-response | — | n/a, see Deletion Edge Map |

---

## Pattern Assignments

### `src/frontend/screens/Humble/Keys/index.tsx` (screen container, being rewritten)

**Analog:** itself, pre-restructure (full file read, 231 lines) + the annotation-lifecycle block
being merged in from `Waiting/index.tsx`.

**What survives verbatim** (imports, D-20 guard, sync header) — `index.tsx:1-17, 100-104`:
```typescript
import ContextProvider from 'frontend/state/ContextProvider'
import WarningMessage from 'frontend/components/UI/WarningMessage'
import { humbleLoginPath } from 'frontend/screens/Login'

// D-20: route guard — disconnected user never sees the page rendered while
// disconnected; deep links / back-button bounce to the login route.
if (!humble?.isLoggedIn) {
  return <Navigate to={humbleLoginPath} replace />
}
```
Keep this block exactly. Sync header (title, refresh button, `humbleKeysSyncIndicator`,
`WarningMessage` banner) at `index.tsx:129-194` also survives unchanged — the phase only adds a
search box beside it (Screen Layout Contract item 1) and removes the tab-bar `<nav>` block below
it (`index.tsx:196-227`, including its `keysWaitingCount`/`giftableSparesCount` derivation and its
`selectGiftableSpares`/`selectKeysWaiting` import at `:14-17`, which callers move to filter/sort
logic instead of tab counts — D-43-04 forbids reviving the count itself).

**What gets deleted from this file:** the `<nav className="humbleKeysTabBar">` block
(`:196-225`) and the `<Outlet />` (`:227`) — replaced by the unified list body (search-filtered,
sorted, per-row scenario dispatch) rendered directly where `<Outlet/>` was.

**Annotation lifecycle to merge in (WR-02 pattern)** — copy structurally from
`Waiting/index.tsx:54-162` (component-lifetime `mountedRef` box, `refreshAnnotations()` refetching
on **both** the resolve and reject paths of `humbleGetClaimAnnotations`/`humbleGetOwnershipOverrides`,
keyed off a stable `keySetIdentity` string rather than array reference):
```typescript
// src/frontend/screens/Humble/Keys/Waiting/index.tsx:61, 85-106, 118-125, 159-162
const [mountedRef] = useState({ current: true })

function refreshAnnotations() {
  window.api
    .humbleGetClaimAnnotations()
    .then((map) => {
      if (mountedRef.current) {
        setAnnotations(map)
      }
    })
    .catch(() => {
      // Keep last-known annotations map — advisory only.
    })
  window.api
    .humbleGetOwnershipOverrides()
    .then((map) => {
      if (mountedRef.current) {
        setOverrides(map)
      }
    })
    .catch(() => {
      // Keep last-known overrides map — advisory only.
    })
}

const keySetIdentity = useMemo(
  () =>
    (humble?.keys ?? [])
      .map((k) => `${k.gamekey}:${k.machineName}`)
      .sort()
      .join('|'),
  [humble?.keys]
)

useEffect(() => {
  refreshAnnotations()
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [keySetIdentity])
```
This is CONTEXT.md's own instruction ("merging three tabs into one list means this pattern
implemented once, not copy-pasted a third time") — the concrete lines to copy are the ones above.
Do **not** also pull in `All/index.tsx`'s parallel, simpler mount-only variant
(`All/index.tsx:35-72`) — that version lacks the `keySetIdentity` refetch-on-sync fix
(260823-n5b) that `Waiting/index.tsx`'s comment block explains was a real defect; merging the
weaker of the two variants forward would reintroduce it.

**`openWizard`/`closeWizard` claim-flow dispatch** — copy verbatim from
`Waiting/index.tsx:164-204`, unchanged; it already dispatches through the shared
`showDialogModal`/`HumbleClaimWizard` machinery this phase does not touch.

---

### `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` (component, flex→grid restructure)

**Analog:** itself, pre-restructure (full file read, 457 lines).

**D-22 contract block to rewrite, not retire** (`index.tsx:119-136`) — per D-43-17, replace this
exact comment block's premise ("read-only, N sanctioned exceptions") with a `TYPE`/`GAME`
presentational-only + `KEY`-is-the-only-interactive-column statement, keeping the same
comment-block convention (inline, directly above the export):
```typescript
// D-22: strictly read-only, with FOUR sanctioned exceptions. No click
// handler, no button/link element, no cursor:pointer, no reveal/copy/expand
// affordance beyond that...
export default function HumbleKeyRow({
  humbleKey,
  urgencyTier,
  giftAction,
  claimAction,
  undoOverride,
  settleAction
}: Props) {
```
The five scenario props this phase adds/changes route through this same top-of-function
prop-destructure convention — do not introduce a second prop-handling style partway through the
file.

**Existing derived-locals convention to keep** (`index.tsx:181-192`) — table-driven presentation
resolved once, near other derived locals, consumed by render below:
```typescript
const isSteam = humbleKey.platform === 'steam'

const platformPresentation = getKeyTypePresentation(humbleKey.platform)
const platformDisplay = resolvePlatformDisplay(
  platformPresentation,
  tGamelib('gamelib:humbleKeys.platformOther', 'Other')
)
const PlatformLogo = resolveStoreLogo(platformDisplay.logo)
```
The new `TYPE` column cell is this same three-line block, just relocated into its own grid child
instead of a caption. `resolvePlatformDisplay`/`resolveStoreLogo` (`index.tsx:30-74`) are
**unchanged, reused verbatim** — their `never`-exhaustiveness pattern (`:70-72`) is the established
convention this phase's five-scenario switch must also use, per CONTEXT.md's "Established
Patterns" note.

**`!isUnpicked` no-store-glyph gate — the exact load-bearing line to preserve** (`index.tsx:218`):
```typescript
{!isUnpicked && PlatformLogo && (
  <span
    className="humbleKeyRowStoreLogo"
    role="img"
    aria-label={platformDisplay.name}
  >
    <PlatformLogo />
  </span>
)}
```
This condition must survive the move into the `TYPE` column cell unchanged — it is the exact
thing `HumbleKeyRow/__tests__/index.test.tsx:356-362` (below) pins.

**Existing button-chrome convention to reuse for all five KEY buttons** (`index.tsx:272-283,
286-299, 359-366`) — `className="humbleKeyGiftButton"`, `type="button"`, single `onClick`, no
`disabled` attribute (disabled states render as a caption instead, never a disabled button —
see the `keyindexResolved` branch at `:285-304`). Every new scenario button (Login-and-claim,
Pick-on-Humble) should follow this exact shape rather than inventing a new button chrome class.

**aria-label-as-expression convention** (`index.tsx:222`, `aria-label={platformDisplay.name}`) —
applies to every new `aria-label` this phase adds (UI-SPEC's own note); never a literal string.

---

### `HumbleKeyRow/__tests__/index.test.tsx` (test, function-call component test — no jsdom)

**Analog:** itself (full read of imports/helpers + two representative tests).

**Function-call invocation, no DOM** (`:44, 60-83, 386-389`):
```typescript
import HumbleKeyRow from '../index'
...
function makeHumbleKey(overrides: Partial<HumbleKey> = {}): HumbleKey {
  return {
    gamekey: 'gamekey-1',
    machineName: 'machine-1',
    state: 'UNREVEALED',
    title: 'Some Game',
    platform: 'steam',
    expiration: null,
    origin: 'Humble RPG Bundle',
    ownedElsewhere: false,
    matchConfidence: 'none',
    ...overrides
  }
}
...
it('renders zero button elements when no action props are supplied (D-22)', () => {
  const key = makeHumbleKey({ platform: 'steam' })
  const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement
  const buttons = collectElements(tree).filter((el) => el.type === 'button')
  expect(buttons).toHaveLength(0)
})
```

**Element-graph walker helpers to reuse, not reinvent** (`:91-136`):
```typescript
function collectElements(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child, out))
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    out.push(node)
    if (node.props?.children !== undefined) collectElements(node.props.children, out)
    return out
  }
  return out
}

function findByClassNamePart(tree, part) {
  return collectElements(tree).find((el) => {
    const className = el.props?.className
    return typeof className === 'string' && className.split(' ').includes(part)
  })
}
```
Every new REQ-43-02/03/11/12/13/14/15/19 component test should call these existing helpers
(`collectElements`, `findByClassNamePart`, `textContent`, `firstRowChild`) rather than writing a
second walker — this is the concrete instance of RESEARCH's "no jsdom" pitfall being handled
correctly already.

**The UNPICKED no-glyph pin to extend, not replace** (`:356-362`):
```typescript
it('renders no caption and no store logo at all for an UNPICKED pseudo-entry', () => {
  const key = makeHumbleKey({ state: 'UNPICKED', platform: 'steam' })
  const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

  expect(findByClassNamePart(tree, 'humbleKeyRowCaption')).toBeUndefined()
  expect(findByClassNamePart(tree, 'humbleKeyRowStoreLogo')).toBeUndefined()
})
```
D-43-02 adds a `Pick on Humble` button to the UNPICKED row's `KEY` column — this existing test's
two assertions (no caption class, no store-logo class) still hold under the new grid layout and
must not be weakened; a new assertion for the Pick button's presence is additive, not a
replacement of this one.

**react-i18next mock convention** (`:46-58`) — one mock implementation serves both `t` and
`tGamelib` (ignores the namespace arg), interpolating `{{...}}` into the supplied default string.
Reuse this mock verbatim for any new test in this file; do not add a second, differently-shaped
i18n mock.

---

### `src/common/humble/genericKeyPlatform.ts` (new leaf module)

**Analog:** `src/common/humble/urgencyBadge.ts` / `expirationDisplay.ts` — single-purpose,
same-directory sibling modules (cited structurally in `42-PATTERNS.md`'s Shared Patterns section,
still valid here unchanged).

**Constant + comment convention to follow** (`groupKeys.ts:18-19`, the exact code being moved):
```typescript
/** The `key_type`/platform value that routes an entry into the Other group. */
export const GENERIC_KEY_PLATFORM = 'generic'
```
Move this two-line declaration (constant + its doc comment) verbatim into the new file. Update
the comment's "routes an entry into the Other group" clause — D-43-01 retires the Other-group
concept, so the comment must describe the constant's *new* role (identifying the neutral
`{ kind: 'unknown' }` TYPE-column branch) rather than the deleted grouping behaviour it originally
described. This is the one line in the move that is not a pure copy.

**Two verified importers that must be repointed** (landmine 2, independently confirmed by grep —
`grep -rn "GENERIC_KEY_PLATFORM" src/`):
```typescript
// src/common/humble/viewFilters.ts:2
import { GENERIC_KEY_PLATFORM } from './groupKeys'
// src/common/humble/keyTypePresentation.ts:1
import { GENERIC_KEY_PLATFORM } from './groupKeys'
```
Both become `import { GENERIC_KEY_PLATFORM } from './genericKeyPlatform'`. **No other production
importer exists** — the only other hit is `src/backend/humble/__tests__/groupKeys.test.ts`, which
is deleted wholesale along with `groupKeys.ts` (see Deletion Edge Map), so it needs no repoint.

**Module docblock convention** (per `42-PATTERNS.md`'s already-established rule, still binding):
state (1) pure/no-React/no-i18n/no-I/O, (2) "unit-testable from the backend jest project", (3)
name the frontend/common consumer(s) — `viewFilters.ts` and `keyTypePresentation.ts` — the same
three things every sibling in `src/common/humble/` states.

**Test file:** per the established (if easy-to-miss) convention, a new
`src/backend/humble/__tests__/genericKeyPlatform.test.ts` is optional — the constant has no
behavior of its own to unit-test beyond "is the string `'generic'`" (already indirectly covered
by `keyTypePresentation.test.ts`'s unknown-branch assertions, if that file exists — not verified
this session, worth a grep before deciding). If planner adds one, it MUST live under
`src/backend/humble/__tests__/`, never `src/common/humble/__tests__/` — this repo fork was called
out explicitly in `42-PATTERNS.md` and still applies unchanged.

---

### Search predicate (new — location is planner's discretion, RESEARCH Open Question 2)

**Analog:** `src/common/humble/viewFilters.ts`'s existing predicate/comparator shape.

```typescript
// src/common/humble/viewFilters.ts:17-21 (WAITING_STATES) — boolean-set-membership shape
export const WAITING_STATES: Set<HumbleKeyState> = new Set([
  'UNPICKED', 'UNREVEALED', 'REVEALED'
])
// src/common/humble/viewFilters.ts:27-34 (compareWaiting) — pure comparator shape
function compareWaiting(a: HumbleKey, b: HumbleKey): number { ... }
```
D-43-10's predicate ("does `humbleKey.title` case-insensitively include the query") should follow
either the constant-predicate shape (a `matchesSearch(key, query): boolean` function, mirroring
`WAITING_STATES.has(...)`'s call-site shape) or an array-filter helper — RESEARCH already
confirms both satisfy REQ-43-09/REQ-43-21 equally. Whichever shape is chosen, it belongs in
`src/common/humble/` (pure, no React/i18n/I/O) and its test belongs in
`src/backend/humble/__tests__/viewFilters.test.ts` (if added there) or a new sibling test file
under the same `src/backend/humble/__tests__/` directory — never under `src/common/`.

The library-filtering sketch's own matching idiom, cited for the *shape* of the comparison only
(this repo has no such file for Humble keys yet):
```typescript
// cited by 43-UI-SPEC.md's Search & Filter Contract, sketch-findings-gamelib skill reference
q.toLowerCase().includes(...)
```

---

### `src/common/humble/viewFilters.ts` (modified: import repoint + function removal)

**Analog:** itself.

**Import line to change** (`:2`): `from './groupKeys'` → `from './genericKeyPlatform'` (see above).

**`selectKeysWaiting`/`selectGiftableSpares`** (`:59-77`) — RESEARCH's Open Question 1 leaves
their fate to the planner; if kept, keep the exact filter-predicate bodies (they already exclude
`GENERIC_KEY_PLATFORM`/`ownedElsewhere` correctly per D-53) and reuse them as per-row boolean
checks rather than list-membership filters. If deleted, delete their call sites in the same
change (both currently only called from `index.tsx:14-17` and `Waiting/index.tsx:7-9,51`, both of
which are being rewritten/deleted in this same phase anyway).

**`partitionWaitingByUrgency`** (`:91-105`) — RESEARCH's Execution Sequencing Risk point 5:
delete this function in the same task that deletes its sole call site
(`Waiting/index.tsx:47-49`, confirmed by RESEARCH's grep, itself deleted by D-43-18). Do not
leave it as a zero-caller export.

---

### `src/frontend/App.tsx` (route config, D-43-18 redirect collapse)

**Analog:** itself — the file's own existing single-route-redirect precedent, `:269`
(the ONLY `<Navigate to=` in this file, confirmed by grep):
```typescript
// src/frontend/App.tsx:262-280 (current shape, to be collapsed)
{
  path: 'humble-keys',
  lazy: makeLazyFunc(import('./screens/Humble/Keys')),
  children: [
    { index: true, element: <Navigate to="waiting" replace /> },
    { path: 'waiting', lazy: makeLazyFunc(import('./screens/Humble/Keys/Waiting')) },
    { path: 'spares', lazy: makeLazyFunc(import('./screens/Humble/Keys/Spares')) },
    { path: 'all', lazy: makeLazyFunc(import('./screens/Humble/Keys/All')) }
  ]
}
```
Per D-43-18, this becomes one leaf route (`path: 'humble-keys'`, `lazy` pointing at the rewritten
`./screens/Humble/Keys`, no `children`) plus three **redirect** entries reusing this exact
`<Navigate to="..." replace />` idiom, now pointing at the parent instead of a child:
```typescript
{ path: 'humble-keys/waiting', element: <Navigate to="/humble-keys" replace /> },
{ path: 'humble-keys/spares', element: <Navigate to="/humble-keys" replace /> },
{ path: 'humble-keys/all', element: <Navigate to="/humble-keys" replace /> }
```
(Exact placement — top-level siblings vs. nested — depends on this router's actual route-tree
shape around line 250-284, which uses nested `children` arrays; verify whether top-level routes
in this config take a full path like `'humble-keys/waiting'` or must nest. Not fully verified this
session beyond the 250-284 excerpt read.)

---

### `meta/i18nGateScope.json` (config, deletion-scope edit)

**Analog:** itself, confirmed exact line numbers by grep (differs slightly from CONTEXT.md's
approximate "lines 94-102" — exact hits are non-contiguous):
```json
94:    "src/frontend/screens/Humble/Keys/All/index.tsx",
95:    "src/frontend/screens/Humble/Keys/Spares/index.tsx",
96:    "src/frontend/screens/Humble/Keys/Waiting/index.tsx",
98:    "src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/index.tsx",
```
Line 97 (between 96 and 98) is `HumbleClaimWizard/index.tsx` — **not deleted, do not touch that
line**. Remove exactly lines 94, 95, 96, 98 in the same commit as the four file deletions
(landmine 1 / Execution Sequencing Risk point 2). `HumbleKeyRow/index.tsx`, `UrgencyBadge/index.tsx`
and the parent `Keys/index.tsx`/`stateLabels.ts` entries stay — those files survive.

---

## Deletion Edge Map

Per this task's scope notes, the useful "pattern" for a deletion is what currently imports it —
verified by grep, not inferred.

### `src/common/humble/groupKeys.ts` — DELETE (D-43-20)

| Importer | What it imports | Survives phase? | Required action |
|---|---|---|---|
| `src/common/humble/viewFilters.ts:2` | `GENERIC_KEY_PLATFORM` | Yes | Repoint to `./genericKeyPlatform` **before** delete |
| `src/common/humble/keyTypePresentation.ts:1` | `GENERIC_KEY_PLATFORM` | Yes | Repoint to `./genericKeyPlatform` **before** delete |
| `src/frontend/screens/Humble/Keys/All/index.tsx:6` | `GROUP_ORDER, groupAndSortKeys` | No — `All/index.tsx` itself deleted | No repoint needed; whole file goes |
| `src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/index.tsx` | (uses `groupKeys.ts` types/exports — not line-verified this session, file itself deleted) | No | No repoint needed |
| `src/backend/humble/__tests__/groupKeys.test.ts` | `GENERIC_KEY_PLATFORM, GROUP_ORDER, groupAndSortKeys` | No — tests the deleted module | Delete this test file in the same change |

**Verified via `grep -rln "from.*groupKeys" src/`** — exactly these five files, no others.

### `src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/` — DELETE (D-43-20)

| Importer | Survives phase? | Required action |
|---|---|---|
| `src/frontend/screens/Humble/Keys/index.tsx` | Yes (rewritten) | Remove the import; verified this file currently references `HumbleKeyGroup` only in its now-stale docblock comment (`:41-43`), not a live import — re-check at edit time since the comment could be stale evidence, confirm no live `import HumbleKeyGroup` remains in the rewritten file |
| `src/frontend/screens/Humble/Keys/stateLabels.ts` | Yes (kept, D-43-20) | **Comment-only reference** — `stateLabels.ts:4,9` says "used by HumbleKeyGroup ... while HumbleKeyGroup imported the row component". No live import (verified: grep hit is inside the file's own docblock prose, not an `import` statement). Update this comment to describe the new caller (`HumbleKeyRow`'s `KEY` column) instead of the deleted component — a stale doc-comment naming a deleted file is exactly the "dead code misleads the next reader" failure CONTEXT.md warns about, applied to comments rather than code. |
| `src/frontend/screens/Humble/Keys/All/index.tsx` | No | Whole file deleted |
| `src/frontend/screens/Humble/Keys/Spares/index.tsx` | No | Grep hit needs confirming — Spares/index.tsx is being deleted per D-43-18 regardless; not separately verified whether it imports HumbleKeyGroup directly or only transitively |
| `src/frontend/screens/Humble/Keys/Waiting/index.tsx` | No | Whole file deleted |
| `src/frontend/screens/Humble/Keys/All/__tests__/index.test.tsx` | No | Whole file deleted (tests the deleted `All/index.tsx`) |
| `src/common/humble/groupKeys.ts` | No | Being deleted itself (likely the `HumbleKeyGroupId` type re-export or similar — not line-verified) |

**Action item for planner:** `stateLabels.ts`'s doc-comment is the one edge in this map that is
**not** a deletion or an already-planned rewrite — it is a comment on a **surviving** file that
will misdescribe the codebase the moment `HumbleKeyGroup` is deleted, unless updated in the same
change.

### `src/frontend/screens/Humble/Keys/{Waiting,Spares,All}/index.tsx` — DELETE (D-43-18)

Only external importer of each is `src/frontend/App.tsx`'s route config (verified: these three
paths appear nowhere else in a `grep -rn "screens/Humble/Keys/Waiting\|.../Spares\|.../All"`-style
search beyond `App.tsx` and their own `__tests__` siblings). Removing the three `lazy:
makeLazyFunc(import(...))` route entries in `App.tsx` (see App.tsx pattern assignment above) is
therefore the complete repoint — no other file imports these screens directly.

---

## Shared Patterns

### `common/humble/` pure-module conventions (unchanged from Phase 42, still binding)
**Source:** `src/common/humble/viewFilters.ts`, `keyTypePresentation.ts`, `urgencyBadge.ts` (all
independently re-read this session, zero disagreement with `42-PATTERNS.md`'s prior statement of
this rule)
**Apply to:** `genericKeyPlatform.ts`, the new search predicate, any edits to `viewFilters.ts`
- No React, no i18n, no I/O — pure functions/consts only.
- Module/constant carries an inline `D-NN` citation.
- Test file lives under `src/backend/humble/__tests__/`, **never** `src/common/humble/__tests__/`
  (the `src/common` jest project exists but is not where this tier's tests live — a real,
  previously-documented trap, re-confirmed this session).

### D-22-successor "interactivity lives in KEY only" contract (new statement, same convention)
**Source:** `HumbleKeyRow/index.tsx:119-136` (the block being rewritten)
**Apply to:** `HumbleKeyRow/index.tsx`'s new top-of-render comment block
- Keep the inline-comment-directly-above-the-export convention.
- State the invariant as: zero click handlers / buttons / `cursor: pointer` on `TYPE` or `GAME`;
  every interactive affordance lives in the `KEY` column and is one of the five named scenarios.
- Structural tests enforcing this reuse `collectElements`/`findByClassNamePart` (see
  `HumbleKeyRow/__tests__/index.test.tsx` pattern assignment above) — walk the tree, assert zero
  `el.type === 'button'` / no `onClick` prop outside the `KEY` subtree.

### `t`/`tGamelib` dual-namespace i18n binding (unchanged from Phase 42)
**Source:** `HumbleKeyRow/index.tsx:145` (`t`) and its `tGamelib` sibling (declared nearby, not
re-quoted — both call sites already exist in the file being edited)
**Apply to:** every new string in `index.tsx` (screen) and `HumbleKeyRow/index.tsx`
- New/changed strings go through `tGamelib`/`gamelib` namespace into
  `public/locales/en/gamelib.json` — confirmed present at `gamelib.json:77`'s `humbleKeys`
  namespace object per UI-SPEC.
- Never write `translation.json` — `meta/i18nCatalogChurnGuard.ts` throws `UpstreamChurnError` on
  any non-`gamelib.json` path edit.

### `SelectField` + `ToggleSwitch` combined-controls-row usage (new analog this phase needed)
**Source:** `src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx:242-261`
(`SelectField`) and `:294-301` (`ToggleSwitch`) — the one file in the repo confirmed (by grep) to
use both components together, closest available analog for the phase's controls row even though
it is a modal, not a title/controls/header/row screen:
```typescript
<SelectField
  label={`${t('install.wineversion')}:`}
  htmlId="wineVersion"
  value={wineVersion?.name || ''}
  disabled={useSharedPrefix || engineOptions.length === 0}
  onChange={(e) =>
    setWineVersion(engineOptions.find((v) => v.name === e.target.value)!)
  }
>
  {engineOptions.map((version, i) => (
    <MenuItem key={i} value={version.name}>...</MenuItem>
  ))}
</SelectField>
...
<ToggleSwitch
  htmlId="use-shared-wine-config"
  title={t('setting.use-shared-wine-config', 'Use shared Wine prefix')}
  value={useSharedPrefix}
  handleChange={() => setUseSharedPrefix(!useSharedPrefix)}
  description={sharedToggleDescription}
/>
```
Apply this same `htmlId`/`value`/`onChange`/`handleChange` call shape to the sort picker and
`Redeemable keys only` checkbox. **Trap carried forward from UI-SPEC:** `SelectField` needs an
explicit `sx` color override for this screen (the MUI-light-theme-no-`palette` trap) — this
`WineSelector` call site does **not** demonstrate that override (it may render acceptably by
accident in this particular modal context), so do not copy it as evidence the override is
unnecessary; `SelectField/index.tsx:39-45`'s own `sx` block (`MuiSelect-icon`/
`MuiOutlinedInput-notchedOutline`) shows the component's *existing* override surface to extend,
not a finished example of this screen's specific need.

### Zero-result recovery empty state (new analog this phase needed)
**Source:** `src/frontend/screens/Library/components/FilterZeroResult/index.tsx` (full file read)
— the exact "filtered-to-zero, distinct from genuinely-empty" pattern D-43's Claude's Discretion
section and UI-SPEC's Empty States section describe, already shipped once in this repo:
```typescript
// FilterZeroResult/index.tsx — structural shape to mirror
export default function FilterZeroResult() {
  ...
  if (activeFilterCount === 0 && !alphabetFilterLetter) {
    return null // not the genuinely-empty case — that's a different component
  }
  ...
  return (
    <div className="FilterZeroResult">
      <h3 className="FilterZeroResult__heading">{tGamelib('gamelib:library.filterPanel.emptyHeading', 'No games match your filters')}</h3>
      <p className="FilterZeroResult__body">{tGamelib('gamelib:library.filterPanel.emptyBody', 'No games match {{filters}}.', { filters })}</p>
      <button type="button" className="FilterZeroResult__action" onClick={clearAllFilters}>
        {tGamelib('gamelib:library.filterPanel.emptyClearAll', 'Clear all filters')}
      </button>
    </div>
  )
}
```
**Apply to:** the Humble Keys screen's filtered-empty state (UI-SPEC's `humbleKeys.filteredEmpty*`
strings, `humbleKeys.clearFilters` action). Same shape: a heading, a body naming what's active,
and one inline button that clears filters — reuses `.humbleKeysEmptyState`'s existing chrome per
UI-SPEC rather than `FilterZeroResult`'s own CSS class names (UI-SPEC is explicit this screen
reuses its own existing empty-state visual language, not the Library screen's).
**Difference to note:** `FilterZeroResult` computes its body text from active filter
*descriptors* (a multi-facet system this screen does not have — D-43's scope is one search box +
one checkbox). The Humble screen's version does not need `chipLabelSpec`/`joinChipLabels` — its
body copy is a static string (`humbleKeys.filteredEmptyBody`, UI-SPEC line), not composed from
active-filter names. Do not import `FilterChipRow/chipLabels` — that machinery is Library-specific
and out of proportion for a two-control filter.

### `Navigate ... replace` route redirect (new analog this phase needed)
**Source:** `src/frontend/App.tsx:269` — see App.tsx pattern assignment above; the repo's only
existing instance of this idiom, now needed three more times.

---

## No Analog Found

None. Every file in scope (per CONTEXT.md's canonical refs, RESEARCH's architecture map, and
UI-SPEC's Component Inventory) has a verified in-repo analog or, for deletions, a verified
import-edge map above.

## Metadata

**Analog search scope:** `src/frontend/screens/Humble/Keys/**`, `src/common/humble/`,
`src/backend/humble/__tests__/`, `src/frontend/components/UI/{SearchBar,SelectField,ToggleSwitch}`,
`src/frontend/screens/Library/components/{InstallModal/WineSelector,FilterZeroResult}`,
`src/frontend/App.tsx`, `meta/i18nGateScope.json`
**Files read in full or by targeted grep+range this session:** `43-CONTEXT.md`, `43-RESEARCH.md`,
`43-UI-SPEC.md`, `42-PATTERNS.md`, `Humble/Keys/index.tsx`, `HumbleKeyRow/index.tsx` (full, 457
lines), `HumbleKeyRow/__tests__/index.test.tsx` (targeted ranges), `Waiting/index.tsx` (full, 287
lines), `All/index.tsx` (full, 135 lines), `viewFilters.ts` (full, 106 lines), `groupKeys.ts`
(full, 75 lines), `keyTypePresentation.ts` (full, 158 lines), `index.css` (targeted range
180-340+), `stateLabels.ts` (grep), `SearchBar/index.tsx`, `SelectField/index.tsx`,
`ToggleSwitch/index.tsx`, `WineSelector/index.tsx` (targeted), `FilterZeroResult/index.tsx`
(full), `LibrarySearchBar/index.tsx` (full), `DiscountFilters/index.tsx` (targeted, rejected as
weaker analog than WineSelector — uses raw MUI, not GameLib's SelectField/ToggleSwitch wrappers),
`App.tsx` (targeted, lines 250-290), `meta/i18nGateScope.json` (targeted, lines 85-110)
**Verified by direct grep, not inferred:** `GENERIC_KEY_PLATFORM` importers (2 production + 1
test), `groupKeys.ts` importers (5 total), `HumbleKeyGroup` importers (7 total, one of which —
`stateLabels.ts` — is comment-only, not a live import), `i18nGateScope.json`'s exact line numbers
for the four deleted-file entries, the single existing `<Navigate to=` idiom in `App.tsx`
**Pattern extraction date:** 2026-09-09
