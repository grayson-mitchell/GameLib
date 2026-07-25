/**
 * RPC handler registry for the sidecar (Phase 27 Plan 02 placeholder,
 * generalized by Phase 29 Plan 04 — Task 2 into the real store-layer read
 * path).
 *
 * Registers the `health` invoke handler (27-02's own dispatch-path proof,
 * kept for `bootstrap.test.ts`'s Behavior 3 assertion), the curated Steam
 * read/action flow channels (`registerSteamFlows()`, `steamFlowRegistration.ts`),
 * the curated Steam QR-login channels (`registerSteamAuthFlows()`,
 * `steamAuthFlowRegistration.ts` — Phase 30 Plan 01, D-01/D-02/D-08), the
 * curated install-slice channels (`registerInstallFlows()`,
 * `installFlowRegistration.ts` — Phase 30 Plan 02,
 * D-05a/D-05b/D-07/D-08/D-12), the curated settings-read channels
 * (`registerSettingsFlows()`, `settingsFlowRegistration.ts` — Phase 30 Plan
 * 06, gap closure for Gap 2 / UAT Test 8), the curated app-shell channels
 * (`registerAppShellFlows()`, `appShellFlowRegistration.ts` — Phase 34.1 Plan
 * 04, D-03/D-08/D-09/D-13), the curated game-details/settings/override
 * channels (`registerGameDetailsFlows()`, `gameDetailsFlowRegistration.ts` —
 * Phase 34.2 Plan 04, D-01/D-03/D-04), the curated enrichment channels
 * (`registerEnrichmentFlows()`, `enrichmentFlowRegistration.ts` — Phase 34.2
 * Plan 06, D-04/D-07/D-10), the curated logger channel (registered by
 * `loggerFlowRegistration.ts` — Phase 34.2 gap cycle 2 plan 34.2-16,
 * REQ-34.2-12 — `logError` only, an early port of a Phase 34.3/slice-6
 * channel; Phase 34.3 must NOT register it again), and the
 * two store-layer read handlers (D-03): the eager
 * `sidecar:store-snapshot` (serves the declared `BOOT_SET_STORES`, filtered
 * through the single D-08 allow-list) and the lazy `sidecar:store-fetch`
 * (single-store on-demand hydrate for everything else in `STORE_UNIVERSE`,
 * filtered identically).
 *
 * `ensureStoresRegistered()` runs at module scope, right after
 * `registerSteamFlows()`, so every store instance either handler below can
 * be asked about already exists (REQ-29-01, 29-RESEARCH Pitfall 6) before
 * any RPC frame can reach a handler body.
 *
 * Uses electronStub's own `ipcMain` directly (not `backend/ipc`'s typed
 * `addHandler`) because none of this file's channels are entries in the
 * existing `AsyncIPCFunctions` contract — and no file under this directory
 * may import the real electron module (Task 1/2 acceptance criterion),
 * which `backend/ipc.ts` itself does.
 */

import Store from 'electron-store'

import { ipcMain } from './electronStub'
import { registerSteamFlows } from './steamFlowRegistration'
import { registerSteamAuthFlows } from './steamAuthFlowRegistration'
import { registerInstallFlows } from './installFlowRegistration'
import { registerSettingsFlows } from './settingsFlowRegistration'
import { registerDialogFlows } from './dialogFlowRegistration'
import { registerDownloadQueueFlows } from './downloadQueueFlowRegistration'
import { registerAppShellFlows } from './appShellFlowRegistration'
import { registerGameDetailsFlows } from './gameDetailsFlowRegistration'
import { registerEnrichmentFlows } from './enrichmentFlowRegistration'
import { registerLoggerFlows } from './loggerFlowRegistration'
import { ensureStoresRegistered } from './storeRegistration'
import { registerStoreWriteHandlers } from './storeWriteHandlers'
import { getRegisteredStore } from '../electron_store'
import {
  BOOT_SET_STORES,
  // WR-10: T-29-13's dynamic-store-name pattern is single-sourced in storePolicy.ts.
  // It used to be declared once here and once in storeWriteHandlers.ts; since it is the
  // only thing keeping an RPC-supplied name from reaching `resolveStorePath()`, the two
  // copies drifting apart would be a path-traversal risk.
  CACHE_STORE_NAME_PATTERN,
  DENIED_CACHE_STORES,
  STORE_UNIVERSE,
  filterStoreSnapshot
} from 'common/types/storePolicy'
import {
  STORE_SNAPSHOT_CHANNEL,
  STORE_FETCH_CHANNEL
} from 'common/types/sidecarTransport'

ipcMain.handle('health', async () => 'ok')

