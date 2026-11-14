# Phase 47: Migrate store search CheapShark -> ITAD - Pattern Map

**Mapped:** 2026-11-14
**Files analyzed:** 27 (new/modified)
**Analogs found:** 24 / 27
**Precedence:** CONTEXT.md (2026-11-14) wins over RESEARCH.md (2026-11-12). Deltas applied: fresh window 1h (D-08, not 6h); 20 results (D-09); gid map 30d (D-10); drop zero-deal rows (D-11); env `GAMELIB_ITAD_API_KEY` / secret `ITAD_API_KEY` (D-01/02); release fails on missing secret (D-04); user key is a final-wave plan with a rejected-key warning (D-05/06); fallback country is US (D-13); Wave 0 sweep is a blocking `checkpoint:human-action` (D-12).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/backend/storeSearch/itad.ts` (new, replaces `cheapshark.ts`) | service/adapter | request-response | `src/backend/storeSearch/cheapshark.ts` | exact |
| `src/backend/storeSearch/itadCache.ts` (new: cache wrapper + `blockedUntil` gate + single-flight) | service | CRUD (keep-last-good) | `src/backend/crossover_index/stores.ts` + `fetcher.ts` | role-match |
| `src/backend/storeSearch/stores.ts` (new: `createStoreSearchStores`) | config/store factory | CRUD | `src/backend/crossover_index/stores.ts` | exact |
| `src/backend/stores/createStores.ts` (edit) | config | - | itself (`crossoverIndex:` line 31) | exact |
| `src/backend/services/types.ts` (edit, `Stores` ~:82) | config/types | - | `crossoverIndex:` entry :82-84 | exact |
| `src/backend/testUtils/testServices.ts` (edit :16,:149,:182) | test util | - | `crossoverIndex` entries | exact |
| `src/backend/stores/__tests__/fixtures/registeredStores.json`, `__tests__/storeKinds.test.ts` (:116), `stores/__tests__/createStores.test.ts` (:176-187) | test pins | - | `crossover_index` entries | exact |
| `src/backend/storeSearch/handlers.ts` (edit) | controller/handler | request-response | itself | exact |
| `src/backend/miscRuntime.ts` (edit: replace `storeMap` slot :33,:47, import :20-23) | config | - | itself (`macArchPrompts`) | exact |
| `src/backend/sidecar/enrichmentFlowRegistration.ts` (edit :329-341, add ITAD key/gid channels) | route/registration | request-response | `steamgriddb.*` handlers :371-395 | exact |
| `src/common/types/ipc/enrichment.ts` (edit :69-71; new channels) | schema | request-response | `steamgriddb.setApiKey` :74; `localeSettings` :37 | exact |
| `src/preload/api/storeSearch.ts` (edit) | provider/preload | request-response | itself; `preload/api/misc.ts:226` `steamgriddb` | exact |
| `src-tauri/src/ipc_contract.rs` (generated) | config | - | n/a, `pnpm gen:ipc-contract` | generated |
| `src/common/types/storeSearch.ts` (edit) | model | - | itself | exact |
| `src/common/discounts/storeMapping.ts` + `src/backend/__tests__/storeMapping.test.ts` (edit: rename `ITAD_SHOP_TO_RUNNER`) | utility | transform | itself | exact |
| `src/backend/storeSearch/__tests__/itad.test.ts`, `itadCache.test.ts` (new; replace `cheapshark.test.ts`), `handlers.test.ts` (edit) | test | - | `cheapshark.test.ts` | exact |
| `meta/backendDiCeilings/storeSearch.json` (edit) | config | - | itself | exact |
| `meta/measureItadCoverage.ts` (new, Wave 0, operator-run) | utility/script | batch | other `meta/*.ts` scripts run via `meta/runTs.cjs` (not read; planner to pick one) | partial |
| `package.json` `build:sidecar` + wrapper (edit :37) | config | build | itself | role-match |
| `.github/workflows/release-tauri.yml` (edit ~:162-168, :335) | config/CI | build | job-level `env:` secrets, `Build self-contained sidecar` step | exact |
| `src/backend/__tests__/releaseWorkflow.test.ts` (edit) | test | - | itself | exact |
| `src/frontend/screens/StoreSearch/helpers.ts` (edit: `formatPrice`, `formatCachedAt`) | utility | transform | `Humble/Keys/syncAge.ts` | role-match |
| `src/frontend/screens/StoreSearch/__tests__/formatUsdPrice.test.ts` (edit) | test | - | itself | exact |
| `StoreSearch/index.tsx` (edit: region caption, notes, error variants, badge gid join) | component | request-response | itself | exact |
| `StoreSearch/hooks/useDebouncedStoreSearch.ts` (edit :101) | hook | request-response | itself | exact |
| `StoreSearch/hooks/useOwnedSteamGids.ts` (new) | hook | request-response | `useDebouncedStoreSearch.ts` (generation guard) | role-match |
| `StoreSearch/components/StoreSearchRow/index.tsx`, `StoreSearchBreakdown/index.tsx` (edit :58, :98) | component | request-response | themselves | exact |
| `StoreSearch/index.css` | style | - | itself | exact |
| `public/locales/en/translation.json` | config | - | `storeSearch.*` block (~:1180) | exact |
| `src/backend/storeSearch/itadSecretStore.ts` + boot wiring (D-05, last wave) | service | CRUD | `src/backend/steamgrid/secretStore.ts`, `src/backend/sidecar/steamgridSecretStore.ts`, `bootstrap.ts:315,1726` | exact |
| `src-tauri/src/main.rs` `keyring_account` (:459-466) + test (:2890+) | config | - | `"steamgrid-api-key"` arm | exact |
| `Settings/components/ItadApiKey.tsx` + `AdvancedSettings/index.tsx` (:44-47) + `components` barrel | component | CRUD | `SteamGridDbApiKey.tsx` | exact |
| `src/frontend/helpers/declaredUnavailable.ts` (ITAD channel map, only if `callOrDeclare` is reused) | utility | - | `STEAMGRIDDB_CHANNEL_BY_MEMBER` :164 | exact |

## Pattern Assignments

### `src/backend/storeSearch/itad.ts` (service, request-response)

**Analog:** `src/backend/storeSearch/cheapshark.ts`

**Imports + deps seam** (cheapshark.ts:1-10, 81-92):
```typescript
import axios from 'axios'
import type { MiscRuntimeSlice } from '../miscRuntime'
import type { AppInfo } from 'backend/process/context'
import { logError, LogPrefix } from 'backend/logger'
import { resolveRunner } from 'common/discounts/storeMapping'
import type { StoreSearchResult, StoreSearchDeal } from 'common/types/storeSearch'

export type StoreSearchDeps = {
  appInfo: Pick<AppInfo, 'version'>
} & MiscRuntimeSlice<'storeMap'>   // <- becomes the ITAD gate slice + stores + key getter

function buildHeaders(deps: { appInfo: Pick<AppInfo, 'version'> }): Record<string, string> {
  return { 'User-Agent': `GameLib/${deps.appInfo.version}` }
}
```

**Core pattern** (cheapshark.ts:182-203). Keep `axios` + `params` (auto-encoding), `timeout: 15000`, log-then-rethrow; swap in the 2-call ITAD flow and cache/gate from RESEARCH "Adapter skeleton":
```typescript
try {
  const { data } = await axios.get<...>(`${BASE}/games`, {
    params: { title: query, limit: 60 }, timeout: 15000, headers: buildHeaders(deps)
  })
  return mapSearchResults(data)
} catch (err) {
  logError(`Failed to search CheapShark for "${query}": ${String(err)}`, LogPrefix.Backend)
  throw err
}
```
**Delta (load-bearing):** do NOT copy the `String(err)` log line. ITAD's key rides in the request, so axios errors carry it. Log `{endpoint, status}` only (RESEARCH Pitfall 3) and add a test that a fake key in `err.config` never reaches `logError`. Use `results: 20` (D-09; param name confirmed by Wave 0 fixtures). Drop zero-deal rows (D-11). 401/403 from a user key retries once with the built-in key and flags the session (D-06). Key precedence: user > `process.env.GAMELIB_ITAD_API_KEY` > baked `__ITAD_API_KEY__`.

**Verbatim URL (D-specifics):** replace `buildRedirectUrl` (cheapshark.ts:102-104) with a validate-never-rewrite pass-through. Comment it as contractual (ITAD terms), not stylistic; drop deals whose `new URL(u).protocol !== 'https:'`.

**Error code for UI (UI-SPEC open item 3):** `handlers.ts` rethrows `err`; add a stable message prefix or typed error (`rateLimited`, `notConfigured`) the renderer can match, because IPC flattens errors.

---

### `src/backend/storeSearch/stores.ts` (store factory) and registration edits

**Analog:** `src/backend/crossover_index/stores.ts` (whole file, 44 lines) and `wiki_game_info/stores.ts`

```typescript
import CacheStore from '../cache'
import type { StoreRoot } from 'backend/stores/storeRoot'

export interface CachedIndex<T> { data: T; fetchedAt: number }

export function createStoreSearchStores(deps: { root: StoreRoot }) {
  // keep-last-good: invalidateCheck () => false => never evicted on read; the adapter
  // compares fetchedAt itself (fresh for 1h per D-08; gid entries 30d per D-10).
  const itadPricesStore = new CacheStore<CachedIndex<unknown>>('itad_prices', 60 * 24 * 30, {
    root: deps.root, kind: 'cache', invalidateCheck: () => false
  })
  const itadSteamGidsStore = new CacheStore<...>('itad_steam_gids', 60 * 24 * 30, { root: deps.root, kind: 'cache', invalidateCheck: () => false })
  return { itadPricesStore, itadSteamGidsStore }
}
```
Pick a lifespan >= the longest retention the adapter wants (the store TTL is only a ceiling when `invalidateCheck` is `() => false`).

**Registration checklist** (each has a `crossoverIndex` line to clone):
- `stores/createStores.ts:8,31`: `import { createStoreSearchStores } from 'backend/storeSearch/stores'` + `storeSearch: createStoreSearchStores(deps),`
- `services/types.ts:82-84`: `storeSearch: ReturnType<typeof import('backend/storeSearch/stores').createStoreSearchStores>`
- `testUtils/testServices.ts:16,149,182`: import + name list + `storeSearch: (deps) => createStoreSearchStores(deps)`
- `registeredStores.json`: add two entries shaped `{registeredAs:null, options:{cwd:'store_cache', name:'itad_prices', clearInvalidConfig:true, schemaKeys:null}, declaration:{kind:'cache'}}` (see crossover_index entry, same fields)
- `storeKinds.test.ts:116`: `itad_prices: 'cache', itad_steam_gids: 'cache'`
- `createStores.test.ts:176-187`: pin lifespan + `invalidateCheck({})` false
- `enrichmentFlowRegistration.ts:196` `EnrichmentFlowDeps.stores` `Pick<>`: add `'storeSearch'`

**Dots-in-key pitfall:** hash the query component (`search:<country>:<hash>`); unit-test `"S.T.A.L.K.E.R."`.

---

### `src/backend/storeSearch/itadCache.ts` (gate + single-flight, no timers)

**Analog:** `crossover_index/fetcher.ts` (reads `fetchedAt` itself; not re-read here, planner to open `loadIndex`). Pattern is a pure module with an injectable clock (`now: () => number`), `blockedUntil` epoch ms, `Map<string, Promise>` single-flight cleared in `finally`. **No `setTimeout`/`setInterval`** (CLAUDE.md sidecar exit contract; D-08 stale retention gives the 429 fallback). Clamp `Retry-After` to [1s, 15min], default 60s.

Per-boot state holder: replace `storeMap` in `miscRuntime.ts` (:33 `storeMap: StoreMapCache`, :47 `storeMap: createStoreMapCache()`, :20-23 import):
```typescript
export interface MiscRuntime { metadataOverrides: ...; macArchPrompts: ...; /* storeMap -> itadGate */ }
export function createMiscRuntime(deps: MiscRuntimeDeps): MiscRuntime {
  return { ..., storeMap: createStoreMapCache() }
}
export interface MiscRuntimeSlice<K extends keyof MiscRuntime> { miscRuntime: Pick<MiscRuntime, K> }
```
Also fix `handlers.ts` and its test deps, which construct `miscRuntime: { storeMap: ... }`.

---

### `src/backend/storeSearch/handlers.ts` (handler, rethrow contract)

**Analog:** itself (:46-85). Keep try/log/RETHROW verbatim; the header says rethrow is "DELIBERATE and LOAD-BEARING". Changes: `handleSearchStores(deps, query, country?)`, `handleGetStoreSearchDeals(deps, gameId, country?)`; default country `'US'` when missing; swap import `./cheapshark` -> `./itad`. A cached-fallback return is a success (carries `cachedAt`); the throw stays for no-cache. Decide `handleGetStoreSearchStoreMap`: shim or delete (CONTEXT discretion; deleting requires `gen:ipc-contract` and allow-list tests, and removing the `getStoreSearchStoreMap` line in `preload/api/storeSearch.ts`).

---

### `src/backend/sidecar/enrichmentFlowRegistration.ts` + `src/common/types/ipc/enrichment.ts` + preload

**Analog:** same file :329-341, :371-395; schema :69-74.

Registration (:329-337), add the country arg:
```typescript
deps.ipc.handle('searchStores', async (_event: unknown, ...args: unknown[]) =>
  handleSearchStores(deps, args[0] as string /*, args[1] as string | undefined */))
