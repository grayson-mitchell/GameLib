import {
  createTestManagerDeps,
  createInertSteamProcesses,
  createTestStores
} from 'backend/testUtils/testServices'
/**
 * Unit tests for the uninstall poller (pollUninstallOnce, start/stopUninstallPolling).
 * Moved out of library.test.ts by Phase 65 plan 04 (D-03); mock preamble
 * copied.
 */

// ── Imports ───────────────────────────────────────────────────────────────────
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
import * as gamesModule from '../gameSessionState'
import { bridgeAllowlist } from '../bridge/allowlist'
import {
  pollUninstallOnce,
  startUninstallPolling,
  stopUninstallPolling
} from '../library/uninstallPolling'
import type { Stores } from 'backend/services/types'

const { steamMetadataStore } = jest.requireMock<Stores['steam']>('../stores')
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

// ── D-07: pollUninstallOnce() ────────────────────────────────────────────────

describe('pollUninstallOnce()', () => {
  // D-17 (34.13-14) reversibility — `./games` is NOT mocked in this file
  // (SteamGame/isNativeInstallInFlight are exercised for real elsewhere), so
  // spy on ONLY the named export rather than a full jest.mock factory. The
  // exact same pattern games.test.ts already uses for
  // `jest.spyOn(libraryModule, 'startInstallPolling')`.
  let clearForcedSpy: jest.SpyInstance

  beforeEach(() => {
    jest.useFakeTimers()
    library.clear()
    library.set('730', {
      runner: 'steam',
      app_name: '730',
      title: 'CS:GO',
      is_installed: true,
      install: {
        install_path: '/steam/steamapps/common/csgo',
        platform: 'Windows'
      },
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    // R1/R3/R4 poll with source:'bottle' — readAcfState('bottle') resolves
    // its root via getBottleSteamappsDir(getSteamBottleSettings()...).
    jest
      .mocked(getSteamBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
    jest.mocked(getBottleSteamappsDir).mockReturnValue('/bottle/steamapps')
    clearForcedSpy = jest
      .spyOn(gamesModule, 'clearForcedWindowsViaBottle')
      .mockImplementation(() => {})
  })

  afterEach(() => {
    stopUninstallPolling(steamTestDeps, '730')
    jest.useRealTimers()
    clearForcedSpy.mockRestore()
  })

  it('flips the badge to not-installed + sends done when the manifest is absent (uninstall complete)', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false) // manifest gone
    startUninstallPolling(steamTestDeps, '730', 60000) // register entry so stop has something to clear
    await pollUninstallOnce(steamTestDeps, '730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: '730', is_installed: false })
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

  it('sends gameStatusUpdate { status:"uninstalling" } while StateFlags bit 0x800 is set', async () => {
    // 4 (installed) | 2048 (uninstalling) = 2052
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2052',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startUninstallPolling(steamTestDeps, '730', 60000)
    await pollUninstallOnce(steamTestDeps, '730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        status: 'uninstalling'
      })
    )
  })

  // 34.13 review A-10, the load-bearing half of the argument in games.ts:
  // a 'downloading' manifest (StateFlags bit 4 UNSET — 1026 is the
  // partial/handoff shape) ALSO takes pollUninstallOnce's `uninstalling`
  // branch. That status is only ever cleared by a later tick of an ACTIVE
  // poll, so any caller that reaches this branch WITHOUT registering a poll
  // strands the tile on "Uninstalling" for the rest of the session. This spec
  // pins the emission so uninstallBottleGameDirectly()'s refusal to call
  // pollUninstallOnce for a mid-download manifest stays justified rather than
  // becoming folklore.
  it('A-10: sends gameStatusUpdate { status:"uninstalling" } for a DOWNLOADING manifest too, not only the 0x800 bit', async () => {
    // 1026 = 1024 (update started) | 2 (update required) — bit 4 (installed)
    // is NOT set, which is what readAcfState maps to state 'downloading'.
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '1026',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startUninstallPolling(steamTestDeps, '730', 60000)
    await pollUninstallOnce(steamTestDeps, '730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        status: 'uninstalling'
      })
    )
  })

  it('does NOT flip the badge while the game is still fully installed (no uninstalling bit)', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startUninstallPolling(steamTestDeps, '730', 60000)
    await pollUninstallOnce(steamTestDeps, '730')
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.anything()
    )
  })

  // ── GAME-03: poller fires confirmed uninstall toast (RED gate) ─────────────

  it('GAME-03: fires notify with Game Uninstalled on the "absent" branch (confirmed ACF removal)', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false) // manifest gone = uninstall complete
    startUninstallPolling(steamTestDeps, '730', 60000) // register entry so stop has something to clear
    await pollUninstallOnce(steamTestDeps, '730')
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith({
      title: 'CS:GO',
      body: 'Game Uninstalled'
    })
  })

  it('GAME-03: does NOT fire notify while the manifest is still present (interim uninstalling tick)', async () => {
    // 4 (installed) | 2048 (uninstalling) = 2052
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2052',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startUninstallPolling(steamTestDeps, '730', 60000)
    await pollUninstallOnce(steamTestDeps, '730')
    expect(notify).not.toHaveBeenCalled()
  })

  // ── R1-R4: D-17 (34.13-14) reversibility ──────────────────────────────────

  it('R1: bottle uninstall confirmed-absent clears the forced verdict', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false) // manifest gone
    startUninstallPolling(steamTestDeps, '730', 60000)
    await pollUninstallOnce(steamTestDeps, '730', 'bottle')
    expect(clearForcedSpy).toHaveBeenCalledWith(steamTestDeps, '730')
  })

  it('R1b: quick 261107-lum — a confirmed-absent BRIDGE uninstall clears the forced verdict', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false) // manifest gone
    jest
      .mocked(getBridgeBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteamBridge-730' } as any)
    startUninstallPolling(steamTestDeps, '730', 60000)
    await pollUninstallOnce(steamTestDeps, '730', 'bridge')
    expect(clearForcedSpy).toHaveBeenCalledWith(steamTestDeps, '730')
  })

  it('R2: a NATIVE uninstall confirmed-absent does NOT clear the forced verdict', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false) // manifest gone
    startUninstallPolling(steamTestDeps, '730', 60000)
    await pollUninstallOnce(steamTestDeps, '730') // default source: 'native'
    expect(clearForcedSpy).not.toHaveBeenCalled()
  })

  it('R3: a cancelled bottle uninstall (manifest still present) does NOT clear the forced verdict', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startUninstallPolling(steamTestDeps, '730', 60000)
    await pollUninstallOnce(steamTestDeps, '730', 'bottle')
    expect(clearForcedSpy).not.toHaveBeenCalled()
  })

  it('R4: the clear survives a library-Map MISS (fails if placed inside the `if (existing)` guard)', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false) // manifest gone
    library.clear() // library.get('730') is now undefined — the Map MISS
    await pollUninstallOnce(steamTestDeps, '730', 'bottle')
    expect(clearForcedSpy).toHaveBeenCalledWith(steamTestDeps, '730')
  })

  // ── debug/steam-bottle-uninstall-reverts (OPERATOR PRODUCT DECISION,
  // LOCKED, item 4/5): a dual-installed title losing only the just-removed
  // copy is CORRECT, expected behaviour — the badge must never be forced to
  // flip, install_path must correctly re-resolve to the surviving copy
  // (verified here, not assumed), and the success signal must not lie: no
  // "Game Uninstalled" toast fires while a represented install remains.

  describe('dual-install partial removal (item 4/5)', () => {
    beforeEach(() => {
      jest
        .mocked(getFileSize)
        .mockImplementation((bytes: unknown) => `${String(bytes)} B`)
    })

    it('bottle copy removed, NATIVE copy survives: badge STAYS installed, install_path re-resolves to the native copy, no "Game Uninstalled" toast', async () => {
      // Bottle manifest absent (the copy just removed); native manifest still
      // fully installed — differentiate existsSync by the EXACT bottle
      // manifest path so the native scan (a DIFFERENT root, /steam/steamapps)
      // is unaffected.
      ;(existsSync as jest.Mock).mockImplementation(
        (path: string) => path !== '/bottle/steamapps/appmanifest_730.acf'
      )
      ;(readFileSync as jest.Mock).mockReturnValue('native manifest content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        AppState: {
          appid: '730',
          StateFlags: '4',
          installdir: 'CS2Native',
          SizeOnDisk: '99999'
        }
      })

      startUninstallPolling(steamTestDeps, '730', 60000)
      await pollUninstallOnce(steamTestDeps, '730', 'bottle')

      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({
          app_name: '730',
          is_installed: true,
          install: expect.objectContaining({
            install_path: '/steam/steamapps/common/CS2Native'
          })
        })
      )
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'gameStatusUpdate',
        expect.objectContaining({
          appName: '730',
          runner: 'steam',
          status: 'done'
        })
      )
      // The badge is never forced to not-installed while a copy survives.
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({ is_installed: false })
      )
      // The success signal must not lie: no "uninstalled" toast while the
      // title is legitimately still installed via the surviving copy.
      // ...but say what happened, so the click doesn't read as a failed
      // uninstall (live 2026-10-27, XCOM 200510).
      expect(notify).toHaveBeenCalledTimes(1)
      expect(notify).not.toHaveBeenCalledWith(
        expect.objectContaining({ body: 'Game Uninstalled' })
      )
      expect(i18nextT).toHaveBeenCalledWith(
        'gamelib:steam.uninstall.copySurvives',
        expect.any(String),
        { removed: 'Windows Steam (CrossOver)', survivor: 'Mac Steam' }
      )
    })

    it('native copy removed, BOTTLE copy survives: badge STAYS installed, install_path re-resolves to the bottle copy (platform Windows), no "Game Uninstalled" toast', async () => {
      // Native manifest absent (the copy just removed) on EVERY registered
      // native library root; bottle manifest still fully installed.
      ;(existsSync as jest.Mock).mockImplementation(
        (path: string) => path !== '/steam/steamapps/appmanifest_730.acf'
      )
      ;(readFileSync as jest.Mock).mockReturnValue('bottle manifest content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        AppState: {
          appid: '730',
          StateFlags: '4',
          installdir: 'CS2Bottle',
          SizeOnDisk: '55555'
        }
      })

      startUninstallPolling(steamTestDeps, '730', 60000)
      await pollUninstallOnce(steamTestDeps, '730') // default source: 'native'

      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({
          app_name: '730',
          is_installed: true,
          install: expect.objectContaining({
            install_path: '/bottle/steamapps/common/CS2Bottle',
            platform: 'Windows'
          })
        })
      )
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'gameStatusUpdate',
        expect.objectContaining({
          appName: '730',
          runner: 'steam',
          status: 'done'
        })
      )
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({ is_installed: false })
      )
      // ...but say what happened, so the click doesn't read as a failed
      // uninstall (live 2026-10-27, XCOM 200510).
      expect(notify).toHaveBeenCalledTimes(1)
      expect(notify).not.toHaveBeenCalledWith(
        expect.objectContaining({ body: 'Game Uninstalled' })
      )
      expect(i18nextT).toHaveBeenCalledWith(
        'gamelib:steam.uninstall.copySurvives',
        expect.any(String),
        { removed: 'Mac Steam', survivor: 'Windows Steam (CrossOver)' }
      )
    })

    it('native copy removed, only a BRIDGE copy survives: badge STAYS installed, install_path re-resolves to the bridge copy, no "Game Uninstalled" toast', async () => {
      // RED against the previous PAIRWISE check, which probed only the single
      // "other" root ('native' -> 'bottle') and never the bridge bottle. With
      // native and bottle both absent it declared a complete uninstall and
      // fired the toast while the bridge copy survived.
      //
      // Live case this reproduces (2026-08-15): HOARD (63000) was installed
      // on all THREE roots at once; removing the native copy reported a full
      // uninstall while 277M remained in GameLibSteamBridge.
      jest
        .mocked(getBridgeBottleSettings)
        .mockReturnValue({ wineCrossoverBottle: 'GameLibSteamBridge' } as any)
      // Distinguish by bottle name so the Phase 17 bottle and the bridge
      // bottle resolve to DIFFERENT roots — otherwise "survives only in the
      // bridge" is indistinguishable from "survives in the bottle".
      jest
        .mocked(getBottleSteamappsDir)
        .mockImplementation((_paths: unknown, bottleName: string) =>
          bottleName === 'GameLibSteamBridge'
            ? '/bridge/steamapps'
            : '/bottle/steamapps'
        )
      // Present ONLY in the bridge root — absent natively and in the Phase 17
      // bottle, so a pairwise check finds no survivor and a three-root one does.
      ;(existsSync as jest.Mock).mockImplementation((path: string) =>
        path.startsWith('/bridge/')
      )
      ;(readFileSync as jest.Mock).mockReturnValue('bridge manifest content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        AppState: {
          appid: '730',
          StateFlags: '4',
          installdir: 'CS2Bridge',
          SizeOnDisk: '77777'
        }
      })

      startUninstallPolling(steamTestDeps, '730', 60000)
      await pollUninstallOnce(steamTestDeps, '730') // default source: 'native'

      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({
          app_name: '730',
          is_installed: true,
          install: expect.objectContaining({
            install_path: '/bridge/steamapps/common/CS2Bridge',
            platform: 'Windows'
          })
        })
      )
      // The badge is never forced to not-installed while a bridge copy survives.
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({ is_installed: false })
      )
      // The success signal must not lie — this is the assertion the old
      // pairwise check failed.
      // ...but say what happened, so the click doesn't read as a failed
      // uninstall (live 2026-10-27, XCOM 200510).
      expect(notify).toHaveBeenCalledTimes(1)
      expect(notify).not.toHaveBeenCalledWith(
        expect.objectContaining({ body: 'Game Uninstalled' })
      )
      expect(i18nextT).toHaveBeenCalledWith(
        'gamelib:steam.uninstall.copySurvives',
        expect.any(String),
        { removed: 'Mac Steam', survivor: 'Steam bridge' }
      )
    })

    // Live 2026-10-27, Grim Dawn 219990: the bridge uninstall path now
    // finishes through pollUninstallOnce(appId, 'bridge').
    describe('bridge copy removed (bridge uninstall path)', () => {
      const envMock = jest.requireMock('backend/constants/environment')

      beforeEach(() => {
        jest
          .mocked(getBridgeBottleSettings)
          .mockReturnValue({ wineCrossoverBottle: 'GameLibSteamBridge' } as any)
        jest
          .mocked(getBottleSteamappsDir)
          .mockImplementation((_paths: unknown, bottleName: string) =>
            bottleName === 'GameLibSteamBridge'
              ? '/bridge/steamapps'
              : '/bottle/steamapps'
          )
        // Bridge root gone (the whole per-game bottle was removed); the
        // native copy is still there.
        ;(existsSync as jest.Mock).mockImplementation(
          (path: string) =>
            !path.startsWith('/bridge/') && !path.startsWith('/bottle/')
        )
        ;(readFileSync as jest.Mock).mockReturnValue('native manifest content')
        ;(vdf.parse as jest.Mock).mockReturnValue({
          AppState: {
            appid: '730',
            StateFlags: '4',
            installdir: 'CS2Native',
            SizeOnDisk: '99999'
          }
        })
      })

      afterEach(() => {
        envMock.isMac = false
        envMock.isLinux = true
      })

      it('a NATIVE copy survives: badge stays installed on the native copy and the notice names both copies', async () => {
        await pollUninstallOnce(steamTestDeps, '730', 'bridge')

        expect(sendFrontendMessage).toHaveBeenCalledWith(
          'pushGameToLibrary',
          expect.objectContaining({
            app_name: '730',
            is_installed: true,
            install: expect.objectContaining({
              install_path: '/steam/steamapps/common/CS2Native'
            })
          })
        )
        expect(notify).toHaveBeenCalledTimes(1)
        expect(i18nextT).toHaveBeenCalledWith(
          'gamelib:steam.uninstall.copySurvives',
          expect.any(String),
          { removed: 'Steam bridge', survivor: 'Mac Steam' }
        )
      })

      it('bridge-AUTHORITATIVE title: a native copy is not a survivor — full uninstall, "Game Uninstalled", no surviving-copy notice', async () => {
        // Same composition refresh() uses: only a bridge copy satisfies
        // is_installed here, so claiming the native copy "is still installed"
        // would be undone by the next refresh.
        envMock.isMac = true
        envMock.isLinux = false
        // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock handle, never invoked unbound
        jest.mocked(bridgeAllowlist.has).mockReturnValue(true)
        ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
          platformsCaptured: true,
          is_mac_native: false
        })

        await pollUninstallOnce(steamTestDeps, '730', 'bridge')

        expect(sendFrontendMessage).toHaveBeenCalledWith(
          'pushGameToLibrary',
          expect.objectContaining({ app_name: '730', is_installed: false })
        )
        expect(notify).toHaveBeenCalledWith({
          title: 'CS:GO',
          body: 'Game Uninstalled'
        })
        expect(i18nextT).not.toHaveBeenCalledWith(
          'gamelib:steam.uninstall.copySurvives',
          expect.anything(),
          expect.anything()
        )
      })
    })

    it('NEITHER root has a surviving copy: falls through to the original full-uninstall behaviour (badge flips false, "Game Uninstalled" toast fires) — regression guard', async () => {
      ;(existsSync as jest.Mock).mockReturnValue(false) // manifest gone everywhere
      startUninstallPolling(steamTestDeps, '730', 60000)
      await pollUninstallOnce(steamTestDeps, '730', 'bottle')

      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({ app_name: '730', is_installed: false })
      )
      expect(notify).toHaveBeenCalledWith({
        title: 'CS:GO',
        body: 'Game Uninstalled'
      })
    })
  })
})

