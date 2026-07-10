---
phase: 16-crossover-compatibility-rating-codeweavers
reviewed: 2026-07-10T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/common/types.ts
  - src/backend/wiki_game_info/codeweavers/constants.ts
  - src/backend/wiki_game_info/codeweavers/utils.ts
  - src/backend/wiki_game_info/codeweavers/__tests__/utils.test.ts
  - src/backend/wiki_game_info/wiki_game_info.ts
  - src/frontend/screens/Game/GamePage/components/crossoverRating.ts
  - src/frontend/screens/Game/GamePage/components/__tests__/crossoverRating.test.ts
  - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
  - src/frontend/jest.config.js
  - public/locales/en/gamepage.json
findings:
  critical: 0
  warning: 6
  info: 2
  total: 8
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-07-10T00:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the CodeWeavers CrossOver compatibility lookup: backend slug builder
(`slugify`/`naiveSlugify`), content-based hit/miss classification, JSON-LD
rating extraction, orchestrator wiring with cache self-heal, and the frontend
extra-info row.

The core control flow is sound: the null-vs-EMPTY-marker contract (`null` =
retryable error, `{rating:null,...}` = cacheable miss) is implemented
consistently across `getInfoFromCodeweavers`, the cache self-heal in
`wiki_game_info.ts`, and the React render guards. Slug output is correctly
constrained to `[a-z0-9-]`, so a crafted title cannot inject a path segment or
alter the request host — the T-16-01 injection concern is genuinely closed.
The two-slug fallback strategy also mitigates most roman-numeral / apostrophe
edge cases because the naive slug recovers what the normalized slug misses.

No BLOCKER-level defects (no crash, injection, or data-loss path) were proven.
The findings below are correctness-robustness and quality gaps in the JSON-LD
parsing, rating-scale assumption, i18n, and URL construction.

## Warnings

### WR-01: JSON-LD extraction only inspects the first `ld+json` block and mishandles top-level-array roots

**File:** `src/backend/wiki_game_info/codeweavers/utils.ts:93-113`, `src/backend/wiki_game_info/codeweavers/constants.ts:33-34`
**Issue:** `ldJsonRegEx` has no `g` flag and `html.match(...)` returns only the
*first* `<script type="application/ld+json">` block. Real pages frequently emit
multiple ld+json scripts (e.g. `Organization`/`BreadcrumbList` in one block and
`VideoGame` in another). If the `VideoGame` node lives in any block other than
the first, `graph.find(...)` returns `undefined` and the page is misclassified
as a miss (cached EMPTY marker), silently hiding a real rating. Separately, the
`@graph` fallback `Array.isArray(data?.['@graph']) ? data['@graph'] : [data]`
does not handle a valid top-level JSON-LD **array** root (`[ {...}, {...} ]`):
`data?.['@graph']` is `undefined`, so `graph` becomes `[data]` where `data` is
itself the array, and `node?.['@type']` on that array element is `undefined` →
no VideoGame found → false miss.
**Fix:** Iterate over all ld+json blocks (add `g` flag + `matchAll`), and
normalize the parsed root so both an object-with-`@graph` and a bare array are
flattened into the node list before searching:
```ts
const blocks = [...html.matchAll(new RegExp(ldJsonRegEx, 'gi'))]
for (const [, json] of blocks) {
  let data
  try { data = JSON.parse(json) } catch { continue }
  const nodes = Array.isArray(data)
    ? data
    : Array.isArray(data?.['@graph'])
      ? data['@graph']
      : [data]
  const videoGame = nodes.find(/* @type includes VideoGame */)
  if (videoGame?.aggregateRating) { /* extract + return */ }
}
return null
```

### WR-02: `aggregateRating.bestRating` ignored; rating rendered against a hardcoded 5-star max

**File:** `src/backend/wiki_game_info/codeweavers/utils.ts:120-127`, `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx:67-72`
**Issue:** `extractVideoGameJsonLd` reads only `ratingValue`/`ratingCount` and
the component renders `<Rating value={codeweavers.rating} max={5} />`. Schema.org
`AggregateRating` carries a `bestRating` (not necessarily 5). If CodeWeavers
publishes on any scale other than 0–5, the star row silently misrepresents
compatibility (e.g. a `7/10` renders as a full 5 stars because MUI clamps to
`max`). Nothing in the reviewed code validates the scale.
**Fix:** Read `bestRating` and either normalize to the 5-star scale or clamp/
reject out-of-range values before rendering:
```ts
const best = Number(aggregateRating.bestRating) || 5
const rating = (Number(aggregateRating.ratingValue) / best) * 5
```
At minimum, confirm from the spike data that CodeWeavers uses `bestRating: 5`
and add a bounds check so a scale change upstream fails loudly rather than
displaying a wrong 5-star row.

