# Phase 69: Consolidate frontend state onto GlobalStateV2 - Research

**Researched:** 2026-11-10
**Domain:** Renderer state migration (React 18 class-component context to zustand 4 stores), shrink-only ratchet, re-render measurement
**Confidence:** MEDIUM-HIGH (codebase facts verified by grep/read this session; the Profiler harness route is MEDIUM because it needs a new devDependency decision)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Separate zustand stores, one per domain. Do not build one combined store out of slices. Indicative domains: UI/dialog, settings/theme/appearance, downloads/install queue, auth (Epic/GOG/Amazon/Steam/Humble), library/game list (including `libraryStatus`, `gameUpdates`, hidden/favourites/categories, `sideloadedLibrary`). The planner fixes the exact boundaries from the field inventory. `GlobalStateV2.ts`'s current fields go into the matching domain stores, so it is split up or renamed rather than kept as the single target. Each store exposes selector hooks that use `useShallow`, like the existing `useGlobalState` / `.keys()` helpers.
- **D-02:** configStore persistence stays inside the actions. Each setter calls `configStore.set(...)` exactly as the class method does today. A store's initial state reads `configStore.get(...)` / the store mirrors when the store is created. No zustand `persist` middleware. Renderer writes only through the mirrors in `src/frontend/helpers/stores.ts` (Phase 68).
- **D-03:** Library data keeps its current shape: per-store `GameInfo[]` arrays, `libraryStatus: GameStatus[]`, etc. Savings come from selector hooks, not normalising (collides with Phase 70).
- **D-04:** The existing small stores are not touched (SteamSignOut, dialogQueue, EngineState, SteamBridge*, InstallGameModal, ...). Exception: a field that exists both in GlobalState and in one of them (e.g. `dialogQueue`) ends with exactly one owner.
- **D-05:** The ~30 `window.api.handle*` listeners move out of `componentDidMount` into a boot module (e.g. `initStateSubscriptions()`), called once from `src/frontend/index.tsx` before render. Each listener writes to its domain store. Other `componentDidMount` boot work (`applySavedZoomAtBoot`, focusRow hydration, `window.addEventListener` handlers) moves into the same module, same order.
- **D-06:** Async actions live in their domain store (epic/gog/amazon/steam/humble login+logout, `refresh`, `refreshLibrary`, `handleGameStatus`, `handleSuccessfulLogin`, `updateGameOverrides`, ...), calling `window.api` and `set()` like `refreshWineVersions`. Cross-domain actions call `useOtherStore.getState().action()`. No service layer. Helpers like `performSteamLogout` stay and are called from the store action.
- **D-07:** Listeners last for the life of the app; no disposer. Tests reset stores between cases.
- **D-08:** `componentDidUpdate` side effects move to `store.subscribe` with `subscribeWithSelector` (sleep-assertion lock/unlock with `SleepAssertionState` diffing, pending-ops logic), registered in the boot module, logic ported unchanged. Existing tests covering this keep passing.
- **D-09:** Move a slice behind a bridge first, then convert its consumers. GlobalState's provider reads the slice from the store and passes it on so unconverted consumers keep working; consumers convert in batches by screen/area. App builds and works after every plan.
- **D-10:** Domain order: UI/dialog -> settings/theme/appearance -> downloads and install queue -> auth (one store at a time) -> library and game list last.
- **D-11:** Tests seed stores directly: `useXState.setState(fixture)` before rendering; shared `resetAllStores()` in `afterEach`. Each test file converts in the same plan as the component it covers. ContextProvider test wrapper deleted at the end. No test-only provider shim keeping the old context shape.
- **D-12:** Ratchet: shrink-only count of non-test files that import `ContextProvider` (or call `useContext(ContextProvider)`; planner picks one metric). Lives in a `meta/` script with a baseline file in the style of `meta/steamLineCeiling.cjs` and `meta/backendDiCeilings.cjs`, wired into the same CI/pre-push gates. Ends at 0. Then `GlobalState.tsx`, `ContextProvider.tsx` and the ratchet itself are deleted. No ESLint ban afterwards.
- **D-13:** Phase 69 lands before Phase 64. Phase 64's custom-theme state goes into Phase 69's settings/theme store (or a new zustand store from day one, never GlobalState, if 64 starts first).
- **D-14:** Measure re-renders with React Profiler commit counts: scripted scenario on a large synthetic library (~2,000 games across stores): toggle an appearance setting, receive a game-status push, open/close a dialog, receive a library refresh. Record Library and GameCard re-render counts and commit durations. Baseline before the first migration wave, re-run at the end. Write both into the phase (e.g. `69-RERENDER.md`). Harness must be repeatable, not a one-off manual profile.
- **D-15 (folded todo, only behaviour change):** Fix the lost downloads history in the downloads wave. Keep the finished list in the downloads store so it survives tab switches (today `finishedElem` component state, refilled on mount). Also diagnose the backend `'finished'` key using the todo's candidates (frontend/sidecar store divergence, pruning, Steam-managed items never reaching `addToFinished`) and fix whichever holds. Reproduce first. Live-gate: completed entries persist across tab switches and app restart, Clear still empties the list.
- **D-16:** One blocking live gate at the end, not one per wave, after `GlobalState.tsx` is deleted, in `pnpm tauri:dev`. Checklist: Library (filters, hidden, favourites, categories), Game page, Downloads (incl. D-15), sign-in/out for each store (Epic, GOG, Amazon, Steam, Humble), ConsoleMode / gamepad focus, theme/zoom/font settings surviving relaunch, dialogs and external-link and redeem-key dialogs. Each wave still passes automated tests, typecheck and lint.

