# Phase 59: Steam engine fallback when CrossOver is unavailable - Pattern Map

**Mapped:** 2026-10-31
**Files analyzed:** 22 (12 new, 10 modified)
**Analogs found:** 21 / 22

All paths below are relative to `/Users/graysonmitchell/Projects/GameLib`. `S` = `src/backend/storeManagers/steam`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `S/engine/engineRegistry.ts` (new) | store (in-memory registry) | event-driven | `drmBridgeRunners` in `S/bottle.ts` L1545-1583 | exact |
| `S/engine/engineDecision.ts` (new) | service | request-response | `S/bridge/drm/steamclientLayerMode.ts` (decision) + `resolveBridgeRoute` | role-match |
| `S/engine/demoStatus.ts` (new) | utility (spawn + pure parser) | request-response | `killBottleWineServer` in `S/bottle.ts` L652-692 | role-match |
| `S/engine/enginePins.ts` (new) | config (pin table) | transform | `S/bridge/drm/ntdllPatchTable.ts` | role-match |
| `S/engine/fallbackEngine.ts` (new) | service (download/verify/extract) | file-I/O, streaming | `src/backend/wine/manager/downloader/main.ts` L255-330 | role-match |
| `S/engine/testedCrossoverVersions.ts` (new) | config + store | CRUD | `S/bridge/drm/ntdllPatchTable.ts` L48-62 | exact (shape) |
| `S/engine/adoptBottle.ts` (new) | utility | file-I/O | `isBridgeBottleReady` / `provisionBridgeBottle` in `S/bottle.ts` | role-match |
| `S/engine/launchDeadline.ts` (new) | utility | event-driven | `DRM_REGISTRY_TIMEOUT_MS` race in `S/games.ts` L4415-4430 | role-match |
| `S/bottle.ts` (mod: `getBridgeBottleSettings`, fallback settings, `provisionBridgeBottle` branch, generalised `killBottleWineServer`) | service | request-response | itself (`getDrmBridgeBottleSettings`) | exact |
| `S/bottleProcessMonitor.ts` (mod: `onFirstMatch`) | service | event-driven | itself (`onStopped`) | exact |
| `S/games.ts` (mod: L1743 gate, L2149 gate, `fireBridgeWineLaunch`, notify) | controller | request-response | itself (`maybeNotifyDrmModeFailed`) | exact |
| `src/common/types` + game-settings store (mod: `steamEngineOverride` id) | model | CRUD | existing per-game setting fields | role-match |
| `src/frontend/screens/Game/GamePage/components/EngineBadge.tsx` (new) | component | request-response | `MacArchBadge.tsx` | exact |
| `.../components/CrossoverTrialNotice.tsx` (new) | component | event-driven | `SteamBridgeRouteNotice.tsx` + `SteamGoOfflineNotice.tsx` | role-match |
| `src/frontend/state/SteamEngineNotice.ts` (new) | store (zustand) | event-driven | `src/frontend/state/SteamGoOfflineNotice.ts` | exact |
| `.../GamesSettings/` Advanced engine override section (new/mod) | component | CRUD | `Settings/components/WineVersionSelector.tsx` | partial (no collapsible primitive) |
| `public/locales/en/gamepage.json` (mod, uncommitted changes present) | config | transform | existing `badge.*` keys | exact |
| `S/engine/__tests__/*.test.ts` (new, 6 files) | test | request-response | `S/__tests__/bottle.test.ts`, `bottleProcessMonitor.test.ts`, `src/backend/tools/__tests__/dxmtBootFetch.test.ts` | role-match |
| `S/__tests__/bottle.test.ts`, `games.test.ts`, `bottleProcessMonitor.test.ts` (mod) | test | request-response | themselves | exact |
| stub `bin/wine` fixture (new) | test fixture | request-response | `S/__tests__/fixtures/` | role-match |
| 59-UAT.md (new) | doc | n/a | other `*-UAT.md` files | per convention |
| `S/engine/` wineserver kill for fallback | (see bottle.ts) | | | |

