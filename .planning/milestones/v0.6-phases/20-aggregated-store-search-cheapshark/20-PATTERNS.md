# Phase 20: Aggregated Store Search (CheapShark) - Pattern Map

**Mapped:** 2026-07-14
**Files analyzed:** 13 new + 3 modified
**Analogs found:** 16 / 16

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/backend/storeSearch/cheapshark.ts` | service (HTTP adapter) | request-response | `src/backend/discounts/index.ts` (fetch/build-URL section) | exact |
| `src/backend/storeSearch/index.ts` | controller (IPC handler registration) | request-response | `src/backend/discounts/index.ts` (`addHandler` block) | exact |
| `src/backend/humble/dedup.ts` | utility (pure matcher) | transform | itself — MODIFY: re-import primitives from new common module | exact (self) |
| `src/backend/humble/constants.ts` | config (constant) | — | itself — MODIFY or leave; re-export `HUMBLE_FUZZY_MATCH_THRESHOLD` | exact (self) |
| `src/common/matching/titleMatch.ts` | utility (pure matcher, NEW module) | transform | `src/backend/humble/dedup.ts` (lines 1-114, function bodies only) | exact (lift) |
| `src/common/discounts/badges.ts` | utility (pure resolver, EXTEND) | transform | itself — add `resolveStoreSearchBadges()` beside `resolveDiscountBadge()` | exact (self) |
| `src/common/types/storeSearch.ts` | model (type definitions) | — | `src/common/types/discounts.ts` | exact |
| `src/common/types/ipc.ts` | model (IPC contract, MODIFY) | — | itself — add `searchStores`/`getStoreSearchDeals`/`getStoreSearchStoreMap` beside `getGogDiscounts` (line 486) | exact (self) |
| `src/preload/api/storeSearch.ts` | provider (IPC bridge) | request-response | `src/preload/api/helpers.ts` line 43 (`getGogDiscounts`) | exact |
| `src/frontend/screens/StoreSearch/index.tsx` | component (container) | request-response + debounce | `src/frontend/screens/Discounts/index.tsx` | role-match (list→row layout differs) |
| `src/frontend/screens/StoreSearch/index.css` | config (styles) | — | `src/frontend/screens/Discounts/index.css` | exact |
| `src/frontend/screens/StoreSearch/components/StoreSearchRow/index.tsx` | component (row/card) | request-response | `src/frontend/screens/Discounts/components/DiscountCard/index.tsx` | role-match (card→row layout differs) |
| `src/frontend/screens/StoreSearch/components/StoreSearchBreakdown/index.tsx` | component (lazy expand panel) | request-response | no exact analog — informed by `DiscountFilters` toggle/expand chevron pattern + UI-SPEC | partial (no analog) |
| `src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts` (or inline in container, planner's call) | hook | event-driven (debounce/cancel) | no codebase precedent — synthesized from `backend/humble/library.ts`'s generation-counter idiom | no analog |
| `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` | component (MODIFY — add sibling entry) | — | itself, lines 198-203 (`/discounts` entry) | exact (self) |
| `src/frontend/App.tsx` | route (MODIFY — register `/store-search`) | — | itself, lines 159-162 (`discounts` route) | exact (self) |
| `src/backend/discounts/__tests__/badges.test.ts` (or sibling `storeSearchBadges.test.ts`) | test | — | itself — extend, or add sibling using same fixture-builder pattern | exact (self) |
| `src/backend/storeSearch/__tests__/cheapshark.test.ts` | test | — | no existing `backend/discounts/__tests__` HTTP-mock test exists yet — informed by `dedup.test.ts`'s pure-function assertion style | no analog (new territory) |

## Pattern Assignments

### `src/backend/storeSearch/cheapshark.ts` (service, request-response)

**Analog:** `src/backend/discounts/index.ts`

**Imports pattern** (lines 1-9):
```typescript
import axios from 'axios'
import { app } from 'electron'
import { addHandler } from 'backend/ipc'
import { logError, logInfo, LogPrefix, logWarning } from 'backend/logger'
import { GOGUser } from 'backend/storeManagers/gog/user'
import type {
  CatalogLocaleSettings,
  CatalogProduct
} from 'common/types/discounts'
```
For CheapShark, drop the `GOGUser`/token imports (CheapShark is keyless) and import the new
`common/types/storeSearch.ts` shapes instead.

**URL-building pattern — use `axios`'s `params` object, never manual concatenation** (lines 32-58,
adapted per RESEARCH's Security Domain V5 note — `URLSearchParams`/`params` auto-encodes the
*query*, but the CheapShark `dealID`/redirect URL must NOT be run through this same encoder, see
Pitfall 1 in RESEARCH.md):
```typescript
const buildUrl = (
  page: number,
  locale: CatalogLocaleSettings,
  hideOwned: boolean,
  wishlistOnly: boolean
) => {
  const params = new URLSearchParams({
    limit: String(PAGE_LIMIT),
    order: 'desc:trending',
    discounted: 'eq:true',
    productType: 'in:game,pack,dlc',
    page: String(page),
    countryCode: locale.countryCode,
    locale: locale.locale,
    currencyCode: locale.currencyCode
  })
  if (hideOwned) {
    params.append('hideOwned', 'true')
  }
  return `${CATALOG_URL}?${params.toString()}`
}
```
CheapShark equivalent: `axios.get(CHEAPSHARK_GAMES_URL, { params: { title: query, limit: 60 } })`
— use the `params` option, never string-concat the query into the URL (RESEARCH Security Domain).
The one exception is the **redirect URL** (`https://www.cheapshark.com/redirect?dealID=${dealId}`)
— that MUST be a raw template literal with `dealID` interpolated verbatim, never passed through
`URLSearchParams`/`encodeURIComponent` (RESEARCH Pitfall 1 — double-encoding 404s).