registerSteamFlows()
registerSteamAuthFlows()
registerInstallFlows()
registerSettingsFlows()
// WR-02: without this, plan 30-03's native picker chain was unreachable — `openDialog`
// is the only backend channel that reaches `dialog.showOpenDialog`, and its sole other
// caller (`main.ts`) is not in the sidecar's import graph.
registerDialogFlows()
// Phase 32 Plan 01: the five queue-management channels (pause/resume/cancel/
// remove/inspect) — no ordering constraint relative to the other four calls
// above (each module owns its own channel names, no cross-module runtime
// dependency at registration time); placed alongside them, before
// `ensureStoresRegistered()` (32-PATTERNS.md).
registerDownloadQueueFlows()
// Phase 34.1 Plan 04: the 18 app-shell channels (themes, version/changelog,
// isIntelMac, changeLanguage, notify/quit/open*, abort, lock/unlock,
// setTitleBarOverlay, getWebviewPreloadPath) — no ordering constraint
// relative to the other calls above (own channel names, no cross-module
// runtime dependency at registration time), placed alongside them, before
// `ensureStoresRegistered()`.
registerAppShellFlows()
// Phase 34.2 Plan 04: the 15 invoke-kind game-details/settings/override
// channels — no ordering constraint relative to the other calls above (own
// channel names, no cross-module runtime dependency at registration time),
// placed alongside them, before `ensureStoresRegistered()`.
registerGameDetailsFlows()
// Phase 34.2 Plan 06: the 8 enrichment channels (getWikiGameInfo,
// getAnticheatInfo, getKnownFixes, getCrossoverIndex, searchStores,
// getStoreSearchDeals, getStoreSearchStoreMap, removeRecent) — no ordering
// constraint relative to the other calls above (own channel names, no
// cross-module runtime dependency at registration time), placed alongside
// them, before `ensureStoresRegistered()`. `wiki_game_info/electronStore`
// is already registered by `storeRegistration.ts:104` (Phase 29), so this
// module needs no new store plumbing.
registerEnrichmentFlows()
// Phase 34.2 gap cycle 2, plan 34.2-16 (REQ-34.2-12): the single `logError`
// send channel, ported early from its Phase 34.3/slice-6 slot because gap
// cycle 1's renderer repair-failure handler now routes through it — an
// unregistered `send` channel is a total silent no-op under Tauri. Declared
// in both `.planning/IPC-PORT-INVENTORY.md` and this slice's own
// `34.2-PORTED-CHANNELS.md` (§7 gap-cycle-2 subsection, plan 34.2-16 Task 3)
// so Phase 34.3 does not register `logError` a second time — a duplicate
// listener would duplicate every frontend log line (`dispatchSend` iterates
// ALL listeners for a channel). No ordering constraint relative to the other
// calls above (own channel name, no cross-module runtime dependency at
// registration time), placed alongside them, before `ensureStoresRegistered()`.
registerLoggerFlows()
ensureStoresRegistered()
// D-05: the write handlers (storeSet/storeDelete/storeNew) must not be reachable before
// every store instance exists, or a legitimate write would be rejected as an unknown
// store — hence AFTER ensureStoresRegistered(). These are `send`-kind (fire-and-forget)
// registrations, so unlike an `invoke` channel there is no response frame and no promise
// to reject, which is exactly why the missing registration was invisible before this phase.
registerStoreWriteHandlers()

// ---- Store layer read path (Plan 04, D-02 / D-03 / D-08) -------------------

/**
 * D-13's four dynamically-named `CacheStore` names carried inside
 * `BOOT_SET_STORES`/`STORE_UNIVERSE` that are NOT `ValidStoreName`s —
 * mirrors `storePolicy.ts`'s own (unexported) boot-set cache-store name
 * list. Declared here rather than exported from `storePolicy.ts`, to avoid
 * widening that module's export surface for this single internal consumer;
 * both lists are short, stable, and greppable (D-13's own
 * declared-not-derived rationale).
 *
 * PLUS `wikigameinfo` — discovered by this plan's own coverage test (Task
 * 3), not anticipated by 29-RESEARCH: `wikigameinfo` IS declared as a
 * `ValidStoreName` in `StoreStructure` (electron_store.ts), but
 * `wiki_game_info/electronStore.ts` constructs it as a `CacheStore`, not a
 * `TypeCheckedStoreBackend` — so it never self-registers into
 * `electron_store.ts`'s typed registry (plan 29-02) despite its type
 * declaration. It resolves through the exact same cache-shaped
 * construction as the D-13 four; the only difference is it sits in
 * `LAZY_STORES`, not `BOOT_SET_STORES`, so it is reachable only through the
 * lazy fetch handler below, never the eager snapshot.
 */