## Pattern Assignments

### `S/engine/engineRegistry.ts` + `getBridgeBottleSettings` dispatch (registry, event-driven)

**Analog:** `src/backend/storeManagers/steam/bottle.ts` L1545-1597

```typescript
const drmBridgeRunners = new Map<string, { runner: DrmBridgeRunner; form: DrmLaunchForm }>()

export function setDrmBridgeRunner(appId: string, runner: DrmBridgeRunner, form = DRM_LAUNCH_FORM): boolean {
  if (!/^[0-9]{1,10}$/.test(String(appId))) return false          // numeric appId guard
  if (!drmRunnerWineInstallation(runner, form)) return false
  const copy = {} as DrmBridgeRunner
  for (const field of DRM_RUNNER_FIELDS) copy[field] = runner[field]  // defensive copy
  drmBridgeRunners.set(appId, { runner: copy, form })
  logInfo(`bottle: appId ${appId} uses DRM runner crossover-${copy.crossoverBuild}`, LogPrefix.Steam)
  return true
}
export function clearDrmBridgeRunner(appId: string): void { drmBridgeRunners.delete(appId) }

export function getBridgeBottleSettings(appId: string): GameSettings {
  const entry = drmBridgeRunners.get(appId)
  if (entry) return getDrmBridgeBottleSettings(appId, entry.runner, entry.form)
  return stockBridgeBottleSettings(appId)
}
```
Copy: numeric appId guard, in-memory only (module-level `Map`, nothing at module load per sidecar exit contract), explicit set/clear/get, log line on set. Insert the engine-registry check AFTER the DRM check (DRM wins). Keep `// ts-prune-ignore-next` on exports not yet consumed.

**Fallback settings builder** (copy shape of `stockBridgeBottleSettings`, L1387-1402, and `getDrmBridgeBottleSettings` L1536-1541 for `enviromentOptions`):
```typescript
return {
  ...globalSettings,
  wineCrossoverBottle: resolved,
  wineVersion: resolveCrossoverWine('CrossOver (bridge bottle runtime)') ?? globalSettings.wineVersion
}
// DRM clone variant:
winePrefix: getBottleDir(stock.wineCrossoverBottle),
enviromentOptions: [...kept, { key: 'WINELOADER', value: runner.wineloaderBin }, { key: 'WINESERVER', value: runner.wineserverBin }]
```
Fallback: `wineVersion:{type:'wine', bin, name, wineserver}`, `winePrefix:getBottleDir(bottle)`, `enviromentOptions` add `USER=crossover`, `WINEDEBUG=-all`, MoltenVK log var. Use `resolveBridgeBottleName(appId)` and throw on invalid like L1390-1394.

**Registry clear points:** monitor `onStopped` (games.ts L4472), deadline path, launch error path (`catch` L4555).

---

### `S/engine/demoStatus.ts` (utility, request-response)

**Analog:** `S/bottle.ts` `killBottleWineServer` L652-692 (bounded spawn, `code === null` means timeout, best-effort logging)

```typescript
const result = await spawnAsync(wineserverIn(binDir), ['-k'], {
  env: { ...process.env, WINEPREFIX: getBottleDir(bottleName), CX_ROOT: cxRootFrom(binDir) },
  ...(timeoutMs !== undefined ? { timeout: timeoutMs } : {})
})
if (result?.code === null) {
  logWarning(`killBottleWineServer: wineserver -k for bottle "${bottleName}" was killed by its timeout`, LogPrefix.Steam)
  return false
}
```
Use same shape with `env: {...process.env, CX_BOTTLE: bottleName}` and `['--demo-status']`. Pure `parseDemoStatus()` per RESEARCH "Pre-flight parse" (anchored regexes, last non-empty line). Resolve the bin via `resolveCrossoverBinDirAsync({ hintWineBins: persistedWineBins() })` (bottle.ts L640-650 pattern). Real HOME arm: header comment must name it (CrossOver reads licence from real home).

