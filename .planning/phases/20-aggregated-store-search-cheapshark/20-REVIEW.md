---
phase: 20-aggregated-store-search-cheapshark
reviewed: 2026-07-15T06:40:30Z
depth: standard
files_reviewed: 30
files_reviewed_list:
  - src/common/matching/titleMatch.ts
  - src/backend/humble/dedup.ts
  - src/backend/humble/constants.ts
  - src/common/types/storeSearch.ts
  - src/common/discounts/storeMapping.ts
  - src/common/types/ipc.ts
  - src/common/discounts/badges.ts
  - src/backend/storeSearch/cheapshark.ts
  - src/backend/storeSearch/index.ts
  - src/backend/main.ts
  - src/preload/api/storeSearch.ts
  - src/preload/api/index.ts
  - src/frontend/screens/StoreSearch/helpers.ts
  - src/frontend/screens/StoreSearch/components/StoreSearchRow/index.tsx
  - src/frontend/screens/StoreSearch/components/StoreSearchBreakdown/index.tsx
  - src/frontend/screens/StoreSearch/index.css
  - src/frontend/screens/StoreSearch/index.tsx
  - src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts
  - src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx
  - src/frontend/components/UI/SearchBar/index.tsx
  - src/frontend/App.tsx
  - public/locales/en/translation.json
  - src/backend/__tests__/titleMatch.test.ts
  - src/backend/__tests__/storeMapping.test.ts
  - src/backend/discounts/__tests__/storeSearchBadges.test.ts
  - src/backend/storeSearch/__tests__/cheapshark.test.ts
  - src/frontend/screens/StoreSearch/__tests__/StoreSearchRow.test.tsx
  - src/frontend/screens/StoreSearch/__tests__/formatUsdPrice.test.ts
  - src/frontend/screens/StoreSearch/__tests__/useDebouncedStoreSearch.test.ts
  - src/frontend/screens/StoreSearch/__tests__/StoreSearchScreen.test.tsx
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 20: Code Review Report

**Reviewed:** 2026-07-15T06:40:30Z
**Depth:** standard
**Files Reviewed:** 30
**Status:** issues_found

## Summary

Reviewed the aggregated store-search / CheapShark integration: the backend HTTP
adapter, IPC wiring, the shared fuzzy-title matcher, the store-search badge
resolver, the debounce hook, and the React screen/row/breakdown components plus
their tests.

**Security posture is sound.** The phase's headline threat — an attacker-influenced
full URL from untrusted CheapShark JSON reaching `shell.openExternal` — is
correctly contained: every `buyUrl` is built backend-side by `buildRedirectUrl()`
from the trusted `CHEAPSHARK_REDIRECT` host constant plus a verbatim (never
re-encoded) `dealID`, and no full-URL field (`external`, `info.title`, `thumb`)
is ever routed to the shell. `openUrlOrFile` receives only a fixed-host cheapshark
URL. USD-only containment (D-13) holds — the `'USD'` literal lives only in the
backend adapter (`SEARCH_CURRENCY`); shared types and IPC use `currencyCode: string`.
The Steam owned-badge is an exact `steamAppId` ID-join only (no fuzzy), and the
DLC/remaster false-positive guards in `titleMatch.ts` are correctly wired into
`fuzzyMatch` for the GOG/Epic/Amazon tier. Untrusted titles/prices/store names
render as React text nodes (auto-escaped) — no XSS surface.

Two functional defects were found: a stale-response race in the debounce hook and
a sidebar route-substring collision. Neither is a security or data-loss issue.

## Warnings

### WR-01: Stale in-flight search response clobbers the "prompt" state when the query is cleared/shortened

**File:** `src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts:62-115`
**Issue:** The generation counter (`generationRef`) is the only cross-IPC supersede
primitive, and it is bumped **only** inside `fetchResults` (line 90). When the user
backspaces the query below `MIN_QUERY_LENGTH` (or clears it) while a request is
in flight, the debounce effect resets to `status: 'prompt'` / `results: []`
(lines 64-70) but does **not** call `fetchResults`, so `generationRef.current` is
left unchanged. When the earlier in-flight `searchStores` promise then resolves,
the guard `generationRef.current !== generation` evaluates **false** (both still
equal the same generation), so the stale resolution is NOT discarded — it runs
`setResults(response)` and `setStatus('results' | 'empty')`, overwriting the
`'prompt'` state the user should see after emptying the search box. The result:
after clearing the query, a late-arriving response repopulates results/flips the
screen back to a results/empty view for an abandoned query (and shows a spinner
during the window, since `fetching` also stays true).

