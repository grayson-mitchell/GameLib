# Phase 68: Versioned persisted stores and migrations - Pattern Map

**Mapped:** 2026-11-08
**Files analyzed:** 22 (new + modified)
**Analogs found:** 20 / 22 (2 have only a partial analog)

Live store is `GameLibStore` (`src/backend/store_backend.ts`, a `conf@10.2.0` subclass). `src/backend/sidecar/fileStore.ts` is dead in production and is used here only as an excerpt source for the atomic-write / mode discipline.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/backend/store_backend.ts` (modify: `prepareStore`, `get/set store`, `readOnly`, `configFileMode 0o600`) | store shim | file-I/O | itself (lines 110-173) + `fileStore.ts` persist (306-350) | exact (self) |
| `src/backend/storeVersioning/engine.ts` (new) | service | file-I/O, transform | `src/backend/migration/index.ts` (ordering/logging) + `fileStore.ts` | role-match |
| `src/backend/storeVersioning/backup.ts` (new: backup, dedupe, prune, `atomicWritePrivate`) | utility | file-I/O | `fileStore.ts` `persist()` lines 306-350 | exact (lift) |
| `src/backend/storeVersioning/readOnlyStores.ts` (new) | service | event-driven (aggregate) | `src/backend/sidecar/engineFlowRegistration.ts` publisher injection (lines 64-93) | partial |
| `src/backend/storeVersioning/settingsFiles.ts` (new) | service | file-I/O | `src/backend/config.ts` / `game_config.ts` readers | role-match |
| `src/backend/storeMigrations/index.ts`, `settingsGlobal.ts` (new, pure registry) | utility | transform | `src/common/trayIconVariant.ts`, `src/common/focusRowMigration.ts` (callees) | role-match |
| `src/backend/typed_store.ts`, `src/backend/cache.ts` (modify: `kind`, readOnly early-return, `__internal__` hiding) | store | CRUD | themselves (`typed_store.ts` 84-150, `cache.ts` 30-60) | exact (self) |
| `*/stores.ts` (about 20 modules, modify: add `kind`) | config | declaration | `engine/engineNoticeStore.ts` (CacheStore call) | exact |
| `src/common/types/storePolicy.ts` (modify: `isAllowedStoreField` `__internal__` rule) | utility | request-response | itself (line 248+) | exact (self) |
| `src/backend/sidecar/storeWriteHandlers.ts` (modify: `applyStoreWrite` read-only + `__internal__` guard) | handler | request-response | itself (guard (d)) | exact (self) |
| `src/backend/config.ts`, `src/backend/game_config.ts` (modify: remove `upgrade()`/`reload` switch) | service | file-I/O | themselves | exact (self) |
| `src/backend/sidecar/appShellFlowRegistration.ts` (modify: one-shot emit in `frontendReadyBootWorkDone` block) | handler | event-driven | itself (lines 237-240, 539-580) | exact (self) |
| `src/common/types/ipc/<domain>.ts` (modify: new push zod entry) | config | pub-sub | `src/common/types/ipc/engine.ts` 56-67 | exact |
| `src/preload/api/<domain>.ts` (modify: listener slot) | provider | pub-sub | `src/preload/api/engine.ts:16`, `steam.ts:32` | exact |
| `src/frontend/state/ReadOnlyStores.ts` (new zustand + signal handler) | store | pub-sub | `src/frontend/state/SteamRequestNotice.ts` | exact |
| `src/frontend/state/GlobalState.tsx` (modify: register listener) | provider | pub-sub | itself lines 1685-1690 | exact (self) |
| `src/frontend/components/UI/NoticeStack/ReadOnlyStoresNotice` (new) + `index.tsx` (modify) | component | event-driven | `UI/HumbleExpiryToast/index.tsx`, `NoticeStack/noticeSlot.tsx` | role-match |
| `public/locales/en/gamelib.json` (modify) | config | n/a | existing notice keys | role-match |
| `src/backend/__tests__/storeKinds.test.ts` (new: D-01 ratchet) | test | source-scan | `src/backend/__tests__/fakeHomeIsolation.test.ts` | exact |
| `src/backend/storeVersioning/__tests__/engine.test.ts`, `backup.test.ts`, `storeMigrations/__tests__/*.test.ts` (new) | test | file-I/O | `cache.test.ts`, `gameConfigFirstWrite.test.ts` (use real `GameLibStore` under `jest.setupContainment.ts`) | role-match |
| `.planning/todos/pending/*.md` (new, D-12) | doc | n/a | `2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md` | exact |
| IPC gate tests (modify): `ipcDomainCensus.test.ts`, `ipcSchemas/*.test.ts`, `ipcSchemaCoverage.test.ts` | test | n/a | `ipcDomainCensus.test.ts:86` `'FrontendMessages:engineStateChanged': 'engine'`; `ipcSchemas/runnerMiscEngine.test.ts:138` | exact |

## Pattern Assignments

### `src/backend/store_backend.ts` (store shim, file-I/O)

**Analog:** itself. The only integration point; every production store passes through `GameLibStore`.

**Current constructor to wrap** (lines 167-173):
```typescript
export default class GameLibStore<
  T extends Record<string, unknown> = Record<string, unknown>
> extends Conf<T> {
  constructor(options?: StoreOptions<T>) {
    super(translateStoreOptions(options))
  }
}
```
Change to `super(prepareStore(options))`; `prepareStore` calls the existing `translateStoreOptions` (lines 110-160) first, strips the new `kind` field before handing to `conf`, and keys state by the resolved path (`resolve(join(resolvedCwd, configName + '.json'))`, same predictedPath computation at lines 126-132). Add `configFileMode: 0o600` to the returned options (D-13, `return { ...rest, configName, cwd: resolvedCwd }` at line 159). Create dirs `0o700`.

**Containment idiom to reuse** (lines 82-89): `assertContained` with `resolve`+`relative`; use the same for backup/prune paths.

**Must never throw** at module scope (a throw in `prepareStore` = sidecar boot failure).

---

### `src/backend/storeVersioning/backup.ts` (utility, file-I/O)

**Analog:** `src/backend/sidecar/fileStore.ts` `persist()`, lines 306-350. Lift as `atomicWritePrivate(path, text)`.

```typescript
private persist(): void {
  const dir = dirname(this.filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  const serialized = JSON.stringify(this.cell.data, null, 2)
  const tmpPath = `${this.filePath}.tmp-${process.pid}`
  try {
    writeFileSync(tmpPath, serialized, { mode: 0o600 })
    renameSync(tmpPath, this.filePath)
  } catch (err) {
    // Never log `data`/`serialized` here; these stores hold token material.
    process.stderr.write(`[sidecar/fileStore] atomic persist (temp+rename) failed ... ${err instanceof Error ? err.message : String(err)}\n`)
    writeFileSync(this.filePath, serialized, { mode: 0o600 })
    try { unlinkSync(tmpPath) } catch { /* best effort */ }   // WR-05
  }
}
```
Backups: read bytes and write via the same temp+rename with `mode: 0o600` (not `copyFileSync`, which copies the source's `0o666`). Do not chmod an existing directory in backup code (D-13 tightens token dirs separately, at load of `steam_store/`, `humble_store/`).

---

### `src/backend/storeVersioning/engine.ts` (service, file-I/O + transform)

**Analog (ordering/logging only):** `src/backend/migration/index.ts`.

**Imports + logging pattern** (lines 1-5, 43-60):
```typescript
import { logError, logInfo } from '../logger'
...
const result = await migration.run().catch((e: Error) => e)
if (result instanceof Error) {
  logError(['Migration', `"${migration.identifier}"`, 'encountered error while applying:', result])
  return false
}
logInfo(['Migration', `"${migration.identifier}"`, 'successfully applied'])
```
Differences to apply: engine is synchronous (runs inside `super(...)`), migrations are pure `(data) => data`, failure marks the path read-only rather than returning false, and log only store leaf, from/to version and `error.message` (T-28-04; never contents). Do not read or write `migrationsStore` from the engine (circular). Leave `MigrationSystem` and `LegendaryGlobalConfigFolderMigration` unchanged.

---

### `src/backend/typed_store.ts` and `src/backend/cache.ts` (store, CRUD)

**Analog:** themselves.

**TypeChecked constructor + write methods** (`typed_store.ts` 84-146): add a third ctor parameter `{ kind }`, forwarded into `new Store({...options, kind})`. Write methods currently notify after writing:
```typescript
public set<KeyType extends string>(key: KeyType, value: ...) {
  this.store.set(key, value)
  notifyStoreChanged({ store: this.storeName, key, value })
}
public clear() {
  this.store.clear()
  notifyStoreInvalidated(this.storeName)
}
```
Add `if (this.store.readOnly) return` before the write and notify in `set`/`delete`/`clear`. `raw_store` strips `__internal__`.

**CacheStore ctor** (`cache.ts` 30-60): the third arg becomes required `{ kind; invalidateCheck? }`:
```typescript
options?: { invalidateCheck?: (data: ValueType) => boolean }
...
this.store = new Store({ cwd: 'store_cache', name: filename, clearInvalidConfig: true })
```
`entries()` filter that already hides `__timestamp` (grep `__timestamp` in `cache.ts`, lines ~71-153): add `key !== '__internal__'`. `commit()` must skip disk write and invalidation push when read-only. Note `use_in_memory()` does `new Map(this.store)`.

---

### `*/stores.ts` declaration modules (config, declaration)

**Analog:** `src/backend/engine/engineNoticeStore.ts` (lines 9-13), the simplest CacheStore call. Example edit shape:
```typescript
export const engineNoticeStore = new CacheStore<unknown>(
  'steam_engine_notices',
  null,
  { kind: 'user-state' }
)
```
`engineNoticeStore` is lazily `require`d (never in `storeRegistration.ts`), proving the hook must live in `GameLibStore`. Kinds: see RESEARCH Finding 2 table plus D-14 (`humble_library`, `steam_known_fix_reports`, `runsForMeStore`, `macArchStore` default to user-state). `steamConfigStore` and `steamBottleConfigStore` share `steam_store/config.json`: same kind, one path-keyed state.

---

### `src/backend/__tests__/storeKinds.test.ts` (test, source-scan ratchet; D-01)

**Analog:** `src/backend/__tests__/fakeHomeIsolation.test.ts` (Phase 62 / quick 260913-arr style).

**Imports** (lines 29-33):
```typescript
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { FAKE_HOME_ENV_KEYS } from '../testUtils/fakeHomeProfile'
import { stripSourceComments } from '../testUtils/stripSourceComments'
```
**Walker + anti-vacuity floor** (lines 35-60, 134-156): `REPO_ROOT = join(__dirname, '..','..','..')`, `PRUNED_DIRS`, `SCANNED_EXT`, `MIN_FILES_SCANNED = 600` ("a rename, a bad prune, or a broken walk that hollows this gate must turn it RED rather than passing by scanning nothing"), `toRepoRel()` normalising `sep` to `/`, `walk()`, `collectScannedFiles()`.
**Detector loop** (lines 160-178): strip comments, test regex, collect `offenders`, `expect(offenders).toEqual([])`.
**Reasoned exemption table** (lines 87-117): `EXEMPTIONS` with `file`, `reason`, `anchors`, plus a test that every exemption still exists on disk. Use for `fontsStore` (no construction), class definitions, tests, `__mocks__`. Never widen the vocabulary to admit a failing case.
Add a floor of at least 50 constructions found (19 + 32 + `engineNoticeStore`). Regex sketch is in RESEARCH "Code Examples".

---

### Backend-to-renderer push notice (D-05/D-07/D-15)

Chain, using `steamRequestNotice` and `engineStateChanged` as precedents.

**1. zod entry** (`src/common/types/ipc/engine.ts` 56-67; `steam.ts:76`):
```typescript
// D-12: typing only, never parsed at runtime.
export const engineFrontendMessagesArgs = {
  engineStateChanged: z.tuple([ z.custom<EngineState>((v) => typeof v === 'object' && v !== null && ...) ])
}
export type EngineFrontendMessages = PushFns<typeof engineFrontendMessagesArgs>
```
New channel (suggest `readOnlyStoresNotice`, payload ids only, never contents): add to a domain's `*FrontendMessages` args. Then update `ipcDomainCensus.test.ts` (line 86 style: `'FrontendMessages:<name>': '<domain>'`), the matching `ipcSchemas/*.test.ts` (`runnerMiscEngine.test.ts:138` style), and run `pnpm check:ipc-contract` and `ipcSchemaCoverage.test.ts`.

**2. preload slot** (`src/preload/api/engine.ts:16`, `steam.ts:32`):
```typescript
export const handleEngineStateChanged = frontendListenerSlot('engineStateChanged')
export const handleSteamRequestNotice = frontendListenerSlot('steamRequestNotice')
```

**3. backend emit.** Publisher-injection precedent (`engineFlowRegistration.ts:91-93`): `setEngineStatePublisher((state) => sendFrontendMessage('engineStateChanged', state))`. For this phase, do NOT push at detection (stores load at module scope before any renderer listener exists; `tauriTransport.ts` `listen()` has no buffer). Emit once from the `if (!frontendReadyBootWorkDone)` block (`appShellFlowRegistration.ts:239` flag, `539-540` block; the comment at ~568-576 explains the "dropped if no listener yet" rule and why a one-shot guard is used). Wrap in its own try/catch as `detectVCRedist()` is, so a throw cannot skip `initQueue` scheduling; add no timers (sidecar exit contract).

**4. renderer zustand + handler** (`src/frontend/state/SteamRequestNotice.ts` 1-48), copy shape:
```typescript
export const useSteamRequestNotice = create<SteamRequestNoticeStore>()((set) => ({
  latest: null,
  set: (payload) => set({ latest: payload })
}))
export const handleSteamRequestNoticeSignal = (_e: IpcRendererEvent, payload: ...): void => {
  if (!payload || typeof payload !== 'object') return
  if (!REQUEST_KINDS.has(payload.kind)) return   // closed set (T-pvk-01)
  ...
}
```
Validate area ids against a closed set; map to translated labels in the renderer.

**5. register** in `GlobalState.tsx` (lines 1685-1690), next to the others:
```typescript
window.api.handleEngineStateChanged(handleEngineStateChangedSignal)
window.api.handleSteamRequestNotice(handleSteamRequestNoticeSignal)
```

**6. component** in `src/frontend/components/UI/NoticeStack/index.tsx` (lines 1-26):
```typescript
export function AppNoticeStack() {
  return (
    <NoticeStack>
      <SteamEngineLaunchNotice />
      <HumbleExpiryToast />
    </NoticeStack>
  )
}
```
Add `<ReadOnlyStoresNotice />` (ordering comment says Humble sits nearest the corner). Use `renderNoticeSlot`, `useNoticePhaseFallback`, `NoticePhase` from `NoticeStack/noticeSlot.tsx` (lines 1-50). D-15: no 8 s auto-hide; dismiss button, still one notice per launch. Read `HumbleExpiryToast/index.tsx` for the dismiss-button variant and `Skill("sketch-findings-gamelib")` `references/notices-and-toasts.md`. All text via `t()`; run `hardcodedStringGate.test.ts` and `lintTranslations`.

---

### `src/common/types/storePolicy.ts` (utility)

**Analog:** `isAllowedStoreField` (line 248+), fail-closed. Add as the first rule after the `DENIED_CACHE_STORES` check (line 249): `if (key.split('.')[0] === '__internal__') return false`. Mind the CR-02 prototype-key note directly below it. Also covers `pushStoreChanged`.

---

### `src/backend/sidecar/storeWriteHandlers.ts` (handler)

**Analog:** itself. Add after guard (d) resolves the target and before the write: refuse top-level `__internal__` keys and `target.readOnly`, one log line, return without `pushStoreChanged`. Add `readOnly` to the `WritableStoreBackend` interface. Reads `new Store(...)` per cache name at lines ~92 and ~364 (state memoised per path so no re-migration, log once).

---

### `src/backend/config.ts` and `src/backend/game_config.ts` (service, file-I/O)

**Analog:** themselves. Per RESEARCH Finding 6: remove the `reload()` switch (crashes on unknown version via undefined instance), remove `GameConfigV0.upgrade()`, route `writeToFile` through `atomicWritePrivate` with a read-only check, change the three hard-coded `'v0'` in `flush()` to a current-version constant, extend `GlobalConfigVersion`/`GameConfigVersion` in `src/common/types.ts` (lines ~228, ~409). Keep the read-side `migrateTrayIconVariant` / `migrateFocusRowSelection` calls (including `appShellFlowRegistration.ts:250`) as normalisers for the failed-migration path. The migration `settings/global` v0 to v1 calls those same pure helpers (single source of truth).
Read these files fully at plan time to take line-precise excerpts; they were not excerpted in this pass.

---

### `.planning/todos/pending/*.md` (D-12 todos)

**Analog:** `.planning/todos/pending/2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md`. Frontmatter shape (bare, lowercase, in this order after `files:`):
```yaml
---
created: 2026-10-25
title: "..."
area: steam-bridge
files:
  - path
severity: minor
platform: any
ready: blocked
---
```
Gate: `pnpm planning-gates`. The `/gsd-add-todo` template omits `severity/platform/ready`; add by hand. Candidates: `mac-steam-offline-owed.json`, `.gamelib-engine.json`, `.gamelib-pin.json`, `gamelib-shared-redists.json`.

## Shared Patterns

### Never log secrets (T-28-04)
**Source:** `fileStore.ts:333-339` comment and `store_backend.ts`. **Apply to:** engine, backup, settingsFiles, readOnlyStores. Log store leaf, versions, `error.message` only. `logSecretGate.test.ts` covers `logError` call sites.

### Path containment
**Source:** `store_backend.ts:82-89` `assertContained` (resolve+relative, Phase 18). **Apply to:** backup, prune (only exact `<name>.v*.bak.json` patterns inside the store's own directory), any path derived from RPC input.

### Private atomic write
**Source:** `fileStore.ts:306-350`. **Apply to:** engine rewrite, backups, `config.ts`/`game_config.ts` `writeToFile`.

### Sidecar exit contract
**Source:** `appShellFlowRegistration.ts:539-560` (the `.unref()` comment on the 5 s timer). **Apply to:** all boot-time work: synchronous only, no timers/handles; do not sweep `GamesConfig/*.json` at boot (migrate lazily on first `GameConfig.get`).

### Fake-HOME in any test that spawns
**Source:** `fakeHomeIsolation.test.ts` + `testUtils/fakeHomeProfile`. **Apply to:** the `smoke:sidecar` old-shape fixture arm. Backend jest project already redirects HOME via `jest.setupContainment.ts`, so real `GameLibStore` is safe in unit tests; do not `jest.mock('backend/store_backend')` over `FileStore` for new tests (that mocks the dead class and proves nothing).

### Verify block
**Source:** CLAUDE.md Conventions. Every task `<verify>` runs `npx prettier --check <exact paths>` after `--file-info` check.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/backend/storeVersioning/readOnlyStores.ts` | service | aggregate-then-emit | No existing backend module aggregates state at module-scope load and flushes once at frontendReady; closest is the publisher-injection in `engineFlowRegistration.ts` (use RESEARCH Finding 10). |
| Path-keyed `STATE` registry consulted from inside `super(...)` and setter override (`get/set store` on a `conf` subclass) | store shim | file-I/O | No existing `conf` accessor override; verify TS target supports `super.store` (RESEARCH Assumption A6) with a spike test before building on it. |

## Notes for the planner

- `fileStore.ts` is dead in production; `fileStore.test.ts` and suites that mock `backend/store_backend` over it give no coverage of the new code.
- The `ipc*` gates (`check:ipc-contract`, `ipcSchemaCoverage`, `ipcDomainCensus`) must be budgeted for the new push channel.
- Full store kind table: RESEARCH Finding 2, adjusted by D-14.

## Metadata

**Analog search scope:** `src/backend` (store layer, migration, sidecar registration, engine), `src/common/types`, `src/preload/api`, `src/frontend/state`, `src/frontend/components/UI/NoticeStack`, `.planning/todos/pending`.
**Files scanned/read:** about 14 read (fully or by range), plus targeted greps.
**Pattern extraction date:** 2026-11-08