const CACHE_BACKED_STORE_NAMES: readonly string[] = [
  'legendary_library',
  'gog_library',
  'nile_library',
  'zoom_library',
  'wikigameinfo'
]

/**
 * Resolves the raw (unfiltered) snapshot object for a store name. Callers
 * are responsible for validating `name` BEFORE calling this function
 * (T-29-13) — it never reconstructs a path by hand and never throws.
 *
 *   - A `ValidStoreName` resolves through the registry (plan 29-02) — the
 *     live instance's `raw_store`.
 *   - A name in `CACHE_BACKED_STORE_NAMES` resolves through the EXACT
 *     construction shape `backend/cache.ts` uses for every dynamically-named
 *     `CacheStore` (`{ cwd: 'store_cache', name, clearInvalidConfig: true }`).
 *     The sidecar's `Module._load`-substituted `FileStore` shares its D-14
 *     path-keyed cell with the real `CacheStore` instance constructed by the
 *     corresponding store-declaration module, so this always reads the
 *     identical on-disk data rather than a fresh, unrelated read.
 *   - Anything else (a registration gap, or a name a caller's own
 *     validation let through that isn't actually served here) yields `{}`
 *     plus a stderr diagnostic naming the store — NEVER a throw (SEAM
 *     Invariant B), and the diagnostic NEVER carries a value (T-29-18).
 */
function resolveRawStore(name: string): Record<string, unknown> {
  // WR-09 (Phase 29 code review): the deny list is consulted HERE, not only inside
  // `filterStoreSnapshot`. `humble_library` is absent from both
  // `CACHE_BACKED_STORE_NAMES` and `STORE_UNIVERSE`, so this function already returned
  // `{}` for it and the deny check read as live while being unreachable — it would have
  // silently stopped being decoration the day someone added the name to a handler list.
  // Checking first makes the control load-bearing regardless of those lists.
  if (DENIED_CACHE_STORES.includes(name)) {
    process.stderr.write(
      `[sidecar/handlers] refusing to snapshot denied cache store '${name}' — returning {}\n`
    )
    return {}
  }

  const registered = getRegisteredStore(name)
  if (registered) {
    return registered.raw_store as Record<string, unknown>
  }

  if (CACHE_BACKED_STORE_NAMES.includes(name)) {
    const cacheBackedStore = new Store({
      cwd: 'store_cache',
      name,
      clearInvalidConfig: true
    })
    return cacheBackedStore.store as Record<string, unknown>
  }

  process.stderr.write(
    `[sidecar/handlers] no live store instance for '${name}' — returning {}\n`
  )
  return {}
}

// D-03: the eager payload is EXACTLY the declared boot set — not the
// unbounded lazy tier (T-29-16, index.tsx's hydration timeout). D-08: this
// generalizes the old per-store hand-strip that used to live here (T-27-09)
// — that defense-in-depth property is PRESERVED, and now enforced by
// `filterStoreSnapshot` for every store in the walk, not one field of one
// store (single-sourcing).
ipcMain.handle(STORE_SNAPSHOT_CHANNEL, async () => {
  const snapshot: Record<string, unknown> = {}
  for (const name of BOOT_SET_STORES) {
    snapshot[name] = filterStoreSnapshot(name, resolveRawStore(name))
  }
  return snapshot
})

// D-03: lazy per-store hydrate for the tier that isn't part of the eager
// snapshot. Applies the IDENTICAL filter as the eager path above (T-29-14 —
// "enforced eagerly but forgotten in the lazy fetch" is exactly the gap
// this closes). Rides the existing `sidecar_invoke` Tauri command; this is
// an ordinary internal RPC channel, not a new Tauri command.
ipcMain.handle(
  STORE_FETCH_CHANNEL,
  async (_event: unknown, storeName: unknown) => {
    if (typeof storeName !== 'string') {
      process.stderr.write(
        '[sidecar/handlers] sidecar:store-fetch rejected a non-string store name\n'
      )
      return {}
    }

    const isUniverseMember = (STORE_UNIVERSE as readonly string[]).includes(
      storeName
    )
    const isSyntacticallyValidName = CACHE_STORE_NAME_PATTERN.test(storeName)

    if (!isUniverseMember && !isSyntacticallyValidName) {
      // T-29-13: rejected BEFORE any resolution attempt — this never
      // reaches `getRegisteredStore()` or the cache-store construction
      // branch, so `fileStore.ts`'s own path-tampering guard is never even
      // exercised by a malicious name arriving here. The diagnostic below
      // names the rejected string only — never a store value (T-29-18).
      process.stderr.write(
        `[sidecar/handlers] sidecar:store-fetch rejected an invalid store name: '${storeName}'\n`
      )
      return {}
    }

    return filterStoreSnapshot(storeName, resolveRawStore(storeName))
  }
)
