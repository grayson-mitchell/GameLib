# Phase 61: Unified macOS engine for all stores - Pattern Map

**Mapped:** 2026-11-07
**Files analyzed:** about 40 (13 moved, about 12 new, about 15 modified, plus tests)
**Analogs found:** all but 3 / all

All paths are relative to `/Users/graysonmitchell/Projects/GameLib`. `S` = `src/backend/storeManagers/steam`. `E` = `src/backend/engine` (new). `FE` = `src/frontend`.

The Phase 59 PATTERNS map (`.planning/milestones/v0.9-phases/59-.../59-PATTERNS.md`) is still valid for how each engine file was originally built. Everything in it that lived under `S/engine/` now exists as a real file. This map covers what changes in the generalisation. Line numbers below were read from the current tree (2026-11-07).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `E/engineTypes.ts, engineIds.ts, enginePins.ts, offlineRefusal.ts, adoptBottle.ts, demoStatus.ts, fallbackEngine.ts, testedCrossoverVersions.ts` (git mv from `S/engine/`) | service/util/config | mixed | themselves (pure move) | exact |
| `E/engineRegistry.ts` (move + re-key to GameKey) | store (in-memory map) | event-driven | `S/engine/engineRegistry.ts` (46 lines) | exact |
| `E/launchDeadline.ts` (move + re-key) | utility | event-driven | `S/engine/launchDeadline.ts` | exact |
| `E/engineDecision.ts` (move, default deps replaced) | service | request-response | `S/engine/engineDecision.ts` | exact |
| `E/engineSwitch.ts` (move, bottle-scoped deps) | service | file-I/O | `S/engine/engineSwitch.ts` | exact |
| `E/engineState.ts` (split generic vs Steam extras) | service | event-driven | `S/engine/engineState.ts` | exact |
| `E/bottlePrimitives.ts` (extract 6 primitives from `S/bottle.ts`, D-19) | utility | file-I/O | `S/bottle.ts` L121, L215, L243, L738, L1722, L2284 | exact (pure move) |
| `E/gameKey.ts` (new) | utility | transform | `sanitizeBottleName` (`S/bottle.ts` L215) + `isContainedGameConfig` (`sidecar/settingsFlowRegistration.ts:109`) | role-match |
| `E/engineConfig.ts` (new: read-time derivation, stored-config reader) | service | file-I/O, transform | `S/titleSettings.ts` `readStoredTitleConfig` + `S/engine/engineDecision.ts` `readStoredEngineOverride`/`resolveWineManagerStaging` | role-match |
| `E/perGameBottle.ts` (new: name scheme, `ensureGameBottle`) | service | file-I/O | `S/bottle.ts` `resolveBridgeBottleName`, `provisionBridgeBottle` (L2388), `createFallbackBridgeBottle` (L2284) | role-match |
| `E/bottleLedger.ts` (new: running-games per bottle, D-16) | store (in-memory map) | event-driven | `S/engine/engineRegistry.ts` + `S/bottle.ts` `drmBridgeRunners` | role-match |
| `E/launchEngine.ts` (new: `selectLaunchEngine(game)`, overlay, deadline wiring) | service | request-response | `S/gameLaunch.ts` `selectLaunchEngine` L485-640, `onBridgeLaunchDeadline` L725-770 | exact (generalise) |
| `S/engine/steamEngineDeps.ts` (new thin adapter) or removed | service | request-response | `S/engine/engineState.ts` Steam-only bits | role-match |
| `S/bottleProcessMonitor.ts` (mod: non-Steam match signal, D-18) | service | event-driven | itself, `deriveWindowsPrefix` L163 | exact |
| `src/backend/launcher.ts` (mod: engine step, crossover branches) | controller | request-response | itself L111-146, L814-870 | exact |
| `legendary/games.ts`, `gog/games.ts`, `nile/games.ts`, `sideload/games.ts`, `storeManagerCommon/games.ts` (mod: settings overlay) | controller | request-response | `S/bottle.ts` `getBridgeBottleSettings` (L1775-1800) | role-match |
| `src/common/types/ipc/engine.ts` (new) | model (IPC types) | request-response | `src/common/types/ipc/steamAuth.ts` L60-90 + `steam.ts` L60-70 (frontend messages) | exact |
| `src/backend/sidecar/engineFlowRegistration.ts` (new) | controller (IPC) | request-response | `steamAuthFlowRegistration.ts` L360-400; header style from `clipboardFlowRegistration.ts` | exact |
| `src/preload/api/engine.ts` (new) + `preload/api/index.ts` | provider | request-response | `src/preload/api/steam.ts` L26-35 | exact |
| `src/common/types.ts` (mod: `engineOverride?` on `GameSettings`) | model | CRUD | `steamEngineOverride` at `common/types.ts:337` | exact |
| `src/backend/config.ts` / `game_config.ts` (mod: global `engineOverride` default) | config | CRUD | `config.ts:375` `wineCrossoverBottle: 'GameLib'`; `GameConfigV0.readSettings` | role-match |
| `FE/screens/Settings/components/EngineOverride.tsx` (rename of `SteamEngineOverride.tsx`) | component | request-response | `SteamEngineOverride.tsx` | exact |
| `FE/screens/Game/GamePage/components/EngineBadge.tsx` (mod: store-agnostic) | component | request-response | itself (71 lines) | exact |
| `FE/screens/Game/GamePage/components/EngineNotices.tsx` (rename of `SteamEngineNotices.tsx`) | component | event-driven | itself (142 lines) | exact |
| `FE/state/EngineState.ts` (rename of `SteamEngineState.ts`) | store (zustand) | event-driven | itself | exact |
| `FE/screens/Settings/sections/GamesSettings/index.tsx` (mod: widen gate) | component | request-response | itself L94, L211-228 | exact |
| `FE/state/GlobalState.tsx` (mod: subscribe `engineStateChanged`) | provider | event-driven | existing `handleSteamEngineStateChanged` subscription | exact |
| `FE/screens/Game/GamePage/index.tsx` (mod: fetch effect L225-246) | component | request-response | itself | exact |
| `FE/screens/Library/components/InstallModal/index.tsx`, `DownloadDialog`, `ImportDialog`, `ThirdPartyDialog`, `WineSelector/engineFilter.ts` (mod, D-17) | component | request-response | `SteamDialog/index.tsx` (steam-managed wine section gating) | role-match |
| Global Settings Default page Engine control (D-09) | component | CRUD | `GamesSettings/index.tsx` `isDefault` branch | role-match |
| Tests: moved `S/engine/__tests__/*` (11 files + `fixtures/stub-wine.sh`) | test | mixed | themselves | exact |
| Tests: new `E/__tests__/launchEngine.test.ts`, `bottleLedger.test.ts`, `engineConfig.test.ts`, `perGameBottle.test.ts`, `engineFlows.test.ts` | test | request-response | `S/engine/__tests__/engineDecision.test.ts`, `sidecar/__tests__/steamEngineFlows.test.ts` | role-match |

