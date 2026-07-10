# Phase 16: CrossOver Compatibility Rating (CodeWeavers) - Pattern Map

**Mapped:** 2026-07-10
**Files analyzed:** 7 (2 new backend, 1 new test, 4 modified)
**Analogs found:** 7 / 7 (all have strong in-repo analogs)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/backend/wiki_game_info/codeweavers/utils.ts` (NEW) | service | request-response (HTTP fetch + parse) | `src/backend/wiki_game_info/applegamingwiki/utils.ts` | exact (same dir, same role, same fetch+cacheable-miss shape) |
| `src/backend/wiki_game_info/codeweavers/constants.ts` (NEW) | config | n/a (static regex/UA/URL constants) | `src/backend/wiki_game_info/applegamingwiki/constants.ts` | role-match (constants module; content differs — HTML/JSON-LD not wikitext regex) |
| `src/backend/wiki_game_info/codeweavers/__tests__/utils.test.ts` (NEW) | test | request-response | `src/backend/wiki_game_info/applegamingwiki/__tests__/utils.test.ts` | exact (mirror jest.spyOn(axiosClient,'get') structure) |
| `src/backend/wiki_game_info/wiki_game_info.ts` (MOD) | service (orchestrator) | request-response (parallel fetch) | itself (extend existing `Promise.all` + self-heal) | exact |
| `src/common/types.ts` (MOD) | model | n/a | `AppleGamingWikiInfo` / `WikiInfo` interfaces (§721-762) | exact |
| `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` (MOD) | component | request-response (render from context) | itself + `CompatibilityInfo.tsx` (numeric/independent-row rendering) | exact |
| `public/locales/en/gamepage.json` (MOD) | config (i18n) | n/a | existing `info.crossover-rating` / `info.wine-rating` keys (§184, §198) | exact |

## Pattern Assignments

### `src/backend/wiki_game_info/codeweavers/utils.ts` (NEW — service, request-response)

**Analog:** `src/backend/wiki_game_info/applegamingwiki/utils.ts` (read in full, 88 lines)

This is the primary template. Copy its three-part structure: (1) browser-UA constant, (2) `EMPTY_*_INFO` cacheable-miss marker, (3) `try { ... } catch { return null }` wrapper. The differences vs. the analog: raw HTML fetch (not MediaWiki JSON API), content-based hit/miss detection (soft-404 title vs. `VideoGame` JSON-LD — spike FINDINGS D-03), and a numeric result shape.

**Browser-UA constant pattern** (analog lines 16-17) — reuse this exact convention (a module-level `const`, JSDoc explaining why). Per D-07 discretion the exact string is planner's call; the spike used a desktop Chrome UA (`crossover-compat-lookup.mjs:75-76`):
```typescript
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
```

**Cacheable-miss marker pattern** (analog lines 19-29) — CRITICAL, this is D-09. A genuine miss (soft-404) returns a sentinel object so it caches; a fetch error returns `null` so it retries:
```typescript
/**
 * "Checked, no rating found" marker. Returned (instead of null) when the game
 * has no ... page so the result is CACHEABLE ... Distinct from a genuine fetch
 * error, which still returns null so it retries.
 */
