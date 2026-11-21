# Phase 100 (gap closure): Pattern Map

**Mapped:** 2026-11-22
**Scope:** only files the gap fixes touch (CR-01, CR-02, WR-02, WR-04, WR-05). All paths tracked source.
**G** = `src/frontend/screens/Game/GamePage`

## File Classification

| File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `G/components/InstallTab/VersionRow.tsx` (CR-01) | component | request-response | itself (guard L37-44, render L111-117) | exact |
| `src-tauri/src/main.rs` `LONG_RUNNING_CHANNELS` (CR-02) | config | request-response | `"openDialog"` entry L240-261 (measured, Phase 35 plan 07) and `"repair"` L218 | exact |
| `G/actions/useInstallLocationActions.ts`, `actions/rowAction.ts`, `InstallTab/LocationRow.tsx` (CR-02 retry, WR-04) | hook / component | event-driven | self + `useRowAction` consumers (VersionRow) | exact |
| `G/actions/installActionGates.ts` (WR-02) | utility (pure) | transform | self; deleted `GameSubMenu` (commit `a2cb57668^`) | exact |
| `G/actions/useUninstallActions.ts`, `InstallTab/DangerZone.tsx` (WR-05) | hook / component | request-response | `useInstallLocationActions` (`useRowAction`) | role-match |
| NEW VersionRow render test | test | render-tree | `src/frontend/screens/Settings/components/__tests__/eacRuntimeInstallFailure.test.tsx` (hook harness) + `InstallTab/__tests__/SwitchRow.test.tsx` (tree walk) | role-match |
| NEW LocationRow / rowAction behaviour test | test | state machine | `actions/__tests__/rowAction.test.ts` (reducer / `runRowAction`, pure) + the two above | role-match |

## Test census (readFileSync source-grep vs behavioural)

- Source-greps (NOT behavioural): `InstallTab/__tests__/installTabSource.test.ts` (comment-stripped source), `actions/__tests__/longRunningCallSiteGuard.test.ts` (header L1-20 says why: no jsdom / react-test-renderer, `testEnvironment: 'node'`), `GamePage/__tests__/gamePageActionDock.test.ts`, `components/__tests__/{mainButtonCatalogDefaults,permanentlyMountedPolls,labelSuiteI18nCensus,SteamBottleSetup.styles}.test.ts`.
- Behavioural: `actions/__tests__/{rowAction,installActionGates,installCaret,shortcutsToggle,cloudSync,steamUninstallConfirm}.test.ts` (pure functions, real run), `InstallTab/__tests__/{FactRow,SwitchRow}.test.tsx` (hook-free components called as plain functions, element tree walked).
- No jsdom, no renderHook. VersionRow/LocationRow use `useContext`/`useTranslation`/`useReducer`, so they need the hand-rolled hook harness.

## Pattern Assignments

### VersionRow.tsx (CR-01)
Current guard (L37-44) returns null for `!version`; fix = drop `!version` and render version text only when present.
```tsx
const version = gameInfo.install.version
if (
  !gameInfo.is_installed || isSideloaded || gameInfo.thirdPartyManagedApp ||
  gameInfo.install.platform === 'Browser' ||
  !version          // <- remove
) { return null }
...
<FactRow label=... valueTitle={version} ...>
  {version}{' '}                      // L111: render only when version truthy
  {hasUpdate ? <span className="fact__value--warning">{availableText}</span>
    : t('gamelib:gamepage.installTab.upToDate', '· up to date')}
</FactRow>
```
Caution: with no version, Verify/Update (L83-108) must stay reachable; keep `valueTitle={version}` undefined-safe (check FactRow prop type). "up to date" claim with unknown version may need a different string; planner decides.

