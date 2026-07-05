import { TypeCheckedStoreBackend } from '../electron_store'
import CacheStore from '../cache'
import { HumbleOrderCacheEntry } from 'common/types/humble'

const configStore = new TypeCheckedStoreBackend('humbleConfigStore', {
  cwd: 'humble_store'
})

// Phase 11 scope. Wiped by HumbleUser.disconnect() alongside configStore
// (D-03/D-04) — safe to lose since it is fully reconstructible from a
// re-sync. Indefinite lifespan: cache-aggressive per HSYNC-01/D-24.
const humbleLibraryStore = new CacheStore<HumbleOrderCacheEntry, string>(
  'humble_library',
  null
)

// Last-synced timestamp / fail-soft state (D-31/D-32). Also wiped by
// disconnect() alongside humbleLibraryStore.
const humbleSyncStore = new CacheStore<number, 'syncedAt'>(
  'humble_sync',
  null
)

// D-04/D-30: this store is NEVER cleared by HumbleUser.disconnect() — it
// (and the future audit log) must survive a disconnect/reconnect cycle so a
// previously-revealed key never regresses to UNREVEALED (Pitfall 1). Kept as
// a separate electron-store file on disk from the two stores above for
// exactly that reason — do not merge this into humbleLibraryStore.
const humbleRevealedStore = new CacheStore<{ revealedAt: number }, string>(
  'humble_revealed',
  null
)

export {
  configStore,
  humbleLibraryStore,
  humbleSyncStore,
  humbleRevealedStore
}