### Claude's Discretion
- Exact list of domain stores and which field goes where (within D-01's grouping).
- File names/layout under `src/frontend/state/` for new stores and boot module.
- Which of the two ratchet metrics in D-12 to count.
- How plans are split into batches within each domain wave.
- Where `TourContext` (`state/TourContext.tsx`, separate provider in `App.tsx`) ends up; outside the ratchet unless it depends on GlobalState.

### Deferred Ideas (OUT OF SCOPE)
- Normalising library data into a map keyed by `${runner}:${appName}`. Revisit after Phase 70.
- ESLint `no-restricted-imports` ban on the deleted context.
- Not folded: `2026-11-05-deeper-theming-of-launch-notice-toast.md` (Phase 64 territory); the Steam bridge/depot/spike todos (keyword noise).
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are mapped (Requirements: TBD). CONTEXT.md decisions D-01..D-16 are the contract.

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01..D-04 | Per-domain stores, persistence in actions | Field inventory, domain split proposal, boot-order pitfall (Pitfall 1) |
| D-05..D-08 | Boot module, async actions, subscribe side effects | Listener/side-effect inventory, `subscribeWithSelector` pattern, test-gate rewrite (Pitfall 3) |
| D-09..D-11 | Bridge, order, test seeding | Bridge design, consumer counts per field, jsdom-less test constraint (Pitfall 2) |
| D-12 | Ratchet | Phase 62/65/66 gate pattern and wiring points |
| D-14 | Re-render measurement | Harness options; jsdom absent (Pitfall 2) |
| D-15 | Downloads history | Todo candidates; reproduce-first task shape |
| D-16 | One live gate | Checklist and discrepancy note |
</phase_requirements>

## Summary

The migration is mechanically large but architecturally simple: one class component (`GlobalState.tsx`, 2,234 lines, ~91 `setState` call sites by grep of `this.setState`, 25 `window.api.handle*` registrations, 12 `localStorage` reads/writes) provides one context value (`ContextType` in `frontend/types.ts:43`, defaults in `ContextProvider.tsx`) to 123 non-test files that call `useContext(ContextProvider)` (124 import it; the delta is `GlobalState.tsx` itself) [VERIFIED: codebase grep 2026-11-10]. The render() builds a fresh value object every time, so every consumer re-renders on any state change; that is the cost this phase removes. The only non-test importer of `GlobalState` is `src/frontend/index.tsx`, so deletion is a one-line change at the end [VERIFIED: grep].

Three facts shape the plan more than the pattern does. First, the frontend jest project runs `testEnvironment: 'node'` with no jsdom, no react-test-renderer; component tests call function components directly with a mocked `react`, and 12 of the GlobalState tests are source-text gates that read `GlobalState.tsx` from disk. D-11's "seed the store then render" therefore means "seed the store then call the component function with mocked hooks", and D-14's Profiler harness needs either a new devDependency (jsdom) or an in-app dev harness. Second, store creation happens at module import, before `hydrateStoreSnapshot()` runs in `index.tsx`; the class component avoids this because it reads stores in its constructor after hydration. Stores must therefore re-read their mirrors from the boot module, not only at `create()` time. Third, consumers destructure composite objects (`epic`, `hiddenGames: {list, add, remove}`, `customCategories`) that the provider rebuilds per render; a naive selector returning such an object defeats `useShallow`.

**Primary recommendation:** Build a `resetAllStores()` + `readInitial*()` convention first (Wave 0), capture the D-14 baseline and land the ratchet before moving any slice, then migrate in D-10 order with a `forceUpdate` bridge in the class, converting the high-fan-out fields (`platform`: 71 consumer files, `showDialogModal`: 25) in the UI wave because they remove the most ratchet entries per plan.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Domain state + actions | Browser/Client (zustand stores in `src/frontend/state/`) | API/Backend via `window.api` | Renderer-only phase; backend stays source of truth for libraries |
| Persistence write-through | Browser/Client mirrors (`helpers/stores.ts`) | Sidecar stores | Phase 68: renderer never migrates, writes through mirrors (D-02) |
| IPC push listeners | Browser/Client boot module | Sidecar/Rust push | Listeners register once outside React (D-05) |
| Sleep-assertion lock/unlock | Browser/Client (store subscriber) | Rust shell (`window.api.lock/unlock`) | Port of `componentDidUpdate` logic unchanged (D-08) |
| Downloads `'finished'` history | API/Backend (`downloadqueue.ts` store) | Browser/Client store cache | D-15: backend owns, frontend keeps list across mounts |
| Re-render measurement | Browser/Client (React Profiler) | Dev tooling in `meta/` | Needs a real React renderer |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zustand | ^4.5.6 (in package.json) | Per-domain stores; `useShallow` from `zustand/react/shallow`; `subscribeWithSelector` from `zustand/middleware` | Already the 17-store pattern in `state/`; `subscribeWithSelector` ships in 4.x core [CITED: zustand docs, middleware API; confirm with Context7/`ctx7` before use - not re-fetched this session] |
| react / react-dom | ^18.3.1 | `Profiler` API for D-14 | Already installed |
| typescript compiler API | existing (used by `meta/backendDiCeilings.cjs`) | AST count for the ratchet | Precedent in repo |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jsdom + jest-environment-jsdom | jsdom 31.0.0 / jest-environment-jsdom 30.5.2 latest on npm (registry only) | A real DOM so `<Profiler>` + `@testing-library/react` (already ^14.3.1) can mount Library | ONLY for the D-14 harness if the operator approves. Repo is on jest ^29.7.0, so the environment package must be the 29.x line, not 30.x. `[ASSUMED]` names and versions; slopcheck could not be installed (pip install denied) and registry existence does not confer verification |
| react-test-renderer | must be 18.x to match React 18.3 (npm latest is 19.3.1, wrong major) | Alternative renderer for Profiler | Alternative to jsdom `[ASSUMED]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| jsdom Profiler harness under jest | Dev-only in-app harness: wrap Library in `<Profiler>`, drive synthetic store pushes from a `window.__gamelibPerf` hook in the Vite dev build, run in `pnpm tauri:dev` | No new dependency; measures the real WebKit renderer; but needs a dev build (Profiler is a no-op in prod builds) and a recorded script, so repeatability depends on discipline. Choose this if the operator rejects the new devDependency |
| `forceUpdate` bridge in the class | Rewrite GlobalState as a function component first | Larger blast radius, violates D-09 "build works after every plan" granularity |

**Installation (only if jsdom route approved, behind a `checkpoint:human-verify`):**
```bash
pnpm add -D jsdom@<29-compatible> jest-environment-jsdom@29
```

**Version verification:** `npm view` returned jsdom 31.0.0, jest-environment-jsdom 30.5.2, react-test-renderer 19.3.1, none with a postinstall script [VERIFIED: npm registry 2026-11-10]. The planner must pin versions compatible with jest 29.7 and React 18.3 at install time.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| jsdom | npm | long-established | very high | github.com/jsdom/jsdom | not run (unavailable) `[ASSUMED]` | Planner gates behind `checkpoint:human-verify` |
| jest-environment-jsdom | npm | long-established | very high | github.com/jestjs/jest | not run `[ASSUMED]` | Same |
| react-test-renderer | npm | long-established | high | github.com/facebook/react | not run `[ASSUMED]` | Same (only if chosen over jsdom) |

**Packages removed:** none. **Flagged [SUS]:** none, but slopcheck was unavailable, so every package above is `[ASSUMED]` and each install needs a human-verify checkpoint. All other work uses packages already in the repo.

## Architecture Patterns

### System Architecture Diagram

```
index.tsx boot
  tauriAttach -> await hydrateStoreSnapshot()  (mirrors now populated)
        |
        v
  initStateSubscriptions()   <-- NEW boot module (D-05)
    1. each store.setState(readInitialX())   (re-read mirrors AFTER hydration; create() ran earlier at import)
    2. register ~25 window.api.handle* listeners  --> store actions/setState
    3. register window.addEventListener handlers, applySavedZoomAtBoot, focusRow hydration, connectivitySync
    4. store.subscribe(selector, effect) side effects: sleep lock/unlock, localStorage mirrors, isRTL body class
        |
        v
  root.render(<GlobalState bridge> <App/> </GlobalState>)   (bridge shrinks per slice, then removed)
        |
   consumers:  unconverted -> useContext(ContextProvider)   (re-render on any bridge change)
               converted   -> useXState(selector)            (re-render only on selected slice)

window.api push --> listener --> useXStore.setState / action
                                    |-- cross-domain: useOtherStore.getState().action()
                                    '-- subscribeWithSelector effects (sleep assertion, storage)
```

### Recommended Project Structure
```
src/frontend/state/
├── stores/ (or flat, planner's choice)
│   ├── uiState.ts            # dialogs, externalLink, redeemKey, settingsModal, uploadLogFileProps, activeController, connectivity, platform
│   ├── settingsState.ts      # theme, zoom, fonts, tiles, language/isRTL, frameless/fullscreen, changelog, experimental, animations
│   ├── downloadsState.ts     # finished list (D-15), install queue mirror, installingEpicGame derivation
│   ├── authEpic.ts authGog.ts authAmazon.ts authSteam.ts authHumble.ts + signIn probe/dismissals
│   ├── libraryState.ts       # epic/gog/amazon/steam library arrays, libraryStatus, gameUpdates, sideloaded, hidden/favourites/categories, refreshing*, steamSyncStatus
│   └── resetAllStores.ts     # test helper; registry of every store's initial snapshot
├── initStateSubscriptions.ts # boot module
├── GlobalStateV2.ts          # split into the stores above (gameOverrides, crossoverRatings, runsForMe, wine refresh, settingsModal)
└── GlobalState.tsx           # shrinks to the bridge, then deleted
meta/frontendContextCeiling.cjs + frontendContextCeilingBaseline.json (+ meta/__tests__ unit + wiring tests)
```

### Pattern 1: Domain store with selector hook (copy of `GlobalStateV2.ts`)
**What:** `create<T>()(subscribeWithSelector((set, get) => ...))`; export `{...useShallowHook, keys, setState, getState, subscribe}` as `GlobalStateV2` does today. Setters call `configStore.set(...)` then `set(...)` (D-02).
**When:** every domain store.
```typescript
// Source: src/frontend/state/GlobalStateV2.ts (existing pattern) + zustand subscribeWithSelector
const useRaw = create<UiState>()(subscribeWithSelector((set) => ({ /* ... */ })))
const useUiState = <T>(sel: (s: UiState) => T) => useRaw(useShallow(sel))
export default { ...useUiState, keys: useUiStateKeys, setState: useRaw.setState,
  getState: useRaw.getState, subscribe: useRaw.subscribe }
```

### Pattern 2: Boot-time re-read of mirrors
**What:** each store exports `readInitial()` (reads `configStore.get`/mirrors/`localStorage`) and `initStateSubscriptions()` calls `useXStore.setState(readInitial())` first. `create()` uses safe defaults so import-time evaluation (before `hydrateStoreSnapshot`) is harmless.
**Why:** see Pitfall 1.

### Pattern 3: Bridge during migration (D-09)
**What:** slice leaves `this.state`; the class `render()` reads it with `useXStore.getState()` when building the context value, and subscribes with `store.subscribe(() => this.forceUpdate())` registered in the constructor/`componentDidMount` (read `getState()` in render so no update is missed between construction and mount). Unconverted consumers keep working; converted ones no longer depend on the bridge. Class-owned fields shrink every plan.
**Anti-pattern:** two writers for one field (class `setState` and store). A field has exactly one owner from the plan that moves it (D-04 rule, generalised).

### Pattern 4: Compose composite objects in a hook, not a selector
`epic: {library, login, logout}` and `hiddenGames: {list, add, remove}` are built per render today. Expose raw fields plus stable actions on the store, and let a convenience hook (`useEpicAccount()`) select with `useShallow` and `useMemo` the composite. Selecting a freshly built object inside the selector re-renders every time (shallow-compare sees new inner objects).

### Anti-Patterns to Avoid
- **`persist` middleware** (D-02): changes write timing and key shapes.
- **Selector returning `state` whole** or a new array/object per call: re-renders on every change.
- **Registering listeners inside a React effect:** double-registration risk (StrictMode is currently commented out in `index.tsx` but should not be relied on).
- **Copying `localStorage` reads at module scope in a new store:** `GlobalState.tsx:80` does `const storage = window.localStorage` at module scope; new stores must guard or defer, or node-env tests cannot import them.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Field-diffed side effects (sleep assertion) | A custom previous-state tracker | `subscribeWithSelector` with an equality fn; keep the existing `reconcileSleepAssertionCalls` and `classifySleepAssertionKind` unchanged | Logic is already tested; D-08 says port unchanged |
| Shallow selector equality | Manual `useRef` compare | `useShallow` (already used) | Repo standard |
| Ratchet scanner | A grep/regex counter | `ts.createSourceFile` AST count as in `meta/backendDiCeilings.cjs` | Regex miscounts comments and strings; existing prior art incl. fixture tests and floors |
| Connectivity ordering | New logic | Existing `createConnectivitySync` | Already handles epoch/seq stamping |
| Store reset in tests | Per-test hand resets | One `resetAllStores()` registry with each store's initial snapshot | D-11 |

## Runtime State Inventory

Not a rename phase, but persisted keys must not change. Items the migration touches:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `localStorage` keys written by `componentDidUpdate`: `updates`, `sidebar_collapsed`, `hide_changelogs`, `last_changelog`; read in constructor incl. `current_custom_categories` with legacy `current_custom_category` fallback; `configStore`/`gameOverridesStore`/`downloadManagerStore` mirrors | Code edit only: keep key names and shapes; port the four cDU writes to `subscribeWithSelector`; keep the legacy-key fallback |
| Live service config | None | None, verified: no external service is configured by state names |
| OS-registered state | None | None |
| Secrets/env vars | None | None |
| Build artifacts | None | None |

## Common Pitfalls

### Pitfall 1: Store initial state read before hydration
**What goes wrong:** `index.tsx` comments (~lines 5, 12, 121-176) state mirror hydration (`await hydrateStoreSnapshot()`) must finish before GlobalState's constructor reads stores. ES static imports evaluate first, so a zustand store whose `create()` reads `configStore.get(...)` (as `GlobalStateV2` does today for `gameOverrides`) captures empty/default values. For a theme or `framelessWindow: true` user this is exactly the CR-02 bug class already documented there.
**How to avoid:** `create()` uses defaults; `readInitial()` re-applies after hydration inside `initStateSubscriptions()`, which is called after the hydrate `await` and before `root.render`. Add a test that a store's `readInitial()` reads the mirror at call time, not import time. Also verify the existing `gameOverrides` init (flag as an existing latent hazard; fix inside Phase 69's UI wave only if it reproduces, otherwise todo, per "no behaviour change").
**Warning signs:** correct values in dev after hot reload but defaults on cold launch; settings "not surviving relaunch" (D-16 item).

### Pitfall 2: No DOM in the frontend jest project
**What goes wrong:** `src/frontend/jest.config.js` is `testEnvironment: 'node'`, `resetMocks: true`, no jsdom, no react-test-renderer; `@testing-library/react` is installed but unusable without a DOM. Component tests mock `react` (`useState`/`useContext` slots) and invoke the component as a function (see `Login/components/Runner/__tests__/index.test.tsx`). Planning "render with `setState` fixture" tasks as if a DOM existed will produce unrunnable tests.
**How to avoid:** D-11 in practice = seed the store, mock `react`'s `useContext` removal by simply having the component call the store hook; mock the store hook module or call `useXStore.setState` and let the real hook run (zustand's hook needs a React dispatcher: mock `react` `useSyncExternalStore`-compatible or test against `getState()`/selectors directly). Prefer testing pure selectors and store actions directly, and component wiring with the existing function-call pattern. Plan an explicit Wave 0 task that settles one shared helper for "call a component that uses a zustand hook in node env" before 30 files copy different workarounds.
**Warning signs:** "Invalid hook call" in tests; `resetMocks: true` wiping mock implementations set at module scope (use `jest.mock` factories or re-arm in `beforeEach`).

### Pitfall 3: Source-text gates read GlobalState.tsx from disk
**What goes wrong:** 12 tests in `src/frontend/state/__tests__/` (`GlobalState*.test.ts`, `steamSyncStatusWiring.test.ts`, `GlobalStateSleepAssertionClassification.test.ts`, ...) read `GlobalState.tsx` text, extract function bodies or assert source shapes because the file cannot be imported (module-scope `window.localStorage`). Moving code out turns them red or, worse, vacuously green (asserting on a file that no longer holds the code). Another family (e.g. `GameCard/__tests__/hideTitles.test.ts:29`) regex-asserts `useContext(ContextProvider)` destructuring.
**How to avoid:** every slice plan lists which of these tests it invalidates and rewrites them in the same plan against the new location, keeping the anti-vacuity self-tests (project rule). Better: now that logic is in importable store modules, replace source-text gates with behavioural tests (D-08 "keep existing tests passing" means the behaviours, not the text). Add each rewritten gate's red-first proof.

### Pitfall 4: Composite objects and unstable selector output
See Pattern 4. Also `installingEpicGame` and `isRTL` are derived in `render()`; derive in selectors from `libraryStatus`/`language`, never store them.

### Pitfall 5: Hot-path churn in `libraryStatus`
`libraryStatus` updates on every game-status push, and `handleGameStatus` has side effects (`useBottleLaunchWaiting.getState().clear(appName)`, sleep assertion). Moving it last (D-10) is right, but the sleep-assertion subscriber must be registered with a selector on `libraryStatus` only, and the `SleepAssertionState` baseline must start from the same initial value (`{display:false, system:false}`) or a boot-time lock/unlock call is missed or duplicated.

### Pitfall 6: Stale-UI bugs only the live app shows
Bridge ordering can leave a consumer reading a bridged copy that updates one commit late. Mitigation within D-16's single live gate: the end gate is blocking; for waves, require the automated checks plus a short non-blocking dev smoke note (see Validation). Raise to the planner: D-16 deliberately removed per-wave live gates, though the orchestrator brief for this research still lists per-wave smoke checks; follow D-16 (locked) and treat per-wave smoke as optional.

### Pitfall 7: Dual owners during bridge
`dialogQueue` exists in both `GlobalState` and `state/dialogQueue.ts`. Resolve ownership in the UI wave's first plan.

## Code Examples

### Ratchet gate shape (copy of `meta/steamLineCeiling.cjs` + `backendDiCeilings.cjs`)
```javascript
// Source: meta/steamLineCeiling.cjs, meta/backendDiCeilings.cjs (repo)
// meta/frontendContextCeiling.cjs: count, per non-test src/frontend file, import declarations of the
// ContextProvider module (any specifier resolving to state/ContextProvider) via ts.createSourceFile.
// Baseline: { "src/frontend/...tsx": n }. Rules: file above entry fails (grew); below fails (lower it in the
// same commit); entry for a missing file fails; a file in no baseline with a count fails (new consumer);
// scanned-file floor so "scanned nothing" fails; NO --update flag. Skip __tests__, __mocks__, node_modules.
```
Recommended metric: count **imports of `ContextProvider`** (not `useContext` calls). An import cannot hide behind aliasing (`React.useContext`, as in `hooks/hasStatus.ts:65`), and removing the import is exactly what lets the file compile after `ContextProvider.tsx` is deleted. Counted today: 124 files (123 consumers + `GlobalState.tsx`); the planner should re-measure at implementation, since Phase 62 and other work are still moving files.

**Wiring points to copy** (all verified): `package.json` script `"frontend-context-ceiling": "node meta/frontendContextCeiling.cjs"`; append `&& pnpm frontend-context-ceiling` to `.husky/pre-push`; a step in `.github/workflows/lint.yml` after "Backend DI ceilings" (line ~42) with the comment style used there; a Meta wiring test modelled on `meta/__tests__/backendDiCeilingsWiring.test.ts` (it pins package.json, the CI step and the pre-push order); a unit test with fixture files modelled on `meta/__tests__/backendDiCeilings.test.ts`. A shard-per-plan layout (`meta/backendDiCeilings/*.json`) exists so parallel plans do not conflict on one JSON; because this ratchet's plans are mostly sequential by domain wave, a single baseline file is simpler but parallel executors in one wave will conflict on it. Recommend a sharded directory `meta/frontendContextCeiling/*.json` keyed by screen area, matching the proven layout.

### Selector hook consumption (target shape)
```typescript
// Source: GlobalStateV2.ts pattern, applied to a converted consumer
const { platform } = useUiState.keys('platform')            // was: useContext(ContextProvider)
const showDialogModal = useUiState((s) => s.showDialogModal)
```

### Sleep assertion port (D-08)
```typescript
// Source: componentDidUpdate in GlobalState.tsx (to be ported unchanged)
let sleepState: SleepAssertionState = { display: false, system: false }
useLibraryState.subscribe((s) => s.libraryStatus, (libraryStatus) => {
  const next = { display: libraryStatus.some(g => classifySleepAssertionKind(g.status) === 'display'),
                 system:  libraryStatus.some(g => classifySleepAssertionKind(g.status) === 'system') }
  for (const call of reconcileSleepAssertionCalls(sleepState, next)) { /* lock(playing) / unlock */ }
  sleepState = next
})
```
Note the class runs this on EVERY update; subscribing on `libraryStatus` only is equivalent for the sleep part because the inputs are only `libraryStatus`. The four `localStorage` writes get their own selectors (`gameUpdates`, `sidebarCollapsed`, `hideChangelogsOnStartup`, `lastChangelogShown`); `document.body.classList.toggle('isRTL', ...)` keys on `language` and must also run once at boot (cDU ran after first render).

## Consumer fan-out (non-test files destructuring each field from `useContext(ContextProvider)`; word-match, approximate)

| Field | Files | Field | Files |
|-------|-------|-------|-------|
| platform | 71 | steam | 41 |
| gog | 27 | showDialogModal | 25 |
| epic | 21 | amazon / humble | 15 / 15 |
| refresh | 15 | refreshLibrary | 13 |
| libraryStatus | 11 | isRTL | 8 |
| sideloadedLibrary | 7 | language | 6 |
| theme / customCategories / connectivity | 5 each | gameUpdates | 4 |
| hiddenGames | 3 | favouriteGames / handleExternalLinkDialog | 2 each |

[VERIFIED: grep this session; a file can appear under several fields.] Implication: `platform` is effectively a constant set at startup (`'unknown'` default), used by 71 files, mostly Settings. Putting it in the UI store early and converting those files as batch plans removes more than half of the ratchet baseline in the first wave, which validates the D-10 order. Note `refresh`/`refreshLibrary` consumers (15/13) depend on the library store, so convert them in the library wave even though they are actions; or expose thin forwarding actions from the UI store during the bridge. Planner decides.

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Class component + one context value object | zustand stores + `useShallow` selectors | Consumers re-render only on selected slice |
| `componentDidUpdate` side effects | `subscribeWithSelector` | Effects keyed to fields, not every update |

zustand `persist` exists but is explicitly rejected (D-02).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `subscribeWithSelector` and `zustand/react/shallow` exist in installed zustand ^4.5.6 as used above | Standard Stack | Low; `useShallow` already imported from `zustand/react/shallow` in repo. Planner confirms `subscribeWithSelector` import path with Context7/`ctx7` in Wave 0 |
| A2 | jsdom + jest-environment-jsdom@29 (+ RTL 14) can mount Library with `<Profiler>` under this repo's CSS/SVG module mappers | Standard Stack | Medium; Library imports stylesheets and `?react` SVGs, mappers may be needed for the harness project. Fallback is the in-app harness |
| A3 | Package names/versions for jsdom, jest-environment-jsdom, react-test-renderer are legitimate | Package Audit | Low but unverified by slopcheck; human-verify checkpoint required |
| A4 | `forceUpdate` bridge keeps unconverted consumers consistent with no missed update | Pattern 3 | Medium; verify in the first bridged slice with a test that mutates the store and asserts render output |
| A5 | Existing `gameOverrides` init in `GlobalStateV2.ts` reads the mirror at import time and may be stale on cold boot | Pitfall 1 | Low/unknown; only checked by reading `create()`, not reproduced. Todo if real |
| A6 | Per-file field counts in the fan-out table are approximate (word match) | Consumer fan-out | Low |

## Open Questions

1. **Profiler harness route (jsdom devDependency vs in-app dev harness).**
   - Known: no DOM in frontend jest; D-14 demands repeatability; adding npm packages needs a human-verify checkpoint in this repo.
   - Unclear: operator preference; whether Library mounts under jsdom without heavy stubbing.
   - Recommendation: Wave 0 spike task with a `checkpoint:human-verify` on the install; if rejected or Library will not mount, use the in-app harness exposing `window.__gamelibPerf` in dev builds only, with the scenario scripted in a file (`meta/` or `src/frontend/dev/`) and results written to `69-RERENDER.md`. Either way the baseline must be captured before the first slice moves.
2. **Where do `refresh`/`refreshLibrary`/login actions live relative to the UI store bridge** (see fan-out note). Planner decides within D-06.
3. **Downloads `'finished'` root cause (D-15).** Not diagnosed. Task order: reproduce, record what `downloadManagerStore` holds in sidecar vs renderer mirror, then fix the holding candidate. If the cause is a store divergence it may touch backend/sidecar files and needs `pnpm build:sidecar` and a dev restart before live testing (known repo behaviour: tauri dev does not rebuild the sidecar).
4. **Per-wave live smoke vs D-16.** CONTEXT locks one end gate; confirm nothing else is wanted.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node / pnpm / jest (ts-jest) | all tests | yes (repo toolchain) | jest ^29.7.0 | none needed |
| jsdom | D-14 jest harness | no (not in node_modules) | npm latest 31.0.0 | in-app dev harness |
| react-test-renderer | alternative | no | npm latest 19.3.1 (wrong major) | in-app dev harness |
| `pnpm tauri:dev` (Rust shell, macOS) | D-16 live gate | assumed (operator machine); not probed | n/a | none; blocking gate needs the operator |
| slopcheck | package audit | no (pip install denied in this session) | n/a | `[ASSUMED]` + human-verify |

**Missing with no fallback:** none. **Missing with fallback:** jsdom (in-app harness).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest ^29.7.0 + ts-jest; multi-project (`src/frontend` project is `testEnvironment: 'node'`, `resetMocks: true`, no jsdom); `meta` project for gate tests |
| Config file | `/Users/graysonmitchell/Projects/GameLib/jest.config.js`, `src/frontend/jest.config.js`, `meta/jest.config.js` |
| Quick run command | `npx jest --selectProjects Frontend --runTestsByPath <paths>` and `pnpm codecheck` |
| Full suite command | `pnpm test:ci && pnpm codecheck && pnpm lint && pnpm prettier && pnpm find-deadcode && pnpm frontend-context-ceiling` (match `.husky/pre-push`, which also runs `pnpm boundaries`, `pnpm steam-line-ceiling`, `pnpm backend-di-ceilings`, `pnpm i18n --fail-on-update`) |

Existing state tests (`src/frontend/state/__tests__/`): `GlobalStateFocusRowHydration`, `GlobalStateFramelessRefresh`, `GlobalStateRefreshCacheGuard`, `GlobalStateRefreshLibraryOrigin`, `GlobalStateSavedZoomWiring`, `GlobalStateScopedRefresh`, `GlobalStateSignInMount`, `GlobalStateSleepAssertionClassification`, `GlobalStateSteamCacheHydration`, `GlobalStateSteamLogout`, `steamSyncStatusWiring`, plus small-store tests. Most are source-text gates (Pitfall 3). 32 test files reference `ContextProvider`.

### Phase Requirements to Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| D-01/D-02 | Store setters write through mirror with same keys; `readInitial()` reads at call time | unit | `npx jest --selectProjects Frontend --runTestsByPath src/frontend/state/__tests__/<store>.test.ts` | Wave 0 (new per store) |
| D-05/D-07 | Boot module registers each listener exactly once; calling twice is a no-op or tested as once | unit | `.../initStateSubscriptions.test.ts` | Wave 0 |
| D-08 | Sleep-assertion lock/unlock sequence identical for status sequences (incl. boot state) | unit | rewrite of `GlobalStateSleepAssertionClassification.test.ts` against the store | rewrite per slice |
| D-09 | Bridge: store mutation re-renders unconverted consumer output | unit | `.../bridge.test.ts` | Wave 0/UI wave |
| D-11 | `resetAllStores()` restores every store snapshot | unit | `.../resetAllStores.test.ts` | Wave 0 |
| D-12 | Ratchet: grew/shrank/stale/new/floor/no-update-flag fixtures; CI + pre-push + package.json wiring | meta unit | `npx jest --selectProjects Meta --runTestsByPath meta/__tests__/frontendContextCeiling.test.ts meta/__tests__/frontendContextCeilingWiring.test.ts` | Wave 0 |
| D-14 | Scenario runs and emits JSON of Library/GameCard commit counts and durations | harness | `pnpm perf:rerender` (name to be chosen) | Wave 0 |
| D-15 | Finished list survives unmount/remount; Clear empties it; root-cause test per diagnosed candidate | unit (+ backend test if sidecar changed) | `.../downloadsState.test.ts` | with downloads wave |
| D-16 | Live checklist | manual `pnpm tauri:dev` | see below | UAT file |

### Re-render measurement (D-14)
Scenario script (same for baseline and final): synthetic library of ~2,000 `GameInfo` across epic/gog/amazon/steam/sideload seeded into the stores (or, pre-migration, into the class state through a dev-only entry); wrap Library and `GameCard` in `<Profiler id onRender>`; run four steps (appearance toggle, one `libraryStatus` push, dialog open/close, `refreshLibrary` result push); record per step the `onRender` call count per profiler id plus summed `actualDuration`; repeat N=5 and report median. `Profiler` only reports in dev builds (or `react-dom/profiling`), not a production bundle. Because baseline predates the stores, the harness must drive state through a seam that exists on both sides: a dev-only `window.__gamelibPerf.apply(step)` that, before migration, calls the class instance's methods, and after, the store actions. Plan the harness to isolate that seam in one file so the final re-run edits one file. Output committed as `69-RERENDER.md` with baseline and final tables. Success is a reported reduction, not a hard threshold (none was specified).

### Sampling Rate
- **Per task commit:** touched tests via `--runTestsByPath`, `pnpm codecheck`, `npx prettier --check <exact paths>` (check `--file-info` first, per `Skill("gamelib-conventions")`; omit the check and say so if every path is prettier-ignored); for plans that lower the ratchet, `pnpm frontend-context-ceiling`.
- **Per wave merge:** `pnpm test:ci`, `pnpm codecheck`, `pnpm lint`, `pnpm find-deadcode` (moved/removed exports shift knip baselines), `pnpm frontend-context-ceiling`.
- **Phase gate:** full suite green, ratchet at 0 with the gate and `GlobalState.tsx`/`ContextProvider.tsx` deleted, D-14 final numbers recorded, then the D-16 live gate.

### Per-wave smoke vs the single live gate
Per D-16 only the end gate blocks. If the planner wants an inexpensive per-wave check, make it non-blocking: after each domain wave open `pnpm tauri:dev` (never `tauri:dev:run`, which skips the dev-vault flag) and glance at the domain's own surfaces (UI wave: dialogs; settings wave: theme/zoom/font; downloads: Downloads tab; auth: that store's sign-in/out; library: Library/Game/ConsoleMode). The D-16 end checklist must be written as a `*-UAT.md` with `### N.` headings at column 0, `expected:` inline, and `result:` opening with a bare/bracketed status word (conventions skill). The D-15 live item goes in the same file. Move the folded todo to `todos/completed/` when that item passes; any new todo needs `severity:`, `platform:`, `ready:` frontmatter in that order.