```
Schema (enrichment.ts:69-71; `optionalArg` imported :18, `searchTerm` :26):
```typescript
searchStores: z.tuple([searchTerm, optionalArg(z.string().regex(/^[A-Z]{2}$/))]),
getStoreSearchDeals: z.tuple([nonEmptyString(256), optionalArg(z.string().regex(/^[A-Z]{2}$/))]),
```
New keyless gid channel (RESEARCH D4): `getItadSteamGids: z.tuple([z.array(z.string().regex(/^\d{1,10}$/)).max(1000)])`; preload `export const getItadSteamGids = makeHandlerInvoker('getItadSteamGids')` in `preload/api/storeSearch.ts`. Existing channels with changed args need no contract regen; NEW or REMOVED channels do: `pnpm gen:ipc-contract`, verify `pnpm check:ipc-contract`, and update `rendererAllowList.test.ts`.

User-key channels (last wave) copy `steamgriddb.hasApiKey/setApiKey` (:371-395) including the WR-01 non-string guard:
```typescript
const key = args[0]
if (typeof key !== 'string') { logWarning('steamgriddb.setApiKey: ignored a non-string key', LogPrefix.Backend); return }
await deps.steamGridSecrets.setApiKey(key)
```
Schema: `'steamgriddb.setApiKey': z.tuple([z.string().max(256)])` (:74). Name new channels `itad.hasApiKey/setApiKey` (+ a status channel for the D-06 rejected flag). Preload nesting analog: `preload/api/misc.ts:226-232`.

---

### `src/backend/storeSearch/itadSecretStore.ts` (D-05 final wave)

**Analogs:** `src/backend/steamgrid/secretStore.ts` (interface + `createSteamGridDbSecrets({store})` factory, lines 45-56, 154-164), `src/backend/sidecar/steamgridSecretStore.ts` (the `SidecarKeyringSlotStore` subclass; not read, planner opens it; `SidecarKeyringSlotStore` is in `sidecar/keyringTokenStore.ts:162`), boot step `bootstrap.ts:315` / `:1726` (`'steamgrid-secrets'`), `bootstrap.ts:93-97,567,611,656,703`, `sidecar/handlers.ts:297`, `services/types.ts:61,395-398`, `testServices.ts`. Clone the whole chain for an `itadSecrets` owner. Total-method contract: never throws. Boot step must run before `'register-handlers'`.

Rust allow-list (`src-tauri/src/main.rs:459-466`):
```rust
"steamgrid-api-key" => Ok("steamgrid-api-key"),
// add: "itad-api-key" => Ok("itad-api-key"),
```
plus a test next to `main.rs:2890+` (`keyring_account_maps_...`) and a distinct-account non-collision assertion.

---

### Build/CI key injection (D-01..D-04)

**`package.json:37`** (single esbuild command; no define exists today):
```
"build:sidecar": "esbuild --bundle --platform=node --target=node22 --format=cjs --packages=external --outfile=build/main/sidecar.js src/sidecar/index.ts"
```
Add `--define:__ITAD_API_KEY__=...` fed from env. A shell-quoted JSON string in an npm script is fragile; prefer a tiny `meta/` wrapper script (check `build:sidecar-sea` / `meta/buildSidecarSea.ts` for the existing wrapper convention) that reads `process.env.ITAD_API_KEY`, defaults the define to `""` (so keyless dev/PR/test builds stay green, D-03), and never logs the value. Declare `__ITAD_API_KEY__` in a `declare const` d.ts and guard with `typeof` so jest (no define) works.

**`release-tauri.yml`** secret pattern (:162-168, job-level `env:`; step-level for SEA build :335):
```yaml
env:
  TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