**Fetch + timeout pattern** (lines 60-83):
```typescript
const fetchPage = async (
  page: number,
  locale: CatalogLocaleSettings,
  hideOwned: boolean,
  wishlistOnly: boolean,
  token: string | undefined
) => {
  const headers: Record<string, string> = {
    'User-Agent': `HeroicGamesLauncher/${app.getVersion()}`
  }
  const { data } = await axios.get<CatalogResponse>(
    buildUrl(page, locale, hideOwned, wishlistOnly),
    { timeout: 15000, headers }
  )
  return data
}
```
CheapShark adapter: same `timeout: 15000` + `User-Agent` header convention; no `Authorization`
header needed (keyless API).

**Error handling — throw, don't swallow** (`addHandler` block, lines 121-169):
```typescript
addHandler(
  'getGogDiscounts',
  async (_event, locale, hideOwned = false, wishlistOnly = false) => {
    try {
      const products = await fetchAllDiscounts(locale, hideOwned, wishlistOnly, token)
      return products
    } catch (err) {
      logError(
        `Failed to fetch GOG discounts: ${String(err)}`,
        LogPrefix.Backend
      )
      throw err
    }
  }
)
```
Phase 20 MUST throw (not swallow) on adapter failure — the frontend container converts the
rejected promise into the "provider failed" retryable state (D-14), mirroring
`Discounts/index.tsx`'s `try {...} catch (err) { setError(...) }` (see below).

---

### `src/backend/storeSearch/index.ts` (controller, request-response)

**Analog:** `src/backend/discounts/index.ts` (whole file is the `addHandler` registration
pattern — one backend module per store-data screen).

Register three channels here (or split `cheapshark.ts` = adapter, `index.ts` = `addHandler`
wiring only, mirroring the researched project structure):
```typescript
addHandler('searchStores', async (_event, query) => { /* cheapshark title search */ })
addHandler('getStoreSearchDeals', async (_event, gameId) => { /* per-game breakdown */ })
addHandler('getStoreSearchStoreMap', async () => { /* /stores lookup, cached in-memory */ })
```
Same throw-on-failure contract as above. `getStoreSearchStoreMap` should memoize the result for
the app session (RESEARCH: "fetch once backend-side... cached in-memory") — no existing codebase
precedent for an in-memory session cache was found; keep it a simple module-level variable, not a
new `electron-store` schema entry (RESEARCH explicitly rejects persisted-cache alternative).