## Pattern Assignments

### The move: `S/engine/*` to `E/` (wave 1, pure moves, no behaviour change)

**Current inventory** (`wc -l`, 2,825 lines total): `adoptBottle` 63, `demoStatus` 155, `engineDecision` 619, `engineIds` 32, `enginePins` 73, `engineRegistry` 46, `engineState` 448, `engineSwitch` 579, `engineTypes` 58, `fallbackEngine` 460, `launchDeadline` 140, `offlineRefusal` 56, `testedCrossoverVersions` 96. Tests: `S/engine/__tests__/` = 11 test files plus `fixtures/`.

**Rules:** `git mv` (verify with `git diff -M --stat`), then repoint importers. No re-export façade (62 D-05). Keep the move commit free of behaviour edits (62 D-06). Moved files import `backend/logger` by alias, so they need no import edits. Their relative imports into `../bottle`, `../crossoverLocation`, `../bottleProcessMonitor`, `../titleSettings` and `./...` are what has to change (the sources that bind them to Steam are listed in RESEARCH "Steam-only vs store-agnostic inventory").

**Every importer outside `S/engine/` to repoint** (grep of the current tree, exhaustive for `engine/(engine|launch|adopt|demo|fallback|offline|tested)`):

| Importer | Lines | Kind |
|---|---|---|
| `src/backend/sidecar/bootstrap.ts` | 31 | static: `sweepStaleEngineTemps` from `../storeManagers/steam/engine/fallbackEngine` |
| `src/backend/sidecar/steamAuthFlowRegistration.ts` | 164-165 | static: `engineState`, `engineDecision` (`listEngineOverrideOptions`) |
| `S/bottle.ts` | 50, 51, 55, 57 | static: `getEngineSelection`, `isNonCrossover`, types, `writeCxbottleConf` |
| `S/gameDrmLaunch.ts` | 18 | type: `EngineSelection` |
| `S/gameBridgeLaunch.ts` | 43, 44, 146, 259, 673, 675, 1162 | static + dynamic `await import('./engine/...')` |
| `S/games.ts` | 49, 54, 120 | type + dynamic |
| `S/gameInstall.ts` | 67, 102, 615, 847, 896, 966-968 | type + dynamic |
| `S/gameLaunchOverlay.ts` | 40, 293, 294 | static + dynamic |
| `S/gameLaunch.ts` | 43, 44, 164, 491-496, 507-508, 517-521, 734-736 | type + dynamic |

Dynamic `import('./engine/x')` strings and `jest.mock(...)` strings are both module specifiers and are not caught by a type-check of static imports alone: grep for the old path after the move, not just run `tsc`.

**Test mock repointing** (jest.mock paths are relative strings; a stale one silently mocks nothing):

| Test | Sites |
|---|---|
| `S/__tests__/games.test.ts` (~16k lines) | static imports L148, 153, 158, 162, 166, 170, 172; `jest.mock('../engine/engineDecision' L661, 'engineSwitch' L669, 'engineState' L674, 'fallbackEngine' L679)`; `requireMock('../engine/engineDecision')` L2210, 8483, 8500, 8547, 15827, 15831, 15922; `requireActual/import('../engine/engineRegistry')` L14175, 14643, 15773, 16024 |
| `S/__tests__/bottle.test.ts` | imports L32 (`adoptBottle`), L84-85 (`engineRegistry`, `engineTypes`); `jest.mock('../engine/adoptBottle' L136)` |
| `src/backend/sidecar/__tests__/steamEngineFlows.test.ts` | `jest.mock('../../storeManagers/steam/engine/engineState' L37, 'engineDecision' L43)` |
| `src/backend/sidecar/__tests__/engineTempSweepBootWire.test.ts` | `jest.mock('../../storeManagers/steam/engine/fallbackEngine' L22)` |

New relative form from `S/__tests__` is `'../../../engine/<file>'`; prefer the `backend/engine/<file>` alias if the Backend jest project resolves `backend/` (the moved sources already use `backend/logger`). The 16k-line `games.test.ts` is the expensive one: use a scripted sed over `'../engine/` and then run that file alone to confirm the mocks still bite (a mock that no longer matches shows up as real engine code running).

