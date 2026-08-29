/**
 * End-to-end wiring test for the sidecar's curated settings-read channels
 * (Phase 30 Plan 06 — gap closure for Gap 2 / UAT Test 8).
 *
 * Drives the REAL sidecar RPC server in-process (`installFlows.test.ts`'s own
 * real-shim black-box pattern — the shims under test are the actual
 * electronStub.ts/fileStore.ts modules, unmocked) against injected
 * `stream.PassThrough` pairs.
 *
 * **GAP FIX precedent (2026-07-22, see skeletonFlows.test.ts's own header):**
 * this suite's config directory is NOT the real OS config directory. The
 * `jest.mock('os', ...)` below overrides `homedir()` to a disposable
 * per-process tmp directory so the real electronStub/fileStore CODE runs
 * (preserving this suite's fidelity), while the location it reads/writes can
 * never be the developer's real config directory.
 *
 * `jest.mock('electron', ...)` / `jest.mock('backend/store_backend', ...)` below
 * point Jest's OWN module resolution at electronStub.ts/fileStore.ts
 * directly — see skeletonFlows.test.ts's header for why this is necessary.
 *
 * Mocked only at the boundaries `settingsFlowRegistration.ts`'s own module
 * docstring names:
 *   - `backend/config` (`GlobalConfig.get`) — mirrors
 *     `installFlows.test.ts`'s own strategy: a real `GlobalConfig.get()` call
 *     writes a fresh `config.json` to disk via `graceful-fs`, which needs its
 *     parent directory to already exist (real Electron creates it at
 *     app-start via `makeSureFoldersExist`). A plain
 *     `{ getSettings: () => settings }` stub avoids that disk dependency.
 *   - `backend/game_config` (`GameConfig.get`) — same rationale, a
 *     `{ getSettings: () => settings }` stub avoids GameConfigV0's own
 *     on-disk read/migration path.
 *   - `backend/storeManagers` (`libraryManagerMap`) — a minimal stub whose
 *     `steam.getGame` is a jest.fn(), so a steam-routed request never reaches
 *     the real SteamLibraryManager/SteamGame construction.
 *   - `backend/storeManagers/steam/state` (`library`) — the in-memory Steam
 *     library Map is swapped for a plain `Map` this suite controls directly,
 *     so `steamLibrary.has(appName)` is a deterministic per-test fixture, not
 *     whatever the real Steam library happens to contain.
 *
 * Every other module in the registration/transport/store path
 * (`settingsFlowRegistration.ts`, `handlers.ts`, `sidecarRpc.ts`,
 * `bootstrap.ts`, `electronStub.ts`, `fileStore.ts`) runs for real,
 * unmodified.
 */

// ── os — GAP FIX precedent: redirect homedir() to a disposable per-process
// tmp directory so this suite can never touch a developer's real config
// directory ──────────────────────────────────────────────────────────────
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(
        actual.tmpdir(),
        `gamelib-settingsflows-test-home-${process.pid}`
      )
  }
})

// ── electron / electron-store — route Jest's own module resolution at the
// REAL sidecar shims (see module docstring above) ───────────────────────────
jest.mock('backend/store_backend', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── axios — fix/steam-native-install-stability (33-05 live-gate gap): `init()` now wires
// the REAL `initOnlineMonitor()` (backend/online_monitor.ts), which -- now that the real
// electronStub's `net.isOnline()` returns `true` (mocked above) -- immediately calls the real
// `pingSites()`, a live `axios.head()` against github/epic/gog/cloudflare. Mocked so this suite
// (which drives the real, unmocked RPC/handler graph) never makes a real network call.
jest.mock('axios', () => {
  const mockInstance = {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    head: jest.fn(() => Promise.resolve({ status: 200 }))
  }
  return {
    __esModule: true,
    default: {
      head: jest.fn(() => Promise.resolve({ status: 200 })),
      create: jest.fn(() => mockInstance)
    }
  }
})

// ── backend/constants/environment mock — pins a deterministic branch
// regardless of the host OS running this test (mirrors installFlows.test.ts) ─
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))

