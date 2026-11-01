# Phase 57: Opt-in known-fix sharing via relay - Pattern Map

**Mapped:** 2026-11-02
**Files analyzed:** 22 (new/modified)
**Analogs found:** 14 / 22 (the 8 relay Worker files have no Worker-runtime analog; see "No Analog Found")

Decisions D-17..D-20 are applied: 408/429 retryable (not marked), Mach-O reports are one-shot best effort, payload drops `title`, operator-closed PRs suppress later reports.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/common/knownFixReport.ts` | utility (shared schema) | transform | `src/backend/knownFixes.ts` (`TIER1_ROUTING_KEYS`, `filterTier1KnownFixes`) | role-match |
| `src/common/__tests__/knownFixReport.test.ts` | test | transform | `src/common/jest.config.js` project shape plus `src/backend/__tests__/knownFixesMacArch.test.ts` | role-match |
| `src/backend/knownFixReport.ts` | service (client leaf) | request-response, fire-and-forget | `src/backend/knownFixesFetcher.ts` | exact |
| `src/backend/__tests__/knownFixReport.test.ts` | test | request-response | `src/backend/__tests__/knownFixesFetcher.test.ts` | exact |
| `src/backend/__tests__/knownFixReportDrift.test.ts` | test | transform | `src/backend/__tests__/knownFixesLayered.test.ts` | role-match |
| `src/backend/knownFixes.ts` (modify: export `TIER1_ROUTING_KEYS`, add `readKnownFixesWithLayer`) | utility | file-I/O | itself, `readKnownFixes` L299-319 | exact |
| `src/backend/storeManagers/steam/electronStores.ts` (modify: `steamKnownFixReportStore`) | store | CRUD | `steamRestartHoldStore` L51-57 | exact |
| sent-record access inside `knownFixReport.ts` (lazy require) | store accessor | CRUD | `src/backend/storeManagers/steam/steamRestartHold.ts` L28-40 | exact |
| `src/backend/storeManagers/steam/library.ts` (modify: hook in `verifyMacArchGroundTruth`) | service hook | event-driven | itself, L1990-2020 | exact |
| `src/backend/storeManagers/steam/games.ts` (modify: hook in `persistBridgeDrmSignal`) | service hook | event-driven | itself, L2596-2611 | exact |
| `src/common/types.ts` (modify: `shareDetectedFixes`) | model | config | `notifyHumbleExpirations` L113 | exact |
| `src/backend/config.ts` (modify: default `false`) | config | config | `notifyHumbleExpirations: true` L343 | exact |
| `src/frontend/screens/Settings/components/ShareDetectedFixes.tsx` | component | request-response | `NotifyHumbleExpirations.tsx` plus `AdvertiseAvxForRosetta.tsx` (mac gate) | exact |
| `Settings/components/index.ts` and `GeneralSettings/index.tsx` (modify) | component wiring | n/a | `EnableSteamNativeInstall` export L28 / usage L11, L40 | exact |
| `public/locales/en/translation.json` (regenerate via `pnpm i18n`) | config | n/a | existing `setting.*` / `help.*` keys | exact |
| `PRIVACY.md` (modify) | doc | n/a | itself | n/a |
| `jest.config.js` (modify: add Relay project) and `relay/jest.config.js` | config | n/a | `src/common/jest.config.js` | exact |
| `relay/src/handler.ts`, `limits.ts`, `steamTitle.ts`, `githubFiles.ts` | service | request-response | `knownFixesFetcher.ts` (injectable-transport style only) | partial |
| `relay/src/fileEdit.ts` | utility | transform | `filterTier1KnownFixes` (pure JSON-object validation) | partial |
| `relay/src/githubApp.ts`, `index.ts`, `env.ts`, `wrangler.jsonc`, `migrations/0001_init.sql`, `package.json`, `tsconfig.json` | service / config / migration | request-response | none | none |
| `relay/src/__tests__/*` helpers (D1Like adapter, scripted fake fetch, WebCrypto keypair) | test | request-response | `makeGet` in `knownFixesFetcher.test.ts` L55-66 | role-match |

## Pattern Assignments

### `src/backend/knownFixReport.ts` (service, fire-and-forget request-response)

**Analog:** `src/backend/knownFixesFetcher.ts`

**Leaf-module header rule** (L23-25): "MUST NOT import `electron`, `backend/ipc` or `backend/utils`". Exception for this phase: the abort registry import `backend/utils/aborthandler/aborthandler` is required by the exit contract. It is a pure Map module, so import it by that deep path only (never `backend/utils`).

**Imports** (L27-41):
```typescript
import axios from 'axios'
import { filterTier1KnownFixes } from './knownFixes'
import { logInfo, logWarning, LogPrefix } from './logger'
```

**URL constant + injectable transport + default** (L43-67); copy this shape, swapping `get` for `post`:
```typescript
export const GAMELIB_KNOWN_FIXES_BASE =
  'https://raw.githubusercontent.com/grayson-mitchell/known-fixes/main'

export type KnownFixesGet = (
  url: string
) => Promise<{ status: number; data: unknown }>

const defaultGet: KnownFixesGet = async (url) => {
  const res = await axios.get(url, {
    timeout: 10000,
    responseType: 'text',
    transformResponse: (r) => r,
    validateStatus: () => true
  })
  return { status: res.status, data: res.data }
}
```
New module: `GAMELIB_FIX_RELAY_URL` const plus `relayUrl()` reading `process.env.GAMELIB_FIX_RELAY_URL`, `RelayPost = (url, body, signal) => Promise<{status, data}>`, `defaultPost` with `validateStatus: () => true`, `maxRedirects: 0`, `timeout: 8000`, `signal`.

**Never-throws wrapper** (L156-170); copy verbatim in spirit:
```typescript
/** Never rejects. */
export async function fetchRemoteKnownFixes(appName, runner, get = defaultGet) {
  try {
    await run(appName, runner, get)
  } catch (error) {
    logWarning(`Known fixes fetch failed for ${appName}: ${error}`, LogPrefix.Backend)
  }
}
```
New export is sync-returning `reportDetectedFix(args, deps?): void` that does `void run(...).catch(logWarning)`, so call sites cannot await it.

**Per-failure log-and-return** (L98-115): network error -> `logWarning` + return (not marked); non-2xx -> `logWarning(status)` + return. Map to D-16/D-17: 2xx mark; 4xx except 408/429 mark; 408/429/5xx/network/abort not marked.

**Exit contract (no in-repo example of a registered send; use the registry directly)** from `src/backend/utils/aborthandler/aborthandler.ts`:
```typescript
function createAbortController(id: string): AbortController {
  const abortController = new AbortController()
  abortControllers.set(id, abortController)
  return abortController
}
// exports: createAbortController, callAbortController, callAllAbortControllers, deleteAbortController, hasAbortController
```
Register as `createAbortController('known-fix-report:' + key)`, `deleteAbortController` in `finally`, signal = `AbortSignal.any([ctrl.signal, AbortSignal.timeout(8000)])`.

**Version:** `app.getVersion()` from `backend/platform` (not `getHeroicVersion`); inject for tests.

**Skip rule inputs** (D-12): `readKnownFixesWithLayer` (new sibling of `readKnownFixes`, see below), `GlobalConfig.get().getSettings().shareDetectedFixes === true` read at send time.

---

### `src/backend/knownFixes.ts` (modify)

**Analog:** itself, `readKnownFixes` L299-319:
```typescript
export function readKnownFixes(appName: string, runner: Runner): KnowFixesInfo | null {
  const layers: [string, string][] = [
    [localFixesPath, 'local'],
    [bundledFixesPath, 'bundled'],
    [fixesPath, 'remote']
  ]
  for (const [dir, label] of layers) {
    const parsed = readFixesFileWithin(dir, appName, runner, TIER1_FILE_SUFFIX, label)
    if (parsed === null) continue
    const filtered = filterTier1KnownFixes(appName, label, parsed)
    if (filtered !== null) return filtered
  }
  return null
}
```
Add `readKnownFixesWithLayer` as a copy of this loop returning `{ fix, layer: label }`; leave `readKnownFixes`' signature unchanged. Also change L114 `const TIER1_ROUTING_KEYS = ['macArch', 'drm'] as const` to `export const` (needed by the drift test; note ts-prune: it will be used in a test only, so add a `// ts-prune-ignore-next` as `steamRestartHoldStore` does, or import it from non-test code).