...
- name: Build self-contained sidecar (Node SEA)
  env:
    GAMELIB_SIDECAR_TARGET_TRIPLE: ${{ matrix.sidecar_triple }}
  run: pnpm build:sidecar-sea
```
Add `ITAD_API_KEY: ${{ secrets.ITAD_API_KEY }}` to that step's `env:` plus a preceding fail-fast shell step (`test -n "$ITAD_API_KEY" || { echo "::error::ITAD_API_KEY missing"; exit 1; }`, D-04). Note the file's comments (:340-375) about the Apple secrets: a conditional job-level `env:` map is the wrong tool; read secrets through `IN_*`-style step `env:` and a shell body. Dry-run handling uses `env.GAMELIB_DRY_RUN` (:~175); decide whether dry runs also fail (D-04 says release build). `src/backend/__tests__/releaseWorkflow.test.ts` pins this workflow (e.g. bans upload-artifact/cache); update it and never echo the secret.

---

### `src/common/types/storeSearch.ts` (model)

**Analog:** itself. Additive: `StoreSearchResult.cachedAt?: number`, `StoreSearchDeal.cachedAt?: number`; `steamAppId?` now injected renderer-side; `StoreSearchStore.isActive` always true. Add `pricedCountry` (UI-SPEC §4) on the search response: this changes the return shape of `searchStores` from `StoreSearchResult[]`. Choose a `{ results, pricedCountry }` envelope or a per-result field, and update `useDebouncedStoreSearch` + `StoreSearchScreen.test.tsx` mocks accordingly. Rewrite the file header comment ("always the US dollar code today", lines 4-14).

### `src/common/discounts/storeMapping.ts`

**Analog:** itself (:15-20). Rename to `ITAD_SHOP_TO_RUNNER`: `'61': 'steam'`, `'35': 'gog'`, Epic `'legendary'` id from the Wave 0 `/service/shops/v1` dump (do not hardcode 16). Delete the `'4': 'nile'` entry and its Amazon comment. Single production importer is the adapter.

---

### `src/frontend/screens/StoreSearch/helpers.ts` (utility, transform)

**Analog:** `src/frontend/screens/Humble/Keys/syncAge.ts:42-53` (`toI18nextCode` + try/catch):
```typescript
import { toI18nextCode } from 'common/languages'
try {
  return new Intl.NumberFormat(toI18nextCode(language), options).format(value)
} catch {
  return new Intl.NumberFormat('en', options).format(value)   // formatPrice falls back to `${amount} ${currencyCode}` instead
}
```
`formatPrice(amount, currencyCode, language)` per RESEARCH "Currency formatter" and UI-SPEC Currency Contract (append ISO code only when absent; ONE string/node). `formatCachedAt` uses `Intl.DateTimeFormat(..., {dateStyle:'medium', timeStyle:'short'})` with `new Date(cachedAt).toLocaleString()` fallback. Replace `formatUsdPrice` (helpers.ts:19). `buildOwnedBadgeLabel` and its `// i18n-gate-exempt` comment stay untouched. Tests: edit `__tests__/formatUsdPrice.test.ts`; add `formatPrice` describe (USD/en, EUR/de, GBP/en-GB, CAD/en, JPY/ja, bad code); keep `buildOwnedBadgeLabel` tests. Grep knip/i18n gates before renaming the file.