---

### `S/engine/enginePins.ts` and `testedCrossoverVersions.ts` (config / allowlist)

**Analog:** `S/bridge/drm/ntdllPatchTable.ts` L1-62

```typescript
// ts-prune-ignore-next
export const NTDLL_PATCH_ROWS: Readonly<Record<string, NtdllPatchRow>> = {
  '26.3.0.39832': { crossoverBuild: '26.3.0.39832', cleanSize: 685648, cleanSha256: '6dff...' , ... }
}
export function findNtdllPatchRow(build: string, cleanSha256: string): NtdllPatchRow | null {
  if (!Object.prototype.hasOwnProperty.call(NTDLL_PATCH_ROWS, build)) return null   // prototype-safe lookup
  ...
}
export function supportedCrossoverBuilds(): string[] { return Object.keys(NTDLL_PATCH_ROWS).sort() }
```
Copy: `Readonly<Record<build, Row>>`, `hasOwnProperty` guard, sorted-keys accessor. Seed tested table with `26.3.0.39832` (keyed by `CFBundleVersion`). Pins table: `{ current, previous }` rows with url, version, size, sha256 (values in RESEARCH Standard Stack). One-time-notice dismissal state goes in an existing GameLib store (find via config/store patterns when planning).

---

### `S/engine/fallbackEngine.ts` (service, file-I/O + streaming download)

**Analog:** `src/backend/wine/manager/downloader/main.ts` L255-330 (reuse primitives, NOT `installVersion`)

```typescript
await downloadFile({
  url: versionInfo.download, dest: installDir, progressCallback: getProgress, abortSignal
}).catch((error: Error) => {
  if (error instanceof Error && error.message.includes('Download stopped')) abortHandler()
  unlinkFile(tarFile)
  throw new Error(`Download of ${versionInfo.version} failed with:\n ${error}`)
})
onProgress({ status: 'downloading', percentage, eta: eta!, avgSpeed: downloadSpeed })   // via calculateEta
await unzipFile({ filePath: tarFile, unzipDir: installSubDir, overwrite, onProgress, abortSignal })
```
Imports: `import { axiosClient, calculateEta, downloadFile } from 'backend/utils'`; `unlinkFile`, `unzipFile` exported from `backend/wine/manager/downloader/utilities`. Divergences (anti-copy): `installVersion` does `readFileSync` of the tarball for sha512 and renames to `_backup`; instead stream sha256 (`crypto.createHash` over `createReadStream`), extract into temp dir, rename atomically, delete on mismatch. No work at module load (see `src/backend/tools/dxmt.ts` / `dxmtBootFetch.test.ts` header: a boot fetch delayed exit 27 s).

---

### `S/bottleProcessMonitor.ts` add `onFirstMatch` (event-driven)

**Analog:** itself. Interface at L108-135 (`onStopped?: () => void`, wrapped in try/catch, "EXACTLY ONCE"); `recordFirstMatch` L261-275 sets `entry.everMatched = true`; called from two sites (L363-364 poll loop, L537 `launcherExited`). Destructure at L463-470 and store on `MonitorEntry` next to `onStopped` (entry literal L482-491). Add:
```typescript
onFirstMatch?: () => void   // called once inside recordFirstMatch, try/catch-wrapped, same doc style as onStopped
```
Keep LD-4 (monitor has no deadline); deadline lives outside in `launchDeadline.ts`.

---

### `S/games.ts` `fireBridgeWineLaunch` (deadline + notify) (controller)

