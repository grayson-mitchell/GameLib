import {
  createTestManagerDeps,
  createInertSteamProcesses,
  createTestStores
} from 'backend/testUtils/testServices'
/**
 * Unit tests for SteamLibraryManager — LIB-01, LIB-02, LIB-03.
 *
 * Task 1 converted the buildInstalledMap todos (LIB-02) — those tests are now green.
 * Task 2 converts the refresh / playtime / fallback todos (LIB-01, LIB-03).
 *
 * Mock strategy:
 *  - backend/logger uses factory form to prevent transitive fs-extra native crash
 *  - resetMocks: true in jest.config means all mock implementations must be
 *    re-established in beforeEach or within each test
 */

// ── Imports ───────────────────────────────────────────────────────────────────
import SteamLibraryManager from '../library'
import { stopInstallPolling } from '../library/installStop'
import { buildInstalledMap } from '../library/installedMap'
import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import { mkdirSync as realMkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import {
  vdf,
  mockedFsSteamFiles
} from '../localFiles/__tests__/fixtures/mockedFsSteamFiles'
import { createTestHostServices } from 'backend/testUtils/testHostServices'
import { getSteamLibraries } from 'backend/utils'
const sendFrontendMessage = jest.fn()
import { notify } from '../../../dialog/dialog'
import { t as i18nextT } from 'i18next'
import { backfillBridgeLaunchTargets } from '../bridge/launchTarget'
import { createMockSteamUser } from 'backend/testUtils/testSteamUser'
const steamUser = createMockSteamUser()
import { getBottleSteamappsDir } from '../bottle'
import { listReadyBridgeBottleNames } from '../bridgeBottle'
import { finalizeToSteam, downloadSteamDepots } from '../depot'
import { resumeVerifyRust } from '../depotRust/secondary'
import { join } from 'path'
import { bridgeAllowlist } from '../bridge/allowlist'
import { captureOwnedAppPlatforms } from '../platformCapture'
import { resumeInterruptedSteamInstall } from '../library/resume'
import type { Stores } from 'backend/services/types'

import { createTestAnonymousClient } from 'backend/testUtils/testAnonymousClient'
import { createTestGlobalConfig } from 'backend/testUtils/testConfig'

const libDeps = {
  config: createTestGlobalConfig(),
  requestRustInvoke: mockedFsSteamFiles().requestRustInvoke
}

const { steamLibraryStore, steamMetadataStore } =
  jest.requireMock<Stores['steam']>('../stores')
const steamStoresModule = jest.requireMock<Stores['steam']>('../stores')

// The boot-owned anonymous client (D-66.3-14): a scripted `get`, no CM connection.
const getAnonymousPicsClient = jest.fn()
// The steam:// hand-off goes through deps.openExternal; this recording fake is what it calls.
const shell = { openExternal: jest.fn() }
const steamTestDeps = createTestManagerDeps({
  requestRustInvoke: mockedFsSteamFiles().requestRustInvoke,
  sendFrontendMessage,
  steamUser,
  openExternal: {
    ...createTestHostServices().openExternal,
    openExternal: (...a: unknown[]) => shell.openExternal(...a)
  },
  anonymousClient: createTestAnonymousClient({ get: getAnonymousPicsClient }),
  steamProcesses: createInertSteamProcesses(),
  stores: createTestStores({ steam: steamStoresModule })
})

// The boot-owned Steam library state the code under test reads (D-66.3-13): one instance per file.
const library = steamTestDeps.steamSession.libraryState.library

// The boot-owned auth-unlock latches the manager under test reads (D-66.3-13): one instance for this file.
const noteRefreshTrigger = (
  runner: string | null | undefined,
  origin?: string | null
) => steamTestDeps.steamSession.authTrigger.noteRefreshTrigger(runner, origin)
const resetSteamAuthTrigger = () =>
  steamTestDeps.steamSession.authTrigger.resetSteamAuthTrigger()

// ── Logger mock (factory form — prevents transitive fs-extra native crash) ───
// steam/games.ts imports the shared shortcuts module, whose import graph does not load under
// this file's mocks (quick 261026-c7r).
jest.mock('../../../shortcuts/shortcuts/shortcuts', () => ({
  addShortcuts: jest.fn(),
  removeShortcuts: jest.fn(),
  shortcutFiles: jest.fn()
}))

jest.mock('backend/knownFixReport', () => ({ reportDetectedFix: jest.fn() }))

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

// ── backend/utils mock — provides getSteamLibraries() and getFileSize() ─────
// Note: resetMocks:true wipes any factory-provided implementation before each
// test, so getFileSize's return value must be re-established per-describe
// (see beforeEach blocks below) — same pattern as games.test.ts.
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn()
}))

