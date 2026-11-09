# Phase 69: Consolidate frontend state onto GlobalStateV2 - Context

**Gathered:** 2026-11-10
**Status:** Ready for planning

<domain>
## Phase Boundary

The frontend has one state system. The class component `src/frontend/state/GlobalState.tsx`
(2,234 lines, `extends PureComponent`) and the React context it serves through
`src/frontend/state/ContextProvider.tsx` are deleted. Their state, actions, IPC listeners and
`componentDidUpdate` side effects move into zustand stores, so a change in one domain no longer
re-renders every context consumer.

Measured at discussion time (2026-11-10, excluding tests): 123 source files call
`useContext(ContextProvider)`, concentrated in `screens/Settings` (49), `components/UI` (27),
`screens/Library` (16), `screens/Game` (7), `screens/Login` (5), `screens/DownloadManager` (4) and
`screens/ConsoleMode` (3). 32 test files reference `ContextProvider`. 20 files use `GlobalStateV2`.

Apart from the one folded todo (D-15), the phase changes no behaviour. Any other defect found
during the move becomes a todo; it is not fixed in this phase.

</domain>

<decisions>
## Implementation Decisions

### Store shape
- **D-01:** **Separate zustand stores, one per domain.** Do not build one combined store out of
  slices. Indicative domains: UI/dialog, settings/theme/appearance, downloads/install queue,
  auth (Epic/GOG/Amazon/Steam/Humble), library/game list (including `libraryStatus`,
  `gameUpdates`, hidden/favourites/categories, `sideloadedLibrary`). The planner fixes the exact
  boundaries from the field inventory. This follows the 17 small stores already in `state/`.
  `GlobalStateV2.ts`'s current fields go into the matching domain stores, so it is split up or
  renamed rather than kept as the single target. Each store exposes selector hooks that use
  `useShallow`, like the existing `useGlobalState` / `.keys()` helpers.
- **D-02:** **configStore persistence stays inside the actions.** Each setter calls
  `configStore.set(...)` exactly as the class method does today. A store's initial state reads
  `configStore.get(...)` / the store mirrors when the store is created. Do not use the zustand
  `persist` middleware: it would change write timing and key shapes. This follows Phase 68's rule
  that the renderer writes only through the mirrors in `src/frontend/helpers/stores.ts`.
- **D-03:** **Library data keeps its current shape:** per-store `GameInfo[]` arrays,
  `libraryStatus: GameStatus[]`, and so on. Re-render savings come from selector hooks, not from
  normalising the data. Normalising would collide with Phase 70's GameInfo split.
- **D-04:** **The existing small stores are not touched** (SteamSignOut, dialogQueue,
  EngineState, SteamBridge*, InstallGameModal, ...). The one exception is a field that exists both
  in GlobalState and in one of these stores (e.g. `dialogQueue`): it ends up with exactly one owner.

### IPC subscriptions, async actions, side effects
- **D-05:** **The roughly 30 `window.api.handle*` listeners move out of `componentDidMount` into a
  boot module** (e.g. `initStateSubscriptions()`), which `src/frontend/index.tsx` calls once before
  render. Each listener writes to its domain store with `setState` or a store action. Because this
  runs outside React, StrictMode double-mounts and remounts cannot register a listener twice. The
  other `componentDidMount` boot work (`applySavedZoomAtBoot`, focusRow hydration,
  `window.addEventListener` handlers) moves into the same module, in the same order.
- **D-06:** **Async actions live in their domain store.** This covers epic/gog/amazon/steam/humble
  login and logout, `refresh`, `refreshLibrary`, `handleGameStatus`, `handleSuccessfulLogin`,
  `updateGameOverrides`, and so on. Each one calls `window.api` and `set()`, the same pattern as
  today's `GlobalStateV2.refreshWineVersions`. An action that crosses domains (a login that
  triggers a library refresh) calls `useOtherStore.getState().action()`. Do not add a separate
  service layer. Existing helpers such as `performSteamLogout` (SteamSignOut.ts) stay as they are
  and are called from the store action.
- **D-07:** **Listeners last for the life of the app, as they do today.** `componentDidMount`
  never unsubscribes, so the boot module does not need to return a disposer. Tests reset the
  stores between cases instead of tearing down listeners.
