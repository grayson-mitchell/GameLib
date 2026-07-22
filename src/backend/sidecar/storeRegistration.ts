/**
 * Sidecar store registration (Phase 29 Plan 04 — Task 1).
 *
 * REQ-29-01 / 29-RESEARCH Pitfall 6: importing a thin `electronStores.ts`
 * module inside a UNIT TEST (which imports that specific module itself)
 * proves nothing about the real running sidecar — the sidecar process only
 * ever imports `./handlers` (via `bootstrap.ts`), and `handlers.ts` never
 * touches most of these store-declaration modules on its own. Without this
 * file importing each one for its module-scope construction side effect, a
 * generalized snapshot/fetch handler "works" in isolation and silently
 * returns `{}` for every store nobody happened to import along the way.
 *
 * Every import below exists ONLY for its side effect: each thin
 * `electronStores.ts` module constructs `new TypeCheckedStoreBackend(...)` /
 * `new CacheStore(...)` at module scope, and `TypeCheckedStoreBackend`'s
 * constructor self-registers into `electron_store.ts`'s `storeRegistry`
 * (plan 29-02) — so importing the module is what makes the store resolvable
 * by name later, through `getRegisteredStore()`.
 *
 * This file deliberately does NOT import the store-manager registry's own
 * aggregation entry point, the download queue host module, the Wine
 * manager's utility host module, or the migration system's host module
 * (D-15). Those heavy host modules pull in Electron-app-only side effects
 * and cross-manager wiring (spike 009's import-time wall) — plan 29-02
 * extracted their store declarations into dedicated thin `electronStores.ts`
 * modules precisely so this file can import the STORE without ever
 * touching its host module.
 *
 * Hard constraint: this file must NOT import the real `electron` module,
 * directly or transitively at import time — same acceptance criterion
 * `handlers.ts` documents. `electronStub` is already installed by
 * `bootstrap.ts`'s `Module._load` hook by the time this module is required
 * (`bootstrap.ts` imports `./installElectronHook` before `./handlers`, and
 * `./handlers` is what calls `ensureStoresRegistered()`), but the
 * source-level rule stands regardless of runtime ordering.
 */

// ---- Light store-declaration modules (imported for side effect only) ------

import {
  configStore as _configStore,
  tsStore as _tsStore
} from '../constants/key_value_stores'

import {
  configStore as _steamConfigStore,
  steamBottleConfigStore as _steamBottleConfigStore,
  steamLibraryStore as _steamLibraryStore,
  steamMetadataStore as _steamMetadataStore,
  steamSyncStore as _steamSyncStore
} from '../storeManagers/steam/electronStores'

import {
  configStore as _gogConfigStore,
  installedGamesStore as _gogInstalledGamesStore,
  apiInfoCache as _gogApiInfoCache,
  libraryStore as _gogLibraryStore,
  achievementStore as _gogAchievementStore,
  syncStore as _gogSyncStore,
  installInfoStore as _gogInstallInfoStore,
  playtimeSyncQueue as _gogPlaytimeSyncQueue,
  privateBranchesStore as _gogPrivateBranchesStore
} from '../storeManagers/gog/electronStores'

import {
  configStore as _zoomConfigStore,
  installedGamesStore as _zoomInstalledGamesStore,
  libraryStore as _zoomLibraryStore,
  installInfoStore as _zoomInstallInfoStore
} from '../storeManagers/zoom/electronStores'

import {
  installStore as _nileInstallStore,
  libraryStore as _nileLibraryStore,
  configStore as _nileConfigStore
} from '../storeManagers/nile/electronStores'

import { libraryStore as _sideloadLibraryStore } from '../storeManagers/sideload/electronStores'

import {
  installStore as _legendaryInstallStore,
  libraryStore as _legendaryLibraryStore,
  gamesOverrideStore as _legendaryGamesOverrideStore,
  gameInfoStore as _legendaryGameInfoStore
} from '../storeManagers/legendary/electronStores'