// ── backend/config mock — avoid a real on-disk config.json write while
// still exercising the real requestAppSettings handler body ─────────────────
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: jest.fn()
  }
}))

// ── backend/game_config mock — avoid GameConfigV0's own on-disk
// read/migration path while still exercising the real requestGameSettings
// non-steam fallback branch ──────────────────────────────────────────────────
jest.mock('backend/game_config', () => ({
  GameConfig: {
    get: jest.fn()
  }
}))

// ── backend/storeManagers mock — the steam-routed branch must never
// construct a real SteamLibraryManager/SteamGame; a plain jest.fn() proves
// the routing decision without any depot/PICS/filesystem involvement.
// `gog` (Phase 34.4 Plan 03) is a sibling stub, same shape, so the GOG
// private-branch handlers never construct a real GOGLibraryManager/GOGGame
// either — and so a not-called assertion on `steam.getGame` can prove the
// GOG-not-Steam classification (REQ-34.4-06) ─────────────────────────────────
jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    steam: {
      getGame: jest.fn()
    },
    gog: {
      getGame: jest.fn()
    }
  }
}))

// ── backend/storeManagers/steam/state mock — a plain Map this suite controls
// directly, so `steamLibrary.has(appName)` is a deterministic per-test
// fixture ────────────────────────────────────────────────────────────────────
jest.mock('../../storeManagers/steam/state', () => ({
  library: new Map()
}))

// ── backend/utils/systeminfo mock (Phase 31 Plan 01) — `getSystemInfo`
// (ported this plan) transitively shells out to several REAL subprocesses
// (helperBinaries' version-check execs, macOS's `sysctl`/`vm_stat` via
// getMemoryInfo, etc.) — a real, non-deterministic, platform-dependent
// dependency this unit suite must not carry (unmocked, this suite's real
// spawns raced past Jest's teardown / past `flush()`'s bounded wait window,
// "You are trying to `import` a file after the Jest environment has been
// torn down"). Mocked at this single boundary, exactly like the
// `backend/storeManagers`/`backend/storeManagers/steam/state` boundaries
// above — this suite proves the CHANNEL WIRING reaches the real
// `getSystemInfo` export, not the OS-probing internals underneath it ────────
jest.mock('backend/utils/systeminfo', () => ({
  getSystemInfo: jest.fn(),
  formatSystemInfo: jest.fn()
}))

