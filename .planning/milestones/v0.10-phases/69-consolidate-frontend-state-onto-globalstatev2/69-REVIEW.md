---
phase: 69-consolidate-frontend-state-onto-globalstatev2
reviewed: 2026-11-10
depth: standard
diff_base: 8f04b7c9106e55bf2ad0264241ebc7e6939c36c5^
files_reviewed: 197
status: issues_found
findings:
  critical: 1
  warning: 4
  info: 11
  total: 16
---

# Phase 69 Code Review

The phase changed 197 non-test source files, too many for one reviewer at standard depth, so the review ran as three parallel batches:
- **A:** the state layer, boot, preload, meta harness and config (62 files)
- **B:** the first half of `src/frontend/screens` (53 files)
- **C:** the second half of `src/frontend/screens` plus `src/frontend/components` (82 files)

Finding IDs are scoped to their batch, e.g. `A/CR-01` and `B/WR-01`. The scope was every non-test file touched by a `(69-` commit, minus lockfiles, perf result JSON and SCSS.

**Cross-batch note:** `A/WR-02` and `B/WR-01` are the same defect, reached from two directions. The D-15 finished-downloads list is pulled once at boot with no catch. A failed pull leaves it empty, and opening the Downloads tab no longer re-fetches it.


# Batch A


## Phase 69 (batch A): Code Review Report

**Reviewed:** 2026-11-10
**Depth:** standard
**Files Reviewed:** 62
**Status:** issues_found

### Summary

I compared the new domain stores (`uiState`, `settingsState`, `downloadsState`, `authState`, `libraryState`), `storeKit`, `initStateSubscriptions` and `BootSequence` against the deleted `GlobalState.tsx` and `GlobalStateV2.ts` at `8f04b7c91^`, method by method. Most of the port is faithful: the setters, the login and logout actions, `handleGameStatus`, `refreshLibrary`, `refresh`, the `componentDidUpdate` side effects and the Humble listeners all keep their old semantics. The ceiling-ratchet shards also check out: I compared every `(metric, file)` key across all shards before and after, and no ceiling was added or raised.

The main defect is boot timing. The old `GlobalState` was wrapped in `withTranslation()` with `useSuspense: true`, so React suspended the root until i18next had loaded. Its constructor and `componentDidMount` therefore always ran with `i18n.language` set. The new boot calls `readInitialSettings()` synchronously, right after a non-awaited `i18next.init()`. In i18next 22.5.1 that call schedules its language work on `setTimeout(load, 0)`, so `i18next.language` is still `undefined` at that point. As a result, `settingsState.language` is `undefined` for the whole session, which breaks RTL layout and the language selector. The unit tests and the rerender harness hide this because they assign `i18next.language` or init with inline resources. The same root cause also means `frontendReady` and the rest of the post-mount boot now run before translations load.

The pre-filed items (`updates` overwrite, import-time mirror reads, the stale `installGame` status, in-place category mutation) are not repeated here.

### Critical Issues

#### CR-01: `settingsState.language` is `undefined` after boot, so RTL and the language selector break

**File:** `src/frontend/state/settingsState.ts:205`, `src/frontend/state/initStateSubscriptions.ts:69`, `src/frontend/index.tsx:238-264`

**Issue:** `readInitialSettings()` reads `language: toShippedLanguage(i18next.language)`. `initStateSubscriptions()` calls it at `index.tsx:264`, in the same synchronous tick as `i18next.use(Backend).use(initReactI18next).init({...})`, and that `init` is not awaited.

In i18next 22.5.1 (`node_modules/i18next/dist/esm/i18next.js:2152-2156`), when there are no inline `resources` and `initImmediate` is at its default of true, `init` defers `load` to `setTimeout(load, 0)`. `this.language` is only assigned inside `changeLanguage` → `setLngProps` (line 2261), so it is `undefined` when `readInitialSettings()` runs. `toShippedLanguage(undefined)` returns `undefined`, and `useSettingsState.setState(readInitialSettings())` replaces the store's `'en'` default with `undefined`. Nothing writes `language` again until the user picks a language in `LanguageSelector`.

The old code did not have this problem. `GlobalState` was `withTranslation()(GlobalState)` (old `GlobalState.tsx:2234`) under `react.useSuspense: true`, and it sat above any Suspense boundary. React 18 lets a non-sync root render suspend without a boundary (it waits rather than throwing), so the constructor that read `this.props.i18n.language` only ran after i18next was ready.