### main.rs LONG_RUNNING_CHANNELS (CR-02)
List at `src-tauri/src/main.rs:199-301`, `&[&str]`, entries end with `"launch"` L300. Convention: each entry carries an inline comment citing phase/todo and a MEASUREMENT or shape reason ("bound comes back on a measurement, not an argument", doc L196-198). The `openDialog` entry (L240-261) already cites `moveInstall` as measured (35-AB-RETEST item 3); the `repair` entry is the one-line form:
```rust
    // A full re-verify/re-download of an installed game (legendary/gogdl repair) routinely exceeds 60s (CR-01).
    "repair",
```
Add `"moveInstall"`, `"changeInstallPath"`, `"steamRemoveAllCopies"` with the same style (reason: rsync/delete of a large install dir; same shape as `uninstall`, doc L185-186).
Pinning tests: `main.rs:~2915-2945` `every_long_running_channel_is_exempt_and_a_non_member_is_bounded` iterates the const (new entries auto-covered; no edit needed, deliberately no second list). Individual pins for named channels sit just above (`assert_eq!(timeout_for("oauthCaptureLogin"), None)` ~L2915); copy that form for an explicit `assert_eq!(timeout_for("moveInstall"), None)`. Also `tray.rs:271` and main.rs:2052/4502 comments reference the list. Check for a JS-side mirror: `grep -rn "LONG_RUNNING" src` (JS gate mentioned in test comment "the JS gate above").

### useInstallLocationActions.ts / LocationRow.tsx (CR-02 Retry gating, WR-04)
Retry is `onRetry: actions.retryMove` = `onMoveInstallYesClick` (hook L36-47), which re-runs `moveRow.run(...)` directly: no gate check, so Retry can start a second move while `is.moving`. Fix site: LocationRow `failure` object (L30-49) and/or hook: suppress/disable Retry when `is.moving` or `gates.move.disabled`.
WR-04 shape: LocationRow picks ONE failure via ternary (`moveFailed ? ... : setFolderFailed ? ... : undefined`) so the second failure is hidden, and `phase:'failed'` is sticky (only `dismiss` clears it; `useRowAction` returns `dismiss` but the hook never exposes it). Reducer (rowAction.ts L27-37):
```ts
case 'start':   return state.phase === 'busy' ? state : { phase: 'busy' }
case 'fail':    return state.phase === 'busy' ? { phase: 'failed' } : state
case 'dismiss': return state.phase === 'failed' ? { phase: 'idle' } : state
```
`run` (L112-116) is `useCallback(runRowAction({... dispatch, isFailure}))`; `runRowAction` L86-108 dispatches start -> succeed/fail. Starting another row's action does not clear a failed row; consider dismiss on a new start from the sibling row.
Row exposure pattern to copy: `moveFailed: moveRow.phase === 'failed'` (hook L92-93); busy stand-in `settingFolder: folderRow.phase === 'busy'`.

### installActionGates.ts (WR-02)
Current (L151): `open: unaffected(isInstalled && !isThirdPartyManaged && !isBrowserGame)`.
Deleted menu (`git show a2cb57668^:src/frontend/screens/Game/GameSubMenu/index.tsx`, L787-795): Browse Files was gated on `isInstalled` only; `onBrowseFiles` (L466-472) opened `install_path || folder_name` with no third-party or Browser exclusion. So the new gate is a regression for third-party-managed (and arguably Browser) installs. Fix: `open: unaffected(isInstalled)` (match old), then LocationRow's `if (!gates.open.show) return null` (L26) keeps the row visible. Note `modify`/`verify` correctly keep `!isThirdPartyManaged` (old L461, L662-690). Update `actions/__tests__/installActionGates.test.ts` (behavioural, pure) accordingly.

