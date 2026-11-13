import {
  createTestManagerDeps,
  createInertSteamProcesses,
  createTestStores
} from 'backend/testUtils/testServices'
/**
 * Unit tests for steam/library/installPollOnce.ts (pollInstallOnce, one polling tick).
 * Moved out of library.test.ts by Phase 65 plan 04 (D-03); mock preamble
 * copied.
 */

// ── Imports ───────────────────────────────────────────────────────────────────
import { startInstallPolling } from '../library/installPolling'
import { stopInstallPolling } from '../library/installStop'
import { existsSync, readFileSync } from 'graceful-fs'
import {
  vdf,
  mockedFsSteamFiles
} from '../localFiles/__tests__/fixtures/mockedFsSteamFiles'
import { getSteamLibraries, getFileSize } from 'backend/utils'
const sendFrontendMessage = jest.fn()
import { notify } from '../../../dialog/dialog'
import { t as i18nextT } from 'i18next'
import { backfillBridgeLaunchTargets } from '../bridge/launchTarget'
import { getBottleSteamappsDir } from '../bottle'
import {
  getBridgeBottleSettings,
  listReadyBridgeBottleNames
} from '../bridgeBottle'
import { join } from 'path'
import { pollInstallOnce } from '../library/installPollOnce'
import type { Stores } from 'backend/services/types'

const steamStoresModule = jest.requireMock<Stores['steam']>('../stores')

// The monitor members are jest.fns so the macOS live-progress describe below can drive and
// assert on them; the poller stays inert.
const monitor = {
  start: jest.fn(),
  read: jest.fn(),
  stop: jest.fn(),
  stopAll: jest.fn()
}
const startSteamDownloadMonitor = monitor.start
const readSteamDownloadMonitor = monitor.read
const stopSteamDownloadMonitor = monitor.stop

// 66.3-15: the bottle settings are read through the deps slice, not a module import.
const getSteamBottleSettings = jest.fn()

const steamTestDeps = createTestManagerDeps({
  requestRustInvoke: mockedFsSteamFiles().requestRustInvoke,
  sendFrontendMessage,
  steamBottle: { getSteamBottleSettings } as never,
  steamProcesses: createInertSteamProcesses({ downloadMonitor: monitor }),
  stores: createTestStores({ steam: steamStoresModule })
})

// The boot-owned Steam library state the code under test reads (D-66.3-13): one instance per file.
const library = steamTestDeps.steamSession.libraryState.library

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
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
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
  getBottleSteamappsDir: jest.fn()
}))
jest.mock('../bridgeBottle', () => ({
  createDrmBridgeRunners: () => ({}),
  getBridgeBottleSettings: jest.fn(),
  listReadyBridgeBottleNames: jest.fn(),
  resolveBridgeBottleName: jest.fn()
}))

// ── depot mock — finalizeToSteam (D-05 startup finalize) / downloadSteamDepots
// (must NEVER be invoked from startup resume — Pitfall 4, no silent re-download) ─
jest.mock('../depot', () => ({
  finalizeToSteam: jest.fn().mockResolvedValue(undefined),
  downloadSteamDepots: jest.fn()
}))

// ── backend/launcher mock — runWineCommand (D-05 no-auto-drive regression) ────
jest.mock('backend/launcher', () => ({
  runWineCommand: jest.fn()
}))

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

/** Bottle steamapps root used consistently across the bottle-path tests below. */
const BOTTLE_STEAMAPPS_ROOT = join(
  '/Users/tester/Library/Application Support/CrossOver/Bottles',
  'GameLibSteam',
  'drive_c/Program Files (x86)/Steam/steamapps'
)

/**
 * GAP-17-PFX86-PATH regression fixture: the same bottle steamapps root but
 * under a win32-prefix layout (no "(x86)" segment — 32-bit Steam installs
 * directly under `Program Files`). getBottleSteamappsDir is mocked in this
 * file, so this fixture proves the bottle-source ACF scan resolves manifests
 * identically regardless of which root the (real, unmocked) resolver in
 * bottle.ts returns.
 */
const WIN32_BOTTLE_STEAMAPPS_ROOT = join(
  '/Users/tester/Library/Application Support/CrossOver/Bottles',
  'GameLibSteam',
  'drive_c/Program Files/Steam/steamapps'
)

/**
 * Bridge bottle steamapps root used across the 'bridge' source tests
 * (D-UAT-24-05). Distinct bottle name (GameLibSteamBridge) from the Phase 17
 * bottle (GameLibSteam) — proves the two bottle roots are never conflated.
 */
const BRIDGE_BOTTLE_STEAMAPPS_ROOT = join(
  '/Users/tester/Library/Application Support/CrossOver/Bottles',
  'GameLibSteamBridge',
  'drive_c/Program Files (x86)/Steam/steamapps'
)

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

// ── D-07: pollInstallOnce() ──────────────────────────────────────────────────