---

### `src/common/matching/titleMatch.ts` (utility, transform — NEW module, lifted)

**Analog:** `src/backend/humble/dedup.ts` lines 1-114 (function bodies only — NOT
`recomputeOwnership`, which stays Humble-specific per RESEARCH Pitfall 4).

**Lift verbatim** (all pure, zero I/O, zero Humble-specific types — confirmed by direct read):
```typescript
// From src/backend/humble/dedup.ts, lines 66-114
export function normalizeTitle(title: string): string { /* ... */ }
export function titleSimilarity(a: string, b: string): number { /* ... */ }
export function isDlcFalsePositiveRisk(a: string, b: string): boolean { /* ... */ }
export function fuzzyMatch(humbleTitle: string, steamTitle: string): boolean { /* ... */ }
```
Plus the constants `EDITION_SUFFIXES`/`DLC_KEYWORDS` (lines 30-55) and
`HUMBLE_FUZZY_MATCH_THRESHOLD` re-exported from `backend/humble/constants.ts` line 57
(`export const HUMBLE_FUZZY_MATCH_THRESHOLD = 0.85`) — D-02 requires the SAME constant, not a
copy; import it into the new common module, don't hardcode `0.85` a second time.

**Do NOT lift:** `recomputeOwnership()` (lines 134-173 of `dedup.ts`) — it takes `HumbleKey[]` and
has D-42 override-predicate semantics that are genuinely Humble-specific. `backend/humble/dedup.ts`
is then MODIFIED to import the four functions from the new common module instead of defining them
locally, keeping `recomputeOwnership` in place.

**Warning sign to self-check:** if the new `common/matching/titleMatch.ts` file ends up importing
`HumbleKey` or `GameInfo`, that's a leak — the module's signatures must stay `string`/`boolean`
only (RESEARCH Pitfall 4).

---

### `src/common/discounts/badges.ts` (utility, transform — EXTEND, never fork)

**Analog:** itself — `resolveDiscountBadge()` (lines 35-56) and `buildDiscountBadgeMaps()`
(lines 77-105) stay byte-for-byte unchanged; add a new sibling export.

**Existing exact-match precedent to follow structurally** (lines 35-56):
```typescript
export function resolveDiscountBadge(
  product: { title: string },
  titleToAppId: Map<string, string>,
  ownedAppIds: Set<string>,
  keysWaiting: HumbleKey[]
): DiscountBadge {
  const appId = titleToAppId.get(normalize(product.title))
  if (appId === undefined) {
    return null
  }
  if (ownedAppIds.has(appId)) {
    return 'owned'
  }
  const hasWaitingKey = keysWaiting.some(
    (k) =>
      k.steamAppId !== undefined &&
      k.steamAppId !== '' &&
      k.steamAppId !== '0' &&
      k.steamAppId === appId
  )
  return hasWaitingKey ? 'key-available' : null
}
```
Note the falsy-guard idiom (`!== undefined && !== '' && !== '0'`) — reuse this exact three-way
guard anywhere a `steamAppId` string is compared in the new resolver (both dedup.ts's
`recomputeOwnership` and this file use it identically; it is the project's established
`steamAppId`-usability check).

