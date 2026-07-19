# Phase 20: Aggregated Store Search (CheapShark) - Research

**Researched:** 2026-07-14
**Domain:** External price-comparison API integration + extension of an existing pure ownership-badge resolver + a new Electron IPC-backed screen
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Badge matching strictness**

- **D-01:** **Exact for Steam, fuzzy for the rest.** CheapShark returns `steamAppID` on game
  results, so Steam ownership is resolved by **ID join — no title matching at all**, which
  honours Phase 15's "never guess when you have an identifier" principle exactly. Fuzzy title
  matching applies **only** to GOG / Epic / Amazon, where no shared identifier exists.
- **D-02:** **Reuse `HUMBLE_FUZZY_MATCH_THRESHOLD` (85%) as-is.** One shared constant, one
  behaviour. Do **not** mint a second search-specific threshold — two thresholds will drift, and
  a stricter number would be invented precision with no data behind it. If real-world false
  positives appear, tune the one constant and both surfaces benefit.
- **D-03:** **Reuse the full `owned | key-available | null` vocabulary.** In a *buying* context
  the `key-available` state (an unredeemed Humble key for the game being priced) is arguably
  worth more than `owned` itself — it stops a genuinely wasteful purchase.
- **D-04:** **The badge names its store** — "Owned on GOG", not a bare "Owned". This requires the
  resolver to return **which library matched**, not a boolean. A bare "Owned" is a dead end: the
  user's next question is "where?" and the UI must answer it.

**Ownership sources**

- **D-05:** Badge resolution reads **Steam + GOG + Epic + Amazon libraries + Humble keys**.
  `sideloadedLibrary` is **excluded** — sideloaded titles are arbitrary user-supplied strings
  and would be the single richest source of fuzzy false positives. All slices are already
  reachable from `GlobalState` (`epic.library`, `gog.library`, `amazon.library`, `steam.library`),
  so no new backend library work is required.
- **D-06:** **Multi-store badges stack** — "Owned on Steam, GOG" when both match. Needs a sane
  cap and overflow rule ("+2 more"). This deliberately relaxes Phase 15's single-badge-per-card
  invariant (D-85) — on the search surface ONLY. The Deals screen keeps its single-badge rule.
- **D-07:** **`owned` and `key-available` coexist** rather than the former suppressing the
  latter. Owning a game on GOG while holding an unredeemed Steam key for it are two different,
  both-actionable facts.

**Buy handoff**

- **D-08:** **External browser via `shell.openExternal()`** — **not** the in-app `/store-page`
  WebView that Deals uses. GameLib should not wrap its own chrome around ~30 unvetted third-party
  checkout forms.
- **D-09:** Outbound links use **CheapShark's documented `redirect?dealID=` URL**, as designed.
  Do **not** attach GameLib's own affiliate tags, and do **not** strip their redirect to link direct.
- **D-10:** **No post-purchase machinery.** The purchase lands on the next normal library sync.
  No refocus-triggered auto-sync, no manual "I bought it" affordance.

**Search behaviour & result shape**

- **D-11:** **Debounced ~400ms, minimum 3 characters, cancel in-flight requests** when a newer
  query supersedes. One request per pause, never per keystroke.
- **D-12:** **One row per game, cheapest price up front; per-store deals fetched lazily on
  expand.** `GET /games?title=` already carries the cheapest price, `steamAppID`, and thumb in
  one request; the per-store breakdown requires a second call (`GET /games?id={gameID}`) per
  game. Owned-badges render on the collapsed row.
- **D-13:** **Currency travels with every price** — `$14.99 USD`, never a bare `$14.99`.
  CheapShark is USD-only while the Deals screen renders localised prices via
  `CatalogLocaleSettings`. A dismissible banner is insufficient — the unit must be impossible to
  miss regardless of where the eye lands.
- **D-14:** **Explanatory prompt on the empty state; "no results" and "provider failed" are
  visually distinct.** A failure renders an inline, retryable error while the search box stays
  usable (fail-soft, mirroring the Humble adapter).

### Claude's Discretion

- Where the shared matching logic physically lives (`badges.ts` is in `common/`, `dedup.ts` in
  `backend/humble/`). Combining exact + fuzzy resolution across both needs a home; the planner
  picks it. Constraint: **do not write a second title matcher**.
- Mapping CheapShark's numeric `storeID` to store names/logos (their `/stores` endpoint), and how
  that lookup is cached.
- Badge overflow rendering specifics (the "+2 more" cap from D-06).
- All i18n key naming.

### Deferred Ideas (OUT OF SCOPE)

- **Aggregated discovery / multi-provider Deals** — generalize `backend/discounts` from hardcoded
  GOG to N providers. Seeded at `.planning/seeds/aggregated-discovery-multi-provider-deals.md`,
  gated on this phase's provider interface surviving one real consumer.
- **IsThereAnyDeal migration** — the localised production provider. Scoped as
  `.planning/research/questions.md` Q2. The CheapShark USD-only limitation must stay contained
  inside the adapter and never leak into shared types, IPC payloads, or badge logic.
- **Tuning the 85% fuzzy threshold from real data** — D-02 reuses the existing constant on trust.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STORESEARCH-01 | New sidebar entry (sibling of `/discounts`); provider interface for search results | `backend/storeSearch/` + `common/types/storeSearch.ts` design (Architecture Patterns, Recommended Project Structure); sidebar pattern verified at `SidebarLinks/index.tsx:198-203` |
| STORESEARCH-02 | Debounce ~400ms, min 3 chars, cancel in-flight | Pattern 3 (Debounce + cancel-in-flight) — no existing codebase precedent, synthesized from `syncFence.ts` generation-counter idiom; Pitfall 5 (response-ordering race) |
| STORESEARCH-03 | One row per game, lazy per-store breakdown on expand | Live-verified `GET /games?title=` and `GET /games?id=` response shapes (Code Examples); D-12 matches the API's actual two-tier shape exactly |
| STORESEARCH-04 | Every price shows explicit currency (`$14.99 USD`) | `common/types/storeSearch.ts` recommendation carries explicit `currencyCode` field; CheapShark's `cheapest`/`price` fields are bare decimal strings with no currency field at all (confirmed live), so `USD` must be a GameLib-side constant applied in the adapter, never assumed implicitly downstream |
| STORESEARCH-05 | Steam exact `steamAppID` join; GOG/Epic/Amazon fuzzy at 85%; `sideloadedLibrary` excluded | Pattern 2 (`resolveStoreSearchBadges()` sketch); Pitfall 4 (what to lift from `dedup.ts` vs. leave behind); `GameInfo.app_name` confirmed as the Steam AppID string field for the exact join |
| STORESEARCH-06 | `key-available` badge coexists with `owned`, never suppressed | Pattern 2 sketch computes `keyAvailable` independently of `owned`, per D-07 |
| STORESEARCH-07 | `shell.openExternal()` via `redirect?dealID=`, no affiliate tags | Pitfall 1 (dealID double-encoding — live-verified 200 vs. 404) + existing `openExternalUrl` IPC channel (Code Examples) — reuse verbatim, no new IPC channel for the handoff itself |
| STORESEARCH-08 | Explanatory prompt / no-results / provider-failed states, fail-soft | Existing `Discounts/index.tsx` try/catch precedent (Pattern 1); Open Question 2 flags the breakdown-failure sub-case as needing an explicit planner decision |
</phase_requirements>

