---
status: diagnosed
trigger: "store-search-query-lost-on-leave — The Store Search query and its results survive leaving and re-opening Store Search (e.g. to change theme) (UAT 47 test 12, issue 1)"
created: 2026-11-19T00:00:00Z
updated: 2026-11-19T00:00:00Z
audit_acknowledged:
  milestone: v0.10
  at: 2026-11-20
  status: diagnosed
---

## Current Focus

hypothesis: CONFIRMED. Store Search keeps its query, results and status in component-local React state (`useState` inside `useDebouncedStoreSearch`, called from `StoreSearch`). `store-search` is a leaf route under `Root`'s `<Outlet/>`, so navigating to Settings unmounts the screen and discards all of it. Re-opening remounts with the hook's initial values (`query = ''`, `results = []`, `status = 'prompt'`). Nothing in the StoreSearch directory writes the query or results anywhere that outlives the component. The region survives only because it is a different mechanism: a localStorage write (`discounts.regionOverride`).
test: read the route table, the hook, the screen, the region helper, and the two sibling persistence patterns (Library, Deals); grep the StoreSearch directory for any storage use.
expecting: n/a (diagnosis complete)
next_action: return ROOT CAUSE FOUND to the caller (goal: find_root_cause_only). No source modified.

bug_class: Bohrbug (deterministic design gap; always reproduces on leave and return; not a logic defect)
known_pattern_candidate: none (knowledge-base.md has no Store Search / unmount-state entry)

candidate_causes:
- code: query/results are component-local state (CONFIRMED, the cause)
- config: route table has no keep-alive, so the leaf route unmounts on navigation (true, but it is the design of every route here; it is the precondition, not a separate defect)
- environment: theme change reloads the webview (ELIMINATED, see below)
- data: backend cache evicts the result (ELIMINATED, see below)
and_gate: no. One cause (local state + unmount); one fix (hoist the state into something that outlives the screen). The route unmount is a precondition shared with every screen, not an independent contributing defect.

## Symptoms

expected: Stores > Store Search: search 'xcom', change region; the region choice survives leaving and re-opening Store Search. User also expects the search itself (query + results) to survive navigating away (e.g. to Settings to change theme) and back.
actual: "the search does not survive leaving the page (to change theme for example)"
errors: None reported
reproduction: Test 12 in 47-UAT.md (Store Search region picker, gap-closure 47-16). Search a title, go to Settings (theme), come back to Stores > Store Search: the box is empty and the prompt illustration shows.
started: Discovered during UAT of phase 47 on 2026-11-19. Not a regression: the hook has never persisted anything (introduced in Phase 20, commit b9975a8e5; later edits 074c26d0f, a8084aa2f, ad4fd1503 never added persistence).

## Eliminated

- hypothesis: The theme change itself reloads or remounts the webview, so even a session-memory fix would be lost
  evidence: grep for `location.reload` / `relaunch(` in src/frontend finds only TauriLoginPanel and OAuthLogin (login flows). `ThemeSelector` has no reload call. The user's own symptom is "leaving the page", i.e. a route change, and `Root` renders `<ThemeProvider>` around `<Outlet/>` without a key, so a theme change re-renders but does not remount children.
  timestamp: 2026-11-19

- hypothesis: The backend result cache expires or is per-session, so the search "fails" to come back on revisit
  evidence: `itadCache.ts`: `ITAD_FRESH_MS = 1h`, key `search:${country}:${sha256(normalizedQuery)}`. A re-run of the same query in the same country within the hour is a backend cache hit (no network). The loss is on the renderer side: the query never gets re-submitted because the box is empty.
  timestamp: 2026-11-19

- hypothesis: Some code in StoreSearch deliberately clears the query on unmount (a decision, not an omission)
  evidence: no unmount effect exists in `useDebouncedStoreSearch` (only the generation-bump cleanup, which guards setState-after-unmount, IN-01) and no Phase 20 / 47 document records "query is not kept". The only persistence statements in 47 concern the region (47-UI-SPEC.md:144-145, 47-16). The UAT expected-text for test 12 says only that the CHOICE (region) survives.
  timestamp: 2026-11-19