**New export — add beside it** (RESEARCH's Pattern 2 sketch, already vetted against D-01/D-04/
D-06/D-07 — treat as the target shape, not just informational):
```typescript
import { fuzzyMatch } from '../matching/titleMatch'

export interface StoreOwnershipMatch {
  store: 'steam' | 'gog' | 'legendary' | 'nile'
  confidence: 'exact' | 'fuzzy'
}

export function resolveStoreSearchBadges(
  result: { title: string; steamAppId?: string },
  libraries: {
    steam: { app_name: string }[]
    gog: { title: string }[]
    epic: { title: string }[]
    amazon: { title: string }[]
  },
  keysWaiting: HumbleKey[]
): { owned: StoreOwnershipMatch[]; keyAvailable: boolean } {
  const owned: StoreOwnershipMatch[] = []
  // D-01: Steam is EXACT ID join only — never fuzzy.
  if (result.steamAppId && libraries.steam.some((g) => g.app_name === result.steamAppId)) {
    owned.push({ store: 'steam', confidence: 'exact' })
  }
  // D-01/D-02: GOG/Epic/Amazon are fuzzy, SAME threshold/guard as dedup.ts.
  const fuzzyLibs: Array<['gog' | 'legendary' | 'nile', { title: string }[]]> = [
    ['gog', libraries.gog],
    ['legendary', libraries.epic],
    ['nile', libraries.amazon]
  ]
  for (const [store, lib] of fuzzyLibs) {
    if (lib.some((g) => fuzzyMatch(result.title, g.title))) {
      owned.push({ store, confidence: 'fuzzy' })
    }
  }
  // D-07: key-available is independent, never suppressed by `owned`.
  const keyAvailable = keysWaiting.some(
    (k) =>
      (result.steamAppId && k.steamAppId === result.steamAppId) ||
      fuzzyMatch(result.title, k.title)
  )
  return { owned, keyAvailable }
}
```
Header-comment convention to follow (see lines 3-15 of the existing file): document WHY this
function departs from `resolveDiscountBadge`'s single-badge/exact-only contract, and reference
D-01/D-04/D-06/D-07 explicitly, exactly as the existing header cites D-78..D-85.

---

### `src/common/types/storeSearch.ts` (model)

**Analog:** `src/common/types/discounts.ts` (whole file, 47 lines — structural template).

