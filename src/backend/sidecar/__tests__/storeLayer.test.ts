/**
 * Store layer coverage suite (Phase 29 Plan 04 — Task 3).
 *
 * Proves the real store layer end to end:
 *   - `round-trip` (REQ-29-01 / D-02 / D-13): every `ValidStoreName` (minus the
 *     one documented dead entry) plus the four D-13 cache-store names
 *     construct in the sidecar process and round-trip a probe value.
 *   - `allow-list` (REQ-29-04 / D-08): the fail-closed allow-list is enforced
 *     identically on the eager snapshot path AND the lazy fetch path, by
 *     field name, for real secret fields.
 *   - `boot set` (D-03): the eager snapshot's key set is exactly
 *     `BOOT_SET_STORES` — no unbounded lazy-tier store leaks into it.
 *   - `round-trip` also carries a Phase 31 Plan 01 case (REQ-31-02/REQ-31-06):
 *     proves the settings WRITE path's global branch (`GlobalConfig.setSetting`/
 *     `writeConfig`'s `configStore.set('settings', ...)` call) persists
 *     end-to-end through this SAME real store layer, using the pre-existing
 *     `STORE_ALLOWLIST.configStore` entry for `'settings'` — no new allow-list
 *     entry needed. The per-game branch is documented (not exercised here,
 *     `settingsFlows.test.ts` already covers it against a mock) as bypassing
 *     the store layer entirely — a raw `graceful-fs` write, never a
 *     `getRegisteredStore()` target.
 *
 * TOKEN-WIPE SAFETY (non-negotiable): this suite drives REAL store
 * construction through the real `fileStore.ts`, so it MUST open with the
 * three-way mock block below — before ANY other import. A previous suite
 * wiped the developer's live Steam refresh token from the real
 * `~/Library/Application Support/GameLib` (fixed in commit 92c29a5e), and an
 * `afterAll` restore is not a safety net because Jest force-exits workers.
 * No test in this file may resolve a store path under the real user
 * profile. The `os` module mock's `homedir()` override below redirects
 * every store this suite touches to a disposable, per-process tmp
 * directory, distinct from every other suite's own disposable directory
 * (suffixed `storelayer` so it never collides with `skeletonflows`/
 * `bootstrap`/etc.'s own tmp homes when tests run in parallel workers).
 *
 * `electron`/`electron-store` are pointed at the REAL sidecar shims
 * (`electronStub.ts`/`fileStore.ts`) the same way `skeletonFlows.test.ts`
 * does — Jest's own manual mocks for these node_modules packages
 * (`src/backend/__mocks__/electron.ts` / `.../electron-store.ts`) are
 * auto-applied to EVERY backend test before Node's `Module._load` (which
 * `bootstrap.ts`'s own hook patches) is ever consulted, so this suite must
 * override Jest's resolution directly to exercise the real store-layer
 * code under test rather than the generic fixtures.
 */

jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-storelayer-test-home-${process.pid}`)
  }
})

jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('backend/store_backend', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── backend/utils mock — no real on-disk Steam install to scan in CI ────────
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn()
}))

// ── backend/constants/environment mock — deterministic non-mac branch ───────
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))

// ── SteamUser mock — no real network client construction ────────────────────
jest.mock('../../storeManagers/steam/user')

// ── Imports (after mocks) ────────────────────────────────────────────────────
import {
  getRegisteredStore,
  TypeCheckedStoreBackend
} from '../../electron_store'
import { ensureStoresRegistered } from '../storeRegistration'
import { handlerRegistry } from '../electronStub'
import CacheStore from '../../cache'
import { BOOT_SET_STORES, STORE_ALLOWLIST } from 'common/types/storePolicy'
import {
  STORE_SNAPSHOT_CHANNEL,
  STORE_FETCH_CHANNEL
} from 'common/types/sidecarTransport'

// Importing '../handlers' registers every invoke handler (including the
// store-layer ones under test) onto electronStub's `handlerRegistry`, and
// its own module-scope call to `registerSteamFlows()` /
// `ensureStoresRegistered()` constructs every store this suite exercises —
// the same real, unmodified code path production runs.
import '../handlers'

import { configStore as steamConfigStore } from '../../storeManagers/steam/electronStores'
import { configStore as humbleConfigStore } from '../../humble/electronStores'

/**
 * Narrow escape hatch for probing an arbitrary key on a `TypeCheckedStoreBackend`
 * instance. The real class's `get`/`set` are intentionally over-constrained by
 * `StoreStructure[Name]` (correct for production call sites) — a cross-cutting
 * coverage probe needs a key no store's shape declares, so this interface
 * relaxes only the TEST's view of the same runtime object; the underlying
 * implementation invoked is the real, unmodified `TypeCheckedStoreBackend`.
 */
interface ProbeableStore {
  set(key: string, value: unknown): void
  get(key: string, defaultValue?: unknown): unknown
  get_nodefault(key: string): unknown
  delete(key: string): void
  raw_store: Record<string, unknown>
}

function asProbeable(instance: unknown): ProbeableStore {
  return instance as ProbeableStore
}

/** Invokes the real registered `sidecar:store-snapshot` handler directly off the recorder. */
async function invokeStoreSnapshot(): Promise<Record<string, unknown>> {
  const handler = handlerRegistry.get(STORE_SNAPSHOT_CHANNEL)
  if (!handler) {
    throw new Error(
      `${STORE_SNAPSHOT_CHANNEL} handler was not registered by ../handlers`
    )
  }
  return (await handler(undefined)) as Record<string, unknown>
}

/** Invokes the real registered `sidecar:store-fetch` handler directly off the recorder. */
async function invokeStoreFetch(
  storeName: string
): Promise<Record<string, unknown>> {
  const handler = handlerRegistry.get(STORE_FETCH_CHANNEL)
  if (!handler) {
    throw new Error(
      `${STORE_FETCH_CHANNEL} handler was not registered by ../handlers`
    )
  }
  return (await handler(undefined, storeName)) as Record<string, unknown>
}

beforeAll(() => {
  // Idempotent — ../handlers already triggered this at import time; calling
  // it again here documents the dependency explicitly for this suite and
  // costs nothing (the module-level `registered` guard short-circuits).
  ensureStoresRegistered()
})

describe('round-trip', () => {
  // Hardcoded literal array of ALL 21 `ValidStoreName` strings MINUS the two
  // documented dead entries below — adding a store to `StoreStructure`
  // without covering it here FAILS this suite (it.each asserts each
  // resolves).
  const ALL_VALID_STORE_NAMES = [
    'configStore',
    'wineDownloaderInfoStore',
    'gogInstalledGamesStore',
    'zoomInstalledGamesStore',
    'timestampStore',
    // 'fontsStore' — permitted exclusion #1 (29-RESEARCH Pitfall 2): zero
    // construction sites anywhere in the backend, a dead `StoreStructure`
    // entry. Do NOT widen this exclusion list to make a failing case pass —
    // a missing store here means the registration (storeRegistration.ts) or
    // the D-15 extraction is wrong, not that the store should be skipped.
    'gogConfigStore',
    'zoomConfigStore',
    'steamConfigStore',
    'steamBottleConfigStore',
    'nileConfigStore',
    'humbleConfigStore',
    'sideloadedStore',
    'downloadManager',
    'gogSyncStore',
    // 'zoomSyncStore' — permitted exclusion #2, discovered by THIS suite
    // (not by 29-RESEARCH): a repo-wide search finds zero construction
    // sites anywhere for it, unlike its real, constructed sibling
    // `gogSyncStore`. Declared in `StoreStructure` but the Zoom store
    // manager never implemented an equivalent sync-timestamps feature —
    // same disposition as `fontsStore`, documented identically in
    // storeRegistration.ts.
    'gogPrivateBranches',
    // 'wikigameinfo' is NOT excluded — see the cache-backed round-trip
    // block below. It IS a `ValidStoreName`, but `wiki_game_info/
    // electronStore.ts` constructs it as a `CacheStore`, not a
    // `TypeCheckedStoreBackend`, so `getRegisteredStore()` can never
    // resolve it — it round-trips through the same mechanism as the D-13
    // cache stores instead, immediately below.
    //
    // uploadedLogs is NOT excluded — plan 29-02 extracted it into its own
    // thin electronStores.ts module for exactly this reason: it must
    // round-trip like every other store.
    'uploadedLogs',
    'migrationsStore',
    'gameOverridesStore'
  ] as const

  it.each(ALL_VALID_STORE_NAMES)(
    '%s resolves via getRegisteredStore() and round-trips a probe value',
    (name) => {
      const instance = asProbeable(getRegisteredStore(name))
      expect(instance).toBeDefined()

      const probeValue = `__gsdProbe-value-${name}`
      instance.set('__gsdProbe', probeValue)
      expect(instance.get('__gsdProbe', undefined)).toBe(probeValue)
      expect(instance.raw_store.__gsdProbe).toBe(probeValue)

      instance.delete('__gsdProbe')
      expect(instance.get_nodefault('__gsdProbe')).toBeUndefined()
    }
  )

  // D-13's five dynamically-named CacheStore names that are part of the
  // synchronous boot read path even though they are not `ValidStoreName`s,
  // PLUS `wikigameinfo` (a `ValidStoreName` that is nonetheless constructed
  // as a `CacheStore` in the real backend — see the comment above) —
  // round-tripped through the REAL backend/cache.ts CacheStore class (D-11:
  // cache.ts is unmodified and rides the Module._load substitution).
  const CACHE_BACKED_STORE_NAMES = [
    'legendary_library',
    'gog_library',
    'nile_library',
    'zoom_library',
    'steam_library',
    'wikigameinfo'
  ] as const

  it.each(CACHE_BACKED_STORE_NAMES)(
    '%s (cache-backed store) round-trips a probe value through the real backend/cache.ts CacheStore',
    (name) => {
      // Indefinite lifespan (null), matching how each store's own
      // electronStores.ts module constructs its `libraryStore` — a fresh
      // `CacheStore` instance at the SAME filename resolves through
      // fileStore.ts's D-14 path-keyed cell, so this reads/writes the
      // identical underlying data as the instance storeRegistration.ts (or,
      // for wikigameinfo, wiki_game_info/electronStore.ts) already
      // constructed.
      const cache = new CacheStore<string, '__gsdProbe'>(name, null)

      const probeValue = `probe-${name}`
      cache.set('__gsdProbe', probeValue)
      expect(cache.get('__gsdProbe')).toBe(probeValue)

      cache.delete('__gsdProbe')
      expect(cache.get('__gsdProbe')).toBeUndefined()
    }
  )

  // Phase 31 Plan 01 (REQ-31-02/REQ-31-06): proves the settings WRITE path's
  // GLOBAL branch persists end-to-end through THIS real store layer. Both
  // `GlobalConfig.setSetting()` (config.ts:387-388) and `writeConfig()`'s
  // global branch (utils.ts:1636-1639) call `configStore.set('settings',
  // {...})` on the SAME registered `configStore` instance this suite's own
  // generic `configStore` probe (above) already resolves via
  // `getRegisteredStore()` — this case additionally proves the SPECIFIC
  // `'settings'` field name round-trips through the fetch/snapshot read
  // paths (the same paths `requestAppSettings`'s underlying store-backed
  // reads would use), using the real, pre-existing `STORE_ALLOWLIST` entry.
  it("the settings write path's global branch ('settings' field) round-trips through the real configStore allow-list — no new allow-list entry needed", async () => {
    // Checklist step 4 confirmed a no-op this phase (31-PATTERNS.md item 5):
    // 'settings' is ALREADY in STORE_ALLOWLIST.configStore — this suite does
    // NOT add a new entry, it only asserts the pre-existing one still covers
    // the write path's global branch.
    expect(STORE_ALLOWLIST.configStore).toContain('settings')

    const configStoreInstance = asProbeable(getRegisteredStore('configStore'))
    const probeSettings = { maxWorkers: 7, language: 'fr' }

    // The exact write shape GlobalConfig.setSetting()/writeConfig()'s global
    // branch performs.
    configStoreInstance.set('settings', probeSettings)

    try {
      const fetched = await invokeStoreFetch('configStore')
      expect(fetched.settings).toEqual(probeSettings)

      const snapshot = await invokeStoreSnapshot()
      expect(snapshot.configStore).toMatchObject({ settings: probeSettings })
    } finally {
      configStoreInstance.delete('settings')
    }
  })

  // Phase 31 Plan 01 (REQ-31-06): the per-game branch (`GameConfig.flush()`/
  // `writeToFile()`, game_config.ts:145-146) was NEVER part of the
  // `electron-store`/`STORE_ALLOWLIST` abstraction to begin with — it is a
  // raw `graceful-fs writeFileSync(join(gamesConfigPath, appName + '.json'))`
  // (31-RESEARCH.md "Write-Path Mechanics"). Confirmed here by construction:
  // an arbitrary appName is never a `ValidStoreName`, so it can never resolve
  // through this suite's own `getRegisteredStore()` — the same registry the
  // global branch's `configStore` write above DOES resolve through. This is
  // the in-repo record of checklist step 4 being a confirmed no-op for the
  // per-game branch too, rather than a silently-skipped step.
  it('the per-game write path never routes through getRegisteredStore() — it was never part of the store-layer abstraction', () => {
    expect(getRegisteredStore('some-arbitrary-appName-999001')).toBeUndefined()
  })
})

