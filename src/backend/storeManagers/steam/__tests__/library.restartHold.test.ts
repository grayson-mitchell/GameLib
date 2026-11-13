import {
  createTestManagerDeps,
  createInertSteamProcesses,
  createTestStores
} from 'backend/testUtils/testServices'
/**
 * Unit tests for steam/library/restartHold.ts (restart-Steam hold fast path).
 * Moved out of library.test.ts by Phase 65 plan 03 (D-03); mock preamble
 * copied. The persist/re-arm describes stay in library.test.ts: they drive
 * rearmPersistedSteamRestartHolds, which moves to resume.ts in plan 65-04.
 */

// ── Imports ───────────────────────────────────────────────────────────────────
import { startInstallPolling } from '../library/installPolling'
import { pollInstallOnce } from '../library/installPollOnce'
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
import { listReadyBridgeBottleNames } from '../bridgeBottle'
import {
  listSteamClientPids,
  readSteamProcessStartTokens
} from '../steamClientProcess'
import { join } from 'path'
import { logInfo } from 'backend/logger'
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

//
// debug/steam-waiting-for-restart-windows. GameLib's finalize writes the
// manifest at StateFlags=4 (Phase 23 fast path), so the poller's first tick is
// already 'installed' and the 1026-only 'steam-waiting-for-restart' signal is
// unreachable: the badge flipped to Play while the running Steam client had
// never read the manifest, and Play opened Steam's INSTALL dialog. The poller
// now records which Steam client PIDs were alive at that moment and holds the
// waiting state until they are gone. The probe (listSteamClientPids) is mocked
// here; its per-OS behaviour has its own suite (steamClientProcess.test.ts).

