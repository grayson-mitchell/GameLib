import { TypeCheckedStoreBackend } from '../../electron_store'
import CacheStore from '../../cache'
import { GameInfo, ExtraInfo } from 'common/types'

const configStore = new TypeCheckedStoreBackend('steamConfigStore', {
  cwd: 'steam_store'
})

// ── LIB-01/02/03: Persistent library cache (indefinite lifespan per D-05) ──
const steamLibraryStore = new CacheStore<GameInfo[], 'games'>(
  'steam_library',
  null
)

// ── LIB-04: Per-game metadata cache (indefinite lifespan per D-05) ──────────
// Keyed by appId string; stores artwork URLs and extra info after lazy fetch
const steamMetadataStore = new CacheStore<SteamMetadataCacheEntry>(
  'steam_metadata',
  null
)

// ── Stale-indicator: last successful sync epoch millis (plan 05) ─────────────
const steamSyncStore = new CacheStore<number, 'syncedAt'>('steam_sync', null)

export interface SteamMetadataCacheEntry {
  art_cover: string
  art_square: string
  extra: ExtraInfo
  // DETAIL-01: platform support captured from appdetails `platforms`. Persisted
  // so the icons survive a restart / library resync. Windows is the implicit
  // baseline (no flag); absent means "not known native".
  is_mac_native?: boolean
  is_linux_native?: boolean
}

export { configStore, steamLibraryStore, steamMetadataStore, steamSyncStore }