// ── graceful-fs mock — readdirSync, readFileSync, existsSync ─────────────────
jest.mock('graceful-fs')

// Phase 75: removed with the flag in plan 34
const priorSteamFilesText = process.env.GAMELIB_STEAMFILES_TEXT
process.env.GAMELIB_STEAMFILES_TEXT = 'rust'
afterAll(() => {
  if (priorSteamFilesText === undefined)
    delete process.env.GAMELIB_STEAMFILES_TEXT
  else process.env.GAMELIB_STEAMFILES_TEXT = priorSteamFilesText
})

// ── dialog/dialog mock — notify (GAME-02/03: poller fires confirmed toast) ───
jest.mock('../../../dialog/dialog', () => ({
  notify: jest
    .requireActual('backend/testUtils/propsOnlyMock')
    .propsOnly(jest.fn())
}))

// ── i18next mock — returns the fallback string for body assertions ────────────
// 23.2-04: t is a jest.fn (not a plain function) so its call args are
// inspectable — the fallback-string return value is unchanged, so every
// pre-existing body-text assertion in this file keeps passing byte-for-byte.
// This is what makes the interpolation options object provable: the fallback
// alone can only ever show the raw {{depots}} placeholder, never the actual
// depot id.
// The named `t` is the same jest.fn as `default.t`, so a test can reference it
// without a default-import member access (import-x/no-named-as-default-member).
jest.mock('i18next', () => {
  const t = jest.fn((_key: string, fallback = '') => fallback)
  return { __esModule: true, t, default: { t } }
})

// ── backend/constants/environment mock — platform-switching for reader tests ──
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))

// ── stores mock — steamLibraryStore, steamMetadataStore, etc. ────────
jest.mock('../stores', () => ({
  configStore: {
    get: jest.fn(),
    get_nodefault: jest.fn(),
    set: jest.fn(),
    clear: jest.fn()
  },
  steamLibraryStore: {
    get: jest.fn(),
    set: jest.fn()
  },
  steamMetadataStore: {
    get: jest.fn(),
    set: jest.fn(),
    entries: jest.fn()
  },
  steamSyncStore: {
    get: jest.fn(),
    set: jest.fn()
  },
  // quick 261029-pkp: persisted restart-hold records. Map-backed in the
  // pkp describe; bare jest.fns elsewhere (entries() -> undefined is caught
  // by listSteamRestartHolds and reads as an empty store).
  steamRestartHoldStore: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    entries: jest.fn()
  }
}))

// ── bottle mock — getBottleSteamappsDir/getSteamBottleSettings/isBottleProvisioned ─
jest.mock('../bottle', () => ({
  getBottleSteamappsDir: jest.fn(),
  getSteamBottleSettings: jest.fn(),
  isSteamBottleProvisioned: jest.fn()
}))
jest.mock('../bridgeBottle', () => ({
  createDrmBridgeRunners: () => ({}),
  getBridgeBottleSettings: jest.fn(),
  listReadyBridgeBottleNames: jest.fn(),
  resolveBridgeBottleName: jest.fn()
}))

