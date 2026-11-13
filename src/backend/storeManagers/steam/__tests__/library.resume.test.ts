import {
  createTestManagerDeps,
  createInertSteamProcesses,
  createTestStores
} from 'backend/testUtils/testServices'
/**
 * Unit tests for steam/library/resume.ts (rearmPersistedSteamRestartHolds and the persisted-hold round trip).
 * Moved out of library.test.ts by Phase 65 plan 04 (D-03); mock preamble
 * copied.
 */

// ── Imports ───────────────────────────────────────────────────────────────────
import SteamLibraryManager from '../library'
import { stopInstallPolling } from '../library/installStop'
import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import {
  vdf,
  mockedFsSteamFiles
} from '../localFiles/__tests__/fixtures/mockedFsSteamFiles'
import { getSteamLibraries, getFileSize } from 'backend/utils'
const sendFrontendMessage = jest.fn()
import { notify } from '../../../dialog/dialog'
import { t as i18nextT } from 'i18next'
import { backfillBridgeLaunchTargets } from '../bridge/launchTarget'
import { listReadyBridgeBottleNames } from '../bridgeBottle'
import {
  listSteamClientPids,
  readSteamProcessStartTokens
} from '../steamClientProcess'
import { logInfo } from 'backend/logger'
import { pollInstallOnce } from '../library/installPollOnce'
import { startInstallPolling } from '../library/installPolling'
import type { Stores } from 'backend/services/types'

const { steamLibraryStore, steamMetadataStore, steamRestartHoldStore } =
  jest.requireMock<Stores['steam']>('../stores')
const steamStoresModule = jest.requireMock<Stores['steam']>('../stores')