**Comments that name the old path** (not code, but stale after the move): `S/bottleProcessMonitor.ts:141` ("lives in engine/launchDeadline.ts"), `common/types.ts:337` ("engine/engineIds.ts").

**Dependency rule check** (`.dependency-cruiser.cjs`, Phase 62): `E/**` must not import `storeManagers/steam/*` or any other manager. `launcher.ts` and the four non-Steam managers may import `backend/engine/*` directly. Steam-only inputs (bridge bottle naming, DRM mode verdict, overlay notices, bottle process monitor phase, `findBridgeInstallBottle`) enter `E/` through an injected deps object that a Steam adapter builds, the existing shape of `decideLaunchEngine(args, deps?: Partial<EngineDecisionDeps>)`.

---

### `E/engineRegistry.ts` and `E/launchDeadline.ts` (re-key to GameKey)

**Analog:** `S/engine/engineRegistry.ts` (whole file) and `S/engine/launchDeadline.ts` L1-60.

Current guards to replace with the `GameKey` guard:
```typescript
// engineRegistry.ts L24
if (!/^[0-9]{1,10}$/.test(String(appId))) return false
// launchDeadline.ts L38, L48-51
const APP_ID_RE = /^[0-9]{1,10}$/
if (typeof appId !== 'string' || !APP_ID_RE.test(appId)) {
  throw new TypeError(`armLaunchDeadline: invalid appId "${String(appId)}"`)
}
```
Keep unchanged: the module-level empty `Map`, the `existsSync` check on `wineBin`/`wineserverBin` before accepting a non-CrossOver selection, the defensive copy, the `logInfo(...)` line, `active.get(key)?.cancel('superseded')`, `setTimer`/`clearTimer` injection, and `handle.unref?.()` (sidecar exit contract). Change the `LogPrefix.Steam` log prefix to a neutral one (`LogPrefix.Backend`), and the log text `SteamEngine: appId X` to the game key.

**`gameKey.ts`**: `GameKey = \`${runner}:${appName}\``. Appnames are not numeric (Epic hex-ish, GOG numeric, Amazon `amzn1.adg.product.<uuid>`, sideload arbitrary). Guard style to copy is `sanitizeBottleName` (`S/bottle.ts` L215-231): reject `/`, `\\`, `..`, NUL, empty. Add a runner allowlist via `common/storeCapabilities` (no runner string literals in `E/`; ESLint ban in `meta/runnerLiteralSelectors.cjs` covers `src/backend/**` outside `storeManagers/**`).

---

### `E/bottlePrimitives.ts` (D-19: extract six primitives, pure move)

**Analog:** `S/bottle.ts`, exact. Functions to move and where they sit:

| Function | Line | Note |
|---|---|---|
| `getBottleDir(bottleName)` | 121 | `join(userHome, 'Library/Application Support/CrossOver/Bottles', bottleName)` |
| `sanitizeBottleName(name)` | 215 | chokepoint: trims, rejects `/ \ .. NUL` and empty |
| `isBottleProvisioned(bottleName?)` | 243 | currently defaults to `steamBottleConfigStore` bottle name and `DEFAULT_STEAM_BOTTLE_NAME`: the default arm is Steam-only, so the extracted version must take a required `bottleName` and `S/bottle.ts` keeps a Steam wrapper |
| `killBottleWineServerWith(bottleName, wineserverBin, extraEnv, timeoutMs)` | 738 | uses `getBottleDir(DEFAULT_BRIDGE_BOTTLE_NAME)` to derive the bottles root: replace with `dirname(getBottleDir('x'))` since `DEFAULT_BRIDGE_BOTTLE_NAME` is Steam-only |
| `buildFallbackGameSettings(bottleName, engine)` | 1722 | spreads `GlobalConfig.get().getSettings()` only, which is wrong for non-Steam overlay (see "Settings overlay" below); needs a second variant or a `base` parameter; also takes an explicit prefix for D-04/D-06 plain-prefix games |
| `createFallbackBridgeBottle(bottleName, engine, signal?)` | 2284 (private) | name-agnostic body; export as `createFallbackBottle`; L2284-2310 shows the shape: `WINEPREFIX`, `USER=crossover`, `WINEDLLOVERRIDES: 'mshtml='`, `createdHere = !existsSync(dir)`, `fail()` that kills the wineserver with `USER=crossover` and `removeCreatedBottleDir` |

Excerpt to preserve verbatim (kill guard):
```typescript
const bottlesRoot = resolve(dirname(getBottleDir(DEFAULT_BRIDGE_BOTTLE_NAME)))
if (
  sanitizeBottleName(bottleName) !== bottleName ||
  relative(bottlesRoot, resolve(getBottleDir(bottleName))) !== bottleName
) {
  logWarning(`killBottleWineServerWith: refusing unsafe bottle "${bottleName}"`, LogPrefix.Steam)
  return false
}
// spawnAsync(wineserverBin, ['-k'], { env: { ...process.env, ...extraEnv, WINEPREFIX: getBottleDir(bottleName) }, timeout: timeoutMs })
// result?.code === null  =>  killed by its timeout, return false
```
`S/bottle.ts` and its callers then import these from `backend/engine/bottlePrimitives` with no re-export. `provisionBridgeBottle` (L2388, Steam-only, uses `isBridgeBottleReady` L1293 which is just `isBottleProvisioned(bottleName)`) stays in `S/`. The fake-HOME rule applies to any new test that spawns: model is `S/engine/__tests__/fixtures/stub-wine.sh`, with `createFakeHomeProfile()` from `src/backend/testUtils/fakeHomeProfile.ts`.

