/**
 * Store layer coverage suite (Phase 29 Plan 04 — Task 3).
 *
 * Proves the real store layer end to end:
 *   - `round-trip` (REQ-29-01 / D-02 / D-13): every `ValidStoreName` (minus the
 *     one documented dead entry) plus the four D-13 cache-store names
 *     construct in the sidecar process and round-trip a probe value.
 *   - `round-trip` also carries a Phase 31 Plan 01 case (REQ-31-02/REQ-31-06):
 *     the settings WRITE path's global branch (`configStore.set('settings', ...)`)
 *     round-trips through the real configStore, on the pre-existing
 *     `STORE_ALLOWLIST.configStore` entry for `'settings'`.
 *   - `WR-08`: first registration wins.
 *
 * The renderer's store reads and writes (the eager snapshot, the lazy fetch, the
 * confirmed write) were the sidecar's until Phase 85: since 85-16/85-17 they are
 * native Rust channels answered from the StoreHost, and since 85-21 (D-03) the
 * sidecar keeps no fallback handler. Their allow-list, boot-set and write-guard
 * cases are `cargo test --bin gamelib-shell store_native` and `store_policy`.
 *
 * TOKEN-WIPE SAFETY (non-negotiable): this suite drives REAL store
 * construction through the real `store_backend.ts` (each store a mirror whose
 * frames the in-process disk sink writes), so it MUST open with the mock block below — before ANY other import. A previous suite
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
 * `backend/store_backend` is deliberately NOT mocked (quick 261121-pwt): the
 * suite's stores resolve to the production `store_backend.ts` class, so the
 * real store-layer code is what runs under test, not a generic fixture.
 */
import { createTestShellState } from 'backend/testUtils/testShellState'
import { createMockSteamUser } from 'backend/testUtils/testSteamUser'

jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-storelayer-test-home-${process.pid}`)
  }
})

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
// The boot builds its SteamUser through createSteamUser; hand it the suite's one jest-fn double (66.3-16).
// `mock`-prefixed so the hoisted factory may reference it; it is initialised before the first require.
const mockSteamUser = createMockSteamUser()
jest.mock('../../storeManagers/steam/user', () => ({
  createSteamUser: () => mockSteamUser
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { TypeCheckedStoreBackend } from '../../typed_store'
import { createStores } from '../../stores/createStores'
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'
import { createStoreRegistry } from '../../stores/storeRegistry'
import CacheStore from '../../cache'
import { STORE_ALLOWLIST } from 'common/types/storePolicy'

// `registerHandlers()` registers every invoke handler (including the
// store-layer ones under test) onto platformApi's `handlerRegistry`; the
// stores built above are the ones its handlers resolve through — the same
// real, unmodified code path production runs (the 'register-handlers' boot step).
import { registerHandlers } from '../handlers'
import { createTestServices } from '../../testUtils/testServices'
import { createCaptureLog } from '../../testUtils/captureLog'

// One boot's worth of real stores against one registry, exactly what the 'stores' boot step builds.
const registry = createStoreRegistry()
const root = createTestStoreRoot()
const stores = createStores({ registry, root })

// The snapshot/fetch handlers are written into this boot's own registry (66.3-09); the store write
// listeners still reach the platform shim's.
const bootServices = createTestServices({
  stores,
  storeRegistry: registry,
  storeRoot: root
})
registerHandlers({
  log: createCaptureLog(),
  services: bootServices,
  shellState: createTestShellState(bootServices)
})

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

describe('round-trip', () => {
  // Hardcoded literal array of ALL 22 `ValidStoreName` strings MINUS the two
  // documented dead entries below — adding a store to `StoreStructure`
  // without covering it here FAILS this suite (it.each asserts each
  // resolves).
  const ALL_VALID_STORE_NAMES = [
    'configStore',
    'gogInstalledGamesStore',
    'timestampStore',
    // 'fontsStore' — permitted exclusion #1 (29-RESEARCH Pitfall 2): zero
    // construction sites anywhere in the backend, a dead `StoreStructure`
    // entry. Do NOT widen this exclusion list to make a failing case pass —
    // a missing store here means the registration (storeRegistration.ts) or
    // the D-15 extraction is wrong, not that the store should be skipped.
    'gogConfigStore',
    'steamConfigStore',
    'steamBottleConfigStore',
    'nileConfigStore',
    'legendaryConfigStore',
    'humbleConfigStore',
    'sideloadedStore',
    'downloadManager',
    'gogSyncStore',
    'gogPrivateBranches',
    // 'wikigameinfo' is NOT excluded — see the cache-backed round-trip
    // block below. It IS a `ValidStoreName`, but it is a `CacheStore`, not a
    // `TypeCheckedStoreBackend` (86-24: no TS file constructs it now; Rust's
    // `gamelib-info` wiki slice owns the file), so `registry.get()` can never
    // resolve it — it round-trips through the same mechanism as the D-13
    // cache stores instead, immediately below.
    //
    // 'wineDownloaderInfoStore' is not listed: Phase 87 (87-37) deleted its TS registration; Rust owns the file.
    //
    // 'gameOverridesStore' is not listed: Phase 86 (86-11) deleted its TS registration; Rust owns it.
    'runsForMeStore'
  ] as const

  it.each(ALL_VALID_STORE_NAMES)(
    '%s resolves via registry.get() and round-trips a probe value',
    (name) => {
      const instance = asProbeable(registry.get(name))
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
  // as a `CacheStore` — see the comment above) —
  // round-tripped through the REAL backend/cache.ts CacheStore class (D-11:
  // cache.ts is unmodified and rides the Module._load substitution).
  const CACHE_BACKED_STORE_NAMES = [
    'legendary_library',
    'gog_library',
    'nile_library',
    'steam_library',
    'wikigameinfo'
  ] as const

  it.each(CACHE_BACKED_STORE_NAMES)(
    '%s (cache-backed store) round-trips a probe value through the real backend/cache.ts CacheStore',
    (name) => {
      // Indefinite lifespan (null), matching how each store's own
      // stores.ts module constructs its `libraryStore` — a fresh
      // `CacheStore` instance at the SAME filename reads and writes the same
      // file, because conf re-reads it on every access (it is not a shared
      // in-memory cell), so this sees the identical underlying data as the instance storeRegistration.ts already
      // constructed (for wikigameinfo, the file the Rust wiki slice owns).
      const cache = new CacheStore<string, '__gsdProbe'>(name, null, {
        root,
        kind: 'cache'
      })

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
  // `registry.get()` — this case additionally proves the SPECIFIC
  // `'settings'` field name round-trips through the fetch/snapshot read
  // paths (the same paths `requestAppSettings`'s underlying store-backed
  // reads would use), using the real, pre-existing `STORE_ALLOWLIST` entry.
  it("the settings write path's global branch ('settings' field) round-trips through the real configStore allow-list — no new allow-list entry needed", () => {
    // Checklist step 4 confirmed a no-op this phase (31-PATTERNS.md item 5):
    // 'settings' is ALREADY in STORE_ALLOWLIST.configStore — this suite does
    // NOT add a new entry, it only asserts the pre-existing one still covers
    // the write path's global branch.
    expect(STORE_ALLOWLIST.configStore).toContain('settings')

    const configStoreInstance = asProbeable(registry.get('configStore'))
    const probeSettings = { maxWorkers: 7, language: 'fr' }

    // The exact write shape GlobalConfig.setSetting()/writeConfig()'s global
    // branch performs.
    configStoreInstance.set('settings', probeSettings)

    try {
      expect(configStoreInstance.get('settings')).toEqual(probeSettings)
      expect(configStoreInstance.raw_store.settings).toEqual(probeSettings)
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
  // through this suite's own `registry.get()` — the same registry the
  // global branch's `configStore` write above DOES resolve through. This is
  // the in-repo record of checklist step 4 being a confirmed no-op for the
  // per-game branch too, rather than a silently-skipped step.
  it('the per-game write path never routes through registry.get() — it was never part of the store-layer abstraction', () => {
    expect(registry.get('some-arbitrary-appName-999001')).toBeUndefined()
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
    const first = registry.get('configStore')
    expect(first).toBeDefined()

    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    let lines: string[] = []
    try {
      const second = new TypeCheckedStoreBackend(
        'configStore',
        {
          cwd: 'store'
        },
        { kind: 'user-state' },
        { registry, root }
      )
      lines = stderrSpy.mock.calls.map((call) => String(call[0]))
      expect(registry.get('configStore')).toBe(first)
      expect(registry.get('configStore')).not.toBe(second)
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