const EMPTY_APPLEGAMINGWIKI_INFO: AppleGamingWikiInfo = {
  crossoverRating: '',
  wineRating: '',
  crossoverLink: ''
}
```
For CodeWeavers the marker shape follows the new type (see types section) — e.g. `{ rating: null, ratingCount: null }` or `{ found: false }`. Planner picks the exact shape; the invariant is *miss = sentinel object, error = null*.

**Core fetch + error-handling pattern** (analog lines 31-63) — the `getInfoFrom*` signature, `logInfo` at start, and the `try/catch` returning `null` on error:
```typescript
export async function getInfoFromAppleGamingWiki(
  title: string
): Promise<AppleGamingWikiInfo | null> {
  try {
    logInfo(`Getting AppleGamingWiki data for ${title}`, LogPrefix.ExtraGameInfo)
    const id = await getPageID(title)
    if (!id) {
      return EMPTY_APPLEGAMINGWIKI_INFO   // <-- miss = cacheable marker
    }
    // ... parse ...
    return { /* real data */ }
  } catch (error) {
    logError(
      [`Was not able to get AppleGamingWiki data for ${title}`, error],
      LogPrefix.ExtraGameInfo
    )
    return null   // <-- error = null (retryable)
  }
}
```

**Axios call with UA header** (analog lines 65-74) — use `axiosClient` from `backend/utils` (NOT bare axios) with the UA header. For CodeWeavers the URL is `https://www.codeweavers.com/compatibility/crossover/${slug}` and the response is `res.data` HTML text:
```typescript
const { data } = await axiosClient.get(
  `https://www.applegamingwiki.com/w/api.php?...`,
  { headers: { 'User-Agent': BROWSER_USER_AGENT } }
)
```

**Slugify + JSON-LD parse (NO in-repo analog — port from spike):** the validated reference implementation lives in `spike/crossover-compat-lookup.mjs`:
- `slugify()` — lines 41-48 (NFKD + strip diacritics + kebab). MUST be extended per D-04 / FINDINGS: (a) drop apostrophes entirely (`baldurs-gate-3`), (b) normalize roman numerals to Arabic (`modern-warfare-2`), (c) attempt a secondary fallback slug on primary miss.
- `extractVideoGameJsonLd()` — lines 85-118 (match first `application/ld+json` script, `JSON.parse`, find `@graph` node whose `@type` is/includes `VideoGame`, read `aggregateRating.ratingValue` + `ratingCount`).
- `SOFT_404_TITLE_RE` / `isSoft404()` — lines 126-130 (content-based miss detection). D-03 correctness requirement: `res.status === 200` is NOT a hit signal; every response is 200.

---

### `src/backend/wiki_game_info/codeweavers/constants.ts` (NEW — config)

**Analog:** `src/backend/wiki_game_info/applegamingwiki/constants.ts` (3 lines, read in full)

The analog is a flat list of exported `const` regexes:
```typescript
export const crossoverLinkIDRegEx = /codeweavers {2}= (\S+)/m
export const crossoverRatingRegEx = /\|crossover {12}= (\S+)/m
export const wineRatingRegEx = /\|wine {17}= (\S+)/m
```
Follow the same module shape (named `export const` at top level). CodeWeavers constants will differ in content: `BASE_URL`, `BROWSER_USER_AGENT`, `SOFT_404_TITLE_RE`, and the `application/ld+json` extraction regex (from spike lines 78, 87, 126). Planner may keep the UA constant in `utils.ts` (as the analog does) or hoist it here — either is consistent with existing per-source modules.

---

### `src/backend/wiki_game_info/wiki_game_info.ts` (MOD — orchestrator, parallel fetch)

**Analog:** itself (94 lines, read in full). Three edit sites:

**1. Platform-gated entry in `Promise.all`** (lines 41-46). AppleGamingWiki is gated `isMac ? ... : null`, umuId `isLinux ? ... : null`. Per D-07 CrossOver gates on BOTH: `isMac || isLinux ? getInfoFromCodeweavers(title) : null`:
```typescript
const [pcgamingwiki, gamesdb, applegamingwiki, umuId] = await Promise.all([
  getInfoFromPCGamingWiki(title, runner === 'gog' ? appName : undefined),
  getInfoFromGamesDB(title, appName, runner),
  isMac ? getInfoFromAppleGamingWiki(title) : null,
  isLinux ? getUmuId(appName, runner) : null
])
```
Add `codeweavers` as a new destructured element. Import mirrors line 8: `import { getInfoFromCodeweavers } from './codeweavers/utils'`. Note D-02: slug is constructed from `title` for ALL runners — do NOT wire `appName`/`runner` like the ProtonDB `runner === 'steam' ? appName : ...` branch (lines 60-61); that precedent is documented but explicitly NOT used here.

**2. Self-heal for stale caches** (lines 24-37). The existing `staleAppleData` guard re-fetches entries cached before AppleGamingWiki data existed. A parallel guard is needed so caches populated before CodeWeavers existed re-fetch:
```typescript
const staleAppleData = isMac && !cachedResponse?.applegamingwiki
if (cachedResponse && !staleAppleData) {
  return cachedResponse
}
```
Add e.g. `const staleCrossoverData = (isMac || isLinux) && !cachedResponse?.codeweavers` and fold into the return guard: `if (cachedResponse && !staleAppleData && !staleCrossoverData)`.

**3. Assemble into the returned object + cache** (lines 75-84). Add `codeweavers` to the `wikiGameInfo` literal before `wikiGameInfoStore.set(title, wikiGameInfo)`:
```typescript
const wikiGameInfo = {
  pcgamingwiki, applegamingwiki, howlongtobeat, gamesdb, steamInfo, umuId
}
wikiGameInfoStore.set(title, wikiGameInfo)
```

**Cache store** (`src/backend/wiki_game_info/electronStore.ts` + `src/backend/cache.ts`). Per D-09 discretion: reuse `wikiGameInfoStore` (the `WikiInfo`-typed store, `electronStore.ts:4-7`) by adding a `codeweavers` field to `WikiInfo` — no new store needed, self-heal handles the migration. The `CacheStore.get` invalidateCheck (`cache.ts:67-74`) already only evicts on TTL AND invalidateCheck; the default `() => true` is fine for the shared store.

---

### `src/common/types.ts` (MOD — model)

**Analog:** `AppleGamingWikiInfo` (§732-736) and `WikiInfo` (§755-762), read in full.

**New interface** — mirror the flat `AppleGamingWikiInfo` shape but numeric per D-05 (real value + count, not a tier string):
```typescript
export interface AppleGamingWikiInfo {
  crossoverRating: string
  wineRating: string
  crossoverLink: string
}
```
CodeWeavers analog (planner refines exact field names) — represent `ratingValue` + `ratingCount` as nullable numbers so the cacheable-miss marker is expressible, e.g.:
```typescript
export interface CodeweaversInfo {
  rating: number | null
  ratingCount: number | null
  slug: string        // constructed slug, for the deep-link (D-08 discretion)
}
```

**Extend `WikiInfo`** (§755-762) — add the new nullable field alongside `applegamingwiki`:
```typescript
export interface WikiInfo {
  pcgamingwiki: PCGamingWikiInfo | null
  applegamingwiki: AppleGamingWikiInfo | null
  // ADD: codeweavers: CodeweaversInfo | null
  howlongtobeat: HeroicHowLongToBeatEntry | null
  gamesdb: GamesDBInfo | null
  steamInfo: SteamInfo | null
  umuId: string | null
}
```

---

### `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` (MOD — component)

**Analog:** itself (66 lines, read in full) + `CompatibilityInfo.tsx` (numeric/independent-row rendering).

**Break the early-return (D-08)** — TODAY the whole panel bails when `applegamingwiki` is null (lines 21-25):
```typescript
const applegamingwiki = wikiInfo.applegamingwiki
if (!applegamingwiki) {
  return null     // <-- THIS coupling must go, else CrossOver row never shows on Linux
}
```
Replace with per-row conditional rendering like `CompatibilityInfo.tsx` does (`CompatibilityInfo.tsx:67 {hasProtonDB && (...)}` and `:33 Number.isFinite(...)`). Keep the top `if (!wikiInfo) return null` guard (line 17). The Wine row stays gated on `applegamingwiki` (D-06); the CrossOver row gates on `wikiInfo.codeweavers` independently.

**Wine row — UNCHANGED (D-06)** keeps `ratingTier()` (lines 51-60 + `appleRating.ts:18-36`):
```typescript
<b>{t('info.wine-rating', 'Wine rating')}:</b>
{ratingTier(applegamingwiki.wineRating).label}
```

**CrossOver row — NEW numeric renderer (D-05)** — the current row (lines 39-50) uses `ratingTier(applegamingwiki.crossoverRating).label`; REPLACE the value expression with the real number + count (e.g. `4.5 / 5 (2 ratings)`). Do NOT bucket into tiers. Reuse the existing `iconWithText` anchor + `WineBar` icon + `onClick`→`createNewWindow` pattern (lines 41-50, 27-37). Deep-link target is D-08 discretion — either keep the AppleGamingWiki `crossoverLink` or build from the constructed slug (`https://www.codeweavers.com/compatibility/crossover/${slug}`).

