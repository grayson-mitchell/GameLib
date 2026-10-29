import { TypeCheckedStoreBackend } from '../../electron_store'
import CacheStore from '../../cache'
import { GameInfo, ExtraInfo } from 'common/types'

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

// ── quick 261029-ji2: pending Mac Steam adoption records ────────────────────
// One record per appId GameLib downloaded itself while Mac Steam was running.
// A DEDICATED store (not a field on steamMetadataStore, whose whole-entry
// replace would drop it). Indefinite lifespan: it must survive a GameLib
// restart, and it is cleared on uninstall / adoption.
const steamPendingAdoptionStore = new CacheStore<unknown>(
  'steam_pending_adoption',
  null
)

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
  // GAP-B: persists the delisted verdict (appdetails success:false) across restarts.
  // Absent / false means "not known delisted"; true means confirmed unavailable on Steam.
  is_delisted?: boolean
  // DETAIL-01 gap-fix: set true once a metadata fetch has recorded the appdetails
  // `platforms` object. Undefined on pre-Phase-7 entries — lets getGameInfo
  // distinguish "platform support never captured" from a genuine Windows-only
  // (is_mac_native/is_linux_native === false) verdict, so it can self-heal exactly once.
  platformsCaptured?: boolean
  /** Quick task 260816-qcn (WR-02/CR-01 root cause): provenance stamp for the
   * three platform booleans above, written by BOTH platform-signal writers —
   * `games.ts`'s per-game `appdetails` fetch and `platformCapture.ts`'s bulk
   * PICS `oslist` capture — on every write `resolvePlatformWrite`
   * (`./platformPrecedence`) ACCEPTS. Records WHO wrote the signal last so a
   * lost/overridden write is inspectable after the fact.
   *
   * Honesty limit (D-B, do not weaken this comment): this does NOT reconcile
   * a genuine `appdetails`-vs-PICS disagreement. When the two sources
   * disagree about an app, the surviving answer still depends on which sync
   * ran most recently — what changes is that the outcome is now inspectable
   * via this field and `platformsCapturedAt` below, not that the conflict is
   * resolved or closed. Absent on every pre-this-task cache entry; treated
   * as indefinitely old by `resolvePlatformWrite`, so a legacy entry is
   * writable by either source (D-D — no `Migration` was added).
   *
   * ⚠ CARRY-FORWARD WARNING applies to this field too: `steamMetadataStore.set`
   * REPLACES the whole entry (T-18-02-04), so any writer that enumerates its
   * payload (rather than spreading `...existing`) must explicitly carry this
   * field forward — see `mac_arch_verified` / `forcedWindowsViaBottle` above
   * for the standing precedent this follows. */
  platformsSource?: 'appdetails' | 'pics'
  /** Epoch ms companion to `platformsSource` above — WHEN the surviving
   * platform write was captured. Same D-B honesty limit, same D-D legacy
   * handling, same carry-forward obligation. */
  platformsCapturedAt?: number
  /** MAC32-01/03: resolved macOS build architecture. 'unknown' default is
   * implicit (absent key) — NEVER infer '32' from a low/unparseable min-OS
   * signal (the false-flag trap, see games.ts isBottleEligible). Direction B
   * (18-02): set from the store-API mac_requirements min-OS heuristic
   * pre-install (never '32' — see macArchFromMinOS); corrected to '32' by the
   * post-install Mach-O ground-truth check (Plan 18-03), or SEEDED to '32' by
   * a curated known-fix `macArch` on Apple silicon (quick 261027-bqe). The
   * seed never sets mac_arch_verified, so the Mach-O check keeps the last
   * word. */
  mac_arch?: '32' | '64' | 'unknown'
  /** True once the post-install lipo/file check has run and confirmed or
   * corrected mac_arch — prevents re-shelling-out on every launch(). */
  mac_arch_verified?: boolean
  /** MAC32-cache-shape (LOCKED, CONTEXT.md; reconciled 18-02 direction B):
   * provenance of the mac_arch verdict — 'minos' (store-API mac_requirements
   * min-OS pre-install heuristic) or 'macho' (post-install Mach-O ground
   * truth, i.e. a Steam-corrected fact) or 'known-fix' (curated pre-install
   * seed, never verified). Forward-compat for a future
   * community override export (Phase 19); do not omit even though nothing
   * reads it yet. */
  mac_arch_source?: 'minos' | 'macho' | 'known-fix'
  /** Phase 51 Plan 03 (D-51-07/D-51-10): the PERSISTED bridge verdict for
   * this appId — the scan result, the pre-install steam_api prescreen
   * signal, the user's own bridge/bottle override, and the one-time-notice
   * bookkeeping, all nested under one field so a single carry-forward
   * obligation covers the whole family (exactly the `forcedWindowsViaBottle`
   * precedent above, just one level deeper).
   *
   * What it means: `undefined` means "never scanned/decided" for every
   * sub-field — NEVER coerce an absent `bridge` (or an absent sub-field
   * inside it) into a routing-affecting value. `bridge.scan` is cleared
   * (not the whole `bridge` object) when a later shim release covers its
   * `missingSymbols` (`isScanVerdictNowCovered`, shimCoverage.ts) — the
   * user's own `userRoute` override and notice bookkeeping must survive
   * that clear untouched.
   *
   * Who writes it: ONLY `bridgeVerdict.ts`'s read-modify-write helpers
   * (`writeBridgeScanVerdict`, `clearBridgeScanVerdict`,
   * `setBridgeSteamApiPrescreen`, `setBridgeUserRoute`,
   * `setBridgeNoticeAcknowledged`, `markBridgeLimitedNoticeShown`,
   * `setBridgeIdentityFallback`) — every one of them spreads `...existing`
   * before writing, never a bare `steamMetadataStore.set` with a fresh
   * object literal (same discipline `markForcedWindowsViaBottle` already
   * follows, games.ts).
   *
   * Who reads it: `bridgeVerdict.ts`'s `readBridgeVerdict` (the ONLY reader
   * — never read `steamMetadataStore` directly for this field), which
   * safe-parses the stored value and returns `undefined` (never throws) on
   * a malformed/tampered entry — the opposite fail-safe posture from the
   * bundled allowlist's fail-loud one, because this value is UNTRUSTED
   * disk content, not a reviewed bundled asset (T-51-09).
   *
   * ⚠ CARRY-FORWARD WARNING: `steamMetadataStore.set` REPLACES the whole
   * entry (T-18-02-04), so this field must be explicitly carried forward by
   * any write that enumerates its payload — exactly as `forcedWindowsViaBottle`
   * above. `games.ts`'s `fetchMetadataIfNeeded` success writer (the
   * ENUMERATED `steamMetadataStore.set(this.appId, {...})` call at
   * ~L870) is the one site that must gain a `bridge` carry-forward clause
   * — that edit belongs to 51-09, not this plan; it is called out here so
   * it is not missed. Without it, the next appdetails fetch silently drops
   * every bridge verdict this field family persisted. */
  bridge?: SteamBridgeVerdict
}

