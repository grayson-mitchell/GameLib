/**
 * Tauri-path store access policy — single source of truth for D-08 (fail-closed
 * allow-list) and D-09/D-13 (declared boot/lazy tier partition).
 *
 * D-08: BEFORE this module existed, the "which store fields may the renderer read"
 * rule was a DENY-list, hand-duplicated in three places: `src/preload/tauriTransport.ts`
 * (`SECRET_STORE_KEYS`), `src/preload/api/misc.ts` (its own `SECRET_STORE_KEYS` copy),
 * and a third one-off hand-strip of `refreshToken` in `src/backend/sidecar/handlers.ts`.
 * That triplication is exactly how `humbleConfigStore.csrfToken` — documented on
 * `StoreStructure` itself as "main-process-only, never in any sendFrontendMessage
 * payload" — slipped past every one of those three sites (none of them named it).
 * Flipping the model to a single ALLOW-list closes that class of bug by construction:
 * a newly added secret field is excluded by DEFAULT unless someone deliberately adds
 * it to `STORE_ALLOWLIST`, rather than leaking until someone remembers to deny-list it.
 *
 * IMPORTANT: this allow-list governs the TAURI PATH ONLY. `src/preload/api/misc.ts`'s
 * Electron-branch deny-list (`SECRET_STORE_KEYS` there, gating `storeGet`/`storeHas`
 * under `!isTauri()`) stays BYTE-IDENTICAL and is deliberately left divergent from this
 * module until the Electron cutover (Phase 35) — see the Phase 28 D-11 precedent
 * (28-04/28-05 SUMMARY.md) for why a documented, commented divergence between the two
 * paths is the correct interim state rather than a bug to "fix" by unifying them early.
 * `tauriTransport.ts`'s own `SECRET_STORE_KEYS` copy is superseded by this module in a
 * later plan (29-05) — it is not touched here.
 *
 * This module must be importable from BOTH the sidecar (which may never import
 * `electron`) and the renderer preload bundle. It therefore:
 *   - imports ONLY the `ValidStoreName` TYPE from './electron_store' (type-only import,
 *     erased at compile time — no runtime coupling to electron-store);
 *   - has zero imports of Electron, `fs`, or `path`;
 *   - has zero side effects — every export below is pure data or a pure function.
 */
import type { ValidStoreName } from './electron_store'

/**
 * Per-store allow-list of TOP-LEVEL field names the renderer may read via the Tauri
 * store snapshot/fetch/set paths. Every one of `StoreStructure`'s 21 keys
 * (src/common/types/electron_store.ts) has an entry here.
 *
 * A value of `'*'` means the store's `StoreStructure` type is an open index signature
 * (e.g. `timestampStore: { [K: string]: ... }`) — there is no closed field list to
 * enumerate, so every top-level key is allowed (subject to `DENIED_CACHE_STORES` for
 * dynamically-named cache stores, which are a different mechanism — see below).
 *
 * Exactly five fields are OMITTED from their store's array on purpose. These are the
 * secret / main-process-only fields verified against `StoreStructure`'s own comments:
 *
 *   - steamConfigStore.refreshToken   — safeStorage-encrypted 'steam:v1:' ciphertext;
 *     also `TOKEN_STORE_KEY === 'refreshToken'`
 *     (src/backend/storeManagers/steam/constants.ts:15). Never renderer-readable.
 *   - humbleConfigStore.sessionCookie — safeStorage-encrypted 'humble:v1:' ciphertext.
 *   - humbleConfigStore.csrfToken     — StoreStructure's own comment: "Main-process-only
 *     — never included in any sendFrontendMessage payload or HumbleAuthState." This is
 *     the exact field whose triple-duplicated deny-list omission motivated this module.
 *   - gogConfigStore.credentials      — `GOGLoginData` (access/refresh tokens).
 *   - zoomConfigStore.credentials     — `ZoomCredentials`.
 */
