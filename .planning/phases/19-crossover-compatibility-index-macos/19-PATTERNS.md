# Phase 19: CrossOver Compatibility Index (macOS) - Pattern Map

**Mapped:** 2026-07-13
**Files analyzed:** 18 (new + modified)
**Analogs found:** 18 / 18

RESEARCH.md already contains an unusually complete set of code excerpts (Pattern 1-5, Code
Examples). This document cross-verifies each against the **live tree** (exact current line
numbers, not paraphrased), fills every excerpt RESEARCH.md left as `/* ... */`, and adds the
frontend excerpts RESEARCH.md only described (badge CSS, filter dropdown wiring, IPC push
plumbing) so the planner can copy verbatim rather than re-deriving.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `meta/buildCrossoverIndex.ts` (new) | utility (CI script) | batch/transform | `meta/lintTranslations.ts` | exact (same `meta/` convention, same esbuild-run shape) |
| `meta/measureCrossoverMatching.ts` (new) | utility (CI script) | batch/transform | `meta/lintTranslations.ts` | exact |
| `.github/workflows/build-crossover-index.yml` (new) | config | event-driven | `.github/workflows/test.yml` (job shape) + `.github/workflows/draft-release-mac.yml` (tag-trigger anti-pattern to avoid) | role-match |
| `src/backend/crossover_index/schema.ts` (new) | model (validation) | transform | `src/backend/schemas.ts` | role-match (small file, same zod idiom) |
| `src/backend/crossover_index/electronStore.ts` (new) | model (cache store) | CRUD | `src/backend/wiki_game_info/electronStore.ts` | exact |
| `src/backend/crossover_index/fetcher.ts` (new) | service | request-response | `src/backend/wiki_game_info/codeweavers/utils.ts` (`fetchRatingForSlug`/axios+maxContentLength) + `src/backend/cache.ts` (`CacheStore`) | role-match, composite |
| `src/backend/crossover_index/normalize.ts` (new) | utility (pure transform) | transform | `src/backend/wiki_game_info/codeweavers/utils.ts` (`slugify`/`baseSlugify`) | role-match — explicitly a **sibling**, not a reuse (D-20) |
| `src/backend/crossover_index/index.ts` (new) | service | request-response | `src/backend/wiki_game_info/wiki_game_info.ts` | role-match |
| `src/backend/crossover_index/ipc_handler.ts` (new) | route (IPC) | request-response + pub-sub | `src/backend/wiki_game_info/ipc_handler.ts` + `src/backend/main.ts` `getAllGameOverrides`/`metadataChanged` pair | exact (bulk pull+push shape) |
| `src/backend/wiki_game_info/wiki_game_info.ts` (modified) | service | request-response | itself (existing `Promise.all` gate) | exact |
| `src/backend/wiki_game_info/codeweavers/utils.ts` (modified) | utility | transform | itself (`slugify`/`ROMAN_NUMERAL_RE`) | exact |
| `src/common/types/ipc.ts` (modified) | model (IPC contract) | transform | `getAllGameOverrides` / `metadataChanged` entries | exact |
| `src/frontend/state/GlobalStateV2.ts` (modified) | store (zustand) | CRUD | `gameOverrides` / `setGameOverrides` slice | exact |
| `src/frontend/state/GlobalState.tsx` (modified) | store (push listener wiring) | event-driven | `window.api.handleMetadataChanged` listener | exact |
| `src/frontend/screens/Library/components/GameCard/index.tsx` + `.css` (modified) | component | transform (render) | `gameCardDelistedBadge` (CSS+JSX) / `MacArchBadge.tsx` (component-with-derived-label pattern) | exact |
| `src/frontend/components/UI/LibraryFilters/index.tsx` (modified) | component | transform (render) | `platformsFilters` / `platformToggle` block | exact |
| `src/frontend/screens/Library/index.tsx` (modified) | component (filter reducer) | transform | `showNonAvailable`/`isNonAvailable` filter clause | exact |
| `src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx` (modified) | component | transform (render) | inline `.infoBox` + `faWarning` block (shared-prefix warning) | exact |

## Pattern Assignments

### `meta/buildCrossoverIndex.ts` (utility, batch/transform)

**Analog:** `meta/lintTranslations.ts` (full file read, 140 lines)