describe('pollInstallOnce()', () => {
  beforeEach(() => {
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
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    jest
      .mocked(getFileSize)
      .mockImplementation((bytes: unknown) => `${String(bytes)} B`)
  })

  afterEach(() => {
    stopInstallPolling(steamTestDeps, '730')
    jest.useRealTimers()
  })

  it('sends gameStatusUpdate { status:"installing" } when state is "downloading"', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    await pollInstallOnce(steamTestDeps, '730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        status: 'installing'
      })
    )
  })

  // ── GAP-17-BOTTLE-PROGRESS: pollInstallOnce derives percent from ACF bytes ─

  it('emits progressUpdate with progress.percent === 50 for a mid-download ACF (BytesDownloaded=5, BytesToDownload=10)', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '5',
        BytesToDownload: '10'
      }
    })
    await pollInstallOnce(steamTestDeps, '730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'progressUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        progress: expect.objectContaining({ percent: 50 })
      })
    )
  })

  it('falls back to BytesStaged/BytesToStage when BytesToDownload is 0 (percent 50 via staged fallback)', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '0',
        BytesToDownload: '0',
        BytesStaged: '3',
        BytesToStage: '6'
      }
    })
    await pollInstallOnce(steamTestDeps, '730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'progressUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        progress: expect.objectContaining({ percent: 50 })
      })
    )
  })

  it('does NOT emit progressUpdate (and never a non-finite percent) when BOTH BytesToDownload and BytesToStage are 0', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '0',
        BytesToDownload: '0',
        BytesStaged: '0',
        BytesToStage: '0'
      }
    })
    await pollInstallOnce(steamTestDeps, '730')
    const progressCalls = sendFrontendMessage.mock.calls.filter(
      ([channel]) => channel === 'progressUpdate'
    )
    expect(progressCalls).toHaveLength(0)
    // Belt-and-suspenders: no call anywhere ever carries a non-finite percent.
    for (const [, payload] of sendFrontendMessage.mock.calls) {
      if (payload?.progress?.percent !== undefined) {
        expect(Number.isFinite(payload.progress.percent)).toBe(true)
      }
    }
  })

  // ── T-AOG (quick/260719-aog): download speed + ETA derivation ─────────────

  it('emits no downSpeed and eta "" on a direct call with no active poll (poll undefined never throws)', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '5',
        BytesToDownload: '10'
      }
    })
    await expect(pollInstallOnce(steamTestDeps, '730')).resolves.toBeUndefined()
    const call = sendFrontendMessage.mock.calls.find(
      ([channel]) => channel === 'progressUpdate'
    )
    expect(call![1].progress.percent).toBe(50)
    expect(call![1].progress.downSpeed).toBeUndefined()
    expect(call![1].progress.eta).toBe('')
  })

  it('emits a finite downSpeed > 0 and a non-empty decreasing eta on the second tick of a rising download (first tick has no baseline yet)', async () => {
    vdf.parse
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '2',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '5000000',
          BytesToDownload: '10000000'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '2',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '8000000',
          BytesToDownload: '10000000'
        }
      })

    startInstallPolling(steamTestDeps, '730', 60000) // register activePolls entry for the speed baseline
    await pollInstallOnce(steamTestDeps, '730')
    jest.advanceTimersByTime(3000) // 3s elapsed between ticks
    await pollInstallOnce(steamTestDeps, '730')

    const progressCalls = sendFrontendMessage.mock.calls.filter(
      ([channel]) => channel === 'progressUpdate'
    )
    expect(progressCalls).toHaveLength(2)

    const [firstCall, secondCall] = progressCalls
    // First tick: no prior baseline, so no speed yet — percent still fires.
    expect(firstCall[1].progress.percent).toBe(50)
    expect(firstCall[1].progress.downSpeed).toBeUndefined()
    expect(firstCall[1].progress.eta).toBe('')

    // Second tick: (8M - 5M) bytes over 3s -> a finite, positive MiB/s rate
    // and a non-empty ETA string derived from the remaining bytes.
    expect(secondCall[1].progress.percent).toBe(80)
    expect(secondCall[1].progress.downSpeed).toBeGreaterThan(0)
    expect(Number.isFinite(secondCall[1].progress.downSpeed)).toBe(true)
    expect(typeof secondCall[1].progress.eta).toBe('string')
    expect(secondCall[1].progress.eta.length).toBeGreaterThan(0)
  })

  it('never emits a non-finite/negative downSpeed or eta when two ticks land back-to-back with zero elapsed time (preallocation-jump guard)', async () => {
    vdf.parse
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '2',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '0',
          BytesToDownload: '10000000'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '2',
          installdir: 'csgo',
          SizeOnDisk: '0',
          // Simulates a Steam preallocation jump landing on the very next
          // tick with no elapsed wall-clock time between polls.
          BytesDownloaded: '9000000',
          BytesToDownload: '10000000'
        }
      })

    startInstallPolling(steamTestDeps, '730', 60000)
    await pollInstallOnce(steamTestDeps, '730')
    await pollInstallOnce(steamTestDeps, '730') // no jest.advanceTimersByTime — zero elapsed ms

    const progressCalls = sendFrontendMessage.mock.calls.filter(
      ([channel]) => channel === 'progressUpdate'
    )
    for (const [, payload] of progressCalls) {
      if (payload.progress.downSpeed !== undefined) {
        expect(Number.isFinite(payload.progress.downSpeed)).toBe(true)
        expect(payload.progress.downSpeed).toBeGreaterThanOrEqual(0)
      }
      expect(typeof payload.progress.eta).toBe('string')
      expect(Number.isFinite(payload.progress.percent)).toBe(true)
    }
  })

  it('regression (GAP-17-BOTTLE-PROGRESS): staged-fallback ACF (BytesToDownload=0) still emits percent, with no downSpeed/eta', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '0',
        BytesToDownload: '0',
        BytesStaged: '3',
        BytesToStage: '6'
      }
    })
    startInstallPolling(steamTestDeps, '730', 60000)
    await pollInstallOnce(steamTestDeps, '730')
    jest.advanceTimersByTime(3000)
    await pollInstallOnce(steamTestDeps, '730')

    const progressCalls = sendFrontendMessage.mock.calls.filter(
      ([channel]) => channel === 'progressUpdate'
    )
    expect(progressCalls.length).toBeGreaterThan(0)
    for (const [, payload] of progressCalls) {
      expect(payload.progress.percent).toBe(50)
      expect(payload.progress.downSpeed).toBeUndefined()
      expect(payload.progress.eta).toBe('')
    }
  })

  // ── T-AOG (quick/260719-aog, Task 2): paused/stalled detection ─────────────

  it('emits gameStatusUpdate context "steam-paused" after STALLED_TICKS_THRESHOLD consecutive frozen-bytes ticks on a real in-flight download', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '5000000',
        BytesToDownload: '10000000'
      }
    })
    startInstallPolling(steamTestDeps, '730', 60000)
    for (let i = 0; i < 4; i++) {
      await pollInstallOnce(steamTestDeps, '730')
      jest.advanceTimersByTime(3000)
    }

    const calls = sendFrontendMessage.mock.calls.filter(
      ([channel]) => channel === 'gameStatusUpdate'
    )
    expect(calls[calls.length - 1][1].context).toBe('steam-paused')
  })

  it('never emits "steam-paused" while BytesDownloaded keeps rising across ticks (active download resets the stalled counter)', async () => {
    vdf.parse
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '2',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '1000000',
          BytesToDownload: '10000000'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '2',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '2000000',
          BytesToDownload: '10000000'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '2',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '3000000',
          BytesToDownload: '10000000'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '2',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '4000000',
          BytesToDownload: '10000000'
        }
      })
    startInstallPolling(steamTestDeps, '730', 60000)
    for (let i = 0; i < 4; i++) {
      await pollInstallOnce(steamTestDeps, '730')
      jest.advanceTimersByTime(3000)
    }

    const calls = sendFrontendMessage.mock.calls.filter(
      ([channel]) => channel === 'gameStatusUpdate'
    )
    for (const [, payload] of calls) {
      expect(payload.context).not.toBe('steam-paused')
    }
  })

  it('keeps "steam-waiting-for-restart" (never "steam-paused") for a frozen 1026 handoff manifest on a native-ON handoff poll, even with a real in-flight download\'s frozen bytes', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '1026',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '5000000',
        BytesToDownload: '10000000'
      }
    })
    // debug/steam-1026-download-restart: isNativeHandoff:true — this poll
    // stands in for games.ts's post-depot.ts-download handoff poll, the ONLY
    // scenario where StateFlags 1026 genuinely means "waiting for restart".
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true
    })
    for (let i = 0; i < 4; i++) {
      await pollInstallOnce(steamTestDeps, '730')
      jest.advanceTimersByTime(3000)
    }

    const calls = sendFrontendMessage.mock.calls.filter(
      ([channel]) => channel === 'gameStatusUpdate'
    )
    for (const [, payload] of calls) {
      expect(payload.context).toBe('steam-waiting-for-restart')
    }
  })

  it('does NOT flag "steam-paused" for a staged-fallback ACF (BytesToDownload=0) even though BytesDownloaded stays frozen at 0', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '0',
        BytesToDownload: '0',
        BytesStaged: '3',
        BytesToStage: '6'
      }
    })
    startInstallPolling(steamTestDeps, '730', 60000)
    for (let i = 0; i < 4; i++) {
      await pollInstallOnce(steamTestDeps, '730')
      jest.advanceTimersByTime(3000)
    }

    const calls = sendFrontendMessage.mock.calls.filter(
      ([channel]) => channel === 'gameStatusUpdate'
    )
    for (const [, payload] of calls) {
      expect(payload.context).toBeUndefined()
    }
  })

  it('sends pushGameToLibrary + gameStatusUpdate { status:"done" } when state is "installed"', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startInstallPolling(steamTestDeps, '730', 60000) // register entry so stopInstallPolling has something to clear
    await pollInstallOnce(steamTestDeps, '730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: '730', is_installed: true })
    )
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        status: 'done'
      })
    )
  })

  // ── GAME-02: poller fires confirmed completion toast (RED gate) ────────────

  it('GAME-02: fires notify with Installation Finished on the "installed" branch (confirmed ACF state)', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startInstallPolling(steamTestDeps, '730', 60000) // register entry so stopInstallPolling has something to clear
    await pollInstallOnce(steamTestDeps, '730')
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith({
      title: 'CS:GO',
      body: 'Installation Finished'
    })
  })

  describe('quick 261029-sex live Steam download progress', () => {
    const envMock = jest.requireMock('backend/constants/environment')
    const frozenAcf = {
      AppState: {
        appid: '730',
        StateFlags: '1026',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '0',
        BytesToDownload: '8736151712'
      }
    }
    const live = (bytesDone: number, speed = 25e6) => ({
      bytesDone,
      bytesTotal: 8736151712,
      speedBytesPerSec: speed
    })
    const progressCalls = () =>
      sendFrontendMessage.mock.calls.filter(
        ([channel]) => channel === 'progressUpdate'
      )
    const statusCalls = () =>
      sendFrontendMessage.mock.calls.filter(
        ([channel]) => channel === 'gameStatusUpdate'
      )

    beforeEach(() => {
      envMock.isMac = true
      vdf.parse.mockReturnValue(frozenAcf)
    })
    afterEach(() => {
      envMock.isMac = false
    })

    it('starts the monitor for native non-handoff polls on macOS and stops it on stop', () => {
      startInstallPolling(steamTestDeps, '730', 60000)
      expect(startSteamDownloadMonitor).toHaveBeenCalledWith('730')
      stopInstallPolling(steamTestDeps, '730')
      expect(stopSteamDownloadMonitor).toHaveBeenCalledWith('730')
    })

    it('upgrading an existing poll to delegated starts the monitor (idempotent)', () => {
      startInstallPolling(steamTestDeps, '730', 60000)
      startSteamDownloadMonitor.mockClear()
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 60000,
        delegatedToSteamClient: true
      })
      expect(startSteamDownloadMonitor).toHaveBeenCalledWith('730')
    })

    it.each([
      ['bottle', { source: 'bottle' as const }],
      ['native handoff', { isNativeHandoff: true }]
    ])('never starts the monitor for %s polls', (_n, opts) => {
      startInstallPolling(steamTestDeps, '730', { intervalMs: 60000, ...opts })
      expect(startSteamDownloadMonitor).not.toHaveBeenCalled()
    })

    it('never starts the monitor off macOS', () => {
      envMock.isMac = false
      startInstallPolling(steamTestDeps, '730', 60000)
      expect(startSteamDownloadMonitor).not.toHaveBeenCalled()
    })

    it('emits live percent, speed and eta while the ACF is frozen at 0', async () => {
      readSteamDownloadMonitor.mockReturnValue(live(4_368_075_856))
      startInstallPolling(steamTestDeps, '730', 60000)
      await pollInstallOnce(steamTestDeps, '730')
      jest.advanceTimersByTime(3000)
      await pollInstallOnce(steamTestDeps, '730')
      const [, second] = progressCalls()
      expect(second[1].progress.percent).toBe(50)
      expect(second[1].progress.downSpeed).toBeCloseTo(25e6 / (1024 * 1024), 5)
      expect(second[1].progress.eta).not.toBe('')
    })

    it('caps a live overshoot at 99', async () => {
      readSteamDownloadMonitor.mockReturnValue(live(8_770_693_182))
      startInstallPolling(steamTestDeps, '730', 60000)
      await pollInstallOnce(steamTestDeps, '730')
      expect(progressCalls()[0][1].progress.percent).toBe(99)
    })

    it('never reports steam-paused while the live counter advances', async () => {
      startInstallPolling(steamTestDeps, '730', 60000)
      for (let i = 1; i <= 5; i++) {
        readSteamDownloadMonitor.mockReturnValue(live(i * 100_000_000))
        await pollInstallOnce(steamTestDeps, '730')
        jest.advanceTimersByTime(3000)
      }
      for (const [, payload] of statusCalls()) {
        expect(payload.context).not.toBe('steam-paused')
      }
    })

    it('still reports steam-paused when the live counter freezes', async () => {
      readSteamDownloadMonitor.mockReturnValue(live(100_000_000))
      startInstallPolling(steamTestDeps, '730', 60000)
      for (let i = 0; i < 5; i++) {
        await pollInstallOnce(steamTestDeps, '730')
        jest.advanceTimersByTime(3000)
      }
      const calls = statusCalls()
      expect(calls[calls.length - 1][1].context).toBe('steam-paused')
    })

    it('falls back to the ACF when the monitor returns undefined', async () => {
      readSteamDownloadMonitor.mockReturnValue(undefined)
      startInstallPolling(steamTestDeps, '730', 60000)
      await pollInstallOnce(steamTestDeps, '730')
      const [call] = progressCalls()
      expect(call[1].progress.percent).toBe(0)
      expect(call[1].progress.downSpeed).toBeUndefined()
    })

    it('ignores the monitor on a bottle poll', async () => {
      jest
        .mocked(getSteamBottleSettings)
        .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
      jest.mocked(getBottleSteamappsDir).mockReturnValue('/bottle/steamapps')
      readSteamDownloadMonitor.mockReturnValue(live(5e9))
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 60000,
        source: 'bottle'
      })
      await pollInstallOnce(steamTestDeps, '730', 'bottle')
      for (const [, payload] of progressCalls()) {
        expect(payload.progress.percent).toBe(0)
      }
    })
  })

  // ── quick 261029-exu: a bridge install owns its own completion ──────────

  describe('bridge source leaves completion to installBridgeGame (quick 261029-exu)', () => {
    beforeEach(() => {
      jest
        .mocked(getBridgeBottleSettings)
        .mockReturnValue({ wineCrossoverBottle: 'GameLibSteamBridge' } as any)
      jest
        .mocked(getBottleSteamappsDir)
        .mockReturnValue(BRIDGE_BOTTLE_STEAMAPPS_ROOT)
      vdf.parse.mockReturnValue({
        AppState: {
          appid: '730',
          StateFlags: '4',
          installdir: 'csgo',
          SizeOnDisk: '50000'
        }
      })
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 60000,
        source: 'bridge',
        isNativeHandoff: true
      })
    })

    it('flips is_installed but reports finishing, not done', async () => {
      await pollInstallOnce(steamTestDeps, '730', 'bridge')
      expect(library.get('730')?.is_installed).toBe(true)
      expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
        appName: '730',
        runner: 'steam',
        status: 'installing',
        context: 'steam-bridge-finishing'
      })
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'gameStatusUpdate',
        expect.objectContaining({ status: 'done' })
      )
    })

    it('fires neither the finished toast nor the restart-Steam toast', async () => {
      await pollInstallOnce(steamTestDeps, '730', 'bridge')
      expect(notify).not.toHaveBeenCalled()
    })

    // ── quick 261031-ihs: the installer's done must not be overwritten ────
    it('261031-ihs: installer finalized first -> poller flips and persists but sends no status', async () => {
      steamTestDeps.steamInstallRuntime.polls.markBridgeInstallFinalized('730')
      await pollInstallOnce(steamTestDeps, '730', 'bridge')
      expect(library.get('730')?.is_installed).toBe(true)
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.anything()
      )
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'gameStatusUpdate',
        expect.anything()
      )
      expect(notify).not.toHaveBeenCalled()
      steamTestDeps.steamInstallRuntime.polls.clearBridgeInstallFinalized('730')
    })

    it('261031-ihs: poller first (marker unset) still reports finishing', async () => {
      steamTestDeps.steamInstallRuntime.polls.clearBridgeInstallFinalized('730')
      await pollInstallOnce(steamTestDeps, '730', 'bridge')
      expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
        appName: '730',
        runner: 'steam',
        status: 'installing',
        context: 'steam-bridge-finishing'
      })
    })

    it('261031-ihs: a cleared marker (reinstall) shows finishing again', async () => {
      steamTestDeps.steamInstallRuntime.polls.markBridgeInstallFinalized('730')
      steamTestDeps.steamInstallRuntime.polls.clearBridgeInstallFinalized('730')
      await pollInstallOnce(steamTestDeps, '730', 'bridge')
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'gameStatusUpdate',
        expect.objectContaining({ context: 'steam-bridge-finishing' })
      )
    })

    it('261031-ihs: the marker is per appId', () => {
      steamTestDeps.steamInstallRuntime.polls.markBridgeInstallFinalized('730')
      expect(
        steamTestDeps.steamInstallRuntime.polls.isBridgeInstallFinalized('730')
      ).toBe(true)
      expect(
        steamTestDeps.steamInstallRuntime.polls.isBridgeInstallFinalized('440')
      ).toBe(false)
      steamTestDeps.steamInstallRuntime.polls.clearBridgeInstallFinalized('730')
      expect(
        steamTestDeps.steamInstallRuntime.polls.isBridgeInstallFinalized('730')
      ).toBe(false)
    })
  })

  it('GAME-02: does NOT fire notify on the "downloading" branch (interim tick, no toast)', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    await pollInstallOnce(steamTestDeps, '730')
    expect(notify).not.toHaveBeenCalled()
  })

  // ── D-UAT-04 (21-16): GameLib handoff (StateFlags===1026) waiting signal ──

  it('emits gameStatusUpdate with context "steam-waiting-for-restart" when StateFlags parses to exactly 1026 on a native-ON handoff poll (GameLib handoff)', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '1026',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    // debug/steam-1026-download-restart: StateFlags 1026 alone is NOT enough
    // — must also be a poll started for GameLib's own finished handoff.
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true
    })
    await pollInstallOnce(steamTestDeps, '730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        status: 'installing',
        context: 'steam-waiting-for-restart'
      })
    )
  })

  // ── quick 261030-o77: a bottle-source 1026 is incomplete + resumable ──────

  describe('bottle-source 1026 handoff (quick 261030-o77)', () => {
    const mockAcf = (flags: string) =>
      vdf.parse.mockReturnValue({
        AppState: {
          appid: '730',
          StateFlags: flags,
          installdir: 'csgo',
          SizeOnDisk: '0'
        }
      })
    const startBottleHandoff = () => {
      jest
        .mocked(getSteamBottleSettings)
        .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
      jest.mocked(getBottleSteamappsDir).mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 60000,
        source: 'bottle',
        isNativeHandoff: true
      })
    }

    beforeEach(() => {
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
    })

    it('a bottle-source poll at 1026 marks the install incomplete and resumable, stops the poll, and sends no bottled-Steam context or notify', async () => {
      mockAcf('1026')
      startBottleHandoff()
      await pollInstallOnce(steamTestDeps, '730', 'bottle')

      const entry = library.get('730')
      expect(entry?.is_installed).toBe(false)
      expect(entry?.install?.steamResumePending).toBe(true)
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({
          app_name: '730',
          is_installed: false,
          install: expect.objectContaining({ steamResumePending: true })
        })
      )
      expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
        appName: '730',
        runner: 'steam',
        status: 'done'
      })
      const contexts = sendFrontendMessage.mock.calls
        .filter(([channel]) => channel === 'gameStatusUpdate')
        .map(([, payload]) => (payload as { context?: string }).context)
      expect(contexts.every((c) => c === undefined)).toBe(true)
      expect(notify).not.toHaveBeenCalled()
      expect(i18nextT).not.toHaveBeenCalledWith(
        'steam.waitingForSteam.notify',
        expect.anything(),
        expect.anything()
      )
    })

    it('a bottle-source poll at StateFlags 4 is installed on the first tick (fast path unchanged)', async () => {
      mockAcf('4')
      startBottleHandoff()
      await pollInstallOnce(steamTestDeps, '730', 'bottle')

      expect(library.get('730')?.is_installed).toBe(true)
      expect(library.get('730')?.install?.steamResumePending).not.toBe(true)
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'gameStatusUpdate',
        expect.objectContaining({ appName: '730', status: 'done' })
      )
    })

    it('a native handoff at 1026 still emits steam-waiting-for-restart and the native notify', async () => {
      mockAcf('1026')
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 60000,
        isNativeHandoff: true
      })
      await pollInstallOnce(steamTestDeps, '730')
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'gameStatusUpdate',
        expect.objectContaining({ context: 'steam-waiting-for-restart' })
      )
      expect(library.get('730')?.install?.steamResumePending).not.toBe(true)
      expect(i18nextT).toHaveBeenCalledWith(
        'steam.waitingForSteam.notify',
        expect.any(String),
        expect.anything()
      )
    })

    it('a bridge-source poll at 1026 is not converted to incomplete', async () => {
      mockAcf('1026')
      jest
        .mocked(getBridgeBottleSettings)
        .mockReturnValue({ wineCrossoverBottle: 'GameLibSteamBridge' } as any)
      jest.mocked(getBottleSteamappsDir).mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 60000,
        source: 'bridge',
        isNativeHandoff: true
      })
      await pollInstallOnce(steamTestDeps, '730', 'bridge')
      expect(library.get('730')?.install?.steamResumePending).not.toBe(true)
    })
  })

  // ── debug/wazhack-uninstall-reverts: restart-Steam notify must also fire ──
  // for the StateFlags=4 fast path, not just the 1026 handoff path. Before
  // this fix, GAMELIB_HANDOFF_STATE_FLAGS (1026) gated the ONLY "restart
  // Steam" notify() call, and that check lived inside the 'downloading'
  // branch — a fast-path install (canWriteFullOwnership, Phase 23) never
  // passes through 'downloading' at all, since readAcfState() returns
  // state:'installed' the very first time isFullyInstalledStateFlags(4) is
  // true. The notification was therefore structurally unreachable for this
  // path (see Round 3's root-cause writeup).

  it('fires the "Restart Steam to finish installing" notify on the "installed" branch (StateFlags=4 fast path) when isNativeHandoff is true', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    // Mirrors games.ts's runNativeDepotDownload() call site: isNativeHandoff
    // is set true immediately after GameLib's OWN depot download finishes,
    // BEFORE it's known whether the resulting ACF lands on 1026 or the
    // StateFlags=4 fast path — see games.ts ~L1543-1550.
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true
    })
    await pollInstallOnce(steamTestDeps, '730')
    // i18next mock (top of file) returns the fallback string verbatim,
    // ignoring interpolation options — matches this file's existing
    // convention for asserting notify() body text.
    expect(notify).toHaveBeenCalledWith({
      title: 'CS:GO',
      body: 'Restart Steam to finish installing {{game}}'
    })
  })

  // ── quick 261029-ji2: native Mac route (Play restarts Steam to adopt) ───────
  it('261029-ji2: a macNativeRoute StateFlags 4 poll fires Installation Finished and NOT the "Restart Steam" notify', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true,
      macNativeRoute: true
    })
    await pollInstallOnce(steamTestDeps, '730')
    expect(notify).not.toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('Restart Steam to finish installing')
      })
    )
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Installation Finished' })
    )
  })

  it('261029-ji2: a second startInstallPolling call carrying macNativeRoute upgrades the registered poll', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startInstallPolling(steamTestDeps, '730', 60000)
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true,
      macNativeRoute: true
    })
    await pollInstallOnce(steamTestDeps, '730')
    expect(notify).not.toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('Restart Steam to finish installing')
      })
    )
  })

  it('261029-ji2: a macNativeRoute poll at StateFlags 1026 (fail-closed handoff, not FullyInstalled) keeps the waiting state and restart hint', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '1026',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true,
      macNativeRoute: true
    })
    await pollInstallOnce(steamTestDeps, '730')
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('Restart Steam to finish installing')
      })
    )
  })

  it('does NOT fire the "Restart Steam" notify on the "installed" branch for an OFF-path poll (Steam owns the download, isNativeHandoff false/absent) — no regression on the ordinary install-finished flow', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startInstallPolling(steamTestDeps, '730', 60000) // OFF-path, no isNativeHandoff
    await pollInstallOnce(steamTestDeps, '730')
    expect(notify).not.toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('Restart Steam to finish installing')
      })
    )
  })

  // ── 23.2-04 (D-06/D-07): the depot-skip completion notice ─────────────────
  // The i18next mock (top of file) returns the fallback string verbatim,
  // discarding interpolation options — so an assertion on notify()'s body
  // text can only ever see the literal {{depots}} placeholder. It proves the
  // call site fired, and proves NOTHING about the depot id reaching the
  // user. The non-vacuous assertion in every case below is on the captured
  // i18nextT call's OPTIONS object, not the notify() body.

  it('23.2-04: fires the skip notice and names the depot via the i18nextT options object (not just the fallback body)', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true,
      skippedDepots: ['1771304']
    })
    await pollInstallOnce(steamTestDeps, '730')

    expect(notify).toHaveBeenCalledWith({
      title: 'CS:GO',
      body: "Installed without depot {{depots}}. Steam wouldn't release its key for this account, so that content was skipped — the game should still run."
    })
    // The non-vacuous half: without this assertion, a body-only check would
    // pass equally well against an implementation that never interpolates
    // anything at all.
    expect(i18nextT).toHaveBeenCalledWith(
      'steam.download.notify.depotSkipped',
      expect.any(String),
      { depots: '1771304' }
    )
  })

  it("23.2-04: the depotSkipped interpolation options object never carries a 'count' key — i18next reserves it for pluralization", async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true,
      skippedDepots: ['1771304']
    })
    await pollInstallOnce(steamTestDeps, '730')

    const depotSkippedCall = (i18nextT as jest.Mock).mock.calls.find(
      ([key]) => key === 'steam.download.notify.depotSkipped'
    )
    expect(depotSkippedCall).toBeDefined()
    const options = depotSkippedCall![2]
    expect(options).not.toHaveProperty('count')
  })

  it('23.2-04: joins several skipped depot ids into a single comma-separated interpolation value', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true,
      skippedDepots: ['1771304', '1771310']
    })
    await pollInstallOnce(steamTestDeps, '730')

    expect(i18nextT).toHaveBeenCalledWith(
      'steam.download.notify.depotSkipped',
      expect.any(String),
      { depots: '1771304, 1771310' }
    )
  })

  it('23.2-04: fires all THREE notices in one confirmed-installed tick (finished, skipped, restart Steam) — this is the regression guard for the shared-guard trap', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true,
      skippedDepots: ['1771304']
    })
    await pollInstallOnce(steamTestDeps, '730')

    expect(notify).toHaveBeenCalledTimes(3)
    expect(notify).toHaveBeenNthCalledWith(1, {
      title: 'CS:GO',
      body: 'Installation Finished'
    })
    expect(notify).toHaveBeenNthCalledWith(2, {
      title: 'CS:GO',
      body: "Installed without depot {{depots}}. Steam wouldn't release its key for this account, so that content was skipped — the game should still run."
    })
    expect(notify).toHaveBeenNthCalledWith(3, {
      title: 'CS:GO',
      body: 'Restart Steam to finish installing {{game}}'
    })
  })

  it('23.2-04: fires the skip notice at most once — two consecutive pollInstallOnce calls against the same poll produce exactly one skip notice', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true,
      skippedDepots: ['1771304']
    })
    await pollInstallOnce(steamTestDeps, '730')
    // pollInstallOnce's confirmed-installed branch calls stopInstallPolling()
    // itself once the ACF confirms installed, so this second call — with no
    // re-registration in between — is the literal "two consecutive
    // pollInstallOnce calls" the plan specifies. Without notifiedDepotSkipped
    // this would double-fire whenever a caller invokes pollInstallOnce twice
    // before the interval-driven poll loop has a chance to notice the entry
    // is gone (e.g. an overlapping manual re-check from a frontend refresh).
    await pollInstallOnce(steamTestDeps, '730')

    const skipNoticeCalls = (i18nextT as jest.Mock).mock.calls.filter(
      ([key]) => key === 'steam.download.notify.depotSkipped'
    )
    expect(skipNoticeCalls).toHaveLength(1)
  })

  it('23.2-04: silent when no depot was skipped — an empty skippedDepots list fires no skip notice and leaves the ordinary Installation Finished toast unaffected', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true,
      skippedDepots: []
    })
    await pollInstallOnce(steamTestDeps, '730')

    expect(i18nextT).not.toHaveBeenCalledWith(
      'steam.download.notify.depotSkipped',
      expect.anything(),
      expect.anything()
    )
    expect(notify).toHaveBeenCalledWith({
      title: 'CS:GO',
      body: 'Installation Finished'
    })
  })

  it('23.2-04: silent on an OFF-path poll (Steam owns the download, bare-number call signature) — mirrors the existing OFF-path negative test shape', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startInstallPolling(steamTestDeps, '730', 60000) // bare-number signature, OFF-path
    await pollInstallOnce(steamTestDeps, '730')

    expect(i18nextT).not.toHaveBeenCalledWith(
      'steam.download.notify.depotSkipped',
      expect.anything(),
      expect.anything()
    )
  })

  // ── RED-proof: reusing notifiedWaiting for the skip guard fails the
  // coexistence case above. Observed by temporarily replacing
  // notifiedDepotSkipped with notifiedWaiting at both the guard-read and
  // guard-write sites in library.ts's confirmed-installed branch, rerunning
  // just the coexistence test, and reverting. Recorded in the plan SUMMARY.

  // ── debug/steam-1026-download-restart: the 1026-collision regression ──────

  it('regression: an OFF-path poll (Steam owns the download, no isNativeHandoff) at StateFlags 1026 with advancing bytes emits normal "installing" progress, NEVER "steam-waiting-for-restart"', async () => {
    vdf.parse
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '1026',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '1000000',
          BytesToDownload: '10000000'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '1026',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '3000000',
          BytesToDownload: '10000000'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '1026',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '5000000',
          BytesToDownload: '10000000'
        }
      })
    // No isNativeHandoff — mirrors games.ts's OFF-path startInstallPolling
    // calls (steam://install handoff).
    startInstallPolling(steamTestDeps, '730', 60000)
    for (let i = 0; i < 3; i++) {
      await pollInstallOnce(steamTestDeps, '730')
      jest.advanceTimersByTime(3000)
    }

    const statusCalls = sendFrontendMessage.mock.calls.filter(
      ([channel]) => channel === 'gameStatusUpdate'
    )
    for (const [, payload] of statusCalls) {
      expect(payload.status).toBe('installing')
      expect(payload.context).not.toBe('steam-waiting-for-restart')
    }
    expect(notify).not.toHaveBeenCalled()

    const progressCalls = sendFrontendMessage.mock.calls.filter(
      ([channel]) => channel === 'progressUpdate'
    )
    expect(progressCalls.length).toBeGreaterThan(0)
    for (const [, payload] of progressCalls) {
      expect(Number.isFinite(payload.progress.percent)).toBe(true)
      expect(payload.progress.percent).toBeGreaterThan(0)
    }
  })

  it('regression: the cold-start tick of an OFF-path 1026 poll (no prior baseline) never flashes "steam-waiting-for-restart"', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '1026',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '1000000',
        BytesToDownload: '10000000'
      }
    })
    startInstallPolling(steamTestDeps, '730', 60000) // OFF-path, no isNativeHandoff
    await pollInstallOnce(steamTestDeps, '730') // very first tick — no lastBytesDownloaded baseline yet

    const call = sendFrontendMessage.mock.calls.find(
      ([channel]) => channel === 'gameStatusUpdate'
    )
    expect(call![1].context).not.toBe('steam-waiting-for-restart')
  })

  it('regression: StateFlags 1042 (0x400|0x2|0x10, active download, never === 1026) still emits normal progress regardless of isNativeHandoff', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '1042',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '5',
        BytesToDownload: '10'
      }
    })
    await pollInstallOnce(steamTestDeps, '730')
    const call = sendFrontendMessage.mock.calls.find(
      ([channel]) => channel === 'gameStatusUpdate'
    )
    expect(call![1].status).toBe('installing')
    expect(call![1].context).toBeUndefined()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'progressUpdate',
      expect.objectContaining({
        progress: expect.objectContaining({ percent: 50 })
      })
    )
  })

  it('does NOT set a context on the plain active-download branch (StateFlags=2, non-1026)', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    await pollInstallOnce(steamTestDeps, '730')
    const call = sendFrontendMessage.mock.calls.find(
      ([channel]) => channel === 'gameStatusUpdate'
    )
    expect(call![1].context).toBeUndefined()
  })

  it('fires the "restart Steam" notification exactly once across multiple poll calls while StateFlags stays 1026 (native-ON handoff poll)', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '1026',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    // debug/steam-1026-download-restart: isNativeHandoff:true — register the
    // activePolls entry AS a native-ON handoff poll so notifiedWaiting can gate.
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true
    })
    await pollInstallOnce(steamTestDeps, '730')
    await pollInstallOnce(steamTestDeps, '730')
    await pollInstallOnce(steamTestDeps, '730')
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith({
      title: 'CS:GO',
      body: 'Restart Steam to finish installing {{game}}'
    })
  })

  it('regression: does NOT fire the waiting notification for an OFF-path poll (no isNativeHandoff) even while StateFlags stays 1026', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '1026',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '1000000',
        BytesToDownload: '10000000'
      }
    })
    startInstallPolling(steamTestDeps, '730', 60000) // OFF-path, no isNativeHandoff
    await pollInstallOnce(steamTestDeps, '730')
    await pollInstallOnce(steamTestDeps, '730')
    await pollInstallOnce(steamTestDeps, '730')
    expect(notify).not.toHaveBeenCalled()
  })

  it('does NOT fire the waiting notification for a non-1026 active download', async () => {
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    startInstallPolling(steamTestDeps, '730', 60000)
    await pollInstallOnce(steamTestDeps, '730')
    await pollInstallOnce(steamTestDeps, '730')
    expect(notify).not.toHaveBeenCalled()
  })

  // ── 17-03: pollInstallOnce(appId, 'bottle') — Pitfall 3 platform label ─────

  it('a bottle-sourced install object has platform === "Windows" even when isMac is mocked true', async () => {
    const envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isLinux = false
    try {
      jest
        .mocked(getSteamBottleSettings)
        .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
      jest.mocked(getBottleSteamappsDir).mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
      vdf.parse.mockReturnValue({
        AppState: {
          appid: '730',
          StateFlags: '4',
          installdir: 'csgo',
          SizeOnDisk: '50000'
        }
      })
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 60000,
        source: 'bottle'
      })
      await pollInstallOnce(steamTestDeps, '730', 'bottle')
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({
          app_name: '730',
          is_installed: true,
          install: expect.objectContaining({ platform: 'Windows' })
        })
      )
    } finally {
      envMock.isMac = false
      envMock.isLinux = true
    }
  })

  // ── GAP-17-PFX86-PATH: win32-layout bottle platform label ──────────────────
  it('a bottle-sourced install object from a win32-layout bottle still has platform === "Windows"', async () => {
    jest
      .mocked(getSteamBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
    jest
      .mocked(getBottleSteamappsDir)
      .mockReturnValue(WIN32_BOTTLE_STEAMAPPS_ROOT)
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      source: 'bottle'
    })
    await pollInstallOnce(steamTestDeps, '730', 'bottle')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({
        app_name: '730',
        is_installed: true,
        install: expect.objectContaining({ platform: 'Windows' })
      })
    )
  })

  // ── D-05/D-15: bottle-source poller reads a hand-written GameLib manifest
  // identically to native — no poller code change required for D-15 reuse ────
  it('D-15: a hand-written GameLib 1026 manifest in the bottle steamapps root reads as "installing" via the UNCHANGED bottle poller', async () => {
    jest
      .mocked(getSteamBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
    jest.mocked(getBottleSteamappsDir).mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        Universe: '1',
        StateFlags: '1026',
        installdir: 'csgo',
        name: 'CS:GO',
        LastUpdated: '1700000000',
        SizeOnDisk: '123',
        buildid: '0',
        LastOwner: '76561197960287930',
        BytesToDownload: '0',
        BytesDownloaded: '0',
        AutoUpdateBehavior: '0',
        InstalledDepots: {},
        UserConfig: {},
        MountedDepots: {}
      }
    })
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      source: 'bottle'
    })
    await pollInstallOnce(steamTestDeps, '730', 'bottle')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        status: 'installing'
      })
    )
  })
})