## Summary

Phase 20 adds a new sidebar screen that searches CheapShark's public, keyless JSON API and
annotates results with GameLib's own ownership data. Nothing about this phase requires a new
npm dependency — CheapShark is a plain HTTPS/JSON API reachable with the `axios` version already
in the project, following the exact `addHandler` + backend-module pattern `backend/discounts/index.ts`
already established for GOG. The CheapShark API surface was **live-verified during this research
session** (not just documentation-derived): `GET /games?title=`, `GET /games?id=`, `GET /stores`,
and `GET /redirect?dealID=` were all called against the real `www.cheapshark.com` endpoint and
their exact response shapes are recorded below as `[VERIFIED: live API call]`.

The harder part of this phase is not the API call, it's the **badge extension**. Phase 15 shipped
`resolveDiscountBadge()` in `src/common/discounts/badges.ts` as an intentionally strict,
exact-title-match-only, single-badge resolver, with header comments that explicitly justify that
strictness ("missing beats wrong"). Phase 20's CONTEXT.md (D-01/D-04/D-06/D-07) requires a
**different, more permissive** resolution shape for the search screen: exact ID-join for Steam,
85%-threshold fuzzy for GOG/Epic/Amazon, multiple stacked badges, and independent
`key-available` coexistence. The correct move — confirmed by reading both files in full — is to
**add a new exported function to `badges.ts`** (not touch `resolveDiscountBadge`, not fork a
second badge file) that imports the fuzzy-match primitives lifted out of
`src/backend/humble/dedup.ts` into a new pure `common/` module. This keeps Phase 15's Discounts
screen behavior byte-for-byte unchanged while giving Phase 20 the vocabulary it needs.