---

### `src/backend/storeManagers/steam/electronStores.ts` + lazy accessor

**Analog:** L51-57 of `electronStores.ts` and L28-40 of `steamRestartHold.ts`.

Store declaration:
```typescript
// lazy `require('./electronStores')` in steamRestartHold.ts, which ts-prune
// cannot trace. The export is deliberate.
// ts-prune-ignore-next
export const steamRestartHoldStore = new CacheStore<unknown>(
  'steam_restart_hold',
  null
)
```
New: `steamKnownFixReportStore = new CacheStore<unknown>('steam_known_fix_reports', null)`.

Lazy accessor + structural store interface so tests inject an in-memory fake:
```typescript
/** Structural subset of CacheStore, so tests can pass an in-memory fake. */
export interface SteamRestartHoldStore {
  get: (key: string) => unknown
  set: (key: string, value: SteamRestartHoldRecord) => void
  ...
}
function defaultStore(): SteamRestartHoldStore {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { steamRestartHoldStore } =
    require('./electronStores') as typeof import('./electronStores')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return steamRestartHoldStore as unknown as SteamRestartHoldStore
}
```
Parse persisted values defensively (`parseRecord`, L42+: check `typeof`, return `undefined`). Path from `backend/knownFixReport.ts` to the store is `./storeManagers/steam/electronStores`.