This path is not covered — the generation-guard test (`useDebouncedStoreSearch.test.ts:221-256`)
only exercises supersede between two ≥3-char queries, where a new `fetchResults`
call does bump the counter.
**Fix:** Invalidate the generation on the reset path too, e.g. bump the ref in the
debounce clear branch, or guard the resolution against the live query state:
```ts
if (trimmed.length < MIN_QUERY_LENGTH) {
  generationRef.current++ // invalidate any in-flight fetch
  setDebouncePending(false)
  setDebouncedQuery('')
  setResults([])
  setStatus('prompt')
  return
}
```

### WR-02: `.includes('store')` matches `/store-search`, wrongly activating the "Stores" webview item and expanding its submenu

**File:** `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx:51-53, 153, 159`
**Issue:** The new route registered in this phase is `/store-search`
(`App.tsx:164`). `SidebarLinks` detects the Stores webview screen with
`location.pathname.includes('store')` (line 52) and marks the "Stores" item
active with `isActiveFallback={location.pathname.includes('store')}` (line 153).
`'/store-search'.includes('store')` is `true`, so whenever the user is on the
Store Search screen: (a) the unrelated "Stores" (Epic/GOG/Amazon/Steam webview)
item is highlighted as active, and (b) its `inWebviewScreen` submenu of store
links expands. Two sidebar entries appear active at once, and an unrelated
submenu opens. (`/store-page` has the same latent collision, but the phase-20
regression is the `/store-search` addition.)
**Fix:** Match the store-webview path segment specifically rather than a bare
substring:
```ts
const inWebviewScreen =
  location.pathname.includes('/store/') ||
  location.pathname.includes('store-page') ||
  location.pathname.includes('last-url')
// ...and on the Stores SidebarItem:
isActiveFallback={location.pathname.includes('/store/')}
```

## Info

### IN-01: Fetch resolution can call setState after unmount (no unmount guard)

**File:** `src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts:94-114, 117-126`
**Issue:** Unlike `StoreSearchBreakdown` (which uses a `cancelled` flag in its
effect cleanup), the fetch effect here has no cleanup, and the generation guard
does not fire on unmount (the ref is never bumped when the component unmounts).
An in-flight `searchStores` that resolves after the screen is unmounted will call
`setFetching`/`setResults`/`setStatus` on an unmounted component. Harmless under
React 18 (no warning, no crash), but it is an unguarded state write. The WR-01
fix (invalidating the generation on teardown) would also close this.
**Fix:** Add an effect cleanup that bumps `generationRef.current`, or track a
mounted ref, so post-unmount resolutions are discarded.

### IN-02: Untrusted `thumb` URL is not constrained to http(s) before use as `<img src>`

**File:** `src/frontend/screens/StoreSearch/components/StoreSearchRow/index.tsx:38-43`; `src/frontend/components/UI/CachedImage/index.tsx:26-65`
**Issue:** `result.thumb` comes verbatim from CheapShark JSON. `CachedImage` only
routes URLs that `startsWith('http')` through the `imagecache://` main-process
path; any other scheme (e.g. a `file://` or `data:` thumb) is passed straight to
the raw `<img src>`. In practice CheapShark thumbs are always https CDN URLs and
an `<img>` cannot exfiltrate a loaded resource, so the risk is low — but the field
is unvalidated trusted-by-convention input.
**Fix:** Optionally validate/normalize `thumb` to `https:` at the adapter boundary
(`mapSearchResults`), dropping or replacing non-https values with the fallback,
so provider data cannot select a local/`data:` scheme.

### IN-03: `formatUsdPrice` hardcodes the `$` glyph while `currencyCode` is dynamic

**File:** `src/frontend/screens/StoreSearch/helpers.ts:19-21`
**Issue:** `` `$${amount} ${currencyCode}` `` pairs a literal `$` symbol with a
runtime `currencyCode`, so a future non-USD provider would render mismatched
output like `$14.99 EUR`. This is the documented USD-only debt (D-13) and the
function is explicitly named `formatUsdPrice`, so it is acceptable today; noted
so the debt stays visible when a second provider is added.
**Fix:** When a non-USD provider lands, derive the symbol from `currencyCode`
(or drop the symbol) rather than hardcoding `$`.

---

_Reviewed: 2026-07-15T06:40:30Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