Consequences, for every user and every launch:
- `selectIsRTL` returns false, so for `fa` and `ar` users the `isRTL` body class is never applied. `App.tsx:49` and the seven UI components that read `selectIsRTL` (ToggleSwitch, TextInputField, SelectField, SliderField, TwoColTableInput, NavShellTour, Accessibility) render left-to-right.
- `LanguageSelector` falls back to `i18n.language`, which is the BCP-47 tag. For `pt_BR`, `nb_NO`, `zh_Hans` and `zh_Hant` the label lookup misses and no `<select>` option is selected. This brings back the quick-260925-bq4 bug that `toShippedLanguage` was added to fix.
- `SettingsState.language` is typed `string` but holds `undefined`.

Tests do not catch this. `settingsState.test.ts:207` assigns `i18next.language` directly, and `meta/rerender/seam.tsx:32-41` inits with inline `resources` (a synchronous load) and awaits it. The header comment at `initStateSubscriptions.ts:7-8` ("after ... `i18next.init`") is therefore misleading: `init` has been called at that point but has not finished.

**Fix:** Take the language from the value `index.tsx` already resolved synchronously, not from i18next's async state. Then follow later i18next changes:
```ts
// settingsState.ts – readInitialSettings
language: toShippedLanguage(
  i18next.language ?? configStore.get('language', 'en')
),
```
and, in `initStateSubscriptions` (once):
```ts
i18next.on('languageChanged', (lng) =>
  useSettingsState.setState({ language: toShippedLanguage(lng) })
)
```
Alternatively, apply the settings `readInitial` from `i18next.on('initialized', ...)`. Add a test that runs `readInitialSettings()` with `i18next.language === undefined` and the persisted `configStore` language set to `fa`.

### Warnings

#### WR-01: The post-mount boot and `frontendReady` now run before i18next has loaded

**File:** `src/frontend/state/BootSequence.tsx:22-24`, `src/frontend/state/initStateSubscriptions.ts:470-515`

**Issue:** This has the same root cause as CR-01, but a different symptom. The old `componentDidMount` belonged to a component that suspended on i18next, so the whole tail ran only after translations had loaded: the window-chrome seed, `getUserInfo`, the mount-time `refreshLibrary`, connectivity, the probe pull, `rearmFromCurrentState`, the fonts and `window.api.frontendReady()`. `BootSequence` does not suspend, so its layout effect fires on the first commit, alongside the `<Loading/>` fallback and before i18next has loaded.

The BootSequence docstring says the change keeps "exactly" the componentDidMount timing. It does not. `frontendReady` now reaches the sidecar earlier, and that starts the 5s `initQueue(true)` auto-resume and any boot pushes. A backend push in that window that leads to `t()` at call time (for example `showDialogModal` callers, or `notify` in `refreshWineVersions`) gets the inline fallback strings instead of the user's language. The phase rule is no behaviour change, so this needs either a fix or a recorded decision.

**Fix:** Gate `bootSequenceEffect()` on i18next readiness to reproduce the old ordering, for example:
```ts
useLayoutEffect(() => {
  if (i18next.isInitialized) bootSequenceEffect()
  else i18next.on('initialized', bootSequenceEffect)
}, [])
```
Or make `BootSequence` call `useTranslation()` (with suspense) so it suspends exactly as `withTranslation()(GlobalState)` did. Then correct the docstring.

#### WR-02: D-15 finished list does not recover if the single boot pull fails or returns stale data

**File:** `src/frontend/state/downloadsState.ts:26-29, 62-73`

**Issue:** `refreshFinished` has no `catch` and no ordering guard. The boot pull is fire-and-forget (`void refreshFinished()`). If it rejects, the result is an unhandled rejection, and `finished` stays `undefined` until the queue's length or head changes, which may not happen for the rest of the session.

Before the phase, every visit to the Downloads tab refetched the list (the old `DownloadManager` effect ran on mount), so one failed request healed itself. With the list now store-owned and the refill-on-mount removed (D-15), that safety net is gone. In addition, two overlapping `getDMQueueInformation()` calls can resolve out of order, and a pull already in flight when the user clicks **Clear** can re-populate the cleared list.

