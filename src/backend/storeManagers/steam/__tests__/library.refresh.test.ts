import {
  createTestManagerDeps,
  createInertSteamProcesses,
  createTestStores
} from 'backend/testUtils/testServices'
/* eslint-disable @typescript-eslint/unbound-method -- jest mock handles (steamUser.acquire*), never invoked unbound; same reason as the line-level disables elsewhere in steam/__tests__ */
/**
 * SteamLibraryManager.refresh() / refreshInstallState() behaviour (free functions in
 * library/refresh.ts). Moved out of library.test.ts by Phase 65 plan 06 (D-03);
 * mock preamble copied.
 */

// ── Imports ───────────────────────────────────────────────────────────────────
import SteamLibraryManager from '../library'
import { stopInstallPolling } from '../library/installStop'
import { buildIncompleteInstallSet } from '../library/installedMap'
import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import {
  vdf,
  mockedFsSteamFiles
} from '../localFiles/__tests__/fixtures/mockedFsSteamFiles'
import { getSteamLibraries, getFileSize } from 'backend/utils'
const sendFrontendMessage = jest.fn()
import { t as i18nextT } from 'i18next'
import { backfillBridgeLaunchTargets } from '../bridge/launchTarget'
import { createMockSteamUser } from 'backend/testUtils/testSteamUser'
const steamUser = createMockSteamUser()
import { getBottleSteamappsDir } from '../bottle'
import {
  getBridgeBottleSettings,
  listReadyBridgeBottleNames,
  resolveBridgeBottleName
} from '../bridgeBottle'
import { join } from 'path'
import { bridgeAllowlist } from '../bridge/allowlist'
import { captureOwnedAppPlatforms } from '../platformCapture'
import { captureOwnedAppMetacritic } from '../metacriticCapture'
import { listSteamClientPids } from '../steamClientProcess'
import { pollInstallOnce } from '../library/installPollOnce'
import { startInstallPolling } from '../library/installPolling'
import { at } from './fixtures/indexed'
import type { Stores } from 'backend/services/types'

import { createTestAnonymousClient } from 'backend/testUtils/testAnonymousClient'
import { logInfo, logWarning } from 'backend/logger'
import { createTestGlobalConfig } from 'backend/testUtils/testConfig'

const libDeps = {
  config: createTestGlobalConfig(),
  requestRustInvoke: mockedFsSteamFiles().requestRustInvoke
}

const { steamLibraryStore, steamMetadataStore, steamSyncStore } =
  jest.requireMock<Stores['steam']>('../stores')
const steamStoresModule = jest.requireMock<Stores['steam']>('../stores')