## Evidence

- timestamp: 2026-11-19
  checked: src/frontend/App.tsx:234-271 (route table)
  found: `store-search` is `{ path: 'store-search', lazy: makeLazyFunc(import('./screens/StoreSearch')) }`, a leaf child of `Root`, which renders `<Outlet/>` inside `<main className="content">` with no keep-alive wrapper.
  implication: Moving to `/settings/...` or `/accessibility` swaps the Outlet element; StoreSearch and its hooks unmount.

- timestamp: 2026-11-19
  checked: src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts:63-72
  found: `const [query, setQuery] = useState('')`, `debouncedQuery`, `results`, `status = 'prompt'`, `pricedCountry`, `errorCode`, `debouncePending`, `fetching` are all plain `useState` seeded with empty values. On mount with `query === ''` the first effect also runs `setResults([]); setStatus('prompt')`.
  implication: A remount always starts at the empty prompt state.

- timestamp: 2026-11-19
  checked: grep `localStorage|sessionStorage|storage\.` across src/frontend/screens/StoreSearch (non-test)
  found: zero hits.
  implication: Nothing in this screen writes anything that outlives the component. (storeRegion.ts, called from the screen, does, but only for the region.)

- timestamp: 2026-11-19
  checked: src/frontend/helpers/storeRegion.ts:149-182; StoreSearch/index.tsx:53-69
  found: `setStoredRegionOverride(code)` writes `localStorage['discounts.regionOverride']`; the screen seeds `regionOverride` with `useState(() => getStoredRegionFor(STORE_SEARCH_REGION_CODES))`.
  implication: This is why the region survives leaving and re-opening (the half of test 12 that works) while the search does not. Two different persistence mechanisms; the query was never given one.

- timestamp: 2026-11-19
  checked: src/frontend/components/UI/NavShell/tabLocationMemory.ts + .planning/quick/261029-n4v (quick plan and summary)
  found: since quick 261029-n4v every tier-1 tab remembers its last location for the session. `/store-search` resolves to the Stores tab, so after Settings the Stores tab click targets `/store-search` again.
  implication: The user is returned to the Store Search ROUTE but gets a freshly mounted, blank screen. That mismatch (route restored, screen state not) is exactly what makes it read as lost state. The Games tab has no such mismatch because 261029-n4v also gave Library a session store.

- timestamp: 2026-11-19
  checked: Library/librarySessionSearch.ts and Library/index.tsx (quick 261029-n4v); Discounts/index.tsx:135-175 + Discounts/helpers.ts:97-116; Humble/Keys/index.tsx:158-163
  found: three screens, three policies.
    1. Library: module-scope in-memory session store (`readLibrarySessionSearch` in lazy `useState` initialisers + one write-back `useEffect`). Survives navigation, dies on relaunch/reload. Rationale in file: D-22 / WR-11, no localStorage; sessionStorage rejected because WKWebView/WebView2 restore across a Tauri relaunch was not measured.
    2. Deals: filters including `searchQuery` go to localStorage `discounts.filters` (`loadStoredFilters` once on mount, `saveStoredFilters` in an effect). Survives navigation AND relaunch.
    3. Humble Keys: nothing persists, by decision D-43-07 (comment says so).
  implication: Store Search is the only searching screen with unmount-lossy state and no recorded decision to be. The closest analogue, with the same kind of free-text query, is Library.

- timestamp: 2026-11-19
  checked: Store Search data freshness
  found: results carry prices. Backend treats a search entry as fresh for 1 hour (ITAD_FRESH_MS) and keys it by country. A relaunch-surviving (localStorage) copy of the results would show stale prices as current.
  implication: results must not go to localStorage; session-only in-memory is the right lifetime (matches Library, and matches the 1h backend freshness window far better than a persisted copy).

## Resolution