**Fix:** Catch and log errors in `refreshFinished`, and drop out-of-order results with a sequence counter:
```ts
let seq = 0
refreshFinished: async () => {
  const mine = ++seq
  try {
    const info = await window.api.getDMQueueInformation()
    if (mine === seq) set({ finished: info?.finished })
  } catch (e) {
    window.api.logError(`finished-downloads pull failed: ${String(e)}`)
  }
},
clearFinished: () => { seq++; set({ finished: [] }); downloadManagerStore.set('finished', []) },
```
Also consider calling `refreshFinished()` when the Downloads screen mounts while `finished === undefined`.

#### WR-03: `copilot-instructions.md` still tells agents a deleted `GlobalState.tsx` exists

**File:** `.github/copilot-instructions.md:44`

**Issue:** A mechanical rename changed `GlobalStateV2.ts` to `uiState.ts` but left the sentence "Legacy `GlobalState.tsx` (React Context class component) coexists with newer Zustand slices". `GlobalState.tsx` and `ContextProvider.tsx` were deleted in 69-24. AI tooling that reads this file will point new code at a context that no longer exists, and it will treat `uiState.ts` as the only Zustand store.

**Fix:** Replace the line with something like: "**State**: Zustand domain stores in `src/frontend/state/` (`uiState`, `settingsState`, `downloadsState`, `authState`, `libraryState`) built with `storeKit.bindStoreHooks`; boot listeners live in `initStateSubscriptions.ts`. There is no React Context for app state."

### Info

#### IN-01: The find-and-replace of "GlobalState.tsx" left broken or wrong comments

**File:** `src/common/humble/keyTypePresentation.ts:231,240`; `src/common/types.ts:707`; `src/frontend/state/BottleLaunchWaiting.ts:23`; `src/frontend/state/savedZoomBoot.ts:6,13`; `src/common/types/storePolicy.ts:383-384`; `src/frontend/index.tsx:177`; `src/preload/tauriTransport.ts:8,311-313`

**Issue:** Examples:
- "to the the app stores store slice"
- "`the old GlobalState class`'s" (prose inside a code span)
- "the old GlobalState class's class component"
- "the Steam login-gate (the old GlobalState class)", where a line reference was replaced by prose
- `storePolicy.ts` now claims "`uiState.ts`'s zustand initializer" reads the boot stores synchronously before mount, but those reads are now in `readInitial*` inside `initStateSubscriptions`
- `index.tsx:177` says `isFrameless` is read in "settingsState's readInitial", but it lives in `uiState` and is seeded by `seedAndFollowWindowChrome`

**Fix:** Rewrite each comment by hand so it names the current owner (`initStateSubscriptions` readInitial, `authState`, `uiState`, and so on).

#### IN-02: The test reset hook leaks store subscriptions across rerender-harness runs

**File:** `src/frontend/state/initStateSubscriptions.ts:525-529`, `meta/rerender/seam.tsx:54-56`

**Issue:** `__resetInitStateSubscriptionsGuardForTests` clears the once-guards but not the `store.subscribe` registrations made by `registerSettingsSideEffects`, `registerLibrarySideEffects` and `registerSleepAssertionSubscriber`. It also does not clear `sleepAssertion`'s module snapshot. Each `mountApp` run therefore adds another set of subscribers, and `resetAllStores()` fires the stale ones. React Profiler commit counts are not affected, but repeated `lock` and `unlock` calls and `localStorage` writes build up on the fake API.

**Fix:** Have `initStateSubscriptions` collect the unsubscribe handles, and have the test reset call them along with `__resetSleepAssertionStateForTests()`.

#### IN-03: Redundant boot guards and duplicate `getState()`

**File:** `src/frontend/state/initStateSubscriptions.ts:463-522`; `src/frontend/state/settingsState.ts:241-248`

**Issue:** `bootSequenceEffect` and `runPostMountBoot` each carry their own once-guard (`bootEffectRan` and `postMountStarted`), and both protect the same call. `applySavedFonts` calls `useSettingsStateRaw.getState()` twice in a row.

**Fix:** Keep one guard, and destructure from a single `getState()`.

#### IN-04: `SettingsState.language` type does not admit the values it can hold

**File:** `src/frontend/state/settingsState.ts:39`