### `StoreSearch/index.tsx` (container)

**Analog:** itself. Pieces to add:
- Country: `getLocaleSettings(toShippedLanguage(i18n.language), getStoredRegionOverride()).countryCode` (`Discounts/helpers.ts:145`, `Discounts/index.tsx:60`; cross-screen import, hoist to `src/common/` if lint complains).
- Badge join (keep `resolveStoreSearchBadges` untouched; inject `steamAppId`):
```typescript
resolveStoreSearchBadges(
  { ...result, steamAppId: gidToAppId.get(result.gameId) },
  { steam: steam.library, gog: gog.library, epic: epic.library, amazon: amazon.library },
  keysWaiting)
```
  `gidToAppId` from `useOwnedSteamGids` over `steam.library[].app_name` + `keysWaiting[].steamAppId` (non-empty, not `'0'`), failure -> empty map (never block search).
- Error variants: extend the existing banner (index.tsx:~100-118, `storeSearchScreen__errorBanner`) by branching on the rethrown error code: generic / `rateLimited` / `notConfigured` (no Retry button). Raw error is logged, never rendered (hook :107-114).
- Region caption (always visible) and `role="note"` region-fallback note keyed on `pricedCountry !== requestedCountry`.

### `hooks/useDebouncedStoreSearch.ts`

