/**
 * RPC handler registry for the sidecar (Phase 27 Plan 02 placeholder,
 * generalized by Phase 29 Plan 04 — Task 2 into the real store-layer read
 * path).
 *
 * Registers the `health` invoke handler (27-02's own dispatch-path proof,
 * kept for `bootstrap.test.ts`'s Behavior 3 assertion), the curated Steam
 * read/action flow channels (`registerSteamFlows()`, `steamFlowRegistration.ts`),
 * and the two store-layer read handlers (D-03): the eager
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
import { ensureStoresRegistered } from './storeRegistration'
import { registerStoreWriteHandlers } from './storeWriteHandlers'
import { getRegisteredStore } from '../electron_store'
import {
  BOOT_SET_STORES,
  STORE_UNIVERSE,
  filterStoreSnapshot
} from 'common/types/storePolicy'
import {
  STORE_SNAPSHOT_CHANNEL,
  STORE_FETCH_CHANNEL
} from 'common/types/sidecarTransport'

ipcMain.handle('health', async () => 'ok')

registerSteamFlows()
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

/** T-29-13: a syntactically plausible dynamic-store name (letters, digits, `_`, `-`, 1-64 chars). */
const CACHE_STORE_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

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