Note: the closed list `RECOGNIZED_CACHE_STORE_NAMES` is only referenced in `src/frontend/state/__tests__/GlobalStateSteamCacheHydration.test.ts`; `steam_restart_hold` is not registered anywhere outside `electronStores.ts`, so no registry edit is needed for a backend-only store. Planner: grep once more before adding the store.

---

### `src/backend/storeManagers/steam/library.ts` (hook, event-driven)

**Analog:** itself. Insert after the contradiction warning and verdict-32 log (L2006-2020), before `void promptI386Recovery`:
```typescript
  if (wasKnownFix32 && verdict === '64') {
    logWarning(`Steam: curated known-fixes entry ${appId}-steam.json macArch "32" is contradicted ...`, LogPrefix.Steam)
    // + void reportDetectedFix({ appId, key: 'macArch', value: '32', op: 'remove', detector: 'macho' })
  }

  if (verdict === '32') {
    logInfo(formatMacArch32KnownFixEntry(appId, library.get(appId)?.title), LogPrefix.Steam)
    // + void reportDetectedFix({ appId, key: 'macArch', value: '32', op: 'add', detector: 'macho' })
    // MAC32-03/CONTEXT D-6: decoupled — never awaited here ...
    void promptI386Recovery(appId)
  }
```
Early-return guard at L1944-1949 (`mac_arch_verified === true || (mac_arch === '32' && source !== 'known-fix')`) is why D-18 says one shot. Do not add a retry seam. Import `reportDetectedFix` from `backend/knownFixReport` (leaf, no import-cycle risk).

### `src/backend/storeManagers/steam/games.ts` (hook, event-driven)

**Analog:** itself, `persistBridgeDrmSignal` L2596-2611:
```typescript
    if (drm === undefined) return null
    writeBridgeDrmVerdict(this.appId, drm ? 'ceg' : undefined)
    if (drm?.kind !== 'ceg') return null
    // INSERT HERE: void reportDetectedFix({ appId: this.appId, key: 'drm', value: 'ceg', op: 'add', detector: 'ceg' })
    if (readBridgeVerdict(this.appId)?.userRoute === 'bridge') { ...return null }
    return drm.markers
```
Hook must sit before the `userRoute === 'bridge'` early return (Pitfall 6). One edit covers both call sites (L2460, L4469).

---

### `src/common/knownFixReport.ts` (shared schema)

**Analog:** `src/backend/knownFixes.ts` L114 and `filterTier1KnownFixes` (L204). Import only `zod` plus relative paths (wrangler esbuild cannot resolve `common/...` alias or `backend/`). Per D-19 the schema has NO `title` field; keep `.strict()` so a stale client sending `title` is rejected or, if tolerated, explicitly `.optional()` and ignored. Planner decision: prefer strict-reject-unknown since the only client is this repo. Schema body is in RESEARCH.md "Shared schema" (drop the `title` line).

### `src/common/__tests__/knownFixReport.test.ts`

**Analog:** `src/common/jest.config.js` (project already covers `src/common/**/__tests__/**/*.test.ts`, ts-jest, node env, `resetMocks: true`). Pure-function test; no mocks needed.

### `src/backend/__tests__/knownFixReport.test.ts`

**Analog:** `src/backend/__tests__/knownFixesFetcher.test.ts`.