**Convention to copy** — a plain top-level-imperative TS script, no class, `console.log`
diagnostics, driven by a `package.json` script that pipes through esbuild:
```typescript
// meta/lintTranslations.ts:1-19 (verbatim shape to follow)
/**
 * Script to run some checks against translations
 *
 * run with `pnpm lint-translations`
 * ...
 */
import { readdirSync, readFileSync } from 'graceful-fs'
import { join } from 'path'

const localesPath = './public/locales'

function readFile(fileName: string, language: string) {
  try {
    return JSON.parse(
      readFileSync(join(localesPath, language, fileName + '.json')).toString()
    )
  } catch (error) {
    console.log(error)
    return null
  }
}
```
```jsonc
// package.json (existing, verbatim) — the run-shape to add a sibling entry for
"lint-translations": "esbuild --bundle --platform=node --target=node21 meta/lintTranslations.ts | node",
// NEW entries this phase adds, same shape:
// "build-crossover-index":   "esbuild --bundle --platform=node --target=node21 meta/buildCrossoverIndex.ts | node",
// "measure-crossover-match": "esbuild --bundle --platform=node --target=node21 meta/measureCrossoverMatching.ts | node",
```

**Core parse + medal-rule + dedup pattern** — RESEARCH.md already contains this in full
(see `19-RESEARCH.md` "The builder's parse + medal rule + deterministic dedup", lines
592-657). Do not re-derive; copy from there. Key excerpt (entity-limit fix, Pitfall 1):
```typescript
new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: {
    enabled: true,
    maxTotalExpansions: 500_000,   // default 1_000 — throws on this dump otherwise
    maxExpandedLength: 50_000_000, // default 100_000
    maxEntityCount: 1_000          // default 100
  },
  isArray: (name) => ['app', 'name', 'medal', 'category'].includes(name)
})
// Pitfall 2 — real root path has an <applications> wrapper:
const apps = parser.parse(xml).c4p.applications.app
```
D-04 dedup tiebreak (three keys, total order — Pitfall 5):
```typescript
const winner = (a, b) =>
  compareVersion(b.cxversion, a.cxversion) ||   // 1. highest cxversion
  (b.num - a.num) ||                            // 2. most ratings
  a.appid.localeCompare(b.appid)                // 3. lowest appid (breaks exact ties)
```

**Error handling pattern:** unlike D-05 (collisions never fail the build), Pitfall 2 says
a **zero-record extraction must fail the build** — this is the one place to `process.exit(1)`
or `throw`, not log-and-continue. Contrast with the collision path, which must always reach
`gh release upload`.

---

### `meta/measureCrossoverMatching.ts` (utility, batch/transform)

**Analog:** same as above (`meta/lintTranslations.ts`) for the script shape; reads
`meta/buildCrossoverIndex.ts`'s dump-loading logic (reuse it, per RESEARCH.md's project
structure note: "also reusable as the measurement harness' dump loader").

**Additional analog for reading local library caches** (needed for D-03's non-Steam qualitative
set and the 123-pair Steam ground-truth set): the library JSON files live at
`~/Library/Application Support/GameLib/store_cache/{steam,legendary,gog,nile}_library.json`
[VERIFIED path from RESEARCH.md Sources]. No existing script reads these directly — this is
the one piece of genuinely new plumbing in the phase; follow `CacheStore`'s on-disk convention
(`cwd: 'store_cache'`, `name: <filename>`) from `src/backend/cache.ts:22-26` when locating them,
rather than hardcoding a path.