// The boot-owned anonymous client (D-66.3-14): a scripted `get`, no CM connection.
const getAnonymousPicsClient = jest.fn()
// 66.3-15: the bottle helpers are read through the deps slice, so they are plain mocks here.
const getSteamBottleSettings = jest.fn()
const isSteamBottleProvisioned = jest.fn()
const steamTestDeps = createTestManagerDeps({
  requestRustInvoke: mockedFsSteamFiles().requestRustInvoke,
  sendFrontendMessage,
  steamUser,
  steamBottle: { getSteamBottleSettings, isSteamBottleProvisioned } as never,
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
const consumeSteamRefreshLogonGrant = () =>
  steamTestDeps.steamSession.authTrigger.consumeSteamRefreshLogonGrant()

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

const makeOwnedApp = (
  appid: number,
  name: string,
  playtime_forever: number,
  rtime_last_played = 0
) => ({
  appid,
  name,
  playtime_forever,
  rtime_last_played,
  img_icon_url: ''
})

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

const makeFakeClient = (apps: ReturnType<typeof makeOwnedApp>[]) => ({
  steamID: 'STEAMID_TEST',
  getUserOwnedApps: jest
    .fn()
    .mockResolvedValue({ app_count: apps.length, apps })
})

// ── Describe block ────────────────────────────────────────────────────────────

describe('SteamLibraryManager', () => {
  let manager: SteamLibraryManager
  let leaseRelease: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    library.clear()
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
  // ── LIB-01: refresh() and owned app fetch ─────────────────────────────────

  it('LIB-01: refresh() calls getUserOwnedApps and builds a GameInfo per owned app', async () => {
    const apps = [
      makeOwnedApp(570, 'Dota 2', 120),
      makeOwnedApp(440, 'Team Fortress 2', 60)
    ]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])

    const result = await manager.refresh()

    expect(fakeClient.getUserOwnedApps).toHaveBeenCalledTimes(1)
    expect(fakeClient.getUserOwnedApps).toHaveBeenCalledWith('STEAMID_TEST', {
      includePlayedFreeGames: true
    })
    expect(result).not.toBeNull()
  })

  it('LIB-01: refresh() calls sendFrontendMessage pushGameToLibrary once per game', async () => {
    const apps = [
      makeOwnedApp(570, 'Dota 2', 120),
      makeOwnedApp(440, 'Team Fortress 2', 60)
    ]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])

    await manager.refresh()

    // 34.15 D-07: refresh() now ALSO emits on the steamSyncStatus channel
    // (entry 'syncing' + terminal 'idle'), so the total sendFrontendMessage
    // call count is no longer 1:1 with pushGameToLibrary pushes — filter to
    // the pushGameToLibrary channel specifically, matching this test's own
    // name and intent.
    const pushCalls = jest
      .mocked(sendFrontendMessage)
      .mock.calls.filter(([channel]) => channel === 'pushGameToLibrary')
    expect(pushCalls).toHaveLength(2)
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({
        runner: 'steam',
        app_name: '570',
        title: 'Dota 2'
      })
    )
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({
        runner: 'steam',
        app_name: '440',
        title: 'Team Fortress 2'
      })
    )
    // steamLibraryStore and steamSyncStore are written after the loop
    expect(steamLibraryStore.set).toHaveBeenCalledWith(
      'games',
      expect.any(Array)
    )
    expect(steamSyncStore.set).toHaveBeenCalledWith(
      'syncedAt',
      expect.any(Number)
    )
  })

  // ── LIB-03: playtime mapping ───────────────────────────────────────────────

  it('LIB-03: GameInfo.extra.steamPlaytimeMinutes equals app.playtime_forever', async () => {
    const apps = [makeOwnedApp(570, 'Dota 2', 4200)]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])

    await manager.refresh()

    const calls = jest.mocked(sendFrontendMessage).mock.calls
    const pushed = calls.find(([_msg, info]) => info.app_name === '570')?.[1]

    expect(pushed?.extra?.steamPlaytimeMinutes).toBe(4200)
  })

  it('LIB-03: GameInfo.extra.steamLastPlayed equals app.rtime_last_played', async () => {
    const LAST_PLAYED_TS = 1750000000 // arbitrary Unix-seconds timestamp
    const apps = [makeOwnedApp(570, 'Dota 2', 4200, LAST_PLAYED_TS)]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])

    await manager.refresh()

    const calls = jest.mocked(sendFrontendMessage).mock.calls
    const pushed = calls.find(([_msg, info]) => info.app_name === '570')?.[1]

    expect(pushed?.extra?.steamLastPlayed).toBe(LAST_PLAYED_TS)
  })

  // ── Phase 17 D-08 reconciliation (Plan 09): steamPlatformsCaptured ─────────

  it('D-08 reconciliation: synced GameInfo carries steamPlatformsCaptured:true when cachedMeta.platformsCaptured is true', async () => {
    const apps = [makeOwnedApp(570, 'Dota 2', 120)]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    // Quick task 260816-hdg: `is_windows_native` is what makes this fixture
    // mean what its name says — a LEGITIMATELY-WRITTEN post-D-17 entry. Every
    // real write persists it in the same object literal as `platformsCaptured`
    // (games.ts fetchMetadataIfNeeded), so an entry without it is pre-D-17
    // residue, not a captured entry. See the residue counterpart below.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_windows_native: true,
      is_mac_native: false
    })

    await manager.refresh()

    const calls = jest.mocked(sendFrontendMessage).mock.calls
    const pushed = calls.find(([_msg, info]) => info.app_name === '570')?.[1]

    expect(pushed?.steamPlatformsCaptured).toBe(true)
  })

  it('260816-hdg: synced GameInfo carries steamPlatformsCaptured:FALSE for a pre-D-17 residue entry (platformsCaptured:true, no is_windows_native)', async () => {
    const apps = [makeOwnedApp(570, 'Dota 2', 120)]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    // THE 370-ENTRY RESIDUE SHAPE. The mac answer is real and is left alone;
    // only the depot claim is cleared, so the frontend stops being told a
    // depot signal was captured when the field that fetch owes is absent.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })

    await manager.refresh()

    const calls = jest.mocked(sendFrontendMessage).mock.calls
    const pushed = calls.find(([_msg, info]) => info.app_name === '570')?.[1]

    expect(pushed?.steamPlatformsCaptured).toBe(false)
  })

  it('D-08 reconciliation: synced GameInfo carries steamPlatformsCaptured:false when cachedMeta is absent (never synced)', async () => {
    const apps = [makeOwnedApp(570, 'Dota 2', 120)]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)

    await manager.refresh()

    const calls = jest.mocked(sendFrontendMessage).mock.calls
    const pushed = calls.find(([_msg, info]) => info.app_name === '570')?.[1]

    expect(pushed?.steamPlatformsCaptured).toBe(false)
  })

  // ── D-17: is_windows_native hydration ──────────────────────────────────────

  it('D-17: synced GameInfo carries is_windows_native:true when cachedMeta.is_windows_native is true', async () => {
    const apps = [makeOwnedApp(570, 'Dota 2', 120)]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true
    })

    await manager.refresh()

    const calls = jest.mocked(sendFrontendMessage).mock.calls
    const pushed = calls.find(([_msg, info]) => info.app_name === '570')?.[1]

    expect(pushed?.is_windows_native).toBe(true)
  })

  // NARROWED by 34.13 review WR-16 (was: `toBe(false)`). The SAFETY
  // property D-17 actually requires is "never `true` when nothing was
  // captured" — every consumer tests `=== true`, so that is what makes a
  // Windows install un-offerable. Pinning the literal `false` additionally
  // asserted that a never-captured entry is INDISTINGUISHABLE from a
  // confirmed-no-Windows-depot one, which contradicts the three-valued
  // contract both `common/types.ts` and `stores.ts` document. The
  // assertions below pin the safety property AND the preserved
  // distinction.
  it('D-17 false-safe: synced GameInfo never carries is_windows_native:true when cachedMeta is absent, and preserves undefined ("never captured")', async () => {
    const apps = [makeOwnedApp(570, 'Dota 2', 120)]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)

    await manager.refresh()

    const calls = jest.mocked(sendFrontendMessage).mock.calls
    const pushed = calls.find(([_msg, info]) => info.app_name === '570')?.[1]

    // The load-bearing half: an uncaptured verdict can never offer Windows.
    expect(pushed?.is_windows_native).not.toBe(true)
    // The contract half: "never captured" stays distinguishable from
    // "confirmed no Windows depot" (`false`).
    expect(pushed?.is_windows_native).toBeUndefined()
  })

  it('261029-sbi: synced GameInfo carries metacritic_score from cachedMeta', async () => {
    const apps = [makeOwnedApp(570, 'Dota 2', 120)]
    jest
      .mocked(steamUser.getClient)
      .mockReturnValue(makeFakeClient(apps) as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      metacritic_score: 90
    })

    await manager.refresh()

    const pushed = jest
      .mocked(sendFrontendMessage)
      .mock.calls.find(([_m, info]) => info.app_name === '570')?.[1]
    expect(pushed?.metacritic_score).toBe(90)
  })

  it('261029-sbi: absent cachedMeta gives metacritic_score undefined, never 0', async () => {
    const apps = [makeOwnedApp(570, 'Dota 2', 120)]
    jest
      .mocked(steamUser.getClient)
      .mockReturnValue(makeFakeClient(apps) as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)

    await manager.refresh()

    const pushed = jest
      .mocked(sendFrontendMessage)
      .mock.calls.find(([_m, info]) => info.app_name === '570')?.[1]
    expect(pushed).toBeDefined()
    expect(pushed.metacritic_score).toBeUndefined()
  })

  it('D-17: a CONFIRMED-false cachedMeta stays false -- distinct from the never-captured case above', async () => {
    const apps = [makeOwnedApp(570, 'Dota 2', 120)]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: false
    })

    await manager.refresh()

    const calls = jest.mocked(sendFrontendMessage).mock.calls
    const pushed = calls.find(([_msg, info]) => info.app_name === '570')?.[1]

    expect(pushed?.is_windows_native).toBe(false)
    expect(pushed?.is_windows_native).not.toBeUndefined()
  })

  // ── CR-01 gap closure (18-05): mac_arch survives refresh() resync ─────────

  it("CR-01: refresh() seeds mac_arch:'32' from cachedMeta so a cached Mach-O verdict survives resync", async () => {
    const apps = [
      makeOwnedApp(570, 'Old 32-bit Game', 120),
      makeOwnedApp(440, 'Never Checked Game', 60)
    ]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    ;(steamMetadataStore.get as jest.Mock).mockImplementation(
      (appId: string) => {
        if (appId === '570') {
          return { mac_arch: '32', mac_arch_source: 'macho' }
        }
        return undefined
      }
    )

    await manager.refresh()

    const calls = jest.mocked(sendFrontendMessage).mock.calls
    const pushed570 = calls.find(([_msg, info]) => info.app_name === '570')?.[1]
    const pushed440 = calls.find(([_msg, info]) => info.app_name === '440')?.[1]

    expect(pushed570?.mac_arch).toBe('32')
    // Negative control: no cached mac_arch → 'unknown', never '32' by default
    // (T-18-05-02 false-flag-safe invariant)
    expect(pushed440?.mac_arch).toBe('unknown')
  })

  // ── Cache fallback ────────────────────────────────────────────────────────

  it('refresh() serves cached library from steamLibraryStore when getUserOwnedApps throws', async () => {
    const cachedGames = [
      {
        runner: 'steam',
        app_name: '570',
        title: 'Dota 2',
        is_installed: false
      } as any
    ]
    const fakeClient = {
      steamID: 'STEAMID_TEST',
      getUserOwnedApps: jest.fn().mockRejectedValue(new Error('CM unreachable'))
    }
    jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue(cachedGames)

    const result = await manager.refresh()

    // Should NOT throw — returns error result
    expect(result).not.toBeNull()
    expect((result as any).stderr).toContain('CM unreachable')
    // Should push each cached game to the frontend
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      cachedGames[0]
    )
    // Should NOT write a new list to the store on failure
    expect(steamLibraryStore.set).not.toHaveBeenCalled()
  })

  // ── 34.15 D-07: refresh() sync status emission, one test per exit path ─────

  /** Filters the sendFrontendMessage mock's calls to the steamSyncStatus
   *  channel and returns the payloads in call order, so every assertion
   *  below reads as an ordered SEQUENCE rather than a magic call index. */
  const steamSyncEmits = () =>
    jest
      .mocked(sendFrontendMessage)
      .mock.calls.filter(([channel]) => channel === 'steamSyncStatus')
      .map(([, payload]) => payload)

  describe('SteamLibraryManager.refresh() sync status emission (34.15 D-07)', () => {
    const refuse = (reason: string) =>
      jest
        .mocked(steamUser.acquireAuthenticated)
        .mockResolvedValue({ ok: false, reason } as never)

    it('exit path 1 (client not ready): emits [failed/client-not-ready] and resolves null', async () => {
      refuse('client-not-ready')

      const result = await manager.refresh()

      expect(result).toBeNull()
      expect(steamSyncEmits()).toEqual([
        { status: 'failed', reason: 'client-not-ready' }
      ])
    })

    it('exit path 1 (CM rejected the logon): still ONE failed emit, but names it logon-rejected so it never reads as a readiness race', async () => {
      // `jest.mocked(SteamUser).x` rather than `jest.mocked(steamUser.x)`:
      // the latter is a bare method reference and trips unbound-method.
      refuse('logon-rejected')
      jest.mocked(steamUser).getLogonFailure.mockReturnValue({
        message: 'AccessDenied',
        eresult: 15
      })

      const result = await manager.refresh()

      expect(result).toBeNull()
      expect(steamSyncEmits()).toEqual([
        { status: 'failed', reason: 'logon-rejected' }
      ])
    })

    it.each(['token-absent', 'token-unreadable', 'not-signed-in'])(
      'exit path 1 (%s): maps to the generic client-not-ready reason',
      async (reason) => {
        refuse(reason)

        await manager.refresh()

        expect(steamSyncEmits()).toEqual([
          { status: 'failed', reason: 'client-not-ready' }
        ])
      }
    )

    it('refused go-offline-required: exactly one idle emit, no logon, cached library untouched', async () => {
      refuse('go-offline-required')

      const result = await manager.refresh()

      expect(result).toBeNull()
      expect(steamSyncEmits()).toEqual([{ status: 'idle' }])
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.anything()
      )
    })

    describe('UAT 23: non-sync exits restore the cached library', () => {
      const cachedGame = (app_name: string, is_installed: boolean) =>
        ({
          runner: 'steam',
          app_name,
          title: app_name,
          is_installed,
          install: {}
        }) as any
      const seedCache = () =>
        jest
          .mocked(steamLibraryStore.get)
          .mockReturnValue([cachedGame('1', true), cachedGame('2', false)])
      const pushedBeforeLastEmit = () => {
        const calls = sendFrontendMessage.mock.calls
        const lastEmit = calls.map((c) => c[0]).lastIndexOf('steamSyncStatus')
        return calls
          .slice(0, lastEmit)
          .filter((c) => c[0] === 'pushGameToLibrary').length
      }

      beforeEach(() => library.clear())

      it('not-signed-in: map seeded, both pushed before the single failed emit, warning kept', async () => {
        seedCache()
        refuse('not-signed-in')

        await manager.refresh()

        expect([...library.keys()]).toEqual(['1', '2'])
        expect(pushedBeforeLastEmit()).toBeGreaterThanOrEqual(2)
        expect(steamSyncEmits()).toEqual([
          { status: 'failed', reason: 'client-not-ready' }
        ])
        expect(logWarning).toHaveBeenCalledWith(
          'Steam client not ready (not-signed-in), skipping library refresh',
          'Steam'
        )
      })

      it('logon-rejected and go-offline-required exits also seed the map', async () => {
        seedCache()
        refuse('logon-rejected')
        await manager.refresh()
        expect(library.size).toBe(2)

        library.clear()
        resetSteamAuthTrigger()
        noteRefreshTrigger('steam', 'action-icons-refresh-button')
        refuse('go-offline-required')
        sendFrontendMessage.mockClear()
        await manager.refresh()
        expect(library.size).toBe(2)
        expect(steamSyncEmits()).toEqual([{ status: 'idle' }])
      })

      it('ungranted refresh with no open session seeds the map and never logs on', async () => {
        seedCache()
        consumeSteamRefreshLogonGrant()

        await manager.refresh()

        expect(library.size).toBe(2)
        expect(steamUser.acquireAuthenticated).not.toHaveBeenCalled()
        expect(steamSyncEmits()).toEqual([{ status: 'idle' }])
      })

      it('no steamID: map seeded, failed/client-not-ready', async () => {
        seedCache()
        jest
          .mocked(steamUser.getClient)
          .mockReturnValue({ steamID: null } as any)

        await manager.refresh()

        expect(library.size).toBe(2)
        expect(steamSyncEmits()).toEqual([
          { status: 'failed', reason: 'client-not-ready' }
        ])
      })

      it('getUserOwnedApps throws: cached games pushed before failed, even into a non-empty map', async () => {
        seedCache()
        library.set('1', cachedGame('1', true))
        const fakeClient = makeFakeClient([])
        fakeClient.getUserOwnedApps.mockRejectedValue(new Error('cm down'))
        jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)

        await manager.refresh()

        expect(pushedBeforeLastEmit()).toBeGreaterThanOrEqual(1)
        expect(steamSyncEmits()).toEqual([
          { status: 'syncing' },
          { status: 'failed', reason: 'owned-apps-failed' }
        ])
      })

      it('after a not-signed-in refresh the installed entry is in the map detectSteamUpdates iterates', async () => {
        jest
          .mocked(steamLibraryStore.get)
          .mockReturnValue([cachedGame('1', false)])
        jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
        ;(existsSync as jest.Mock).mockReturnValue(true)
        ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_1.acf'])
        ;(readFileSync as jest.Mock).mockReturnValue('content')
        vdf.parse.mockReturnValue({
          AppState: {
            appid: '1',
            StateFlags: '4',
            installdir: 'g1',
            SizeOnDisk: '5'
          }
        })
        jest.mocked(getFileSize).mockReturnValue('5 B')
        refuse('not-signed-in')

        await manager.refresh()

        expect(library.get('1')?.is_installed).toBe(true)
      })
    })

    it('a granted Refresh asks for the guided Go Offline step', async () => {
      const fakeClient = makeFakeClient([])
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)

      await manager.refresh()

      expect(steamUser.acquireAuthenticated).toHaveBeenCalledTimes(1)
      expect(steamUser.acquireAuthenticated).toHaveBeenCalledWith({
        reason: 'user-refresh',
        guidedAction: 'refresh'
      })
      expect(leaseRelease).toHaveBeenCalledTimes(1)
    })

    describe('store-exit grant never escalates to the guided Go Offline step (quick 261114-aqa)', () => {
      const cached = (app_name: string) =>
        ({
          runner: 'steam',
          app_name,
          title: app_name,
          is_installed: false,
          install: {}
        }) as any

      it('a refused go-offline wrap shows no dialog, keeps the cache, emits idle', async () => {
        jest
          .mocked(steamLibraryStore.get)
          .mockReturnValue([cached('1'), cached('2')])
        library.clear()
        resetSteamAuthTrigger()
        noteRefreshTrigger('steam', 'steam-store-exit')
        jest.mocked(steamUser.acquireAuthenticated).mockResolvedValue({
          ok: false,
          reason: 'go-offline-required'
        } as never)
        sendFrontendMessage.mockClear()

        const result = await manager.refresh()

        expect(result).toBeNull()
        expect(steamUser.acquireAuthenticated).toHaveBeenCalledTimes(1)
        expect(steamUser.acquireAuthenticated).toHaveBeenCalledWith({
          reason: 'user-refresh'
        })
        const arg = jest.mocked(steamUser.acquireAuthenticated).mock
          .calls[0]?.[0] as object
        expect(arg).not.toHaveProperty('guidedAction')
        expect(steamSyncEmits()).toEqual([{ status: 'idle' }])
        expect(library.size).toBe(2)
        expect(sendFrontendMessage).not.toHaveBeenCalledWith(
          'steamGoOfflineRequired',
          expect.anything()
        )
        const storeExitLogs = jest
          .mocked(logInfo)
          .mock.calls.filter(([m]) => String(m).includes('store-exit'))
        expect(storeExitLogs).toHaveLength(1)
        expect(storeExitLogs[0]?.[0]).toContain('cached library')
      })

      it('a successful store-exit refresh syncs without a guidedAction', async () => {
        resetSteamAuthTrigger()
        noteRefreshTrigger('steam', 'steam-store-exit')
        jest
          .mocked(steamUser.getClient)
          .mockReturnValue(makeFakeClient([]) as any)

        await manager.refresh()

        expect(steamUser.acquireAuthenticated).toHaveBeenCalledWith({
          reason: 'user-refresh'
        })
        expect(leaseRelease).toHaveBeenCalledTimes(1)
      })

      it.each(['redeem-steam-key', 'steam-go-offline-retry'])(
        'explicit origin %s still passes guidedAction refresh',
        async (origin) => {
          resetSteamAuthTrigger()
          noteRefreshTrigger('steam', origin)
          jest
            .mocked(steamUser.getClient)
            .mockReturnValue(makeFakeClient([]) as any)

          await manager.refresh()

          expect(steamUser.acquireAuthenticated).toHaveBeenCalledWith({
            reason: 'user-refresh',
            guidedAction: 'refresh'
          })
        }
      )
    })

    it('a sign-in grant acquires with reason login', async () => {
      resetSteamAuthTrigger()
      noteRefreshTrigger('steam', 'login-success')
      jest
        .mocked(steamUser.getClient)
        .mockReturnValue(makeFakeClient([]) as any)

      await manager.refresh()

      expect(steamUser.acquireAuthenticated).toHaveBeenCalledWith({
        reason: 'login',
        guidedAction: 'refresh'
      })
    })

    it('the grant is one-shot: a second refresh without a new grant does not acquire', async () => {
      jest
        .mocked(steamUser.getClient)
        .mockReturnValue(makeFakeClient([]) as any)

      await manager.refresh()
      await manager.refresh()

      expect(steamUser.acquireAuthenticated).toHaveBeenCalledTimes(1)
    })

    it('exit path 2 (getUserOwnedApps throws): emits [syncing, failed/owned-apps-failed] AFTER cached games are pushed', async () => {
      const cachedGames = [
        {
          runner: 'steam',
          app_name: '570',
          title: 'Dota 2',
          is_installed: false
        } as any,
        {
          runner: 'steam',
          app_name: '440',
          title: 'Team Fortress 2',
          is_installed: false
        } as any
      ]
      const fakeClient = {
        steamID: 'STEAMID_TEST',
        getUserOwnedApps: jest
          .fn()
          .mockRejectedValue(new Error('CM unreachable'))
      }
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue(cachedGames)

      await manager.refresh()

      expect(steamSyncEmits()).toEqual([
        { status: 'syncing' },
        { status: 'failed', reason: 'owned-apps-failed' }
      ])
      // The "notice renders above a populated grid" requirement: both cached
      // games must have been pushed BEFORE the failure emit, not after.
      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const pushIndices = calls
        .map(([channel], i) => (channel === 'pushGameToLibrary' ? i : -1))
        .filter((i) => i !== -1)
      const failedEmitIndex = calls.findIndex(
        ([channel, payload]) =>
          channel === 'steamSyncStatus' && payload.status === 'failed'
      )
      expect(pushIndices).toHaveLength(2)
      expect(Math.max(...pushIndices)).toBeLessThan(failedEmitIndex)
    })

    it('exit path 3 (success): emits [syncing, idle] and NO failed payload', async () => {
      const apps = [makeOwnedApp(570, 'Dota 2', 120)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      expect(steamSyncEmits()).toEqual([
        { status: 'syncing' },
        { status: 'idle' }
      ])
    })

    it('exit path 4 (previously-uncaught Steps 2-4 hydration span): emits [syncing, failed/sync-failed], rejects, and NEVER emits idle', async () => {
      const apps = [makeOwnedApp(570, 'Dota 2', 120)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])
      // Forcing seam: steamLibraryStore.set is called at the tail of the
      // Steps 2-4 span with no catch above it at HEAD — this is exactly the
      // previously-silent unhandled-rejection path reachable from init()'s
      // unscoped runOnceWhenOnline(() => this.refresh()).
      jest.mocked(steamLibraryStore.set).mockImplementation(() => {
        throw new Error('disk write failed')
      })

      await expect(manager.refresh()).rejects.toThrow('disk write failed')

      expect(steamSyncEmits()).toEqual([
        { status: 'syncing' },
        { status: 'failed', reason: 'sync-failed' }
      ])
      // Negative gate: the regression a `finally` block would introduce.
      expect(steamSyncEmits()).not.toContainEqual({ status: 'idle' })
    })
  })

  describe('Phase 54 ungranted (automatic) refresh', () => {
    beforeEach(() => {
      // Drop the grant the shared beforeEach armed.
      consumeSteamRefreshLogonGrant()
    })

    it('with no open session: no logon, one idle emit, install state reconciled locally', async () => {
      const result = await manager.refresh()

      expect(result).toBeNull()
      expect(steamUser.acquireAuthenticated).not.toHaveBeenCalled()
      expect(steamSyncEmits()).toEqual([{ status: 'idle' }])
    })

    it('a throwing local reconcile still yields exactly one idle emit', async () => {
      jest.mocked(getSteamLibraries).mockRejectedValue(new Error('boom'))

      await manager.refresh()

      expect(steamSyncEmits()).toEqual([{ status: 'idle' }])
    })

    it('with an open session: full sync on that client, no new logon, lease released', async () => {
      const fakeClient = makeFakeClient([makeOwnedApp(570, 'Dota 2', 120)])
      jest
        .mocked(steamUser.acquireOpenAuthenticated)
        .mockReturnValue({ client: fakeClient, release: leaseRelease } as never)

      await manager.refresh()

      expect(steamUser.acquireAuthenticated).not.toHaveBeenCalled()
      expect(fakeClient.getUserOwnedApps).toHaveBeenCalledTimes(1)
      expect(steamSyncEmits()).toEqual([
        { status: 'syncing' },
        { status: 'idle' }
      ])
      expect(leaseRelease).toHaveBeenCalledTimes(1)
    })

    it('releases the open-session lease on the hydration-catch rethrow', async () => {
      const fakeClient = makeFakeClient([makeOwnedApp(570, 'Dota 2', 120)])
      jest
        .mocked(steamUser.acquireOpenAuthenticated)
        .mockReturnValue({ client: fakeClient, release: leaseRelease } as never)
      jest.mocked(steamLibraryStore.set).mockImplementation(() => {
        throw new Error('disk write failed')
      })

      await expect(manager.refresh()).rejects.toThrow('disk write failed')

      expect(leaseRelease).toHaveBeenCalledTimes(1)
    })
  })

  describe('Phase 54 platform capture runs anonymous first', () => {
    const anon = { tag: 'anon' }

    it('a complete anonymous pass is the only pass', async () => {
      const fakeClient = makeFakeClient([makeOwnedApp(570, 'Dota 2', 120)])
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(getAnonymousPicsClient).mockResolvedValue(anon as never)
      jest.mocked(captureOwnedAppPlatforms).mockResolvedValue({
        scopedCount: 1,
        capturedCount: 1,
        skippedCount: 0,
        failed: false
      })

      await manager.refresh()

      expect(captureOwnedAppPlatforms).toHaveBeenCalledTimes(1)
      expect(captureOwnedAppPlatforms).toHaveBeenCalledWith(
        steamTestDeps,
        anon,
        [570]
      )
    })

    it('an incomplete anonymous pass gets a second pass on the held session', async () => {
      const fakeClient = makeFakeClient([makeOwnedApp(570, 'Dota 2', 120)])
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(getAnonymousPicsClient).mockResolvedValue(anon as never)
      jest.mocked(captureOwnedAppPlatforms).mockResolvedValue({
        scopedCount: 1,
        capturedCount: 0,
        skippedCount: 0,
        failed: false
      })

      await manager.refresh()

      expect(captureOwnedAppPlatforms).toHaveBeenCalledTimes(2)
      expect(captureOwnedAppPlatforms).toHaveBeenNthCalledWith(
        1,
        steamTestDeps,
        anon,
        [570]
      )
      expect(captureOwnedAppPlatforms).toHaveBeenNthCalledWith(
        2,
        steamTestDeps,
        fakeClient,
        [570]
      )
    })

    it('a failed anonymous pass gets a second pass', async () => {
      const fakeClient = makeFakeClient([makeOwnedApp(570, 'Dota 2', 120)])
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(getAnonymousPicsClient).mockResolvedValue(anon as never)
      jest.mocked(captureOwnedAppPlatforms).mockResolvedValue({
        scopedCount: 1,
        capturedCount: 1,
        skippedCount: 0,
        failed: true
      })

      await manager.refresh()

      expect(captureOwnedAppPlatforms).toHaveBeenCalledTimes(2)
    })

    it('261029-sbi: metacritic capture gets the anonymous client and runs before the first push', async () => {
      const fakeClient = makeFakeClient([makeOwnedApp(570, 'Dota 2', 120)])
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(getAnonymousPicsClient).mockResolvedValue(anon as never)
      jest.mocked(captureOwnedAppPlatforms).mockResolvedValue({
        scopedCount: 0,
        capturedCount: 0,
        skippedCount: 0,
        failed: false
      })

      await manager.refresh()

      expect(captureOwnedAppMetacritic).toHaveBeenCalledWith(
        steamTestDeps,
        anon,
        [570]
      )
      const capOrder = at(
        jest.mocked(captureOwnedAppMetacritic).mock.invocationCallOrder,
        0
      )
      const pushIdx = jest
        .mocked(sendFrontendMessage)
        .mock.calls.findIndex(([m]) => m === 'pushGameToLibrary')
      expect(pushIdx).toBeGreaterThanOrEqual(0)
      expect(capOrder).toBeLessThan(
        at(jest.mocked(sendFrontendMessage).mock.invocationCallOrder, pushIdx)
      )
    })

    it('261029-sbi: no anonymous client falls back to the held session', async () => {
      const fakeClient = makeFakeClient([makeOwnedApp(570, 'Dota 2', 120)])
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)

      await manager.refresh()

      expect(captureOwnedAppMetacritic).toHaveBeenCalledWith(
        steamTestDeps,
        fakeClient,
        [570]
      )
    })

    it('no anonymous client: one pass on the held session', async () => {
      const fakeClient = makeFakeClient([makeOwnedApp(570, 'Dota 2', 120)])
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)

      await manager.refresh()

      expect(captureOwnedAppPlatforms).toHaveBeenCalledTimes(1)
      expect(captureOwnedAppPlatforms).toHaveBeenCalledWith(
        steamTestDeps,
        fakeClient,
        [570]
      )
    })
  })

  // ── 34.15 D-03 fail-soft: the library survives a dead/failing PICS call ────

  describe('D-03 fail-soft', () => {
    it('refresh() still completes normally when captureOwnedAppPlatforms reports failed:true', async () => {
      jest.mocked(captureOwnedAppPlatforms).mockResolvedValue({
        scopedCount: 3,
        capturedCount: 0,
        skippedCount: 3,
        failed: true
      })
      const apps = [makeOwnedApp(570, 'Dota 2', 120)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      const result = await manager.refresh()

      expect(result).toEqual({ stdout: '1 games synced', stderr: '' })
      expect(steamSyncEmits()).toEqual([
        { status: 'syncing' },
        { status: 'idle' }
      ])
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({ app_name: '570' })
      )
    })

    it('pins current behaviour when captureOwnedAppPlatforms itself rejects (contract violation, defence in depth): the call sits OUTSIDE the Step 2-4 try, so the rejection propagates un-emitted, not as exit path 4', async () => {
      jest
        .mocked(captureOwnedAppPlatforms)
        .mockRejectedValue(new Error('PICS contract violated'))
      const apps = [makeOwnedApp(570, 'Dota 2', 120)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      // Pinned, not silently absorbed: captureOwnedAppPlatforms's own
      // contract is "never throws" (Plan 01) -- refresh() deliberately does
      // NOT add a second, redundant try/catch around a call that is already
      // contracted not to need one. A violation therefore does NOT surface
      // as exit path 4 (that try starts at the Step 2 banner, AFTER this
      // call) -- it propagates as an un-emitted rejection, exactly as any
      // other unexpected exception upstream of Step 2 always has. This is a
      // deliberately narrower net than "catch everything downstream of
      // owned-apps", not a silent-absorption gap: the module this call
      // reaches into is unit-tested (Plan 01) to never take this branch.
      await expect(manager.refresh()).rejects.toThrow('PICS contract violated')
      expect(steamSyncEmits()).toEqual([{ status: 'syncing' }])
    })
  })

  // ── GAP-17-BOTTLE-PLAY-REVERT: refresh() must be bottle-aware ──────────────
  // Regression coverage for the follow-on to bottle-install-not-recognized:
  // refresh() previously derived is_installed ONLY from buildInstalledMap(libDeps)
  // (native ACF scan), so a bottle-only-installed game was always reported
  // not-installed by a full refresh() — which is reachable mid-session via the
  // launch-completion 'done' status (see .planning/debug/bottle-install-not-recognized.md).

  describe('SteamLibraryManager.refresh() bottle reconciliation', () => {
    const envMock = jest.requireMock('backend/constants/environment')

    beforeEach(() => {
      envMock.isMac = true
      envMock.isLinux = false
      jest
        .mocked(getSteamBottleSettings)
        .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
      jest.mocked(getBottleSteamappsDir).mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
      jest
        .mocked(getFileSize)
        .mockImplementation((bytes: unknown) => `${String(bytes)} B`)
      // Native scan finds nothing by default in this block — only the bottle
      // root (mocked separately below) has manifests.
      jest.mocked(getSteamLibraries).mockResolvedValue([])
    })

    afterEach(() => {
      envMock.isMac = false
      envMock.isLinux = true
    })

    it('reports is_installed:true (platform Windows) for a game installed ONLY under the bottle root when isBottleProvisioned() is true', async () => {
      jest.mocked(isSteamBottleProvisioned).mockReturnValue(true)
      ;(existsSync as jest.Mock).mockImplementation(
        (path: string) => path === BOTTLE_STEAMAPPS_ROOT
      )
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
        dir === BOTTLE_STEAMAPPS_ROOT ? ['appmanifest_206020.acf'] : []
      )
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      vdf.parse.mockReturnValue({
        AppState: {
          appid: '206020',
          StateFlags: '4',
          installdir: 'Avernum 4',
          SizeOnDisk: '123456'
        }
      })

      const apps = [makeOwnedApp(206020, 'Avernum 4', 30)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const pushed = calls.find(
        ([_msg, info]) => info.app_name === '206020'
      )?.[1]

      // RED before the fix: pushed.is_installed was false (native-only scan
      // found nothing). GREEN after the fix: bottle fallback is consulted.
      expect(pushed?.is_installed).toBe(true)
      expect(pushed?.install).toEqual(
        expect.objectContaining({
          install_path: join(BOTTLE_STEAMAPPS_ROOT, 'common', 'Avernum 4'),
          install_size: '123456 B',
          // Pitfall 3: bottle installs must always report 'Windows', regardless
          // of host OS (isMac is mocked true in this block).
          platform: 'Windows'
        })
      )
    })

    it('does NOT persist is_installed:false to steamLibraryStore for a bottle-only-installed game when refresh() runs mid-session', async () => {
      jest.mocked(isSteamBottleProvisioned).mockReturnValue(true)
      ;(existsSync as jest.Mock).mockImplementation(
        (path: string) => path === BOTTLE_STEAMAPPS_ROOT
      )
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
        dir === BOTTLE_STEAMAPPS_ROOT ? ['appmanifest_206060.acf'] : []
      )
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      vdf.parse.mockReturnValue({
        AppState: {
          appid: '206060',
          StateFlags: '4',
          installdir: 'Avernum 6',
          SizeOnDisk: '654321'
        }
      })

      const apps = [makeOwnedApp(206060, 'Avernum 6', 10)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const persistedCall = jest
        .mocked(steamLibraryStore.set)
        .mock.calls.find(([key]) => key === 'games')
      const persistedGames = persistedCall?.[1] as any[]
      const persisted = persistedGames?.find((g) => g.app_name === '206060')

      expect(persisted?.is_installed).toBe(true)
    })

    it('falls back to native install data when BOTH native and bottle report the same appId (native wins)', async () => {
      jest.mocked(isSteamBottleProvisioned).mockReturnValue(true)
      const NATIVE_ROOT = join('/native/steam', 'steamapps')
      jest.mocked(getSteamLibraries).mockResolvedValue(['/native/steam'])
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === NATIVE_ROOT) return ['appmanifest_570.acf']
        if (dir === BOTTLE_STEAMAPPS_ROOT) return ['appmanifest_570.acf']
        return []
      })
      ;(readFileSync as jest.Mock).mockImplementation((file: string) => {
        if (file.includes(NATIVE_ROOT)) return 'native-content'
        return 'bottle-content'
      })
      vdf.parse.mockImplementation((content: string) =>
        content === 'native-content'
          ? {
              AppState: {
                appid: '570',
                StateFlags: '4',
                installdir: 'dota2-native',
                SizeOnDisk: '111'
              }
            }
          : {
              AppState: {
                appid: '570',
                StateFlags: '4',
                installdir: 'dota2-bottle',
                SizeOnDisk: '222'
              }
            }
      )

      const apps = [makeOwnedApp(570, 'Dota 2', 5)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const pushed = calls.find(([_msg, info]) => info.app_name === '570')?.[1]

      // Native must win — never double-count/conflate the two roots.
      expect(pushed?.install?.install_path).toBe(
        join(NATIVE_ROOT, 'common', 'dota2-native')
      )
    })

    it('performs NO bottle reconciliation when isBottleProvisioned() returns false (byte-for-byte native-only behavior preserved)', async () => {
      jest.mocked(isSteamBottleProvisioned).mockReturnValue(false)
      // If the bottle path were consulted, readdirSync would be called on the
      // bottle root too — assert it's never scanned (native-only).
      ;(existsSync as jest.Mock).mockReturnValue(false)
      ;(readdirSync as jest.Mock).mockReturnValue([])

      const apps = [makeOwnedApp(206020, 'Avernum 4', 30)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const pushed = calls.find(
        ([_msg, info]) => info.app_name === '206020'
      )?.[1]

      expect(pushed?.is_installed).toBe(false)
      expect(readdirSync).not.toHaveBeenCalledWith(BOTTLE_STEAMAPPS_ROOT)
    })
  })

  // ── D-UAT-24-07: refresh() must ALSO be bridge-aware ────────────────────────
  // The periodic library sync previously derived install-state from ONLY the
  // native + Phase 17 bottle maps — a bridge-installed game (24-12's install
  // poll already flips is_installed:true at install time) got clobbered back
  // to not-installed on the very next sync, causing the Play→Install→Play
  // badge flap (24-UAT.md RETEST RUN 1 NEW-2).

  describe('SteamLibraryManager.refresh() bridge reconciliation (D-UAT-24-07)', () => {
    const envMock = jest.requireMock('backend/constants/environment')

    beforeEach(() => {
      envMock.isMac = true
      envMock.isLinux = false
      jest.mocked(isSteamBottleProvisioned).mockReturnValue(false)
      jest
        .mocked(getBridgeBottleSettings)
        .mockReturnValue({ wineCrossoverBottle: 'GameLibSteamBridge' } as any)
      jest
        .mocked(getBottleSteamappsDir)
        .mockReturnValue(BRIDGE_BOTTLE_STEAMAPPS_ROOT)
      jest
        .mocked(getFileSize)
        .mockImplementation((bytes: unknown) => `${String(bytes)} B`)
      // Native scan finds nothing by default — only the bridge root has manifests.
      jest.mocked(getSteamLibraries).mockResolvedValue([])
    })

    afterEach(() => {
      envMock.isMac = false
      envMock.isLinux = true
    })

    it('reports is_installed:true (platform Windows) for a game installed ONLY under the bridge root when listReadyBridgeBottleNames() is non-empty, and STAYS installed across a second refresh (no revert)', async () => {
      jest
        .mocked(listReadyBridgeBottleNames)
        .mockReturnValue(['GameLibSteamBridge'])
      jest.mocked(resolveBridgeBottleName).mockReturnValue('GameLibSteamBridge')
      ;(existsSync as jest.Mock).mockImplementation(
        (path: string) => path === BRIDGE_BOTTLE_STEAMAPPS_ROOT
      )
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
        dir === BRIDGE_BOTTLE_STEAMAPPS_ROOT ? ['appmanifest_206040.acf'] : []
      )
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      vdf.parse.mockReturnValue({
        AppState: {
          appid: '206040',
          StateFlags: '4',
          installdir: 'Avernum 5',
          SizeOnDisk: '9000'
        }
      })

      const apps = [makeOwnedApp(206040, 'Avernum 5', 15)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      let calls = jest.mocked(sendFrontendMessage).mock.calls
      let pushed = calls.find(([_msg, info]) => info.app_name === '206040')?.[1]

      // RED before the fix: pushed.is_installed was false (native+bottle-only
      // scan found nothing). GREEN after the fix: bridge fallback is consulted.
      expect(pushed?.is_installed).toBe(true)
      expect(pushed?.install).toEqual(
        expect.objectContaining({
          install_path: join(
            BRIDGE_BOTTLE_STEAMAPPS_ROOT,
            'common',
            'Avernum 5'
          ),
          install_size: '9000 B',
          // Pitfall 3 (D-UAT-24-07-B): a bridge install must always report
          // 'Windows', never the host 'Mac'.
          platform: 'Windows'
        })
      )

      // Second refresh — D-UAT-24-07: must NOT clobber the badge back to false.
      jest.mocked(sendFrontendMessage).mockClear()
      noteRefreshTrigger('steam', 'action-icons-refresh-button')
      await manager.refresh()

      calls = jest.mocked(sendFrontendMessage).mock.calls
      pushed = calls.find(([_msg, info]) => info.app_name === '206040')?.[1]

      expect(pushed?.is_installed).toBe(true)
    })

    const armBridgeInstalled = () => {
      jest
        .mocked(listReadyBridgeBottleNames)
        .mockReturnValue(['GameLibSteamBridge'])
      jest.mocked(resolveBridgeBottleName).mockReturnValue('GameLibSteamBridge')
      ;(existsSync as jest.Mock).mockImplementation(
        (path: string) => path === BRIDGE_BOTTLE_STEAMAPPS_ROOT
      )
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
        dir === BRIDGE_BOTTLE_STEAMAPPS_ROOT
          ? ['appmanifest_206040.acf', 'appmanifest_206041.acf']
          : []
      )
      ;(readFileSync as jest.Mock).mockImplementation((p: string) =>
        String(p).includes('206041') ? 'two' : 'one'
      )
      vdf.parse.mockImplementation((c: string) => ({
        AppState: {
          appid: c === 'two' ? '206041' : '206040',
          StateFlags: '4',
          installdir: c === 'two' ? 'Game Two' : 'Avernum 5',
          SizeOnDisk: '9000'
        }
      }))
      jest.mocked(steamLibraryStore.get).mockReturnValue([])
    }

    it('Phase 54: a granted refresh backfills launch targets for the installed bridge titles on its held client, once', async () => {
      armBridgeInstalled()
      const fakeClient = makeFakeClient([
        makeOwnedApp(206040, 'Avernum 5', 15),
        makeOwnedApp(206041, 'Game Two', 15)
      ])
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)

      await manager.refresh()

      expect(backfillBridgeLaunchTargets).toHaveBeenCalledTimes(1)
      expect(backfillBridgeLaunchTargets).toHaveBeenCalledWith(
        expect.anything(),
        fakeClient,
        expect.arrayContaining(['206040', '206041'])
      )
      expect(
        at(jest.mocked(backfillBridgeLaunchTargets).mock.calls, 0)[2]
      ).toHaveLength(2)
    })

    it('Phase 54: an ungranted refresh never backfills', async () => {
      armBridgeInstalled()
      jest.mocked(steamUser.acquireAuthenticated).mockResolvedValue({
        ok: false,
        reason: 'go-offline-required'
      } as never)

      await manager.refresh()

      expect(backfillBridgeLaunchTargets).not.toHaveBeenCalled()
    })

    it('Phase 54: a rejecting backfill leaves the refresh to its single idle terminal emit', async () => {
      armBridgeInstalled()
      jest
        .mocked(backfillBridgeLaunchTargets)
        .mockRejectedValue(new Error('pics down'))
      const fakeClient = makeFakeClient([makeOwnedApp(206040, 'Avernum 5', 15)])
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)

      await manager.refresh()

      expect(steamSyncEmits()).toEqual([
        { status: 'syncing' },
        { status: 'idle' }
      ])
    })

    it('Phase 54: with no ready bridge bottle the backfill is not called', async () => {
      jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])
      const fakeClient = makeFakeClient([makeOwnedApp(206040, 'Avernum 5', 15)])
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)

      await manager.refresh()

      expect(backfillBridgeLaunchTargets).not.toHaveBeenCalled()
    })

    it('performs NO bridge reconciliation when listReadyBridgeBottleNames() returns [] (byte-for-byte native/bottle-only behavior preserved)', async () => {
      jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])
      // If the bridge path were consulted, readdirSync would be called on the
      // bridge root too — assert it's never scanned.
      ;(existsSync as jest.Mock).mockReturnValue(false)
      ;(readdirSync as jest.Mock).mockReturnValue([])

      const apps = [makeOwnedApp(206040, 'Avernum 5', 15)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const pushed = calls.find(
        ([_msg, info]) => info.app_name === '206040'
      )?.[1]

      expect(pushed?.is_installed).toBe(false)
      expect(readdirSync).not.toHaveBeenCalledWith(BRIDGE_BOTTLE_STEAMAPPS_ROOT)
    })
  })

  // ── D-UAT-24-02 (24-17): install-state is bridge-authoritative for a
  // bridge-eligible title — a native/Phase-17-bottle copy must NOT shadow
  // the bridge (Play routes a bridge-eligible title through the bridge
  // regardless of where a non-bridge copy lives). Hardware-confirmed
  // dead-end: Avernum 6 / Hoard "installed" natively/in the Phase 17 bottle
  // but absent from the bridge bottle (24-UAT.md).

  describe('SteamLibraryManager.refresh() bridge-authoritative install-state (D-UAT-24-02)', () => {
    const envMock = jest.requireMock('backend/constants/environment')

    beforeEach(() => {
      envMock.isMac = true
      envMock.isLinux = false
      jest
        .mocked(getSteamBottleSettings)
        .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
      jest
        .mocked(getBridgeBottleSettings)
        .mockReturnValue({ wineCrossoverBottle: 'GameLibSteamBridge' } as any)
      // Differentiate the Phase 17 bottle root from the bridge root by the
      // requested bottle name — both real functions share this jest.fn(),
      // so tests must not collapse the two roots into one mockReturnValue.
      jest
        .mocked(getBottleSteamappsDir)
        .mockImplementation((_paths: unknown, bottleName: string) =>
          bottleName === 'GameLibSteamBridge'
            ? BRIDGE_BOTTLE_STEAMAPPS_ROOT
            : BOTTLE_STEAMAPPS_ROOT
        )
      jest
        .mocked(getFileSize)
        .mockImplementation((bytes: unknown) => `${String(bytes)} B`)
    })

    afterEach(() => {
      envMock.isMac = false
      envMock.isLinux = true
    })

    it('Test A: a bridge-eligible game present ONLY in the Phase 17 bottle map (absent from the bridge map) is is_installed:false (Avernum 6 / Hoard dead-end case)', async () => {
      jest.mocked(bridgeAllowlist.has).mockReturnValue(true)
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false
      })
      jest.mocked(isSteamBottleProvisioned).mockReturnValue(true)
      jest
        .mocked(listReadyBridgeBottleNames)
        .mockReturnValue(['GameLibSteamBridge'])
      jest.mocked(getSteamLibraries).mockResolvedValue([])
      ;(existsSync as jest.Mock).mockImplementation(
        (path: string) => path === BOTTLE_STEAMAPPS_ROOT
      )
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
        dir === BOTTLE_STEAMAPPS_ROOT ? ['appmanifest_206060.acf'] : []
      )
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      vdf.parse.mockReturnValue({
        AppState: {
          appid: '206060',
          StateFlags: '4',
          installdir: 'Avernum 6',
          SizeOnDisk: '123456'
        }
      })

      const apps = [makeOwnedApp(206060, 'Avernum 6', 10)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const pushed = calls.find(
        ([_msg, info]) => info.app_name === '206060'
      )?.[1]

      // Bridge-authoritative: the Phase 17 bottle copy must NOT satisfy
      // is_installed for a bridge-eligible title.
      expect(pushed?.is_installed).toBe(false)
    })

    it('Test B: a bridge-eligible game present in the bridge bottle is is_installed:true with platform Windows (Avernum 5 stays installed)', async () => {
      jest.mocked(bridgeAllowlist.has).mockReturnValue(true)
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false
      })
      jest.mocked(isSteamBottleProvisioned).mockReturnValue(false)
      jest
        .mocked(listReadyBridgeBottleNames)
        .mockReturnValue(['GameLibSteamBridge'])
      jest.mocked(resolveBridgeBottleName).mockReturnValue('GameLibSteamBridge')
      jest.mocked(getSteamLibraries).mockResolvedValue([])
      ;(existsSync as jest.Mock).mockImplementation(
        (path: string) => path === BRIDGE_BOTTLE_STEAMAPPS_ROOT
      )
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
        dir === BRIDGE_BOTTLE_STEAMAPPS_ROOT ? ['appmanifest_206040.acf'] : []
      )
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      vdf.parse.mockReturnValue({
        AppState: {
          appid: '206040',
          StateFlags: '4',
          installdir: 'Avernum 5',
          SizeOnDisk: '9000'
        }
      })

      const apps = [makeOwnedApp(206040, 'Avernum 5', 15)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const pushed = calls.find(
        ([_msg, info]) => info.app_name === '206040'
      )?.[1]

      expect(pushed?.is_installed).toBe(true)
      expect(pushed?.install).toEqual(
        expect.objectContaining({
          install_path: join(
            BRIDGE_BOTTLE_STEAMAPPS_ROOT,
            'common',
            'Avernum 5'
          ),
          install_size: '9000 B',
          platform: 'Windows'
        })
      )
    })

    it('Test C: a NON-bridge-eligible game present only in the native map is is_installed:true (existing native ?? bottle precedence unchanged)', async () => {
      jest.mocked(bridgeAllowlist.has).mockReturnValue(false)
      const NATIVE_ROOT = join('/native/steam', 'steamapps')
      jest.mocked(getSteamLibraries).mockResolvedValue(['/native/steam'])
      jest.mocked(isSteamBottleProvisioned).mockReturnValue(false)
      jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])
      ;(existsSync as jest.Mock).mockImplementation(
        (path: string) => path === NATIVE_ROOT
      )
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
        dir === NATIVE_ROOT ? ['appmanifest_999.acf'] : []
      )
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      vdf.parse.mockReturnValue({
        AppState: {
          appid: '999',
          StateFlags: '4',
          installdir: 'Non-Eligible Game',
          SizeOnDisk: '111'
        }
      })

      const apps = [makeOwnedApp(999, 'Non-Eligible Game', 5)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const pushed = calls.find(([_msg, info]) => info.app_name === '999')?.[1]

      expect(pushed?.is_installed).toBe(true)
      expect(pushed?.install?.install_path).toBe(
        join(NATIVE_ROOT, 'common', 'Non-Eligible Game')
      )
    })
  })

  // ── WR-01 (21-17): refresh() re-seeds steamResumePending from on-disk ACF ──
  // Before the fix, refresh() derived each GameInfo's install object purely
  // from buildInstalledMap(libDeps) (bit-4-set only). A mid-session resync
  // (reachable via the launch-completion 'done' status) therefore silently
  // wiped the same-session steamResumePending marker set by
  // markSteamInstallIncomplete — reverting the distinct "Resume Install"
  // affordance back to a bare "Install" (the D-UAT-09 symptom). The flag is
  // now derived durably from the on-disk incomplete (bit-4-unset) manifest,
  // so it survives any number of refreshes.

  describe('SteamLibraryManager.refresh() re-seeds steamResumePending (WR-01)', () => {
    const NATIVE_ROOT = join('/native/steam', 'steamapps')

    beforeEach(() => {
      jest.mocked(isSteamBottleProvisioned).mockReturnValue(false)
      jest
        .mocked(getFileSize)
        .mockImplementation((bytes: unknown) => `${String(bytes)} B`)
      jest.mocked(getSteamLibraries).mockResolvedValue(['/native/steam'])
      ;(existsSync as jest.Mock).mockReturnValue(true)
      // One incomplete manifest (1026, bit 4 unset) and one fully-installed
      // manifest (4, bit 4 set) sitting side-by-side in the native root.
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
        dir === NATIVE_ROOT
          ? ['appmanifest_570.acf', 'appmanifest_440.acf']
          : []
      )
      ;(readFileSync as jest.Mock).mockImplementation((file: string) =>
        file.includes('appmanifest_570') ? 'incomplete' : 'installed'
      )
      vdf.parse.mockImplementation((content: string) =>
        content === 'incomplete'
          ? {
              AppState: {
                appid: '570',
                StateFlags: '1026',
                installdir: 'Dota 2',
                SizeOnDisk: '999'
              }
            }
          : {
              AppState: {
                appid: '440',
                StateFlags: '4',
                installdir: 'Team Fortress 2',
                SizeOnDisk: '654321'
              }
            }
      )
    })

    it('an incomplete on-disk native install (bit-4-unset) survives refresh() as is_installed:false + steamResumePending:true', async () => {
      const apps = [
        makeOwnedApp(570, 'Dota 2', 120),
        makeOwnedApp(440, 'Team Fortress 2', 60)
      ]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const incomplete = calls.find(
        ([_msg, info]) => info.app_name === '570'
      )?.[1]

      // Play-safety invariant: never is_installed for a bit-4-unset manifest.
      expect(incomplete?.is_installed).toBe(false)
      // The durable resume affordance is re-derived from disk, not wiped.
      expect(incomplete?.install?.steamResumePending).toBe(true)
    })

    it('a fully-installed on-disk native install (bit-4-set) yields is_installed:true and no steamResumePending (no regression)', async () => {
      const apps = [
        makeOwnedApp(570, 'Dota 2', 120),
        makeOwnedApp(440, 'Team Fortress 2', 60)
      ]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const installed = calls.find(
        ([_msg, info]) => info.app_name === '440'
      )?.[1]

      expect(installed?.is_installed).toBe(true)
      expect(installed?.install?.steamResumePending).toBeUndefined()
      expect(installed?.install?.install_path).toBe(
        join(NATIVE_ROOT, 'common', 'Team Fortress 2')
      )
    })

    it('the re-seeded steamResumePending is persisted to steamLibraryStore (survives a restart mid-session)', async () => {
      const apps = [makeOwnedApp(570, 'Dota 2', 120)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const persistedCall = jest
        .mocked(steamLibraryStore.set)
        .mock.calls.find(([key]) => key === 'games')
      const persistedGames = persistedCall?.[1] as any[]
      const persisted = persistedGames?.find((g) => g.app_name === '570')

      expect(persisted?.is_installed).toBe(false)
      expect(persisted?.install?.steamResumePending).toBe(true)
    })

    it('buildIncompleteInstallSet returns only the bit-4-unset appId (shares the isFullyInstalledStateFlags predicate)', async () => {
      const set = await buildIncompleteInstallSet(libDeps)

      expect(set.has(570)).toBe(true) // 1026 → incomplete
      expect(set.has(440)).toBe(false) // 4 → fully installed, excluded
    })
  })

  // ── 260821-rb5: refresh() must not wipe an install-start breadcrumb ────────
  //
  // Closes case C of aborted-depot-residue todo
  // (.planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md):
  // a hard-killed native install has no `.acf` at all, so unlike WR-01's
  // bit-4-unset manifest, `buildIncompleteInstallSet` can never see it. The
  // ONLY record of it is the breadcrumb this quick task adds to the
  // in-memory `library` entry (and steamLibraryStore). refresh() rebuilds
  // every GameInfo from ACF + ownership data and unconditionally
  // `library.clear()`s first (library.ts ~L842) — the same wipe shape
  // WR-01/D-UAT-09 already had to fix for the ACF-derived flag, but for a
  // field ACF can never re-derive, so it must be captured from the PRIOR
  // library entry before the clear, not recomputed from disk.
  describe('260821-rb5: refresh() preserves an install-start breadcrumb', () => {
    const BREADCRUMB_APP_ID = '570'
    const TARGET = {
      targetSteamappsDir: '/mock/steam/steamapps',
      installdir: 'Dota 2'
    }

    it('a still-not-installed game (no fully-installed ACF, no incomplete ACF) keeps its steamResumePending breadcrumb through refresh()', async () => {
      // No ACF at all for this appId — buildInstalledMap AND
      // buildIncompleteInstallSet both come back empty (default outer
      // beforeEach: getSteamLibraries → []). This is the load-bearing
      // precondition that distinguishes this from WR-01's ACF-derived case.
      library.set(BREADCRUMB_APP_ID, {
        runner: 'steam',
        app_name: BREADCRUMB_APP_ID,
        title: 'Dota 2',
        is_installed: false,
        install: {
          steamResumePending: true,
          steamResumeTargetSteamappsDir: TARGET.targetSteamappsDir,
          steamResumeInstalldir: TARGET.installdir
        },
        art_cover: '',
        art_square: '',
        extra: { reqs: [] },
        canRunOffline: true,
        installable: true
      } as any)

      const apps = [makeOwnedApp(570, 'Dota 2', 120)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const rebuilt = library.get(BREADCRUMB_APP_ID)
      expect(rebuilt?.install?.steamResumePending).toBe(true)
      expect(rebuilt?.install?.steamResumeTargetSteamappsDir).toBe(
        TARGET.targetSteamappsDir
      )
      expect(rebuilt?.install?.steamResumeInstalldir).toBe(TARGET.installdir)

      const persistedCall = jest
        .mocked(steamLibraryStore.set)
        .mock.calls.find(([key]) => key === 'games')
      const persistedGames = persistedCall?.[1] as any[]
      const persisted = persistedGames?.find(
        (g) => g.app_name === BREADCRUMB_APP_ID
      )
      expect(persisted?.install?.steamResumePending).toBe(true)
      expect(persisted?.install?.steamResumeTargetSteamappsDir).toBe(
        TARGET.targetSteamappsDir
      )
      expect(persisted?.install?.steamResumeInstalldir).toBe(TARGET.installdir)
    })
  })

  // ── Art URL migration (capsule_616x353 → library_600x900) ──────────────────
  // ── refreshInstallState() — D-01/D-02 focus-driven ACF re-read ───────────────

  describe('SteamLibraryManager.refreshInstallState()', () => {
    beforeEach(() => {
      library.clear()
      // Default: getSteamLibraries returns empty → buildInstalledMap returns empty Map
      jest.mocked(getSteamLibraries).mockResolvedValue([])
      // install_size is persisted via getFileSize(Number(sizeOnDisk)) — mock a
      // stable, distinguishable formatted string per byte count.
      jest
        .mocked(getFileSize)
        .mockImplementation((bytes: unknown) => `${String(bytes)} B`)
    })

    it('refreshInstallState() calls buildInstalledMap and pushes update when is_installed changes false→true', async () => {
      // Seed library with a game that is NOT installed
      library.set('570', {
        runner: 'steam',
        app_name: '570',
        title: 'Dota 2',
        is_installed: false,
        install: {},
        art_cover: '',
        art_square: '',
        extra: { reqs: [] },
        canRunOffline: true,
        installable: true
      } as any)

      // buildInstalledMap will now report it as installed
      jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_570.acf'])
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      vdf.parse.mockReturnValue({
        AppState: {
          appid: '570',
          StateFlags: '4',
          installdir: 'dota2',
          SizeOnDisk: '50000'
        }
      })

      await manager.refreshInstallState()

      // Should have pushed updated GameInfo with is_installed: true
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({ app_name: '570', is_installed: true })
      )
    })

    it('refreshInstallState() sets install_path and install_size when game becomes installed', async () => {
      library.set('570', {
        runner: 'steam',
        app_name: '570',
        title: 'Dota 2',
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
      ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_570.acf'])
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      vdf.parse.mockReturnValue({
        AppState: {
          appid: '570',
          StateFlags: '4',
          installdir: 'dota2',
          SizeOnDisk: '50000'
        }
      })

      await manager.refreshInstallState()

      const updatedGame = library.get('570')!
      expect(updatedGame.is_installed).toBe(true)
      expect(updatedGame.install).toEqual(
        expect.objectContaining({
          install_path: join('/steam', 'steamapps', 'common', 'dota2'),
          // install_size is persisted as a getFileSize-formatted string
          // (mocked here as `${String(bytes)} B`) — matches legendary/gog/nile contract.
          install_size: '50000 B'
          // platform is host-derived (GAP 2 fix — no longer hardcoded 'Windows');
          // not asserted here since this test covers install_path/size detection.
        })
      )
    })

    it('refreshInstallState() pushes update when is_installed changes true→false', async () => {
      // Seed library with a game that IS installed
      library.set('570', {
        runner: 'steam',
        app_name: '570',
        title: 'Dota 2',
        is_installed: true,
        install: {
          install_path: '/steam/steamapps/common/dota2',
          install_size: '50000',
          platform: 'Windows'
        },
        art_cover: '',
        art_square: '',
        extra: { reqs: [] },
        canRunOffline: true,
        installable: true
      } as any)

      // buildInstalledMap returns empty — game is no longer installed
      jest.mocked(getSteamLibraries).mockResolvedValue([])

      await manager.refreshInstallState()

      // Should push with is_installed: false and empty install object
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({ app_name: '570', is_installed: false })
      )
      const updatedGame = library.get('570')!
      expect(updatedGame.install).toEqual({})
    })

    it('refreshInstallState() does NOT call sendFrontendMessage when install state did not change', async () => {
      // Game is NOT installed and buildInstalledMap returns empty — no change
      library.set('570', {
        runner: 'steam',
        app_name: '570',
        title: 'Dota 2',
        is_installed: false,
        install: {},
        art_cover: '',
        art_square: '',
        extra: { reqs: [] },
        canRunOffline: true,
        installable: true
      } as any)

      // buildInstalledMap returns empty — still not installed
      jest.mocked(getSteamLibraries).mockResolvedValue([])

      await manager.refreshInstallState()

      // No change → no push to avoid flooding frontend
      expect(sendFrontendMessage).not.toHaveBeenCalled()
    })

    it("D-UAT-13: a game holding for a Steam restart is NOT flipped to installed by the window-focus reconcile (it would show Play, and Play opens Steam's install dialog) — it is once the hold ends", async () => {
      library.set('570', {
        runner: 'steam',
        app_name: '570',
        title: 'Dota 2',
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
      ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_570.acf'])
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      vdf.parse.mockReturnValue({
        AppState: {
          appid: '570',
          StateFlags: '4',
          installdir: 'dota2',
          SizeOnDisk: '50000'
        }
      })
      jest.mocked(listSteamClientPids).mockResolvedValue([111])
      // GameLib's own finalize just wrote the StateFlags=4 manifest while the
      // Steam client (pid 111) was running: the poller enters the hold.
      startInstallPolling(steamTestDeps, '570', {
        intervalMs: 60000,
        isNativeHandoff: true
      })
      try {
        await pollInstallOnce(steamTestDeps, '570')
        jest.mocked(sendFrontendMessage).mockClear()

        // The user alt-tabs back from Steam: the focus reconcile re-reads the
        // ACF (bit 4 set) but must leave the held game alone.
        await manager.refreshInstallState()
        expect(sendFrontendMessage).not.toHaveBeenCalled()
        expect(library.get('570')?.is_installed).toBe(false)
      } finally {
        stopInstallPolling(steamTestDeps, '570') // hold ends (e.g. released/cap/uninstalled)
      }

      // Control: the identical ACF DOES flip it once nothing is holding it, so
      // the assertion above is not vacuous.
      await manager.refreshInstallState()
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({ app_name: '570', is_installed: true })
      )
    })

    it('installState() is a no-op (install state is ACF-derived, not boolean-driven)', () => {
      // installState must exist and not throw; it should do nothing
      expect(() => manager.installState('570', true)).not.toThrow()
      // No side effects
      expect(sendFrontendMessage).not.toHaveBeenCalled()
    })

    // ── 17-03: bottle-aware reconciliation (MACSTEAM-05, T-17-03 gate) ───────

    describe('bottle reconciliation', () => {
      const envMock = jest.requireMock('backend/constants/environment')

      beforeEach(() => {
        envMock.isMac = true
        envMock.isLinux = false
        jest
          .mocked(getSteamBottleSettings)
          .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
        jest
          .mocked(getBottleSteamappsDir)
          .mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
      })

      afterEach(() => {
        envMock.isMac = false
        envMock.isLinux = true
      })

      it('flips a bottle-installed game to installed (platform Windows) via pushGameToLibrary when isBottleProvisioned() is true', async () => {
        jest.mocked(isSteamBottleProvisioned).mockReturnValue(true)
        library.set('570', {
          runner: 'steam',
          app_name: '570',
          title: 'Dota 2',
          is_installed: false,
          install: {},
          art_cover: '',
          art_square: '',
          extra: { reqs: [] },
          canRunOffline: true,
          installable: true
        } as any)

        // Native scan finds nothing; bottle scan finds the manifest.
        jest.mocked(getSteamLibraries).mockResolvedValue([])
        ;(existsSync as jest.Mock).mockReturnValue(true)
        ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_570.acf'])
        ;(readFileSync as jest.Mock).mockReturnValue('content')
        vdf.parse.mockReturnValue({
          AppState: {
            appid: '570',
            StateFlags: '4',
            installdir: 'dota2',
            SizeOnDisk: '50000'
          }
        })

        await manager.refreshInstallState()

        expect(sendFrontendMessage).toHaveBeenCalledWith(
          'pushGameToLibrary',
          expect.objectContaining({
            app_name: '570',
            is_installed: true,
            install: expect.objectContaining({ platform: 'Windows' })
          })
        )
      })

      it('performs NO bottle reconciliation when isBottleProvisioned() returns false', async () => {
        jest.mocked(isSteamBottleProvisioned).mockReturnValue(false)
        library.set('570', {
          runner: 'steam',
          app_name: '570',
          title: 'Dota 2',
          is_installed: false,
          install: {},
          art_cover: '',
          art_square: '',
          extra: { reqs: [] },
          canRunOffline: true,
          installable: true
        } as any)

        // Even though the bottle path mocks WOULD report installed, the gate
        // must prevent buildBottleInstalledMap() (and readdirSync) from ever
        // being consulted.
        jest.mocked(getSteamLibraries).mockResolvedValue([])
        ;(existsSync as jest.Mock).mockReturnValue(true)
        ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_570.acf'])
        ;(readFileSync as jest.Mock).mockReturnValue('content')
        vdf.parse.mockReturnValue({
          AppState: {
            appid: '570',
            StateFlags: '4',
            installdir: 'dota2',
            SizeOnDisk: '50000'
          }
        })

        await manager.refreshInstallState()

        expect(sendFrontendMessage).not.toHaveBeenCalled()
        expect(library.get('570')!.is_installed).toBe(false)
      })

      // ── S1-S2: D-17 (34.13-14) install-state non-regression pin ──────────

      it('S1: a forced game reconciles as installed from the BOTTLE map (platform Windows)', async () => {
        jest.mocked(isSteamBottleProvisioned).mockReturnValue(true)
        ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
          platformsCaptured: true,
          is_mac_native: true,
          is_windows_native: true,
          forcedWindowsViaBottle: true
        })
        library.set('570', {
          runner: 'steam',
          app_name: '570',
          title: 'Dota 2',
          is_installed: false,
          install: {},
          art_cover: '',
          art_square: '',
          extra: { reqs: [] },
          canRunOffline: true,
          installable: true
        } as any)

        jest.mocked(getSteamLibraries).mockResolvedValue([])
        ;(existsSync as jest.Mock).mockReturnValue(true)
        ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_570.acf'])
        ;(readFileSync as jest.Mock).mockReturnValue('content')
        vdf.parse.mockReturnValue({
          AppState: {
            appid: '570',
            StateFlags: '4',
            installdir: 'dota2',
            SizeOnDisk: '50000'
          }
        })

        await manager.refreshInstallState()

        expect(sendFrontendMessage).toHaveBeenCalledWith(
          'pushGameToLibrary',
          expect.objectContaining({
            app_name: '570',
            is_installed: true,
            install: expect.objectContaining({ platform: 'Windows' })
          })
        )
      })

      it('S2: the Phase 24 bridge never becomes authoritative for a forced game, even when allowlisted', async () => {
        jest.mocked(isSteamBottleProvisioned).mockReturnValue(true)
        jest.mocked(bridgeAllowlist.has).mockReturnValue(true)
        ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
          platformsCaptured: true,
          is_mac_native: true,
          is_windows_native: true,
          forcedWindowsViaBottle: true
        })
        library.set('570', {
          runner: 'steam',
          app_name: '570',
          title: 'Dota 2',
          is_installed: false,
          install: {},
          art_cover: '',
          art_square: '',
          extra: { reqs: [] },
          canRunOffline: true,
          installable: true
        } as any)

        // listReadyBridgeBottleNames() stays [] (default) — the bridge scan is
        // never even attempted, matching an EMPTY bridge map. The persisted
        // forced verdict deliberately does not flow into library.ts's
        // duplicate predicate (isBridgeAuthoritativeForInstallState), which
        // gates on is_mac_native===false and stays false for this
        // mac-native fixture regardless of the flag or the allowlist —
        // mirrors Task 2's isBridgeEligible() pin.
        jest.mocked(getSteamLibraries).mockResolvedValue([])
        ;(existsSync as jest.Mock).mockReturnValue(true)
        ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_570.acf'])
        ;(readFileSync as jest.Mock).mockReturnValue('content')
        vdf.parse.mockReturnValue({
          AppState: {
            appid: '570',
            StateFlags: '4',
            installdir: 'dota2',
            SizeOnDisk: '50000'
          }
        })

        await manager.refreshInstallState()

        expect(sendFrontendMessage).toHaveBeenCalledWith(
          'pushGameToLibrary',
          expect.objectContaining({
            app_name: '570',
            is_installed: true,
            install: expect.objectContaining({ platform: 'Windows' })
          })
        )
      })
    })

    // ── D-UAT-24-07: refreshInstallState() must ALSO be bridge-aware ─────────
    // The focus/post-launch reconciliation had the identical native+bottle-only
    // blind spot as refresh() — a bridge-installed game's badge got clobbered
    // back to false on focus/post-launch reconciliation too.

    describe('bridge reconciliation (D-UAT-24-07)', () => {
      const envMock = jest.requireMock('backend/constants/environment')

      beforeEach(() => {
        envMock.isMac = true
        envMock.isLinux = false
        jest.mocked(isSteamBottleProvisioned).mockReturnValue(false)
        jest
          .mocked(getBridgeBottleSettings)
          .mockReturnValue({ wineCrossoverBottle: 'GameLibSteamBridge' } as any)
        jest
          .mocked(getBottleSteamappsDir)
          .mockReturnValue(BRIDGE_BOTTLE_STEAMAPPS_ROOT)
      })

      afterEach(() => {
        envMock.isMac = false
        envMock.isLinux = true
      })

      it('does NOT clobber a bridge-installed game back to is_installed:false (flips to installed, platform Windows) when listReadyBridgeBottleNames() is non-empty', async () => {
        jest
          .mocked(listReadyBridgeBottleNames)
          .mockReturnValue(['GameLibSteamBridge'])
        jest
          .mocked(resolveBridgeBottleName)
          .mockReturnValue('GameLibSteamBridge')
        library.set('206040', {
          runner: 'steam',
          app_name: '206040',
          title: 'Avernum 5',
          is_installed: false,
          install: {},
          art_cover: '',
          art_square: '',
          extra: { reqs: [] },
          canRunOffline: true,
          installable: true
        } as any)

        // Native scan finds nothing; bridge scan finds the manifest.
        jest.mocked(getSteamLibraries).mockResolvedValue([])
        ;(existsSync as jest.Mock).mockReturnValue(true)
        ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_206040.acf'])
        ;(readFileSync as jest.Mock).mockReturnValue('content')
        vdf.parse.mockReturnValue({
          AppState: {
            appid: '206040',
            StateFlags: '4',
            installdir: 'Avernum 5',
            SizeOnDisk: '9000'
          }
        })

        await manager.refreshInstallState()

        expect(sendFrontendMessage).toHaveBeenCalledWith(
          'pushGameToLibrary',
          expect.objectContaining({
            app_name: '206040',
            is_installed: true,
            install: expect.objectContaining({ platform: 'Windows' })
          })
        )
      })

      it('performs NO bridge reconciliation when listReadyBridgeBottleNames() returns []', async () => {
        jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])
        library.set('206040', {
          runner: 'steam',
          app_name: '206040',
          title: 'Avernum 5',
          is_installed: false,
          install: {},
          art_cover: '',
          art_square: '',
          extra: { reqs: [] },
          canRunOffline: true,
          installable: true
        } as any)

        // Even though the bridge path mocks WOULD report installed, the gate
        // must prevent buildBridgeInstalledMap() (and readdirSync) from ever
        // being consulted.
        jest.mocked(getSteamLibraries).mockResolvedValue([])
        ;(existsSync as jest.Mock).mockReturnValue(true)
        ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_206040.acf'])
        ;(readFileSync as jest.Mock).mockReturnValue('content')
        vdf.parse.mockReturnValue({
          AppState: {
            appid: '206040',
            StateFlags: '4',
            installdir: 'Avernum 5',
            SizeOnDisk: '9000'
          }
        })

        await manager.refreshInstallState()

        expect(sendFrontendMessage).not.toHaveBeenCalled()
        expect(library.get('206040')!.is_installed).toBe(false)
      })
    })

    // ── Test D (D-UAT-24-02, 24-17): refreshInstallState() applies the SAME
    // bridge-authoritative selection as refresh() — a bridge-eligible game
    // whose in-memory entry is is_installed:true but present only in the
    // Phase 17 bottle/native map (absent from the bridge map) must be
    // reconciled DOWN to is_installed:false (badge correctly clobbered),
    // while a non-eligible native/bottle game is left unflipped.

    describe('bridge-authoritative install-state (D-UAT-24-02)', () => {
      const envMock = jest.requireMock('backend/constants/environment')

      beforeEach(() => {
        envMock.isMac = true
        envMock.isLinux = false
        jest
          .mocked(getSteamBottleSettings)
          .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
        jest.mocked(getBridgeBottleSettings).mockReturnValue({
          wineCrossoverBottle: 'GameLibSteamBridge'
        } as any)
        jest
          .mocked(getBottleSteamappsDir)
          .mockImplementation((_paths: unknown, bottleName: string) =>
            bottleName === 'GameLibSteamBridge'
              ? BRIDGE_BOTTLE_STEAMAPPS_ROOT
              : BOTTLE_STEAMAPPS_ROOT
          )
      })

      afterEach(() => {
        envMock.isMac = false
        envMock.isLinux = true
      })

      it('flips a bridge-eligible game present only in the Phase 17 bottle/native map (absent from bridge) to is_installed:false', async () => {
        jest.mocked(bridgeAllowlist.has).mockReturnValue(true)
        ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
          platformsCaptured: true,
          is_mac_native: false
        })
        jest.mocked(isSteamBottleProvisioned).mockReturnValue(true)
        jest
          .mocked(listReadyBridgeBottleNames)
          .mockReturnValue(['GameLibSteamBridge'])
        library.set('206060', {
          runner: 'steam',
          app_name: '206060',
          title: 'Avernum 6',
          is_installed: true,
          install: {
            install_path: join(BOTTLE_STEAMAPPS_ROOT, 'common', 'Avernum 6'),
            install_size: '123456',
            platform: 'Windows'
          },
          art_cover: '',
          art_square: '',
          extra: { reqs: [] },
          canRunOffline: true,
          installable: true
        } as any)

        // Present ONLY in the Phase 17 bottle map — the bridge root has no
        // manifest for this appId.
        jest.mocked(getSteamLibraries).mockResolvedValue([])
        ;(existsSync as jest.Mock).mockImplementation(
          (path: string) => path === BOTTLE_STEAMAPPS_ROOT
        )
        ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
          dir === BOTTLE_STEAMAPPS_ROOT ? ['appmanifest_206060.acf'] : []
        )
        ;(readFileSync as jest.Mock).mockReturnValue('content')
        vdf.parse.mockReturnValue({
          AppState: {
            appid: '206060',
            StateFlags: '4',
            installdir: 'Avernum 6',
            SizeOnDisk: '123456'
          }
        })

        await manager.refreshInstallState()

        expect(sendFrontendMessage).toHaveBeenCalledWith(
          'pushGameToLibrary',
          expect.objectContaining({ app_name: '206060', is_installed: false })
        )
        expect(library.get('206060')!.is_installed).toBe(false)
      })

      it('does NOT flip a NON-bridge-eligible game present in the native/bottle map (unaffected by the bridge-authoritative gate)', async () => {
        jest.mocked(bridgeAllowlist.has).mockReturnValue(false)
        jest.mocked(isSteamBottleProvisioned).mockReturnValue(true)
        jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])
        library.set('570', {
          runner: 'steam',
          app_name: '570',
          title: 'Dota 2',
          is_installed: true,
          install: {
            install_path: join(BOTTLE_STEAMAPPS_ROOT, 'common', 'dota2'),
            install_size: '50000',
            platform: 'Windows'
          },
          art_cover: '',
          art_square: '',
          extra: { reqs: [] },
          canRunOffline: true,
          installable: true
        } as any)

        jest.mocked(getSteamLibraries).mockResolvedValue([])
        ;(existsSync as jest.Mock).mockImplementation(
          (path: string) => path === BOTTLE_STEAMAPPS_ROOT
        )
        ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
          dir === BOTTLE_STEAMAPPS_ROOT ? ['appmanifest_570.acf'] : []
        )
        ;(readFileSync as jest.Mock).mockReturnValue('content')
        vdf.parse.mockReturnValue({
          AppState: {
            appid: '570',
            StateFlags: '4',
            installdir: 'dota2',
            SizeOnDisk: '50000'
          }
        })

        await manager.refreshInstallState()

        // No change → no push (state stayed installed via the unchanged
        // native ?? bottle ?? bridge precedence).
        expect(sendFrontendMessage).not.toHaveBeenCalled()
        expect(library.get('570')!.is_installed).toBe(true)
      })
    })
  })

  // ── D-07 / steam-startup-resume-crash (2026-07-18), D-04 softened: startup
  // now only DETECTS+SURFACES a leftover interrupted download via
  // scanDownloadingAppIds — it never auto-drives finalize/reconcile/poll
  // unattended anymore (that unattended path was the confirmed crash
  // trigger). The heavy work moved to resumeInterruptedSteamInstall(), only
  // invoked by the user's own Install click (see games.test.ts). ───────────
})