- **D-08:** **`componentDidUpdate` side effects move to `store.subscribe`.** These are the
  sleep-assertion lock/unlock with its `SleepAssertionState` diffing and the pending-ops logic.
  Use zustand's `subscribeWithSelector` on the fields involved, registered in the boot module, and
  port the logic unchanged. Keep the existing tests that cover this behaviour passing.

### Migration path and coexistence
- **D-09:** **Move a slice behind a bridge first, then convert its consumers.** Each domain first
  moves its state and actions into its zustand store. GlobalState's provider then reads that slice
  from the store and passes it on, so consumers that have not converted keep working. Consumers
  then convert in batches grouped by screen or component area. The app builds and works after
  every plan.
- **D-10:** **Domain order: low-risk first.** UI/dialog → settings/theme/appearance → downloads
  and install queue → auth, one store at a time → library and game list last. This proves the
  pattern on simple state before the hot path and the domains with the most IPC.
- **D-11:** **Tests seed the stores directly.** A test calls `useXState.setState(fixture)` before
  rendering, and a shared `resetAllStores()` runs in `afterEach`. Each test file converts in the
  same plan as the component it covers. The ContextProvider test wrapper is deleted at the end.
  No test-only provider shim that keeps the old context shape.
- **D-12:** **Ratchet.** A shrink-only count of non-test files that import `ContextProvider`
  (or call `useContext(ContextProvider)`; the planner picks one metric and keeps it). It lives in a
  `meta/` script with a baseline file, in the style of `meta/steamLineCeiling.cjs` and
  `meta/backendDiCeilings.cjs`, and is wired into the same CI/pre-push gates. It ends at 0.
  `GlobalState.tsx`, `ContextProvider.tsx` and the ratchet itself are then deleted. No ESLint ban
  afterwards.

### Phase order and verification
- **D-13:** **Phase 69 lands before Phase 64.** Phase 64 (custom-theme editor) adds its
  custom-theme state to Phase 69's settings/theme store. If 64 ever has to start first, its state
  goes into a new zustand store from day one and never into GlobalState.
- **D-14:** **Measure re-renders with React Profiler commit counts.** Use a scripted scenario on a
  large synthetic library (about 2,000 games across stores): toggle an appearance setting, receive
  a game-status push, open and close a dialog, receive a library refresh. Record how many times
  Library and GameCard re-render and how long commits take. Capture the baseline before the first
  migration wave and re-run it at the end. Write both sets of numbers into the phase (e.g. a
  `69-RERENDER.md`). The harness must be repeatable, not a one-off manual profile.