// ── depot mock — finalizeToSteam (D-05 startup finalize) / downloadSteamDepots
// (must NEVER be invoked from startup resume — Pitfall 4, no silent re-download).
jest.mock('../depot', () => ({
  finalizeToSteam: jest.fn().mockResolvedValue(undefined),
  downloadSteamDepots: jest.fn()
}))

// ── depotRust/secondary mock — resumeVerifyRust, the one Rust verify_only job
// startup resume runs since 73-19 (D-13). Its job shape and Outcome mapping are
// covered over the rustInvoke stub in depotRust/__tests__/rustSecondary.test.ts;
// this suite pins the TS policy around it.
jest.mock('../depotRust/secondary', () => ({
  resumeVerifyRust: jest.fn()
}))

// 66.1-24: the legacy launcher runWineCommand is gone; the D-05 guard watches this stand-in.
const runWineCommand = jest.fn()

// ── bridge/allowlist mock — bridgeAllowlist.has (D-UAT-24-02, 24-17) ────────
// Defaulted to false in the shared beforeEach below so EVERY pre-existing
// test is unaffected — non-eligible by default means the existing
// native ?? bottle ?? bridge precedence holds unless a test explicitly
// opts a game into bridge eligibility.
jest.mock('../bridge/allowlist', () => ({
  bridgeAllowlist: { has: jest.fn(), knownBadReason: jest.fn() }
}))

// ── platformCapture mock — captureOwnedAppPlatforms (34.15 D-03/D-04) ──────
// This module is unit-tested in isolation (Plan 01's own suite). Mocking it
// here isolates refresh()'s own wiring/instrumentation from the real bulk
// PICS scoping and merge logic — the shared beforeEach below defaults it to
// a no-op success so every pre-existing refresh() test is unaffected; the
// 'D-03 fail-soft' describe block below overrides this default per-test.
jest.mock('../bridge/launchTarget', () => ({
  backfillBridgeLaunchTargets: jest.fn()
}))
jest.mock('../platformCapture', () => ({
  createPlatformCaptureQueue: () => ({}),
  captureOwnedAppPlatforms: jest.fn()
}))
jest.mock('../metacriticCapture', () => ({
  captureOwnedAppMetacritic: jest.fn()
}))
// D-UAT-13: the install poller asks which Steam client PIDs are alive when a
// native handoff finalizes. A bare jest.fn() resolves undefined = "inconclusive"
// = fail open (no hold), so every pre-existing test keeps its old behaviour;
// the D-UAT-13 describe below drives it explicitly. Never a real child spawn.
// quick 261029-sex: bare jest.fn = undefined = no live signal = ACF behaviour.
jest.mock('../steamClientProcess', () => ({
  listSteamClientPids: jest.fn(),
  // quick 261029-pkp: start-time identity probe (bare jest.fn = undefined =
  // "unknown": no record is persisted, so pre-existing tests are unaffected).
  readSteamProcessStartTokens: jest.fn()
}))

// ── Shared fixtures ───────────────────────────────────────────────────────────

// 23.2-04: this project's jest config sets `resetMocks: true`, which strips
// jest.fn() implementations (not just call history) before EVERY test — so
// the i18nextT mock's fallback-returning implementation (set once at
// jest.mock() factory time, above) must be re-established file-wide, or any
// test anywhere in this file that asserts on a notify() body derived from
// i18nextT would see `undefined` instead of the fallback string. A plain
// (non-jest.fn) function is immune to resetMocks, which is why this was not
// needed before this key was added to observe the call args.
beforeEach(() => {
  ;(i18nextT as jest.Mock).mockImplementation(
    (_key: string, fallback = '') => fallback
  )
  // quick/261016-u1w (D-C): default to "no ready bridge bottle" so every
  // describe block that doesn't care about the bridge path (and therefore
  // never arms this mock) gets the same falsy short-circuit the old
  // isBridgeBottleReady()-returns-undefined default gave it, rather than a
  // TypeError from calling .length on an un-mocked return value.
  jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])
  jest.mocked(backfillBridgeLaunchTargets).mockResolvedValue(0)
})