**Miss state** — when `wikiInfo.codeweavers` is the cacheable-miss sentinel (found but empty), render the new "no compatibility data available" i18n string instead of a number.

A new numeric display helper (sibling of `appleRating.ts`) may be warranted since `ratingTier()` is string-tier-only; planner's call whether to inline or extract.

---

### `public/locales/en/gamepage.json` (MOD — i18n)

**Analog:** existing keys under `info.*` (§183-198). Reuse `info.crossover-rating` (§184) and `info.wine-rating` (§198); reuse `info.clickToOpen` (§183). ADD one new key for the graceful miss state (D-09), e.g. `info.no-compatibility-data` → "No compatibility data available". Match the existing flat `"key": "Value"` style under the `info` object.

## Shared Patterns

### Cacheable-miss vs. error (D-09) — applies to the new backend service
**Source:** `applegamingwiki/utils.ts:19-29, 45-47, 56-62`
Miss returns a sentinel object (caches); error returns `null` (retries). This is the single most important invariant to preserve.
```typescript
if (!id) return EMPTY_APPLEGAMINGWIKI_INFO   // miss → cache
// ...
} catch (error) { logError([...]); return null }   // error → retry
```

### axiosClient + browser UA — applies to the new backend service
**Source:** `applegamingwiki/utils.ts:8,16-17,66-71`
Always use `axiosClient` from `backend/utils` (shared config), never bare `axios`. Pass the UA via `{ headers: { 'User-Agent': BROWSER_USER_AGENT } }`. Cloudflare/CDN sites 403 the default `axios/x.y` UA.