**Analog:** itself, L4232-4560.
- Monitor start (L4467-4475): `startBottleProcessMonitor({ appId, installPath: installRoot, bottleDir: getBottleDir(bridgeBottleSettings.wineCrossoverBottle), kind: 'bridge', onStopped: () => { clearLaunchRecord(); stopBridgeHelper(this.appId); relogOnce() } })` -> add `onFirstMatch: () => cancelDeadline()`.
- Wine spawn (L4518-4533): `runWineCommand({ commandParts, gameSettings: launchSettings, wait:false, protonVerb:'run', startFolder, skipPrefixCheckIKnowWhatImDoing:true })`. Use the existing `onSpawn` hook (see `launcher.ts` ~L1508) to start the deadline.
- Timeout racing with unref (L4415-4430):
```typescript
timer = setTimeout(..., DRM_REGISTRY_TIMEOUT_MS)
timer.unref?.()
...
} finally { if (timer) clearTimeout(timer) }
```
- Deadline failure must NOT copy `reportLaunchFailure` (L4243-4262): that calls `markBridgeFailedThisSession` and sends `steamBridgeSetupRequired`, which reroutes to bottled Steam. Copy only the DRM branch's "no session mark" behaviour.
- "Game didn't start" dialog: copy `maybeNotifyDrmModeFailed` L3645-3693 (i18next title/body, `notify({title, body})`, `app.raiseMainWindow()`, `newDialogAckId()`, `trackDialogDisplay`, `showDialogBoxModalAuto({title, message, type:'MESSAGE', ackId})`, once-per-session Set keyed by `appId|step`). Per-launch fallback toast uses just `notify(...)`.
- CrossOver gate to relax, L1743-1750:
```typescript
if (isMac && !(await isCrossoverInstalled())) {
  logWarning(`SteamGame: CrossOver is not installed — install of appId ${this.appId} stopped (precondition, not a bridge failure)`, LogPrefix.Steam)
  return this.crossoverRequiredError()
}
```
Compute bridge route first; keep this error for bottled Steam / DRM routes only. Do the same at L2149 (`CROSSOVER_MISSING` after `provisionBridgeBottle`). Never reroute to bottled Steam on a missing engine.

---

### `S/bottle.ts` `provisionBridgeBottle` fallback branch (service, file-I/O)

**Analog:** itself, L1938-2010. Reuse: `sanitizeBottleName` chokepoint (1), idempotent `isBridgeBottleReady` short-circuit (3, keyed on `cxbottle.conf` existence at L1207), `spawnAsync` argv-form spawn, post-check `isBottleProvisioned`. The D-08 guard (L1950-1963) and `CROSSOVER_MISSING` return (L1975-1986) are what the fallback branch replaces for the bridge route only. Order for fallback: mkdir Bottles dir, wineboot -i with `USER=crossover`, `wineserver -w`, DXVK install, write `cxbottle.conf` LAST, `wineserver -k`. Conf content: RESEARCH Pattern 4 (`crypto.randomUUID().toUpperCase()`).

---

### `src/frontend/.../components/EngineBadge.tsx` (component)

**Analog:** `src/frontend/screens/Game/GamePage/components/MacArchBadge.tsx` (whole file, 44 lines)
```typescript
import { useTranslation } from 'react-i18next'
const MacArchBadge = ({ gameInfo, isMac }: Props) => {
  const { t } = useTranslation('gamepage')
  if (gameInfo.mac_arch !== '32') return null
  const label = t('badge.macArch32', '32-bit macOS build')
  return <div className={`macArchBadge ${variantClass}`} title={label} aria-label={label}>32</div>
}
```
Copy: presentational only, returns `null` when not applicable, `t('badge.<key>', 'default')` in `gamepage` namespace, `title` + `aria-label`. Add keys under `badge.*` in `public/locales/en/gamepage.json` (file has uncommitted local edits, edit surgically). Rendered next to `MacArchBadge` in `GamePage/index.tsx` (~L530). Engine state arrives from backend push, not renderer logic.

### `CrossoverTrialNotice.tsx` + `state/SteamEngineNotice.ts` (component + zustand store)