describe('install poller holds steam-waiting-for-restart on the StateFlags=4 fast path (D-UAT-13)', () => {
  const ACF_4 = {
    AppState: {
      appid: '730',
      StateFlags: '4',
      installdir: 'csgo',
      SizeOnDisk: '50000'
    }
  }
  const HOLD_PROBE_GAP_MS = 10_000
  const RESTART_NOTIFY = {
    title: 'CS:GO',
    body: 'Restart Steam to finish installing {{game}}'
  }
  const FINISHED_NOTIFY = { title: 'CS:GO', body: 'Installation Finished' }

  const sentCalls = (channel: string) =>
    sendFrontendMessage.mock.calls.filter(([c]) => c === channel)
  const statusPayloads = () => sentCalls('gameStatusUpdate').map(([, p]) => p)
  const wasStopped = () =>
    (logInfo as jest.Mock).mock.calls.some(
      ([msg]) =>
        typeof msg === 'string' &&
        msg.includes('stopped install polling for appId 730')
    )

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
    vdf.parse.mockReturnValue(ACF_4)
    jest
      .mocked(getFileSize)
      .mockImplementation((bytes: unknown) => `${String(bytes)} B`)
  })

  afterEach(() => {
    stopInstallPolling(steamTestDeps, '730')
    jest.useRealTimers()
  })

  it('holds a native handoff when a Steam client was running at finalize: waiting context, NO is_installed push, NO done, NO completion toast, poll kept alive', async () => {
    jest.mocked(listSteamClientPids).mockResolvedValue([111])
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true
    })

    await pollInstallOnce(steamTestDeps, '730')

    expect(statusPayloads()).toEqual([
      {
        appName: '730',
        runner: 'steam',
        status: 'installing',
        context: 'steam-waiting-for-restart'
      }
    ])
    expect(sentCalls('pushGameToLibrary')).toHaveLength(0)
    expect(library.get('730')?.is_installed).toBe(false)
    // The restart hint is told once; "Installation Finished" waits for release.
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(RESTART_NOTIFY)
    expect(wasStopped()).toBe(false)
  })

  it('keeps holding while the SAME Steam process is alive, re-emitting the waiting context each tick without re-notifying', async () => {
    jest.mocked(listSteamClientPids).mockResolvedValue([111])
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true
    })
    await pollInstallOnce(steamTestDeps, '730')
    jest.advanceTimersByTime(HOLD_PROBE_GAP_MS)
    await pollInstallOnce(steamTestDeps, '730')
    await pollInstallOnce(steamTestDeps, '730')

    const waiting = statusPayloads().filter(
      (p) => p.context === 'steam-waiting-for-restart'
    )
    expect(waiting).toHaveLength(3)
    expect(sentCalls('pushGameToLibrary')).toHaveLength(0)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(wasStopped()).toBe(false)
  })

  it('re-probes Steam at most once per probe gap while holding (no child spawn per 3 s tick)', async () => {
    jest.mocked(listSteamClientPids).mockResolvedValue([111])
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true
    })
    await pollInstallOnce(steamTestDeps, '730') // first probe, records [111]
    expect(listSteamClientPids).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(HOLD_PROBE_GAP_MS - 1)
    await pollInstallOnce(steamTestDeps, '730')
    expect(listSteamClientPids).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(1)
    await pollInstallOnce(steamTestDeps, '730')
    expect(listSteamClientPids).toHaveBeenCalledTimes(2)
  })

  it('releases into the UNCHANGED installed flow once the recorded Steam process is gone, without repeating the restart toast', async () => {
    jest.mocked(listSteamClientPids).mockResolvedValue([111])
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true
    })
    await pollInstallOnce(steamTestDeps, '730')
    expect(sentCalls('pushGameToLibrary')).toHaveLength(0)

    // The user fully quit Steam.
    jest.mocked(listSteamClientPids).mockResolvedValue([])
    jest.advanceTimersByTime(HOLD_PROBE_GAP_MS)
    await pollInstallOnce(steamTestDeps, '730')

    expect(sentCalls('pushGameToLibrary')).toEqual([
      [
        'pushGameToLibrary',
        expect.objectContaining({ app_name: '730', is_installed: true })
      ]
    ])
    expect(statusPayloads()).toContainEqual({
      appName: '730',
      runner: 'steam',
      status: 'done'
    })
    expect(notify).toHaveBeenCalledTimes(2)
    expect(notify).toHaveBeenNthCalledWith(1, RESTART_NOTIFY)
    expect(notify).toHaveBeenNthCalledWith(2, FINISHED_NOTIFY)
    expect(wasStopped()).toBe(true)
  })

  it('releases when Steam was RESTARTED (a different PID replaced the recorded one)', async () => {
    jest.mocked(listSteamClientPids).mockResolvedValue([111])
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true
    })
    await pollInstallOnce(steamTestDeps, '730')

    jest.mocked(listSteamClientPids).mockResolvedValue([222])
    jest.advanceTimersByTime(HOLD_PROBE_GAP_MS)
    await pollInstallOnce(steamTestDeps, '730')

    expect(sentCalls('pushGameToLibrary')).toHaveLength(1)
    expect(wasStopped()).toBe(true)
  })

  it('an inconclusive re-probe (undefined) keeps holding — only positive evidence of exit releases', async () => {
    jest.mocked(listSteamClientPids).mockResolvedValue([111])
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true
    })
    await pollInstallOnce(steamTestDeps, '730')

    jest.mocked(listSteamClientPids).mockResolvedValue(undefined)
    jest.advanceTimersByTime(HOLD_PROBE_GAP_MS)
    await pollInstallOnce(steamTestDeps, '730')

    expect(sentCalls('pushGameToLibrary')).toHaveLength(0)
    expect(wasStopped()).toBe(false)
  })

  it('fail-open: Steam NOT running at finalize (probe []) takes the unchanged installed flow immediately', async () => {
    jest.mocked(listSteamClientPids).mockResolvedValue([])
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true
    })

    await pollInstallOnce(steamTestDeps, '730')

    expect(sentCalls('pushGameToLibrary')).toHaveLength(1)
    expect(statusPayloads()).toContainEqual(
      expect.objectContaining({ status: 'done' })
    )
    expect(statusPayloads()).not.toContainEqual(
      expect.objectContaining({ context: 'steam-waiting-for-restart' })
    )
    expect(wasStopped()).toBe(true)
  })

  it('an adoptedBySteamClient poll (InstallApp ok) never probes, never holds and is installed immediately (quick 261105-sqe)', async () => {
    jest.mocked(listSteamClientPids).mockResolvedValue([111])
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true,
      macNativeRoute: true,
      adoptedBySteamClient: true
    })

    await pollInstallOnce(steamTestDeps, '730')

    expect(listSteamClientPids).not.toHaveBeenCalled()
    expect(readSteamProcessStartTokens).not.toHaveBeenCalled()
    expect(sentCalls('pushGameToLibrary')).toHaveLength(1)
    expect(statusPayloads()).toContainEqual(
      expect.objectContaining({ status: 'done' })
    )
    expect(statusPayloads()).not.toContainEqual(
      expect.objectContaining({ context: 'steam-waiting-for-restart' })
    )
    expect(notify).not.toHaveBeenCalledWith(RESTART_NOTIFY)
    expect(wasStopped()).toBe(true)
  })

  it('adoptedBySteamClient arriving on an in-flight poll (upgrade branch) releases the hold (quick 261105-sqe)', async () => {
    jest.mocked(listSteamClientPids).mockResolvedValue([111])
    startInstallPolling(steamTestDeps, '730', { intervalMs: 60000 })
    startInstallPolling(steamTestDeps, '730', {
      isNativeHandoff: true,
      macNativeRoute: true,
      adoptedBySteamClient: true
    })

    await pollInstallOnce(steamTestDeps, '730')

    expect(listSteamClientPids).not.toHaveBeenCalled()
    expect(readSteamProcessStartTokens).not.toHaveBeenCalled()
    expect(sentCalls('pushGameToLibrary')).toHaveLength(1)
    expect(statusPayloads()).not.toContainEqual(
      expect.objectContaining({ context: 'steam-waiting-for-restart' })
    )
    expect(notify).not.toHaveBeenCalledWith(RESTART_NOTIFY)
    expect(wasStopped()).toBe(true)
  })

  it('fail-open: an inconclusive FIRST probe (undefined) takes the unchanged installed flow immediately', async () => {
    jest.mocked(listSteamClientPids).mockResolvedValue(undefined)
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true
    })

    await pollInstallOnce(steamTestDeps, '730')

    expect(sentCalls('pushGameToLibrary')).toHaveLength(1)
    expect(wasStopped()).toBe(true)
  })

  it('an OFF-path poll (Steam owns the download, no isNativeHandoff) never probes and never holds', async () => {
    jest.mocked(listSteamClientPids).mockResolvedValue([111])
    startInstallPolling(steamTestDeps, '730', 60000)

    await pollInstallOnce(steamTestDeps, '730')

    expect(listSteamClientPids).not.toHaveBeenCalled()
    expect(sentCalls('pushGameToLibrary')).toHaveLength(1)
    expect(wasStopped()).toBe(true)
  })

  it('a bottle-source handoff (no user-visible Steam to restart) never probes and never holds', async () => {
    jest.mocked(listSteamClientPids).mockResolvedValue([111])
    jest
      .mocked(getSteamBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
    jest.mocked(getBottleSteamappsDir).mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      source: 'bottle',
      isNativeHandoff: true
    })

    await pollInstallOnce(steamTestDeps, '730', 'bottle')

    expect(listSteamClientPids).not.toHaveBeenCalled()
    expect(sentCalls('pushGameToLibrary')).toHaveLength(1)
  })

  it('a hold released because Steam itself rewrote the manifest (active download state) never re-enters, even if the probe still reports the old PID', async () => {
    jest.mocked(listSteamClientPids).mockResolvedValue([111])
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true
    })
    await pollInstallOnce(steamTestDeps, '730')
    expect(listSteamClientPids).toHaveBeenCalledTimes(1)

    // Steam picked the app up and queued a post-restart update (1042 = active
    // download, never === 1026).
    vdf.parse.mockReturnValue({
      AppState: { ...ACF_4.AppState, StateFlags: '1042' }
    })
    await pollInstallOnce(steamTestDeps, '730')
    // ...and finished it.
    vdf.parse.mockReturnValue(ACF_4)
    await pollInstallOnce(steamTestDeps, '730')

    expect(listSteamClientPids).toHaveBeenCalledTimes(1)
    expect(sentCalls('pushGameToLibrary')).toHaveLength(1)
    expect(wasStopped()).toBe(true)
  })

  it('the 1026 handoff wait is not re-armed as a hold when Steam adopts it (1026 -> 4): the restarted Steam that just adopted the manifest must not be recorded as the client that has not seen it', async () => {
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true
    })

    // GameLib could not earn the fast path and wrote the 1026 handoff manifest.
    vdf.parse.mockReturnValue({
      AppState: { ...ACF_4.AppState, StateFlags: '1026' }
    })
    await pollInstallOnce(steamTestDeps, '730')
    expect(statusPayloads()).toContainEqual({
      appName: '730',
      runner: 'steam',
      status: 'installing',
      context: 'steam-waiting-for-restart'
    })

    // The user restarts Steam; the NEW client is running and has adopted the
    // manifest, rewriting it to 4. A probe now would see that new client.
    jest.mocked(listSteamClientPids).mockResolvedValue([222])
    vdf.parse.mockReturnValue(ACF_4)
    await pollInstallOnce(steamTestDeps, '730')

    expect(listSteamClientPids).not.toHaveBeenCalled()
    expect(sentCalls('pushGameToLibrary')).toHaveLength(1)
    expect(statusPayloads()).toContainEqual({
      appName: '730',
      runner: 'steam',
      status: 'done'
    })
    expect(wasStopped()).toBe(true)
  })

  it('a resumed install (poll first seeing a PRE-EXISTING 1026 manifest with isNativeHandoff still false) still holds once GameLib finalizes at StateFlags=4 — the Darkest Dungeon repro', async () => {
    jest.mocked(listSteamClientPids).mockResolvedValue([111])
    // resumeInterruptedSteamInstall's bare native poll: ACF left at 1026 by the
    // earlier cancel (Steam-style active state, NOT a GameLib handoff yet).
    startInstallPolling(steamTestDeps, '730', 60000)
    vdf.parse.mockReturnValue({
      AppState: { ...ACF_4.AppState, StateFlags: '1026' }
    })
    await pollInstallOnce(steamTestDeps, '730')
    expect(statusPayloads()).not.toContainEqual(
      expect.objectContaining({ context: 'steam-waiting-for-restart' })
    )

    // Finalize: games.ts upgrades the live poll to isNativeHandoff and the
    // manifest is rewritten at StateFlags=4 while Steam (pid 111) is running.
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true
    })
    vdf.parse.mockReturnValue(ACF_4)
    await pollInstallOnce(steamTestDeps, '730')

    expect(statusPayloads()).toContainEqual({
      appName: '730',
      runner: 'steam',
      status: 'installing',
      context: 'steam-waiting-for-restart'
    })
    expect(sentCalls('pushGameToLibrary')).toHaveLength(0)
    expect(wasStopped()).toBe(false)
  })

  it('a held poll survives the "no manifest -> user cancelled" grace window (GRACE_TICKS) instead of being torn down with a terminal done', async () => {
    jest.mocked(listSteamClientPids).mockResolvedValue([111])
    const interval = 10
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: interval,
      isNativeHandoff: true
    })

    // GRACE_TICKS (20) + plenty of margin; the 10 s probe gap is never reached.
    await jest.advanceTimersByTimeAsync(interval * 40)

    expect(statusPayloads()).not.toContainEqual(
      expect.objectContaining({ status: 'done' })
    )
    expect(sentCalls('pushGameToLibrary')).toHaveLength(0)
    expect(wasStopped()).toBe(false)
    expect(
      statusPayloads().filter((p) => p.context === 'steam-waiting-for-restart')
        .length
    ).toBeGreaterThan(20)
  })

  it('ends the hold with a terminal done when the finalized manifest vanishes (MANIFEST_GONE_TICKS) so the UI is not stranded on "Restart Steam"', async () => {
    jest.mocked(listSteamClientPids).mockResolvedValue([111])
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true
    })
    await pollInstallOnce(steamTestDeps, '730')
    ;(existsSync as jest.Mock).mockReturnValue(false) // manifest removed
    for (let i = 0; i < 9; i++) await pollInstallOnce(steamTestDeps, '730')
    expect(wasStopped()).toBe(false) // 9 < MANIFEST_GONE_TICKS: tolerate a rewrite blip
    await pollInstallOnce(steamTestDeps, '730')

    expect(statusPayloads()).toContainEqual({
      appName: '730',
      runner: 'steam',
      status: 'done'
    })
    expect(wasStopped()).toBe(true)
  })

  it('a hold that reaches the MAX_TICKS safety cap reports the game installed instead of stranding the waiting UI', async () => {
    jest.mocked(listSteamClientPids).mockResolvedValue([111])
    // 1 ms interval: the cap (7200 ticks) is 7.2 s of fake time, under the
    // 10 s probe gap, so the probe cannot release it first.
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 1,
      isNativeHandoff: true
    })

    await jest.advanceTimersByTimeAsync(7300)

    expect(sentCalls('pushGameToLibrary')).toHaveLength(1)
    expect(statusPayloads()).toContainEqual(
      expect.objectContaining({ status: 'done' })
    )
    expect(wasStopped()).toBe(true)
  })

  it('an ordinary poll with no hold still stops at the MAX_TICKS safety cap (the hold special-case must not weaken it)', async () => {
    // A manifest that is never installed: Steam-owned download parked at an
    // active state forever. isNativeHandoff false, so no probe/hold applies.
    vdf.parse.mockReturnValue({
      AppState: { ...ACF_4.AppState, StateFlags: '1042' }
    })
    startInstallPolling(steamTestDeps, '730', { intervalMs: 1 })

    await jest.advanceTimersByTimeAsync(7300)

    expect(wasStopped()).toBe(true)
    expect(sentCalls('pushGameToLibrary')).toHaveLength(0)
  })
})