/** Phase 51 Plan 03 (D-51-07): a single persisted import-scan result,
 * produced by 51-02's `scanSteamApiImports`/`resolveRequiredInterfaceVersions`
 * and `shimCoverage.ts`'s `evaluateShimCoverage`, written by
 * `bridgeVerdict.ts`'s `writeBridgeScanVerdict`.
 *
 * `shimExportSetVersion` is the stamp (`shimCoverage.ts`'s
 * `SHIM_EXPORT_SET_VERSION` at scan time) that lets a later shim release
 * auto-clear a stale `'miss'` verdict (`isScanVerdictNowCovered`) — no
 * manual "retry" affordance is built for this case (D-51-07). */
export interface SteamBridgeScanVerdict {
  status: 'clean' | 'miss'
  arch: 'x86' | 'x64'
  /** Every imported symbol/version 51-02's scan could not satisfy, in the
   * same `evaluateShimCoverage` ordering: unexported bare accessors, then
   * unserved required interface versions, then raw version-resolution
   * problem strings verbatim. Empty on a `'clean'` verdict. */
  missingSymbols: string[]
  /** family -> exact required interface version, from 51-02's
   * `resolveRequiredInterfaceVersions`, persisted so the D-05 fallback
   * dialog and the game page can name the exact version without re-scanning. */
  interfaceVersions: Record<string, string>
  /** The interface families served as stubs for THIS scan (D-51-02's notice
   * trigger), from `evaluateShimCoverage`'s `stubbedInterfaces`. */
  stubbedInterfaces: string[]
  shimExportSetVersion: string
  /** ISO-8601 timestamp of when this scan ran. */
  scannedAt: string
  /** quick 261026-lif (CONTEXT, "Stale verdict invalidation"): the size and
   * sha1 of the game-original dll each interface-version read came from, or of
   * its `.gamelib-orig`, keyed by the shim target's path relative to the
   * bridge bottle dir (forward slashes). Absent means it was never recorded. */
  originalFingerprints?: Record<string, { size: number; sha1: string }>
  /** Phase 52: set by placeShimForGame when the launch exe carries a `.bind`
   * section. Phase 56 (D-12): such a title launches in steamclient-layer DRM
   * mode. Absent means none detected. */
  drmWrapper?: 'steamstub'
  /** Phase 53 (D-53-04): what the Mono managed scan found. `mono` counts the
   * managed assemblies read and the steam_api imports of families the shim
   * does not serve (a count only; it never changes `status`). `il2cpp` marks a
   * title whose managed code was not scanned. Absent when there was no
   * managed evidence. */
  managedScan?:
    | { kind: 'mono'; assemblies: number; unservedFamilyImports: number }
    | { kind: 'il2cpp'; reason: 'il2cpp: not scanned' }
}