// ── D-07: startUninstallPolling / stopUninstallPolling ────────────────────────

describe('startUninstallPolling() idempotency and stopUninstallPolling()', () => {
  const g9oLogger = () =>
    jest.requireMock<{ logWarning: jest.Mock }>('backend/logger')

  beforeEach(() => {
    jest.useFakeTimers()
    library.clear()
    jest.mocked(getSteamLibraries).mockResolvedValue([])
  })

  afterEach(() => {
    stopUninstallPolling(steamTestDeps, '730')
    jest.useRealTimers()
  })

  it('calling startUninstallPolling twice for the same appId creates only one setInterval', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval')
    startUninstallPolling(steamTestDeps, '730', 3000)
    startUninstallPolling(steamTestDeps, '730', 3000) // idempotent — second call is a no-op
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    setIntervalSpy.mockRestore()
  })

  it('stopUninstallPolling clears the entry so a new interval can register', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval')
    startUninstallPolling(steamTestDeps, '730', 3000)
    stopUninstallPolling(steamTestDeps, '730')
    startUninstallPolling(steamTestDeps, '730', 3000) // new registration — entry was cleared by stop
    expect(setIntervalSpy).toHaveBeenCalledTimes(2)
    setIntervalSpy.mockRestore()
  })

  // debug/wazhack-uninstall-reverts: the manifest stays 'installed' the whole
  // time (Steam's confirm dialog was never answered — never surfaced, or
  // dismissed) so `seenUninstalling` is never set. Before this fix the grace-
  // window timeout sent a bare gameStatusUpdate{done} with NO notify() call,
  // making a silently-abandoned uninstall indistinguishable from "nothing
  // happened at all" — the exact reported symptom. Now it must also fire a
  // distinct, honest toast.
  it('notifies the user (and does not flip the badge) when the no-activity window expires with the manifest still installed', async () => {
    library.set('730', {
      runner: 'steam',
      app_name: '730',
      title: 'CS:GO',
      is_installed: true,
      install: {
        install_path: '/steam/steamapps/common/csgo',
        platform: 'Windows'
      },
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4', // fully installed — Steam never started the uninstall
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    jest.mocked(sendFrontendMessage).mockClear()
    ;(notify as jest.Mock).mockClear()

    const interval = 10
    startUninstallPolling(steamTestDeps, '730', interval)
    g9oLogger().logWarning.mockClear()
    // The old 60 s grace is gone: nothing at tick 21 or 39.
    const requestNotices = () =>
      sendFrontendMessage.mock.calls.filter(([c]) => c === 'steamRequestNotice')
    await jest.advanceTimersByTimeAsync(interval * 21)
    expect(requestNotices()).toHaveLength(0)
    await jest.advanceTimersByTimeAsync(interval * 18)
    expect(requestNotices()).toHaveLength(0)
    // STEAM_REQUEST_NO_ACTIVITY_TICKS (40) + 1 ticks so the branch fires
    await jest.advanceTimersByTimeAsync(interval * 2)

    // PVK-2: in-app notice, no notify()
    expect(notify).not.toHaveBeenCalled()
    expect(requestNotices()).toEqual([
      [
        'steamRequestNotice',
        {
          appId: '730',
          title: 'CS:GO',
          kind: 'uninstall-not-started',
          seq: expect.any(Number)
        }
      ]
    ])
    expect(
      g9oLogger().logWarning.mock.calls.some(
        ([m]: [unknown]) =>
          String(m).includes('730') &&
          String(m).includes('uninstall') &&
          String(m).includes('~2 min')
      )
    ).toBe(true)
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        status: 'done'
      })
    )
    // Badge must never flip on a mere timeout — only a confirmed-absent
    // manifest may do that (D-02).
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ is_installed: false })
    )
  })

  it('VFQ-5: an actively uninstalling manifest (StateFlags 2052) disarms the no-activity window', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2052',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    jest.mocked(sendFrontendMessage).mockClear()
    ;(notify as jest.Mock).mockClear()

    const interval = 10
    startUninstallPolling(steamTestDeps, '730', interval)
    await jest.advanceTimersByTimeAsync(interval * 60)
    expect(notify).not.toHaveBeenCalled()
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({ status: 'done' })
    )
    const callsBefore = (existsSync as jest.Mock).mock.calls.length
    await jest.advanceTimersByTimeAsync(interval * 3)
    expect((existsSync as jest.Mock).mock.calls.length).toBeGreaterThan(
      callsBefore
    )
  })

  it('VFQ-6: a manifest that goes absent completes the uninstall and never fires the no-activity notice', async () => {
    library.set('730', {
      runner: 'steam',
      app_name: '730',
      title: 'CS:GO',
      is_installed: true,
      install: {
        install_path: '/steam/steamapps/common/csgo',
        platform: 'Windows'
      },
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    jest.mocked(sendFrontendMessage).mockClear()
    ;(notify as jest.Mock).mockClear()

    const interval = 10
    startUninstallPolling(steamTestDeps, '730', interval)
    await jest.advanceTimersByTimeAsync(interval * 5)
    ;(existsSync as jest.Mock).mockReturnValue(false)
    await jest.advanceTimersByTimeAsync(interval * 3)

    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ is_installed: false })
    )
    expect(notify).toHaveBeenCalledWith({
      title: 'CS:GO',
      body: 'Game Uninstalled'
    })
    expect(notify).toHaveBeenCalledTimes(1)
  })
})