### Wave 0 Gaps
- [ ] `resetAllStores()` registry + helper for calling zustand-using components in the node env (Pitfall 2)
- [ ] `initStateSubscriptions.ts` skeleton + test, `readInitial()` convention + test
- [ ] Ratchet script, baseline shards, unit + wiring tests, `package.json`/`lint.yml`/`.husky/pre-push` wiring
- [ ] D-14 harness and **baseline capture before any slice moves**
- [ ] Decision/checkpoint on jsdom devDependency (or in-app harness)
- [ ] Inventory: for each of the 32 test files and 12 source-text gates, which plan converts it

## Security Domain

`security_enforcement` is not set to false in config, so included, but this phase is renderer-internal state plumbing with no new trust boundary.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | indirect | Login/logout actions move stores but must keep calling the same `window.api` login/logout and `performSteamLogout`; no token handling added to the renderer |
| V3 Session Management | indirect | Do not persist auth tokens or sign-in secrets in new stores or `localStorage` (the `dismissedSignInNotices` set is non-secret); keep Phase 72's renderer trust-boundary rules |
| V4 Access Control | no | |
| V5 Input Validation | indirect | IPC payloads keep their existing `sanitize*` passes (`sanitizeSignInProbeOutcomeMap`, `normalizeSignInDismissals`) when listeners move |
| V6 Cryptography | no | |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Listener moved without its sanitizer, trusting a push payload | Tampering | Port sanitizers with the listener; test each |
| Sensitive values logged from store actions | Information disclosure | Keep existing log calls only; repo `logSecretGate` applies |
| Auth state left populated after logout (new store not cleared) | Information disclosure | Logout action clears the same fields the class cleared; per-store test |

