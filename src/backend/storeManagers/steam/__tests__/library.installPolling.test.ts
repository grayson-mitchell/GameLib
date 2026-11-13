import {
  createTestManagerDeps,
  createInertSteamProcesses,
  createTestStores
} from 'backend/testUtils/testServices'
/**
 * Unit tests for steam/library/installPolling.ts (startInstallPolling, cancelDelegatedInstall, isDelegatedInstallPolling) and installStop.ts (stopInstallPolling), incl. the install-poll setInterval/unref contract (D-10).
 * Moved out of library.test.ts by Phase 65 plan 04 (D-03); mock preamble
 * copied.
 */

// ── Imports ───────────────────────────────────────────────────────────────────
import { stopInstallPolling } from '../library/installStop'
import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import {
  vdf,
  mockedFsSteamFiles
} from '../localFiles/__tests__/fixtures/mockedFsSteamFiles'
import { getSteamLibraries } from 'backend/utils'
const sendFrontendMessage = jest.fn()
import { notify } from '../../../dialog/dialog'
import { t as i18nextT } from 'i18next'
import { backfillBridgeLaunchTargets } from '../bridge/launchTarget'
import { getBottleSteamappsDir } from '../bottle'
import { listReadyBridgeBottleNames } from '../bridgeBottle'
import { join } from 'path'
import {
  startInstallPolling,
  cancelDelegatedInstall,
  isDelegatedInstallPolling
} from '../library/installPolling'
import { MAX_TICKS } from '../library/pollState'
import { at } from './fixtures/indexed'
import type { Stores } from 'backend/services/types'

const steamStoresModule = jest.requireMock<Stores['steam']>('../stores')

// 66.3-15: the bottle settings are read through the deps slice, not a module import.
const getSteamBottleSettings = jest.fn()