export const STORE_ALLOWLIST: Record<string, readonly string[] | '*'> = {
  configStore: [
    'userHome',
    'userInfo',
    'games',
    'theme',
    'zoomPercent',
    'contentFontFamily',
    'actionsFontFamily',
    'allTilesInColor',
    'titlesAlwaysVisible',
    'disableDialogBackdropClose',
    'disableAnimations',
    'language',
    'general-logs',
    'window-props',
    'settings',
    'skipVcRuntime',
    'showSnapWarning'
  ],
  wineDownloaderInfoStore: ['wine-releases'],
  gogInstalledGamesStore: ['installed'],
  zoomInstalledGamesStore: ['installed'],
  // Open index signature ({ [K: string]: { firstPlayed, lastPlayed, totalPlayed } }) —
  // no secret fields exist on this shape.
  timestampStore: '*',
  fontsStore: ['fonts'],
  // `credentials` (GOGLoginData) omitted — see header comment.
  gogConfigStore: ['userData', 'isLoggedIn'],
  // `credentials` (ZoomCredentials) omitted — see header comment.
  zoomConfigStore: ['isLoggedIn', 'username'],
  // `refreshToken` omitted — safeStorage-encrypted Steam session token, see header comment.
  steamConfigStore: ['isLoggedIn', 'userData'],
  // SteamBottleConfig (src/common/types/steam.ts:39) carries no secret fields — bottle
  // auth is opaque (D-04 / WR-02, 17-17), so there is nothing to redeem here.
  steamBottleConfigStore: [
    'bottleName',
    'wineVersion',
    'wineCrossoverBottle',
    'provisioned'
  ],
  nileConfigStore: ['userData'],
  // `sessionCookie` (safeStorage-encrypted 'humble:v1:' ciphertext) and `csrfToken`
  // (StoreStructure: "Main-process-only — never included in any sendFrontendMessage
  // payload or HumbleAuthState") are both omitted — see header comment.
  humbleConfigStore: ['isLoggedIn', 'userData', 'encryptionDegraded', 'expired'],
  sideloadedStore: ['games', 'installed'],
  downloadManager: ['queue', 'finished'],
  // Open index signatures — no secret fields exist on any of these shapes.
  gogSyncStore: '*',
  zoomSyncStore: '*',
  gogPrivateBranches: '*',
  wikigameinfo: '*',
  uploadedLogs: '*',
  migrationsStore: ['appliedMigrations'],
  gameOverridesStore: ['overrides']
}

/**
 * `CacheStore`s (src/backend/cache.ts, src/frontend/helpers/electronStores.ts) are NOT
 * `ValidStoreName`s — they are constructed with an arbitrary filename string through
 * `window.api.storeNew` (`{ cwd: 'store_cache', name: <filename>, clearInvalidConfig: true }`)
 * and carry dynamic, non-`StoreStructure` keys. They default to `'*'` (fully readable)
 * because their entries are ownership/library-cache data with no secret fields — EXCEPT
 * the one name listed in `DENIED_CACHE_STORES` below.
 */
export const CACHE_STORE_POLICY = '*' as const

/**
 * Cache store names that are denied wholesale from any renderer-visible snapshot, even
 * though `CACHE_STORE_POLICY` is `'*'` for cache stores in general.
 *
 * `humble_library` (29-RESEARCH.md § Open Question 4): its entries carry internal-only
 * `revealedKeyValue`/`keyindex` fields that `src/backend/humble/library.ts`'s `getKeys()`
 * projection strips before the renderer ever sees them. A raw snapshot read of this cache
 * store would bypass that projection and leak those internal-only fields. A denied cache
 * store yields an EMPTY object `{}` from `filterStoreSnapshot()` — the same behavior it
 * has under Tauri today (no store-fetch path exists for it yet).
 */
export const DENIED_CACHE_STORES: readonly string[] = ['humble_library']

/**
 * D-13: the four dynamically-named `CacheStore`s that are part of the synchronous boot
 * read path even though they are not `ValidStoreName`s. See `BOOT_SET_STORES` below.
 */
const BOOT_SET_CACHE_STORE_NAMES: readonly string[] = [
  'legendary_library',
  'gog_library',
  'nile_library',
  'zoom_library'
]

/** Recognized cache-store names — the boot-set four plus the denied one. */
const RECOGNIZED_CACHE_STORE_NAMES: readonly string[] = [
  ...BOOT_SET_CACHE_STORE_NAMES,
  ...DENIED_CACHE_STORES
]