**Issue:** `toShippedLanguage` has a `string | undefined` overload, and `readInitialSettings` passes it a possibly-undefined value. The type still claims `string`, which hid CR-01 from the compiler.

**Fix:** After fixing CR-01, make the read provably a `string` (by falling back to `configStore`), or widen the type to make the gap visible.

---

_Reviewed: 2026-11-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

# Batch B


## Phase 69: Code Review Report (Batch B)

**Reviewed:** 2026-11-10T04:03:55Z
**Depth:** standard
**Files Reviewed:** 53
**Status:** issues_found

### Narrative Findings (AI reviewer)

### Summary

I reviewed every changed line in `git diff 8f04b7c91^..HEAD` for the 53 batch-B files. For each one I checked that it matches the old `GlobalState.render()` provider value, reconstructed from `8f04b7c91^:src/frontend/state/GlobalState.tsx`. I also checked it against the current store files: `uiState`, `settingsState`, `libraryState`, `authState`, `downloadsState`, `accountHooks` and `storeKit`.

What I verified:

- **Correct store for each field.** Every field and action now comes from the store that owns it: `platform`, `connectivity`, `activeController`, `showDialogModal` and the settings modals from `uiState`; `focusRow` and the tile and font settings from `settingsState`; `crossoverRatings`, `runsForMe`, `refresh`, `refreshLibrary`, `steamSyncStatus` and the libraries from `libraryState`; usernames, `humble`, `signInProbeOutcomes`, the login actions and `completeOAuthLogin` from `authState`.
- **Matching signatures.** `refresh(library?, checkUpdates?, overridesArg?)` and `completeOAuthLogin` match the old class methods.
- **No destructured key was dropped.** I compared the old and new destructure lists for Accessibility, ConsoleMode, GameCard, GamePage and Library.
- **Selectors are stable.** Every selector goes through `bindStoreHooks`, which wraps it in `useShallow`. The `use*Account` composites use `useMemo` over `.keys` results that are already shallow-stable. No selector builds a new object or array on each render.
- **Hooks are unconditional.** No new hook call sits after an early return. In `InstallModal`, the `useUiState` call stays above every hook-gated branch.
- **Effect dependencies are unchanged.** The deps keyed on composite objects (`Login` `[epic, gog]`, `GameCard` `[hiddenGames]`/`[favouriteGames]`, `Discounts` and `GamePage` on `*.library`) now fire less often, because the old provider rebuilt `epic`, `gog` and the other account objects on every `GlobalState` render. None of those effects depended on firing every render. Their mount run still happens (for example `setLoading(false)` in Login).
- **Optional chaining.** In `LibrarySignInNotice`, `humble?.` became `humble.`, which is safe because `authState.humble` is always initialised. `EmptyLibrary` and `LibraryTour` read the per-runner library arrays, which are always arrays.
- **Lint and types.** `eslint` over the 53 files reports 0 errors. The 101 warnings are pre-existing `no-unsafe-*` and floating-promise warnings, not leftover `useContext` imports.

I found no wrong-store reads, unstable selectors, conditional hooks or dropped props. The only behaviour change (D-15, the downloads finished list) works as designed in the normal case, but it lost a recovery path (WR-01). The comment rewrite left garbled or dangling references in several files (IN-01, IN-02).

### Warnings

#### WR-01: The finished-downloads list has one boot-time load and no retry; DownloadManager no longer reloads it when the tab opens

**File:** `src/frontend/screens/DownloadManager/index.tsx:28-32, 66-71`. The cause is in `src/frontend/state/downloadsState.ts:61-73`.

**Issue:** The removed effect called `window.api.getDMQueueInformation()` every time the Downloads tab mounted. That made opening the tab a natural retry if an earlier load had failed. After D-15, the list is loaded exactly once, in `registerDownloadsListeners()`, through `void refreshFinished()`:

- The call has no `.catch`, so a rejection is an unhandled promise rejection.
- After a rejection, `finished` stays `undefined`.
- It is only reloaded when a `handleDMQueueInformation` push changes the queue length or the head appName.

So if the boot call fails, for example because the sidecar invoke times out during a slow cold start, the Completed section stays empty for the whole session on a machine with an idle queue. Opening and closing the tab no longer repairs it. D-15 permits keeping the list after the tab unmounts. It does not permit losing the list when the boot call fails. Before D-15, a single failed call cost one view of the tab; now it costs the whole session.

