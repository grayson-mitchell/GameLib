import { TypeCheckedStoreBackend } from '../../electron_store'
import CacheStore from '../../cache'
import { GameInfo, ExtraInfo } from 'common/types'
import type { SteamBottleConfig } from 'common/types/steam'

const configStore = new TypeCheckedStoreBackend('steamConfigStore', {
  cwd: 'steam_store'
})

// ── Phase 17 (17-02): dedicated Steam CrossOver bottle settings store ───────
// A DEDICATED store (not a phantom GameConfig entry — see RESEARCH.md
// "Alternatives Considered") persisting the bottle's own Wine engine +
// provisioned/login state, independent of configStore (auth-only).
const steamBottleConfigStore = new TypeCheckedStoreBackend(
  'steamBottleConfigStore',
  { cwd: 'steam_store' }
)

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
  // GAP-B: persists the delisted verdict (appdetails success:false) across restarts.
  // Absent / false means "not known delisted"; true means confirmed unavailable on Steam.
  is_delisted?: boolean
  // DETAIL-01 gap-fix: set true once a metadata fetch has recorded the appdetails
  // `platforms` object. Undefined on pre-Phase-7 entries — lets getGameInfo
  // distinguish "platform support never captured" from a genuine Windows-only
  // (is_mac_native/is_linux_native === false) verdict, so it can self-heal exactly once.
  platformsCaptured?: boolean
}

export type { SteamBottleConfig }
export {
  configStore,
  steamLibraryStore,
  steamMetadataStore,
  steamSyncStore,
  steamBottleConfigStore
}