**Analog:** itself :93-117. Change `window.api.searchStores(searchQuery)` -> `(searchQuery, countryCode)` (take country as hook arg; it must be a stable dep so a region change re-searches without spamming). Preserve debounce 400ms / 3 chars / generation counter. The hook must now surface the error code, not just `'error'`.

### `useOwnedSteamGids.ts` (new)
**Analog:** generation-counter + cancelled-flag pattern from `StoreSearchBreakdown` (:25-48) / the hook above. Call `window.api.getItadSteamGids(appids)` once per library change; swallow errors with `window.api.logError(...)`.

### `StoreSearchRow/index.tsx` (:58) and `StoreSearchBreakdown/index.tsx` (:98)

Replace `formatUsdPrice(x, y)` with `formatPrice(x, y, i18n.language)` (both import it; Row line :11, Breakdown line :8). Add the cached-at line as a SIBLING element, never inside the price node:
```tsx
<span className="storeSearchRow__price">{formatPrice(result.cheapestPrice, result.currencyCode, language)}</span>
{result.cachedAt !== undefined && (
  <span className="storeSearchRow__cached" title={t('storeSearch.cachedTitle', '...')} aria-label={t('storeSearch.cachedTitle', '...')}>
    <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden />{t('storeSearch.cached', 'Price from {{time}}', { time: formatCachedAt(result.cachedAt, language) })}
  </span>)}
```
Breakdown: pass country into `window.api.getStoreSearchDeals(gameId, country)`; sort by price asc then store name; `deal.buyUrl` passes to `openExternalUrl` unchanged (:76,:79). Add `faClockRotateLeft`, `faCircleInfo` imports from `@fortawesome/free-solid-svg-icons` (Row already imports `faChevronDown`).