**Fix:** Keep one reload trigger that does not depend on the queue changing. Either refetch when DownloadManager mounts and the store has never loaded:

```tsx
// DownloadManager/index.tsx
useEffect(() => {
  if (useDownloadsState.getState().finished === undefined) {
    void useDownloadsState.getState().refreshFinished()
  }
}, [])
```

or handle the failure in the store, so the list stays retryable:

```ts
refreshFinished: async () => {
  try {
    const info = await window.api.getDMQueueInformation()
    set({ finished: info?.finished })
  } catch (error) {
    window.api.logError(`refreshFinished failed: ${String(error)}`)
  }
}
```

The first option restores the old self-healing behaviour without bringing back an unconditional reload on every mount.

### Info

#### IN-01: The automated ContextProvider-to-"the app stores" rewrite left ungrammatical comments

**File:**

- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx:126,128`
- `src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts:86,90,180`
- `src/frontend/screens/Library/components/InstallModal/steamEligibilityProbe.ts:89`
- `src/frontend/screens/Library/components/InstallModal/crossoverInstallRisk.ts:6`
- `src/frontend/screens/Library/components/LibrarySignInNotice/index.tsx:100`

**Issue:** A search-and-replace produced text such as "has read that store's the app stores `username`", "the app stores's own `'unknown'` fallback" and "no React, no the app stores, no stylesheet". `LibrarySignInNotice:100` still says "derived from context state". These comments document contracts that tests and reviewers rely on: the fail-closed `'unknown'` platform bucket, and why the row is provider-free. In their current form they are hard to read.

**Fix:** Name the real source. For example: "`uiState.platform` (default `'unknown'` before `readInitialUi`)", "the caller's `authState` username", and "no React, no Zustand store".

#### IN-02: Comments now point at "the old GlobalState class", which no longer exists

**File:**

- `src/frontend/screens/Library/components/SteamSyncNotice/index.tsx:21`
- `src/frontend/screens/Library/librarySyncIndicator.ts:27`
- `src/frontend/screens/Library/steamLibraryVisibility.ts:22`
- `src/frontend/screens/Library/engineWiring.ts:110`

**Issue:** Each comment cites behaviour as living in "`the old GlobalState class`". These were previously concrete pointers, for example `GlobalState.tsx:1114-1157`. That behaviour now lives in `libraryState.ts` and `authState.ts`:

- `refreshingByRunner.steam` guards double entry and is cleared on failure: `libraryState.ts:361-415`.
- `refreshingInTheBackground` is reset to `true`: `libraryState.ts`.
- The Steam username is seeded from `steamConfigStore`: `authState.readInitialAuth`.
- `addGameToFavourites` and `hideGame` construct the literals: `libraryState.ts`.

A reader checking the invariant SteamSyncNotice depends on ("already guards double-entry … already clears that flag on failure") has nowhere to look.

**Fix:** Replace each reference with the current location. For example: "`libraryState.refreshLibrary` (`refreshingByRunner` handling)", "`authState.readInitialAuth`", and "`libraryState`'s `addGameToFavourites`/`hideGame`".

---

_Reviewed: 2026-11-10T04:03:55Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

# Batch C


## Phase 69 (batch C): Code Review Report

**Reviewed:** 2026-11-10T04:03:30Z
**Depth:** standard
**Files Reviewed:** 82
**Status:** issues_found (info only)

### Narrative Findings (AI reviewer)

### Summary

This batch covers the second half of `src/frontend/screens` (Settings, StoreSearch, WebView, WineManager) and `src/frontend/components/UI`. I reviewed the full diff (`git diff 8f04b7c91^..HEAD`, 2,265 lines) and checked each read against the five domain stores and `accountHooks.ts`. I also ran `tsc --noEmit` (exit 0) and `eslint` over all 82 files (0 errors; no new warnings on changed lines).

I found no behavioural defects:

- **Correct store and field.** Every value and action is read from the store that owns it. All of `platform`, `connectivity`, `activeController`, the dialog fields, `uploadLogFileProps`, `settingsModalProps`, `refreshingWineVersions`, `language`, `theme`, `focusRow`, the changelog fields, `disableDialogBackdropClose`, `handleExperimentalFeatures`, `libraryStatus`, `refreshing*`, `steamMetadataSyncing`, `steamLibrary`, `sideloadedLibrary`, `currentCustomCategories`, `steamUsername`, `humble`, `humbleLogin`, `completeOAuthLogin` and `signInProbeOutcomes` exist where they are read.
- **Derived values.** Each matches its old expression:
  - `selectInstallingEpicGame` matches the old `libraryStatus.some(... isStore(game, 'legendary'))`.
  - `selectIsRTL` matches the old `RTL_LANGUAGES.includes(language)`.
  - The `compose*Account` hooks reproduce the old context composites field for field.
- **Selector stability.** `bindStoreHooks` wraps every selector in `useShallow`, and `.keys(...)` returns a stable reference when the values are shallow-equal. The account hooks compose with `useMemo` over those stable picks. No selector in this batch builds a fresh object per render, so there are no render loops.
- **Effect dependencies.**
  - `HumbleExpiryToast` swaps `[humble.expired]` for `[humbleExpired]`, which is equivalent.
  - `RedeemSteamKeyDialog` swaps `[steam.library]` for `[steamLibrary]`, which is equivalent.
  - `HumbleLoginSurface` keeps its mount-once `[]` effect.
  - `LogSettings` keeps the `epic.library` / `gog.library` / `amazon.library` deps, which are now more stable than the old per-render context objects. This only removes spurious re-runs.
  - `WebView`'s `handleTauriOAuthSuccess` deps (`completeOAuthLogin`, `navigate`) are still stable, because `completeOAuthLogin` is a module-level function wired once in `authState.ts:328`.
- **Dialogs.**
  - `uiState.showDialogModal` is a line-for-line port of `handleShowDialogModal`: the same functional `reduceDialogRequest` over `{ current, queue }`. Queue ordering is preserved.
  - `DialogHandler`'s listener deps are unchanged.
  - `Dialog.tsx` changed only the `disableDialogBackdropClose` source. The frameless/native titlebar logic is not touched in this batch.
- **Hooks.** No hook is newly conditional. Every new store hook sits where the old `useContext` sat, above any early return.

The five findings below are all Info. Four are comments that the mechanical rewrite left stale or garbled; one is a needlessly wide subscription. A pre-existing rules-of-hooks warning is noted at the end as out of scope.

### Info

#### IN-01: The `useTauriOAuthLogin` doc block describes wiring that no longer exists

**File:** `src/frontend/screens/WebView/useTauriOAuthLogin.ts:21-31, 105, 118-121`
**Issue:** The search-and-replace turned "`GlobalState.tsx` wires `completeOAuthLogin = createOAuthLoginCompletion({...})` and exposes it on context" into "`` `the old GlobalState class` wires ... and exposes it on context` ``". The sentence is now false: the wiring is in `authState.ts:522` (`const oauthCompletion = createOAuthLoginCompletion({...})`) and no context exists. The comment at line 28 still says "routed through `GlobalState`'s own `handleSuccessfulLogin`". Line 105 still talks about "GlobalState's own `PureComponent<Props>`" `setState`. A maintainer tracing the login-completion path will be sent to a deleted class.
**Fix:** Rewrite the block to name `authState.ts`'s `completeOAuthLogin` / `oauthCompletion` as the single wiring point. Drop the `PureComponent` typing rationale, or restate it for the store's `set`.