### useUninstallActions.ts / DangerZone.tsx (WR-05)
Failure gaps: `onRemoveAllCopiesYesClick` (L54-57) awaits `window.api.steamRemoveAllCopies` and `refresh` with no `useRowAction`/try, so a rejection is an unhandled rejection and DangerZone shows nothing; `startUninstall` L35-51 calls `window.api.uninstall(...)` un-awaited, no catch. Copy the pattern from useInstallLocationActions (L25-27, L36-47):
```ts
const moveRow = useRowAction('moveInstall', appName)
await moveRow.run(async () => { ... await window.api.moveInstall({ appName, path, runner }) })
// expose: moveFailed: moveRow.phase === 'failed', retryMove: onMoveInstallYesClick
```
and the failure UI from LocationRow L30-37 (`failure={{ message, retryLabel, onRetry }}` into `FactRow`, fixed translated message under `gamelib:gamepage.installTab.failure.*`, raw error only in `reportRowActionFailure`). Confirm dialog buttons: `{ text: t('box.yes'), onClick: ... }, { text: t('box.no') }` (L68).

## Test analogs for the new tests

**Best behavioural analog (hook harness):** `src/frontend/screens/Settings/components/__tests__/eacRuntimeInstallFailure.test.tsx` L16-120. Copy:
```tsx
import 'frontend/testUtils/tauriWindow'
jest.mock('react', () => {            // persistent useState slots, __beginRender/__resetMount
  const actualReact = jest.requireActual<typeof import('react')>('react')
  ...
  const { withStoreHooks } = jest.requireActual<typeof import('frontend/testUtils/storeHookReact')>('frontend/testUtils/storeHookReact')
  return withStoreHooks(actualReact, { useState: ..., __beginRender: ..., __resetMount: ... } as unknown as Partial<typeof import('react')>)
})
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, defaultValue?: string) => defaultValue ?? _key })
}))
beforeEach(() => {
  useUiState.setState({ showDialogModal: mockShowDialogModal, platform: 'linux' })
  harness.__resetMount()
  ;(globalThis as any).window = { api: mockApi }
})
afterEach(() => resetAllStores())      // from 'frontend/state/storeKit'
const render = () => { harness.__beginRender(); return Comp() }
```
`useReducer` is NOT backed in that harness (only `useState`); `useRowAction` uses `useReducer`+`useCallback`, so either add `useReducer` slots to the mock (dispatch through `rowActionReducer`) or test `runRowAction` with a manual `dispatch` spy as `rowAction.test.ts` does. `useContext(GameContext)`: mock `useContext` in the same `withStoreHooks` override, or `jest.mock('../../../GameContext')` / render with a stub value (`is`, `runner`, `gameInstallInfo`). Check `storeHookReact.ts` for what `withStoreHooks` already supplies before extending.
i18n: stub `t` returns the default value (arg 2), so assertions use English defaults like 'Retry', 'Move failed. Details are in the log.' (third arg of `t` with `{{version}}` is NOT interpolated by the stub).

**Tree walking (copy verbatim):** `InstallTab/__tests__/SwitchRow.test.tsx` L1-50: `isElement`, `walk`, `textOf`, `typeName`, `find`. Caveat: `walk` does not expand function components; for VersionRow/LocationRow output the `FactRow`/`FactAction` elements are inspected by `props` (label, busy, disabled, failure), which is enough (see FactRow.test.tsx for the prop assertions).

**Pure state-machine test:** `actions/__tests__/rowAction.test.ts` for reducer/`runRowAction` additions (WR-04 dismiss-on-restart).

## Shared Patterns
- Failure reporting: `reportRowActionFailure` (rowAction.ts L52-82) logs via console.error + `window.api.logError`; never throws; fixed translated message in UI (T-100-01).
- Gates: single pure source `installActionGates()`; rows read `gates.x.show/disabled/reason` and `gateReasonText(reason, t)`.
- Confirmations (D-13) via `useUiState.showDialogModal`; i18n namespace `gamelib` for new keys with English default as 2nd arg.
- Verify block per CLAUDE.md: `npx prettier --check` over exact paths, scoped.

## No Analog Found
No render-level (jsdom/renderHook) test exists anywhere; the hook-harness pattern above is the only behavioural option.