```typescript
interface CatalogPrice {
  final: string
  base: string
  discount: string
  finalMoney?: { amount: string; currency: string }
  baseMoney?: { amount: string; currency: string }
}
export interface CatalogProduct {
  id: string
  title: string
  price: CatalogPrice
  /* ... */
}
export interface CatalogLocaleSettings {
  countryCode: string
  locale: string
  currencyCode: string
}
```
Mirror this shape for `StoreSearchResult`, `StoreSearchDeal`, `StoreSearchStore` — but per D-13
and STORESEARCH-04, every price-bearing type MUST carry an explicit `currencyCode` field (fixed
`'USD'` in practice, but present in the type so the USD-only debt is visible, not implicit). Also
place the CheapShark `storeID → Runner` mapping constant here or in a small sibling
`common/discounts/storeMapping.ts` (RESEARCH Open Question 1 — Claude's discretion per CONTEXT.md).

---

### `src/common/types/ipc.ts` (MODIFY — add channel signatures)

**Analog:** itself, line 486 (`getGogDiscounts` entry in `AsyncIPCFunctions`):
```typescript
getGogDiscounts: (
  locale: CatalogLocaleSettings,
  hideOwned?: boolean,
  wishlistOnly?: boolean
) => Promise<CatalogProduct[]>
```
Add sibling entries:
```typescript
searchStores: (query: string) => Promise<StoreSearchResult[]>
getStoreSearchDeals: (gameId: string) => Promise<StoreSearchDeal[]>
getStoreSearchStoreMap: () => Promise<Record<string, StoreSearchStore>>
```
`AsyncIPCFunctions` is the type `preload/ipc.ts`'s `makeHandlerInvoker<ChannelName extends keyof
AsyncIPCFunctions>` generic keys off — every new `addHandler` channel MUST have a matching entry
here or the preload export won't type-check.

---

### `src/preload/api/storeSearch.ts` (provider, request-response)

**Analog:** `src/preload/api/helpers.ts` line 43 + `src/preload/ipc.ts` (whole file, 32 lines).

```typescript
// Source: src/preload/api/helpers.ts:43
export const getGogDiscounts = makeHandlerInvoker('getGogDiscounts')
```
```typescript
// Source: src/preload/ipc.ts:15-18 — the generic this relies on
function makeHandlerInvoker<ChannelName extends keyof AsyncIPCFunctions>(channel: ChannelName) {
  return (...args: Parameters<AsyncIPCFunctions[ChannelName]>) =>
    ipcRenderer.invoke(channel, ...args) as PromiseOnce<ReturnType<AsyncIPCFunctions[ChannelName]>>
}
```
New file:
```typescript
import { makeHandlerInvoker } from '../ipc'
export const searchStores = makeHandlerInvoker('searchStores')
export const getStoreSearchDeals = makeHandlerInvoker('getStoreSearchDeals')
export const getStoreSearchStoreMap = makeHandlerInvoker('getStoreSearchStoreMap')
```
For the buy-handoff (D-08/D-09), do NOT add a new IPC channel — reuse the existing
`makeListenerCaller('openExternalUrl')` export already in `src/preload/api/misc.ts` line 8:
```typescript
// Source: src/preload/api/misc.ts:8 (existing, reuse verbatim)
export const openExternalUrl = makeListenerCaller('openExternalUrl')
```
Backend side already wired at `src/backend/main.ts:687`:
```typescript
addListener('openExternalUrl', async (event, url) => openUrlOrFile(url))
```
and `src/backend/utils.ts:362` (`openUrlOrFile` → `shell.openExternal(url)` for `http`-prefixed
URLs). No changes needed to either file — call `window.api.openExternalUrl(redirectUrl)` from the
new `StoreSearchBreakdown` row click handler.

---

### `src/frontend/screens/StoreSearch/index.tsx` (component, container)

**Analog:** `src/frontend/screens/Discounts/index.tsx` (699 lines — read in full).

**Badge-resolution-once-in-container pattern** (lines 495-512 — the load-bearing precedent that
makes badge logic unit-testable; StoreSearch MUST follow this exactly, just swapping
`resolveDiscountBadge`→`resolveStoreSearchBadges`):
```typescript
// D-78..D-85 (Phase 15): resolved once per product list — DiscountCard
// never recomputes the badge itself, it only renders the literal passed
// in via the `badge` prop.
const discountBadges = useMemo(() => {
  const map = new Map<string, DiscountBadge>()
  for (const product of paginated) {
    map.set(
      product.id,
      resolveDiscountBadge(product, titleToSteamAppId, ownedSteamAppIds, keysWaiting)
    )
  }
  return map
}, [paginated, titleToSteamAppId, ownedSteamAppIds, keysWaiting])
```
StoreSearch equivalent: compute a `Map<gameId, { owned, keyAvailable }>` via
`resolveStoreSearchBadges()` once per `results` array, reading `epic.library`, `gog.library`,
`amazon.library`, `steam.library`, `humble.keys` from `ContextProvider` — same
`useContext(ContextProvider)` call as line 50:
```typescript
const { epic, gog, amazon, steam, humble } = useContext(ContextProvider)
```
(Omit `zoom` — D-05 lists only Steam/GOG/Epic/Amazon + Humble keys; `sideloadedLibrary` is
excluded per D-05, and Zoom is not in scope either.)

**Load + three-state try/catch pattern** (lines 203-247 — the STORESEARCH-08/D-14 template):
```typescript
useEffect(() => {
  let cancelled = false
  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.getGogDiscounts(localeSettings, hideOwned, wishlistOnly)
      if (!cancelled) setProducts(result)
    } catch (err) {
      if (!cancelled) {
        window.api.logError(String(err))
        setError(t('discounts.error', 'Could not load discounts. Please try again later.'))
      }
    } finally {
      if (!cancelled) setLoading(false)
    }
  }
  void load()
  return () => { cancelled = true }
}, [localeSettings, hideOwned, wishlistOnly, t])
```
StoreSearch's debounced-query effect replaces the `useEffect` deps with `[debouncedQuery]` and
additionally needs the **generation-counter guard** from RESEARCH Pattern 3/Pitfall 5 (no
existing codebase precedent — `cancelled` boolean alone is insufficient across an IPC hop because
`ipcRenderer.invoke()` doesn't support `AbortController` cross-process; track an incrementing
`requestId` ref and ignore a resolved promise if a newer query has since fired).

**Three-state JSX pattern** (lines 620-632 — structurally what STORESEARCH-08 needs, adapted per
UI-SPEC's distinct-container requirement — note UI-SPEC explicitly says do NOT reuse the same
`<p className="...__message">` for both no-results and error, unlike Discounts which does use one
shared `<p>` for both):
```typescript
{loading && (
  <UpdateComponent message={t('discounts.loading', 'Loading discounted games...')} />
)}
{!loading && error && <p className="discountsScreen__message">{error}</p>}
{!loading && !error && products.length === 0 && (
  <p className="discountsScreen__message">
    {t('discounts.empty', 'No discounted games available right now.')}
  </p>
)}
```
StoreSearch must render the initial-prompt, no-results, and provider-failed states as three
visually distinct blocks per UI-SPEC's Three-State Contract table — do not collapse error and
empty into the shared `__message` paragraph the way Discounts does.

**SearchBar reuse** (`src/frontend/screens/Discounts/components/DiscountFilters/index.tsx:285-289`,
component itself at `src/frontend/components/UI/SearchBar/index.tsx`):
```typescript
<SearchBar
  value={searchQuery}
  onInputChanged={onSearchChange}
  placeholder={t('search', 'Search for Games')}