#### IN-02: Garbled or present-tense references to the retired class in `WebView`

**File:** `src/frontend/screens/WebView/index.tsx:120-123, 347`; `src/frontend/screens/WebView/useStoreEmbedHost.ts:182`
**Issue:**
- `index.tsx:122` still justifies stability with "`completeOAuthLogin` is a GlobalState class field". It is now a module function stored in `authState`.
- `index.tsx:347` reads "`` `the old GlobalState class` and `LibrarySignInNotice/index.tsx` already use for their own `collectSignInInputs(...)` call sites ``". It wraps prose in code backticks and claims a deleted class has a live call site.
- `useStoreEmbedHost.ts:182` reads "from the same the app stores value", which is a broken sentence.
**Fix:**
- Line 122: "`completeOAuthLogin` is a stable `authState` action".
- Line 347: name the live `collectSignInInputs` caller in the stores (or just `LibrarySignInNotice`).
- Line 182: "from the same `useUiState` `platform` value `index.tsx` reads".

#### IN-03: The `HumbleExpiryToast` header comment still names GlobalState as the source of truth

**File:** `src/frontend/components/UI/HumbleExpiryToast/index.tsx:26-27, 35`
**Issue:** "GlobalState's humbleAuthState listener is the single source of truth for `expired`", and "re-appearing every time GlobalState re-renders". The listener now lives in the `authState` subscriptions. Also, the component no longer re-renders on unrelated global changes: it selects only `s.humble.expired`. So the rationale on line 35 describes a hazard that cannot occur in its old form.
**Fix:** Repoint both comments at `authState`'s `humble` slice and its subscription.