const steamTestDeps = createTestManagerDeps({
  requestRustInvoke: mockedFsSteamFiles().requestRustInvoke,
  sendFrontendMessage,
  steamBottle: { getSteamBottleSettings } as never,
  steamProcesses: createInertSteamProcesses(),
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

// ── depot mock — downloadSteamDepots
// (must NEVER be invoked from startup resume — Pitfall 4, no silent re-download) ─
jest.mock('../depot', () => ({
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

// ── D-07: startInstallPolling / stopInstallPolling ────────────────────────────

describe('startInstallPolling() idempotency and stopInstallPolling()', () => {
  // 260822-dkf: isolated per-test so no test below (the CR-01 grace test at
  // 4785, or the bottle-source test after it) inherits a mocked
  // isNativeInstallInFlight registry from a test above it.
  let isNativeInstallInFlightSpy: jest.SpyInstance | undefined

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
    jest.mocked(getSteamLibraries).mockResolvedValue([])
  })

  afterEach(() => {
    stopInstallPolling(steamTestDeps, '730')
    stopInstallPolling(steamTestDeps, '731')
    isNativeInstallInFlightSpy?.mockRestore()
    isNativeInstallInFlightSpy = undefined
    jest.useRealTimers()
  })

  it('calling startInstallPolling twice for the same appId creates only one setInterval', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval')
    startInstallPolling(steamTestDeps, '730', 3000)
    startInstallPolling(steamTestDeps, '730', 3000) // idempotent — second call is a no-op
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    setIntervalSpy.mockRestore()
  })

  it('stopInstallPolling clears the entry so startInstallPolling can register a new interval', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval')
    startInstallPolling(steamTestDeps, '730', 3000)
    stopInstallPolling(steamTestDeps, '730')
    startInstallPolling(steamTestDeps, '730', 3000) // new registration — entry was cleared by stop
    expect(setIntervalSpy).toHaveBeenCalledTimes(2)
    setIntervalSpy.mockRestore()
  })

  // CR-01 regression: cancelling Steam's install dialog (no manifest ever
  // appears) must emit a terminal 'done' after the grace window so the DM queue
  // badge clears — removeFromQueue suppresses 'done' for steam and relies on
  // this poller. Symmetric to the uninstall grace path.
  it('emits gameStatusUpdate { status:"done" } after the grace window when no manifest ever appears (CR-01)', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false) // manifest never appears
    jest.mocked(sendFrontendMessage).mockClear()
    const interval = 10
    startInstallPolling(steamTestDeps, '730', interval)
    // GRACE_TICKS (20) + 1 ticks so the grace branch fires
    await jest.advanceTimersByTimeAsync(interval * 21)
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        status: 'done'
      })
    )
  })

  // 74-27 (T-74-92): the queue holds 'updating' through a Steam hand-off, so every end of an
  // update-aware poll must send a terminal 'done'. The MAX_TICKS cap was the one silent stop.
  describe('installAppRetry carry-through (74-30)', () => {
    const retry = { libraryPath: '/lib', attempts: 0 }
    const entryOf = () =>
      steamTestDeps.steamInstallRuntime.polls.activePolls.get('730')

    it('fresh poll keeps installAppRetry on awaitingUpdate', () => {
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 10,
        delegatedToSteamClient: true,
        awaitingUpdate: {
          fromBuild: '1',
          targetBuild: '2',
          installAppRetry: retry
        }
      })
      expect(entryOf()?.awaitingUpdate?.installAppRetry).toEqual(retry)
    })

    it('existing-entry upgrade keeps installAppRetry on awaitingUpdate', () => {
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 10,
        delegatedToSteamClient: true
      })
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 10,
        delegatedToSteamClient: true,
        awaitingUpdate: {
          fromBuild: '1',
          targetBuild: '2',
          installAppRetry: retry
        }
      })
      expect(entryOf()?.awaitingUpdate?.installAppRetry).toEqual(retry)
    })

    it('options without installAppRetry leave no installAppRetry key', () => {
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 10,
        delegatedToSteamClient: true,
        awaitingUpdate: { fromBuild: '1', targetBuild: '2' }
      })
      expect(entryOf()?.awaitingUpdate).not.toHaveProperty('installAppRetry')
    })
  })

  describe('MAX_TICKS cap terminal status (74-27)', () => {
    const capTick = async (
      options?: Parameters<typeof startInstallPolling>[2]
    ) => {
      jest.mocked(sendFrontendMessage).mockClear()
      startInstallPolling(steamTestDeps, '730', options)
      const entry =
        steamTestDeps.steamInstallRuntime.polls.activePolls.get('730')
      if (!entry) throw new Error('poll not registered')
      entry.ticks = MAX_TICKS
      await jest.advanceTimersByTimeAsync(10)
      expect(
        steamTestDeps.steamInstallRuntime.polls.activePolls.has('730')
      ).toBe(false)
    }
    const doneCalls = () =>
      jest
        .mocked(sendFrontendMessage)
        .mock.calls.filter(
          ([ch, p]) =>
            ch === 'gameStatusUpdate' &&
            (p as { status?: string }).status === 'done'
        )

    it('an update-aware poll sends done when the cap stops it', async () => {
      await capTick({
        intervalMs: 10,
        delegatedToSteamClient: true,
        awaitingUpdate: { fromBuild: '1' }
      })
      expect(doneCalls()).toHaveLength(1)
      expect(doneCalls()[0]?.[1]).toMatchObject({
        appName: '730',
        runner: 'steam'
      })
    })

    it('an install poll at the cap stays silent, as before', async () => {
      await capTick({ intervalMs: 10 })
      expect(doneCalls()).toHaveLength(0)
    })
  })

  // ── 260822-dkf: the grace window's provenance test ─────────────────────────
  // D-01: the discriminator is isNativeInstallInFlight(appId), NOT
  // isNativeHandoff (three of four startInstallPolling call sites leave
  // isNativeHandoff false, and two of those three are exactly the paths
  // whose cancel detection Test B below protects). Read PER-TICK, never
  // captured at poll-start — resumeInterruptedSteamInstall's poll is created
  // BEFORE the native depot run registers itself as in-flight.

  // Test A (RED at HEAD — 260822-dkf): a live native download must survive
  // the grace window. D-08: GameLib deliberately writes the ACF only at
  // finalize, so `existsSync` staying false for the whole download is NORMAL
  // for this path, not a cancellation signal — the fixture sets BOTH halves
  // (no manifest on disk AND the download registered as live) because the
  // defect is precisely that the code cannot tell those two states apart. If
  // this test can be made to pass without changing the grace condition, the
  // fixture is wrong (per PLAN.md's falsifier).
  it('Test A (260822-dkf, regression pin): a live native depot download survives the grace window — never emits terminal "done" and keeps polling past GRACE_TICKS', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(false) // D-08: no manifest yet is NORMAL mid-download on this path
    isNativeInstallInFlightSpy = jest
      .spyOn(steamTestDeps.steamSession.gameSession, 'isNativeInstallInFlight')
      .mockReturnValue(true) // GameLib's own depot run is streaming chunks right now
    jest.mocked(sendFrontendMessage).mockClear()

    const interval = 10
    startInstallPolling(steamTestDeps, '730', interval)
    // GRACE_TICKS (20) + 1 ticks — the point where the (defective) grace
    // branch would fire.
    await jest.advanceTimersByTimeAsync(interval * 21)

    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        status: 'done'
      })
    )

    // Behavioural "the loop is still running" proof — assert on ticks
    // continuing to happen (existsSync is called once per tick inside
    // readAcfState), never on activePolls/clearInterval internals.
    const ticksSoFar = (existsSync as jest.Mock).mock.calls.length
    await jest.advanceTimersByTimeAsync(interval * 5)
    expect((existsSync as jest.Mock).mock.calls.length).toBeGreaterThan(
      ticksSoFar
    )
  })

  // Test B (GREEN at HEAD, must STAY GREEN — pair-partner of Test A): the
  // steam://install / bottle path's cancel detection is untouched.
  // isNativeInstallInFlight is spied explicitly (rather than relying on the
  // ambient default) so this pin cannot pass by accident — it protects the
  // grace window's original CR-01 purpose.
  it('Test B (260822-dkf, interaction pin): a poll with no live native download still stops with "done" after the grace window — cancel detection is intact', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(false)
    isNativeInstallInFlightSpy = jest
      .spyOn(steamTestDeps.steamSession.gameSession, 'isNativeInstallInFlight')
      .mockReturnValue(false) // Steam (or the bottle) owns this download, not GameLib
    jest.mocked(sendFrontendMessage).mockClear()

    const interval = 10
    startInstallPolling(steamTestDeps, '730', interval)
    await jest.advanceTimersByTimeAsync(interval * 21)

    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        status: 'done'
      })
    )
  })

  // Test C (RED at HEAD — D-02): the finalize-time handoff start
  // (games.ts:1720/1726) arrives WHILE the download poll from
  // resumeInterruptedSteamInstall is still registered. Before this task, the
  // grace window killed that download poll first, so the handoff call always
  // landed on an EMPTY registry and created a fresh entry. Once Test A's fix
  // lets the download poll survive, this call must UPGRADE the existing
  // entry instead of no-opping — otherwise isNativeHandoff/skippedDepots
  // never reach it and library.ts:2351/2547's restart-notify and the
  // skippedDepots notice silently stop firing.
  it('Test C (260822-dkf, D-02 regression pin): the finalize-time handoff start upgrades a live download poll instead of no-opping', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    isNativeInstallInFlightSpy = jest
      .spyOn(steamTestDeps.steamSession.gameSession, 'isNativeInstallInFlight')
      .mockReturnValue(true)

    // Call 1 — mirrors resumeInterruptedSteamInstall's bare download poll.
    startInstallPolling(steamTestDeps, '730', 10)
    // Call 2 — mirrors games.ts:1720/1726's finalize-time handoff start,
    // arriving while call 1's entry is still registered.
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 10,
      isNativeHandoff: true,
      skippedDepots: []
    })

    // Drive readAcfState to the 'installed' shape — same fixture shape as
    // the existing 'fires the "Restart Steam..." isNativeHandoff true' test
    // above (StateFlags=4 fast path).
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })

    await jest.advanceTimersByTimeAsync(10)

    // The observable proxy for entry.isNativeHandoff === true at
    // library.ts:2547 — only fires if call 2 actually reached the entry.
    expect(notify).toHaveBeenCalledWith({
      title: 'CS:GO',
      body: 'Restart Steam to finish installing {{game}}'
    })
  })

  // Test D (GREEN at HEAD, must STAY GREEN — interaction pin with Test C): a
  // bare call arriving AFTER the finalize-time handoff upgrade must not
  // downgrade isNativeHandoff back to false, and must not create a second
  // interval. Framed as a before/after COMPARISON (not a fixed expected
  // value) via the 'downloading'-branch context field — which is recomputed
  // every tick with no fire-once guard, unlike notify() — so this stays
  // green whether or not the upgrade itself is fixed (that is Test C's job)
  // and would only fail if a bare call actively cleared the flag.
  it('Test D (260822-dkf, interaction pin): a bare call after the handoff upgrade does not clear isNativeHandoff, and never creates a second interval', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
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
    jest.mocked(sendFrontendMessage).mockClear()
    const setIntervalSpy = jest.spyOn(global, 'setInterval')

    startInstallPolling(steamTestDeps, '730', 10) // call 1: bare download poll
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 10,
      isNativeHandoff: true,
      skippedDepots: []
    }) // call 2: finalize-time handoff upgrade
    await jest.advanceTimersByTimeAsync(10) // tick — observe state BEFORE the extra bare call

    const gameStatusCalls = () =>
      sendFrontendMessage.mock.calls.filter(
        ([channel]) => channel === 'gameStatusUpdate'
      )
    const contextBefore = gameStatusCalls().at(-1)?.[1]?.context

    startInstallPolling(steamTestDeps, '730', 10) // call 3: the extra bare call under test

    await jest.advanceTimersByTimeAsync(10) // tick — observe state AFTER
    const contextAfter = gameStatusCalls().at(-1)?.[1]?.context

    expect(contextAfter).toBe(contextBefore)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)

    setIntervalSpy.mockRestore()
  })

  // ── 261027-g9o: handoff call adopts its explicit source ────────────────────
  //
  // Root cause: resumeInterruptedSteamInstall starts a bare (source 'native')
  // poll; games.ts's finalize handoff then arrives with source 'bottle' +
  // isNativeHandoff:true, but the upgrade branch never adopted `source`, so the
  // poll kept reading native roots and hit the false grace-window cancel
  // warning. Test E is RED at HEAD; Tests F and G are interaction pins (GREEN
  // at HEAD, must stay green): non-handoff / source-less calls never retarget.

  const g9oAcf = {
    AppState: {
      appid: '730',
      StateFlags: '4',
      installdir: 'csgo',
      SizeOnDisk: '50000'
    }
  }
  const g9oLogger = () =>
    jest.requireMock<{ logInfo: jest.Mock; logWarning: jest.Mock }>(
      'backend/logger'
    )

  /** Manifest exists ONLY under the bottle root, never under /steam. */
  const arrangeBottleOnlyManifest = () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    jest
      .mocked(getSteamBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
    jest.mocked(getBottleSteamappsDir).mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
    ;(existsSync as jest.Mock).mockImplementation((p: unknown) =>
      String(p).startsWith(BOTTLE_STEAMAPPS_ROOT)
    )
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    vdf.parse.mockReturnValue(g9oAcf)
    isNativeInstallInFlightSpy = jest
      .spyOn(steamTestDeps.steamSession.gameSession, 'isNativeInstallInFlight')
      .mockReturnValue(false)
    jest.mocked(sendFrontendMessage).mockClear()
    g9oLogger().logInfo.mockClear()
    g9oLogger().logWarning.mockClear()
  }
  const graceWarnings = () =>
    g9oLogger().logWarning.mock.calls.filter(([m]) =>
      String(m).includes('stopped after grace window')
    )
  const installedPushes = () =>
    sendFrontendMessage.mock.calls.filter(
      ([channel, payload]) =>
        channel === 'pushGameToLibrary' &&
        payload?.app_name === '730' &&
        payload?.is_installed === true
    )

  it('Test E (261027-g9o): a bare native poll upgraded by the bottle handoff reads the bottle root and reaches installed', async () => {
    try {
      arrangeBottleOnlyManifest()
      startInstallPolling(steamTestDeps, '730', 10) // resume-shaped bare native poll
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 10,
        source: 'bottle',
        isNativeHandoff: true,
        skippedDepots: []
      }) // finalize-shaped handoff
      await jest.advanceTimersByTimeAsync(10 * 21)

      expect(installedPushes().length).toBeGreaterThan(0)
      expect(graceWarnings()).toHaveLength(0)
      expect(
        g9oLogger().logInfo.mock.calls.some(([m]) =>
          String(m).includes('from source native to bottle')
        )
      ).toBe(true)
    } finally {
      ;(existsSync as jest.Mock).mockReturnValue(true)
    }
  })

  it('Test F (261027-g9o, interaction pin): an options call with source but no isNativeHandoff never retargets the poll', async () => {
    try {
      arrangeBottleOnlyManifest()
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 10,
        source: 'bottle'
      })
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 10,
        source: 'native'
      })
      await jest.advanceTimersByTimeAsync(10 * 21)

      expect(installedPushes().length).toBeGreaterThan(0)
      expect(
        g9oLogger().logInfo.mock.calls.some(([m]) =>
          String(m).includes('switching in-flight install poll')
        )
      ).toBe(false)
    } finally {
      ;(existsSync as jest.Mock).mockReturnValue(true)
    }
  })

  it('Test G (261027-g9o, interaction pin): a handoff call with no source key never resets a bottle poll to native', async () => {
    try {
      arrangeBottleOnlyManifest()
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 10,
        source: 'bottle'
      })
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 10,
        isNativeHandoff: true,
        skippedDepots: []
      })
      await jest.advanceTimersByTimeAsync(10 * 21)

      expect(installedPushes().length).toBeGreaterThan(0)
      expect(graceWarnings()).toHaveLength(0)
    } finally {
      ;(existsSync as jest.Mock).mockReturnValue(true)
    }
  })

  // ── quick 261024-exo: delegatedToSteamClient poll lifecycle ────────────────

  const delegatedAcf = (flags: string) => ({
    AppState: {
      appid: '730',
      StateFlags: flags,
      installdir: 'csgo',
      SizeOnDisk: '0',
      BytesDownloaded: '5000000',
      BytesToDownload: '10000000'
    }
  })
  const doneCalls = () =>
    sendFrontendMessage.mock.calls.filter(
      ([channel, payload]) =>
        channel === 'gameStatusUpdate' && payload?.status === 'done'
    )

  it('D1: a delegated poll survives the 60 s grace window with no manifest, and stops with an in-app notice (no notify()) after STEAM_REQUEST_NO_ACTIVITY_TICKS', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(false)
    isNativeInstallInFlightSpy = jest
      .spyOn(steamTestDeps.steamSession.gameSession, 'isNativeInstallInFlight')
      .mockReturnValue(false)
    jest.mocked(sendFrontendMessage).mockClear()
    ;(notify as jest.Mock).mockClear()
    g9oLogger().logWarning.mockClear()

    const interval = 10
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: interval,
      delegatedToSteamClient: true
    })
    await jest.advanceTimersByTimeAsync(interval * 21)
    expect(doneCalls()).toHaveLength(0)
    const ticksSoFar = (existsSync as jest.Mock).mock.calls.length
    await jest.advanceTimersByTimeAsync(interval * 5)
    expect((existsSync as jest.Mock).mock.calls.length).toBeGreaterThan(
      ticksSoFar
    )

    // STEAM_REQUEST_NO_ACTIVITY_TICKS = 40; already advanced 26 ticks.
    await jest.advanceTimersByTimeAsync(interval * 13)
    expect(doneCalls()).toHaveLength(0)
    expect(notify).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(interval * 2)
    expect(doneCalls()).toHaveLength(1)
    expect(notify).not.toHaveBeenCalled()
    // PVK-1: the give-up goes to the in-app stack, once.
    expect(
      sendFrontendMessage.mock.calls.filter(([c]) => c === 'steamRequestNotice')
    ).toEqual([
      [
        'steamRequestNotice',
        {
          appId: '730',
          title: expect.any(String),
          kind: 'install-not-started',
          seq: expect.any(Number)
        }
      ]
    ])
    expect(
      g9oLogger().logWarning.mock.calls.some(
        ([m]: [unknown]) =>
          String(m).includes('730') &&
          String(m).includes('install') &&
          String(m).includes('~2 min')
      )
    ).toBe(true)
    const ticksAtStop = (existsSync as jest.Mock).mock.calls.length
    await jest.advanceTimersByTimeAsync(interval * 5)
    expect((existsSync as jest.Mock).mock.calls.length).toBe(ticksAtStop)
  })

  it('D2: a delegated poll stops after MANIFEST_GONE_TICKS consecutive absent ticks once a manifest was seen; a single absent tick does not stop it', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    isNativeInstallInFlightSpy = jest
      .spyOn(steamTestDeps.steamSession.gameSession, 'isNativeInstallInFlight')
      .mockReturnValue(false)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    vdf.parse.mockReturnValue(delegatedAcf('1026'))
    jest.mocked(sendFrontendMessage).mockClear()

    const interval = 10
    ;(existsSync as jest.Mock).mockReturnValue(true)
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: interval,
      delegatedToSteamClient: true
    })
    await jest.advanceTimersByTimeAsync(interval * 3) // downloading x3

    // One absent tick between downloading ticks: counter resets.
    ;(existsSync as jest.Mock).mockReturnValue(false)
    await jest.advanceTimersByTimeAsync(interval)
    ;(existsSync as jest.Mock).mockReturnValue(true)
    await jest.advanceTimersByTimeAsync(interval * 3)
    expect(doneCalls()).toHaveLength(0)

    // Now the manifest is gone for good.
    ;(existsSync as jest.Mock).mockReturnValue(false)
    await jest.advanceTimersByTimeAsync(interval * 9)
    expect(doneCalls()).toHaveLength(0)
    await jest.advanceTimersByTimeAsync(interval * 2)
    expect(doneCalls()).toHaveLength(1)
  })

  it('D3: a delegated poll that goes absent -> downloading -> installed stops via the installed branch (library flip + done), not the gone/no-manifest branches', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    isNativeInstallInFlightSpy = jest
      .spyOn(steamTestDeps.steamSession.gameSession, 'isNativeInstallInFlight')
      .mockReturnValue(false)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    jest.mocked(sendFrontendMessage).mockClear()

    const interval = 10
    ;(existsSync as jest.Mock).mockReturnValue(false)
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: interval,
      delegatedToSteamClient: true
    })
    await jest.advanceTimersByTimeAsync(interval * 30) // well past 20-tick grace
    ;(existsSync as jest.Mock).mockReturnValue(true)
    vdf.parse.mockReturnValue(delegatedAcf('1026'))
    await jest.advanceTimersByTimeAsync(interval * 2)
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    await jest.advanceTimersByTimeAsync(interval * 2)

    expect(library.get('730')?.is_installed).toBe(true)
    expect(doneCalls().length).toBeGreaterThanOrEqual(1)
    const callsAfter = (existsSync as jest.Mock).mock.calls.length
    await jest.advanceTimersByTimeAsync(interval * 5)
    expect((existsSync as jest.Mock).mock.calls.length).toBe(callsAfter)
  })

  // ── quick 261105-vfq: no-activity timeout, early flag, Cancel ──────────────

  it('VFQ-1: a manifest that stays downloading disarms the no-activity timeout', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    isNativeInstallInFlightSpy = jest
      .spyOn(steamTestDeps.steamSession.gameSession, 'isNativeInstallInFlight')
      .mockReturnValue(false)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(existsSync as jest.Mock).mockReturnValue(true)
    vdf.parse.mockReturnValue(delegatedAcf('1026'))
    jest.mocked(sendFrontendMessage).mockClear()
    ;(notify as jest.Mock).mockClear()

    const interval = 10
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: interval,
      delegatedToSteamClient: true
    })
    await jest.advanceTimersByTimeAsync(interval * 20)
    const ticksSoFar = (existsSync as jest.Mock).mock.calls.length
    await jest.advanceTimersByTimeAsync(interval * 40)
    expect(doneCalls()).toHaveLength(0)
    expect(notify).not.toHaveBeenCalled()
    expect((existsSync as jest.Mock).mock.calls.length).toBeGreaterThan(
      ticksSoFar
    )
  })

  it('VFQ-2: a delegated poll flags managedBySteam at registration, before any tick', () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    jest.mocked(sendFrontendMessage).mockClear()
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 10,
      delegatedToSteamClient: true
    })
    expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: '730',
      runner: 'steam',
      status: 'installing',
      managedBySteam: true
    })
  })

  it('VFQ-3: upgrading a bare poll to delegated flags it and counts the window from the upgrade', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(false)
    isNativeInstallInFlightSpy = jest
      .spyOn(steamTestDeps.steamSession.gameSession, 'isNativeInstallInFlight')
      .mockReturnValue(true)
    jest.mocked(sendFrontendMessage).mockClear()
    ;(notify as jest.Mock).mockClear()

    const interval = 10
    startInstallPolling(steamTestDeps, '730', { intervalMs: interval })
    await jest.advanceTimersByTimeAsync(interval * 30)
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({ managedBySteam: true })
    )
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: interval,
      delegatedToSteamClient: true
    })
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({ status: 'installing', managedBySteam: true })
    )
    await jest.advanceTimersByTimeAsync(interval * 39)
    expect(doneCalls()).toHaveLength(0)
    await jest.advanceTimersByTimeAsync(interval * 2)
    expect(doneCalls()).toHaveLength(1)
    // quick 261106-pvk: the give-up is an in-app notice now, not notify().
    expect(notify).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamRequestNotice',
      expect.objectContaining({ appId: '730', kind: 'install-not-started' })
    )
  })

  it('VFQ-4: cancelDelegatedInstall stops a delegated poll with one done; false otherwise', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(false)
    isNativeInstallInFlightSpy = jest
      .spyOn(steamTestDeps.steamSession.gameSession, 'isNativeInstallInFlight')
      .mockReturnValue(true)
    jest.mocked(sendFrontendMessage).mockClear()
    ;(notify as jest.Mock).mockClear()

    expect(cancelDelegatedInstall(steamTestDeps, '730')).toBe(false) // no poll

    const interval = 10
    startInstallPolling(steamTestDeps, '730', { intervalMs: interval }) // bare poll
    expect(cancelDelegatedInstall(steamTestDeps, '730')).toBe(false)
    await jest.advanceTimersByTimeAsync(interval * 2)
    const ticking = (existsSync as jest.Mock).mock.calls.length
    await jest.advanceTimersByTimeAsync(interval * 2)
    expect((existsSync as jest.Mock).mock.calls.length).toBeGreaterThan(ticking)
    stopInstallPolling(steamTestDeps, '730')

    startInstallPolling(steamTestDeps, '730', {
      intervalMs: interval,
      delegatedToSteamClient: true
    })
    expect(cancelDelegatedInstall(steamTestDeps, '730')).toBe(true)
    expect(doneCalls()).toHaveLength(1)
    expect(notify).not.toHaveBeenCalled()
    const callsAfter = (existsSync as jest.Mock).mock.calls.length
    await jest.advanceTimersByTimeAsync(interval * 5)
    expect((existsSync as jest.Mock).mock.calls.length).toBe(callsAfter)
    expect(cancelDelegatedInstall(steamTestDeps, '730')).toBe(false)
  })

  it('PVK-3: two install give-ups in one session carry strictly increasing seq', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(false)
    isNativeInstallInFlightSpy = jest
      .spyOn(steamTestDeps.steamSession.gameSession, 'isNativeInstallInFlight')
      .mockReturnValue(false)
    jest.mocked(sendFrontendMessage).mockClear()
    const interval = 10
    for (let i = 0; i < 2; i++) {
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: interval,
        delegatedToSteamClient: true
      })
      await jest.advanceTimersByTimeAsync(interval * 43)
    }
    const seqs = sendFrontendMessage.mock.calls
      .filter(([c]) => c === 'steamRequestNotice')
      .map(([, p]) => p.seq as number)
    expect(seqs).toHaveLength(2)
    expect(at(seqs, 1)).toBeGreaterThan(at(seqs, 0))
  })

  it('PVK-4: isDelegatedInstallPolling is true only for a live delegated poll', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(false)
    isNativeInstallInFlightSpy = jest
      .spyOn(steamTestDeps.steamSession.gameSession, 'isNativeInstallInFlight')
      .mockReturnValue(true)
    expect(isDelegatedInstallPolling(steamTestDeps, '730')).toBe(false) // no poll
    startInstallPolling(steamTestDeps, '730', { intervalMs: 10 }) // bare poll
    expect(isDelegatedInstallPolling(steamTestDeps, '730')).toBe(false)
    stopInstallPolling(steamTestDeps, '730')
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 10,
      delegatedToSteamClient: true
    })
    expect(isDelegatedInstallPolling(steamTestDeps, '730')).toBe(true)
    cancelDelegatedInstall(steamTestDeps, '730')
    expect(isDelegatedInstallPolling(steamTestDeps, '730')).toBe(false)
  })

  // ── debug/steam-dl-missing-in-downloads ────────────────────────────────────

  it('D4: a delegated poll feeds the game page a percent and flags the status managedBySteam (Downloads lists it from that flag)', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    isNativeInstallInFlightSpy = jest
      .spyOn(steamTestDeps.steamSession.gameSession, 'isNativeInstallInFlight')
      .mockReturnValue(false)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(existsSync as jest.Mock).mockReturnValue(true)
    // The live ATOM RPG manifest shape: StateFlags 1026, ~39 % of 6.0 GB.
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '1026',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '2361633008',
        BytesToDownload: '6004493952'
      }
    })
    jest.mocked(sendFrontendMessage).mockClear()

    const interval = 10
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: interval,
      delegatedToSteamClient: true
    })
    await jest.advanceTimersByTimeAsync(interval * 2)

    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'progressUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        progress: expect.objectContaining({ percent: 39 })
      })
    )
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        status: 'installing',
        managedBySteam: true
      })
    )
  })

  it('D5: a non-delegated poll never flags managedBySteam (a GameLib-driven install already has its own queue row)', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    isNativeInstallInFlightSpy = jest
      .spyOn(steamTestDeps.steamSession.gameSession, 'isNativeInstallInFlight')
      .mockReturnValue(false)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(existsSync as jest.Mock).mockReturnValue(true)
    vdf.parse.mockReturnValue(delegatedAcf('1026'))
    jest.mocked(sendFrontendMessage).mockClear()

    const interval = 10
    startInstallPolling(steamTestDeps, '730', { intervalMs: interval })
    await jest.advanceTimersByTimeAsync(interval * 2)

    const installing = sendFrontendMessage.mock.calls.filter(
      ([channel, payload]) =>
        channel === 'gameStatusUpdate' && payload?.status === 'installing'
    )
    expect(installing.length).toBeGreaterThan(0)
    for (const [, payload] of installing) {
      expect(payload).not.toHaveProperty('managedBySteam')
    }
  })

  // ── 17-03: startInstallPolling(appId, { source: 'bottle' }) ────────────────

  it('startInstallPolling(appId, { source: "bottle" }) polls the bottle steamapps root, not the native one', async () => {
    jest
      .mocked(getSteamBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
    jest.mocked(getBottleSteamappsDir).mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue([])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2', // downloading — keeps the poll alive for the assertion
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })

    startInstallPolling(steamTestDeps, '730', { source: 'bottle' })
    await jest.advanceTimersByTimeAsync(3000)

    expect(getSteamLibraries).not.toHaveBeenCalled()
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
