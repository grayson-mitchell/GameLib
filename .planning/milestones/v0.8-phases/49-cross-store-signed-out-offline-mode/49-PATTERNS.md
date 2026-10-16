# Phase 49: Cross-store signed-out / offline mode - Pattern Map

**Mapped:** 2026-10-08
**Files analyzed:** 22 (new + modified)
**Analogs found:** 20 / 22
All analog paths verified git-tracked (`git ls-files`). Line numbers are from this session's reads.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/common/signInState.ts` (new) | utility (pure selector) | transform | `src/frontend/screens/Login/steamTileState.ts` + `Library/librarySyncIndicator.ts` | role-match |
| `src/common/signInDismissal.ts` (new) | utility (pure) | transform | `src/common/focusRowMigration.ts` | role-match |
| `src/backend/signInProbe/classify.ts` (new) | utility (pure classifiers) | transform | `librarySyncIndicator.ts` (branch-ordered pure resolver) | partial |
| `src/backend/signInProbe/pass.ts` (new) | service | event-driven (connectivity) + batch | `bootstrap.ts` `reconcileStoreUsersWhenOnline` (460-493); `humble/user.ts` `checkHealthAndFlagExpiry` (754-784) | role-match |
| `src/backend/signInProbe/sessionEpoch.ts` (new) | utility | request-response | `keyringTokenStore.ts` `cacheEpoch` (~197-202, per research) | role-match |
| `src/backend/storeManagers/legendary/electronStores.ts` (modify: add `legendaryConfigStore`) | config/store | CRUD | `src/backend/humble/electronStores.ts:9` and `gog/electronStores.ts:18` | exact |
| `gog/electronStores.ts`, `nile/electronStores.ts` (`expired` key) | config | CRUD | `steamConfigStore.credentialsMissing` (`common/types/electron_store.ts:96`) | exact |
| `src/common/types/storePolicy.ts` (modify) + `storePolicy.test.ts` | config | n/a | own lines 118,125,134,138-143 | exact |
| `src/common/types/electron_store.ts` (modify) | model | n/a | `credentialsMissing?: boolean` at :96 | exact |
| `src/common/types/ipc.ts` (modify: outcome message + pull handler) | route/IPC | pub-sub | `humbleAuthState: (state) => void` at :756 | exact |
| `src/backend/storeManagers/steam/authTrigger.ts` (modify) | utility | event-driven | itself (1-line union + Set additions) | exact |
| `src/backend/sidecar/bootstrap.ts` (modify: `startSignInProbePass()` after READY) | provider | event-driven | Block E guard-flag pattern | exact |
| `humble/user.ts`, `humbleSecretStore.ts`, `keyringTokenStore.ts` (trigger label) | service | request-response | `checkHealthAndFlagExpiry` | role-match |
| `LegendaryUser/GOGUser/NileUser` login/logout (clear flag), `GOGUser.getCredentials` classify | service | request-response | `humble/user.ts:778` `configStore.set('expired', true)` | role-match |
| `src/frontend/screens/Library/librarySignInRows.ts` (new) | utility (pure) | transform | `Library/librarySyncIndicator.ts` | exact |
| `Library/components/LibrarySignInNotice/{index.tsx,index.scss}` (new) | component | request-response | `Library/components/SteamSyncNotice/{index.tsx,index.scss}` | exact |
| `SteamSyncNotice/index.tsx` + `librarySyncIndicator.ts` (delete `signedOut`) | component/util | transform | self | exact |
| `src/frontend/screens/Login/loginOpenParam.ts` (new) | utility (pure) | transform | `steamTileState.ts` | role-match |
| `src/frontend/screens/Login/signInTileState.ts` (new) | utility (pure) | transform | `steamTileState.ts` (retire) | exact |
| `Login/index.tsx` (modify: tiles, `?open=`) | component | request-response | self (`humble?.expired` branch, 126-157) | exact |
| `src/common/types.ts` + `src/backend/config.ts` (`dismissedSignInNotices`) | config | CRUD | `focusRow` (`types.ts:155`; `config.ts:332,357`) | exact |
| `frontend/state/GlobalState.tsx` (outcome map; remove health call at 1669-1671) | provider | pub-sub | existing `humbleAuthState` handler | exact |
| `public/locales/*/gamelib.json` x49 + mt stamps | config (i18n) | batch | `48-01-PLAN.md` | exact |
| `launcher.ts` (`callRunner` `skipErrorHandler`; Epic `--offline`) | service | streaming | self | exact |