---

### `Settings/components/ItadApiKey.tsx` (component, CRUD) (D-05, last wave)

**Analog:** `src/frontend/screens/Settings/components/SteamGridDbApiKey.tsx` (whole file, ~100 lines). Copy structure exactly: `useTranslation()` + `useTranslation('gamelib')`, `value/hasKey/unavailable` state, `useEffect` -> `callOrDeclare({channel, feature, deferral, call})`, `TextInputField type="password"`, `htmlId="itad-api-key"`, `labelHelp={<InfoBox text={t('settings.advanced.details','Details')} iconOnly>...}`. Add a `role="status"` `--status-danger` line for the D-06 rejected state (cleared on change/clear). `callOrDeclare` constants (`STEAMGRIDDB_FEATURE`, `DEFERRAL_D03`) are SteamGridDB-specific (deferral D-03); an ITAD key is live on Tauri, so call `window.api.itad.*` directly with a try/catch to a disabled state, or add ITAD-named maps beside `declaredUnavailable.ts:164`. Planner decision. Mount in `AdvancedSettings/index.tsx` after the SteamGridDB block (:44-47):
```tsx
<div className="advancedSetting">
  <SteamGridDbApiKey />
  <hr />
</div>
```
plus `ItadApiKey` in the `../../components` barrel (imported :14-15). Copy strings from UI-SPEC copy table; add `settings.itad.apikey.rejected` (CONTEXT D-06 asks planner to add it to the table; UI-SPEC already lists it) and a `gamelib` `settings.itad.apikey.unavailable`.

---

### Tests