const steamTestDeps = createTestManagerDeps({
  requestRustInvoke: mockedFsSteamFiles().requestRustInvoke,
  sendFrontendMessage,
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

// ── depot mock — downloadSteamDepots
// (must NEVER be invoked from startup resume — Pitfall 4, no silent re-download).
// Since 73-19 the resume verify itself is one Rust verify_only job
// (depotRust/secondary.ts resumeVerifyRust, covered in rustSecondary.test.ts);
// nothing here rebuilds a TS plan.
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

// ── D-UAT-13: hold in steam-waiting-for-restart on the StateFlags=4 fast path ─
// ── quick 261029-pkp: the D-UAT-13 hold survives a GameLib restart ───────────
//
// The hold lives on the in-memory poll, so a sidecar restart used to read the
// StateFlags=4 manifest as installed (Play -> Steam's install dialog). The hold
// is now persisted (app id + Steam PID + opaque start-time token) and re-armed
// at boot only while that same Steam process is still the live one.

describe('D-UAT-13 hold persists across a GameLib restart (quick 261029-pkp)', () => {
  const ACF_4 = {
    AppState: {
      appid: '730',
      StateFlags: '4',
      installdir: 'csgo',
      SizeOnDisk: '50000'
    }
  }
  const MAX_AGE_MS = 7200 * 3000
  const store = new Map<string, unknown>()
  let manager: SteamLibraryManager

  const sentCalls = (channel: string) =>
    sendFrontendMessage.mock.calls.filter(([c]) => c === channel)
  const statusPayloads = () => sentCalls('gameStatusUpdate').map(([, p]) => p)
  const record = (over: Record<string, unknown> = {}) => ({
    pids: [{ pid: 111, startToken: 'T1' }],
    recordedAt: Date.now(),
    macNativeRoute: false,
    skippedDepots: [],
    ...over
  })
  const arm = async () => {
    jest.mocked(listSteamClientPids).mockResolvedValue([111])
    jest
      .mocked(readSteamProcessStartTokens)
      .mockResolvedValue(new Map([[111, 'T1']]))
    startInstallPolling(steamTestDeps, '730', {
      intervalMs: 60000,
      isNativeHandoff: true
    })
    await pollInstallOnce(steamTestDeps, '730')
  }

  beforeEach(() => {
    jest.useFakeTimers()
    store.clear()
    jest
      .mocked(steamRestartHoldStore.get)
      .mockImplementation((k: string) => store.get(k))
    jest
      .mocked(steamRestartHoldStore.set)
      .mockImplementation((k: string, v: unknown) => void store.set(k, v))
    jest
      .mocked(steamRestartHoldStore.delete)
      .mockImplementation((k: string) => void store.delete(k))
    jest
      .mocked(steamRestartHoldStore.entries)
      .mockImplementation(() => [...store.entries()] as never)
    manager = new SteamLibraryManager(steamTestDeps)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    ;(steamMetadataStore.entries as jest.Mock).mockReturnValue([])
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
    vdf.parse.mockReturnValue(ACF_4)
    jest
      .mocked(getFileSize)
      .mockImplementation((bytes: unknown) => `${String(bytes)} B`)
  })

  afterEach(() => {
    stopInstallPolling(steamTestDeps, '730')
    jest.useRealTimers()
  })

  describe('persist + clear', () => {
    it('arming writes a record with the pid, start token, route and skipped depots', async () => {
      jest.mocked(listSteamClientPids).mockResolvedValue([111])
      jest
        .mocked(readSteamProcessStartTokens)
        .mockResolvedValue(new Map([[111, 'T1']]))
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 60000,
        isNativeHandoff: true,
        macNativeRoute: true,
        skippedDepots: ['5']
      })
      await pollInstallOnce(steamTestDeps, '730')

      expect(store.get('730')).toEqual({
        pids: [{ pid: 111, startToken: 'T1' }],
        recordedAt: expect.any(Number),
        macNativeRoute: true,
        skippedDepots: ['5']
      })
    })

    it.each([
      ['an undefined probe', undefined],
      ['a probe with no token for the pid', new Map<number, string>()]
    ])('%s still holds in memory but writes no record', async (_n, tokens) => {
      jest.mocked(listSteamClientPids).mockResolvedValue([111])
      jest.mocked(readSteamProcessStartTokens).mockResolvedValue(tokens)
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 60000,
        isNativeHandoff: true
      })
      await pollInstallOnce(steamTestDeps, '730')

      expect(store.size).toBe(0)
      expect(statusPayloads()).toContainEqual(
        expect.objectContaining({ context: 'steam-waiting-for-restart' })
      )
    })

    it('clears the record when the recorded Steam process exits', async () => {
      await arm()
      expect(store.has('730')).toBe(true)
      jest.mocked(listSteamClientPids).mockResolvedValue([])
      jest.advanceTimersByTime(10_000)
      await pollInstallOnce(steamTestDeps, '730')
      expect(store.has('730')).toBe(false)
    })

    it('clears the record when Steam rewrites the manifest (active download state)', async () => {
      await arm()
      vdf.parse.mockReturnValue({
        AppState: { ...ACF_4.AppState, StateFlags: '1042' }
      })
      await pollInstallOnce(steamTestDeps, '730')
      expect(store.has('730')).toBe(false)
    })

    it('clears the record at the MAX_TICKS cap', async () => {
      jest.mocked(listSteamClientPids).mockResolvedValue([111])
      jest
        .mocked(readSteamProcessStartTokens)
        .mockResolvedValue(new Map([[111, 'T1']]))
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 1,
        isNativeHandoff: true
      })
      await jest.advanceTimersByTimeAsync(10)
      expect(store.has('730')).toBe(true)
      await jest.advanceTimersByTimeAsync(7300)
      expect(store.has('730')).toBe(false)
    })

    it('clears the record when the manifest vanishes', async () => {
      await arm()
      ;(existsSync as jest.Mock).mockReturnValue(false)
      for (let i = 0; i < 10; i++) await pollInstallOnce(steamTestDeps, '730')
      expect(store.has('730')).toBe(false)
    })

    it('clears the record when the poll is stopped while holding (cancel/uninstall)', async () => {
      await arm()
      expect(store.has('730')).toBe(true)
      stopInstallPolling(steamTestDeps, '730')
      expect(store.has('730')).toBe(false)
    })

    it('an unprobed -> released (no Steam running) deletes a stale record', async () => {
      store.set('730', record())
      jest.mocked(listSteamClientPids).mockResolvedValue([])
      startInstallPolling(steamTestDeps, '730', {
        intervalMs: 60000,
        isNativeHandoff: true
      })
      await pollInstallOnce(steamTestDeps, '730')
      expect(store.has('730')).toBe(false)
    })
  })

  describe('init() re-arm', () => {
    it('re-arms for the same Steam process: held, waiting context, no re-toast, record kept; releases when Steam exits', async () => {
      store.set('730', record())
      jest.mocked(listSteamClientPids).mockResolvedValue([111])
      jest
        .mocked(readSteamProcessStartTokens)
        .mockResolvedValue(new Map([[111, 'T1']]))

      await manager.init()

      await manager.refreshInstallState()
      expect(library.get('730')?.is_installed).toBe(false)
      expect(sentCalls('pushGameToLibrary')).toHaveLength(0)

      jest.mocked(sendFrontendMessage).mockClear()
      await pollInstallOnce(steamTestDeps, '730')
      expect(statusPayloads()).toEqual([
        {
          appName: '730',
          runner: 'steam',
          status: 'installing',
          context: 'steam-waiting-for-restart'
        }
      ])
      expect(notify).not.toHaveBeenCalled()
      expect(store.has('730')).toBe(true)

      jest.mocked(listSteamClientPids).mockResolvedValue([])
      jest.advanceTimersByTime(10_000)
      await pollInstallOnce(steamTestDeps, '730')
      expect(sentCalls('pushGameToLibrary')).toEqual([
        [
          'pushGameToLibrary',
          expect.objectContaining({ app_name: '730', is_installed: true })
        ]
      ])
      expect(store.has('730')).toBe(false)
    })

    const expectDropped = () => {
      expect(store.has('730')).toBe(false)
      expect(
        (logInfo as jest.Mock).mock.calls.some(
          ([m]) =>
            typeof m === 'string' && m.includes('starting install polling')
        )
      ).toBe(false)
    }

    it('drops on a differing start token (PID reuse)', async () => {
      store.set('730', record())
      jest.mocked(listSteamClientPids).mockResolvedValue([111])
      jest
        .mocked(readSteamProcessStartTokens)
        .mockResolvedValue(new Map([[111, 'T2']]))
      await manager.init()
      expectDropped()
    })

    it('drops when Steam is not running', async () => {
      store.set('730', record())
      jest.mocked(listSteamClientPids).mockResolvedValue([])
      await manager.init()
      expectDropped()
    })

    it('drops a record older than the safety cap', async () => {
      store.set('730', record({ recordedAt: Date.now() - MAX_AGE_MS - 1 }))
      jest.mocked(listSteamClientPids).mockResolvedValue([111])
      jest
        .mocked(readSteamProcessStartTokens)
        .mockResolvedValue(new Map([[111, 'T1']]))
      await manager.init()
      expectDropped()
    })

    it.each([
      ['downloading', '1042', true],
      ['absent', '4', false]
    ])('drops when the native manifest is %s', async (_n, flags, exists) => {
      store.set('730', record())
      vdf.parse.mockReturnValue({
        AppState: { ...ACF_4.AppState, StateFlags: flags }
      })
      ;(existsSync as jest.Mock).mockReturnValue(exists)
      jest.mocked(listSteamClientPids).mockResolvedValue([111])
      jest
        .mocked(readSteamProcessStartTokens)
        .mockResolvedValue(new Map([[111, 'T1']]))
      await manager.init()
      expectDropped()
    })

    it('KEEPS the record when the native manifest state is unknown (read rejected, WR-01)', async () => {
      store.set('730', record())
      jest
        .mocked(getSteamLibraries)
        .mockRejectedValue(new Error('rustInvoke timed out'))
      jest.mocked(listSteamClientPids).mockResolvedValue([111])
      jest
        .mocked(readSteamProcessStartTokens)
        .mockResolvedValue(new Map([[111, 'T1']]))
      await manager.init()
      expect(store.has('730')).toBe(true)
      expect(
        (logInfo as jest.Mock).mock.calls.some(
          ([m]) =>
            typeof m === 'string' && m.includes('starting install polling')
        )
      ).toBe(false)
    })

    it('drops when a native install is already in flight for the app', async () => {
      store.set('730', record())
      jest.mocked(listSteamClientPids).mockResolvedValue([111])
      jest
        .mocked(readSteamProcessStartTokens)
        .mockResolvedValue(new Map([[111, 'T1']]))
      const spy = jest
        .spyOn(
          steamTestDeps.steamSession.gameSession,
          'isNativeInstallInFlight'
        )
        .mockReturnValue(true)
      try {
        await manager.init()
        expectDropped()
      } finally {
        spy.mockRestore()
      }
    })

    it('an inconclusive probe arms nothing and KEEPS the record', async () => {
      store.set('730', record())
      jest.mocked(listSteamClientPids).mockResolvedValue(undefined)
      await manager.init()
      expect(store.has('730')).toBe(true)
      expect(
        (logInfo as jest.Mock).mock.calls.some(
          ([m]) =>
            typeof m === 'string' && m.includes('starting install polling')
        )
      ).toBe(false)
      await manager.refreshInstallState()
      expect(library.get('730')?.is_installed).toBe(true)
    })

    it('zero records spawns no probe at all', async () => {
      await manager.init()
      expect(listSteamClientPids).not.toHaveBeenCalled()
      expect(readSteamProcessStartTokens).not.toHaveBeenCalled()
    })

    it('fails closed while verification is pending, then reconciles once on drop', async () => {
      store.set('730', record())
      let resolveLive: (v: number[]) => void = () => undefined
      jest.mocked(listSteamClientPids).mockReturnValue(
        new Promise<number[]>((r) => {
          resolveLive = r
        })
      )
      const initDone = manager.init()

      await manager.refreshInstallState()
      expect(library.get('730')?.is_installed).toBe(false)
      expect(sentCalls('pushGameToLibrary')).toHaveLength(0)

      resolveLive([]) // Steam is gone -> drop
      await initDone
      await jest.advanceTimersByTimeAsync(0)

      expect(library.get('730')?.is_installed).toBe(true)
      expect(sentCalls('pushGameToLibrary')).toContainEqual([
        'pushGameToLibrary',
        expect.objectContaining({ app_name: '730', is_installed: true })
      ])
    })
  })
})