root_cause: Store Search's query, debounced query, results, status, pricedCountry and errorCode are component-local `useState` in `useDebouncedStoreSearch` (called from `StoreSearch`), and `store-search` is a leaf route that unmounts when the user navigates to Settings or Accessibility. On return the screen remounts with empty initial state ('prompt'). Only the region is stored outside the component (localStorage `discounts.regionOverride`). This is an omission, not a regression: the query was never given a persistence mechanism since Phase 20, and the 47-16 UAT item only specified that the region choice survives.
fix: (not applied - diagnose only). Recommended direction below.
verification: (n/a)
files_changed: []

### Recommended fix direction (consistent with Library, quick 261029-n4v)

Add a module-scope, in-memory session store next to the hook, e.g. `src/frontend/screens/StoreSearch/storeSearchSession.ts`, copying the shape of `Library/librarySessionSearch.ts`: `readStoreSearchSession()` (returns a shallow copy), `writeStoreSearchSession(value)`, `resetStoreSearchSessionForTests()`. No localStorage / sessionStorage (same D-22 reasoning; plus results carry prices that go stale).

What to keep, in two tiers:
1. Minimum: `query`. Seed `useState(() => readStoreSearchSession().query)` in `useDebouncedStoreSearch`, write back in an effect on `[query]`. The existing debounce effect then re-submits it ~400ms after mount and the backend cache (1h, per country) answers it with no network. Cost: ~400ms + IPC of blank prompt illustration before the rows reappear (status starts 'prompt'; the body renders nothing for status 'loading').
2. Better (what the user asked for: "query + results"): also keep `debouncedQuery`, `results`, `pricedCountry` and the `countryCode` they were fetched for, and seed them in the same lazy initialisers, with `status` seeded to 'results'/'empty' to match. Then the rows are on screen on first paint.

Edge cases the implementer must handle (each is a way the obvious version goes wrong):
- Country mismatch: region is shared with Deals via localStorage, so the user can change it on Deals between visits. Store the country the kept results were fetched for and, on mismatch, keep the query but drop the kept results (let the normal fetch effect re-run). The existing fetch effect already re-runs on `[debouncedQuery, countryCode]` at mount, so tier 2 will refetch once on mount regardless (cache hit); suppress the `setStatus('loading')` flash for that refetch when rows are already showing, or the body goes blank (the screen has no 'loading' body block) for one IPC round trip.
- Clearing: when `query.trim().length < 3` the hook already resets results/status. Make sure that path also clears the kept copy (the write-back effect handles it if it runs on the same deps).
- Error state: do not keep `status === 'error'`; a transient provider failure should not be resurrected after navigation. Keep only 'results' / 'empty' / 'prompt'.
- Stale prices: keep session lifetime only (module memory dies on relaunch/reload). Optionally stamp `fetchedAt` and discard kept results older than the backend's 1h freshness window.
- Tests: the existing Store Search tests use the slot-based "mock react + invoke directly" harness (no jsdom). Lazy `useState` initialisers read the module store fine in that harness, but `StoreSearchScreen.test.tsx` and `useDebouncedStoreSearch.test.ts` must call `resetStoreSearchSessionForTests()` in `beforeEach` or state leaks across tests (same as `librarySessionSearch.test.ts:15`). Add: write -> fresh hook invocation reads it back; clearing the query clears the kept copy; a country mismatch drops results but keeps the query; a source gate that no storage setItem mentions the query (mirror the D-22 guard in `librarySessionSearch.test.ts`).

Alternative considered and not recommended: lifting the state into GlobalState (Phase 69 consolidated frontend state onto GlobalStateV2). It would work, but it puts a screen-local, session-only search box into the global store and re-renders subscribers on every keystroke; the Library precedent chose a module store for exactly this case. Deals-style localStorage was also rejected (see freshness evidence above), though it remains the right pattern if the user decides they want the query itself to survive a relaunch (query only, never results).

### Scope note for the caller

The same UAT item reported two other issues (2: spell-check "correction" fires on blur in the search control, e.g. 'xcom' -> 'com' in Library; 3: light theme renders game bars dark grey with black text). Those are separate defects, not part of this root cause, and were not investigated here.

Specialist hint: react (TypeScript, React hooks, module-scope session store).