Logger mock (L30-34):
```typescript
jest.mock('../logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))
```
Scripted transport factory (L53-66); adapt to `post` and record bodies:
```typescript
type Reply = { status: number; data?: unknown } | Error
function makeGet(replies: Record<string, Reply>) {
  const urls: string[] = []
  const get: KnownFixesGet = (url) => {
    urls.push(url)
    const reply = replies[url]
    if (!reply) return Promise.resolve({ status: 404, data: '' })
    if (reply instanceof Error) return Promise.reject(reply)
    return Promise.resolve({ status: reply.status, data: reply.data })
  }
  return { get, urls }
}
```
Also `jest.mock('../constants/paths', ...)` tmp-dir override (L16-28) for `readKnownFixesWithLayer` against real files, or inject the layer reader. Sent-record: inject an in-memory `{get,set}`. Abort test: never-resolving `post`, call `callAllAbortControllers()`, assert signal aborted and promise settled. Note `resetMocks: true` in the project config: set mock implementations inside `beforeEach`.

### `src/backend/__tests__/knownFixReportDrift.test.ts`

**Analog:** `src/backend/__tests__/knownFixesLayered.test.ts` (imports `filterTier1KnownFixes`, `readKnownFixes`, `TIER1_KNOWN_FIX_KEYS` from `../knownFixes` with `logWarning`-only logger mock, L50-52). Assert `Object.keys(KNOWN_FIX_REPORT_PAIRS)` equals `TIER1_ROUTING_KEYS` and each pair survives `filterTier1KnownFixes('x','test',{[k]:v})`.

---

### `src/frontend/screens/Settings/components/ShareDetectedFixes.tsx` (component)

**Analog A (toggle + InfoIcon on label line):** `NotifyHumbleExpirations.tsx` (full file):
```tsx
import { ToggleSwitch } from 'frontend/components/UI'
import useSetting from 'frontend/hooks/useSetting'
import { useTranslation } from 'react-i18next'
import InfoIcon from 'frontend/components/UI/InfoIcon'

const NotifyHumbleExpirations = () => {
  const { t } = useTranslation()
  const [notifyHumbleExpirations, setNotifyHumbleExpirations] = useSetting('notifyHumbleExpirations', true)
  return (
    <div className="toggleRow">
      <ToggleSwitch htmlId="notifyHumbleExpirations" value={notifyHumbleExpirations}
        handleChange={() => setNotifyHumbleExpirations(!notifyHumbleExpirations)}
        title={t('setting.notifyHumbleExpirations', 'Notify when Humble keys gain expiration dates')} />
      <InfoIcon text={t('help.notifyHumbleExpirations', "Get an OS notification ...")} />
    </div>
  )
}
```
**Analog B (macOS gate):** `AdvertiseAvxForRosetta.tsx`:
```tsx
import ContextProvider from 'frontend/state/ContextProvider'
const { platform } = useContext(ContextProvider)
const isMac = platform === 'darwin'
if (!isMac) { return <></> }   // place AFTER all hooks
```
Use `useSetting('shareDetectedFixes', false)`. Help text per D-09/D-19: sent = game id (appId), detected fix key/value, add/remove, GameLib version; NOT title (D-19), user id, paths, logs; the relay sees the IP (hashed, short-lived). Wire up: add `export { default as ShareDetectedFixes } from './ShareDetectedFixes'` next to L28 of `Settings/components/index.ts`; add to the import list (L11) and render after `<EnableSteamNativeInstall />` (L40) in `GeneralSettings/index.tsx`.

### `src/common/types.ts` / `src/backend/config.ts`

Mirror `notifyHumbleExpirations: boolean` (types.ts L113) and `notifyHumbleExpirations: true,` in `getFactoryDefaults()` (config.ts L343), with `shareDetectedFixes: false`.

### `jest.config.js` and `relay/jest.config.js`

**Analog:** `src/common/jest.config.js` (full file above in the Common project). Copy it with `displayName: 'Relay'`, `rootDir: '..'`, `roots: ['<rootDir>/relay']`, keep `modulePaths: [compilerOptions.baseUrl]` and `testMatch: ['**/__tests__/**/*.test.ts']`. Root `jest.config.js` L30-36: add `'<rootDir>/relay'` to `projects`. Relay tests import the shared schema by relative path (`../../../src/common/knownFixReport`).

---

## Relay: where analogs end

The `relay/` package is a new standalone Worker. What can be borrowed from the repo and what cannot:

- **Injectable-transport style (borrow):** `knownFixesFetcher.ts` shows `type X = (url) => Promise<{status, data}>`, a default implementation, and a trailing defaulted `deps` param. Do the same for the Worker's outbound `fetch` (GitHub and Steam) and `now()`: `handleReport(request, { db, fetch, now, env })`. Tests use a scripted fake modeled on `makeGet` (keyed by method+URL, `Error` replies reject, unknown routes 404).
- **Pure-validator style (borrow):** `filterTier1KnownFixes` (knownFixes.ts L204) returns `null` for non-object input and never throws; `fileEdit.ts` should follow that: parse, require plain object (`isPlainObject`, L146), else return a `skipped` result.
- **Never-throws/log-and-degrade (borrow):** same as the client; the handler maps every internal failure to a status code (503 for GitHub/Steam/D1 trouble, 4xx only for definitive rejection) and never lets an exception escape `fetch`.
- **Test infra:** reuse Jest + ts-jest via the new Relay project; `node:sqlite` `DatabaseSync` wrapped in a `D1Like` adapter (RESEARCH: verified). Logger is not shared; the Worker must not import `src/backend/logger` or anything under `backend/`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `relay/src/index.ts`, `env.ts` | Worker entry | request-response | No Cloudflare Worker or `export default { fetch }` anywhere in repo; use RESEARCH "Worker entry". Only file allowed to use Worker ambient types |
| `relay/src/githubApp.ts` | service | request-response | No GitHub App / JWT / WebCrypto code in repo; use RESEARCH Pattern 3 (RS256, PKCS#8 only, `Bearer`, UA header) |
| `relay/src/githubFiles.ts` | service | CRUD | No GitHub REST client in repo; strictly serial calls per RESEARCH step table; UTF-8-safe base64 |
| `relay/src/limits.ts`, `migrations/0001_init.sql` | service / migration | CRUD | No SQL or D1 in repo; use RESEARCH Pattern 4 UPSERT-RETURNING buckets |
| `relay/src/steamTitle.ts` | service | request-response | Repo uses axios for Steam store data, but not in the Worker (fetch only); no appdetails client to copy |
| `relay/wrangler.jsonc`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.json` | config | n/a | No nested package or wrangler config; root has a `pnpm-workspace.yaml` without a `packages:` key, so install with `--ignore-workspace` |
| `PRIVACY.md` edit | doc | n/a | Edit in place; Pitfall 8 lists the false sentences (intro, "Servers the maintainer controls", destinations tables) |

## Shared Patterns

### Never-throws, degrade to log warning
**Source:** `src/backend/knownFixesFetcher.ts` L156-170
**Apply to:** `knownFixReport.ts`, and the three hook call sites (always `void reportDetectedFix(...)`, never awaited)
```typescript
try { await run(...) } catch (error) { logWarning(`...: ${error}`, LogPrefix.Backend) }
```

### Leaf module with a dependency-surface rule and lazy electron-store
**Source:** `knownFixesFetcher.ts` L23-25; `steamRestartHold.ts` L14-15 ("LEAF module: never throws, does nothing at import. Disk content is untrusted and safe-parsed.") and L33-40
**Apply to:** `knownFixReport.ts` (no work at import, no boot-time send; this satisfies the sidecar exit contract's "no unbounded in-flight work at boot")

### Sidecar exit contract
**Source:** `Skill("gamelib-conventions")`; `backend/utils/aborthandler/aborthandler.ts` (`createAbortController` / `deleteAbortController`); `releaseOnStdinEof()` already calls `callAllAbortControllers()`
**Apply to:** the report send. Every timer `unref()`; bound with `AbortSignal.timeout`; use an id prefix distinct from appId so `SteamGame.stop(appId)` cannot abort a report.

### Test mocks for logger and tmp fixes paths
**Source:** `knownFixesFetcher.test.ts` L16-34
**Apply to:** `knownFixReport.test.ts`, drift test

### Settings toggle
**Source:** `NotifyHumbleExpirations.tsx`, `AdvertiseAvxForRosetta.tsx`
**Apply to:** `ShareDetectedFixes.tsx`; also memory rule: help is icon-only (i) on the label line, no "Help" text link.

### Verify blocks
**Source:** CLAUDE.md convention: `npx prettier --check` over exact paths written, after `--file-info` check; `relay/` files may be prettier-ignored (check first). Use `createFakeHomeProfile()` for any test that spawns a child process (none planned).

## Metadata

**Analog search scope:** `src/backend/*.ts`, `src/backend/storeManagers/steam/`, `src/backend/utils/aborthandler/`, `src/backend/__tests__/`, `src/common/`, `src/frontend/screens/Settings/`, root and project jest configs
**Files scanned:** ~20 read or grepped
**Pattern extraction date:** 2026-11-02