**Analog:** `src/backend/storeSearch/__tests__/cheapshark.test.ts` (:1-37): `jest.mock('axios')`, `jest.mock('backend/logger')`, `const mockedAxios = axios as jest.Mocked<typeof axios>`, `defined` from `backend/testUtils/indexed`, fresh `deps` in `beforeEach`. Required new cases: verbatim `deal.url` with affiliate tags/encoded chars/fragment byte-equal (Pitfall 4); non-https dropped; key never reaches `logError` args (Pitfall 3); 429 -> stale with `cachedAt`; 429 no cache -> throws `rateLimited`; `blockedUntil` honoured with injected clock; dotted-title key; zero-deal row dropped; fresh-within-1h makes no request; user-key 401 -> built-in key. Fixtures come from the Wave 0 sweep (assert no `key=` substring). Any new file using `jest.mock` needs an entry in `meta/backendDiCeilings/storeSearch.json` (currently `cheapshark.test.ts: 2`, `handlers.test.ts: 2`; rename/add `itad.test.ts`).

## Shared Patterns

### Provider-error rethrow
**Source:** `src/backend/storeSearch/handlers.ts:46-56`. Apply to every handler. Serve-from-cache = success; throw only with no cache.

### Sidecar exit contract / no timers
**Source:** CLAUDE.md Conventions (`Skill("gamelib-conventions")`). Apply to `itadCache.ts`, `itad.ts`. `blockedUntil` timestamp compare, no boot prefetch, no `setTimeout` backoff.

### Never log the key or full URL
Apply to `itad.ts`, `itadSecretStore.ts`, the measurement script, release workflow. `{endpoint, status}` only.

### Secret storage
**Source:** `steamgrid/secretStore.ts` + keyring allow-list (`main.rs:459`). Not `config.json`.

### i18n
**Source:** `StoreSearch/index.tsx` `t('key', 'default')` calls, no namespace; keys in `public/locales/en/translation.json`. Check `i18nCatalogPresenceBaseline.json` before adding keys (UI-SPEC / RESEARCH D2).

### Generated artifacts and gates
`pnpm gen:ipc-contract` / `check:ipc-contract` for added or removed channels; `pnpm build:sidecar` before live testing (memory: `tauri dev` does not rebuild the sidecar); `npx prettier --check` over exact written paths in every `<verify>` (check `--file-info` first), per CLAUDE.md. If any spawn is added in `meta/measureItadCoverage.ts` use `createFakeHomeProfile()` (the planned script uses HTTP only).

### Currency Contract
Amend by adding "Superseded by 47-UI-SPEC.md." atop `.planning/milestones/v0.6-phases/20-aggregated-store-search-cheapshark/20-UI-SPEC.md` Currency Contract (lines ~246-265); do not rewrite history.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| esbuild `--define` key injection wrapper | build script | build | No existing build-time constant injection in `package.json` (verified by RESEARCH grep); use RESEARCH D7 mechanism + `meta/buildSidecarSea.ts` as a wrapper-convention reference |
| Release fail-fast on missing secret | CI | build | `release-tauri.yml` has no "secret must be non-empty" guard for ITAD; Apple-secret `IN_*` shell-body pattern (:340-375) is the nearest idiom |
| `meta/measureItadCoverage.ts` | script | batch | No HTTP sweep script identified; follow `meta/runTs.cjs --bundle --platform=node --target=node22` invocation convention. Output must be redacted, committed to the phase dir (D-12) |

## Metadata

**Analog search scope:** `src/backend/{storeSearch,crossover_index,wiki_game_info,steamgrid,sidecar,stores,services,testUtils}`, `src/common/{types,discounts}`, `src/preload/api`, `src/frontend/screens/{StoreSearch,Settings,Humble,Discounts}`, `src-tauri/src/main.rs`, `.github/workflows/release-tauri.yml`, `package.json`
**Files read this pass:** ~20 (graphify query used first per CLAUDE.md; graph.json/GRAPH_REPORT.md never opened)
**Not re-read (note for planner):** `sidecar/steamgridSecretStore.ts`, `crossover_index/fetcher.ts`, `meta/buildSidecarSea.ts`, `releaseWorkflow.test.ts` internals; RESEARCH.md lines 430-532 (Validation Architecture) were truncated from my view, so check them for test-map details.
**Pattern extraction date:** 2026-11-14
