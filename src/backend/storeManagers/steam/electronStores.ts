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
  // so the icons survive a restart / library resync. D-17 (34.13-01) retires
  // the old "Windows is the implicit baseline (no flag)" premise: Windows
  // availability is now an EXPLICIT captured flag (is_windows_native, below)
  // because a mac-native game may or may not have a Windows depot, and the
  // platform row's Windows option is gated on the answer. Absent means "not
  // known native" for is_mac_native/is_linux_native, same as always.
  is_mac_native?: boolean
  is_linux_native?: boolean
  /** D-17: the pre-install Windows-depot availability signal, captured from
   * appdetails `data.platforms.windows` by 34.13-02 — mirrors
   * `GameInfo.is_windows_native` (src/common/types.ts) across the cache
   * boundary. Load-bearing contract, identical on both sides: only
   * `=== true` permits offering a Windows install. `undefined` means "never
   * captured" (every pre-34.13 cache entry) and MUST NOT be coerced to
   * available. */
  is_windows_native?: boolean
  /** D-17: the PERSISTED verdict of a completed forced Windows-via-bottle
   * install (34.13-14 is the sole reader/writer).
   *
   * What it means: this appId's CURRENT install was placed in the Phase 17
   * `GameLibSteam` bottle by a D-17 forced Windows-via-bottle install. It is
   * a fact about *where the bits are*, not a preference and not a capability.
   *
   * How it differs from `is_windows_native`: that field says the game HAS a
   * Windows build (pre-install, from appdetails); this one says the
   * installed copy IS the Windows build, in the bottle (post-install,
   * written by GameLib). They are never interchangeable — collapsing them
   * into one field would read every Windows-capable mac-native game as
   * already-forced.
   *
   * Value contract, identical to `is_windows_native`'s: only `=== true` has
   * any effect. `undefined` and `false` both mean "never forced". Absent is
   * the shape of EVERY pre-34.13 cache entry, so the fail-safe direction is
   * one-way: an unreadable or missing flag must route exactly as today,
   * never into the bottle.
   *
   * Who writes it: 34.13-14 only, and only after a forced install actually
   * committed bits to the bottle — never on a deferral, a rejected dispatch
   * or a failed download. Cleared by 34.13-14 when the bottle's appmanifest
   * is confirmed absent (uninstall complete), so a later native re-install
   * does not inherit a stale verdict.
   *
   * Who reads it: 34.13-14's `isBottleEligible()` seam only — which is why
   * `getSettings()`, `isNative()`, `launch()` and `uninstall()` all stay
   * consistent with one another. The Phase 24 bridge predicates deliberately
   * do NOT read it (the bridge bottle is a different filesystem root that
   * never held these bits).
   *
   * ⚠ CARRY-FORWARD WARNING: `steamMetadataStore.set` REPLACES the whole
   * entry (T-18-02-04), so this field must be explicitly carried forward by
   * any write that enumerates its payload — exactly as `mac_arch_verified` /
   * `mac_arch_source` already are. 34.13-14 owns that edit; without it the
   * verdict is silently dropped on the next appdetails fetch and the forced
   * game reverts to native routing intermittently. */
  forcedWindowsViaBottle?: boolean
  /** debug/steam-bottle-uninstall-reverts: the PERSISTED verdict that this
   * appId's CURRENT bottle install was written directly by GameLib's own
   * depot downloader (installBottleNative, D-15/SNI-08) rather than
   * dispatched to the bottled Steam client (tellBottledSteamToInstall).
   *
   * PROVENANCE ONLY as of debug/steam-bottle-uninstall-reverts (FINAL):
   * this flag no longer changes uninstall() ROUTING. It originally existed
   * so uninstall() could tell whether the bottled Steam client had ever
   * authored/adopted a given bottle install (its confirm dialog only ever
   * had something to act on for installs it authored itself) — but that
   * entire delegation mechanism was subsequently proven architecturally
   * unworkable in this CrossOver bottle for EVERY bottle title, not only
   * GameLib-authored ones (a CW_USEDEFAULT window-position defect makes
   * Steam's own confirm dialog unreachable regardless of manifest
   * authorship — see games.ts uninstall()'s own JSDoc for the full
   * evidence chain). uninstall() now routes every bottle-eligible,
   * non-bridge title to direct deletion unconditionally, so this flag's
   * original routing purpose is moot. It is kept — not deleted — purely as
   * install-provenance metadata that may be useful for future diagnostics
   * (distinguishing a GameLib depot-download install from a Steam-client
   * install).
   *
   * Who writes it: games.ts's install() bottle branch, only after
   * installBottleNative() actually commits bits (status 'done') — never on
   * a deferral or a failed download. Cleared once the bottle's appmanifest
   * is confirmed absent (uninstall complete, pollUninstallOnce's 'absent'
   * branch), so a later legacy-delegated reinstall does not inherit a stale
   * verdict.
   *
   * ⚠ CARRY-FORWARD WARNING: `steamMetadataStore.set` REPLACES the whole
   * entry (T-18-02-04) — any write that enumerates its payload field-by-field
   * (games.ts fetchMetadataIfNeeded) must explicitly carry this forward. */
  nativeBottleInstall?: boolean
  // GAP-B: persists the delisted verdict (appdetails success:false) across restarts.
  // Absent / false means "not known delisted"; true means confirmed unavailable on Steam.
  is_delisted?: boolean
  // DETAIL-01 gap-fix: set true once a metadata fetch has recorded the appdetails
  // `platforms` object. Undefined on pre-Phase-7 entries — lets getGameInfo
  // distinguish "platform support never captured" from a genuine Windows-only
  // (is_mac_native/is_linux_native === false) verdict, so it can self-heal exactly once.
  platformsCaptured?: boolean
  /** MAC32-01/03: resolved macOS build architecture. 'unknown' default is
   * implicit (absent key) — NEVER infer '32' from a low/unparseable min-OS
   * signal (the false-flag trap, see games.ts isBottleEligible). Direction B
   * (18-02): set from the store-API mac_requirements min-OS heuristic
   * pre-install (never '32' — see macArchFromMinOS); corrected to '32' only
   * by the post-install Mach-O ground-truth check (Plan 18-03). */
  mac_arch?: '32' | '64' | 'unknown'
  /** True once the post-install lipo/file check has run and confirmed or
   * corrected mac_arch — prevents re-shelling-out on every launch(). */
  mac_arch_verified?: boolean
  /** MAC32-cache-shape (LOCKED, CONTEXT.md; reconciled 18-02 direction B):
   * provenance of the mac_arch verdict — 'minos' (store-API mac_requirements
   * min-OS pre-install heuristic) or 'macho' (post-install Mach-O ground
   * truth, i.e. a Steam-corrected fact). Forward-compat for a future
   * community override export (Phase 19); do not omit even though nothing
   * reads it yet. */
  mac_arch_source?: 'minos' | 'macho'
}

export type { SteamBottleConfig }
export {
  configStore,
  steamLibraryStore,
  steamMetadataStore,
  steamSyncStore,
  steamBottleConfigStore
}