// ── Describe block ────────────────────────────────────────────────────────────

describe('SteamLibraryManager', () => {
  let manager: SteamLibraryManager
  let leaseRelease: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    manager = new SteamLibraryManager(steamTestDeps)
    // Phase 54: refresh() logs on only for a granted (explicit) Refresh. This
    // suite tests refresh()'s BEHAVIOR, so arm the one-shot grant the way the
    // IPC handler does; the grant is consumed by the first refresh() call, so
    // tests that refresh twice re-arm it. The grant gate itself has its own
    // describe below and the structural launch test.
    resetSteamAuthTrigger()
    noteRefreshTrigger('steam', 'action-icons-refresh-button')
    // Default lease: the client the test installed via steamUser.getClient().
    leaseRelease = jest.fn()
    jest.mocked(steamUser.acquireOpenAuthenticated).mockReturnValue(null)
    jest.mocked(steamUser.acquireAuthenticated).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        client: steamUser.getClient(),
        release: leaseRelease
      } as never)
    )
    jest.mocked(getAnonymousPicsClient).mockResolvedValue(null)
    // Default: getSteamLibraries returns empty so buildInstalledMap is fast
    jest.mocked(getSteamLibraries).mockResolvedValue([])
    // Default: metadata store returns undefined (no cached artwork)
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)
    // Defaults so init()/migrateStaleArtUrls have empty caches to scan
    ;(steamMetadataStore.entries as jest.Mock).mockReturnValue([])
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    // Default: no game is bridge-eligible (D-UAT-24-02, 24-17) — every
    // pre-existing test keeps the native ?? bottle ?? bridge precedence.
    jest.mocked(bridgeAllowlist.has).mockReturnValue(false)
    // Default: the bulk platform capture (34.15 D-03/D-04) reports a
    // no-op success — every pre-existing refresh() test is unaffected.
    // Individual tests below override this per-case.
    jest.mocked(captureOwnedAppPlatforms).mockResolvedValue({
      scopedCount: 0,
      capturedCount: 0,
      skippedCount: 0,
      failed: false
    })
  })

  // ── LIB-02: install state via ACF StateFlags (Task 1 — green) ─────────────

  it('LIB-02: buildInstalledMap marks is_installed true when StateFlags bit 4 is set (e.g. 4, 6, 516)', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue([
      'appmanifest_570.acf',
      'appmanifest_440.acf',
      'appmanifest_730.acf'
    ])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock)
      .mockReturnValueOnce({
        AppState: {
          appid: '570',
          StateFlags: '4',
          installdir: 'game1',
          SizeOnDisk: '100'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '440',
          StateFlags: '6',
          installdir: 'game2',
          SizeOnDisk: '200'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '516',
          installdir: 'game3',
          SizeOnDisk: '300'
        }
      })

    const result = await buildInstalledMap(libDeps)

    expect(result.has(570)).toBe(true)
    expect(result.has(440)).toBe(true)
    expect(result.has(730)).toBe(true)
    // installPath is join(steamappsDir, 'common', installdir)
    expect(result.get(570)?.installPath).toBe(
      join('/steam', 'steamapps', 'common', 'game1')
    )
  })

  it('LIB-02: buildInstalledMap marks is_installed false when StateFlags bit 4 is clear', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_570.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '570',
        StateFlags: '2',
        installdir: 'game1',
        SizeOnDisk: '100'
      }
    })

    const result = await buildInstalledMap(libDeps)

    // StateFlags 2 has bit 4 clear → not installed → not in map
    expect(result.size).toBe(0)
  })

  it('LIB-02: a corrupt/unparseable ACF file is skipped without throwing', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue([
      'appmanifest_570.acf',
      'appmanifest_440.acf'
    ])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock)
      .mockImplementationOnce(() => {
        throw new Error('parse error')
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '440',
          StateFlags: '4',
          installdir: 'game2',
          SizeOnDisk: '200'
        }
      })

    // Should not throw
    const result = await buildInstalledMap(libDeps)

    expect(result.has(440)).toBe(true)
    expect(result.has(570)).toBe(false)
  })

  describe('init() migrates stale cover art URLs', () => {
    const OLD =
      'https://cdn.cloudflare.steamstatic.com/steam/apps/570/capsule_616x353.jpg'
    const NEW =
      'https://cdn.cloudflare.steamstatic.com/steam/apps/570/library_600x900.jpg'

    it('rewrites the landscape capsule URL in the metadata cache', async () => {
      ;(steamMetadataStore.entries as jest.Mock).mockReturnValue([
        ['570', { art_cover: 'x', art_square: OLD, extra: {} }]
      ])

      await manager.init()

      expect(steamMetadataStore.set).toHaveBeenCalledWith(
        '570',
        expect.objectContaining({ art_square: NEW })
      )
    })

    it('rewrites the landscape capsule URL in the persisted library list', async () => {
      jest.mocked(steamLibraryStore.get).mockReturnValue([
        {
          runner: 'steam',
          app_name: '570',
          title: 'Dota 2',
          art_square: OLD
        } as any,
        {
          runner: 'steam',
          app_name: '440',
          title: 'TF2',
          art_square: ''
        } as any
      ])

      await manager.init()

      const setCall = jest
        .mocked(steamLibraryStore.set)
        .mock.calls.find(([key]) => key === 'games')
      expect(setCall).toBeDefined()
      const savedGames = setCall![1] as Array<{
        app_name: string
        art_square: string
      }>
      expect(savedGames.find((g) => g.app_name === '570')?.art_square).toBe(NEW)
    })

    it('does not rewrite the library list when no stale URLs are present', async () => {
      jest.mocked(steamLibraryStore.get).mockReturnValue([
        {
          runner: 'steam',
          app_name: '570',
          title: 'Dota 2',
          art_square: NEW
        } as any
      ])

      await manager.init()

      const setGames = jest
        .mocked(steamLibraryStore.set)
        .mock.calls.filter(([key]) => key === 'games')
      expect(setGames).toHaveLength(0)
    })
  })

  it('init() surfaces (does NOT auto-resume) an in-progress download detected on startup — no setInterval, no finalize, no depot plan', async () => {
    jest.useFakeTimers()
    library.clear()
    library.set('730', {
      runner: 'steam',
      app_name: '730',
      title: 'CS:GO',
      is_installed: false,
      install: {},
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)

    // Set up ACF mocks so scanDownloadingAppIds finds '730' downloading
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })

    const setIntervalSpy = jest.spyOn(global, 'setInterval')

    await manager.init()

    // Nothing heavy may run on boot for a detected interrupted install.
    expect(setIntervalSpy).not.toHaveBeenCalled()
    expect(finalizeToSteam).not.toHaveBeenCalled()
    expect(resumeVerifyRust).not.toHaveBeenCalled()
    expect(downloadSteamDepots).not.toHaveBeenCalled()

    // It IS surfaced: the library entry is flagged resumable and pushed.
    expect(library.get('730')?.install?.steamResumePending).toBe(true)
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({
        app_name: '730',
        install: expect.objectContaining({ steamResumePending: true })
      })
    )
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'CS:GO' })
    )

    setIntervalSpy.mockRestore()
    jest.useRealTimers()
  })

  it('init() never throws when surfacing a resumable install fails for one appId, and does not block startup', async () => {
    jest.useFakeTimers()
    library.clear()
    library.set('730', {
      runner: 'steam',
      app_name: '730',
      title: 'CS:GO',
      is_installed: false,
      install: {},
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)

    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    ;(notify as jest.Mock).mockImplementation(() => {
      throw new Error('desktop notification backend unavailable')
    })

    await expect(manager.init()).resolves.toBeUndefined()

    // The failure surfacing the notification must not stop the library
    // entry from still being flagged resumable.
    expect(library.get('730')?.install?.steamResumePending).toBe(true)

    jest.useRealTimers()
  })

  // ── T-23-14: startup resume reconciles against the in-flight registry ────
  //
  // A stale on-disk StateFlags=1026 manifest for an appId already owned by a
  // live in-process install (games.ts's nativeInstallsInFlight) must never
  // spawn a phantom concurrent resume path racing the live download.

  it('T-23-14: init() skips startup-resume for an appId already owned by a live in-process install (isNativeInstallInFlight)', async () => {
    jest.useFakeTimers()
    library.clear()
    library.set('730', {
      runner: 'steam',
      app_name: '730',
      title: 'CS:GO',
      is_installed: false,
      install: {},
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)

    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })

    const isNativeInstallInFlightSpy = jest
      .spyOn(steamTestDeps.steamSession.gameSession, 'isNativeInstallInFlight')
      .mockReturnValue(true)

    await manager.init()

    // A live install already owns '730' — startup resume must not finalize
    // or re-drive the depot orchestrator for it, and must not even surface
    // it as a separate resumable game (the live install already owns the
    // badge/poll for this appId).
    expect(finalizeToSteam).not.toHaveBeenCalled()
    expect(downloadSteamDepots).not.toHaveBeenCalled()
    expect(library.get('730')?.install?.steamResumePending).toBeUndefined()

    isNativeInstallInFlightSpy.mockRestore()
    jest.useRealTimers()
  })

  it('T-23-14: an appId NOT in the in-flight registry is still surfaced as resumable on startup (no regression)', async () => {
    jest.useFakeTimers()
    library.clear()
    library.set('730', {
      runner: 'steam',
      app_name: '730',
      title: 'CS:GO',
      is_installed: false,
      install: {},
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)

    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })

    // isNativeInstallInFlight is the REAL (unmocked) games.ts function here —
    // '730' was never registered by a real install(), so it returns false.
    await manager.init()

    expect(library.get('730')?.install?.steamResumePending).toBe(true)
    expect(finalizeToSteam).not.toHaveBeenCalled()

    jest.useRealTimers()
  })

  // ── D-05 / steam-startup-resume-crash (2026-07-18): resumeInterruptedSteamInstall()
  // finalizes to 1026 THEN watches (folded todo) — this logic used to run
  // automatically from init(); it is now invoked ONLY by the user's own
  // Install click (games.ts), so these regression tests call it directly. ──

  it('D-05: resumeInterruptedSteamInstall() never dispatches to Steam/CrossOver (shell.openExternal / runWineCommand — folded-todo regression guard)', async () => {
    jest.useFakeTimers()
    library.clear()
    library.set('730', {
      runner: 'steam',
      app_name: '730',
      title: 'CS:GO',
      is_installed: false,
      install: {},
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)

    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })

    await resumeInterruptedSteamInstall(steamTestDeps, '730')

    expect(shell.openExternal).not.toHaveBeenCalled()
    expect(runWineCommand).not.toHaveBeenCalled()
    // Phase 23 (23-03, D-04) regression: rebuilding a real DepotPlan for
    // reconciliation must NEVER scan the bottle steamapps root — the resume
    // path stays native-only end to end.
    expect(getBottleSteamappsDir).not.toHaveBeenCalled()

    stopInstallPolling(steamTestDeps, '730')
    jest.useRealTimers()
  })

  // ── Phase 23 (D-04) / 73 (D-13): startup resume verifies through one Rust job ─
  describe('startup resume reconciliation (D-04)', () => {
    let tmp: string

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'gamelib-library-resume-test-'))
    })

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true })
    })

    function setupDownloadingFixture(appId: string, installdir: string) {
      realMkdirSync(join(tmp, 'steamapps'), { recursive: true })

      library.set(appId, {
        runner: 'steam',
        app_name: appId,
        title: installdir,
        is_installed: false,
        install: {},
        art_cover: '',
        art_square: '',
        extra: { reqs: [] },
        canRunOffline: true,
        installable: true
      } as any)

      jest.mocked(getSteamLibraries).mockResolvedValue([tmp])
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readdirSync as jest.Mock).mockReturnValue([`appmanifest_${appId}.acf`])
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        AppState: { appid: appId, StateFlags: '2', installdir, SizeOnDisk: '0' }
      })
    }

    it('runs one verify job over the sanitized install target and finalizes nothing in TS (Rust wrote the ACF)', async () => {
      jest.useFakeTimers()
      library.clear()
      setupDownloadingFixture('730', 'csgo')
      jest.mocked(resumeVerifyRust).mockResolvedValue({
        missing: [],
        allFilesVerified: true,
        allModesHealed: true,
        acf: { stateFlags: '4' }
      })

      await resumeInterruptedSteamInstall(steamTestDeps, '730')

      expect(resumeVerifyRust).toHaveBeenCalledTimes(1)
      expect(resumeVerifyRust).toHaveBeenCalledWith('730', {
        installRuntime: steamTestDeps.steamInstallRuntime,
        steamUser: expect.anything(),
        config: expect.anything(),
        targetSteamappsDir: join(tmp, 'steamapps'),
        installdir: 'csgo',
        name: 'csgo',
        // backend/constants/environment is mocked to Linux in this suite.
        os: 'linux'
      })
      expect(finalizeToSteam).not.toHaveBeenCalled()
      expect(downloadSteamDepots).not.toHaveBeenCalled()

      stopInstallPolling(steamTestDeps, '730')
      jest.useRealTimers()
    })

    it('a verify that finds missing files is still final: TS does not overwrite the 1026 ACF Rust wrote (T-23-09)', async () => {
      jest.useFakeTimers()
      library.clear()
      setupDownloadingFixture('730', 'csgo')
      jest.mocked(resumeVerifyRust).mockResolvedValue({
        missing: ['missing.bin'],
        allFilesVerified: false,
        allModesHealed: false,
        acf: { stateFlags: '1026' }
      })

      await expect(
        resumeInterruptedSteamInstall(steamTestDeps, '730')
      ).resolves.toBeUndefined()

      expect(finalizeToSteam).not.toHaveBeenCalled()
      expect(downloadSteamDepots).not.toHaveBeenCalled()

      stopInstallPolling(steamTestDeps, '730')
      jest.useRealTimers()
    })

    describe('rust flag (GAMELIB_STEAMFILES_TEXT=rust): finalize through depot_finalize (75-23)', () => {
      const realEnv = process.env.GAMELIB_STEAMFILES_TEXT
      let acfInstalldir = 'csgo'
      let invoke: jest.Mock
      let spies: jest.SpyInstance[]
      beforeEach(() => {
        process.env.GAMELIB_STEAMFILES_TEXT = 'rust'
        acfInstalldir = 'csgo'
        // The ACF read goes through the deps' own transport, the finalize through the install
        // runtime's; one router serves both.
        invoke = jest.fn((channel: string, _args: unknown[]) => {
          if (channel === 'steamfiles_read_acf') {
            return Promise.resolve({ record: { installdir: acfInstalldir } })
          }
          return Promise.resolve({
            acf: { path: '/x', stateFlags: 1026, sizeOnDisk: '0' }
          })
        })
        spies = [
          jest
            .spyOn(steamTestDeps, 'requestRustInvoke')
            .mockImplementation(invoke as never),
          jest
            .spyOn(
              steamTestDeps.steamInstallRuntime.depotJobs.transport,
              'requestRustInvoke'
            )
            .mockImplementation(invoke as never)
        ]
      })
      afterEach(() => {
        spies.forEach((x) => x.mockRestore())
        if (realEnv === undefined) delete process.env.GAMELIB_STEAMFILES_TEXT
        else process.env.GAMELIB_STEAMFILES_TEXT = realEnv
      })

      it('a failed verify sends outcome null with the sanitised installdir and no TS finalize', async () => {
        jest.useFakeTimers()
        library.clear()
        setupDownloadingFixture('730', 'csgo')
        jest
          .mocked(resumeVerifyRust)
          .mockRejectedValue(new Error('no authenticated Steam CM connection'))

        await resumeInterruptedSteamInstall(steamTestDeps, '730')

        expect(finalizeToSteam).not.toHaveBeenCalled()
        expect(invoke).toHaveBeenCalledWith('depot_finalize', [
          {
            appId: '730',
            finalize: expect.objectContaining({
              steamappsDir: join(tmp, 'steamapps'),
              installdir: 'csgo',
              allowFullOwnership: false
            }),
            depots: [],
            outcome: null
          }
        ])
        stopInstallPolling(steamTestDeps, '730')
        jest.useRealTimers()
      })

      it('finalizes (depot_finalize) BEFORE it starts watching (finalize-then-startInstallPolling ordering)', async () => {
        jest.useFakeTimers()
        library.clear()
        setupDownloadingFixture('730', 'csgo')
        jest.mocked(resumeVerifyRust).mockRejectedValue(new Error('offline'))
        const order: string[] = []
        invoke.mockImplementation((channel: string) => {
          if (channel === 'depot_finalize') order.push('finalize')
          return Promise.resolve(
            channel === 'steamfiles_read_acf'
              ? { record: { installdir: 'csgo' } }
              : { acf: { path: '/x', stateFlags: 1026, sizeOnDisk: '0' } }
          )
        })
        const setIntervalSpy = jest
          .spyOn(global, 'setInterval')
          .mockImplementation((() => {
            order.push('watch')
            return { unref: () => undefined } as unknown as NodeJS.Timeout
          }) as unknown as typeof setInterval)

        await resumeInterruptedSteamInstall(steamTestDeps, '730')

        expect(order).toEqual(['finalize', 'watch'])
        setIntervalSpy.mockRestore()
        stopInstallPolling(steamTestDeps, '730')
        jest.useRealTimers()
      })

      it('a hostile installdir finalizes the fallback installdir', async () => {
        jest.useFakeTimers()
        library.clear()
        setupDownloadingFixture('730', '../evil')
        acfInstalldir = '../evil'

        await resumeInterruptedSteamInstall(steamTestDeps, '730')

        expect(resumeVerifyRust).not.toHaveBeenCalled()
        const arg = (
          invoke.mock.calls.find((c) => c[0] === 'depot_finalize')?.[1] as any[]
        )[0]
        expect(arg.finalize.installdir).toBe('app_730')
        stopInstallPolling(steamTestDeps, '730')
        jest.useRealTimers()
      })

      it('an error result is logged and swallowed', async () => {
        jest.useFakeTimers()
        library.clear()
        setupDownloadingFixture('730', 'csgo')
        jest.mocked(resumeVerifyRust).mockRejectedValue(new Error('offline'))
        invoke.mockImplementation((channel: string) =>
          Promise.resolve(
            channel === 'steamfiles_read_acf'
              ? { record: { installdir: 'csgo' } }
              : { error: { message: 'boom' } }
          )
        )

        await expect(
          resumeInterruptedSteamInstall(steamTestDeps, '730')
        ).resolves.toBeUndefined()
        expect(
          invoke.mock.calls.filter((c) => c[0] === 'depot_finalize')
        ).toHaveLength(1)
        stopInstallPolling(steamTestDeps, '730')
        jest.useRealTimers()
      })
    })
  })
})