import {
  configStore as _humbleConfigStore,
  humbleLibraryStore as _humbleLibraryStore,
  humbleSyncStore as _humbleSyncStore,
  humbleRevealedStore as _humbleRevealedStore,
  humbleOwnershipOverrideStore as _humbleOwnershipOverrideStore,
  humbleGiftedAtStore as _humbleGiftedAtStore,
  humbleAuditStore as _humbleAuditStore,
  humbleLocalRedeemedStore as _humbleLocalRedeemedStore,
  humbleNotifiedExpirationStore as _humbleNotifiedExpirationStore
} from '../humble/electronStores'

import { gameOverridesStore as _gameOverridesStore } from '../game_overrides/electronStores'

import {
  wikiGameInfoStore as _wikiGameInfoStore,
  umuStore as _umuStore
} from '../wiki_game_info/electronStore'

// D-15 extractions (plan 29-02) — thin modules avoiding the heavy hosts.
import { wineDownloaderInfoStore as _wineDownloaderInfoStore } from '../wine/manager/electronStores'
import { downloadManager as _downloadManager } from '../downloadmanager/electronStores'
import { migrationsStore as _migrationsStore } from '../migration/electronStores'
// D-15's fourth extraction: NEVER import `uploadedLogFileStore` from its
// old host module — that module pulls in Electron's `app`, the IPC
// layer's `sendFrontendMessage`, and the logger. `uploadedLogs` is inside
// D-02's LOCKED coverage bar (plan 29-04 Task 3's walk test asserts it
// round-trips); there is no "known gap" exclusion available for it.
import { uploadedLogFileStore as _uploadedLogFileStore } from '../logger/electronStores'

// `fontsStore` is EXCLUDED — 29-RESEARCH Pitfall 2: `fontsStore` has ZERO
// construction sites anywhere in the backend. It is a dead `StoreStructure`
// entry with no `new TypeCheckedStoreBackend('fontsStore', ...)` call to
// import. This is the ONE permitted exclusion in this file's coverage — do
// not invent a construction for it.

let registered = false

/**
 * Idempotent registration entry point. Every imported binding above is
 * referenced again here (not just consumed by the top-level `import`
 * statement) so a bundler's aggressive side-effect elision — Rollup, used
 * by the built `build/main/sidecar.js` — cannot tree-shake away an
 * `import './x'` that appears, from a bundler's static analysis, to have no
 * consumer.
 */
export function ensureStoresRegistered(): void {
  if (registered) {
    return
  }
  registered = true

  const touched: unknown[] = [
    _configStore,
    _tsStore,
    _steamConfigStore,
    _steamBottleConfigStore,
    _steamLibraryStore,
    _steamMetadataStore,
    _steamSyncStore,
    _gogConfigStore,
    _gogInstalledGamesStore,
    _gogApiInfoCache,
    _gogLibraryStore,
    _gogAchievementStore,
    _gogSyncStore,
    _gogInstallInfoStore,
    _gogPlaytimeSyncQueue,
    _gogPrivateBranchesStore,
    _zoomConfigStore,
    _zoomInstalledGamesStore,
    _zoomLibraryStore,
    _zoomInstallInfoStore,
    _nileInstallStore,
    _nileLibraryStore,
    _nileConfigStore,
    _sideloadLibraryStore,
    _legendaryInstallStore,
    _legendaryLibraryStore,
    _legendaryGamesOverrideStore,
    _legendaryGameInfoStore,
    _humbleConfigStore,
    _humbleLibraryStore,
    _humbleSyncStore,
    _humbleRevealedStore,
    _humbleOwnershipOverrideStore,
    _humbleGiftedAtStore,
    _humbleAuditStore,
    _humbleLocalRedeemedStore,
    _humbleNotifiedExpirationStore,
    _gameOverridesStore,
    _wikiGameInfoStore,
    _umuStore,
    _wineDownloaderInfoStore,
    _downloadManager,
    _migrationsStore,
    _uploadedLogFileStore
  ]

  // Referencing `touched.length` (rather than discarding the array outright)
  // keeps every binding above genuinely "used" from a bundler's/linter's
  // point of view, without any runtime effect beyond this no-op read.
  void touched.length
}