**Primary recommendation:** Extend `common/discounts/badges.ts` with a new
`resolveStoreSearchBadges()` export (multi-badge, store-attributed) that consumes a newly
extracted `common/matching/titleMatch.ts` module (lifted `normalizeTitle`/`titleSimilarity`/
`isDlcFalsePositiveRisk`/`fuzzyMatch`/`HUMBLE_FUZZY_MATCH_THRESHOLD` from `backend/humble/dedup.ts`,
which itself is refactored to import from the new common module instead of defining these
primitives locally). Build the CheapShark adapter as a new `src/backend/storeSearch/` module
mirroring `backend/discounts/index.ts`'s `addHandler` pattern, with a `common/types/storeSearch.ts`
type file that carries an explicit `currencyCode` field on every price so the CheapShark-is-USD-only
debt is visible in the type system, not hidden behind an implicit assumption.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CheapShark title search (`GET /games?title=`) | API/Backend (`backend/storeSearch/`) | — | External HTTP call, API key/no-key irrelevant but still belongs behind an IPC boundary like every other store fetch (`backend/discounts`, `backend/humble/adapter.ts`) |
| Per-game store breakdown (`GET /games?id=`) | API/Backend | — | Same as above; lazily invoked per D-12, one IPC round-trip per row expansion |
| Store ID → name/logo lookup (`GET /stores`) | API/Backend | Frontend (session cache read) | Fetched once backend-side (small, stable payload), cached in-memory, and can be returned to the frontend as a resolved map — no reason to route icon logic through IPC per-row |
| Debounce + cancel-in-flight | Browser/Client (frontend hook) | — | Pure UI timing concern; no backend awareness of "was this superseded" needed if the IPC call is fired only after debounce settles |
| Steam ownership join (exact `steamAppID`) | Browser/Client (frontend, reads `GlobalState.steam.library`) OR Backend (if computed IPC-side) — **recommend Browser/Client** | — | `resolveDiscountBadge`'s existing precedent computes badges in the frontend container (`Discounts/index.tsx`) from `GlobalState`, not IPC; Phase 20 should follow the same precedent — the libraries are already in renderer memory, no need to round-trip them to main |
| Fuzzy GOG/Epic/Amazon ownership join | Browser/Client | — | Same reasoning; `titleMatch.ts` must stay pure (no I/O) so it runs identically in the renderer as it does in backend unit tests |
| Badge rendering (stacking, overflow, copy) | Browser/Client (React) | — | Presentational only, per UI-SPEC |
| Buy handoff (`shell.openExternal`) | API/Backend (existing `openExternalUrl` IPC listener) | Browser/Client (button triggers it) | `window.api.openExternalUrl(url)` already exists (`backend/main.ts:687`, `preload/api/misc.ts`) — reuse verbatim, do not add a new IPC channel |
| Currency labeling (`$X USD`) | Browser/Client | — | Pure rendering; the `currencyCode` field travels in the IPC payload from the backend adapter |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axios | ^1.13.5 (already in `package.json`) | HTTP calls to CheapShark's public JSON API | Already the project's only HTTP client (`backend/discounts/index.ts` uses it identically for GOG's catalog API); supports `AbortController`-based cancellation via the `signal` option, needed for D-11's cancel-in-flight requirement `[VERIFIED: npm registry — axios 1.13.5 already installed]` |
| react-router-dom | ^6.30.0 (already in `package.json`) | New `/store-search` route | Existing routing library; `App.tsx` already registers sibling routes the same way `/discounts` and `/store-page` are registered `[VERIFIED: codebase — src/frontend/App.tsx]` |

### Supporting (no new installs required)
| Library | Already Present | Role in Store Search |
|---------|-----------------|----------------------|
| `fastest-levenshtein` (^1.0.16) | Yes | Powers `titleSimilarity()` once lifted into the new common matcher module — same dependency `backend/humble/dedup.ts` already uses, no new import needed at the package.json level |
| MUI (`@mui/material`) | Yes | Per UI-SPEC, form controls only (none of MUI's async/search components needed — `SearchBar` is hand-rolled) |
| FontAwesome | Yes | Sidebar icon (`faMagnifyingGlassDollar`), expand chevron |

**No new npm packages are required for this phase.** CheapShark is consumed as a plain public
JSON endpoint via the already-installed `axios`. This was confirmed by both reading
`backend/discounts/index.ts` (the analog: zero SDK, raw `axios.get`) and by live-testing the
CheapShark endpoints directly with `curl` during this research session — there is no official
CheapShark SDK to install; every third-party wrapper found (`cheapshark-ts`, Postman collection,
Ruby gem) is optional convenience tooling, not a requirement.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `axios.get` calls | `cheapshark-ts` npm wrapper | Adds a dependency (and its own maintenance risk / potential staleness) for a 4-endpoint API that's simpler to call directly, exactly as `backend/discounts/index.ts` already does for GOG's more complex catalog API. Rejected — do not install. |
| In-memory session cache for `/stores` | `electron-store`-persisted cache with TTL | `/stores` is a small (~35-row), rarely-changing lookup table; persisting it adds a config-store schema entry and migration surface for negligible benefit over a one-shot in-memory fetch on first use each app launch. Recommend in-memory only. |

## Package Legitimacy Audit

**Not applicable — this phase installs zero new npm packages.** CheapShark is consumed via the
existing `axios` dependency exactly as `backend/discounts/index.ts` consumes GOG's catalog API.
No `slopcheck` run was needed because there is nothing new to install. If a future planner
decides to add a typed CheapShark SDK wrapper instead of raw `axios` calls, that package MUST go
through the full Package Legitimacy Gate protocol before being added — it was NOT vetted in this
research pass.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────┐
│ Sidebar (SidebarLinks)      │
│  new SidebarItem → /store-  │
│  search (sibling of /       │
│  discounts)                 │
└──────────────┬───────────────┘
               │ navigate
               ▼
┌───────────────────────────────────────────────────────────┐
│ frontend/screens/StoreSearch/index.tsx (container)         │
│                                                              │
│  [SearchBar] ──(400ms debounce, min 3 chars)──▶ [pending]  │
│         │                                                    │
│         │ onDebouncedQuery(q)                                │
│         ▼                                                    │
│  fire IPC: window.api.searchStores(q, { signal })            │
│  (AbortController cancels prior in-flight call on new query) │
│         │                                                    │
│         ▼                                                    │
│  results: StoreSearchResult[] ── resolveStoreSearchBadges()  │
│           (pure, common/discounts/badges.ts) reads:          │
│              GlobalState.steam.library   → exact steamAppID  │
│              GlobalState.gog.library     → fuzzy titleMatch  │
│              GlobalState.epic.library    → fuzzy titleMatch  │
│              GlobalState.amazon.library  → fuzzy titleMatch  │
│              GlobalState.humble.keys     → key-available     │
│         │                                                    │
│         ▼                                                    │
│  [StoreSearchRow] × N  (collapsed: title, cheapest price,   │
│                          badge stack)                         │
│         │ onExpand (lazy)                                    │
│         ▼                                                    │
│  fire IPC: window.api.getStoreSearchDeals(gameId)             │
│         │                                                    │
│         ▼                                                    │
│  [per-store breakdown rows] ── onClick ──▶ window.api.        │
│                                  openExternalUrl(redirectUrl) │
└───────────────────────────────────────────────────────────┘
               │ IPC (searchStores / getStoreSearchDeals)
               ▼
┌───────────────────────────────────────────────────────────┐
│ backend/storeSearch/index.ts                                │
│  addHandler('searchStores', ...)                             │
│  addHandler('getStoreSearchDeals', ...)                      │
│  addHandler('getStoreSearchStoreMap', ...) [or inline cache] │
│         │                                                    │
│         ▼                                                    │
│  CheapShark adapter (cheapshark.ts)                          │
│   - GET https://www.cheapshark.com/api/1.0/games?title=      │
│   - GET https://www.cheapshark.com/api/1.0/games?id=         │
│   - GET https://www.cheapshark.com/api/1.0/stores (cached)   │
│   - builds redirect URL: https://www.cheapshark.com/redirect │
│     ?dealID={dealID}  ← dealID used VERBATIM, never re-      │
│     encoded (see Pitfall: double-encoding dealID)            │
└───────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── common/
│   ├── matching/
│   │   └── titleMatch.ts          # NEW — lifted from backend/humble/dedup.ts:
│   │                               #   normalizeTitle, titleSimilarity,
│   │                               #   isDlcFalsePositiveRisk, fuzzyMatch,
│   │                               #   HUMBLE_FUZZY_MATCH_THRESHOLD (name kept
│   │                               #   as-is per D-02, do not rename constant)
│   ├── discounts/
│   │   └── badges.ts               # EXTEND — add resolveStoreSearchBadges()
│   │                                # + StoreOwnershipBadge type; import
│   │                                # from common/matching/titleMatch.ts;
│   │                                # resolveDiscountBadge() UNCHANGED
│   └── types/
│       └── storeSearch.ts          # NEW — StoreSearchResult, StoreSearchDeal,
│                                     # StoreSearchStore types (mirrors discounts.ts)
├── backend/
│   ├── humble/
│   │   ├── dedup.ts                 # MODIFY — re-export/import primitives
│   │   │                             # from common/matching/titleMatch.ts
│   │   │                             # instead of defining them locally;
│   │   │                             # recomputeOwnership() stays here
│   │   │                             # (Humble/Steam-specific, not generic)
│   │   └── constants.ts             # MODIFY or leave — HUMBLE_FUZZY_MATCH_
│   │                                 # THRESHOLD now sourced from the common
│   │                                 # module; re-export here for callers
│   │                                 # that already import from constants.ts
│   └── storeSearch/
│       ├── index.ts                 # NEW — addHandler() IPC registration,
│       │                             # mirrors backend/discounts/index.ts
│       └── cheapshark.ts            # NEW — CheapShark HTTP adapter, contains
│                                     # ALL USD-only knowledge; converts raw
│                                     # CheapShark JSON to common/types/
│                                     # storeSearch.ts shapes
├── frontend/
│   ├── screens/
│   │   └── StoreSearch/
│   │       ├── index.tsx            # NEW — container (debounce, badge
│   │       │                         # resolution, three-state contract)
│   │       ├── index.css
│   │       └── components/
│   │           ├── StoreSearchRow/
│   │           └── StoreSearchBreakdown/
│   └── components/UI/Sidebar/components/SidebarLinks/index.tsx  # MODIFY
└── preload/
    └── api/
        └── storeSearch.ts           # NEW — makeHandlerInvoker() wiring,
                                       # mirrors preload/api/helpers.ts's
                                       # getGogDiscounts export
```

### Pattern 1: Backend provider module with `addHandler` (existing project convention)
**What:** Every store-data-fetching screen has a `backend/<domain>/index.ts` that calls
`addHandler(channelName, async (_event, ...args) => {...})`, registered against a type in
`common/types/ipc.ts`'s `AsyncIPCFunctions`, exposed to the renderer via a
`preload/api/*.ts` `makeHandlerInvoker('channelName')` export, and consumed in the frontend
container as `window.api.channelName(...)`.
**When to use:** Any new external-data screen. This is the load-bearing pattern for Phase 20's
`searchStores` and `getStoreSearchDeals` channels.
**Example (existing code, `backend/discounts/index.ts:121-169`):**
```typescript
// Source: src/backend/discounts/index.ts (existing GameLib code)
addHandler(
  'getGogDiscounts',
  async (_event, locale, hideOwned = false, wishlistOnly = false) => {
    try {
      const products = await fetchAllDiscounts(locale, hideOwned, wishlistOnly, token)
      return products
    } catch (err) {
      logError(`Failed to fetch GOG discounts: ${String(err)}`, LogPrefix.Backend)
      throw err
    }
  }
)
```
Phase 20 should throw (not swallow) on adapter failure, exactly as above — the **frontend**
container is what converts the thrown error into D-14's "provider failed" retryable state
(mirrors `Discounts/index.tsx`'s `try {...} catch (err) { setError(...) }` at lines 228-237).

### Pattern 2: Pure badge resolver extended, never forked
**What:** `common/discounts/badges.ts` currently exports `resolveDiscountBadge()` (single badge,
exact-only, Steam-only) and `buildDiscountBadgeMaps()`. Phase 20 needs multi-badge,
store-attributed, four-library resolution. The correct move is a **second exported function in
the same file**, not a new file and not a modification to the existing function's signature or
behavior.
**When to use:** Any time a downstream consumer needs a variant of an existing pure-logic
contract without breaking the original consumer's guarantees.
**Example (sketch, not existing code — recommended shape):**
```typescript
// Recommended addition to src/common/discounts/badges.ts
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
  if (
    result.steamAppId &&
    libraries.steam.some((g) => g.app_name === result.steamAppId)
  ) {
    owned.push({ store: 'steam', confidence: 'exact' })
  }

  // D-01/D-02: GOG/Epic/Amazon are fuzzy, reusing the SAME threshold/guard
  // as backend/humble/dedup.ts — do not invent a second constant.
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
This keeps `resolveDiscountBadge()` (Phase 15, Discounts screen) completely untouched — no
regression risk to a shipped, unit-tested feature.

### Pattern 3: Debounce + cancel-in-flight (new — no existing precedent in codebase)
**What:** A `grep` for `debounce` across `src/frontend` returned zero results
`[VERIFIED: codebase grep]` — GameLib has no existing debounce hook. The Discounts screen's
`searchQuery` is a **client-side filter over already-fetched data** (no debounce needed, it's a
local array filter), which is a fundamentally different problem from Phase 20's
per-keystroke-triggers-a-remote-call requirement (D-11). This must be built from scratch.
**When to use:** STORESEARCH-02 exactly.
**Example (recommended, standard React pattern — no library needed):**
```typescript
// Recommended: frontend/screens/StoreSearch/index.tsx
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

useEffect(() => {
  if (!debouncedQuery) return
  const controller = new AbortController()
  setLoading(true)
  setError(null)
  window.api
    .searchStores(debouncedQuery)
    .then((results) => setResults(results))
    .catch((err) => {
      if (controller.signal.aborted) return
      setError(...)
    })
    .finally(() => setLoading(false))
  return () => controller.abort()
}, [debouncedQuery])
```
Note: `window.api.searchStores` is an IPC-bridged call, not a raw `axios` call in the renderer —
`AbortController.abort()` on the renderer side does NOT cancel the in-flight backend `axios`
request unless the abort signal is somehow threaded through IPC (Electron IPC does not support
passing a `signal` cross-process natively). **Practical recommendation:** cancellation at the
renderer boundary should be **generation-based**, not `AbortController`-based across the IPC
hop — track a `requestId`/generation counter (same idiom `backend/humble/library.ts`'s
`currentSyncGeneration()` already uses for its own supersede-detection) and ignore a resolved
promise if a newer query has since been fired. The backend-side `axios` call MAY additionally use
`axios`'s own `signal` option to abort the **outbound HTTP request** if a newer IPC call for the
same purpose arrives (optional efficiency win, not required for correctness — the renderer-side
generation check is what prevents a stale response from ever being rendered).

### Anti-Patterns to Avoid
- **Re-encoding CheapShark's `dealID` before building the redirect URL:** `dealID` values
  returned by the API are **already percent-encoded** (they contain literal `%2F`/`%3D`
  characters as part of the JSON string value, because the underlying deal identifier is a
  base64-with-slashes hash). Passing it through `encodeURIComponent()` or a `URLSearchParams`
  append (which also encodes) turns `%2F` into `%252F` and the redirect 404s. Use the value
  **verbatim** in the URL. See Common Pitfalls below — this was live-verified.
- **Adding a second fuzzy-title-matching implementation.** CONTEXT.md's constraint is explicit
  and this research confirms it's technically easy to honor — `normalizeTitle`/`titleSimilarity`/
  `isDlcFalsePositiveRisk`/`fuzzyMatch` in `backend/humble/dedup.ts` have zero I/O and zero
  Humble-specific types in their signatures (they take/return plain strings and booleans) — they
  are trivially liftable to a common module.
- **Computing badges IPC-side.** All four ownership libraries (`epic.library`, `gog.library`,
  `amazon.library`, `steam.library`) are already renderer-side state in `GlobalState.tsx`. Routing
  them through IPC to compute badges in the backend would be a pointless round-trip and would
  break the "pure function computed once in the container" pattern `Discounts/index.tsx` already
  established (and that pattern is what makes `resolveDiscountBadge` unit-testable without
  mocking IPC).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy title matching for ownership | A second Levenshtein-based matcher tuned for "search" | The existing `titleSimilarity`/`fuzzyMatch`/`isDlcFalsePositiveRisk` trio, lifted to `common/matching/titleMatch.ts` | CONTEXT.md D-02 is explicit: two thresholds will drift and a "stricter number would be invented precision with no data behind it." This is a project-level decision, not a research finding, but it's also technically correct — the existing matcher has a real, deliberately-tuned DLC false-positive guard that a naive reimplementation would omit. |
| Debounce + cancel-in-flight | A generic `useDebounce` npm hook | A ~15-line `useEffect` + `setTimeout` + generation counter (Pattern 3 above) | The requirement is narrow (one query box, one downstream call) and the generation-counter idiom already exists in the codebase (`syncFence.ts`'s `currentSyncGeneration()`) — reusing the idiom, even if not the exact code, keeps the debounce logic auditable in ~15 lines instead of pulling in a dependency for something this small. |
| Store ID → name/logo resolution | A hardcoded `Record<string, string>` of all ~35 CheapShark store names baked into GameLib source | A one-time `GET /stores` fetch, cached in-memory per app session | CheapShark's store roster changes over time (new stores added, existing ones go active/inactive — confirmed live: `storeID 4` "Amazon" is currently `isActive: 0`). Hardcoding would silently go stale; fetching once per session stays correct with zero maintenance. |
| CheapShark client | A typed SDK wrapper (`cheapshark-ts` or similar) | Direct `axios.get()` calls, exactly like `backend/discounts/index.ts` | Four endpoints, no auth, no pagination complexity beyond `limit` — a wrapper adds a dependency-freshness risk for no real complexity reduction. See Alternatives Considered. |

**Key insight:** Every "don't hand-roll" item in this phase resolves to "reuse something that
already exists in this codebase," not "install a third-party package." That is unusual for a
research doc and is itself a finding: Phase 20 is architecturally cheap precisely because Phases
12 and 15 already built (and unit-tested) both halves of what this phase needs to combine.

## Common Pitfalls

### Pitfall 1: Double-encoding CheapShark's `dealID` breaks the buy handoff (D-08/D-09)
**What goes wrong:** The purchase redirect returns HTTP 404 instead of the store redirect page.
**Why it happens:** `dealID` values in the JSON response are already percent-encoded strings
(e.g. `rPSCN3%2FJpoZ0SjQ%2FgDXvmCifMHiePHA9JjbUPcGPS3w%3D`). Building the redirect URL with
`new URLSearchParams({ dealID }).toString()` or `` `...?dealID=${encodeURIComponent(dealID)}` ``
re-encodes the already-encoded `%` characters (`%2F` → `%252F`), and the CheapShark server 404s
on the resulting URL.
**How to avoid:** Interpolate `dealID` directly into the URL string:
`` `https://www.cheapshark.com/redirect?dealID=${dealId}` `` with no encoding call. This was
**live-verified** during this research session (`[VERIFIED: live API call]`) — the correctly-built
URL returns HTTP 200 with the expected `<title>Redirecting to Portal at Steam...</title>` HTML;
the double-encoded version returns HTTP 404.
**Warning signs:** Any code path that puts `dealID` through `URLSearchParams`, template-literal
`encodeURIComponent`, or a generic "build query string" helper used elsewhere in the codebase for
untrusted params.

### Pitfall 2: Amazon shows no CheapShark price rows — this is expected, not a matching bug
**What goes wrong:** A developer notices Amazon-owned games never show an Amazon price
breakdown row and assumes the storeID mapping is wrong.
**Why it happens:** CheapShark's `/stores` endpoint currently reports `storeID: 4` ("Amazon")
with `isActive: 0` `[VERIFIED: live API call, 2026-07-14]`. CheapShark simply does not carry
live Amazon deals right now — this is an upstream data-source fact, not something GameLib's
adapter can fix.
**How to avoid:** Document this in-code as a known upstream limitation. It does **not** block
D-05's ownership badge (the Amazon fuzzy match runs against GameLib's *own* `amazon.library`,
completely independent of whether CheapShark currently lists Amazon as an active storefront) —
it only means an Amazon-owned game will never show a *price row* from Amazon in the expanded
breakdown, which is fine since D-06's badge already tells the user "Owned on Amazon" before they
even expand.
**Warning signs:** A UAT test expecting "Owned on Amazon" AND an Amazon price row on the same
result — only the badge is guaranteed; the price row depends on CheapShark's active-store roster.

### Pitfall 3: `title` search is substring/fuzzy on CheapShark's side, not exact
**What goes wrong:** A 3-character query like `"war"` returns dozens of loosely-related titles
(War Thunder, Warframe, Total War, etc.), which is expected CheapShark behavior, not a GameLib bug.
**Why it happens:** `GET /games?title=` performs a case-insensitive **substring** match by
default `[VERIFIED: live API call — title=witcher returned 11 results including "The Witcher",
"The Witcher 2", "The Witcher 3", etc.]`. An `exact=1` param exists for exact-string matching but
using it would defeat the purpose of an incremental search box (a user typing "portal" before
finishing "portal 2" would get zero results with `exact=1`).
**How to avoid:** Do NOT pass `exact=1` for the live search box (D-11's whole point is
incremental search-as-you-type). This is purely informational for the planner: no code change is
implied, just confirmation that CheapShark's default substring behavior is what D-11's UX
depends on — the empty-string-safety and minimum-3-character gate already planned (STORESEARCH-02)
is sufficient to keep result volume sane without `exact=1`.

### Pitfall 4: `getManifest`-style "Humble/Steam-only" naming in `dedup.ts` will mislead a
literal file-move
**What goes wrong:** A refactor that moves `dedup.ts` wholesale (rather than extracting only the
generic functions) drags Humble-specific types (`HumbleKey`, `recomputeOwnership`'s signature)
into a module that's supposed to be usable by Steam/GOG/Epic/Amazon search matching too.
**Why it happens:** `dedup.ts`'s own header comment already flags this: *"The `humble`/`steam`
parameter naming is a historical artifact of where it was first needed... the logic is
store-agnostic"* — but only `normalizeTitle`, `titleSimilarity`, `isDlcFalsePositiveRisk`, and
`fuzzyMatch` are actually store-agnostic. `recomputeOwnership()` is NOT — it takes `HumbleKey[]`
and `GameInfo[]` and has Humble-specific override semantics (D-42 override predicate).
**How to avoid:** Lift only the four pure string-matching functions plus the
`HUMBLE_FUZZY_MATCH_THRESHOLD` constant into `common/matching/titleMatch.ts`. Leave
`recomputeOwnership()` in `backend/humble/dedup.ts`, updated to import the primitives from the
new common location instead of defining them locally.
**Warning signs:** Any import of `HumbleKey` or `GameInfo` inside the new common matching module
— that's a sign Humble-specific logic leaked into what must stay a pure, store-agnostic module.

### Pitfall 5: Backend-computed IPC results racing a superseding search query
**What goes wrong:** User types "portal", then quickly "portal 2" — if the "portal" IPC call
resolves *after* the "portal 2" one (out-of-order network timing), stale "portal" results
briefly flash or overwrite the correct "portal 2" results.
**Why it happens:** IPC round-trips (renderer → main → CheapShark → main → renderer) do not
guarantee response ordering matches request ordering, especially with network latency variance.
**How to avoid:** Generation-counter guard on the renderer side (see Pattern 3) — increment a
counter on every debounced-query fire, capture it in a closure, and ignore the IPC response if
the counter has moved on by the time it resolves. This is a stronger guarantee than relying on
`AbortController` alone, since `AbortController.abort()` on the renderer side does not actually
stop Electron's `ipcRenderer.invoke()` promise from eventually resolving with a (now-irrelevant)
value — it only lets you choose to ignore it.
**Warning signs:** Flaky/rare UAT failures where a fast typist briefly sees results for an
earlier, shorter query.

## Code Examples

### CheapShark title search (verified live shape)
```typescript
// Source: live API call during this research session, 2026-07-14
// GET https://www.cheapshark.com/api/1.0/games?title=portal&limit=3
// [VERIFIED: live API call]
type CheapSharkGameSearchResult = {
  gameID: string
  steamAppID?: string          // absent for non-Steam-listed titles
  cheapest: string             // e.g. "9.99" — decimal string, NOT a number
  cheapestDealID: string       // ALREADY percent-encoded — use verbatim in redirect URLs
  external: string             // display title
  internalName: string
  thumb: string                // full CDN URL, ready to render
}
```

### CheapShark per-game deal breakdown (verified live shape)
```typescript
// Source: live API call, GET .../games?id=82 (Portal)
// [VERIFIED: live API call]
type CheapSharkGameDetail = {
  info: { title: string; steamAppID?: string; thumb: string }
  cheapestPriceEver: { price: string; date: number } // unix seconds — not needed for UI
  deals: Array<{
    storeID: string           // join key against /stores
    dealID: string            // ALREADY percent-encoded, use verbatim
    price: string             // decimal string
    retailPrice: string       // decimal string, pre-discount
    savings: string           // decimal string percent, e.g. "0.000000"
  }>
}
```

### CheapShark stores lookup (verified live shape, partial)
```typescript
// Source: live API call, GET https://www.cheapshark.com/api/1.0/stores
// [VERIFIED: live API call, 2026-07-14]
type CheapSharkStore = {
  storeID: string
  storeName: string
  isActive: 0 | 1
  images: { banner: string; logo: string; icon: string } // relative paths,
    // e.g. "/img/stores/logos/6.png" — must be prefixed with
    // "https://www.cheapshark.com" if rendered directly (though per UI-SPEC,
    // logos are NOT rendered for non-GameLib-runner stores this phase —
    // only StoreLogos-mapped runners get an icon, everything else is text-only)
}
// Confirmed relevant storeIDs for the Runner-mapping (D-05/UI-SPEC):
//   '1'  -> Steam            -> Runner 'steam'   (active)
//   '7'  -> GOG               -> Runner 'gog'     (active)
//   '25' -> Epic Games Store -> Runner 'legendary' (active)
//   '4'  -> Amazon           -> Runner 'nile'    (INACTIVE on CheapShark
//                                right now — see Pitfall 2; map it anyway
//                                for forward-compat, it will simply never
//                                match at runtime today)
```

### Redirect URL construction (verified pitfall-avoidant shape)
```typescript
// CORRECT — dealID used verbatim, no encoding:
const redirectUrl = `https://www.cheapshark.com/redirect?dealID=${dealID}`
// [VERIFIED live: returns HTTP 200, HTML redirect page]

// WRONG — double-encodes the already-encoded dealID, 404s:
const params = new URLSearchParams({ dealID })
const brokenUrl = `https://www.cheapshark.com/redirect?${params.toString()}`
// [VERIFIED live: returns HTTP 404]
```

### Existing `openExternalUrl` IPC call (reuse verbatim, D-08/D-09)
```typescript
// Source: src/backend/main.ts:687 + src/preload/api/misc.ts (existing GameLib code)
// backend/main.ts:
addListener('openExternalUrl', async (event, url) => openUrlOrFile(url))
// backend/utils.ts:
async function openUrlOrFile(url: string): Promise<string | void> {
  if (url.startsWith('http')) {
    return shell.openExternal(url)
  }
  return shell.openPath(url)
}
// Frontend usage (already used by 7+ existing call sites, e.g.
// frontend/screens/Humble/Keys/Spares/index.tsx):
window.api.openExternalUrl(redirectUrl)
```
This is a `SyncIPCFunctions`-style `addListener`/`makeListenerCaller` fire-and-forget channel
(not `addHandler`/`makeHandlerInvoker`), matching `misc.ts:8`'s
`export const openExternalUrl = makeListenerCaller('openExternalUrl')`. Phase 20's per-store
breakdown row click should call this exact existing function — no new IPC channel needed for the
buy handoff itself.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A — this is a net-new integration | CheapShark API v0.1, unchanged surface for years per multiple third-party client libraries still targeting the same base URL/shape (`cheapshark-ts`, Ruby gem, Postman collection all agree on the same field names as the live-verified response) | — | Low API-churn risk; the shape verified today is very likely stable for the life of this phase |

**Deprecated/outdated:** Nothing found — CheapShark has no versioned-away endpoints relevant to
this phase. The `/deals` (bulk deals-browse) endpoint exists but is explicitly out of scope per
CONTEXT.md's `<deferred>` section (aggregated discovery/browse surface).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | CheapShark has no published, enforced rate limit (only community reports of best-effort throttling/backoff on 429) | Standard Stack / Architecture | If CheapShark silently rate-limits GameLib's traffic under load, search would start failing intermittently with no documented threshold to design around. D-11's debounce (one request per pause) already mitigates the worst case; low risk given the API is free/keyless by design and the phase's traffic volume (one desktop app, human-paced typing) is trivial next to CheapShark's likely traffic profile. |
| A2 | `GET /games?title=` default `limit` is 60 and case-insensitive substring matching is stable, permanent API behavior (not a temporary quirk) | Common Pitfalls / Code Examples | If CheapShark changes to exact-match-only by default, the search box would need `exact=0` explicitly added — low risk, this is documented third-party-client behavior across multiple independent wrappers, and was also directly observed live. |
| A3 | CheapShark's `/stores` roster and `isActive` flags change infrequently enough that a fetch-once-per-app-session in-memory cache (no persistence, no TTL) is sufficient | Don't Hand-Roll / Architecture Patterns | If CheapShark reactivates/deactivates stores mid-session, GameLib would show a stale store name/logo until app restart — cosmetically wrong (a hidden/renamed store label) but never incorrect on price or ownership data, so impact is low. |

**If A1/A2/A3 need firming up before execution:** none of them block planning — all three are
low-blast-radius and degrade gracefully (worse UX, never wrong data).

## Open Questions

1. **Should the backend or the frontend own the store-ID → Runner mapping constant?**
   - What we know: The mapping (`'1'→steam`, `'7'→gog`, `'25'→legendary`, `'4'→nile`) is a small,
     static, presentation-adjacent lookup (used only to decide whether `<StoreLogos>` renders per
     UI-SPEC).
   - What's unclear: Whether it belongs in `common/` (shared, testable) or purely in the frontend
     component that renders the breakdown row.
   - Recommendation: Put it in `common/types/storeSearch.ts` or a small
     `common/discounts/storeMapping.ts` alongside the badge logic — it's cheap to make it
     common/-testable and it's the kind of small fact (Amazon's `storeID` being `4`) that's
     genuinely worth a unit test asserting the constant doesn't silently drift.

2. **Does the per-game breakdown lazy-fetch need its own loading/error state independent of the
   top-level search state?**
   - What we know: UI-SPEC's "Expanded per-store breakdown" section already specifies a
     row-scoped loading state (not full-screen), so this is answered at the UI-SPEC level.
   - What's unclear: Whether a breakdown-fetch failure should be silently retried on next
     expand-click, or needs its own D-14-style distinct error state.
   - Recommendation: Simplest correct behavior — on breakdown-fetch failure, collapse back to the
     un-expanded row state and let the next click retry (no persisted per-row error UI needed);
     this keeps the three-state contract (STORESEARCH-08) scoped to the top-level search only,
     which is what CONTEXT.md's D-14 and the UI-SPEC's three-state table both describe. Flagging
     this only because the UI-SPEC doesn't explicitly say what happens on a *breakdown* failure —
     the planner should make this an explicit task rather than an implicit gap.

3. **Q2 (ITAD migration cost) remains genuinely unanswered** — this research did not investigate
   IsThereAnyDeal at all, per CONTEXT.md's explicit scope boundary (Q2 blocks a *future*
   phase, not this one). Noted here only so a future planner doesn't assume this RESEARCH.md
   covers it — it deliberately does not.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Network access to `www.cheapshark.com` | STORESEARCH-01..08 (entire phase) | ✓ (live-verified from this research environment, 2026-07-14) | CheapShark API v0.1 | D-14's provider-failed retryable state IS the fallback — no code fallback needed, this is a hard runtime dependency by design (public price data has no local substitute) |
| `axios` | All backend HTTP calls | ✓ | 1.13.5 (already in `package.json`) | — |
| Node/Electron main-process `fetch`/`axios` reachability from a packaged app (not just this dev sandbox) | Same as above | Not independently verified in this sandbox (only the research shell's network was tested) | — | Standard risk shared by every other external-API phase in this project (GOG catalog, Humble, Steam CM) — no phase-specific new risk introduced |

**Missing dependencies with no fallback:** None — this phase has no build-time or install-time
external dependency, only a runtime network dependency to CheapShark, which is inherent to the
feature and explicitly handled by D-14's fail-soft design.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 + ts-jest (`jest.config.js`, projects: `src/backend`, `src/frontend`, `meta`) |
| Config file | `/Users/graysonmitchell/Projects/GameLib/jest.config.js` |
| Quick run command | `npx jest src/backend/discounts --selectProjects backend` (or the specific new test path once created) |
| Full suite command | `pnpm test` (repo's standard `jest` invocation per `package.json`'s `"test": "jest"` script) |

Precedent: `src/backend/discounts/__tests__/badges.test.ts` already contains 15-Phase-era unit
tests for `resolveDiscountBadge`/`buildDiscountBadgeMaps`, and lives under `src/backend/` **even
though the code under test is in `common/`** — its own header comment explains why: "jest's
project roots only cover `src/backend`" (no separate `common` jest project exists). New tests for
`common/matching/titleMatch.ts` and `common/discounts/badges.ts`'s new
`resolveStoreSearchBadges()` export MUST follow the same convention: live under
`src/backend/discounts/__tests__/` or a new `src/backend/storeSearch/__tests__/`, not under a
nonexistent `src/common/__tests__/`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STORESEARCH-01 | Sidebar entry navigates to store-search screen; provider interface returns typed results | unit (backend adapter) + component smoke | `npx jest src/backend/storeSearch` | ❌ Wave 0 |
| STORESEARCH-02 | Debounce (~400ms) + min-3-char gate + cancel-in-flight (generation counter) | unit (frontend hook logic, extracted as a pure function if possible) | `npx jest src/frontend/screens/StoreSearch --selectProjects frontend` | ❌ Wave 0 |
| STORESEARCH-03 | Collapsed row shows cheapest price; expand lazily fetches `/games?id=` exactly once | unit (backend adapter shape) + integration (React Testing Library expand interaction) | `npx jest src/backend/storeSearch` / `npx jest src/frontend/screens/StoreSearch` | ❌ Wave 0 |
| STORESEARCH-04 | Every rendered price string is `${amount} USD`, never a bare `$` | unit (pure price-formatting helper, extracted so it's testable without rendering) | `npx jest src/frontend/screens/StoreSearch` | ❌ Wave 0 |
| STORESEARCH-05 | Steam exact-ID badge; GOG/Epic/Amazon fuzzy badge at 85% threshold; `sideloadedLibrary` excluded | unit (`resolveStoreSearchBadges`, mirrors existing `badges.test.ts` structure) | `npx jest src/backend/discounts` | ❌ Wave 0 (extends existing `badges.test.ts` or a sibling file) |
| STORESEARCH-06 | `key-available` coexists with `owned`, never suppressed | unit (same file as STORESEARCH-05) | `npx jest src/backend/discounts` | ❌ Wave 0 |
| STORESEARCH-07 | Click → `shell.openExternal` via existing `openExternalUrl`, using verbatim (non-re-encoded) `dealID` in the redirect URL | unit (redirect-URL-builder pure function — assert no `%25` appears in output) | `npx jest src/backend/storeSearch` | ❌ Wave 0 |
| STORESEARCH-08 | Three visually/structurally distinct states: prompt, no-results, provider-failed | component/integration (React Testing Library, assert distinct DOM structure per state) | `npx jest src/frontend/screens/StoreSearch` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted `npx jest <touched-path>` (backend adapter tests are fast, no
  network calls — mock `axios` exactly as `backend/discounts` tests would, or as
  `humble/__tests__/dedup.test.ts` mocks nothing because it's pure functions)
- **Per wave merge:** full `pnpm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`; additionally, per Pitfall 1, at
  least one test MUST assert the redirect-URL builder does not double-encode a `dealID`
  containing `%2F`/`%3D` — this is exactly the kind of bug that live-manual-testing catches but a
  pure unit test catches cheaper and permanently.

### Wave 0 Gaps
- [ ] `src/backend/storeSearch/__tests__/cheapshark.test.ts` — adapter response mapping +
  redirect-URL-builder (the double-encoding regression test from Pitfall 1) + mocked `axios`
- [ ] `src/backend/discounts/__tests__/badges.test.ts` (extend) or a new sibling
  `storeSearchBadges.test.ts` — `resolveStoreSearchBadges()` covering: Steam exact-only (fuzzy
  Steam title match must NEVER produce a badge even if it would clear 85%), GOG/Epic/Amazon
  fuzzy at threshold, DLC false-positive guard still applies, `key-available` independent of
  `owned`, overflow/cap behavior at >2 stores (D-06)
- [ ] `src/backend/__tests__/titleMatch.test.ts` (or wherever `common/matching/titleMatch.ts`
  lands) — this can likely be a near-verbatim copy of the existing pure-function assertions
  already in `dedup.test.ts`, since the lifted functions are byte-identical in behavior
- [ ] Frontend: a debounce-behavior test using `jest.useFakeTimers()` to assert exactly one call
  fires after rapid sequential `setQuery` calls within the 400ms window

*(No jest framework install needed — Jest 29.7.0 is already configured project-wide.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | CheapShark is keyless/public; no credentials involved in this phase |
| V3 Session Management | No | No session state introduced |
| V4 Access Control | No | No new access-controlled resource |
| V5 Input Validation | Yes | The search query string is sent as a URL query param to an external HTTP API via `axios` (which URL-encodes params automatically when using `axios.get(url, { params: {...} })` — use the `params` object, not manual string concatenation, so the query text itself is never a raw-concatenation injection vector into the request URL) |
| V6 Cryptography | No | No cryptographic material handled in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unvalidated `dealID`/`storeID` values from CheapShark used to construct a URL that Electron's `shell.openExternal()` opens | Tampering / Spoofing | CheapShark is a third-party trust boundary — a compromised or malicious response could theoretically embed a `javascript:` or `file:` URL in `redirect?dealID=`. `shell.openExternal()` itself is the mitigation boundary already used by every other GameLib "buy"/link-out flow (`openExternalUrl`) — Electron's `shell.openExternal` does NOT execute `javascript:`/`file:` schemes the way an in-app webview might; still, constructing the redirect URL should be restricted to GameLib's own known-good CheapShark URL prefix (`https://www.cheapshark.com/redirect?dealID=`) rather than trusting any URL-shaped field CheapShark might return, so the `dealID` is the only untrusted fragment ever interpolated, never a full URL |
| SSRF-adjacent: query string reflected into an outbound backend HTTP request | Tampering | Not exploitable here — GameLib's backend is the *initiator* of the outbound request to a fixed, hardcoded `www.cheapshark.com` host; the user-controlled search query is a **query parameter value**, never used to construct the request *host*, so there is no host-injection vector. Use `axios`'s `params` object (auto-encoded) rather than manual template-literal URL building for the query string, mirroring `backend/discounts/index.ts`'s `URLSearchParams` usage |
| Denial of GameLib's own outbound traffic reputation (D-11's stated rationale) | Denial of Service (against CheapShark, not GameLib) | Already addressed architecturally by D-11 (400ms debounce, 3-char minimum, cancel-in-flight) — no additional backend-side rate limiting is strictly required given CheapShark itself has no documented enforcement, but the debounce is the load-bearing mitigation and must not be skipped or weakened during implementation |

## Sources

### Primary (HIGH confidence — live-verified during this research session)
- `https://www.cheapshark.com/api/1.0/games?title=portal&limit=3` — live `curl` call, confirmed
  response shape (`gameID`, `steamAppID`, `cheapest`, `cheapestDealID`, `external`,
  `internalName`, `thumb`)
- `https://www.cheapshark.com/api/1.0/games?id=82` — live `curl` call, confirmed
  `{info, cheapestPriceEver, deals[]}` shape
- `https://www.cheapshark.com/api/1.0/stores` — live `curl` call, confirmed full 35-store roster
  including `storeID`/`storeName`/`isActive`/`images`; confirmed GOG=7, Epic Games Store=25,
  Steam=1, Amazon=4 (currently inactive)
- `https://www.cheapshark.com/redirect?dealID=...` (correct + double-encoded variants) — live
  `curl` calls confirming HTTP 200 vs. 404 (Pitfall 1)
- `src/common/discounts/badges.ts`, `src/backend/humble/dedup.ts`,
  `src/backend/discounts/index.ts`, `src/common/types/discounts.ts`,
  `src/frontend/screens/Discounts/index.tsx`, `src/frontend/screens/Discounts/helpers.ts`,
  `src/frontend/screens/Discounts/components/DiscountCard/index.tsx`,
  `src/frontend/components/UI/SearchBar/index.tsx`, `src/backend/ipc.ts`,
  `src/common/types/ipc.ts`, `src/frontend/state/GlobalState.tsx`,
  `src/frontend/components/UI/StoreLogos/index.tsx`,
  `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx`,
  `src/backend/main.ts`, `src/backend/utils.ts`, `src/preload/api/misc.ts`,
  `src/backend/discounts/__tests__/badges.test.ts`, `jest.config.js`, `package.json` — all read
  directly from the GameLib repository during this research session (graphify-oriented reads)

### Secondary (MEDIUM confidence)
- [CheapShark API — publicapi.dev summary](https://publicapi.dev/cheap-shark-api) — corroborates
  field names independently observed live
- [CheapShark - API 1.0 base](https://www.cheapshark.com/api/1.0/) — official base URL,
  corroborates the live-tested endpoints

### Tertiary (LOW confidence, informational only, not load-bearing for any recommendation)
- [cheapshark-ts GitHub repo](https://github.com/NathanPip/cheapshark-ts) — corroborating
  third-party TypeScript wrapper existence; NOT recommended for use (see Alternatives Considered),
  file-level contents could not be fetched directly (404 on raw path) so its type definitions
  were not directly inspected, only referenced as existence-evidence for API stability
- [CheapShark Postman collection](https://www.postman.com/cheapshark/workspace/cheapshark-s-public-workspace/documentation/530355-334a254b-aae7-4450-a352-b573b31403fe) —
  referenced only via WebSearch snippet, not directly fetched

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, entire integration confirmed against the project's
  own established `backend/discounts` pattern
- CheapShark API shapes: HIGH — every field name/type in this document for `/games?title=`,
  `/games?id=`, `/stores`, and the redirect endpoint was independently live-verified with `curl`
  during this session, not sourced from documentation alone (the official docs site,
  `apidocs.cheapshark.com`, did not render fetchable content in this environment — live testing
  was the primary and necessary verification path)
- Badge-resolver extension architecture: HIGH — based on direct, full reads of both
  `badges.ts` and `dedup.ts`, cross-checked against CONTEXT.md's D-01/D-02/D-04/D-06/D-07 and the
  existing unit test file's own conventions
- Debounce/cancel pattern: MEDIUM — no existing codebase precedent to directly copy (confirmed via
  grep — zero results), so the recommended pattern is synthesized from an adjacent codebase idiom
  (`syncFence.ts`'s generation-counter approach) rather than lifted verbatim; this is standard
  React practice but was not found already implemented anywhere in GameLib to point to as ground truth
- Security domain: MEDIUM — ASVS mapping is straightforward for this phase's small attack surface,
  but the `shell.openExternal` scheme-restriction mitigation is a reasoned recommendation, not
  something independently verified against Electron's current security documentation in this
  session

**Research date:** 2026-07-14
**Valid until:** 30 days (CheapShark's API has been stable for years per multiple independent
third-party clients; the codebase-derived findings are stable until Phase 20 itself lands, at
which point this document is historical)