**Analog:** `src/frontend/state/SteamGoOfflineNotice.ts` (L1-60) and `SteamBridgeRouteNotice.tsx` (imports L1-14: `Dialog, DialogContent, DialogFooter, DialogHeader` from `frontend/components/UI/Dialog`, `useTranslation('gamelib')`).
```typescript
export const useSteamGoOfflineNotice = create<State>()((set) => ({
  isOpen: false, ...,
  open: (payload) => set({ isOpen: true, ... }),
  close: () => set({ isOpen: false, ... })
}))
export const handleSteamGoOfflineRequiredSignal = (...)   // standalone for jsdom-free tests
```
Opened only by a backend `sendFrontendMessage` push, subscribed in `GlobalState.tsx`. Components tests go in `GamePage/components/__tests__`.

### Per-game engine override (Settings > Advanced)

**Analog:** `src/frontend/screens/Settings/sections/GamesSettings/index.tsx` (`SettingsContext`, `useSetting`, `isCrossover` branch L85, advanced tab label L180) and `Settings/components/WineVersionSelector.tsx`. No collapsible primitive exists: add a small `<details>` section. Store an engine-id enum string; validate in backend against a closed set (never a path from renderer). Help = icon-only (i) on the label line (memory note).

### Tests

**Analogs:** `S/__tests__/bottle.test.ts` (registry + wineserver extension), `S/__tests__/bottleProcessMonitor.test.ts` (fake timers, `jest.getTimerCount()`), `src/backend/tools/__tests__/dxmtBootFetch.test.ts` (documents the no-boot-work test and factory-mocking `../index`), `src/backend/__tests__/fakeHomeIsolation.test.ts` (enforces `createFakeHomeProfile()`; find import via `src/backend/tools/dxmt.ts`/test files that use it). Stub `bin/wine` scripts run under `createFakeHomeProfile()`; real-profile arm named in module header.

## Shared Patterns

### Sidecar exit contract
**Source:** `S/games.ts` L4415-4430 (`timer.unref?.()` + `clearTimeout` in `finally`). **Apply to:** `demoStatus.ts`, `launchDeadline.ts`, `fallbackEngine.ts` download handle. No pre-flight or download at module load/boot.

### Logging
**Source:** `bottle.ts` (`logInfo/logWarning/logError(..., LogPrefix.Steam)`). Secrets gate: add `// log-secret-gate-exempt: <reason>` when logging stderr of wine commands (see `provisionBridgeBottle`).

### Input validation / containment
**Source:** `sanitizeBottleName`, `guardPerGameBridgeBottleName`, numeric appId regex `/^[0-9]{1,10}$/`. argv-form `spawnAsync`; contain paths with `resolve()+relative()`.

### Wineserver kill (engine-specific)
**Source:** `killBottleWineServer` (L652). Generalise to accept the engine's `wineserver` path + env (`WINEPREFIX`, `USER=crossover` for fallback; `CX_ROOT` for CrossOver). Always pass timeout; `code === null` = timed out.

### Notifications
**Source:** `games.ts` `maybeNotifyDrmModeFailed` (L3645). `notify` for toast, `showDialogBoxModalAuto` for blocking error.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Collapsed Advanced section component | component | n/a | No collapsible primitive for game settings; use `<details>` (RESEARCH section 6) |
| `adoptBottle.ts` `cxbottle.conf` writer | utility | file-I/O | Nothing writes `cxbottle.conf` outside `cxbottle --create`; use RESEARCH Pattern 4 and spike 056 prefix for Wave 0 verification |

## Metadata

**Analog search scope:** `src/backend/storeManagers/steam`, `src/backend/wine/manager/downloader`, `src/backend/tools`, `src/frontend/state`, `src/frontend/screens/Game/GamePage/components`, `src/frontend/screens/Settings`
**Files scanned:** about 20 read or grepped
**Pattern extraction date:** 2026-10-31