/** Phase 51 Plan 03 (D-51-07/D-51-10): the full persisted bridge verdict for
 * one appId — see `SteamMetadataCacheEntry.bridge`'s own doc comment for the
 * carry-forward contract and the ownership rules (bridgeVerdict.ts writes,
 * readBridgeVerdict reads). Every field is independently optional and
 * independently absent-means-undecided; they are never coerced into one
 * another (e.g. an absent `userRoute` never falls back to `scan.status`). */
export interface SteamBridgeVerdict {
  /** The most recent import-scan result, or absent when never scanned (or
   * cleared by `isScanVerdictNowCovered`'s auto-clear). */
  scan?: SteamBridgeScanVerdict
  /** D-51-06: the pre-install depot-manifest-file-list prescreen signal —
   * 'none' (no steam_api*.dll at all), 'x86'/'x64'/'both' (which flavor(s)
   * are present), or 'unknown' (prescreen could not determine). Written
   * BEFORE any download; independent of `scan`, which only runs post-install. */
  steamApi?: 'none' | 'x86' | 'x64' | 'both' | 'unknown'
  /** D-51-10/11: the user's own override — set by the install dialog's
   * "Use the Windows Steam client instead" toggle (D-51-10) or the
   * known-bad dialog's "Try the bridge anyway" button (D-51-11). Absent
   * means no override was ever set; `setBridgeUserRoute(appId, undefined)`
   * removes the key entirely rather than storing an undefined value. */
  userRoute?: 'bottle' | 'bridge'
  /** D-51-08: the `SteamBridgeRouteReason` the user acknowledged when they
   * last dismissed/accepted a route-related dialog (e.g. a known-bad
   * acknowledgement) — a plain string here (not the narrower
   * `SteamBridgeRouteReason` type) so a future reason value never fails to
   * round-trip through this store. */
  noticeAcknowledgedFor?: string
  /** D-51-02: true once the one-time "limited functionality" notice has
   * been shown for this game — shown once per game, logged every time. */
  limitedNoticeShown?: boolean
  /** D-51-04: true when the bridge helper fell back to AppID 480
   * identity-only for this game (real-AppID init failed). */
  identityFallback?: boolean
  /** Phase 54: the last PICS-resolved Windows launch entry (raw `executable`
   * with Windows separators, plus `installdir`). Used only when PICS cannot
   * answer at Play (a license-gated app with no open Steam session); the
   * absolute path is rebuilt through sanitizeInstalldir on every read. */
  launchTarget?: { executable: string; installdir: string; workingdir?: string }
  /** Quick 261024-br4: Steam DRM detected in the game exe by the
   * post-install PE scan (`peSteamDrm.ts`). 'ceg' means the exe carries
   * Steam CEG resources, which only a Windows Steam client can serve, so the
   * resolver routes the title to bottled Steam as known-bad 'drm-wrapped'.
   * Kept at the top level, NOT inside `scan`: `isScanVerdictNowCovered`
   * auto-clears `scan` on a shim export-set bump, and DRM is a property of
   * the exe that must survive that. Absent means not detected or never
   * checked; `writeBridgeDrmVerdict(appId, undefined)` removes the key. */
  drm?: 'ceg'
  /** 51-REVIEW WR-01: the cleared scan's own `interfaceVersions` pool,
   * retained by `clearBridgeScanVerdict`. For a target that already carries
   * an older GameLib shim, the persisted pool is the only version source
   * left (`placeShimForGame`'s header), so dropping it with `scan` would turn
   * every bare-accessor family into `<family>@unknown-version` on the next
   * launch. `launchBridgeGame` falls back to this when `scan` is absent.
   * Kept at the top level for the same reason as `drm`. */
  interfaceVersions?: Record<string, string>
  /** quick 261026-u1a: the cleared scan's non-empty `originalFingerprints`,
   * retained by `clearBridgeScanVerdict` so the next launch's lif backup
   * check does not take an unchanged `.gamelib-orig` for a new one (a missing
   * persisted fingerprint reads as changed, costing a rescan and shim
   * re-place per auto-clear). A fresher `scan.originalFingerprints` always
   * takes precedence. */
  originalFingerprints?: SteamBridgeScanVerdict['originalFingerprints']
}

// The `import type { SteamBottleConfig }` and its `export type { ... }`
// re-export that used to sit here were both dropped (260922-vzw): all three
// hits outside this module (src/common/types/electron_store.ts,
// src/common/types/ipc.ts, src/common/types/steam.ts) import
// `SteamBottleConfig` directly from `common/types/steam` (the original
// declaration), never from this re-export, and this file itself never
// referenced the type beyond that re-export.
export {
  configStore,
  steamLibraryStore,
  steamMetadataStore,
  steamSyncStore,
  steamPendingAdoptionStore,
  steamBottleConfigStore
}