## Pattern Assignments

### `src/frontend/screens/Library/librarySignInRows.ts` (pure utility, transform)
**Analog:** `src/frontend/screens/Library/librarySyncIndicator.ts`
- Zero runtime imports (type-only: `import type { SteamSyncStatus } from 'common/types/ipc'`, line 1). Header doc explains no-jsdom rationale (lines 3-33): Library `index.tsx` imports `./index.css`, Frontend jest project has no jsdom/CSS transform, so the decision must live in a standalone module. Copy this rationale.
- Input interface with REQUIRED fields and a comment why (lines 43-59). Output interface NOT exported unless used (61-67; ts-prune/`find-deadcode`).
- First-match-wins ordered branches with numbered comments (lines 69-123): gate branch first, hidden last.
```ts
export function resolveSteamSyncIndicator(input): Output {
  if (!input.steamLoggedIn) return { mode: 'hidden' }   // Branch 1, evaluated FIRST
  ...
  return { mode: 'hidden' }                             // Branch 4
}
```
Apply: rows = stores whose state is `expired` (always) or `not-connected` and not in dismissed set; `unknown`/`connected` -> no row.

### `LibrarySignInNotice/index.tsx` + `index.scss`
**Analog:** `SteamSyncNotice/index.tsx`
**Imports** (lines 30-40):
```tsx
import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { faExclamationTriangle } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import ContextProvider from 'frontend/state/ContextProvider'
import './index.scss'
```
**Structure contract** (header 1-29; also source-text gate target): one `<div>` in normal flow, no `position: absolute/fixed`, no early return replacing siblings, no `Dialog`. Props interface not exported (42-47). `useTranslation('gamelib')` as `tGamelib`; keys passed as `tGamelib('gamelib:library.steamSync.failedTitle', 'English default')` (lines 59-62, 111-114). Warning row = `<FontAwesomeIcon icon={faExclamationTriangle} />` + `<span className="...__text"><strong>title</strong><span>body</span></span>` + `<button type="button" className="button is-footer" onClick=...>` (107-137). Use one row component with `kind: 'expired' | 'not-connected'` picking class (D-11). Sign in: `navigate(\`/login?open=${runner}\`)` (replaces `navigate('/login')` at line 95). New keys: `gamelib:library.signIn.*`, store name via interpolation variable (never a hard-coded name). Copy `index.scss` from SteamSyncNotice and rename the block (not read; planner should open it).

### `Login/signInTileState.ts` and retiring `steamTileState.ts`
**Analog:** `Login/steamTileState.ts` (lines 20-25)
```ts
export function isSteamConnected(username, credentialsMissing): boolean {
  return Boolean(username) && !credentialsMissing
}
```
Pure, no DOM, doc-comment states why (no jsdom). Replace with per-store call into `common/signInState.ts`. Tiles render `unknown` as Connected; only expired shows Reconnect (Humble precedent: `Login/index.tsx`, `humble?.expired`). Tests: `Login/__tests__/steamTileState.test.ts` and `steamTileRefreshOnDismiss.test.ts` must be migrated.

### `src/common/signInState.ts` (selector)
Rule order from RESEARCH Pattern 2 (first match wins): `expiredFlag` -> expired; `!loggedIn` -> not-connected; `outcome==='healthy'` -> connected; else unknown. `loggedIn` inputs reuse tile gates: Epic `Boolean(epic.username)`, GOG `gog.username`, Amazon `amazon.user_id`, Humble `humble?.isLoggedIn`, Steam `steam?.username`. Structure it like `resolveSteamSyncIndicator` (ordered, commented branches).