---

### `E/engineConfig.ts` (read-time derivation, D-05..D-08)

**Analog 1:** `S/titleSettings.ts` L13-40, `readStoredTitleConfig(appId)`. Straight file read of `GamesConfig/<id>.json` (not `GameConfig.get().config`, which fills asynchronously, 59-UAT G11):
```typescript
if (!/^[0-9]{1,10}$/.test(appId)) return undefined
const path = join(gamesConfigPath, `${appId}.json`)
if (!existsSync(path)) return undefined
try {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  const entry = raw[appId]
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return undefined
  return entry as Record<string, unknown>
} catch { return undefined }
```
Replace the digits-only guard with the containment guard from `sidecar/settingsFlowRegistration.ts:109` (`isContainedGameConfig`: no `/`, `..`, NUL; resolved path inside `gamesConfigPath`). Do not read it through `GameConfig.get()` because that creates a missing file.

**Analog 2:** `readStoredEngineOverride` in `S/engine/engineDecision.ts` (reads `steamEngineOverride`) and `resolveWineManagerStaging` in the same file (matches a `wineVersion.bin` to the Wine Manager `wine-releases` store, and to `pinnedEnginePaths`). The derivation table in RESEARCH Pattern 2 is the spec. Key rules:
- Reader order: `engineOverride` string, else (Steam only) legacy `steamEngineOverride`, else derive from `wineVersion`.
- `legacy:<name>` must not go through `parseEngineOverride` (`S/engine/engineIds.ts`, 32 lines, closed grammar; unknown parses to `automatic`, which is the T-59 validation point). Model Legacy as a separate variant `{ kind: 'legacy', label }` that bypasses `decideLaunchEngine`.
- Never write derived values into `wineVersion`; Pitfall 4: `launcher.ts` `checkWineBeforeLaunch` self-heal writes via `setSetting`. Derive into a separate field.

**Type edit:** add beside `common/types.ts:337`:
```typescript
// Phase 59 (D-14): per-game Steam bridge engine override id; parsed by engine/engineIds.ts, never a path.
steamEngineOverride?: string
```
a sibling `engineOverride?: string` with the same doc style (keep `steamEngineOverride`, still read).

---

### Settings overlay in legendary/gog/nile/sideload/storeManagerCommon launch paths

**Analog:** `S/bottle.ts` `getBridgeBottleSettings(appId)` L1775-1800: DRM runner, then `getEngineSelection(appId)` non-CrossOver, then `buildFallbackGameSettings`, then stock. Nothing persisted. For non-Steam the overlay must start from the game's stored settings, not `GlobalConfig` alone (Pattern 1, RESEARCH):
```typescript
// E/launchEngine.ts
getLaunchSettings(game) = registry.get(key) ? { ...stored, ...buildFallbackGameSettings(bottle, sel) } : stored
```
Never mutate `GameConfig.get(app).config`: `setSetting` flushes `this.config` to disk and would persist the fallback `wineVersion`/`winePrefix`.

**Consumption sites** (all read `getSettings()` then feed `getWineFlags`/`getWineFlagsArray`/`prepareWineLaunch`):

| Site | Line(s) | Current read |
|---|---|---|
| `legendary/games.ts` `getSettings()` | 346-350 | `GameConfig.get(this.appName).config \|\| await ...getSettings()` |
| `legendary/games.ts` launch | 923, 996 (`prepareWineLaunch`), 1021 (`getWineFlags`) | `await this.getSettings()` |
| `gog/games.ts` `getSettings()` | 205-208 | same shape |
| `gog/games.ts` launch | 587, 685, 710 (`getWineFlagsArray`) | |
| `gog/games.ts` other reads | 889, 1040, 1141, 1322, 1402 | audit each: install-time/setup reads vs launch reads |
| `nile/games.ts` | `getSettings()` 68-70; launch 316, 390, 416; 594 | |
| `sideload/games.ts` | `getSettings()` 46-49; use 94 | |
| `storeManagerCommon/games.ts` | `getAppSettings` 35-39; used 182; `prepareWineLaunch` 201 | note L165 reads `GameConfig.get(appName).getSettings()` for browser `targetExe` only: leave |
| `launcher.ts` | 140 (`runLaunchEventCallback`), 829 (`prepareWineLaunch`), 1523 (`runWineCommand`) | |

The least-invasive single point is each manager's own `getSettings()` method: have it return the overlay while the engine registry holds a selection for the game. But `getSettings()` is also read by the Settings UI and by self-heal writes (Pitfall 4), so the safer pattern is a distinct `getLaunchSettings(game)` called only on launch-path reads, as RESEARCH recommends. Plan a unit test that asserts every launch-path settings read goes through the overlay.

**Crossover-only branches to keep in step** (RESEARCH Pitfall 5 table): `launcher.ts` L416-523 (settings pruning by type), L588 and L904 (`getCrossoverBottleFolder`/`installed_games`), L840-868 (cx-bottle-not-found dialog; excerpt below), L1196 (`CX_BOTTLE`), L1461 (`verifyWinePrefix`), L1526 (`runWineCommand` prefix check). The L840 gate shape:
```typescript
if (isMac && gameSettings.wineVersion.type === 'crossover') {
  const bottleExists = existsSync(join(userHome, 'Library/Application Support/CrossOver/Bottles', gameSettings.wineCrossoverBottle, 'cxbottle.conf'))
  if (!bottleExists) { showDialogBoxModalAuto({ ..., type: 'ERROR' }); return { success: false, failureReason: ... } }
}
```
`prepareWineLaunch` re-reads `game.getSettings()` at L829; it must see the overlay.