/>
```
`SearchBar` is an uncontrolled input wired via a native `input` event listener (see
`SearchBar/index.tsx` lines 23-36) — `onInputChanged` fires on every keystroke; the container is
responsible for debouncing, `SearchBar` itself does not debounce. Per UI-SPEC, swap the
`searchButton` FontAwesome icon for a spinner while debounce/request is pending — same DOM slot,
not a second element.

---

### `src/frontend/screens/StoreSearch/components/StoreSearchRow/index.tsx` (component)

**Analog:** `src/frontend/screens/Discounts/components/DiscountCard/index.tsx` (99 lines, read in
full).

**Badge rendering — informational-only, no click target** (lines 68-85 — the badge JSX
structure to adapt for multi-badge stacking per D-06/D-07; UI-SPEC explicitly departs from the
single-badge precedence comment on line 74 "Owned always wins over Key-available (D-85)" — for
StoreSearch, both render as independent siblings):
```typescript
{badge === 'owned' && (
  <span className="discountCard__badge--owned">
    {t('discounts.badge.owned', 'Owned')}
  </span>
)}
{badge === 'key-available' && (
  <span className="discountCard__badge--keyAvailable">
    {t('discounts.badge.keyAvailable', 'Key available')}
  </span>
)}
```
StoreSearch equivalent renders a `.storeSearchRow__badges` wrapper containing zero-or-more
`owned` pills (one per matched store, capped at 2 + overflow per D-06, chrome reused from
`.discountCard__badge--owned`) PLUS an independent `.discountCard__badge--keyAvailable`-styled
pill when `keyAvailable` is true — both can render simultaneously (D-07), unlike DiscountCard's
`owned` XOR `key-available`.

**Buy handoff — replaces `withAffiliate()` + in-app navigate** (lines 30-33, explicitly NOT to be
copied per D-08/D-09):
```typescript
// DiscountCard (D-08/D-09 explicitly rejects this pattern for StoreSearch):
const handleClick = () => {
  const target = withAffiliate(product.storeLink)
  navigate(`/store-page?store-url=${encodeURIComponent(target)}`)
}
```
StoreSearch's per-store breakdown row instead calls
`window.api.openExternalUrl(\`https://www.cheapshark.com/redirect?dealID=${dealId}\`)` directly —
no `withAffiliate()`, no `navigate()`, no `/store-page` WebView route.

**Image/fallback pattern** (lines 3-4, 25-26, 62-67 — reuse verbatim):
```typescript
import { CachedImage } from 'frontend/components/UI'
import fallBackImage from 'frontend/assets/gamelib_card.svg?url'
// ...
<CachedImage className="discountCard__image" src={cover} fallback={fallBackImage} alt={product.title} />
```

---

### `src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts` (or inline)

**No codebase analog** — confirmed via `grep -rn debounce src/frontend` returning zero results
(per RESEARCH.md, independently reconfirmed). Use RESEARCH's Pattern 3 sketch as the
implementation baseline (not a literal existing file, but the recommended, reviewed shape):
```typescript
const [query, setQuery] = useState('')
const [debouncedQuery, setDebouncedQuery] = useState('')

useEffect(() => {
  const trimmed = query.trim()
  if (trimmed.length < 3) {
    setDebouncedQuery('')
    return
  }
  const timer = setTimeout(() => setDebouncedQuery(trimmed), 400)
  return () => clearTimeout(timer)
}, [query])
```
Generation-counter cancellation idiom is inspired by (not copied from) `backend/humble/library.ts`'s
`currentSyncGeneration()` supersede-detection — RESEARCH flags this as MEDIUM confidence
(synthesized, not lifted) since no exact match exists in the codebase.

---

### `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` (MODIFY)

**Analog:** itself, lines 198-203 (the `/discounts` entry — add sibling immediately after,
same indentation, not inside a submenu):
```typescript
<SidebarItem
  url="/discounts"
  icon={faTags}
  label={t('discounts.sidebar', 'Deals')}
  dataTour="sidebar-discounts"
/>
```
New entry:
```typescript
<SidebarItem
  url="/store-search"
  icon={faMagnifyingGlassDollar}
  label={t('storeSearch.sidebar', 'Store Search')}
  dataTour="sidebar-store-search"
/>
```
Import addition at the top of the file (existing import block, lines 1-15, uses named imports
from `@fortawesome/free-solid-svg-icons` — add `faMagnifyingGlassDollar` to that same import
statement, do not add a second import line). No conditional gate — always visible like Deals
(contrast with the `humble?.isLoggedIn &&` guard at lines 190-197, which does NOT apply here).

---

### `src/frontend/App.tsx` (MODIFY — route registration)

**Analog:** itself, lines 159-162 (the `discounts` route):
```typescript
{
  path: 'discounts',
  lazy: makeLazyFunc(import('./screens/Discounts'))
},
```
New entry (add as a sibling in the same `children` array):
```typescript
{
  path: 'store-search',
  lazy: makeLazyFunc(import('./screens/StoreSearch'))
},
```

---

## Shared Patterns

### `addHandler` IPC registration + throw-on-failure
**Source:** `src/backend/discounts/index.ts:121-169`
**Apply to:** `backend/storeSearch/index.ts`'s three new channels
Backend handlers log via `logError(..., LogPrefix.Backend)` then re-throw; the frontend container
is exclusively responsible for turning the rejection into a user-facing error state. Never
`return null`/swallow inside the handler.

### `makeHandlerInvoker` preload bridge
**Source:** `src/preload/ipc.ts:15-18`, `src/preload/api/helpers.ts:43`
**Apply to:** `preload/api/storeSearch.ts`
One `export const x = makeHandlerInvoker('channelName')` line per channel; the channel name must
exist as a key in `common/types/ipc.ts`'s `AsyncIPCFunctions` for this to type-check.

### Container-computed, presentational-consumed badge resolution
**Source:** `src/frontend/screens/Discounts/index.tsx:495-512`, `src/common/discounts/badges.ts`
**Apply to:** `StoreSearch/index.tsx` (compute) → `StoreSearchRow/index.tsx` (render literal only)
This is the single most load-bearing pattern in the phase: pure resolver in `common/`, computed
once via `useMemo` in the container from `useContext(ContextProvider)` state, passed down as an
already-resolved prop. Never recompute inside the row/card component — this is what makes
`resolveDiscountBadge`/`resolveStoreSearchBadges` unit-testable without mocking React or IPC.

### `steamAppId` falsy-guard idiom
**Source:** `src/common/discounts/badges.ts:48-54`, `src/backend/humble/dedup.ts:154-158`
**Apply to:** `resolveStoreSearchBadges()`'s Steam exact-join branch
`k.steamAppId !== undefined && k.steamAppId !== '' && k.steamAppId !== '0'` — a plain truthiness
check is insufficient because the string `'0'` is truthy in JS. Reuse this exact three-way
comparison anywhere a CheapShark `steamAppID` or Humble key `steamAppId` is compared.

### External link handoff via existing `openExternalUrl`
**Source:** `src/preload/api/misc.ts:8`, `src/backend/main.ts:687`, `src/backend/utils.ts:362`
**Apply to:** `StoreSearchBreakdown`'s per-store row click handler
`window.api.openExternalUrl(url)` — fire-and-forget `makeListenerCaller`, not `makeHandlerInvoker`.
No new IPC channel. Backend already restricts to `shell.openExternal` for any `http`-prefixed URL.

### Try/catch + `t()`-wrapped user-facing error, `window.api.logError` for the raw error
**Source:** `src/frontend/screens/Discounts/index.tsx:228-237`
**Apply to:** `StoreSearch/index.tsx`'s debounced-fetch effect
```typescript
} catch (err) {
  if (!cancelled) {
    window.api.logError(String(err))
    setError(t('discounts.error', 'Could not load discounts. Please try again later.'))
  }
}
```
Log the raw `err` via `window.api.logError`, show only the translated, generic message to the
user — never surface the raw error/stack in the UI.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts` | hook | event-driven | `grep -rn debounce src/frontend` returns zero results — no debounce hook exists anywhere in GameLib. Use RESEARCH.md's Pattern 3 sketch (generation-counter + `setTimeout`) as the baseline; MEDIUM confidence, synthesized not lifted. |
| `src/frontend/screens/StoreSearch/components/StoreSearchBreakdown/index.tsx` | component | request-response (lazy, row-scoped loading) | No existing GameLib component has a row-scoped (not screen-scoped) loading spinner inside an expand/collapse panel. `DiscountFilters`'s `__toggleIcon--open` rotate class and `UpdateComponent`'s spinner styling are the nearest fragments to compose from, but no single analog covers "lazy per-row IPC fetch + inline spinner." |
| `src/backend/storeSearch/__tests__/cheapshark.test.ts` | test | — | No existing `backend/discounts/__tests__` test mocks `axios` for an HTTP adapter — `badges.test.ts` only tests the pure resolver, never the fetch layer. Mock `axios` directly (e.g. `jest.mock('axios')`) per RESEARCH's Validation Architecture section; no in-repo precedent to copy verbatim, but the assertion style should match `dedup.test.ts`'s pure-function fixtures. |

## Metadata

**Analog search scope:** `src/backend/discounts/`, `src/backend/humble/`, `src/common/discounts/`,
`src/common/matching/` (target, does not yet exist), `src/common/types/`, `src/frontend/screens/Discounts/`,
`src/frontend/components/UI/Sidebar/`, `src/frontend/components/UI/SearchBar/`, `src/preload/api/`,
`src/preload/ipc.ts`, `src/backend/main.ts`, `src/backend/utils.ts`, `src/frontend/App.tsx`,
`src/frontend/state/GlobalState.tsx`
**Files scanned:** 18 read directly (graphify-oriented), plus graphify query/explain traversals
over `addHandler`, `resolveDiscountBadge`, `SidebarLinks`, `GlobalState`, and `makeHandlerInvoker`
subgraphs
**Pattern extraction date:** 2026-07-14
