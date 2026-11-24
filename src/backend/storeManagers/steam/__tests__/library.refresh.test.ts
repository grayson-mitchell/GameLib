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
import { createTestHostServices } from 'backend/testUtils/testHostServices'
import { createTestAppRuntime } from 'backend/testUtils/testAppRuntime'
import { createTestSteamInstallRuntime } from 'backend/testUtils/testSteamInstallRuntime'
import { buildIncompleteInstallSet } from '../library/installedMap'
import { refreshInstallState } from '../library/refresh'
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
import type { Stores } from 'backend/services/types'

import { createTestAnonymousClient } from 'backend/testUtils/testAnonymousClient'
import { logWarning } from 'backend/logger'
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
// 66.3-15: the bottle helpers are read through the deps slice, so they are plain mocks here.
const getSteamBottleSettings = jest.fn()
const isSteamBottleProvisioned = jest.fn()
const statusTransport = {
  ...createTestHostServices({
    rustInvoke: (channel) =>
      Promise.resolve(
        channel === 'steampoll_status'
          ? { installs: [], uninstalls: [] }
          : undefined
      )
  }),
  appRuntime: createTestAppRuntime()
}
const steamTestDeps = createTestManagerDeps({
  steamInstallRuntime: createTestSteamInstallRuntime(statusTransport),
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

jest.mock('backend/launchrust/knownFixes', () => ({
  reportDetectedFix: jest.fn()
}))

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

// ── platformCapture mock — only the queue factory survives (79-41) ─────────
jest.mock('../bridge/launchTarget', () => ({
  backfillBridgeLaunchTargets: jest.fn()
}))
jest.mock('../platformCapture', () => ({
  createPlatformCaptureQueue: () => ({})
}))
// D-UAT-13: the install poller asks which Steam client PIDs are alive when a
// native handoff finalizes. A bare jest.fn() resolves undefined = "inconclusive"
// = fail open (no hold), so every pre-existing test keeps its old behaviour;
// the D-UAT-13 describe below drives it explicitly. Never a real child spawn.
// quick 261029-sex: bare jest.fn = undefined = no live signal = ACF behaviour.
jest.mock('../steamClientProcess', () => ({
  listSteamClientPids: jest.fn()
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
    jest.mocked(steamUser.acquireOpenAuthenticated).mockResolvedValue(null)
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
  })

  // ── LIB-02: install state via ACF StateFlags (Task 1 — green) ─────────────
  // ── LIB-01: refresh() and owned app fetch ─────────────────────────────────

  // ── LIB-03: playtime mapping ───────────────────────────────────────────────

  // ── Phase 17 D-08 reconciliation (Plan 09): steamPlatformsCaptured ─────────

  // ── D-17: is_windows_native hydration ──────────────────────────────────────

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

  // ── CR-01 gap closure (18-05): mac_arch survives refresh() resync ─────────

  // ── Cache fallback ────────────────────────────────────────────────────────

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

      it('a logon-rejected exit also seeds the map', async () => {
        seedCache()
        refuse('logon-rejected')
        await manager.refresh()
        expect(library.size).toBe(2)
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

    it('a granted Refresh acquires a user-refresh lease', async () => {
      const fakeClient = makeFakeClient([])
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)

      await manager.refresh()

      expect(steamUser.acquireAuthenticated).toHaveBeenCalledTimes(1)
      expect(steamUser.acquireAuthenticated).toHaveBeenCalledWith({
        reason: 'user-refresh'
      })
      expect(leaseRelease).toHaveBeenCalledTimes(1)
    })

    describe('store-exit grant acquires a plain user-refresh lease (quick 261114-aqa)', () => {
      it('a successful store-exit refresh syncs', async () => {
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

      it.each(['redeem-steam-key'])(
        'explicit origin %s acquires a user-refresh lease',
        async (origin) => {
          resetSteamAuthTrigger()
          noteRefreshTrigger('steam', origin)
          jest
            .mocked(steamUser.getClient)
            .mockReturnValue(makeFakeClient([]) as any)

          await manager.refresh()

          expect(steamUser.acquireAuthenticated).toHaveBeenCalledWith({
            reason: 'user-refresh'
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
        reason: 'login'
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

    it('Phase 54: an ungranted refresh never backfills', async () => {
      armBridgeInstalled()
      jest.mocked(steamUser.acquireAuthenticated).mockResolvedValue({
        ok: false,
        reason: 'logon-rejected'
      } as never)

      await manager.refresh()

      expect(backfillBridgeLaunchTargets).not.toHaveBeenCalled()
    })

    it('Phase 54: with no ready bridge bottle the backfill is not called', async () => {
      jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])
      const fakeClient = makeFakeClient([makeOwnedApp(206040, 'Avernum 5', 15)])
      jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as any)

      await manager.refresh()

      expect(backfillBridgeLaunchTargets).not.toHaveBeenCalled()
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

    it('buildIncompleteInstallSet returns only the bit-4-unset appId (shares the isFullyInstalledStateFlags predicate)', async () => {
      const set = await buildIncompleteInstallSet(libDeps)

      expect(set.has(570)).toBe(true) // 1026 → incomplete
      expect(set.has(440)).toBe(false) // 4 → fully installed, excluded
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

    it('C-WR-07 makes one status read per reconcile and survives a later status failure', async () => {
      const envMock = jest.requireMock('backend/constants/environment')
      envMock.isMac = true
      try {
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
        // The first status read answers; any later one rejects (a shell restart mid-reconcile).
        let statusReads = 0
        const deps = {
          ...steamTestDeps,
          requestRustInvoke: (
            ...args: Parameters<typeof steamTestDeps.requestRustInvoke>
          ) => {
            if (args[0] === 'steampoll_status') {
              statusReads += 1
              if (statusReads > 1) {
                return Promise.reject(new Error('rustInvoke timeout'))
              }
            }
            return steamTestDeps.requestRustInvoke(...args)
          }
        }

        await expect(refreshInstallState(deps)).resolves.toBeUndefined()

        expect(statusReads).toBe(1)
        expect(sendFrontendMessage).toHaveBeenCalledWith(
          'pushGameToLibrary',
          expect.objectContaining({ app_name: '570', is_installed: true })
        )
      } finally {
        envMock.isMac = false
      }
    })

    describe('install.version from the ACF buildid (quick 261114-rc8)', () => {
      const seedInstalled = (
        version?: string,
        installPath = join('/steam', 'steamapps', 'common', 'dota2')
      ) =>
        library.set('570', {
          runner: 'steam',
          app_name: '570',
          title: 'Dota 2',
          is_installed: true,
          install: {
            install_path: installPath,
            install_size: '50000 B',
            platform: 'Mac',
            ...(version ? { version } : {})
          },
          art_cover: '',
          art_square: '',
          extra: { reqs: [] },
          canRunOffline: true,
          installable: true
        } as any)
      const mockAcf = (buildid?: string) => {
        jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
        ;(existsSync as jest.Mock).mockReturnValue(true)
        ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_570.acf'])
        ;(readFileSync as jest.Mock).mockReturnValue('content')
        vdf.parse.mockReturnValue({
          AppState: {
            appid: '570',
            StateFlags: '4',
            installdir: 'dota2',
            SizeOnDisk: '50000',
            ...(buildid ? { buildid } : {})
          }
        })
      }

      it('sets install.version on a false→true flip', async () => {
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
        mockAcf('300')
        await manager.refreshInstallState()
        expect(library.get('570')!.install).toEqual(
          expect.objectContaining({ version: '300' })
        )
      })

      it('persists and pushes a version-only change on an already-installed game', async () => {
        seedInstalled('100')
        mockAcf('200')
        await manager.refreshInstallState()
        expect(library.get('570')!.install).toEqual(
          expect.objectContaining({ version: '200' })
        )
        expect(steamLibraryStore.set).toHaveBeenCalledWith(
          'games',
          expect.anything()
        )
        expect(sendFrontendMessage).toHaveBeenCalledWith(
          'pushGameToLibrary',
          expect.objectContaining({ app_name: '570' })
        )
      })

      it('persists and pushes a path-only change (a moved install, quick 261122-9sl)', async () => {
        seedInstalled('200', join('/old-lib', 'steamapps', 'common', 'dota2'))
        mockAcf('200')
        await manager.refreshInstallState()
        expect(library.get('570')!.install).toEqual(
          expect.objectContaining({
            install_path: join('/steam', 'steamapps', 'common', 'dota2'),
            version: '200'
          })
        )
        expect(steamLibraryStore.set).toHaveBeenCalledWith(
          'games',
          expect.anything()
        )
        expect(sendFrontendMessage).toHaveBeenCalledWith(
          'pushGameToLibrary',
          expect.objectContaining({
            app_name: '570',
            install: expect.objectContaining({
              install_path: join('/steam', 'steamapps', 'common', 'dota2')
            })
          })
        )
      })

      it('does not push when the buildid equals the stored version', async () => {
        seedInstalled('200')
        mockAcf('200')
        await manager.refreshInstallState()
        expect(sendFrontendMessage).not.toHaveBeenCalled()
      })

      it('does not push when there is no buildid and no stored version', async () => {
        seedInstalled()
        mockAcf()
        await manager.refreshInstallState()
        expect(sendFrontendMessage).not.toHaveBeenCalled()
      })
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

    // WR-01 (75 review): a rejected manifest scan must not be diffed as an
    // empty map — that persisted every installed title as not installed.
    it('refreshInstallState() skips the reconcile when the manifest scan rejects', async () => {
      library.set('570', {
        runner: 'steam',
        app_name: '570',
        title: 'Dota 2',
        is_installed: true,
        install: {
          install_path: '/steam/steamapps/common/dota2',
          install_size: '50000',
          platform: 'Mac'
        },
        art_cover: '',
        art_square: '',
        extra: { reqs: [] },
        canRunOffline: true,
        installable: true
      } as any)
      jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
      const rejecting = () => Promise.reject(new Error('rustInvoke timed out'))

      await expect(
        refreshInstallState({
          ...steamTestDeps,
          requestRustInvoke: rejecting
        } as never)
      ).resolves.toBeUndefined()

      expect(library.get('570')?.is_installed).toBe(true)
      expect(library.get('570')?.install).toEqual(
        expect.objectContaining({
          install_path: '/steam/steamapps/common/dota2'
        })
      )
      expect(sendFrontendMessage).not.toHaveBeenCalled()
      expect(steamLibraryStore.set).not.toHaveBeenCalled()
      expect(logWarning).toHaveBeenCalledWith(
        expect.arrayContaining([
          'Steam: install-state scan failed; skipping this reconcile:'
        ]),
        expect.anything()
      )
    })

    it('D-11: the window-focus reconcile flips an ACF-installed game to installed with no hold filter', async () => {
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
      jest.mocked(sendFrontendMessage).mockClear()

      // D-01 badge: the manifest reads fully installed, so the one reconcile shows Installed. A
      // game whose Steam client has not adopted it yet is handled by Play's gate and the page
      // note, not by hiding the badge.
      await manager.refreshInstallState()
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({ app_name: '570', is_installed: true })
      )
      expect(library.get('570')?.is_installed).toBe(true)
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