#### IN-04: `StoresPanel` subscribes to the whole `humble` slice to read one boolean

**File:** `src/frontend/components/UI/NavShell/components/StoresPanel/index.tsx:35, 77`
**Issue:** `useAuthState((s) => s.humble)` shallow-compares the whole `HumbleAuthSlice`, so the nav panel re-renders on every `keys`, `syncing`, `syncedAt` or `syncError` change during a Humble sync. Only `humble?.isLoggedIn` is read. This is harmless for correctness, but it is the one place in the batch that does not follow the narrow-selector pattern the rest of the port uses (compare `HumbleExpiryToast`'s `s.humble.expired`).
**Fix:**
```tsx
const humbleLoggedIn = useAuthState((s) => s.humble.isLoggedIn)
...
{humbleLoggedIn && ( ... )}
```

#### IN-05: Inconsistent import placement from the mechanical swap

**File:** `src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx:1`, `GamesSettings/index.tsx:1`, `SyncSaves/gog.tsx:1`, `SyncSaves/index.tsx:1`, `SyncSaves/legendary.tsx:1`, `WinetricksSettings/index.tsx:1`
**Issue:** In these six files, `import useUiState from 'frontend/state/uiState'` was hoisted to line 1, above the side-effect `./index.scss` import and the `react` import. Every other file in the batch kept the import where `ContextProvider` used to sit. This has no runtime effect, but it is noise for the next diff.
**Fix:** Move each import back to the slot the `ContextProvider` import occupied.

### Out of scope (pre-existing, not introduced by Phase 69)

- `src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx:219`: eslint `react-hooks/rules-of-hooks` reports a `useEffect` placed after the `if (!runner) return <></>` early return. I diffed the region against `8f04b7c91^` and it is unchanged apart from the one `platform` line, so this phase did not introduce it. The Phase 69 hook (`useUiState`) sits above the early return. Worth a separate todo.
- `src/frontend/screens/WebView/index.tsx:465`: the exhaustive-deps warning (`epic.username`, `gog.username`, `amazon.user_id`) is also pre-existing; the dependency array is unchanged.

---

_Reviewed: 2026-11-10T04:03:30Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_


## Fix Log

Fixed by gsd-code-fixer on 2026-11-10. Each fix is one commit.

| Finding | Outcome | Commit |
| --- | --- | --- |
| A/CR-01 | fixed: `readInitialSettings` omits `language` until i18next has one, and `followBootLanguage` (once, on `initialized`) sets `toShippedLanguage(i18next.language)`. Later changes still go through `setLanguage`, as before the phase. | 931d41c77 |
| A/IN-04 | fixed with CR-01: `language` is now optional on the initial-settings type, so the store's `string` is never overwritten with `undefined`. | 931d41c77 |
| A/WR-02, B/WR-01 | fixed: `refreshFinished` catches and logs, a sequence token drops stale responses (Clear and per-item removal also invalidate in-flight pulls), and DownloadManager calls `ensureFinishedLoaded()` on mount, which pulls only while `finished === undefined`. | bfde7122a |
| A/WR-01 | fixed: `BootSequence` now calls `bootSequenceEffectWhenI18nReady`, which waits for i18next's `initialized` (immediate when already initialised). That event fires even when a resource load fails, so a backend error cannot hang the boot. | 5ea99ae2c |
| A/WR-03 | fixed | 1671c5a3a |
| A/IN-01, B/IN-01, B/IN-02, C/IN-01, C/IN-02, C/IN-03 | fixed (comments only) | eed7c97ca |
| A/IN-02, A/IN-03, C/IN-04, C/IN-05 | skipped by request | - |