### Logging — applies to the new backend service
**Source:** `applegamingwiki/utils.ts:6, 38-41, 57-61`
```typescript
import { logError, logInfo, LogPrefix } from 'backend/logger'
logInfo(`Getting ... data for ${title}`, LogPrefix.ExtraGameInfo)
logError(['Was not able to get ... data for ${title}', error], LogPrefix.ExtraGameInfo)
```
Use `LogPrefix.ExtraGameInfo` (all wiki_game_info sources share it).

### Per-row conditional render — applies to the frontend component
**Source:** `CompatibilityInfo.tsx:33, 67` (`Number.isFinite(...)`, `{hasProtonDB && (...)}`)
Each compat row renders independently based on its own data presence, wrapped in the shared `iconWithText` anchor with a `WineBar`/status icon and `createNewWindow` click handler. This is the pattern the CrossOver row adopts to decouple from `applegamingwiki` (D-08).

### Test harness — applies to the new test file
**Source:** `applegamingwiki/__tests__/utils.test.ts` (read in full)
```typescript
jest.mock('backend/logger')
jest.mock('electron-store')
const mockAxios = jest.spyOn(axiosClient, 'get').mockResolvedValueOnce({ data: {...} })
```
Mirror its cases for CodeWeavers: (1) HIT — HTML with `VideoGame` JSON-LD → parsed rating; (2) soft-404 MISS → cacheable sentinel (not null); (3) `mockRejectedValueOnce` → `toBeNull()` + `logError` asserted; (4) UA-header regression test asserting `config.headers['User-Agent']` matches `/Mozilla/`; ADD slugify unit cases for the D-04 fixes (apostrophe-drop `baldurs-gate-3`, roman-numeral `modern-warfare-2`, and the KNOWN_GOOD self-check trio from spike lines 53-57).

## No Analog Found

No files are fully analog-less, but two sub-behaviors have NO in-repo precedent and must be ported from the spike (not RESEARCH.md):

| Behavior | Location | Source to port from |
|----------|----------|---------------------|
| HTML `application/ld+json` `VideoGame` parse | `codeweavers/utils.ts` | `spike/crossover-compat-lookup.mjs:85-118` |
| Content-based soft-404 hit/miss detection (not HTTP status) | `codeweavers/utils.ts` | `spike/crossover-compat-lookup.mjs:126-130` + FINDINGS §"Critical protocol correction" |
| Slugify w/ apostrophe-drop + roman-numeral normalization + fallback slug | `codeweavers/utils.ts` | `spike/crossover-compat-lookup.mjs:41-48` (extend per D-04) |

All existing wiki_game_info sources parse JSON APIs (MediaWiki, ProtonDB, GamesDB); none scrape raw HTML/JSON-LD, so the parse+detection logic has no closer analog than the spike.

## Metadata

**Analog search scope:** `src/backend/wiki_game_info/**` (applegamingwiki, protondb, steamdeck, cache, electronStore), `src/frontend/screens/Game/GamePage/components/**`, `src/common/types.ts`, `public/locales/en/gamepage.json`, `spike/**`
**Files scanned:** 13
**Pattern extraction date:** 2026-07-10