### `src/backend/signInProbe/pass.ts` (service, event-driven)
**Analog:** `bootstrap.ts` `reconcileStoreUsersWhenOnline` (460-493). Copy the two guard layers and log style:
```ts
export function reconcileStoreUsersWhenOnline(): void {
  try {
    runOnceWhenOnline(() => {
      try { /* work */ }
      catch (error) {
        logWarning(`[bootstrap] reconcileStoreUsersWhenOnline: callback failed: ${String(error)}`, LogPrefix.Backend)
      }
    })
  } catch (error) {
    logWarning(`[bootstrap] ...: could not be started: ${String(error)}`, LogPrefix.Backend)
  }
}
```
Floated promises get `.catch((e: unknown) => logWarning(...))` (473-478). Module guard flags pattern `if (!xInitialized) { xInitialized = true; xWhenOnline() }` (bootstrap ~1272-1275, 1316-1319); place `startSignInProbePass()` right after the READY write (~1320) and before `deliverStartupProtocolUrl()` (~1325), skip under `JEST_WORKER_ID` like Block C (~1239). Bounded probe + `unref?.()` per RESEARCH Pattern 3; connectivity edge gating per Pattern 4. Use `sendFrontendMessage('signInProbeOutcomes', ...)`.
**Humble probe analog:** `humble/user.ts:754-784` `checkHealthAndFlagExpiry`: credential read -> `getGamekeys` in try/catch where a transient error returns without flagging (759-776), `session_expired` -> `configStore.set('expired', true)` then `sendFrontendMessage('humbleAuthState', {...})` (777-784). Only auth failure latches; copy this negative.
**Steam:** `noteSteamAuthTrigger('boot-probe')` then `readTokenOutcome(getTokenStore(), 'boot-probe')` only; never `ensureConnected()`.

### `steam/authTrigger.ts` (modify)
Add `| 'boot-probe'` to `SteamAuthTrigger` union (26-32) and `'boot-probe'` to `DELIBERATE_TRIGGERS` Set (41-47). Do not add to `ORIGIN_TO_TRIGGER` (renderer origins). Update header comment to record the 260817-d61 deferral reversal.