---

### `E/launchEngine.ts`: `selectLaunchEngine(game)` and deadline wiring

**Analog:** `S/gameLaunch.ts` `selectLaunchEngine` L485-640+ (exact, generalise) and `onBridgeLaunchDeadline` L725-770.

Sequence to copy (L485-640): resolve bottle name from settings (`current.wineCrossoverBottle`); early offline refusal via `offlineLaunchCertainlyBlocked` (arms `crossover-missing` / restore-needs-absent-pin, uses `readBottleEngineMarkerKind`, `restoreNeedsAbsentPin`, `isPinnedEngineInstalled`, `ENGINE_PINS.current`); `decideLaunchEngine({appId, bottleName})` with `kind === 'unavailable'` dialog; `needsDownload && pin` then `ensureBuiltInEngineForInstall`; `setEngineSelection`; `prepareBottleForEngine`; `recordLaunchDecision`. Target signature per RESEARCH: `decideLaunchEngine({ gameKey, bottleName }, deps)` with `deps.readOverride(gameKey)` and `deps.monitorPhase(gameKey)`.

Dynamic-import style (keep; it keeps module load free of boot work):
```typescript
const { decideLaunchEngine } = await import('./engine/engineDecision')
const { setEngineSelection, clearEngineSelection } = await import('./engine/engineRegistry')
```
In `E/` these become sibling imports (`./engineDecision`).

Deadline-fired handler (L725-770) copy points: `getEngineSelection(key) ?? armedSelection` fallback (59-UAT G5: monitor `onStopped` can clear the entry first), `stopBottleProcessMonitor`, kill the bottle wineserver (15 s), clear launch record and registry, send launch-done, then the "Game didn't start" dialog (`gamelib:steam.engine.didntStart.*`, text uses `LAUNCH_DEADLINE_MS / 1000`). Do NOT copy the Steam failure path that marks the bridge failed (`markBridgeFailedThisSession`, `steamBridgeSetupRequired`); it reroutes to bottled Steam. For legendary/gog/nile the child to stop is `legendary launch --wine <bin>` via the runner `abortId` (`utils/aborthandler`) plus `killBottleWineServerWith`, not only a wine pid (RESEARCH Pitfall 2).

Position of arming: after `prepareWineLaunch` prerequisite installers (Pitfall 3), not before as in Steam.

**Bottle-scoped refusal (D-16):** `engineSwitch.ts`'s `monitorPhase(appId)` / `ownBottleName(appId)` (L419-478, "shared-bottle" refusal) become `bottleBusy(bottleName)` backed by the new ledger. Refuse only if another game is running in that bottle; otherwise proceed.

### `E/bottleLedger.ts` (per-bottle running games, D-16)

**Analog:** `S/engine/engineRegistry.ts` (module-level `Map`, empty at load, set/clear/get, log on set), with `drmBridgeRunners` (`S/bottle.ts` ~L1545-1597) as the original. Shape: `Map<bottleName, Set<GameKey>>`; `markRunning(bottle, key)`, `markStopped(bottle, key)`, `othersRunning(bottle, key)`. Clear points identical to the registry: launch-exit callback, deadline path, launch-error `catch`. Steam titles register through the same ledger (their monitor `onStopped` at `S/gameBridgeLaunch.ts`) so cross-store concurrency in one bottle is visible. No timer, no boot work.

---

### `S/bottleProcessMonitor.ts`: non-Steam "game process exists" signal (D-18; spike first)