- **D-15 (folded todo, the phase's only behaviour change):** **fix the lost downloads history in
  the downloads wave.** When the downloads slice moves, keep the finished list in the downloads
  store so it survives tab switches. Today it lives in `finishedElem` component state, refilled
  on mount. Also diagnose the backend `'finished'` key using the candidates the todo lists
  (frontend/sidecar store divergence, pruning, Steam-managed items that never reach
  `addToFinished`), and fix whichever one holds. Reproduce first. Live-gate item: completed
  entries persist across tab switches and across an app restart, and Clear still empties the list.
- **D-16:** **One blocking live gate at the end, not one per wave.** It runs after
  `GlobalState.tsx` is deleted, in `pnpm tauri:dev`. Checklist: Library (filters, hidden,
  favourites, categories), Game page, Downloads (including D-15), sign-in and sign-out for each
  store (Epic, GOG, Amazon, Steam, Humble), ConsoleMode / gamepad focus, theme/zoom/font settings
  surviving a relaunch, dialogs and the external-link and redeem-key dialogs. Each wave still has
  to pass the automated tests, typecheck and lint.

### Claude's Discretion
- The exact list of domain stores and which field goes where (within D-01's indicative grouping).
- File names and layout under `src/frontend/state/` for the new stores and the boot module.
- Which of the two ratchet metrics in D-12 to count.
- How plans are split into batches within each domain wave.
- Where `TourContext` (`state/TourContext.tsx`, a separate provider mounted in `App.tsx`) ends
  up. It is not `ContextProvider` and is outside the ratchet unless it turns out to depend on
  GlobalState.

### Folded Todos
- **`.planning/todos/pending/2026-11-05-downloads-history-lost-on-tab-return.md`.** The Downloads
  tab loses its completed-download history after you navigate away and back. It folds in because
  the downloads wave rewrites exactly the state that holds this list. Handled by D-15. Move the
  todo to `todos/completed/` when D-15's live-gate item passes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` § "Phase 69: Consolidate frontend state onto GlobalStateV2": the goal,
  three-part scope, open questions (answered above) and Phase 62 dependency

### Code being retired / extended
- `src/frontend/state/GlobalState.tsx`: field inventory (`StateProps`, ~lines 112–216), initial
  state from stores (~462–575), actions (~576–1480), `componentDidMount` listeners (~1587–1990),
  `componentDidUpdate` side effects, provider value (~2134)
- `src/frontend/state/ContextProvider.tsx`: the context type and its defaults
- `src/frontend/state/GlobalStateV2.ts`: the existing zustand pattern (`useShallow` selector hook,
  `.keys()` helper, `setState`/`getState` exports)
- `src/frontend/state/*.ts`: the 17 existing small stores (D-04)
- `src/frontend/index.tsx`: boot ordering. Comments at ~lines 5, 12, 121–176 record that
  `tauriAttach` and store-mirror hydration must finish before GlobalState's constructor reads the
  stores. The D-05 boot module and every store's initial-state reads must keep that ordering.
- `src/frontend/App.tsx`: `TourProvider` mount

### Persistence
- `.planning/phases/68-versioned-persisted-stores-and-migrations/68-CONTEXT.md`: the renderer
  never migrates; renderer mirrors are read-only snapshots plus write-through
- `src/frontend/helpers/stores.ts`, `src/frontend/helpers/electronStores.ts`: the renderer store
  mirrors that actions write through (D-02)

### Ratchet precedent
- `meta/steamLineCeiling.cjs` + `meta/steamLineCeilingBaseline.json`, and
  `meta/backendDiCeilings.cjs`: shrink-only ratchet style and CI wiring (D-12)

### Folded todo
- `.planning/todos/pending/2026-11-05-downloads-history-lost-on-tab-return.md`: reproduction
  steps, candidate causes and the live gate (D-15)
- `src/frontend/screens/DownloadManager/index.tsx`, `src/backend/downloadmanager/downloadqueue.ts`

### Repo conventions
- `Skill("gamelib-conventions")`: the `<verify>` prettier check, todo frontmatter, UAT item shape

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useGlobalState` / `useGlobalStateKeys` in `GlobalStateV2.ts`: the selector-hook pattern each
  new domain store copies.
- `refreshWineVersions` in `GlobalStateV2.ts`: an existing example of an async store action
  calling `window.api` (D-06).
- `performSteamLogout` (`state/SteamSignOut.ts`), `applySavedZoomAtBoot` (`state/savedZoomBoot.ts`)
  and the `handle*Signal` functions in the other small stores: already outside React, so the boot
  module calls them as they are.

### Established Patterns
- Small per-feature zustand stores with `getState()` called from outside React. `handleGameStatus`
  already calls `useBottleLaunchWaiting.getState().clear(appName)`.
- Store setters write through `configStore.set` synchronously.
- A shrink-only baseline in `meta/` with CI gating, used for the Phase 62 and 66 ratchets.

### Integration Points
- `src/frontend/index.tsx` renders `<GlobalState>` around the app at ~line 285. The bridge (D-09)
  keeps this until the last slice leaves. The boot module (D-05) is called here, after mirror
  hydration.
- The 123 `useContext(ContextProvider)` call sites, mostly in Settings and components/UI.
- 32 test files that render through `ContextProvider` (D-11).

</code_context>

<specifics>
## Specific Ideas

- Profiler scenario on a synthetic library of about 2,000 games, run before and after (D-14).
- Domain order is fixed: UI/dialog → settings → downloads → auth → library (D-10).

</specifics>

<deferred>
## Deferred Ideas

- Normalise library data into a map keyed by `${runner}:${appName}` with derived lists. Revisit
  after Phase 70 splits GameInfo.
- An ESLint `no-restricted-imports` ban on the deleted context. Not needed once the files are
  gone.

### Reviewed Todos (not folded)
- `2026-11-05-deeper-theming-of-launch-notice-toast.md`: a keyword match only. It is theming
  work and belongs with or after Phase 64.
- The Steam bridge, depot and spike todos the matcher flagged (`undertale-bridge-shim`,
  `depot-install-ignores-user-steam-beta-branch`, `spike-refresh-via-running-steam-client`, ...)
  are keyword noise and unrelated to frontend state.

</deferred>

---

*Phase: 69-consolidate-frontend-state-onto-globalstatev2*
*Context gathered: 2026-11-10*