## Project Constraints (from CLAUDE.md)
- GameLib is an independent project; do not raise deviation from upstream Heroic as a concern.
- Work goes through GSD commands; plans are executed via `/gsd-execute-phase` (hyphen form).
- Conventions (load `Skill("gamelib-conventions")`): every task `<verify>` runs `npx prettier --check` over exact paths (scoped, `--file-info` first); todo files in `.planning/todos/pending/` carry `severity:`, `platform:`, `ready:`; UAT item shape (`### N.`, inline `expected:`, `result:` opens with status word); spawn sites use `createFakeHomeProfile()` (not expected in this phase except D-15 backend tests, if any); sidecar timers `unref()`.
- Dev launch is `pnpm tauri:dev`, never `tauri:dev:run`; a backend/sidecar change (possible in D-15) needs `pnpm build:sidecar` and a dev restart before live testing; a fresh worktree needs build prep.
- Use `graphify query` before raw grepping the codebase; never read `graphify-out/GRAPH_REPORT.md` or `graph.json` whole; run `graphify update .` after modifying code.
- Sketch findings (`sketch-findings-gamelib`): multi-theme survival rules matter for the settings/theme store; this phase must not alter theme class application order (`window.setTheme`, body classes) — not read in detail this session; planner should skim the skill before the settings wave.
- Memory: macOS embed titlebar-style testing applies to frameless/fullscreen state live checks (test both frameless ON and OFF); do not report emojis.