describe('allow-list', () => {
  const probeSteamConfig = asProbeable(steamConfigStore)
  const probeHumbleConfig = asProbeable(humbleConfigStore)

  beforeEach(() => {
    probeSteamConfig.set(
      'refreshToken',
      'super-secret-should-never-leave-the-sidecar'
    )
    probeSteamConfig.set('userData', {
      username: 'gsd-tester',
      steamId: 'STEAMID_GSD'
    })
    probeHumbleConfig.set('csrfToken', 'csrf-secret-should-never-leave')
    probeHumbleConfig.set('sessionCookie', 'session-secret-should-never-leave')
    probeHumbleConfig.set('isLoggedIn', true)
  })

  afterEach(() => {
    probeSteamConfig.delete('refreshToken')
    probeSteamConfig.delete('userData')
    probeHumbleConfig.delete('csrfToken')
    probeHumbleConfig.delete('sessionCookie')
    probeHumbleConfig.delete('isLoggedIn')
  })

  it('excludes steamConfigStore.refreshToken from the eager snapshot while userData passes through', async () => {
    const snapshot = await invokeStoreSnapshot()

    expect(snapshot.steamConfigStore).toMatchObject({
      userData: { username: 'gsd-tester', steamId: 'STEAMID_GSD' }
    })
    expect(snapshot.steamConfigStore).not.toHaveProperty('refreshToken')
  })

  it('excludes humbleConfigStore.csrfToken and sessionCookie from the eager snapshot while isLoggedIn passes through', async () => {
    const snapshot = await invokeStoreSnapshot()

    expect(snapshot.humbleConfigStore).toMatchObject({ isLoggedIn: true })
    expect(snapshot.humbleConfigStore).not.toHaveProperty('csrfToken')
    expect(snapshot.humbleConfigStore).not.toHaveProperty('sessionCookie')

    // Assert NONE of the three secret fields leak into ANY store's payload
    // in the eager snapshot, by name — not merely for the two stores above.
    for (const payload of Object.values(snapshot)) {
      expect(payload).not.toHaveProperty('refreshToken')
      expect(payload).not.toHaveProperty('csrfToken')
      expect(payload).not.toHaveProperty('sessionCookie')
    }
  })

  it('excludes csrfToken from the lazy fetch path identically to the eager path', async () => {
    const fetched = await invokeStoreFetch('humbleConfigStore')

    expect(fetched).toMatchObject({ isLoggedIn: true })
    expect(fetched).not.toHaveProperty('csrfToken')
    expect(fetched).not.toHaveProperty('sessionCookie')
  })

  it('excludes refreshToken from the lazy fetch path identically to the eager path', async () => {
    const fetched = await invokeStoreFetch('steamConfigStore')

    expect(fetched).toMatchObject({
      userData: { username: 'gsd-tester', steamId: 'STEAMID_GSD' }
    })
    expect(fetched).not.toHaveProperty('refreshToken')
  })

  it('never PUSHES a secret field to the renderer when the sidecar itself writes one', async () => {
    // The snapshot/fetch paths above are filtered by `filterStoreSnapshot()`. The
    // store-change PUSH path is a third way into the renderer's snapshot, and it was
    // opened by the sidecar-write notification fix
    // (.planning/debug/gog-login-ui-never-updates.md).
    //
    // `applyStoreWrite` validates renderer-driven writes against `isWritableStoreField`
    // BEFORE writing, so its pushes were already safe. The store classes have no such
    // gate — they write whatever the backend hands them, secrets included. Without the
    // allow-list check in `pushStoreChanged`, every `steamConfigStore.set('refreshToken',
    // …)` in the real app would have shipped that token straight into the renderer's
    // in-memory snapshot, defeating `filterStoreSnapshot()` through a side door.
    //
    // This suite's own `beforeEach` writes three real secret fields through the real
    // store layer, so simply installing the real notifier and watching the wire is a
    // faithful end-to-end exercise of that path.
    const sidecarRpc = await import('../sidecarRpc')
    const { registerStoreWriteHandlers } = await import('../storeWriteHandlers')

    const pushSpy = jest
      .spyOn(sidecarRpc, 'pushFrontendMessage')
      .mockImplementation(() => undefined)

    try {
      // Idempotent; installs the real `pushStoreChanged` as the store-change notifier.
      registerStoreWriteHandlers()

      probeSteamConfig.set('refreshToken', 'leak-canary-refresh-token')
      probeHumbleConfig.set('csrfToken', 'leak-canary-csrf')
      probeHumbleConfig.set('sessionCookie', 'leak-canary-session')
      // A non-secret write on the same stores, to prove the guard is discriminating
      // rather than simply muting the channel.
      probeHumbleConfig.set('isLoggedIn', true)

      const storeChangedPayloads = pushSpy.mock.calls
        .filter(([channel]) => channel === 'storeChanged')
        .map(([, payload]) => payload as { key: string; value?: unknown })

      const pushedKeys = storeChangedPayloads.map((p) => p.key)
      expect(pushedKeys).not.toContain('refreshToken')
      expect(pushedKeys).not.toContain('csrfToken')
      expect(pushedKeys).not.toContain('sessionCookie')

      // By value too — a secret must not ride along inside some other field's payload.
      const serialized = JSON.stringify(storeChangedPayloads)
      expect(serialized).not.toContain('leak-canary-refresh-token')
      expect(serialized).not.toContain('leak-canary-csrf')
      expect(serialized).not.toContain('leak-canary-session')

      // The allow-listed field DID go out — otherwise this test would pass just as well
      // against a completely broken channel.
      expect(pushedKeys).toContain('isLoggedIn')
    } finally {
      pushSpy.mockRestore()
    }
  })

  it('rejects a path-traversal store name without throwing, returning {}', async () => {
    const result = await invokeStoreFetch('../../etc/passwd')
    expect(result).toEqual({})
  })

  it('rejects an unrecognized store name without throwing, returning {}', async () => {
    const result = await invokeStoreFetch('not_a_real_store')
    expect(result).toEqual({})
  })
})