**Analog:** itself. `deriveWindowsPrefix` L163-186 returns `C:\<rel>\` only when `installPath` is under `<bottle>/drive_c`, else `null` (monitor no-op, `bindDeadlineToMonitor` stands the deadline down, CR-01). `parsePsLine` L196-206 and `processListing` L216+ (falls back to `pgrep -lf .` when `ps` cannot spawn, G4). Non-Steam installs live at macOS paths shown as `Z:\Users\...`. Generalisation (post-spike): when `relative(driveCRoot, installPath)` starts with `..`, derive `Z:` + backslashed absolute path. Keep the trailing backslash (load-bearing against sibling directories) and the fail-safe: no signal means deadline stood down and logged. Do not arm the deadline for non-Steam until the spike result is in.

---

### `src/common/types/ipc/engine.ts`, `engineFlowRegistration.ts`, `preload/api/engine.ts` (new `engine` IPC domain)

**Analogs:** the existing Steam engine trio, which this replaces. No smaller exact domain exists, so use these three:

1. **Types** (`src/common/types/ipc/steamAuth.ts` L75-85 plus `steam.ts` L66-68). Shape of an `Async` interface and a `FrontendMessages` interface:
```typescript
// steamAuth.ts
getSteamEngineState: (appId: string) => Promise<SteamEngineState | null>
listSteamEngineOptions: () => Promise<SteamEngineOption[]>
dismissSteamEngineNotice: (args: { kind: 'no-crossover' } | { kind: 'untested-crossover'; build: string }) => Promise<{ ok: boolean }>
// steam.ts (SteamFrontendMessages)
steamEngineStateChanged: (payload: SteamEngineState) => void
```
New file exports `EngineAsync` and `EngineFrontendMessages` (a domain with no sync channels needs no `EngineSync`, like `dialog.ts` exporting only `DialogAsync`). Wire into `src/common/types/ipc/index.ts`: add `import type { EngineAsync, EngineFrontendMessages } from './engine'`, `& EngineAsync` into `AsyncIPCFunctions` (list at L65-90, alphabetical), `& EngineFrontendMessages` into `FrontendMessages` (L86-93). Channels: `getEngineState({runner, appName})`, `listEngineOptions({runner, appName})` (needs the game so the Legacy entry can appear), `dismissEngineNotice`, push `engineStateChanged`.

2. **Registration** (`steamAuthFlowRegistration.ts` L367-397). Args passed UNCAST to the guard in the state module (`args[0]`); options returns ids and labels only, never paths (T-59-36); the publisher setter registers a closure with no I/O (sidecar exit contract):
```typescript
ipcMain.handle('getSteamEngineState', async (_event: unknown, ...args: unknown[]) => {
  return getSteamEngineState(args[0])
})
ipcMain.handle('listSteamEngineOptions', async () => listEngineOverrideOptions())
ipcMain.handle('dismissSteamEngineNotice', async (_event: unknown, ...args: unknown[]) => dismissSteamEngineNotice(args[0]))
setEngineStatePublisher((state) => sendFrontendMessage('steamEngineStateChanged', state))
```
Header-comment and `register<Domain>Flows()` export style: copy `clipboardFlowRegistration.ts` (imports `ipcMain` from `'../platform'`; documents send vs invoke; a `send` channel registered with `handle`, or the reverse, fails silently). Register it in `src/backend/sidecar/handlers.ts` next to `registerSteamAuthFlows()` (L122-125 region; import near L90).

3. **Preload** (`src/preload/api/steam.ts` L26-35):
```typescript
export const getSteamEngineState = makeHandlerInvoker('getSteamEngineState')
export const listSteamEngineOptions = makeHandlerInvoker('listSteamEngineOptions')
export const dismissSteamEngineNotice = makeHandlerInvoker('dismissSteamEngineNotice')
export const handleSteamEngineStateChanged = frontendListenerSlot('steamEngineStateChanged')
```
New `src/preload/api/engine.ts` with the `Engine` equivalents; add `import * as Engine from './engine'` and `...Engine` to `src/preload/api/index.ts` (the object spreads `Steam`, `Humble`, ... at L1-30).

**Census tests that will fail until updated:**
- `src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts` (~L55-100): add `'engineFlowRegistration.ts': { invoke: N, send: 0 }` (alphabetical, with a dated comment like the others), and lower the counts for `steamAuthFlowRegistration.ts` when the three Steam engine channels are removed (comments in that file ledger every change).
- `src/backend/sidecar/__tests__/ipcDomainCensus.test.ts` (pairing, intersections in `ipc/index.ts`, and the exception table around L80-110): entries like `'FrontendMessages:steamEngineStateChanged': 'steam'` become `'FrontendMessages:engineStateChanged': 'engine'` (move the key, not duplicate).
- Remove the old Steam channels only if nothing else uses them (RESEARCH). Also `FE/state/GlobalState.tsx` is where `handleSteamEngineStateChanged` is subscribed.

---

### Frontend: `EngineOverride` (generalised `SteamEngineOverride`)

**Analog:** `FE/screens/Settings/components/SteamEngineOverride.tsx` (261 lines).

Keep exports `optionLabel`, `selectValue`, `storedExtraOption`, `SteamEngineOverrideView` (renamed), the `T` type, `<details className="steamEngineOverride">` with summary `steam.engine.override.summary`, `SelectField` with `labelHelp={<InfoIcon .../>}` (help is icon-only on the label line, per memory), and `afterSelect` for the warning. Required edits:
```typescript
// L130-132 today
const [override, setOverride] = useSetting('steamEngineOverride', 'automatic')
const state = useSteamEngineState((s) => s.byAppId[appName])
// target
const [override, setOverride] = useSetting('engineOverride', 'automatic')
const state = useEngineState((s) => s.byGame[`${runner}:${appName}`])
```
`runner` and `appName` come from `SettingsContext`. `eligible` stays backend-computed (`state?.overrideEligible === true`); the renderer never derives it. Unsupported flag: today `value.startsWith('pinned:') || value.startsWith('wine-manager:')`; extend with `legacy:` (D-15) and show a read-only disabled `MenuItem` (the same pattern as the existing `extra` stored-unavailable item) for Legacy only while selected. `idLabel` gains `legacy:` returning `Legacy: <name>`. The D-04 "saves stay behind" warning goes in `afterSelect` (the existing `smallInputInfo danger` span). The `useSetting` write goes through existing `setSetting` -> `applyGameSetting`, so no new write IPC. Tests to rename/move with it: `SteamEngineOverride.test.tsx`, `SteamEngineOverride.save.test.tsx`, `GamesSettings/__tests__/steamEnginePlacement.test.ts`, `hooks/__tests__/useSettingsContext.setSetting.test.ts`. Jest frontend project has no stylesheet transform: keep pure logic importable without scss (see the header of `WineSelector/engineFilter.ts`).

**Gate in `GamesSettings/index.tsx`** (L94-96, L211-228 today):
```typescript
const isMacSteamTitle = !isDefault && isMac && hasCapability(gameInfo?.runner, 'usesBottleRuntime')
const showWineTab = !(isWin || isNative || isBrowserGame)
...
{isMacSteamTitle ? (<><span className="defaults-hint">...</span><SteamEngineOverride /></>) : (<><WineVersionSelector /><WinePrefix /><CrossoverBottle /></>)}
```
Widen to macOS Windows games (`isMac && showWineTab`), do not set `usesBottleRuntime` for all stores (it also drives `resolveCrossoverOnly` and Steam bridge flows). The `{!isMacSteamTitle && (...)}` DXVK toggle block at L236 stays Steam-only (the non-Steam launch reads those toggles); hide AutoDXVK when the effective engine is bottle-managed. L277 `{isMacSteamTitle && <SteamOverlayOverride />}` stays Steam-only. The `wineTabHint` text mentions Steam: needs a neutral variant. Hide the `WinePrefix` field for bottle-backed games (D-10). For `isDefault` on macOS show the global Engine control and hide `WineVersionSelector` (D-09).

### `EngineBadge`, `EngineNotices`, `EngineState` store

**Analogs:** the files themselves. `EngineBadge.tsx` (71 lines) imports `SteamEngineState` from `common/types/steam`, switches on `state.engine` (`'builtin'` | `'unsupported'`), uses the `gamelib` namespace keys `steam.engine.badge.*` and `steam.engine.reason.*`, and returns `null` when not applicable. Edits: type import, `Legacy: <name>` for `engineLabel`, keep i18n keys (text identical per D-12) to avoid churn; neutralise only `steam.engine.wineTabHint` and the `sharedBottle` dialog text.
`SteamEngineNotices.tsx` (142 lines): same structure (`showTrialNotice && trialDaysRemaining !== null`, `showNoCrossoverNote`, untested-build note); `CROSSOVER_URL` is a hard-coded constant (T-59-50), keep.
`state/SteamEngineState.ts` (47 lines): replace `byAppId` with `byGame` keyed `runner:appName`, `remove(key)`, `hideNotice(key, notice)`; the standalone handler used by tests:
```typescript
export const handleSteamEngineStateChangedSignal = (_e: IpcRendererEvent, state: SteamEngineState): void => {
  if (!state || typeof state.appId !== 'string') return
  if (!/^[0-9]{1,10}$/.test(state.appId)) return   // replace with the safe-name guard on runner + appName
  useSteamEngineState.getState().set(state)
}
```
Payload type `SteamEngineState` (in `common/types/steam.ts`) gains `runner` and `appName` in place of `appId`; the rename to `EngineState` moves it to a new shared types file or `common/types/engine.ts`. Fetch effect in `GamePage/index.tsx` L225-246:
```typescript
if (!hasCapability(runner, 'usesBottleRuntime') || !isMac) return   // widen to macOS non-native Windows games
const result = await window.api.getSteamEngineState(appName)
if (result) useSteamEngineState.getState().set(result); else useSteamEngineState.getState().remove(appName)
// deps: [appName, runner, isMac, launchEnded, settingsModalProps.isOpen]
```
`NoticeStack`, `SteamEngineLaunchNotice` and `HumbleExpiryToast` (grep matches) are separate surfaces: audit whether they key by appId before renaming. `EngineBadge` is rendered beside `MacArchBadge` (`GamePage/components/MacArchBadge.tsx` is its Phase 59 analog).

### InstallModal Wine selector (D-17)

**Analog:** `FE/screens/Library/components/InstallModal/SteamDialog/index.tsx`, the Steam path that already replaces the free Wine picker with a gated section (`showWineSelector = isSteamManagedApp ? steamGating.wineSection : hasWine`, `index.tsx` L579). Sites to change:
- `InstallModal/index.tsx` L579 `showWineSelector`; the `<WineSelector ... />` mounts at L710-711, 761-762, 789-790, 816-817, 842-843 (one per dialog branch: Download, ThirdParty, Import, Sideload, Steam). On macOS non-Steam Windows installs, render the Engine control instead.
- `DownloadDialog/index.tsx` L295-336: the `writeConfig({ appName, config: { ...gameSettings, winePrefix, wineVersion, wineCrossoverBottle: crossoverBottle } })` call under `if (!isWin)` and the `installsViaCrossover: platformToInstall === 'Windows' && wineVersion?.type === 'crossover'` input to `resolveCrossoverInstallRisk` (the risk dialog applies when the effective engine is CrossOver or Automatic). On macOS write `{ ...gameSettings, engineOverride, wineCrossoverBottle: perGameBottleName(...) }` and skip `winePrefix`/`wineVersion`. `ImportDialog` and `ThirdPartyDialog` follow the same shape. Backend `importGame` (`installFlowRegistration.ts:~629`) writes these keys too.
- `WineSelector/engineFilter.ts` `resolveCrossoverOnly(runner, crossoverOnly)` and `isBottleCapableEngine` are pure and unit-tested (`WineSelector/__tests__/engineFilter.test.ts`): put any new pure gating logic in a sibling dependency-free module with its own test, for the stylesheet-import reason stated at the top of that file.
- The `perGameBottleName` computation belongs in the backend (`E/perGameBottle.ts`); the renderer should send runner and appName and let the backend produce/validate the name, rather than building a bottle name in the UI.

### `E/perGameBottle.ts`: name scheme and `ensureGameBottle` (D-01, D-03)

**Analogs:** `S/bottle.ts` `resolveBridgeBottleName(appId)` and `guardPerGameBridgeBottleName` for the chokepoint style (digits-only appId there; must become deterministic hex-escape encoding here); `provisionBridgeBottle` (L2388) idempotent short-circuit on `isBridgeBottleReady`, then `createFallbackBridgeBottle` (L2284). Rules: allowed `[A-Za-z0-9._-]`, hex-escape the rest, cap length with a short-hash suffix, include the runner for cross-store collision-freedom, then pass through `sanitizeBottleName` and verify round-trip equality (`sanitizeBottleName(n) === n`). Creation engine selection reuses `decideCreationEngine` (presence-check: CrossOver present gives `cxbottle --create --template win10_64` with `CX_CREATE_CAP_MS`, else pinned `createFallbackBottle` and `writeCxbottleConf` from `adoptBottle.ts`). `ensureGameBottle(gameKey)` is lazy and idempotent, called from GOG `setup` (`gog/setup.ts`) and from `selectLaunchEngine` before pre-flight. Wave 0 should confirm CrossOver's bottle-name constraints (assumption A2 in RESEARCH).

### Steam-side adapter (`S/engine/steamEngineDeps.ts` or removal)

Steam keeps: `bridgeBottleNameFor`, `getBridgeBottleSettings` (DRM check, then engine registry, then stock; dispatch L1775-1800 stays in `S/bottle.ts`), `getBottleProcessMonitorPhase`, `findBridgeInstallBottle`, `readBridgeVerdict`, `OVERLAY_STEPS`, `publishOverlayNotice`/`publishOverlayExitNotice` (used by `gameLaunchOverlay.ts` L40 and `gameBridgeLaunch.ts` L43), and the digits-only appId guard. These are what `engineState.ts` binds to Steam today; the generic `compute()`, preflight cache, and trial/untested/no-CrossOver notices move to `E/`. Keep the `steam_engine_notices` CacheStore name unchanged even if the module moves, or dismissals reset (RESEARCH Runtime State Inventory).

---

## Shared Patterns

### Sidecar exit contract (CLAUDE.md convention 3)
**Source:** `S/engine/launchDeadline.ts` (`handle.unref?.()`, registry empty at load) and `S/engine/engineRegistry.ts`.
**Apply to:** `E/launchDeadline.ts`, `E/bottleLedger.ts`, `E/engineRegistry.ts`, `E/demoStatus.ts` probe, `E/fallbackEngine.ts` download handle, `E/launchEngine.ts`. No pre-flight, probe or download at module load or boot; the only boot wiring is `sweepStaleEngineTemps` in `sidecar/bootstrap.ts` L31 (repoint only).

### Fake-HOME isolation for spawns (convention 2)
**Source:** `src/backend/testUtils/fakeHomeProfile.ts` `createFakeHomeProfile()`; model test `S/engine/__tests__/fixtures/stub-wine.sh`; gate `src/backend/__tests__/fakeHomeIsolation.test.ts`. The real-profile arm is justified in the module header for `demoStatus.ts` (CrossOver reads the licence from the real home) and `killBottleWineServerWith` ("env inherits process.env (HOME) because the prefix is explicit").
**Apply to:** every new test that spawns; moved tests keep their existing arms.

### Argv-form spawn with timeout, `code === null` means timeout
**Source:** `killBottleWineServerWith` (`S/bottle.ts` L738+). **Apply to:** all wine spawns in `E/`.

### Input validation and containment
**Source:** `sanitizeBottleName` (L215), `isContainedGameConfig` (`sidecar/settingsFlowRegistration.ts:109`), `parseEngineOverride` (`engineIds.ts`, closed grammar). The renderer must never write `legacy:*` nor a path; validate on the backend write path. IPC handlers pass `args[0]` uncast to the module's own guard.

### Logging
**Source:** `logInfo/logWarning/logError` from `backend/logger`; `LogPrefix.Steam` becomes a neutral prefix in `E/`. `engineLogLabel(sel)` (`engineTypes.ts`) for the D-13 launch log line. Add `// log-secret-gate-exempt: <reason>` where wine stderr is logged (see `provisionBridgeBottle`).