## Sources

### Primary (HIGH confidence, read this session)
- `.planning/phases/69-*/69-CONTEXT.md`, ROADMAP Phase 69/70 entries
- `src/frontend/state/GlobalState.tsx` (StateProps, componentDidMount tail, componentDidUpdate, render head), `ContextProvider.tsx`, `GlobalStateV2.ts`, `frontend/types.ts` ContextType
- `src/frontend/index.tsx` (boot ordering, render), `src/frontend/jest.config.js`, root `jest.config.js`
- `meta/steamLineCeiling.cjs`, `meta/backendDiCeilings.cjs`, `meta/backendDiCeilings/` shards, `.husky/pre-push`, `.github/workflows/lint.yml`, `meta/__tests__/backendDiCeilingsWiring.test.ts`
- `.planning/todos/pending/2026-11-05-downloads-history-lost-on-tab-return.md`
- Frontend tests: `Login/components/Runner/__tests__/index.test.tsx`, `state/__tests__/*` headers
- npm registry (`npm view`) for jsdom, jest-environment-jsdom, react-test-renderer (version and postinstall only)

### Secondary / Tertiary
- zustand `subscribeWithSelector` API and React `Profiler` behaviour in production builds: training knowledge, `[ASSUMED]`; confirm via Context7/official docs in Wave 0.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM-HIGH, existing repo pattern; new-dependency route unverified
- Architecture: MEDIUM-HIGH, derived from reading the class and boot code; the bridge design is a recommendation to validate in the first slice
- Pitfalls: HIGH for 1-3 (read directly in repo files), MEDIUM for 4-7

**Counts to re-measure at plan time (they drift):** 123/124 ratchet files, 32 test files, 12 source-text gate tests, 25 `window.api.handle*` registrations, 91 `this.setState` greps (the roadmap says 78; the count method differs).

**Research date:** 2026-11-10
**Valid until:** 2026-11-17 for counts (Phase 62/70/64 adjacent work moves files); patterns stable 30 days.