describe('boot set', () => {
  it('the eager snapshot key set equals BOOT_SET_STORES exactly', async () => {
    const snapshot = await invokeStoreSnapshot()
    expect(Object.keys(snapshot).sort()).toEqual([...BOOT_SET_STORES].sort())
  })

  it('excludes the unbounded lazy-tier stores from the eager snapshot', async () => {
    const snapshot = await invokeStoreSnapshot()
    expect(snapshot).not.toHaveProperty('wikigameinfo')
    expect(snapshot).not.toHaveProperty('uploadedLogs')
    expect(snapshot).not.toHaveProperty('timestampStore')
    expect(snapshot).not.toHaveProperty('downloadManager')
  })
})

/**
 * WR-08 REGRESSION (Phase 29 code review): `TypeCheckedStoreBackend`'s constructor
 * unconditionally did `storeRegistry.set(name, …)`, so a second construction under the
 * same `ValidStoreName` silently re-pointed every name-keyed dispatch — and therefore
 * the whole renderer-driven write path — at a different instance, with no warning.
 * Now that the registry is load-bearing for writes, first registration wins.
 */
describe('WR-08: duplicate store registration', () => {
  it('keeps the FIRST registered instance and reports the duplicate on stderr', () => {
    const first = getRegisteredStore('configStore')
    expect(first).toBeDefined()

    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    let lines: string[] = []
    try {
      const second = new TypeCheckedStoreBackend('configStore', {
        cwd: 'store'
      })
      lines = stderrSpy.mock.calls.map((call) => String(call[0]))
      expect(getRegisteredStore('configStore')).toBe(first)
      expect(getRegisteredStore('configStore')).not.toBe(second)
    } finally {
      stderrSpy.mockRestore()
    }

    expect(
      lines.some((line) =>
        line.includes("duplicate registration for 'configStore'")
      )
    ).toBe(true)
  })
})