### Notifications
**Source:** `showEngineDialog(game, title, body, ackId)` in `S/gameLaunch.ts` and `maybeNotifyDrmModeFailed` (`S/games.ts` ~L3645): `notify`, `showDialogBoxModalAuto`, once-per-session Set. The store-agnostic version drops the Steam game parameter.

### Phase 62 boundaries
`launcher.ts` reaches manager code only through `storeManagers/index`; `E/**` imports no manager; runner literals are banned in `src/backend/**` outside `storeManagers/**` (use `isStore()`/`hasCapability()` from `common/storeCapabilities`; `usesBottleRuntime` L36/L72/L120 is the Steam flag and must not be set for other stores). Dependency-cruiser ceilings stay at zero.

### Verification block (convention 5)
Each task's `<verify>` runs `npx prettier --check` over the exact paths written, after `--file-info` confirms they are not prettier-ignored.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `E/bottleLedger.ts` | store | event-driven | No cross-store per-bottle running-games ledger exists. `engineRegistry`/`drmBridgeRunners` are the structural model only; the monitor knows Steam games only. |
| Non-Steam `Z:`-path match in `bottleProcessMonitor.ts` | service | event-driven | No existing matcher for macOS-path installs; blocked on the D-18 `ps` spike (LOW confidence on the `Z:` command-line shape). |
| `E/perGameBottle.ts` name encoding | utility | transform | No existing store-qualified, collision-free bottle-name scheme (Steam uses digits-only appId). |

## Metadata

**Analog search scope:** `src/backend/storeManagers/{steam,legendary,gog,nile,sideload,storeManagerCommon}`, `src/backend/{launcher.ts,sidecar,engine}`, `src/common/types/ipc`, `src/preload/api`, `src/frontend/{screens/Settings,screens/Game/GamePage,screens/Library/components/InstallModal,state}`
**Files scanned:** about 45 read or grepped (graphify not used: direct greps were scoped enough)
**Pattern extraction date:** 2026-11-07