// ── backend/utils/os/path mock (Phase 31 Plan 01) — `hasExecutable`
// (ported this plan) shells out to a real `which`/`where` subprocess via
// `child_process.spawn`. Mocked for the same determinism reason as
// `helperBinaries` above — this suite proves the CHANNEL WIRING reaches the
// real function, not the subprocess's own behavior ──────────────────────────
jest.mock('backend/utils/os/path', () => ({
  searchForExecutableOnPath: jest.fn(),
  hasExecutable: jest.fn().mockResolvedValue(true)
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { startSidecar, writeInvoke, writeSend } from './helpers/sidecarHarness'
import { GlobalConfig } from 'backend/config'
import { GameConfig } from 'backend/game_config'
import { libraryManagerMap } from 'backend/storeManagers'
import { library as steamLibrary } from '../../storeManagers/steam/state'
import { getSystemInfo as mockedGetSystemInfo } from 'backend/utils/systeminfo'
import { hasExecutable as mockedHasExecutable } from 'backend/utils/os/path'
import { UNPORTED_CHANNEL_MARKER } from 'common/types/sidecarTransport'
import type { AppSettings, GameSettings } from 'common/types'

const mockedGlobalConfigGet = GlobalConfig.get as jest.Mock
const mockedGameConfigGet = GameConfig.get as jest.Mock
const mockedSteamGetGame = libraryManagerMap.steam.getGame as jest.Mock
const mockedGogGetGame = libraryManagerMap.gog.getGame as jest.Mock

/**
 * Points the mocked GlobalConfig.get() at a fresh settings object, carrying
 * `setSetting`/`set`/`flush` spies alongside `getSettings` — Phase 31 Plan 01
 * extends this suite's write-path coverage (`setSetting`, `writeConfig`),
 * both of which reach these three additional methods on the real
 * `GlobalConfigV0` class.
 */
function mockAppSettings(partial: Partial<AppSettings>) {
  mockedGlobalConfigGet.mockReturnValue({
    getSettings: () => partial as AppSettings,
    setSetting: jest.fn(),
    set: jest.fn(),
    flush: jest.fn()
  })
}

/** Waits a couple of microtask/macrotask turns for async invoke handlers to resolve. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

describe('sidecar settings-read flows (Phase 30 Plan 06)', () => {
  beforeEach(() => {
    steamLibrary.clear()
    mockAppSettings({ language: 'en', enableSteamNativeInstall: false })
    mockedGameConfigGet.mockReset().mockReturnValue({
      getSettings: async () =>
        ({ wineVersion: { name: 'fallback' } }) as unknown as GameSettings,
      setSetting: jest.fn()
    })
    mockedSteamGetGame.mockReset().mockReturnValue({
      getSettings: async () =>
        ({ wineVersion: { name: 'steam-routed' } }) as unknown as GameSettings
    })
  })

  // Must-have 1: requestAppSettings resolves real (stubbed) GlobalConfig
  // settings, NOT the UNPORTED_CHANNEL_MARKER.
  it('requestAppSettings resolves ok:true with the real GlobalConfig settings, not the unported marker', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'app-settings-1', 'requestAppSettings', [])
    await flush()

    const response = frames.find((frame) => frame.id === 'app-settings-1') as
      | { ok: boolean; result?: unknown; error?: string }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.result).toMatchObject({
      language: 'en',
      enableSteamNativeInstall: false
    })
    expect(response?.error).toBeUndefined()
  })

  // Must-have 1b: requestGameSettings for a NON-steam appName reaches
  // GameConfig.get(appName).getSettings(), NOT the marker.
  it('requestGameSettings for a non-steam appName reaches GameConfig.get(appName).getSettings(), not the unported marker', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'game-settings-1', 'requestGameSettings', [
      'some-gog-app'
    ])
    await flush()

    const response = frames.find((frame) => frame.id === 'game-settings-1') as
      | { ok: boolean; result?: { wineVersion?: { name?: string } } }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.result).toMatchObject({
      wineVersion: { name: 'fallback' }
    })
    expect(mockedGameConfigGet).toHaveBeenCalledWith('some-gog-app')
    expect(mockedSteamGetGame).not.toHaveBeenCalled()
  })

  // requestGameSettings for a steam-library appName routes through
  // libraryManagerMap['steam'].getGame(appName).getSettings() instead of
  // GameConfig (main.ts:1012-1015 parity).
  it('requestGameSettings for a steam-library appName routes through the steam manager, not GameConfig', async () => {
    steamLibrary.set('999001', { title: 'Steam Routed Game' } as never)

    const { input, frames } = startSidecar()
    writeInvoke(input, 'game-settings-2', 'requestGameSettings', ['999001'])
    await flush()

    const response = frames.find((frame) => frame.id === 'game-settings-2') as
      | { ok: boolean; result?: { wineVersion?: { name?: string } } }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.result).toMatchObject({
      wineVersion: { name: 'steam-routed' }
    })
    expect(mockedSteamGetGame).toHaveBeenCalledWith('999001')
    expect(mockedGameConfigGet).not.toHaveBeenCalled()
  })

  // Invariant B guard: a still-unported DownloadDialog channel (e.g.
  // checkDiskSpace) STILL rejects carrying UNPORTED_CHANNEL_MARKER, and the
  // RPC loop keeps serving afterward (health resolves).
  //
  // UPDATED (Phase 34.3 Plan 01): `checkDiskSpace` — this test's original
  // example channel — is no longer unported. It is now registered for real
  // by `shellFilesFlowRegistration.ts` (REQ-34.3-02, `shellFilesFlows.test.ts`
  // covers its ported behavior). `getLegendaryVersion` substituted here as a
  // channel that plan did not touch and that stayed genuinely unported until
  // Phase 34.5.
  //
  // UPDATED AGAIN (Phase 34.5 Plan 07, REQ-34.5-06): `getLegendaryVersion` is
  // ALSO no longer unported — it is now registered for real by
  // `runnerMiscFlowRegistration.ts` (`runnerMiscFlows.test.ts` covers its
  // ported registration kind). `winetricksInstall` substitutes here as a
  // channel D-03 permanently DEFERS to Phase 34.6 (not merely unported by
  // this slice's own wave sequencing), so this test keeps proving the
  // invariant rather than asserting something Phase 34.5 deliberately made
  // false, and will not need a further substitution once plan 34.5-12 lands.
  it('Invariant B guard: winetricksInstall (deliberately unported, deferred to Phase 34.6) still rejects non-fatally, and the RPC loop keeps serving', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'disk-space-1', 'winetricksInstall', [])
    await flush()

    const diskSpaceResponse = frames.find(
      (frame) => frame.id === 'disk-space-1'
    ) as { ok: boolean; error?: string } | undefined
    expect(diskSpaceResponse?.ok).toBe(false)
    expect(diskSpaceResponse?.error).toContain(UNPORTED_CHANNEL_MARKER)

    writeInvoke(input, 'health-after-disk-space', 'health', [])
    await flush()
    const healthResponse = frames.find(
      (frame) => frame.id === 'health-after-disk-space'
    )
    expect(healthResponse).toMatchObject({
      id: 'health-after-disk-space',
      ok: true,
      result: 'ok'
    })
  })
})

describe('sidecar settings WRITE flows (Phase 31 Plan 01 — setSetting/writeConfig)', () => {
  beforeEach(() => {
    steamLibrary.clear()
    mockAppSettings({ language: 'en', enableSteamNativeInstall: false })
    mockedGameConfigGet.mockReset().mockReturnValue({
      getSettings: async () =>
        ({ wineVersion: { name: 'fallback' } }) as unknown as GameSettings,
      setSetting: jest.fn()
    })
    mockedSteamGetGame.mockReset().mockReturnValue({
      getSettings: async () =>
        ({ wineVersion: { name: 'steam-routed' } }) as unknown as GameSettings
    })
  })

  // Must-have: a Settings toggle persists under the sidecar — the global
  // branch. `setSetting` is a `send` (fire-and-forget) channel: there is no
  // response frame to inspect (31-RESEARCH.md Pitfall 2), so the only
  // meaningful assertion is that the underlying GlobalConfig.setSetting mock
  // was actually invoked with the right arguments.
  it('setSetting (send) for appName "default" reaches GlobalConfig.get().setSetting with (key, value)', async () => {
    const { input } = startSidecar()
    writeSend(input, 'set-setting-global-1', 'setSetting', [
      { appName: 'default', key: 'maxWorkers', value: 2 }
    ])
    await flush()

    const globalConfigInstance = mockedGlobalConfigGet() as {
      setSetting: jest.Mock
    }
    expect(globalConfigInstance.setSetting).toHaveBeenCalledWith(
      'maxWorkers',
      2
    )
  })

  // Must-have: a per-game Settings toggle persists under the sidecar — the
  // GameConfig branch. Mirrors the real UI ordering (useSettingsContext's
  // mount-time requestAppSettings/requestGameSettings always resolve before
  // any user-driven setSetting can fire) per 31-RESEARCH.md Pitfall 4's
  // ordering precondition, even though this suite's GameConfig.get() is
  // fully mocked (no real gamesConfigPath filesystem dependency to warm).
  it('setSetting (send) for a non-default appName reaches GameConfig.get(appName).setSetting with (key, value)', async () => {
    const { input } = startSidecar()
    writeInvoke(input, 'warm-app-settings-1', 'requestAppSettings', [])
    await flush()

    writeSend(input, 'set-setting-game-1', 'setSetting', [
      { appName: 'Game123', key: 'language', value: 'fr' }
    ])
    await flush()

    expect(mockedGameConfigGet).toHaveBeenCalledWith('Game123')
    const gameConfigInstance = mockedGameConfigGet('Game123') as {
      setSetting: jest.Mock
    }
    expect(gameConfigInstance.setSetting).toHaveBeenCalledWith('language', 'fr')
  })

  // Must-have: writeConfig persists a global ThemeSelector config change
  // through Phase 29's configStore store layer. `writeConfig` is an invoke
  // channel — assert the response resolves ok:true (not the unported
  // marker) AND that the real `writeConfig()` function (backend/utils.ts)
  // reached GlobalConfig.get().set()/flush() (the mocked target).
  it('writeConfig (invoke) for appName "default" resolves ok:true and reaches the real writeConfig() function', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'write-config-1', 'writeConfig', [
      { appName: 'default', config: { maxWorkers: 4 } }
    ])
    await flush()

    const response = frames.find((frame) => frame.id === 'write-config-1') as
      | { ok: boolean; error?: string }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.error).toBeUndefined()

    const globalConfigInstance = mockedGlobalConfigGet() as {
      set: jest.Mock
      flush: jest.Mock
    }
    expect(globalConfigInstance.set).toHaveBeenCalledWith(
      expect.objectContaining({ maxWorkers: 4 })
    )
    expect(globalConfigInstance.flush).toHaveBeenCalled()
  })

  // T-31-01 (secret-safety): a setSetting for a normal settings key routes
  // ONLY through GlobalConfig.setSetting — never through GlobalConfig.set()/
  // flush() (the writeConfig-only methods) or any other store-touching
  // surface. Confines the write path to the narrow, single-purpose method a
  // secrets audit already has to reason about, rather than the broader
  // config-replace surface writeConfig uses.
  it('T-31-01: setSetting routes exclusively through GlobalConfig.setSetting, never GlobalConfig.set()/flush()', async () => {
    const { input } = startSidecar()
    writeSend(input, 'set-setting-secret-guard', 'setSetting', [
      { appName: 'default', key: 'steamGridDbApiKey', value: 'not-a-token' }
    ])
    await flush()

    const globalConfigInstance = mockedGlobalConfigGet() as {
      setSetting: jest.Mock
      set: jest.Mock
      flush: jest.Mock
    }
    expect(globalConfigInstance.setSetting).toHaveBeenCalledWith(
      'steamGridDbApiKey',
      'not-a-token'
    )
    expect(globalConfigInstance.set).not.toHaveBeenCalled()
    expect(globalConfigInstance.flush).not.toHaveBeenCalled()
  })

  // WR-01 (Phase 31 Plan 04): a traversal appName on the per-game setSetting
  // branch is dropped BEFORE it reaches GameConfig.get(appName).setSetting —
  // mirrors storeLayer.test.ts:374's traversal-drop assertion precedent.
  // `setSetting` is a `send` channel (no response frame), so the only
  // meaningful assertion is that the underlying mock was never invoked.
  it('WR-01: setSetting (send) for a traversal appName is dropped — GameConfig.get(...).setSetting is never called', async () => {
    const { input } = startSidecar()
    writeSend(input, 'set-setting-traversal-1', 'setSetting', [
      { appName: '../../etc/passwd', key: 'language', value: 'fr' }
    ])
    await flush()

    expect(mockedGameConfigGet).not.toHaveBeenCalledWith('../../etc/passwd')
  })

  // WR-01 (Phase 31 Plan 04): a traversal appName on the per-game writeConfig
  // branch is dropped BEFORE the real writeConfig() runs — no write outside
  // gamesConfigPath, and the invoke still resolves without throwing (a
  // dropped frame is not an error).
  it('WR-01: writeConfig (invoke) for a traversal appName is dropped — resolves without throwing and never reaches GameConfig', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'write-config-traversal-1', 'writeConfig', [
      { appName: '../../etc/passwd', config: { language: 'fr' } }
    ])
    await flush()

    const response = frames.find(
      (frame) => frame.id === 'write-config-traversal-1'
    ) as { ok: boolean; error?: string } | undefined
    expect(response?.ok).toBe(true)
    expect(mockedGameConfigGet).not.toHaveBeenCalledWith('../../etc/passwd')
  })
})

describe('sidecar settings generic reads (Phase 31 Plan 01)', () => {
  beforeEach(() => {
    steamLibrary.clear()
    mockAppSettings({ language: 'en', enableSteamNativeInstall: false })
    mockedGameConfigGet.mockReset().mockReturnValue({
      getSettings: async () =>
        ({ wineVersion: { name: 'fallback' } }) as unknown as GameSettings,
      setSetting: jest.fn()
    })
    mockedSteamGetGame.mockReset().mockReturnValue({
      getSettings: async () =>
        ({ wineVersion: { name: 'steam-routed' } }) as unknown as GameSettings,
      isNative: () => true
    })
    // resetMocks:true (shared root config) wipes the `backend/utils/systeminfo`/
    // `backend/utils/os/path` factory implementations declared at the top of this
    // file before EVERY test — re-establish them here, same pattern as
    // `skeletonFlows.test.ts`'s own beforeEach re-establishment of `getSteamLibraries`.
    jest.mocked(mockedGetSystemInfo).mockResolvedValue({
      isFlatpak: false
    } as unknown as Awaited<ReturnType<typeof mockedGetSystemInfo>>)
    jest.mocked(mockedHasExecutable).mockResolvedValue(true)
  })

  it('getMaxCpus resolves a real number, not the unported marker', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'max-cpus-1', 'getMaxCpus', [])
    await flush()

    const response = frames.find((frame) => frame.id === 'max-cpus-1') as
      | { ok: boolean; result?: unknown; error?: string }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.error).toBeUndefined()
    expect(typeof response?.result).toBe('number')
  })

  it('showUpdateSetting resolves a real boolean, not the unported marker', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'show-update-setting-1', 'showUpdateSetting', [])
    await flush()

    const response = frames.find(
      (frame) => frame.id === 'show-update-setting-1'
    ) as { ok: boolean; result?: unknown; error?: string } | undefined
    expect(response?.ok).toBe(true)
    expect(response?.error).toBeUndefined()
    expect(typeof response?.result).toBe('boolean')
  })

  it('getLogContent resolves without the unported marker (empty string for a nonexistent log)', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'log-content-1', 'getLogContent', [{}])
    await flush()

    const response = frames.find((frame) => frame.id === 'log-content-1') as
      | { ok: boolean; result?: unknown; error?: string }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.error).toBeUndefined()
    expect(typeof response?.result).toBe('string')
  })

  it('getSystemInfo resolves without the unported marker and reaches the real (mocked) getSystemInfo(cache)', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'system-info-1', 'getSystemInfo', [false])
    await flush()

    const response = frames.find((frame) => frame.id === 'system-info-1') as
      | { ok: boolean; result?: unknown; error?: string }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.error).toBeUndefined()
    expect(response?.result).toMatchObject({ isFlatpak: false })
    expect(mockedGetSystemInfo).toHaveBeenCalledWith(false)
  })

  it('hasExecutable resolves a real boolean, not the unported marker', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'has-executable-1', 'hasExecutable', ['node'])
    await flush()

    const response = frames.find((frame) => frame.id === 'has-executable-1') as
      | { ok: boolean; result?: unknown; error?: string }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.error).toBeUndefined()
    expect(typeof response?.result).toBe('boolean')
  })

  it('isNative routes through libraryManagerMap[runner].getGame(appName).isNative(), not the unported marker', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'is-native-1', 'isNative', [
      { appName: '999001', runner: 'steam' }
    ])
    await flush()

    const response = frames.find((frame) => frame.id === 'is-native-1') as
      | { ok: boolean; result?: unknown; error?: string }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.error).toBeUndefined()
    expect(response?.result).toBe(true)
    expect(mockedSteamGetGame).toHaveBeenCalledWith('999001')
  })

  // Invariant B (REQ-31-07) ORIGINALLY: getUserInfo (Epic-only) was
  // deliberately NOT ported in Phase 31 (31-RESEARCH.md Q1 — not reached by
  // the Settings screen at the time) and rejected with UNPORTED_CHANNEL_MARKER.
  //
  // NOTE (Phase 34.2 Plan 04): `readConfig` — originally paired with
  // `getUserInfo` in this same "deliberately unported" guard — is now a REAL
  // registration owned by `gameDetailsFlowRegistration.ts`
  // (`main.ts:977`/REQ-34.2-09). It is intentionally REMOVED from this
  // assertion rather than left asserting a marker that no longer applies;
  // `readConfig`'s own real-dispatch coverage lives in
  // `gameDetailsFlows.test.ts`.
  //
  // NOTE (Phase 34.5 Plan 06, REQ-34.5-04): `getUserInfo` itself is now ALSO a
  // REAL registration, owned by `runnerAuthFlowRegistration.ts`
  // (`main.ts:868` -> `LegendaryUser.getUserInfo()`). This test is updated in
  // place (following the `readConfig` precedent immediately above) to prove
  // the OPPOSITE of what it originally proved: the channel now routes through
  // the real function, not the unported marker.
  it('getUserInfo routes through the REAL LegendaryUser.getUserInfo(), not the unported marker (Phase 34.5 Plan 06)', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'user-info-1', 'getUserInfo', [])
    await flush()

    const userInfoResponse = frames.find(
      (frame) => frame.id === 'user-info-1'
    ) as { ok: boolean; error?: string; result?: unknown } | undefined
    expect(userInfoResponse?.ok).toBe(true)
    expect(userInfoResponse?.error).toBeUndefined()
    // No legendary user.json exists under this suite's disposable homedir
    // (jest.setupContainment.ts / this file's own os mock), so the real
    // LegendaryUser.isLoggedIn() is false and getUserInfo() resolves
    // undefined — proving the REAL function ran, without fixturing legendary
    // CLI state this suite has no reason to own.
    expect(userInfoResponse?.result).toBeUndefined()

    writeInvoke(input, 'health-after-generic-reads', 'health', [])
    await flush()
    const healthResponse = frames.find(
      (frame) => frame.id === 'health-after-generic-reads'
    )
    expect(healthResponse).toMatchObject({
      id: 'health-after-generic-reads',
      ok: true,
      result: 'ok'
    })
  })
})

describe('sidecar GOG private-branch password flows (Phase 34.4 Plan 03, REQ-34.4-06)', () => {
  beforeEach(() => {
    steamLibrary.clear()
    mockAppSettings({ language: 'en', enableSteamNativeInstall: false })
    mockedGogGetGame.mockReset().mockReturnValue({
      getBranchPassword: jest.fn().mockReturnValue('stored-branch-password'),
      setBranchPassword: jest.fn()
    })
    mockedSteamGetGame.mockReset()
  })

  // Must-have: getPrivateBranchPassword resolves the real (mocked) GOG
  // branch password, not the unported marker.
  it('getPrivateBranchPassword resolves ok:true with the GOG-routed branch password, not the unported marker', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'gpbp-1', 'getPrivateBranchPassword', ['gog-app-1'])
    await flush()

    const response = frames.find((frame) => frame.id === 'gpbp-1') as
      | { ok: boolean; result?: unknown; error?: string }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.error).toBeUndefined()
    expect(response?.result).toBe('stored-branch-password')
    expect(mockedGogGetGame).toHaveBeenCalledWith('gog-app-1')
  })

  // Must-have: setPrivateBranchPassword's two transport args are not
  // transposed — getGame receives appName (arg 0), setBranchPassword
  // receives password (arg 1). Only checking "it was called" would pass
  // identically with the arguments swapped.
  it('setPrivateBranchPassword (invoke, 2 args) reaches getGame(appName) and setBranchPassword(password) with the correct, non-transposed values', async () => {
    const gogGameStub = {
      getBranchPassword: jest.fn().mockReturnValue(''),
      setBranchPassword: jest.fn()
    }
    mockedGogGetGame.mockReset().mockReturnValue(gogGameStub)

    const { input, frames } = startSidecar()
    writeInvoke(input, 'spbp-1', 'setPrivateBranchPassword', [
      'gog-app-2',
      'hunter2-branch-secret'
    ])
    await flush()

    const response = frames.find((frame) => frame.id === 'spbp-1') as
      | { ok: boolean; error?: string }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.error).toBeUndefined()
    expect(mockedGogGetGame).toHaveBeenCalledWith('gog-app-2')
    expect(gogGameStub.setBranchPassword).toHaveBeenCalledWith(
      'hunter2-branch-secret'
    )
  })

  // The point of this plan: both channels reach libraryManagerMap['gog'],
  // NEVER libraryManagerMap['steam'] — the classification 34.4-RESEARCH.md
  // corrected from CONTEXT.md's file-grouped domain table. This assertion is
  // what would catch the Steam misattribution being reintroduced.
  it('REQ-34.4-06: both channels reach libraryManagerMap.gog.getGame and NEVER libraryManagerMap.steam.getGame', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'gpbp-gog-not-steam', 'getPrivateBranchPassword', [
      'gog-app-3'
    ])
    writeInvoke(input, 'spbp-gog-not-steam', 'setPrivateBranchPassword', [
      'gog-app-3',
      'another-secret'
    ])
    await flush()

    const readResponse = frames.find(
      (frame) => frame.id === 'gpbp-gog-not-steam'
    ) as { ok: boolean } | undefined
    const writeResponse = frames.find(
      (frame) => frame.id === 'spbp-gog-not-steam'
    ) as { ok: boolean } | undefined
    expect(readResponse?.ok).toBe(true)
    expect(writeResponse?.ok).toBe(true)

    expect(mockedGogGetGame).toHaveBeenCalledWith('gog-app-3')
    expect(mockedSteamGetGame).not.toHaveBeenCalled()
  })

  // T-34.4-12 (information disclosure): the submitted password value must
  // never appear in an emitted response frame or a stderr diagnostic line.
  it('T-34.4-12: no emitted response frame or stderr diagnostic contains the submitted branch password', async () => {
    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const secret = 'super-secret-branch-password-xyz'

    const { input, frames } = startSidecar()
    writeInvoke(input, 'spbp-secrecy-1', 'setPrivateBranchPassword', [
      'gog-app-4',
      secret
    ])
    await flush()

    const response = frames.find((frame) => frame.id === 'spbp-secrecy-1')
    expect(response).toBeDefined()
    for (const frame of frames) {
      expect(JSON.stringify(frame)).not.toContain(secret)
    }
    for (const call of stderrSpy.mock.calls) {
      expect(String(call[0])).not.toContain(secret)
    }

    stderrSpy.mockRestore()
  })
})