### Per-store `expired` flag (stores + policy)
- Type: add `expired?: boolean` beside `credentialsMissing?: boolean` (`common/types/electron_store.ts:96`) for gog/nile configs, plus a new legendary config block.
- Store: `new TypeCheckedStoreBackend('legendaryConfigStore', { cwd: 'legendary_store' })` modelled on `humble/electronStores.ts:9-11` / `gog/electronStores.ts:18` / `nile/electronStores.ts:12` (export it; humble's is module-private). Legendary file currently only holds `CacheStore`s (imports lines 1-3).
- Allow-list (`storePolicy.ts`): extend `gogConfigStore: ['userData','isLoggedIn']` (118), `nileConfigStore: ['userData']` (134), add `legendaryConfigStore: ['expired']`; also the store-name list near 381-386 and the `['userData']` list at 315-319 if applicable. Document like the `credentialsMissing` comment (122-125). One case per key in `storePolicy.test.ts`.
- Write sites: `configStore.set('expired', true)` (humble/user.ts:778); clear in login success, logout (`GOGUser.logout` `configStore.clear()` already clears it), and healthy branch. Epic flag must outrank `loggedIn=false` (legendary deletes `user.json`); `reconcileStoreUsersWhenOnline` (bootstrap 464-471) deletes `userInfo` next boot.

### `dismissedSignInNotices` AppSettings key
**Analog:** `focusRow`: type at `src/common/types.ts:155`; default `focusRow: null` at `src/backend/config.ts:357` (defaults array default `[]` here); migration/seed wiring at `config.ts:9,326-332`. Dismiss only touches this key from the renderer via `setSetting`; the pass never writes AppSettings (D-10). Pure helpers in `common/signInDismissal.ts` (idempotent add, prune-on-expired) follow `focusRowMigration.ts` style: a leading doc block naming hazards (two-store mirror, CR-01 lines 8-17) and `import { X } from 'common/types'`. Watch the TWO-STORE HAZARD: the `store/config.json` `settings` mirror must also get the key.

### `Login/loginOpenParam.ts` + `Login/index.tsx`
No exact analog. Use `useSearchParams` (react-router-dom ^6.30.6, hash router). Pure module: validate param against runner allow-list, consume-once reducer; mount effect calls existing `openLoginOverlay(runner)` then clears the param (`setSearchParams({}, { replace: true })`).

### i18n (49 catalogues + mt stamps)
**Analog:** `.planning/phases/48-*/48-01-PLAN.md` (read lines ~117-135, 253-264, 307-325, 405-420): `public/locales/*/gamelib.json` only, 4-space indent, alphabetical (`sort: true`), LF; `i18next-parser.config.js` `locales:['en']` so `pnpm i18n` writes en only; `gamelib.mt.json` stamps for 48 non-en; keep `meta/i18nCatalogPresenceBaseline.json` unmodified (`totalPairs: 0`); verify with `pnpm lint-translations:gamelib`; `{{count}}` reserved; run `pnpm i18n` as no-op check (churn guard reads unstaged tree). Namespaces: `library.signIn.*` and `login.*` (beside `login.steamReconnect`).

## Shared Patterns

### Only auth failure is a verdict
**Source:** `humble/user.ts:759-784`. Transient/network error -> log and return (health unknown). Apply to every classifier; classify from captured output, not exit code (RESEARCH 1a-1c tables).

### Pure-module-for-testability (no jsdom)
**Source:** `librarySyncIndicator.ts:3-33`, `steamTileState.ts:17-19`. Apply to rows, tile state, open-param, selector. Source-text gates use `backend/testUtils/stripSourceComments`.

### Log style / error layering
`logWarning('[bootstrap] <fn>: <what>: ${String(error)}', LogPrefix.Backend)` (bootstrap 475, 482, 489). Never log captured gogdl stdout (token object).

### Sidecar exit contract
Every timer `unref?.()`, abort child at bound, no unbounded boot work (CLAUDE.md convention 3). Spawn tests use `createFakeHomeProfile()` (`backend/testUtils/fakeHomeProfile.ts:193`) or mock `runRunnerCommand`; never hand-rolled HOME env.

### Prettier verify
Each task `<verify>` runs `npx prettier --check <exact paths>` (scoped), after `--file-info`.

### Store push to renderer
`TypeCheckedStoreBackend.set/delete` already patches the renderer snapshot via `storeChangeNotifier`; no extra code for flags. Outcome map: `sendFrontendMessage` typed in `common/types/ipc.ts` next to `humbleAuthState` (:756), plus a read-only pull handler (`get-signin-probe-outcomes`) because the push can precede the listener.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `classify.ts` runner-output classifiers | utility | No existing CLI-stderr auth classifier; use RESEARCH verdict tables. `callRunner` (`launcher.ts:~1650`) discards stderr on non-zero exit and runs the modal `errorHandler`; needs a new `skipErrorHandler` option and `onOutput` capture |
| `loginOpenParam.ts` | utility | No existing query-param-driven overlay open |

## Metadata
**Analog search scope:** `src/frontend/screens/{Library,Login}`, `src/backend/{sidecar,humble,storeManagers}`, `src/common`
**Files read:** ~10 (graphify not queried; direct targeted reads of named analogs)
**Unread/to verify by planner:** `SteamSyncNotice/index.scss`, `keyringTokenStore.ts` `cacheEpoch`, `launcher.ts` `callRunner`, `Login/index.tsx` tile branches, `storePolicy.test.ts` shape
**Pattern extraction date:** 2026-10-08

## PATTERN MAPPING COMPLETE