/**
 * `isAllowedStoreField(storeName, key)` — FAIL CLOSED.
 *
 *   - An unknown store name (neither a key of `STORE_ALLOWLIST` nor a recognized
 *     cache-store name) returns `false`.
 *   - A store whose policy is `'*'` returns `true`, UNLESS the store name is in
 *     `DENIED_CACHE_STORES`, in which case it returns `false` regardless of key.
 *   - Otherwise, the key's FIRST dot-segment (`key.split('.')[0]`) must appear in the
 *     store's allow-list array. This preserves the old deny-list's
 *     `key === secret || key.startsWith(secret + '.')` behavior: a dot-notation subpath
 *     read of a secret (e.g. `refreshToken.foo`) is blocked exactly like a direct read,
 *     because `refreshToken` (the first segment) was never added to the allow-list.
 *   - An unrecognized key on a known, non-wildcard store also returns `false` (fail
 *     closed — the allow-list is exhaustive, not merely a block-list of known-bad names).
 */
export function isAllowedStoreField(storeName: string, key: string): boolean {
  if (DENIED_CACHE_STORES.includes(storeName)) {
    return false
  }

  const policy = STORE_ALLOWLIST[storeName]

  if (policy === undefined) {
    // Not a typed store — only a recognized (non-denied) cache store passes, and only
    // because CACHE_STORE_POLICY is '*'.
    return (
      RECOGNIZED_CACHE_STORE_NAMES.includes(storeName) &&
      !DENIED_CACHE_STORES.includes(storeName)
    )
  }

  if (policy === '*') {
    return true
  }

  const topLevelKey = key.split('.')[0]
  return policy.includes(topLevelKey)
}

/**
 * `filterStoreSnapshot(storeName, raw)` — returns a NEW object containing only the
 * entries of `raw` whose top-level key passes `isAllowedStoreField`. This is the ONE
 * function every snapshot handler, lazy-fetch handler, and renderer bridge read path
 * must call (T-29-11) — the policy is enforced once here, not re-implemented per call
 * site, so it cannot be applied in one path and forgotten in another.
 */
export function filterStoreSnapshot(
  storeName: string,
  raw: Record<string, unknown>
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {}
  for (const key of Object.keys(raw)) {
    if (isAllowedStoreField(storeName, key)) {
      filtered[key] = raw[key]
    }
  }
  return filtered
}

/**
 * D-09: the eager/lazy tier partition over the store universe. This partition is
 * DECLARED here (not derived from any runtime signal) for greppability — anyone reading
 * this file can see the full boot set and lazy set as literal lists. The anti-drift
 * guard against this declaration silently going stale as `StoreStructure` grows is
 * `storePolicy.test.ts`'s totality/disjointness assertions, NOT a runtime computation.
 *
 * D-13: the boot set includes the 11 typed stores that `GlobalState.tsx`'s constructor
 * / `GlobalStateV2.ts`'s zustand initializer read SYNCHRONOUSLY, BEFORE React mounts
 * (29-RESEARCH.md Finding 1), plus the four cache-store names that are also read
 * synchronously at that same boot point even though they are not `ValidStoreName`s.
 */
export const BOOT_SET_STORES: readonly string[] = [
  'configStore',
  'gogConfigStore',
  'gogInstalledGamesStore',
  'nileConfigStore',
  'zoomConfigStore',
  'zoomInstalledGamesStore',
  'steamConfigStore',
  'humbleConfigStore',
  'wineDownloaderInfoStore',
  'sideloadedStore',
  'gameOverridesStore',
  ...BOOT_SET_CACHE_STORE_NAMES
]

/** Every `ValidStoreName` not in `BOOT_SET_STORES` — hydrated lazily, on first fetch. */
export const LAZY_STORES: readonly string[] = [
  'steamBottleConfigStore',
  'timestampStore',
  'fontsStore',
  'downloadManager',
  'gogSyncStore',
  'zoomSyncStore',
  'gogPrivateBranches',
  'wikigameinfo',
  'uploadedLogs',
  'migrationsStore'
]

/** `BOOT_SET_STORES` ∪ `LAZY_STORES` — the full store universe this policy covers. */
export const STORE_UNIVERSE: readonly string[] = [
  ...BOOT_SET_STORES,
  ...LAZY_STORES
]

/**
 * Compile-time reminder: `BOOT_SET_STORES`/`LAZY_STORES` are declared as plain
 * `readonly string[]`, not typed against `ValidStoreName`, because `BOOT_SET_STORES`
 * also carries the four non-`ValidStoreName` cache-store names (D-13). The type import
 * above exists so this module (and any consumer) can still reference `ValidStoreName`
 * where a stricter type is useful, without forcing that constraint onto the mixed
 * boot-set list.
 */
export type { ValidStoreName }