### WR-03: Rating-count pluralization is hardcoded English, bypassing i18n

**File:** `src/frontend/screens/Game/GamePage/components/crossoverRating.ts:29-31`
**Issue:** `formatCrossoverRating` returns `` `(${ratingCount} ${ratingWord})` ``
with `ratingWord` hardcoded to `'rating'`/`'ratings'`. Every other user-facing
string in `AppleWikiInfo.tsx` goes through `t(...)`, and the phase added
`info.crossover-rating` / `info.no-compatibility-data` keys to
`gamepage.json` — but this count label will never localize, and non-English
plural rules (which i18next handles) are lost.
**Fix:** Move the label into i18next with plural support and pass the count:
```ts
// component
{t('info.crossover-rating-count', { count: codeweavers.ratingCount })}
// gamepage.json
"crossover-rating-count": "({{count}} rating)",
"crossover-rating-count_other": "({{count}} ratings)"
```

### WR-04: `gameInfo.title` interpolated unencoded into the fallback search URL

**File:** `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx:33,45`
**Issue:** `onClickCrossover` (new in this phase) builds
`...&name=${gameInfo.title}&search=app#results` without `encodeURIComponent`.
Titles containing `&`, `#`, `=`, or spaces break the query string (e.g. a `#`
truncates the URL at the fragment, an `&` injects a spurious query param). This
copies a pre-existing pattern from the old `onClick` (now `onClickWine`), but is
replicated into new code and should be corrected.
**Fix:** `name=${encodeURIComponent(gameInfo.title)}` in both handlers.

### WR-05: `Number(null)` coercion yields a false 0-rating instead of "no rating"

**File:** `src/backend/wiki_game_info/codeweavers/utils.ts:120-125`
**Issue:** `Number(aggregateRating.ratingValue)` returns `0` (finite) when
`ratingValue` is JSON `null` or an empty string, and likewise `ratingCount`.
The `Number.isFinite` guard therefore does *not* reject these, so a malformed
hit page with `"ratingValue": null` is cached as a real `{rating: 0,
ratingCount: 0}` — rendered as a solid zero-star row with `(0 ratings)` rather
than the intended "No compatibility data available" miss.
**Fix:** Reject nullish/empty inputs before coercion:
```ts
const rv = aggregateRating.ratingValue
const rc = aggregateRating.ratingCount
if (rv == null || rc == null || rv === '' || rc === '') return null
const rating = Number(rv)
const ratingCount = Number(rc)
if (!Number.isFinite(rating) || !Number.isFinite(ratingCount)) return null
```

### WR-06: Titles with no alphanumeric characters produce an empty slug and a useless request

**File:** `src/backend/wiki_game_info/codeweavers/utils.ts:59-66,136-137,172-173`
**Issue:** For a title composed only of punctuation/symbols (e.g. `"!!!"`),
`baseSlugify` trims to `''`. `fetchRatingForSlug('')` then requests
`${BASE_URL}/` — the CodeWeavers listing/browse page, not a game — which is not
a soft-404 and yields no `VideoGame`, so it is cached as a miss after a wasted
round trip. The fallback also cannot help: `naiveSlugify` returns the same empty
string, so `fallbackSlug !== slug` is false. Not a crash, but an avoidable
network call and a permanently-cached miss for such titles.
**Fix:** Short-circuit an empty slug before fetching:
```ts
if (!slug) return { rating: null, ratingCount: null, slug }
```

## Info

### IN-01: `formatCrossoverRating` can emit "(null ratings)" if rating/ratingCount diverge

**File:** `src/frontend/screens/Game/GamePage/components/crossoverRating.ts:24-31`
**Issue:** The `CodeweaversInfo` type allows `rating` and `ratingCount` to be
independently `null`. If `rating` is non-null while `ratingCount` is `null`,
the helper returns `"(null ratings)"`. In practice the backend always sets both
together, so this is latent rather than active, but the helper does not defend
its own contract.
**Fix:** Guard on `ratingCount === null` as well (return `null` or omit the
count) so the helper is safe regardless of caller coupling.

### IN-02: Both extra-info rows use the identical `WineBar` icon

**File:** `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx:63,88`
**Issue:** The new CrossOver rating row and the existing Wine rating row both
render `<WineBar />`, giving two visually indistinguishable rows on macOS where
both appear. Minor UX/clarity issue.
**Fix:** Use a distinct icon for the CrossOver row (or a CodeWeavers-specific
glyph) to differentiate the two compatibility sources.

---

_Reviewed: 2026-07-10T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