**Output shape:** write a dated Markdown report (RESEARCH.md "Validation Architecture" —
"writes a dated Markdown report... aggregate counts + the synthetic cases, not a full dump of
the user's owned titles"). No existing analog for the report writer; keep it a simple
`writeFileSync` of a template string, consistent with the script's own low-ceremony style.

---

### `.github/workflows/build-crossover-index.yml` (config, event-driven)

**Analog:** `.github/workflows/test.yml` (full file, 20 lines) for job/step shape;
`.github/workflows/draft-release-mac.yml` lines 1-9 for the **trap to avoid** (T-04/Pitfall 3).

```yaml
# .github/workflows/test.yml (existing, verbatim) — job shape to mirror
name: Test
permissions:
  contents: read

on:
  pull_request:
    branches: [main, stable]
  workflow_dispatch:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository.
        uses: actions/checkout@v6
      - uses: ./.github/actions/install-deps
      - name: Test CI
        run: pnpm test:ci
```
```yaml
# .github/workflows/draft-release-mac.yml:1-9 (existing, verbatim) — THE TAG-COLLISION TRAP
name: Draft Release MacOSX
on:
  push:
    tags:
      - 'v*'          # <- T-04: the new rolling tag MUST NOT match this glob
  workflow_dispatch:
```

Full target workflow content (RESEARCH.md "Code Examples" > "The daily index workflow",
lines 543-584) is copy-ready — includes the `schedule` + `workflow_dispatch` dual trigger
(Pitfall 7), `permissions: contents: write` (narrower than `test.yml`'s `read` — this is the
one workflow in the repo that needs write), the `./.github/actions/install-deps` composite
action reuse, and the `gh release create --latest=false` / `gh release upload --clobber`
sequence (Pitfall 3, 4). Use it verbatim; do not re-derive.

**`.gitignore` note:** current `.gitignore` has `public/**/*.js` and `!public/webviewPreload.js`
(lines 28-29) but **no** `public/*.json*` pattern — an explicit new line is required for
`public/crossover-index.json.gz` (D-06 obligation, Pattern 2).

---

### `src/backend/crossover_index/schema.ts` (model, transform)

**Analog:** `src/backend/schemas.ts` (full file, 10 lines) — establishes the zod idiom:
branded/refined types, `z.infer` for the derived TS type, named export alongside the schema.
```typescript
// src/backend/schemas.ts (existing, verbatim)
import { z } from 'zod'
import path from 'path'

const Path = z
  .string()
  .refine((val) => path.parse(val).root, 'Path is not valid')
  .brand('Path')
type Path = z.infer<typeof Path>

export { Path }
```
**Concrete target schema** — RESEARCH.md already has this exact file drafted (lines 660-674):
```typescript
export const crossoverIndexSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),          // Pitfall 7 staleness signal
  entries: z.array(z.object({
    name: z.string().min(1),
    rating: z.number().int().min(1).max(5),    // bounds a poisoned payload (D-09/security)
    steamid: z.string().optional()
  })).min(1000)                                // truncated payload = rejected payload
})
export type CrossoverIndex = z.infer<typeof crossoverIndexSchema>
```

---

### `src/backend/crossover_index/electronStore.ts` (model, CRUD)

**Analog:** `src/backend/wiki_game_info/electronStore.ts` (full file, 11 lines) — the exact
`CacheStore` instantiation idiom, including the `invalidateCheck` escape hatch already used
by `umuStore`:
```typescript
// src/backend/wiki_game_info/electronStore.ts (existing, verbatim)
import CacheStore from '../cache'
import type { WikiInfo } from 'common/types'

export const wikiGameInfoStore = new CacheStore<WikiInfo>(
  'wikigameinfo',
  60 * 24 * 30
)

export const umuStore = new CacheStore<string | null>('umu', 60 * 6, {
  invalidateCheck: (data) => !data
})
```
**Target (Pattern 3 in RESEARCH.md, D-08/D-09):**
```typescript
export const crossoverIndexStore = new CacheStore<CrossoverIndex, 'index'>(
  'crossover_index',
  60 * 24,                     // D-08: 24h TTL
  { invalidateCheck: () => false }  // D-09: never auto-evict; fetcher.ts governs staleness
)
```
**`CacheStore` internals to know before using it** (`src/backend/cache.ts`, full file read,
129 lines) — `get()` **deletes** the entry on TTL expiry when `invalidateCheck` returns true
(lines 67-74); `set()` writes a `__timestamp.<key>` sidecar (lines 80-83); this is exactly why
D-09's "keep last good" requires `invalidateCheck: () => false` — see fetcher.ts below.

---

### `src/backend/crossover_index/fetcher.ts` (service, request-response)

**Analog A — axios fetch with a content-length ceiling:**
`src/backend/wiki_game_info/codeweavers/utils.ts:195-209` (`fetchRatingForSlug`):
```typescript
// existing, verbatim — the maxContentLength + axiosClient idiom to copy
async function fetchRatingForSlug(slug: string): Promise<ParsedRating | null> {
  const url = `${BASE_URL}/${slug}`
  const { data: html } = await axiosClient.get<string>(url, {
    headers: { 'User-Agent': BROWSER_USER_AGENT },
    responseType: 'text',
    maxContentLength: MAX_CONTENT_LENGTH   // 5 * 1024 * 1024, T-16-02
  })
  if (isSoft404(html)) return null
  return extractVideoGameJsonLd(html)
}
```
**Analog B — the "cacheable miss vs retryable error" split** (same file, `getInfoFromCodeweavers`,
lines 211-258): a genuine miss returns a sentinel value (`{ macRating: null, ... }`, cached);
a thrown error returns `null` (retried next time). Preserve this exact split for D-09's
"reject and keep last good, never throw further" behavior.

**Target implementation:** RESEARCH.md "The D-09 validate / keep-last-good layer" (lines
660-703) is copy-ready — `loadIndex<T>(desc: IndexDescriptor<T>)` with `axiosClient.get` +
`gunzipSync` + `desc.schema.safeParse` + fallback chain `cached ?? bundled`. Use verbatim.

**Bundled-snapshot read pattern (D-07):** `src/backend/utils.ts` `getCurrentChangelog()` —
RESEARCH.md Pattern 2 (lines 278-315) is the full analog, already excerpted with exact
`publicDir` resolution logic from `src/backend/constants/paths.ts:63`. Copy verbatim; do not
branch on `app.isPackaged`.

---

### `src/backend/crossover_index/normalize.ts` (utility, transform)

**Analog — and explicit anti-pattern boundary:** `src/backend/wiki_game_info/codeweavers/utils.ts`
`slugify()`/`baseSlugify()` (lines 39-76, full excerpt already read above). Copy the **shape**
(NFKD normalize → strip combining diacritics → lowercase → collapse non-alphanumeric runs →
trim) but this file must be a **separate function with separate correctness criteria** (D-20):

```typescript
// src/backend/wiki_game_info/codeweavers/utils.ts:39-46 (existing, verbatim)
// the SHAPE to copy for normalize.ts's own baseNormalize step
function baseSlugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(COMBINING_DIACRITIC_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```
**Do NOT import or call `slugify()`/`naiveSlugify()` from `normalize.ts`.** They are the URL
slug (verbatim numerals is correct there); the matching key is the open D-01/D-02/D-03
question (whether to strip edition suffixes) and must live in its own file so the two can never
drift into each other (RESEARCH.md Anti-Patterns, "Reusing `slugify()` as the matching key").

**The `utils.ts` file itself is ALSO a modified file this phase** (D-20 — see next entry) —
`normalize.ts` and the `slugify()` edit are siblings, not the same change.

---

### `src/backend/crossover_index/index.ts` (service, request-response)

**Analog:** `src/backend/wiki_game_info/wiki_game_info.ts` (full file, 111 lines) — the
"check cache, self-heal on stale marker, fetch, cache, return" shape:
```typescript
// wiki_game_info.ts:27-51 (existing, verbatim) — the self-heal-stale-cache pattern
const cachedResponse = wikiGameInfoStore.get(title)
const staleCrossoverData =
  (isMac || isLinux) &&
  (!cachedResponse?.codeweavers ||
    cachedResponse.codeweavers.macRating === undefined)
if (!forceRefresh && cachedResponse && !staleAppleData && !staleCrossoverData) {
  logInfo([`Using cached ExtraGameInfo data for ${title}`], LogPrefix.ExtraGameInfo)
  return cachedResponse
}
```
This is directly relevant beyond being a shape-analog: RESEARCH.md's Open Question 2 /
Runtime State Inventory flags that this **exact** `staleCrossoverData` check needs extending
so a cached `macRating: null` miss self-heals once the index loads on macOS — the planner
should treat this as a required edit to `wiki_game_info.ts`, not just `index.ts`'s own logic.

**Error handling pattern to copy** (lines 104-110):
```typescript
} catch (error) {
  logError(
    [`Was not able to get ExtraGameInfo data for ${gameInfo.title}`, error],
    LogPrefix.ExtraGameInfo
  )
  return null
}
```

---

### `src/backend/crossover_index/ipc_handler.ts` (route, request-response + pub-sub)

**Analog A (pull, minimal per-domain handler file):**
`src/backend/wiki_game_info/ipc_handler.ts` (full file, 7 lines):
```typescript
// existing, verbatim
import { addHandler } from 'backend/ipc'
import { getWikiGameInfo } from './wiki_game_info'
import { getGame } from 'backend/utils'

addHandler('getWikiGameInfo', async (e, title, appName, runner, forceRefresh) =>
  getWikiGameInfo(getGame(appName, runner), forceRefresh)
)
```

**Analog B (pull + push pair, the actual D-11 bulk shape):** `src/backend/main.ts:1465-1477`:
```typescript
// src/backend/main.ts (existing, verbatim)
addListener('setGameMetadataOverride', (e, args) => {
  const { appName, title, art_cover, art_square } = args
  setGameOverrides(appName, { title, art_cover, art_square })
  sendFrontendMessage('metadataChanged', getAllGameOverrides())   // push on change
})

addHandler('getGameMetadataOverride', async (_e, appName) => {
  return getGameOverrides(appName)
})

addHandler('getAllGameOverrides', async () => {
  return getAllGameOverrides()          // pull on demand
})
```
Copy this pull+push pair shape for `getCrossoverIndex` (pull) + `crossoverIndexChanged` (push,
fired after a validated background refresh swaps the store contents — see fetcher.ts).

---

### `src/backend/wiki_game_info/wiki_game_info.ts` (MODIFIED — D-10/D-11/D-13/D-14 gate)

**This is a self-analog: edit the existing `Promise.all`, current lines 55-62:**
```typescript
// wiki_game_info.ts:55-62 (existing, verbatim — CURRENT state before this phase's edit)
const [pcgamingwiki, gamesdb, applegamingwiki, umuId, codeweavers] =
  await Promise.all([
    getInfoFromPCGamingWiki(title, runner === 'gog' ? appName : undefined),
    getInfoFromGamesDB(title, appName, runner),
    isMac ? getInfoFromAppleGamingWiki(title) : null,
    isLinux ? getUmuId(appName, runner) : null,
    isMac || isLinux ? getInfoFromCodeweavers(title) : null   // <- THIS LINE CHANGES
  ])
```
Target replacement is RESEARCH.md "The D-10 gate — where it belongs" (lines 705-723):
```typescript
isMac
  ? (await getCodeweaversFromIndex(gameInfo)) ?? getInfoFromCodeweavers(title)  // D-11, D-13
  : isLinux
    ? getInfoFromCodeweavers(title)   // unchanged — exactly as today (D-14)
    : null
```
**Do not touch** the `isMac || isLinux` condition's Linux branch shape — D-14 explicitly
declines removing it, even though the array-destructure line number shifts.

**Also required here (Open Question 2 / Runtime State Inventory):** extend the `staleCrossoverData`
check (lines 41-44, quoted above under `index.ts`) so a cached miss (`macRating: null`, NOT
`undefined`) is treated as stale on macOS once the index has data — otherwise Phase 16 users
keep seeing "no rating" for up to 30 days for games the index now covers.

---

### `src/backend/wiki_game_info/codeweavers/utils.ts` (MODIFIED — D-20 slugify fix)

**Self-analog, current lines 17-31 (the code to delete) and 59-66 (the function to edit):**
```typescript
// utils.ts:17-31 (existing, verbatim) — DELETE this roman-numeral machinery
const ROMAN_NUMERAL_RE = /\b(VIII|VII|III|IV|IX|VI|II|I|V|X)\b/g
const ROMAN_NUMERAL_MAP: Record<string, string> = {
  I: '1', II: '2', III: '3', IV: '4', V: '5',
  VI: '6', VII: '7', VIII: '8', IX: '9', X: '10'
}
```
```typescript
// utils.ts:59-66 (existing, verbatim) — EDIT: remove the roman->arabic replace,
// KEEP the apostrophe drop (D-20 is explicit both ways)
export function slugify(title: string): string {
  const withoutApostrophes = title.replace(APOSTROPHE_RE, '')
  const withArabicNumerals = withoutApostrophes.replace(     // <- this replace call is deleted
    ROMAN_NUMERAL_RE,
    (match) => ROMAN_NUMERAL_MAP[match]
  )
  return baseSlugify(withArabicNumerals)                      // <- becomes baseSlugify(withoutApostrophes)
}
```
`naiveSlugify()` (lines 74-76) is unaffected — it already never touched roman numerals.
**Security regression guard (T-16-01, from RESEARCH.md's Security Domain table):** `baseSlugify`'s
character-class guarantee (`[a-z0-9-]` only, lines 39-46) must be preserved and its existing test
kept — this edit must not touch `baseSlugify` itself, only the roman-numeral pre-processing step
that feeds it.

---

### `src/common/types.ts` — read, NOT modified (D-12)

`CodeweaversInfo` (lines 747-751):
```typescript
export interface CodeweaversInfo {
  macRating: number | null
  linuxRating: number | null
  slug: string
}
```
D-12 is explicit: the index returns this exact shape on a hit (no `medal` field added here).
The gold/silver/bronze/knownnottowork label is derived **in the UI** from `macRating`, not
stored on this type.

---

### `src/common/types/ipc.ts` (MODIFIED — bulk pull + push contract)

**Analog:** the `getAllGameOverrides` pull entry (lines ~399-406) and `metadataChanged` push
entry (lines ~547-550) in the same file:
```typescript
// src/common/types/ipc.ts (existing, verbatim shape)
getAllGameOverrides: () => Promise<
  Record<string, { title?: string; art_cover?: string; art_square?: string }>
>
```
```typescript
metadataChanged: (
  overrides: Record<string, { title?: string; art_cover?: string; art_square?: string }>
) => void
```
Target additions follow the identical shape:
```typescript
getCrossoverIndex: () => Promise<Record<string, number | null>>   // app_name -> rating | null
crossoverIndexChanged: (index: Record<string, number | null>) => void
```
(`Record<string, number | null>` matches D-16's three-state contract from RESEARCH.md Pattern 4:
present-with-rating = badge, present-with-`null` = "unknown" mark, absent-from-map = no mark.)

---

### `src/frontend/state/GlobalStateV2.ts` (MODIFIED — zustand slice)

**Analog:** the `gameOverrides` slice (full file already read, 145 lines) — lines 39-40 (type),
83-84 (init + setter):
```typescript
// GlobalStateV2.ts:39-40 (existing, verbatim — the shape to mirror)
gameOverrides: Record<string, GameOverride>
setGameOverrides: (overrides: Record<string, GameOverride>) => void
```
```typescript
// GlobalStateV2.ts:83-84 (existing, verbatim)
gameOverrides: gameOverridesStore.get('overrides', {}),
setGameOverrides: (gameOverrides) => set({ gameOverrides }),
```
Note `gameOverridesStore` (`frontend/helpers/electronStores`) seeds the initial zustand value
synchronously from a renderer-side electron-store mirror before the first IPC round-trip
resolves — the same seeding approach applies to `crossoverRatings` if the planner wants the
badge to paint on the very first render rather than waiting for `getCrossoverIndex()` to resolve.

---

### `src/frontend/state/GlobalState.tsx` (MODIFIED — push listener registration)

**Analog:** `window.api.handleMetadataChanged` listener, line 1077:
```typescript
// GlobalState.tsx:1077-1079 (existing, verbatim)
window.api.handleMetadataChanged((e, overrides) => {
  this.updateGameOverrides(overrides)
})
```
Target: `window.api.handleCrossoverIndexChanged((e, index) => { GlobalStateV2.setState({ crossoverRatings: index }) })` registered alongside it (or wherever this class wires its other `handle*` listeners — see the block at lines 1065-1090).

---

### `src/frontend/screens/Library/components/GameCard/index.tsx` (MODIFIED — D-15/D-16 badge)

**Analog A — the delisted-badge overlay JSX shape** (lines 502-511):
```tsx
// GameCard/index.tsx:502-511 (existing, verbatim)
{isDelisted && (
  <span
    className="gameCardDelistedBadge"
    aria-label={t2('library.delisted', 'Game no longer available')}
    aria-hidden={false}
    style={{ pointerEvents: 'none' }}
  >
    {t2('library.delisted', 'Game no longer available')}
  </span>
)}
```
**Analog B — deriving a label from a raw value + `title`/`aria-label` text, no visible text
in the glyph itself** — `MacArchBadge.tsx` (full file, 46 lines), the UI-SPEC's own cited
precedent:
```tsx
// GamePage/components/MacArchBadge.tsx (existing, verbatim)
const MacArchBadge = ({ gameInfo, isMac }: Props) => {
  const { t } = useTranslation('gamepage')
  if (gameInfo.mac_arch !== '32') {
    return null   // <- D-16's "no element when not looked up" precedent already exists here
  }
  const variantClass = isMac ? 'macArchBadge--warning' : 'macArchBadge--informational'
  const label = t('badge.macArch32', '32-bit macOS build')
  return (
    <div className={`macArchBadge ${variantClass}`} title={label} aria-label={label}>
      32
    </div>
  )
}
```
This is the closest existing precedent for "component returns `null` when the fact doesn't
apply" (D-16's hard requirement) AND "derive a CSS variant class from a raw field, render
`title`+`aria-label` text separately from the compact visible glyph" (D-12/D-15). Follow this
shape for the medal-tier → CSS-class/color mapping (5→gold/`--status-success`, 4→silver/
`--status-info`, 3→bronze/`--status-warning`, ≤2→`--status-danger`, looked-up-null→
`--status-default`, absent→render nothing) per the UI-SPEC's Color section.

**Analog C — CSS placement/z-index/pointer-events convention** (`GameCard/index.css`):
```css
/* GameCard/index.css:203-211 (existing, verbatim) */
.gameCard .gameCardDelistedBadge {
  position: absolute;
  z-index: 3;
  top: 5px;
  left: 5px;
  font-weight: var(--semibold);
  background: var(--status-default);
  color: var(--neutral-01);
  font-size: var(--text-sm);
}
```
```css
/* GamePage/index.css:170-192 (existing, verbatim) — the badge-diameter/border-radius idiom */
.macArchBadge {
  position: absolute;
  right: 0.5rem;
  top: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 1.75rem;
  height: 1.75rem;
  padding: 0 0.35rem;
  border-radius: 6px;
  font-size: var(--text-sm);
  font-weight: 700;
  line-height: 1;
  cursor: default;
}
```
The UI-SPEC calls for a **bottom-right 10px solid dot**, `pointer-events: none` (matching every
sibling badge — none of the three existing badges are clickable), a `1px solid var(--neutral-01)`
outline. No existing badge uses a bare circular dot shape, but all three existing badges already
establish `position: absolute` + `z-index` + `pointer-events: none` (delisted badge) as the
governing idiom — extend it, don't invent a new positioning system.

---

### `src/frontend/components/UI/LibraryFilters/index.tsx` (MODIFIED — D-17 filter)

**Analog — the `platformsFilters` multi-checkbox shape** (full file, 292 lines; relevant slice
lines 90-100, 137-153, 184-189, 214-217), confirmed live and matching the UI-SPEC's own
recommendation exactly:
```tsx
// LibraryFilters/index.tsx:90-94 (existing, verbatim)
const togglePlatformFilter = (plat: keyof PlatformsFilters) => {
  const currentValue = platformsFilters[plat]
  const newFilters = { ...platformsFilters, [plat]: !currentValue }
  setPlatformsFilters(newFilters)
}
```
```tsx
// LibraryFilters/index.tsx:137-153 (existing, verbatim) — the toggle-with-only render helper
const platformToggle = (plat: keyof PlatformsFilters) => {
  const toggle = (
    <ToggleSwitch
      key={plat}
      htmlId={plat}
      handleChange={() => togglePlatformFilter(plat)}
      value={platformsFilters[plat]}
      title={t(`platforms.${plat}`)}
    />
  )
  const onOnlyClick = () => { setPlatformOnly(plat) }
  return toggleWithOnly(toggle, onOnlyClick)
}
```
```tsx
// LibraryFilters/index.tsx:184-189 (existing, verbatim) — resetFilters default-all-true shape
setPlatformsFilters({
  win: true,
  linux: true,
  mac: true,
  browser: true
})
```
```tsx
// LibraryFilters/index.tsx:214-217 (existing, verbatim) — macOS-only gating placement,
// exactly where the UI-SPEC says to insert the new rating-filter block
{platformToggle('win')}
{platform === 'linux' && platformToggle('linux')}
{platform === 'darwin' && platformToggle('mac')}
{platformToggle('browser')}
```
`PlatformsFilters` type lives at `src/frontend/types.ts:240` — mirror its shape for a new
`CrossoverRatingFilters` interface (`{ gold, silver, bronze, wontRun, unrated }`, all `boolean`,
default `true`), and `FilterMode` (`'off' | 'show' | 'only'`, `types.ts:247`) is the **tri-state**
type used by `showHidden`/`showNonAvailable` — do NOT reuse `FilterMode` here (UI-SPEC is explicit:
this is the `platformsFilters`-shaped multi-select object, not the tri-state chain).

**Reuse, do not reimplement:** `toggleWithOnly()` (lines 114-131) is the shared only-button
helper — if an "only" affordance is added per rating tier, call this existing function.

---

### `src/frontend/screens/Library/index.tsx` (MODIFIED — D-17 filter application)

**Analog — the `isNonAvailable`/tri-state filter clause** (lines 562-590):
```tsx
// Library/index.tsx:562-590 (existing, verbatim)
const isNonAvailable = (game: GameInfo): boolean => {
  const nonAvailableGames = storage.getItem('nonAvailableGames') || '[]'
  const nonAvailableGamesArray: string[] = JSON.parse(nonAvailableGames)
  return (
    nonAvailableGamesArray.includes(game.app_name) ||
    (game.runner === 'steam' && !!game.is_delisted)
  )
}
...
if (showNonAvailable === 'off') {
  library = library.filter((game) => !isNonAvailable(game))
}
```
This is a `useMemo`-scoped filter chain; the new rating filter is a plain `.filter()` clause
reading `crossoverRatings[game.app_name]` from the new zustand slice, added to the same chain,
and its dependency (`crossoverRatingFilters`, or whatever the state is named) added to the
`useMemo` dependency array shown at lines 593-616. D-17 is filter-only, so this is strictly
additive — no sort comparator is touched.

---

### `src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx` (MODIFIED — D-18)

**Analog — the inline `.infoBox` warning, already in this exact file** (lines 171-180):
```tsx
// WineSelector/index.tsx:171-180 (existing, verbatim)
{useSharedPrefix && (
  <div className="infoBox">
    <FontAwesomeIcon icon={faWarning} />
    <Trans i18n={i18n} i18nKey="setting.warn-use-shared-wine-config" ns="gamepage">
      Only use this option if you know what you are doing.
    </Trans>
  </div>
)}
```
`faWarning` is already imported at line 12 of this file — reuse it (UI-SPEC also names
`faTriangleExclamation` as an option; either is acceptable, but importing a second icon for
the same semantic when one is already in scope is unnecessary). This is the **exact same file**
D-18's warning is specified to land in (UI-SPEC "Install-modal warning position": "inline
within the Steam-bottle install path of `InstallModal`/`WineSelector`, the same region as the
existing shared-prefix warning"). Copy the conditional-render + `infoBox` div shape verbatim;
change only the condition (`is.mac && gameInfo.runner === 'steam' && crossoverRating <= 2`)
and the i18n key/copy per the UI-SPEC Copywriting Contract. Per D-18, this must never gate the
Install button — it is a sibling render, not a blocking modal state.

---

## Shared Patterns

### Zod validation idiom (D-09)
**Source:** `src/backend/schemas.ts` (whole-file idiom: `z.object`/`.refine`/`z.infer`)
**Apply to:** `crossover_index/schema.ts`

### CacheStore TTL + keep-last-good (D-08/D-09)
**Source:** `src/backend/cache.ts` (full mechanics), `src/backend/wiki_game_info/electronStore.ts`
(instantiation idiom), `umuStore`'s `invalidateCheck` usage as the precedent for
`invalidateCheck: () => false`
**Apply to:** `crossover_index/electronStore.ts`, `crossover_index/fetcher.ts`

### Bulk pull-handler + push-channel + zustand slice (D-11)
**Source:** `src/backend/main.ts:1465-1477` (`getAllGameOverrides`/`metadataChanged`),
`src/frontend/state/GlobalState.tsx:1077-1079` (listener registration),
`src/frontend/state/GlobalStateV2.ts:39-40,83-84` (slice)
**Apply to:** `crossover_index/ipc_handler.ts`, `common/types/ipc.ts`, `GlobalState.tsx`,
`GlobalStateV2.ts`

### Content-based miss/error split (Phase 16 D-03/D-09, preserved)
**Source:** `src/backend/wiki_game_info/codeweavers/utils.ts:211-258` (`getInfoFromCodeweavers` —
cacheable sentinel miss vs. thrown/retryable error)
**Apply to:** `crossover_index/index.ts`, `crossover_index/fetcher.ts` — the index's miss path
must not collapse this distinction that the scrape fallback still relies on.

### Overlay badge with `title`/`aria-label`, `pointer-events: none`, absent-when-inapplicable (D-15/D-16)
**Source:** `GameCard/index.tsx:502-511` (`gameCardDelistedBadge`),
`GamePage/components/MacArchBadge.tsx` (derive-class-from-raw-value + return-null-when-N/A)
**Apply to:** the new medal-badge component in `GameCard/index.tsx`

### Multi-select filter object, default-all-true, opt-out semantics (D-17)
**Source:** `LibraryFilters/index.tsx:90-100,137-153,184-189` (`platformsFilters`/`platformToggle`),
`frontend/types.ts:240` (`PlatformsFilters` shape)
**Apply to:** the new `CrossoverRatingFilters` state + `LibraryFilters/index.tsx` UI +
`Library/index.tsx` filter clause

### `meta/` script convention (CI-only utilities, esbuild-piped)
**Source:** `meta/lintTranslations.ts`, `meta/downloadHelperBinaries.ts`, `package.json` script
entries
**Apply to:** `meta/buildCrossoverIndex.ts`, `meta/measureCrossoverMatching.ts`

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `meta/measureCrossoverMatching.ts`'s local-library-cache reader | utility | file-I/O | No existing script reads `store_cache/*_library.json` directly for offline analysis; `CacheStore`'s on-disk convention (`src/backend/cache.ts:22-26`) is the nearest structural reference, not a functional analog. Genuinely new plumbing — small and low-risk (read-only, read a handful of known JSON files). |
| The measurement report writer (dated Markdown) | utility | file-I/O | No existing script in this codebase writes a dated report artifact. Low-risk — a simple `writeFileSync` of a template string is sufficient; no pattern needed. |
| The medal-tier CSS dot shape (bottom-right corner overlay, circular) | component (CSS) | transform (render) | No existing `GameCard` badge is a bare colored circle — all three (`gameCardStatus`, `gameCardUpdateBadge`, `gameCardDelistedBadge`) are rectangular label chips. UI-SPEC's Component Notes section (already read in full) is authoritative here in place of a codebase analog; it explicitly specifies the 10px dot construction. |

## Metadata

**Analog search scope:** `meta/`, `.github/workflows/`, `src/backend/wiki_game_info/**`,
`src/backend/cache.ts`, `src/backend/schemas.ts`, `src/backend/main.ts`, `src/common/types.ts`,
`src/common/types/ipc.ts`, `src/frontend/state/**`, `src/frontend/screens/Library/**`,
`src/frontend/components/UI/LibraryFilters/**`, `src/frontend/screens/Game/GamePage/components/MacArchBadge.tsx`
**Files scanned (read in full or targeted range):** 18
**Pattern extraction date:** 2026-07-13
