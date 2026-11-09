# Phase 69: Consolidate frontend state onto GlobalStateV2 - Pattern Map

**Mapped:** 2026-11-10
**Files analyzed:** 14 file groups (new/modified)
**Analogs found:** 13 / 14 (one partial: `subscribeWithSelector` has no in-repo use)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/frontend/state/uiState.ts`, `settingsState.ts`, `downloadsState.ts`, `authEpic/Gog/Amazon/Steam/Humble.ts`, `libraryState.ts` (domain stores) | store | CRUD + request-response (async actions) | `src/frontend/state/GlobalStateV2.ts` (hook shape, async action) + `state/BottleLaunchWaiting.ts` (small standalone store) | exact |
| `GlobalStateV2.ts` (split/renamed) | store | CRUD | itself | exact |
| `src/frontend/state/resetAllStores.ts` | utility (test helper) | transform | `afterEach` reset in `state/__tests__/BottleLaunchWaiting.test.ts` | role-match |
| `src/frontend/state/initStateSubscriptions.ts` | boot module | event-driven (IPC push) | `GlobalState.tsx` `componentDidMount` (lines 1587-1990) + `handleSteamBottleLaunchWaitingSignal` extracted handlers | exact (source of the code being moved) |
| sleep-assertion / localStorage / isRTL subscribers (inside boot module) | service (side effect) | event-driven | `GlobalState.tsx` `componentDidUpdate` (2063-2110) | exact |
| bridge in `GlobalState.tsx` (shrinking) | provider | pub-sub | `GlobalState.tsx` `render()` (2112+), `forceUpdate` use at 1387 | exact |
| `src/frontend/index.tsx` (call boot module) | boot / entry | request-response | itself, lines 121-176 and 270-285 | exact |
| `meta/frontendContextCeiling.cjs` + `meta/frontendContextCeiling/*.json` shards | config / gate | batch | `meta/backendDiCeilings.cjs` + `meta/backendDiCeilings/*.json`; `meta/steamLineCeiling.cjs` for `parseArgs`/floor/`evaluate` | exact |
| `meta/__tests__/frontendContextCeiling.test.ts` | test | batch | `meta/__tests__/backendDiCeilings.test.ts` | exact |
| `meta/__tests__/frontendContextCeilingWiring.test.ts` | test | batch | `meta/__tests__/backendDiCeilingsWiring.test.ts` | exact |
| `package.json`, `.husky/pre-push`, `.github/workflows/lint.yml` (wiring) | config | batch | existing `backend-di-ceilings` entries | exact |
| `src/frontend/state/__tests__/<store>.test.ts` (per-store) | test | CRUD | `state/__tests__/BottleLaunchWaiting.test.ts` | exact |
| Converted consumer, e.g. `components/UI/ToggleSwitch/index.tsx` (123 such files) | component | request-response | itself (`useContext(ContextProvider)` to store selector) | exact |
| Function-component test in node env (rewritten `ContextProvider` tests) | test | request-response | `screens/Login/components/Runner/__tests__/index.test.tsx` | exact |
| Rewritten source-text gates (12 files, e.g. `GlobalStateSteamLogout.test.ts`) | test | transform | same file; keep anti-vacuity self-tests | exact |
| D-14 harness (`window.__gamelibPerf`, `69-RERENDER.md`) | utility | batch | none | no analog |

## Pattern Assignments

### Domain stores (store, CRUD + async actions)

**Analog A:** `src/frontend/state/GlobalStateV2.ts` (164 lines). **Analog B:** `src/frontend/state/BottleLaunchWaiting.ts`.

**Imports pattern** (GlobalStateV2.ts lines 1-11):
```typescript
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

import type { GameInfo } from 'common/types'
import { notify } from 'frontend/helpers'
import { gameOverridesStore } from 'frontend/helpers/stores'
import { t } from 'i18next'
```

**Store creation + async action calling `window.api`** (GlobalStateV2.ts lines 72-75, 125-145):
```typescript
const useGlobalStateRaw = create<GlobalStateV2>()((set) => ({
  ...
  refreshingWineVersions: false,
  refreshWineVersions: (fetch) => {
    window.api.logInfo('Refreshing wine downloader releases')
    set({ refreshingWineVersions: true })
    window.api
      .refreshWineVersionInfo(fetch)
      .catch(() => { window.api.logError('Sync with upstream releases failed'); notify({...}) })
      .finally(() => set({ refreshingWineVersions: false }))
  }
}))
```

**Selector hooks + export shape to copy per store** (lines 108-164):
```typescript
const useGlobalState = <T>(
  selector: Parameters<typeof useShallow<GlobalStateV2, T>>[0]
) => useGlobalStateRaw(useShallow(selector))

const useGlobalStateKeys = <Keys extends (keyof GlobalStateV2)[]>(...keys: Keys): Pick<GlobalStateV2, Keys[number]> =>
  useGlobalState((state) => Object.fromEntries(keys.map((key) => [key, state[key]])) as { [key in Keys[number]]: GlobalStateV2[key] })

export default {
  ...useGlobalState,
  keys: useGlobalStateKeys,
  setState: useGlobalStateRaw.setState,
  getState: useGlobalStateRaw.getState
}
```
Notes for the planner:
- The default export has no `subscribe`. Phase 69 stores must add `subscribe: useRaw.subscribe` (D-08 needs it).
- `subscribeWithSelector` is not used anywhere in `src` today (grep returned zero files). It is a new import from `zustand/middleware`, so confirm with Context7 as RESEARCH A1 says. Wrap as `create<T>()(subscribeWithSelector((set, get) => ...))`.
- `gameOverrides: gameOverridesStore.get('overrides', {})` at line 105 is the import-time-read hazard (Pitfall 1). New stores must use defaults in `create()` and a `readInitial()` re-applied from the boot module.

**Standalone store + directly callable signal handler** (BottleLaunchWaiting.ts lines 13-62), the shape for small domain stores and for listeners the boot module calls:
```typescript
export const useBottleLaunchWaiting = create<BottleLaunchWaitingState>()(
  (set) => ({
    entries: {},
    clear: (appName) =>
      set((state) => {
        if (!(appName in state.entries)) return state   // no-op returns same ref, no re-render
        const nextEntries = { ...state.entries }
        delete nextEntries[appName]
        return { entries: nextEntries }
      })
  })
)
export const handleSteamBottleLaunchWaitingSignal = (_e: IpcRendererEvent, { appName, detectedCause }) => {
  useBottleLaunchWaiting.getState().set(appName, detectedCause)
}
```

**Persistence-in-action (D-02)**, copied from `GlobalState.tsx` lines 589-593 (class setter to port as a store action, same key, same order):
```typescript
setTheme = (newThemeName: string) => {
  configStore.set('theme', newThemeName)
  this.setState({ theme: newThemeName })
  window.setTheme(newThemeName)
}
```
Store version: `setTheme: (name) => { configStore.set('theme', name); set({ theme: name }); window.setTheme(name) }`. Other `configStore.set` sites to port the same way: lines 599, 608, 616, 624-649 (tiles/animations), 674-710 (hidden/favourites), 734-801 (customCategories). Where there is a timer (`zoomTimer`, line 595), keep it module-scoped in the store file.

**Mirror write-through:** there is no `helpers/electronStores.ts`. The renderer mirrors are in `src/frontend/helpers/stores.ts`: `class TypeCheckedStoreFrontend` whose `get`/`set` call `window.api.storeGet`/`storeSet` synchronously (lines 12-60), exported as `configStore`, `gameOverridesStore`, `downloadManagerStore`, etc. (export block at line 195). First import in that file is `'../../preload/tauriAttach'` (line 6). Reads are valid only after `await hydrateStoreSnapshot()` in `index.tsx`.

---

### `src/frontend/state/initStateSubscriptions.ts` (boot module, event-driven)

**Analog:** `GlobalState.tsx` `componentDidMount` (lines 1587-1990), moved as is, in the same order.

**Order to preserve** (lines 1587-1618): first `applySavedZoomAtBoot`, then focusRow hydration, then the listeners:
```typescript
applySavedZoomAtBoot({
  savedZoomPercent: this.state.zoomPercent,
  setZoomFactor: (zoomFactor) => window.api.setZoomFactor(zoomFactor),
  onError: (error) => window.api.logError(`applySavedZoomAtBoot failed: ${String(error)}`)
})
if (focusRowMirrorSeed.needsMigratedValue) {
  void hydrateFocusRowSelection({
    requestAppSettings: () => window.api.requestAppSettings(),
    setSetting: (payload) => window.api.setSetting(payload),
    applyFocusRow: (value) => this.setState({ focusRow: value }),
    hasUserPicked: () => this.focusRowPickedThisSession,
    onError: ...
  })
}
```
**Listener registration pattern** (lines 1640-1642, 1651-1692): already-extracted handlers are passed straight in, so the boot module calls them unchanged:
```typescript
window.api.handleGameStatus((e, args) => { this.handleGameStatus({ ...args }) })   // becomes useLibraryState.getState().handleGameStatus({ ...args })
window.api.handleSteamBridgeRouteNotice(handleSteamBridgeRouteNoticeSignal)
window.api.handleEngineStateChanged(handleEngineStateChangedSignal)
window.api.handleReadOnlyStoresNotice(handleReadOnlyStoresNoticeSignal)
```
Handlers that close over `this.state` (e.g. `handleInstallGame` at 1620 captures `libraryStatus` destructured at mount, a stale closure today) must read `useLibraryState.getState().libraryStatus` at call time. That fixes a staleness; flag it as a behaviour question, because the phase is no-behaviour-change.

**Where it is called:** `src/frontend/index.tsx`, after the hydrate `try/catch` (lines 144-160) and `applyFramelessDecorations()` (line 176), before `root.render` (lines 281-292):
```typescript
await Promise.race([hydrateStoreSnapshot(), new Promise<never>((_r, reject) => setTimeout(() => reject(new Error('...timed out after 8000ms')), 8000))])
...
probeMark('after-hydrate')
if (!pickerParams) applyFramelessDecorations()
...
probeMark('before-root-render')
if (pickerParams) { root.render(<...BridgeInvitePickerRoot .../>) } else
  root.render(<GlobalState><I18nextProvider ...><Suspense ...><App /></Suspense></I18nextProvider></GlobalState>)
```
Call `initStateSubscriptions()` only in the non-`pickerParams` branch (the picker window has no GlobalState today), once, with a module-level once-guard (D-05/D-07). Hydration failure must still reach render (the guard comment at lines 125-142 explains the blank-screen history), so call it after the `try/catch`, not inside the `try`.

---

### Side-effect subscribers (service, event-driven; D-08)

**Analog:** `GlobalState.tsx` `componentDidUpdate` (lines 2063-2110). Logic to port unchanged:
```typescript
const isRTL = RTL_LANGUAGES.includes(language)
document.body.classList.toggle('isRTL', isRTL)
storage.setItem('updates', JSON.stringify(gameUpdates))
storage.setItem('sidebar_collapsed', JSON.stringify(sidebarCollapsed))
storage.setItem('hide_changelogs', JSON.stringify(hideChangelogsOnStartup))
storage.setItem('last_changelog', JSON.stringify(lastChangelogShown))
const displayKindActive = libraryStatus.some((game) => classifySleepAssertionKind(game.status) === 'display')
const systemKindActive  = libraryStatus.some((game) => classifySleepAssertionKind(game.status) === 'system')
const calls = reconcileSleepAssertionCalls(this.sleepAssertionState, { display: displayKindActive, system: systemKindActive })
for (const call of calls) {
  if (call.channel === 'lock') window.api.lock(call.playing as boolean)
  else window.api.unlock()
}
this.sleepAssertionState = nextSleepAssertionState
```
`reconcileSleepAssertionCalls` and `classifySleepAssertionKind` are `export function`s in `GlobalState.tsx` (lines 292, 378), and `SleepAssertionState` is at 335; move them with the subscriber into an importable module. The initial `sleepAssertionState` is `{ display: false, system: false }` (line 418). `RTL_LANGUAGES` and the module-scope `const storage: Storage = window.localStorage` (line 80) must be guarded or deferred in the new module so node-env tests can import it (RESEARCH anti-pattern).

---

### Bridge in `GlobalState.tsx` (provider, pub-sub; D-09)

**Analog:** `GlobalState.tsx` `render()` lines 2112-2150: the provider builds the value with `{...this.state, completeOAuthLogin, epic: {library, username, login, logout}, ...}`. Per slice, replace the moved `this.state.X` reads with `useXStore.getState().X` in `render()` and add a store subscription calling `this.forceUpdate()`. `forceUpdate` is already used at line 1387. Each field has exactly one owner (class or store). `installingEpicGame` and `isRTL` stay derived in render (lines 2127-2131); derive them in selectors later, never store them.

---

### Ratchet gate `meta/frontendContextCeiling.cjs` (gate, batch)

**Primary analog:** `meta/backendDiCeilings.cjs` (603 lines). **Secondary:** `meta/steamLineCeiling.cjs` (222 lines).

**Header contract and constants** (backendDiCeilings.cjs lines 1-60): `'use strict'`, then `fs`, `path`, `ts = require('typescript')`; `REPO_ROOT = path.join(__dirname, '..')`; `DEFAULT_BASELINE_DIR = path.join(__dirname, 'backendDiCeilings')`; `SKIP_DIRS = new Set(['__tests__','__mocks__','testUtils','node_modules'])`; floor constants such as `DEFAULT_MIN_BACKEND_FILES = 240` set at about half the measured count. For this gate, floor the scanned `src/frontend` non-test files (measure at implementation).

**AST parse and walk** (lines 93, 268-283): `ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true)`, `walkTs(dir, skipDirs, out)` using `fs.readdirSync(dir, { withFileTypes: true })`, `census(root = REPO_ROOT)`. Count `ImportDeclaration`s whose specifier resolves to `state/ContextProvider` (aliased `frontend/state/ContextProvider`, relative `../state/ContextProvider`, `./ContextProvider`). `useContext` calls are not counted, since `React.useContext` in `hooks/hasStatus.ts:65` hides from a call-site match (RESEARCH recommendation).

**Shard loading and evaluation** (lines 322-390): `loadShards(dir)` reads every `*.json`, rejects unknown keys, non-object sections and non-positive-integer entries ("a zero entry is removed, not kept"), and rejects a path in two shards. `evaluate(merged, current)` fails on grew, shrank (lower in the same commit), stale entry for a missing file, and a nonzero file in no shard. Shard format: `{ "<section>": { "<repo-relative POSIX path>": n } }`. For this gate use one section, e.g. `{ "contextImports": { "src/frontend/components/UI/ToggleSwitch/index.tsx": 1 } }`, shards keyed by screen area (`settings.json`, `ui.json`, `library.json`, ...) so parallel plans do not conflict.

**CLI** (backendDiCeilings.cjs lines 505-575; steamLineCeiling.cjs lines 150-215): `parseArgs` rejects flags without values and non-integer `--min-files` (never a silent fallback that disables the floor); `--shard <name>` restricts evaluation to that shard's paths while floors still apply; `main()` prints `PASS (...)` or `FAIL: ...` lines and `process.exit(1)`. There is NO `--update` flag. End: `module.exports = { ... }` plus `if (require.main === module) main()` (steamLineCeiling.cjs lines 217-222) so the unit test can import the pure functions.

**End state (D-12):** shards removed, then the script, tests and wiring deleted with `GlobalState.tsx`/`ContextProvider.tsx`. The wiring test and all three wiring points must go in the same commit.

---

### Ratchet wiring (config)

Existing lines to copy:
- `package.json` lines 50-51:
  ```json
  "steam-line-ceiling": "node meta/steamLineCeiling.cjs",
  "backend-di-ceilings": "node meta/backendDiCeilings.cjs",
  ```
  Add `"frontend-context-ceiling": "node meta/frontendContextCeiling.cjs"`.
- `.husky/pre-push` line 2 (single `&&` chain ending `... && pnpm steam-line-ceiling && pnpm backend-di-ceilings`): append `&& pnpm frontend-context-ceiling`.
- `.github/workflows/lint.yml` lines 36-43:
  ```yaml
        # Phase 66 D-16: shrink-only module-state / child_process / jest.mock ceilings; lower
        # the matching meta/backendDiCeilings/*.json entry in the same commit as the removal.
        - name: Backend DI ceilings
          run: pnpm backend-di-ceilings
  ```
  Add a comment plus `- name: Frontend context ceiling` / `run: pnpm frontend-context-ceiling` after it.

**Wiring test analog:** `meta/__tests__/backendDiCeilingsWiring.test.ts` (81 lines). Copy the structure: `read(...parts)` helper, `lintSteps()` via `js-yaml` `load`, `stepIndex(steps, run)`, and these cases: self-test that files were read (anti-vacuity), package.json script equals `node meta/frontendContextCeiling.cjs`, lint.yml gate index greater than the `pnpm backend-di-ceilings` index, near-miss test with the step filtered out returning -1, pre-push `lines[0]` matches `/^#!/` and `lines[1]` contains the new chain tail (`pnpm backend-di-ceilings && pnpm frontend-context-ceiling`), shard dir non-empty. The existing wiring test asserts `lines[1]` contains `pnpm steam-line-ceiling && pnpm backend-di-ceilings`, which stays true when appending.

**Unit test analog:** `meta/__tests__/backendDiCeilings.test.ts` (fixture files, floors, shrink/grow/stale/new cases). Not read in full for this map; the planner should read it before writing the task.

---

### Per-store tests (test, CRUD)

**Analog:** `src/frontend/state/__tests__/BottleLaunchWaiting.test.ts` lines 1-50. The store is exercised directly (no jsdom), reset in `afterEach`:
```typescript
describe('useBottleLaunchWaiting store', () => {
  afterEach(() => {
    useBottleLaunchWaiting.setState({ entries: {} })
  })
  it('set(appName, detectedCause) stores an entry keyed by appName', () => {
    useBottleLaunchWaiting.getState().set('38410', 'other-session')
    expect(useBottleLaunchWaiting.getState().entries).toEqual({ '38410': { detectedCause: 'other-session' } })
  })
```
`resetAllStores()` generalises that `afterEach` line over a registry of every store's initial snapshot (D-11). Remember `resetMocks: true` in `src/frontend/jest.config.js`: re-arm mocks in `beforeEach`.

---

### Function-component test in node env (test; D-11 in practice)

**Analog:** `src/frontend/screens/Login/components/Runner/__tests__/index.test.tsx` (lines 17-90). Mock `react` with hook slots, mock `react-router-dom`, `react-i18next`, stub `.css`; import the component after the mocks; call it as a plain function and inspect the returned element tree:
```typescript
jest.mock('../index.css', () => ({}))
jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let slots: unknown[] = []
  let cursor = 0
  return {
    ...actualReact,
    useState: (initial: unknown) => { const idx = cursor++; ...; return [slots[idx], setState] },
    useContext: () => ({ showDialogModal: jest.fn() }),   // <- this line is what conversion removes/replaces
    __resetMount: () => { slots = []; cursor = 0 }
  }
})
import Runner from '../index'
```
This file's own comment says `jest.mock` is not hoisted by this ts-jest setup, so imports go after the mocks textually. After conversion, replace the `useContext` stub with seeding the real store (`useUiState.setState({ showDialogModal: ... })`) or `jest.mock('frontend/state/uiState', ...)`. A real zustand hook needs a React dispatcher (Pitfall 2), so Wave 0 must settle one shared helper. Also `src/frontend/jest.config.js` `moduleNameMapper` stubs `\.svg\?react$` to `src/frontend/__mocks__/svgReactStub.tsx`.

---

### Representative consumer conversion: `src/frontend/components/UI/ToggleSwitch/index.tsx`

**Before** (lines 1-4, 28):
```typescript
import { ChangeEventHandler, useContext } from 'react'
import ContextProvider from 'frontend/state/ContextProvider'
...
  const { isRTL } = useContext(ContextProvider)
```
**After (target shape):** drop the `useContext` and `ContextProvider` imports (this is what lowers the ratchet entry for this file to zero, and its shard line is removed in the same commit); read via the settings/language store, e.g. `const isRTL = useSettingsState((s) => RTL_LANGUAGES.includes(s.language))` (derived in the selector, per Pitfall 4). `isRTL` has 8 consumer files; `platform` has 71 (mostly Settings); see RESEARCH fan-out table. No `__tests__` directory exists for ToggleSwitch, so this file has no test to convert. Other UI/ files in the same batch: `LanguageSelector`, `Anticheat`, `DLCList/DLC`, `TwoColTableInput`.

---

### Rewritten source-text gates (test, transform)

**Analog:** `src/frontend/state/__tests__/GlobalStateSteamLogout.test.ts`. It reads `GlobalState.tsx` text (`globalStatePath = join(__dirname, '..', 'GlobalState.tsx')`), extracts a method body with `extractBlock(source, marker)` and strips comments with `stripSourceComments` from `backend/testUtils/stripSourceComments`. When the code moves, the gate either points at the new file or becomes a behavioural test, and it keeps its synthetic merged/regressed self-test (anti-vacuity). The 12 files (RESEARCH Pitfall 3): `GlobalStateFocusRowHydration`, `FramelessRefresh`, `RefreshCacheGuard`, `RefreshLibraryOrigin`, `SavedZoomWiring`, `ScopedRefresh`, `SignInMount`, `SleepAssertionClassification`, `SteamCacheHydration`, `SteamLogout`, `steamSyncStatusWiring`, plus `GameCard/__tests__/hideTitles.test.ts`-style regex gates on `useContext(ContextProvider)`.

## Shared Patterns

### Persistence (D-02)
**Source:** `GlobalState.tsx` lines 589-593 plus `src/frontend/helpers/stores.ts`. **Apply to:** every store setter backed by `configStore`. Write via `configStore.set(key, value)` first, then `set({...})`; no `persist` middleware; keep key names (`games.hidden`, `games.favourites`, `games.customCategories`, `theme`, `zoomPercent`, ...) and the `localStorage` keys `updates`, `sidebar_collapsed`, `hide_changelogs`, `last_changelog`, plus the `current_custom_categories` legacy-key fallback in the constructor.

### Hydration ordering (Pitfall 1)
**Source:** `src/frontend/index.tsx` lines 121-176. **Apply to:** every store and the boot module. `create()` with defaults only, `readInitial()` re-applied inside `initStateSubscriptions()` after `await hydrateStoreSnapshot()`. Keep the CR-02 and blank-screen guard comments intact.

### Selector hook export
**Source:** `GlobalStateV2.ts` lines 108-164. **Apply to:** every store. Default export `{...useShallowHook, keys, setState, getState, subscribe}`. Composite objects (`epic`, `hiddenGames`) are composed in a hook with `useMemo`, never built inside a selector.

### Out-of-React signal handlers
**Source:** `BottleLaunchWaiting.ts` lines 40-62 and sibling `handle*Signal` functions in the other small stores. **Apply to:** boot module; the small stores (D-04) stay untouched. `performSteamLogout` (`SteamSignOut.ts`) and `applySavedZoomAtBoot` (`savedZoomBoot.ts`) are called as is.

### Shrink-only ratchet conventions
**Source:** `meta/backendDiCeilings.cjs` header (lines 36-44). **Apply to:** the new gate. Exact-entry fail on grow or shrink, stale entry fails, zero entry fails, no update flag, scanned-file floor.

### `<verify>` and prettier (repo convention)
**Source:** `Skill("gamelib-conventions")`, CLAUDE.md. **Apply to:** every task. `npx prettier --check <exact paths>` after `--file-info`; omit and say so if every path is prettier-ignored. Todos need `severity:`, `platform:`, `ready:`; the end gate UAT file needs `### N.` headings, inline `expected:` and a `result:` that opens with a status word.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `subscribeWithSelector` usage (boot module subscribers) | service | event-driven | Not used anywhere in `src`; zustand ^4.5.6 is installed. Planner confirms the import via Context7 in Wave 0. Existing stores have no `subscribe` export either. |
| D-14 Profiler harness (`window.__gamelibPerf`, `pnpm perf:rerender`, `69-RERENDER.md`) | utility | batch | No Profiler or perf harness in repo; no jsdom (`src/frontend/jest.config.js` docstring), so RESEARCH Open Question 1 (jsdom devDependency vs in-app dev harness) decides it. A new devDependency needs a `checkpoint:human-verify`. |
| D-15 downloads history (`finishedElem` in `screens/DownloadManager/index.tsx`, backend `'finished'` key in `src/backend/downloadmanager/downloadqueue.ts`) | store | CRUD | Not mapped in this pass; reproduce-first task, so the analog is the downloads store the wave creates plus `downloadManagerStore` in `helpers/stores.ts`. Planner reads the two files and the folded todo. |

## Metadata

**Analog search scope:** `src/frontend/state/`, `src/frontend/helpers/stores.ts`, `src/frontend/index.tsx`, `src/frontend/components/UI/ToggleSwitch`, `src/frontend/screens/Login/components/Runner`, `src/frontend/jest.config.js`, `meta/`, `meta/__tests__/`, `.husky/pre-push`, `.github/workflows/lint.yml`, `package.json`
**Files read:** about 14 (several targeted ranges of the 2,234-line `GlobalState.tsx`)
**Not read in full:** `meta/__tests__/backendDiCeilings.test.ts`, `GlobalState.tsx` constructor (lines 462-575), `src/backend/downloadmanager/downloadqueue.ts`
**Pattern extraction date:** 2026-11-10
