/**
 * Unit tests for SteamGame — LIB-04 (lazy metadata), GAME-01 (launch), GAME-04 (no-Wine),
 * and supporting read methods (getSettings, getExtraInfo, isGameAvailable).
 *
 * Mock strategy follows Phase 1 user.test.ts patterns:
 *  - backend/logger uses factory form to prevent transitive fs-extra native crash
 *  - resetMocks: true in jest.config means mock implementations must be
 *    re-established in each test
 *  - ../state is NOT mocked — real library Map + pendingFetches Set used,
 *    cleared in beforeEach
 */
import axios from 'axios'
import { sendFrontendMessage } from '../../../ipc'
import { steamMetadataStore, steamLibraryStore } from '../electronStores'
import SteamGame, {
  parseSteamStorageRequirement,
  getSteamInstallSize,
  parseSteamMacMinOSVersion,
  macArchFromMinOS,
  markBridgeFailedThisSession,
  clearBridgeFailedThisSession,
  __resetBridgeFailedSessionForTests
} from '../games'
import SteamLibraryManager from '../library'
import * as libraryModule from '../library'
import {
  isBottleReady,
  tellBottledSteamToInstall,
  tellBottledSteamToLaunch,
  tellBottledSteamToUninstall,
  getSteamBottleSettings,
  getBottleSteamappsDir,
  isBridgeBottleReady,
  getBridgeBottleSettings,
  provisionBridgeBottle
} from '../bottle'
import { library, pendingFetches } from '../state'
import type { GameInfo, InstallParams } from 'common/types'
import { isSteamNativeInstallEnabled } from '../nativeInstallSetting'
import { downloadSteamDepots } from '../depot'
import { ensureSteamClientReady } from '../clientSetup'
import { resolveSteamInstallTarget } from '../installLocation'
import { STEAM_PICS_TIMEOUT_MS } from '../withTimeout'
import { bridgeAllowlist } from '../bridge/allowlist'
import { placeShimForGame } from '../bridge/shimGenerate'
import { resolveBridgeLaunchExe } from '../bridge/launchTarget'
import { ensureBridgeHelperReady } from '../bridge/helperProcess'
import { runWineCommand } from 'backend/launcher'
import { existsSync } from 'graceful-fs'
import { getSteamLibraries } from 'backend/utils'
// Real (unmocked) fs/path/os — used only by the SharedDepots-scoping
// regression test below, which proves uninstallBottleGameDirectly()'s
// deletion is scoped correctly against a REAL temp directory tree, the
// same "real-disk fixture" pattern library.test.ts's own startup-resume
// reconciliation suite already uses (mkdtempSync + rmSync in
// beforeEach/afterEach). games.ts's own rmSync (node:fs) is never mocked
// anywhere in this file, so this is exercising real filesystem behavior,
// not a mock.
import {
  mkdtempSync,
  rmSync as realRmSync,
  existsSync as realExistsSync,
  writeFileSync,
  mkdirSync
} from 'node:fs'
import { join as realJoin } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createAbortController,
  callAbortController,
  deleteAbortController
} from 'backend/utils/aborthandler/aborthandler'

// ── Logger mock (factory form — prevents transitive fs-extra native crash) ───
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

// ── axios mock — controls store appdetails API responses ─────────────────────
jest.mock('axios')

// ── IPC mock — sendFrontendMessage ───────────────────────────────────────────
jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

// ── Metadata cache store mock — controls steamMetadataStore ──────────────────
jest.mock('../electronStores', () => ({
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
    set: jest.fn()
  },
  steamSyncStore: {
    get: jest.fn(),
    set: jest.fn()
  }
}))

// ── electron mock — shell.openExternal + dialog.showMessageBox (MAC32-03 i386
// recovery confirm, library.ts's promptI386Recovery) ─────────────────────────
jest.mock('electron', () => ({
  shell: {
    openExternal: jest.fn()
  },
  app: {
    getPath: jest.fn().mockReturnValue('/tmp/mock-path'),
    // Plain method (not jest.fn()) so it survives resetMocks -- publicDir in
    // constants/paths.ts resolves it at module-load time (see __mocks__/electron.ts).
    getAppPath: () => '/tmp/mock-path'
  },
  dialog: {
    showMessageBox: jest.fn()
  }
}))

// ── dialog notify mock ────────────────────────────────────────────────────────
jest.mock('backend/dialog/dialog', () => ({
  notify: jest.fn(),
  showDialogBoxModalAuto: jest.fn()
}))

// ── GameConfig mock — ensures getSettings() returns defaults ─────────────────
jest.mock('backend/game_config', () => ({
  GameConfig: {
    get: jest.fn().mockReturnValue({
      config: undefined,
      getSettings: jest.fn().mockResolvedValue({
        autoSyncSaves: false,
        savesPath: '',
        gogSaves: [],
        wineVersion: { name: 'Wine', type: 'wine', bin: '' },
        winePrefix: '',
        wineCrossoverBottle: '',
        autoInstallDxvk: false,
        autoInstallDxvkNvapi: false,
        autoInstallVkd3d: false,
        preferSystemLibs: false,
        enableEsync: false,
        enableFsync: false,
        enableFsrSharpening: false,
        maxSharpening: false,
        enableDXVKFpsLimit: false,
        DXVKFpsCap: '0',
        targetExe: '',
        verboseLogs: false,
        launcherArgs: '',
        enviromentOptions: [],
        wrapperOptions: []
      })
    })
  }
}))

// ── Mocks required when SteamLibraryManager is imported for integration test ──
jest.mock('graceful-fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn()
}))
jest.mock('@node-steam/vdf', () => ({ parse: jest.fn() }))
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn()
}))
jest.mock('../user', () => ({
  SteamUser: { isLoggedIn: jest.fn(), getClient: jest.fn() }
}))
jest.mock('backend/online_monitor', () => ({
  runOnceWhenOnline: jest.fn(),
  isOnline: jest.fn()
}))

// ── backend/constants/environment mock — mutable double, defaults to non-mac ─
// (mirrors library.test.ts's pattern) so pre-existing tests keep their
// pre-Phase-17 behavior (isBottleEligible() short-circuits false) unless a
// test explicitly flips envMock.isMac = true.
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))

// ── bottle.ts mock — Phase 17 bottle-routing surface (isBottleReady,
// tellBottledSteamTo*, getSteamBottleSettings). Fully replaced (not spied) —
// bottle.ts pulls in backend/config's heavy transitive chain and lazily
// imports backend/launcher, neither of which games.test.ts needs to exercise.
jest.mock('../bottle', () => ({
  isBottleReady: jest.fn(),
  tellBottledSteamToInstall: jest.fn(),
  tellBottledSteamToLaunch: jest.fn(),
  tellBottledSteamToUninstall: jest.fn(),
  getSteamBottleSettings: jest.fn(),
  // Phase 21 Plan 11 (D-15/SNI-08): bottle depot-download write target.
  getBottleSteamappsDir: jest.fn(),
  // Phase 24 Plan 08 (R4): dedicated bridge bottle readiness/provisioning
  // surface — installBridgeGame()'s BLOCKER-1 inline provisioning call.
  isBridgeBottleReady: jest.fn(),
  getBridgeBottleSettings: jest.fn(),
  provisionBridgeBottle: jest.fn()
}))

// ── bridge/allowlist.ts mock (24-03) — controls isBridgeEligible()'s
// bridgeAllowlist.has(appId) lookup without pulling in the real bundled
// bridge-allowlist.json/zod validation.
jest.mock('../bridge/allowlist', () => ({
  bridgeAllowlist: { has: jest.fn() }
}))

// ── bridge/shimGenerate.ts mock (24-05) — installBridgeGame()'s post-download
// shim-placement hook.
jest.mock('../bridge/shimGenerate', () => ({
  placeShimForGame: jest.fn()
}))

// ── bridge/launchTarget.ts mock (24-08 Task 1) — resolveBridgeLaunchExe used
// by both installBridgeGame() (Task 2) and launch()'s bridge branch (Task 3).
jest.mock('../bridge/launchTarget', () => ({
  resolveBridgeLaunchExe: jest.fn()
}))

// ── bridge/helperProcess.ts mock (24-06) — ensureBridgeHelperReady() gate
// consumed by launch()'s bridge branch (Task 3).
jest.mock('../bridge/helperProcess', () => ({
  ensureBridgeHelperReady: jest.fn()
}))

// ── backend/launcher.ts mock — runWineCommand, dynamically imported by
// launchBridgeGame() (Task 3), mirrors bottle.test.ts's own mock shape.
jest.mock('backend/launcher', () => ({
  runWineCommand: jest.fn()
}))

// ── nativeInstallSetting.ts mock (Plan 03's D-13 opt-in read seam) — plain
// jest.fn() with no default implementation. resetMocks:true means it returns
// undefined (falsy) unless a test explicitly sets mockReturnValue(true), so
// every pre-existing test (which never touches this) keeps exercising the
// opt-in-OFF / legacy steam://install path with zero changes.
jest.mock('../nativeInstallSetting', () => ({
  isSteamNativeInstallEnabled: jest.fn()
}))

// ── depot.ts mock — only downloadSteamDepots is needed by games.ts; depot.ts
// itself pulls in steam-user's heavy internal manifest parser, which
// games.test.ts has no reason to exercise.
jest.mock('../depot', () => ({
  downloadSteamDepots: jest.fn()
}))

// ── Plan 09/10 seam mocks — clientSetup.ts / installLocation.ts. Plan 07
// wires these as call-order seams; their real (Plan 09/10) implementations
// are out of this plan's scope, so games.test.ts controls their resolved
// values directly.
jest.mock('../clientSetup', () => ({
  ensureSteamClientReady: jest.fn()
}))
jest.mock('../installLocation', () => ({
  resolveSteamInstallTarget: jest.fn()
}))

// ── aborthandler mock — controls the AbortController create/call/delete
// lifecycle for the native depot-download path (D-02).
jest.mock('backend/utils/aborthandler/aborthandler', () => ({
  createAbortController: jest.fn(),
  callAbortController: jest.fn(),
  deleteAbortController: jest.fn()
}))

// ── Test helpers ──────────────────────────────────────────────────────────────

const APP_ID = '570'

/** Fixture API response for appid 570 (Dota 2) */
const fixtureApiResponse = {
  data: {
    [APP_ID]: {
      success: true,
      data: {
        name: 'Dota 2',
        short_description: 'A multiplayer online battle arena game.',
        platforms: { windows: true, mac: true, linux: false },
        genres: [
          { id: '1', description: 'Action' },
          { id: '2', description: 'Strategy' }
        ]
      }
    }
  }
}

// debug/steam-bottle-uninstall-reverts (routing fix): uninstall() now routes
// SOLELY off install.install_path, so any test exercising uninstall() must
// give its library entry an install_path that resolves inside a known root.
// Shared fixtures so per-test setup only needs one line.
/** A registered native Steam library root — resolveInstallRoot() consults
 *  getSteamLibraries() for this. */
const NATIVE_LIBRARY_ROOT = '/mock/native/steam'
/** An install_path resolving inside NATIVE_LIBRARY_ROOT's steamapps/common/. */
const NATIVE_INSTALL_PATH = `${NATIVE_LIBRARY_ROOT}/steamapps/common/Dota 2`

/** Minimal library entry with no artwork (triggers lazy fetch) */
function makeEntry(overrides: Partial<GameInfo> = {}): GameInfo {
  return {
    runner: 'steam',
    app_name: APP_ID,
    title: APP_ID,
    art_cover: '',
    art_square: '',
    is_installed: false,
    install: {},
    extra: { reqs: [] },
    canRunOffline: true,
    installable: true,
    ...overrides
  } as GameInfo
}

/** Flush all pending microtasks and macrotasks */
const flushAsync = () => new Promise<void>((resolve) => setImmediate(resolve))

// ── Describe block ────────────────────────────────────────────────────────────

describe('SteamGame.getGameInfo lazy metadata', () => {
  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
  })

  // ── LIB-04: synchronous return from in-memory library ────────────────────

  it('LIB-04: getGameInfo returns the existing library entry synchronously', () => {
    const entry = makeEntry({
      title: 'Dota 2',
      art_cover: 'https://example.com/art.jpg'
    })
    library.set(APP_ID, entry)
    // A fully-enriched cache entry has platforms already captured (DETAIL-01
    // gap-fix), so getGameInfo must NOT trigger a self-heal re-fetch.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true
    })

    const result = new SteamGame(APP_ID).getGameInfo()

    expect(result).toBe(entry)
    // Synchronous return — axios must NOT have been called yet
    expect(axios.get).not.toHaveBeenCalled()
  })

  // ── DETAIL-01 gap-fix: self-healing platform re-fetch ────────────────────

  it('DETAIL-01 self-heal: getGameInfo re-fetches a cached game (art present) whose platforms were never captured', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    // Pre-Phase-7 cache: art is present (old guard would skip) but platforms
    // were never captured — the self-heal guard must still fire the fetch once.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: undefined
    })
    library.set(APP_ID, makeEntry({ art_cover: 'https://example.com/art.jpg' }))

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    expect(axios.get).toHaveBeenCalledTimes(1)
  })

  it('DETAIL-01 self-heal: getGameInfo does NOT re-fetch a delisted cached game (avoids loop)', async () => {
    // Delisted games return before capturing platforms; gating on !is_delisted
    // prevents a re-fetch loop.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: undefined
    })
    library.set(
      APP_ID,
      makeEntry({ art_cover: 'https://example.com/art.jpg', is_delisted: true })
    )

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    expect(axios.get).not.toHaveBeenCalled()
  })

  // ── LIB-04: lazy metadata fetch via Steam store API ──────────────────────

  it('LIB-04: when art_cover is empty, fetchMetadataIfNeeded calls the Steam store appdetails API', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    expect(axios.get).toHaveBeenCalledTimes(1)
    expect(axios.get).toHaveBeenCalledWith(
      `https://store.steampowered.com/api/appdetails?appids=${APP_ID}`,
      { timeout: 15000 }
    )
  })

  it('LIB-04: after fetch, art_cover/art_square/title/genres/about.description are populated from the API response', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    const updated = library.get(APP_ID)!
    expect(updated.art_cover).toBe(
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${APP_ID}/header.jpg`
    )
    expect(updated.art_square).toBe(
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${APP_ID}/library_600x900.jpg`
    )
    expect(updated.title).toBe('Dota 2')
    expect(updated.extra?.genres).toEqual(['Action', 'Strategy'])
    expect(updated.extra?.about?.description).toBe(
      'A multiplayer online battle arena game.'
    )
  })

  // ── DETAIL-01: native platform capture ───────────────────────────────────

  it('DETAIL-01: appdetails platforms map onto is_mac_native / is_linux_native', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    const updated = library.get(APP_ID)!
    expect(updated.is_mac_native).toBe(true)
    expect(updated.is_linux_native).toBe(false)
  })

  // ── steam-startup-resume-crash (2026-07-18) hardening: the fire-and-forget
  // fetchMetadataIfNeeded() call in getGameInfo() must never produce an
  // unhandled promise rejection, no matter what throws inside it. ──────────

  it('a fetchMetadataIfNeeded() rejection is caught at the call site and never surfaces as an unhandled rejection', async () => {
    const { logWarning } = jest.requireMock('backend/logger')
    const rejectionSpy = jest.fn()
    process.on('unhandledRejection', rejectionSpy)

    const fetchSpy = jest
      .spyOn(SteamGame.prototype as any, 'fetchMetadataIfNeeded')
      .mockRejectedValue(new Error('simulated crash inside fetchMetadataIfNeeded'))

    library.set(APP_ID, makeEntry())
    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()
    // Give any (incorrectly) unhandled rejection a full microtask+macrotask
    // turn to actually surface before asserting it never did.
    await flushAsync()

    expect(rejectionSpy).not.toHaveBeenCalled()
    expect(logWarning).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining(
          `unexpected error in background metadata fetch for appId ${APP_ID}`
        )
      ]),
      'Steam'
    )

    process.off('unhandledRejection', rejectionSpy)
    fetchSpy.mockRestore()
  })

  it('DETAIL-01: native platform flags are persisted to steamMetadataStore', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        is_mac_native: true,
        is_linux_native: false
      })
    )
  })

  // ── D-17: Windows depot-availability capture ──────────────────────────────

  it('D-17: appdetails platforms.windows maps onto GameInfo.is_windows_native', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    expect(library.get(APP_ID)!.is_windows_native).toBe(true)
  })

  it('D-17: is_windows_native is persisted to steamMetadataStore', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ is_windows_native: true })
    )
  })

  it('D-17 false-safe: platforms.windows false yields is_windows_native false on BOTH the GameInfo and the persisted entry', async () => {
    const fixtureWindowsFalse = {
      data: {
        [APP_ID]: {
          ...fixtureApiResponse.data[APP_ID],
          data: {
            ...fixtureApiResponse.data[APP_ID].data,
            platforms: { windows: false, mac: true, linux: false }
          }
        }
      }
    }
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureWindowsFalse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    expect(library.get(APP_ID)!.is_windows_native).toBe(false)
    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ is_windows_native: false })
    )
  })

  it('D-17 false-safe: an appdetails response with no platforms object yields false, never undefined', async () => {
    const fixtureNoPlatforms = {
      data: {
        [APP_ID]: {
          success: true,
          data: {
            name: 'Dota 2',
            short_description: 'A multiplayer online battle arena game.',
            genres: []
          }
        }
      }
    }
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureNoPlatforms)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    expect(library.get(APP_ID)!.is_windows_native).toBe(false)
  })

  // ── MAC32-01: inline mac_arch derivation (direction B) ────────────────────

  function fixtureWithMacRequirements(minimumHtml: string | undefined) {
    return {
      data: {
        [APP_ID]: {
          success: true,
          data: {
            ...fixtureApiResponse.data[APP_ID].data,
            mac_requirements: { minimum: minimumHtml }
          }
        }
      }
    }
  }

  it('MAC32-01: is_mac_native true + min-OS 10.15 persists mac_arch "64" and mac_arch_source "minos", preserving art_cover/art_square/extra', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(
      fixtureWithMacRequirements(
        '<li><strong>OS:</strong> macOS 10.15 or newer<br></li>'
      )
    )
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        mac_arch: '64',
        mac_arch_source: 'minos',
        art_cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${APP_ID}/header.jpg`,
        art_square: `https://cdn.cloudflare.steamstatic.com/steam/apps/${APP_ID}/library_600x900.jpg`,
        extra: expect.anything()
      })
    )
    const updated = library.get(APP_ID)!
    expect(updated.mac_arch).toBe('64')
  })

  it('MAC32-01: is_mac_native true + min-OS 10.9.3 (real 32-bit, Age of Wonders III) persists mac_arch "unknown" — never a false-negative assert-32', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(
      fixtureWithMacRequirements(
        '<li><strong>OS:</strong> 10.9.3 (Mavericks)<br></li>'
      )
    )
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ mac_arch: 'unknown', mac_arch_source: 'minos' })
    )
  })

  it('MAC32-01: is_mac_native true + empty mac_requirements (minimum undefined) resolves mac_arch "unknown" without throwing', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(
      fixtureWithMacRequirements(undefined)
    )
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)
    library.set(APP_ID, makeEntry())

    expect(() => new SteamGame(APP_ID).getGameInfo()).not.toThrow()
    await flushAsync()

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ mac_arch: 'unknown', mac_arch_source: 'minos' })
    )
  })

  it('MAC32-01: is_mac_native false does NOT recompute mac_arch — carries forward the existing entry unchanged', async () => {
    const notMacNativeResponse = {
      data: {
        [APP_ID]: {
          success: true,
          data: {
            ...fixtureApiResponse.data[APP_ID].data,
            platforms: { windows: true, mac: false, linux: false },
            mac_requirements: {
              minimum: '<li><strong>OS:</strong> macOS 10.15 or newer<br></li>'
            }
          }
        }
      }
    }
    ;(axios.get as jest.Mock).mockResolvedValue(notMacNativeResponse)
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      mac_arch: 'unknown'
    })
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ mac_arch: 'unknown' })
    )
    // mac_arch_source must not be freshly stamped 'minos' — is_mac_native is false.
    const setCall = (steamMetadataStore.set as jest.Mock).mock.calls.find(
      ([key]) => key === APP_ID
    )
    expect(setCall?.[1]?.mac_arch_source).toBeUndefined()
  })

  it('MAC32-01: existing mac_arch_verified true is NEVER regressed by a re-fetch — mac_arch/mac_arch_source/mac_arch_verified preserved', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(
      fixtureWithMacRequirements(
        '<li><strong>OS:</strong> 10.9.3 (Mavericks)<br></li>' // would compute 'unknown' if NOT gated
      )
    )
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      mac_arch: '32',
      mac_arch_verified: true,
      mac_arch_source: 'macho'
    })
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        mac_arch: '32',
        mac_arch_verified: true,
        mac_arch_source: 'macho'
      })
    )
  })

  // ── LIB-04: cache persistence ─────────────────────────────────────────────

  it('LIB-04: fetched metadata is written to steamMetadataStore for indefinite reuse', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        art_cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${APP_ID}/header.jpg`,
        art_square: `https://cdn.cloudflare.steamstatic.com/steam/apps/${APP_ID}/library_600x900.jpg`
      })
    )
  })

  // ── LIB-04: frontend update via IPC ──────────────────────────────────────

  it('LIB-04: fetchMetadataIfNeeded calls sendFrontendMessage pushGameToLibrary with the updated GameInfo', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({
        app_name: APP_ID,
        art_cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${APP_ID}/header.jpg`,
        title: 'Dota 2',
        // Phase 17 D-08 reconciliation (Plan 09): this push only happens
        // after a successful appdetails fetch, exactly when platforms are
        // captured — the frontend bottle indicator relies on this flag.
        steamPlatformsCaptured: true
      })
    )
  })

  // ── LIB-04: pendingFetches dedup (T-2-03) ────────────────────────────────

  it('LIB-04: concurrent getGameInfo calls for the same appId only fire one network request (pendingFetches dedup)', async () => {
    // Slow-resolving promise — not resolved until after both sync calls complete
    let resolveAxios!: (value: unknown) => void
    ;(axios.get as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveAxios = resolve
      })
    )
    library.set(APP_ID, makeEntry())

    const game = new SteamGame(APP_ID)
    // Both calls happen synchronously before any awaited code runs
    game.getGameInfo()
    game.getGameInfo()

    // Now resolve the single in-flight request
    resolveAxios(fixtureApiResponse)
    await flushAsync()

    // Only one network request should have been made
    expect(axios.get).toHaveBeenCalledTimes(1)
  })

  // ── LIB-04: error handling ────────────────────────────────────────────────

  it('LIB-04: a failed appdetails request is caught and logged without throwing', async () => {
    ;(axios.get as jest.Mock).mockRejectedValue(new Error('Network error'))
    library.set(APP_ID, makeEntry())

    const game = new SteamGame(APP_ID)

    // Synchronous call must not throw
    expect(() => game.getGameInfo()).not.toThrow()

    // Async error must also be swallowed (not bubble up as unhandled rejection)
    await flushAsync()

    // logWarning should have been called with the error
    const { logWarning } = jest.requireMock('backend/logger')
    expect(logWarning).toHaveBeenCalled()
    // steamMetadataStore.set must NOT run, and no game must be pushed to the
    // frontend (the steamMetadataSyncing on/off signals are expected + allowed).
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.anything()
    )
  })
})

// ── Integration: lazy fetch reachable through SteamLibraryManager ────────────

describe('SteamLibraryManager.getGameInfo integration — lazy fetch delegation', () => {
  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
  })

  it('getGameInfo() through the library manager triggers lazy metadata fetch via SteamGame delegation', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    // Entry in shared Map with no artwork — should trigger fetchMetadataIfNeeded
    library.set(APP_ID, makeEntry())

    const manager = new SteamLibraryManager()
    const result = manager.getGameInfo(APP_ID)

    // Synchronous return should be the in-Map entry
    expect(result).toBeDefined()
    expect(result?.app_name).toBe(APP_ID)

    // Lazy fetch must have been triggered through the delegation chain
    await flushAsync()
    expect(axios.get).toHaveBeenCalledTimes(1)
    expect(axios.get).toHaveBeenCalledWith(
      `https://store.steampowered.com/api/appdetails?appids=${APP_ID}`,
      { timeout: 15000 }
    )
  })
})

// ── GAME-01: SteamGame.launch() + appId guard (T-03-01) ──────────────────────

describe('SteamGame.launch() — GAME-01', () => {
  let shellOpenExternal: jest.Mock
  let notifyMock: jest.Mock
  let logWarningMock: jest.Mock

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    notifyMock = jest.requireMock('backend/dialog/dialog').notify as jest.Mock
    logWarningMock = jest.requireMock('backend/logger').logWarning as jest.Mock
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
  })

  it('GAME-01: launch() calls shell.openExternal with steam://rungameid/{appId} for numeric appId', async () => {
    const game = new SteamGame(APP_ID)
    await game.launch({} as any)

    expect(shellOpenExternal).toHaveBeenCalledTimes(1)
    // activate:false so the Steam handoff does not steal foreground / force a
    // macOS fullscreen-Space switch from Console mode.
    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://rungameid/${APP_ID}`,
      { activate: false }
    )
  })

  it('GAME-01: launch() resolves true for a valid numeric appId', async () => {
    const game = new SteamGame(APP_ID)
    const result = await game.launch({} as any)

    expect(result).toBe(true)
  })

  it('launch() does NOT show a hand-off toast (toast feature removed — Steam opens fast enough)', async () => {
    const game = new SteamGame(APP_ID)
    await game.launch({} as any)

    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('T-03-01: launch() does NOT call shell.openExternal when appId is non-numeric (injection guard)', async () => {
    const badGame = new SteamGame('abc')
    library.set('abc', makeEntry({ app_name: 'abc', title: 'BadGame' }))

    const result = await badGame.launch({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })

  it('T-03-01: launch() does NOT call shell.openExternal for appId with shell metacharacters', async () => {
    const badId = '12; rm -rf ~'
    const badGame = new SteamGame(badId)
    library.set(badId, makeEntry({ app_name: badId, title: 'BadGame' }))

    const result = await badGame.launch({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })

  it('T-03-01: launch() does NOT call shell.openExternal for appId with path traversal', async () => {
    const badId = '10/../uninstall/5'
    const badGame = new SteamGame(badId)
    library.set(badId, makeEntry({ app_name: badId, title: 'BadGame' }))

    const result = await badGame.launch({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })

  it('T-03-01: launch() logs a warning when appId is invalid', async () => {
    const badGame = new SteamGame('not-a-number')
    library.set(
      'not-a-number',
      makeEntry({ app_name: 'not-a-number', title: 'BadGame' })
    )

    await badGame.launch({} as any)

    expect(logWarningMock).toHaveBeenCalled()
  })

  it('GAME-04/D-06: launch() does not invoke any Wine/Proton routine — only shell.openExternal is called as external exec', async () => {
    // Verify that the steam:// URL contains rungameid (not a Heroic runtime command)
    const game = new SteamGame(APP_ID)
    await game.launch({} as any)

    // shell.openExternal must be called with a steam:// URL using rungameid — NOT a CLI/Wine command
    const calls = shellOpenExternal.mock.calls
    expect(calls.length).toBe(1)
    const url: string = calls[0][0]
    expect(url).toMatch(/^steam:\/\/rungameid\/\d+$/)
  })

})

// ── D-11: SteamGame.isNative() — per-OS confirmed-not-native ─────────────────

describe('SteamGame.isNative() — D-11 per-OS confirmed-not-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isWindows = false
    envMock.isMac = false
    envMock.isLinux = true
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
  })

  it('non-mac (Linux/Windows): isNative() returns true even for a confirmed-not-native metadata entry', () => {
    envMock.isMac = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(true)
  })

  it('D-11: macOS confirmed-not-native (platformsCaptured:true, is_mac_native:false) — isNative() returns false', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(false)
  })

  it('D-11 (BLOCKER): macOS NOT-yet-captured (platformsCaptured not true) — isNative() returns true (do not bottle an unconfirmed game)', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: false,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(true)
  })

  it('macOS Mac-native game (platformsCaptured:true, is_mac_native:true) — isNative() returns true', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })

    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(true)
  })

  it('macOS with no metadata entry at all — isNative() returns true (D-11 ambiguous-default fallback)', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)

    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(true)
  })

  // ── MAC32-02: confirmed-32-bit routing (post-install Mach-O verdict) ─────

  it('MAC32-02: macOS + mac_arch "32" (is_mac_native true — a confirmed-32 game reports it) — isNative() returns false', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      mac_arch: '32',
      mac_arch_verified: true,
      mac_arch_source: 'macho'
    })

    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(false)
  })

  it('MAC32-02: non-macOS host + mac_arch "32" — isNative() returns true (the !isMac guard fires first, bottle is macOS-only)', () => {
    envMock.isMac = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      mac_arch: '32',
      mac_arch_verified: true,
      mac_arch_source: 'macho'
    })

    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(true)
  })

  it('MAC32-02: macOS + mac_arch "64" or "unknown" with no D-11 trigger — isNative() returns true (native path, not bottle-eligible)', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      mac_arch: '64',
      mac_arch_verified: true,
      mac_arch_source: 'macho'
    })

    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(true)
  })

  it('MAC32-02 regression: the existing D-11 path (platformsCaptured true && is_mac_native false) still routes to the bottle unchanged', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      mac_arch: 'unknown'
    })

    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(false)
  })
})

// ── Phase 17 (D-10/D-11): SteamGame.launch() bottle routing ─────────────────

describe('SteamGame.launch() — Phase 17 bottle routing (D-10/D-11)', () => {
  let shellOpenExternal: jest.Mock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(isBottleReady as jest.Mock).mockReset()
    ;(tellBottledSteamToLaunch as jest.Mock).mockReset()
  })

  it('bottle-eligible + un-provisioned: launch() does NOT call shell.openExternal, emits steamBottleSetupRequired, resolves false', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isBottleReady as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
    const result = await game.launch({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBottleSetupRequired',
      { appName: APP_ID }
    )
    expect(result).toBe(false)
  })

  it('bottle-eligible + provisioned: launch() calls tellBottledSteamToLaunch, NOT shell.openExternal', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(tellBottledSteamToLaunch as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID)
    const result = await game.launch({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(tellBottledSteamToLaunch).toHaveBeenCalledWith(APP_ID)
    expect(result).toBe(true)
  })

  it('D-10/scope-fence: NON-eligible (Mac-native) — launch() STILL calls shell.openExternal with steam://rungameid/<appId> (native path unchanged)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })

    const game = new SteamGame(APP_ID)
    const result = await game.launch({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://rungameid/${APP_ID}`,
      { activate: false }
    )
    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
    expect(result).toBe(true)
  })

  it('D-11 (BLOCKER): NOT-yet-captured macOS game — launch() STILL takes the native rungameid path and does NOT emit steamBottleSetupRequired', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: false,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID)
    await game.launch({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://rungameid/${APP_ID}`,
      { activate: false }
    )
    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'steamBottleSetupRequired',
      expect.anything()
    )
  })

  it('D-10/scope-fence: NON-eligible (non-mac) — launch() STILL calls shell.openExternal with steam://rungameid/<appId>', async () => {
    envMock.isMac = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID)
    await game.launch({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://rungameid/${APP_ID}`,
      { activate: false }
    )
    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
  })
})

// ── Phase 24 Plan 08 (R4/R6/R7, finding #3): allowlist-based bridge launch
// routing — ensureBridgeHelperReady() readiness gate + resolveBridgeLaunchExe()
// exe resolution + direct runWineCommand (never tellBottledSteamToLaunch).

describe('SteamGame.launch() — Phase 24 Plan 08 bridge routing (R4/R6/R7/finding-3)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any
  const RESOLVED_EXE_PATH =
    '/mock/bridge/bottle/steamapps/common/Avernum 4/Avernum4.exe'

  beforeEach(() => {
    __resetBridgeFailedSessionForTests()
    library.clear()
    pendingFetches.clear()
    library.set(APP_ID, makeEntry({ title: 'Avernum 4' }))
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(bridgeAllowlist.has as jest.Mock).mockReset()
    ;(tellBottledSteamToLaunch as jest.Mock).mockReset()
    ;(ensureBridgeHelperReady as jest.Mock).mockReset()
    ;(resolveBridgeLaunchExe as jest.Mock).mockReset()
    ;(getBridgeBottleSettings as jest.Mock).mockReturnValue({
      wineCrossoverBottle: 'GameLibSteamBridge'
    })
    ;(runWineCommand as jest.Mock).mockReset().mockResolvedValue({
      stdout: '',
      stderr: ''
    })
    // 24-13 (D-UAT-24-02): launchBridgeGame's on-disk existence gate.
    // Default both to true/ready so the pre-existing happy-path tests below
    // (which never mention the exe-existence guard) keep exercising a
    // "bridge genuinely installed" state; the dedicated D-UAT-24-02 test
    // overrides existsSync to false.
    ;(isBridgeBottleReady as jest.Mock).mockReset().mockReturnValue(true)
    ;(existsSync as jest.Mock).mockReset().mockReturnValue(true)
  })

  afterEach(() => {
    // Restore the module-mock's declared defaults (isMac:false, isLinux:true)
    // — several LATER describe blocks in this file (e.g. stop()/install()
    // GAME-02) never touch envMock themselves and rely on the ambient
    // isMac:false default, so this block must not leave isMac:true trailing
    // into whatever test runs next in file order.
    envMock.isMac = false
    envMock.isWindows = false
    envMock.isLinux = true
  })

  it('allowlisted launch: ensureBridgeHelperReady -> resolveBridgeLaunchExe -> runWineCommand with the RESOLVED exe path + getBridgeBottleSettings (NOT tellBottledSteamToLaunch, no <gameExePath> placeholder)', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(ensureBridgeHelperReady as jest.Mock).mockResolvedValue({
      status: 'ready',
      ready: true
    })
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)

    const game = new SteamGame(APP_ID)
    const result = await game.launch({} as any)

    expect(ensureBridgeHelperReady).toHaveBeenCalledWith(APP_ID)
    expect(resolveBridgeLaunchExe).toHaveBeenCalledWith(APP_ID)
    expect(runWineCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        commandParts: [RESOLVED_EXE_PATH],
        gameSettings: { wineCrossoverBottle: 'GameLibSteamBridge' },
        wait: false
      })
    )
    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
    expect(result).toBe(true)
  })

  it('R7 forced failure: ensureBridgeHelperReady not-ready — game is NOT launched, markBridgeFailedThisSession applied, steamBridgeSetupRequired fired, and a subsequent launch() for the SAME appId skips the bridge (finding #3 bypass)', async () => {
    // A dedicated appId, never reused elsewhere in this file, so this
    // test's bridgeFailedThisSession mutation cannot leak into other tests.
    const FAILING_APP_ID = '888888'
    library.set(FAILING_APP_ID, makeEntry({ title: 'Failing Bridge Game' }))
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(ensureBridgeHelperReady as jest.Mock).mockResolvedValue({
      status: 'unreachable',
      ready: false
    })
    ;(tellBottledSteamToLaunch as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(FAILING_APP_ID)
    const result = await game.launch({} as any)

    expect(runWineCommand).not.toHaveBeenCalled()
    expect(result).toBe(false)
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      {
        appName: FAILING_APP_ID,
        reason: 'unreachable',
        fallbackAvailable: true
      }
    )

    // A subsequent launch() re-invocation (e.g. the D-05 fallback dialog's
    // own re-invocation) must now skip the bridge entirely (finding #3) and
    // route to the existing bottled path instead.
    const secondResult = await game.launch({} as any)
    expect(tellBottledSteamToLaunch).toHaveBeenCalledWith(FAILING_APP_ID)
    expect(secondResult).toBe(true)
  })

  it('resolveBridgeLaunchExe returns undefined — launch() does NOT run a bare/undefined path, marks bridge-failed, fires steamBridgeSetupRequired', async () => {
    const NO_EXE_APP_ID = '777777'
    library.set(NO_EXE_APP_ID, makeEntry({ title: 'No Windows Launch Entry' }))
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(ensureBridgeHelperReady as jest.Mock).mockResolvedValue({
      status: 'ready',
      ready: true
    })
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(undefined)

    const game = new SteamGame(NO_EXE_APP_ID)
    const result = await game.launch({} as any)

    expect(runWineCommand).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      {
        appName: NO_EXE_APP_ID,
        reason: 'launch-exe-not-resolved',
        fallbackAvailable: true
      }
    )
    expect(result).toBe(false)
  })

  it('D-UAT-24-02: helper ready + resolveBridgeLaunchExe returns a path, but the exe is absent on disk (installed via a non-bridge path) — runWineCommand is NOT called, steamBridgeSetupRequired fired with reason bridge-not-installed, markBridgeFailedThisSession NOT applied (bridge stays eligible for a later install-through-bridge retry)', async () => {
    const NOT_INSTALLED_APP_ID = '666666'
    library.set(
      NOT_INSTALLED_APP_ID,
      makeEntry({ title: 'Installed via native/old-bottle path' })
    )
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(ensureBridgeHelperReady as jest.Mock).mockResolvedValue({
      status: 'ready',
      ready: true
    })
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(existsSync as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(NOT_INSTALLED_APP_ID)
    const result = await game.launch({} as any)

    expect(existsSync).toHaveBeenCalledWith(RESOLVED_EXE_PATH)
    expect(runWineCommand).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      {
        appName: NOT_INSTALLED_APP_ID,
        reason: 'bridge-not-installed',
        fallbackAvailable: true
      }
    )
    expect(result).toBe(false)

    // Not a bridge FAILURE — markBridgeFailedThisSession must NOT have been
    // applied, so a later install-through-the-bridge retry is not poisoned.
    // Proven black-box: a subsequent launch() with the exe now present
    // reaches runWineCommand rather than falling back to the bottled path.
    ;(existsSync as jest.Mock).mockReturnValue(true)
    const secondResult = await game.launch({} as any)
    expect(runWineCommand).toHaveBeenCalledTimes(1)
    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
    expect(secondResult).toBe(true)
  })

  it('D-UAT-24-02: helper ready + exe resolved + exe exists on disk + bridge bottle ready — happy path unchanged (runWineCommand fires)', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(ensureBridgeHelperReady as jest.Mock).mockResolvedValue({
      status: 'ready',
      ready: true
    })
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)

    const game = new SteamGame(APP_ID)
    const result = await game.launch({} as any)

    expect(runWineCommand).toHaveBeenCalledTimes(1)
    expect(result).toBe(true)
  })

  it('regression: a non-allowlisted title never calls ensureBridgeHelperReady/resolveBridgeLaunchExe/runWineCommand — existing bottled launch flow unchanged', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(tellBottledSteamToLaunch as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID)
    await game.launch({} as any)

    expect(ensureBridgeHelperReady).not.toHaveBeenCalled()
    expect(resolveBridgeLaunchExe).not.toHaveBeenCalled()
    expect(runWineCommand).not.toHaveBeenCalled()
    expect(tellBottledSteamToLaunch).toHaveBeenCalledWith(APP_ID)
  })
})

// ── SteamGame.stop() — no-op ──────────────────────────────────────────────────

describe('SteamGame.stop() — no-op', () => {
  beforeEach(() => {
    library.clear()
    library.set(APP_ID, makeEntry())
  })

  it('stop() resolves void without throwing (Steam owns process lifecycle)', async () => {
    const game = new SteamGame(APP_ID)
    await expect(game.stop()).resolves.toBeUndefined()
  })
})

// ── SteamGame.stop() — D-02 real abort for an in-flight native depot download ─
//
// stop() converts from an unconditional no-op into: if a depot download
// AbortController is registered for this.appId (registered at native install
// start), call callAbortController(this.appId) so depot.ts's loop aborts and
// finalizeToSteam (Plan 06) writes the 1026 handoff; otherwise stays a safe
// no-op (native steam:// path / bottle path — Steam owns process lifecycle).

describe('SteamGame.stop() — D-02 native depot-download abort', () => {
  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    jest.spyOn(libraryModule, 'startInstallPolling').mockImplementation(() => {})
    ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({ ready: true })
    ;(resolveSteamInstallTarget as jest.Mock).mockResolvedValue({
      targetSteamappsDir: '/mock/steam/steamapps',
      installdir: APP_ID
    })
    ;(createAbortController as jest.Mock).mockReturnValue({
      signal: 'mock-signal'
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
  })

  it('when a native depot download is in flight for this.appId, stop() calls callAbortController(this.appId)', async () => {
    // Slow-resolving downloadSteamDepots — install() is in flight when stop() runs.
    let resolveDownload!: (value: { status: 'done' }) => void
    ;(downloadSteamDepots as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveDownload = resolve
      })
    )

    const game = new SteamGame(APP_ID)
    const installPromise = game.install({} as any)
    // Let install() run all the way through ensurePlatformsCaptured() ->
    // ensureSteamClientReady -> resolveSteamInstallTarget -> createAbortController
    // (each a separate microtask hop) up to the pending downloadSteamDepots
    // call before stop() is called. flushAsync's setImmediate macrotask is
    // guaranteed to run after every queued microtask, unlike a fixed count of
    // Promise.resolve() hops.
    await flushAsync()

    await game.stop()
    expect(callAbortController).toHaveBeenCalledWith(APP_ID)

    resolveDownload({ status: 'done' })
    await installPromise
  })

  it('when no depot download is in flight (native steam:// path / bottle path), stop() remains a safe no-op and does not throw', async () => {
    const game = new SteamGame(APP_ID)
    await expect(game.stop()).resolves.toBeUndefined()
    expect(callAbortController).not.toHaveBeenCalled()
  })

  it('D-UAT-05: stop() called WHILE ensureSteamClientReady is still pending finds nativeInstallsInFlight already registered — no historic "Steam owns process lifecycle; no-op" branch', async () => {
    const { logWarning } = jest.requireMock('backend/logger')
    let resolveReady!: (value: { ready: true }) => void
    ;(ensureSteamClientReady as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveReady = resolve
      })
    )
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    const game = new SteamGame(APP_ID)
    const installPromise = game.install({} as any)
    // Let install() run through ensurePlatformsCaptured() into the
    // (still-pending) ensureSteamClientReady await — registration (D-UAT-05
    // fix) happens synchronously before this await starts.
    await flushAsync()

    await game.stop()
    expect(callAbortController).toHaveBeenCalledWith(APP_ID)
    expect(logWarning).not.toHaveBeenCalledWith(
      expect.stringContaining('no-op'),
      expect.anything()
    )

    resolveReady({ ready: true })
    await installPromise
  })
})

// ── GAME-02: SteamGame.install() ──────────────────────────────────────────────

describe('SteamGame.install() — GAME-02', () => {
  let shellOpenExternal: jest.Mock
  let notifyMock: jest.Mock
  let startInstallPollingSpy: jest.SpyInstance

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    notifyMock = jest.requireMock('backend/dialog/dialog').notify as jest.Mock
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    // Spy on startInstallPolling so install() can call it without running the real poller
    startInstallPollingSpy = jest
      .spyOn(libraryModule, 'startInstallPolling')
      .mockImplementation(() => {})
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
  })

  it('GAME-02: install() calls shell.openExternal with steam://install/{appId} for numeric appId', async () => {
    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    expect(shellOpenExternal).toHaveBeenCalledTimes(1)
    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
  })

  it('GAME-02/focus: native install HANDS FOCUS to Steam — openExternal is called WITHOUT { activate: false }, so the steam:// protocol handler foregrounds the native Steam client (OS-delegated parity with the CrossOver path\'s raiseInstallerWindow() System Events raise); contrast launch() which passes { activate: false } to avoid stealing foreground', async () => {
    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    expect(shellOpenExternal).toHaveBeenCalledTimes(1)
    // Native install intentionally lets the OS bring Steam to the front — the
    // SAME OUTCOME as the bottled/CrossOver install (raiseInstallerWindow), via
    // a different MECHANISM (OS protocol activation vs a GameLib-driven raise).
    // The focus handover is "hands off": activation must NOT be suppressed.
    const [url, opts] = shellOpenExternal.mock.calls[0]
    expect(url).toBe(`steam://install/${APP_ID}`)
    expect(opts).toBeUndefined()
    // Explicit contrast with launch()'s { activate: false } foreground-suppression.
    expect(shellOpenExternal).not.toHaveBeenCalledWith(
      `steam://install/${APP_ID}`,
      { activate: false }
    )
  })

  it('GAME-02: install() resolves { status: "done" } for a valid numeric appId', async () => {
    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(result).toEqual({ status: 'done' })
  })

  it('install() does NOT show a hand-off toast (toast feature removed)', async () => {
    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('T-03-01: install() does NOT call shell.openExternal when appId is non-numeric', async () => {
    const badGame = new SteamGame('abc')
    library.set('abc', makeEntry({ app_name: 'abc', title: 'BadGame' }))

    const result = await badGame.install({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({ status: 'error' }))
  })

  it('GAME-02: install() does NOT call sendFrontendMessage directly (no optimistic flip — D-02)', async () => {
    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    // Badge flipped by ACF poller (D-07) or focus re-read (D-01), never by click (D-02)
    expect(sendFrontendMessage).not.toHaveBeenCalled()
  })

  it('GAME-02/D-07: install() calls startInstallPolling with this.appId after successful openExternal', async () => {
    const game = new SteamGame(APP_ID)
    await game.install({} as any)
    expect(startInstallPollingSpy).toHaveBeenCalledWith(APP_ID)
  })

  it('D-07: install() does NOT call startInstallPolling when appId is non-numeric (T-03-01 guard)', async () => {
    const badGame = new SteamGame('abc')
    library.set('abc', makeEntry({ app_name: 'abc', title: 'BadGame' }))
    await badGame.install({} as any)
    expect(startInstallPollingSpy).not.toHaveBeenCalled()
  })
})

// ── steam-startup-resume-crash (2026-07-18) / D-04 softened ────────────────
//
// SteamLibraryManager.init() no longer auto-drives a leftover interrupted
// (StateFlags 1026) install on boot — it only flags the library entry
// steamResumePending:true. The user's own Install click is the resume
// trigger: install() must call resumeInterruptedSteamInstall() FIRST when
// that flag is set (and must never do so, and never let a failure there
// block the real install, otherwise).

describe('SteamGame.install() — steam-startup-resume-crash resume-on-click (D-04 softened)', () => {
  let shellOpenExternal: jest.Mock
  let startInstallPollingSpy: jest.SpyInstance
  let resumeSpy: jest.SpyInstance

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    startInstallPollingSpy = jest
      .spyOn(libraryModule, 'startInstallPolling')
      .mockImplementation(() => {})
    resumeSpy = jest
      .spyOn(libraryModule, 'resumeInterruptedSteamInstall')
      .mockResolvedValue(undefined)
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
    resumeSpy.mockRestore()
  })

  it('calls resumeInterruptedSteamInstall(appId) BEFORE proceeding to the normal install flow when steamResumePending is true', async () => {
    library.set(
      APP_ID,
      makeEntry({ title: 'Dota 2', install: { steamResumePending: true } as any })
    )
    const game = new SteamGame(APP_ID)

    await game.install({} as any)

    expect(resumeSpy).toHaveBeenCalledWith(APP_ID)
    // The normal install flow still runs afterward (D-04 softened resume is
    // additive, not a replacement for the real install/completion path).
    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
  })

  it('does NOT call resumeInterruptedSteamInstall when steamResumePending is not set (no regression for a normal fresh install)', async () => {
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    const game = new SteamGame(APP_ID)

    await game.install({} as any)

    expect(resumeSpy).not.toHaveBeenCalled()
    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
  })

  it('a resumeInterruptedSteamInstall() rejection never blocks the subsequent real install attempt (hardening)', async () => {
    resumeSpy.mockRejectedValue(new Error('resume finalize exploded'))
    library.set(
      APP_ID,
      makeEntry({ title: 'Dota 2', install: { steamResumePending: true } as any })
    )
    const game = new SteamGame(APP_ID)

    const result = await game.install({} as any)

    expect(resumeSpy).toHaveBeenCalledWith(APP_ID)
    expect(result).toEqual({ status: 'done' })
    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
  })
})

// ── SNI-07 (D-13): SteamGame.install() native depot-download opt-in branch ──
//
// isSteamNativeInstallEnabled() gates whether install() routes a (non-bottle-
// eligible) install through depot.ts's downloadSteamDepots orchestrator
// instead of the legacy steam://install handoff. OFF preserves today's
// behavior byte-for-byte (D-13 safety valve); ON wires the Plan 09/10 seams
// (resolveSteamInstallTarget/ensureSteamClientReady) and maps
// downloadSteamDepots's { status, error? } outcome onto InstallResult using
// the SAME conventions gog/legendary's own install() functions use, so a
// classified error renders through the EXISTING generic queue error+Retry
// surface with zero downloadqueue.ts changes (D-06/D-07 reuse).

describe('SteamGame.install() — SNI-07 native depot-download opt-in (D-13)', () => {
  let shellOpenExternal: jest.Mock
  let startInstallPollingSpy: jest.SpyInstance

  const TARGET = { targetSteamappsDir: '/mock/steam/steamapps', installdir: APP_ID }

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    startInstallPollingSpy = jest
      .spyOn(libraryModule, 'startInstallPolling')
      .mockImplementation(() => {})
    // Non-macOS host (envMock defaults isMac:false) — never bottle-eligible,
    // so every test here exercises the native/legacy branch, not Plan 11's
    // bottle branch.
    ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({ ready: true })
    ;(resolveSteamInstallTarget as jest.Mock).mockResolvedValue(TARGET)
    ;(createAbortController as jest.Mock).mockReturnValue({
      signal: 'mock-signal'
    })
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
  })

  it('opt-in OFF: install() takes the legacy steam://install path and does NOT call downloadSteamDepots', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
    expect(downloadSteamDepots).not.toHaveBeenCalled()
    expect(ensureSteamClientReady).not.toHaveBeenCalled()
    expect(resolveSteamInstallTarget).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'done' })
  })

  it('opt-in ON, non-bottle: install() calls ensureSteamClientReady -> resolveSteamInstallTarget -> downloadSteamDepots in order, with the resolved target + host os + an AbortSignal, then startInstallPolling', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()

    const readyOrder = (ensureSteamClientReady as jest.Mock).mock
      .invocationCallOrder[0]
    const targetOrder = (resolveSteamInstallTarget as jest.Mock).mock
      .invocationCallOrder[0]
    const downloadOrder = (downloadSteamDepots as jest.Mock).mock
      .invocationCallOrder[0]
    expect(readyOrder).toBeLessThan(targetOrder)
    expect(targetOrder).toBeLessThan(downloadOrder)

    expect(ensureSteamClientReady).toHaveBeenCalledWith(APP_ID)
    expect(resolveSteamInstallTarget).toHaveBeenCalledWith(APP_ID, {})
    expect(downloadSteamDepots).toHaveBeenCalledWith(APP_ID, {
      targetSteamappsDir: TARGET.targetSteamappsDir,
      installdir: TARGET.installdir,
      os: expect.any(String),
      signal: 'mock-signal'
    })
    // debug/steam-1026-download-restart: this poll starts AFTER GameLib's own
    // depot.ts download finished — isNativeHandoff:true so StateFlags 1026 is
    // correctly read as "waiting for Steam restart", not an active download.
    expect(startInstallPollingSpy).toHaveBeenCalledWith(APP_ID, {
      isNativeHandoff: true
    })
    expect(result).toEqual({ status: 'done' })
  })

  it('D-06/D-07 error surface reuse: a { status: "error", error } depot outcome maps to an InstallResult.error carrying the EXACT classified message — no steam-specific error/Retry UI, downloadqueue.ts uninvolved', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    const classifiedMessage = 'Steam servers dropped the connection'
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
      status: 'error',
      error: classifiedMessage
    })

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(result).toEqual({ status: 'error', error: classifiedMessage })
    expect(result.status).not.toBe('abort')
    expect(startInstallPollingSpy).not.toHaveBeenCalled()
  })

  it('cancel outcome: a { status: "cancelled" } depot outcome maps to the abort-shaped InstallResult other runners use for a user cancel — not an error', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
      status: 'cancelled'
    })

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(result).toEqual({ status: 'abort' })
    expect(result.error).toBeUndefined()
  })

  it('non-numeric appId is still rejected before any native handoff (T-03-01 guard) even with the opt-in ON', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    // depot.ts's own guard classifies a rejected non-numeric appId as an
    // error outcome — downloadSteamDepots never throws (Plan 06 contract).
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
      status: 'error',
      error: 'Invalid Steam appId'
    })
    const badGame = new SteamGame('abc')
    library.set('abc', makeEntry({ app_name: 'abc', title: 'BadGame' }))

    const result = await badGame.install({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({ status: 'error' }))
  })

  it('createAbortController is registered under this.appId before downloadSteamDepots runs, and released after it resolves', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    expect(createAbortController).toHaveBeenCalledWith(APP_ID)
    expect(deleteAbortController).toHaveBeenCalledWith(APP_ID)
  })

  // ── G-30-02 (30-07 gap closure) ──────────────────────────────────────────
  // A never-settling resolveSteamInstallTarget (the pre-download resolution
  // PHASE, belt-and-suspenders bound on top of Task 1's per-CM-call bounds)
  // must resolve runNativeDepotDownload to {status:'error'} within the
  // bounded window instead of hanging install() forever.
  describe('G-30-02: pre-download phase (resolveSteamInstallTarget) is bounded', () => {
    afterEach(() => {
      jest.useRealTimers()
    })

    it('a never-settling resolveSteamInstallTarget makes install() resolve to {status:"error"} within the bounded window, not hang', async () => {
      jest.useFakeTimers()
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
      ;(resolveSteamInstallTarget as jest.Mock).mockReturnValue(
        new Promise(() => {
          // Never settles — simulates a stale-but-present CM socket parking
          // this PICS-backed resolution forever.
        })
      )

      const game = new SteamGame(APP_ID)
      const resultPromise = game.install({} as any)
      const assertion = expect(resultPromise).resolves.toEqual({
        status: 'error',
        error: expect.stringContaining('timed out')
      })

      // WR-01: the outer belt-and-suspenders bound is STEAM_PICS_TIMEOUT_MS * 2
      // (strictly larger than any inner per-CM-call bound, so an inner graceful
      // fallback always wins its own race). Advance past that outer bound so
      // the never-settling resolution trips the outer timer.
      await jest.advanceTimersByTimeAsync(STEAM_PICS_TIMEOUT_MS * 2 + 5000)
      await assertion

      expect(downloadSteamDepots).not.toHaveBeenCalled()
    })

    it('a fast-resolving resolveSteamInstallTarget is unaffected (happy path unchanged, protects the Electron build)', async () => {
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
      ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

      const game = new SteamGame(APP_ID)
      const result = await game.install({} as any)

      expect(result).toEqual({ status: 'done' })
    })
  })
})

// ── Phase 23 (23-05, T-23-12/T-23-13): single-flight guard + fail-safe ──────
//
// installDepotDownload adds this.appId to nativeInstallsInFlight but (prior to
// this plan) never checked it on entry, so install() could be entered twice
// for one appId and spawn two concurrent downloadSteamDepots runs (the Gate 1
// progress-percent flip-flop root cause). These tests prove: at most one
// downloadSteamDepots per appId, a joining caller resolves to the SAME
// result, per-appId independence, and reliable registry release on
// success/error/cancel/throw (T-23-13 — never permanently blocks a later
// re-install).

describe('SteamGame.install() — single-flight guard (T-23-12/T-23-13)', () => {
  const OTHER_APP_ID = '990080'

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    library.set(
      OTHER_APP_ID,
      makeEntry({ app_name: OTHER_APP_ID, title: 'Hogwarts Legacy' })
    )
    jest.spyOn(libraryModule, 'startInstallPolling').mockImplementation(() => {})
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({ ready: true })
    ;(resolveSteamInstallTarget as jest.Mock).mockResolvedValue({
      targetSteamappsDir: '/mock/steam/steamapps',
      installdir: APP_ID
    })
    ;(createAbortController as jest.Mock).mockReturnValue({
      signal: { aborted: false }
    })
  })

  it('two overlapping installDepotDownload calls for the SAME appId invoke downloadSteamDepots exactly ONCE, and the joining caller resolves to the SAME result', async () => {
    let resolveDownload!: (value: { status: 'done' }) => void
    ;(downloadSteamDepots as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveDownload = resolve
      })
    )

    const game = new SteamGame(APP_ID)
    const first = game.install({} as any)
    await flushAsync()
    const second = game.install({} as any)

    resolveDownload({ status: 'done' })
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(downloadSteamDepots).toHaveBeenCalledTimes(1)
    expect(secondResult).toEqual(firstResult)
  })

  it('registry cleared on success — a subsequent FRESH installDepotDownload for the same appId calls downloadSteamDepots again (not permanently blocked)', async () => {
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    const game = new SteamGame(APP_ID)
    await game.install({} as any)
    await game.install({} as any)

    expect(downloadSteamDepots).toHaveBeenCalledTimes(2)
  })

  it('registry cleared on an { status: "error" } outcome — a subsequent fresh install calls downloadSteamDepots again', async () => {
    ;(downloadSteamDepots as jest.Mock)
      .mockResolvedValueOnce({ status: 'error', error: 'boom' })
      .mockResolvedValueOnce({ status: 'done' })

    const game = new SteamGame(APP_ID)
    const first = await game.install({} as any)
    const second = await game.install({} as any)

    expect(first).toEqual({ status: 'error', error: 'boom' })
    expect(second).toEqual({ status: 'done' })
    expect(downloadSteamDepots).toHaveBeenCalledTimes(2)
  })

  it('registry cleared on a { status: "cancelled" } outcome — a subsequent fresh install calls downloadSteamDepots again', async () => {
    ;(downloadSteamDepots as jest.Mock)
      .mockResolvedValueOnce({ status: 'cancelled' })
      .mockResolvedValueOnce({ status: 'done' })

    const game = new SteamGame(APP_ID)
    const first = await game.install({} as any)
    const second = await game.install({} as any)

    expect(first).toEqual({ status: 'abort' })
    expect(second).toEqual({ status: 'done' })
    expect(downloadSteamDepots).toHaveBeenCalledTimes(2)
  })

  it('registry cleared when downloadSteamDepots rejects/throws — a subsequent fresh install calls downloadSteamDepots again', async () => {
    ;(downloadSteamDepots as jest.Mock)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ status: 'done' })

    const game = new SteamGame(APP_ID)
    await expect(game.install({} as any)).rejects.toThrow('network error')
    const second = await game.install({} as any)

    expect(second).toEqual({ status: 'done' })
    expect(downloadSteamDepots).toHaveBeenCalledTimes(2)
  })

  it('two overlapping installs for DIFFERENT appIds both proceed — guard is per-appId, not global', async () => {
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    const game = new SteamGame(APP_ID)
    const other = new SteamGame(OTHER_APP_ID)

    const results = await Promise.all([
      game.install({} as any),
      other.install({} as any)
    ])

    expect(downloadSteamDepots).toHaveBeenCalledTimes(2)
    expect(results).toEqual([{ status: 'done' }, { status: 'done' }])
  })

  // ── T-23-15: pause/resume abort-before-restart (no stacking) ──────────────
  it('pause -> resume: a resume issued WHILE the aborted prior run is still tearing down waits for its settlement (finally cleanup) before starting a fresh downloadSteamDepots — the two never run concurrently', async () => {
    let resolveFirstDownload!: (value: { status: 'cancelled' }) => void
    ;(downloadSteamDepots as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstDownload = resolve
      })
    )

    const game = new SteamGame(APP_ID)
    const firstInstall = game.install({} as any)
    // Let the first run reach the pending downloadSteamDepots call.
    await flushAsync()
    expect(downloadSteamDepots).toHaveBeenCalledTimes(1)

    // Pause: stop() marks the tracked entry aborted and calls
    // callAbortController — the first run is now TEARING DOWN, not yet
    // settled (its downloadSteamDepots promise is still pending).
    await game.stop()
    expect(callAbortController).toHaveBeenCalledWith(APP_ID)

    // Resume issued WHILE the aborted first run is still tearing down.
    ;(downloadSteamDepots as jest.Mock).mockResolvedValueOnce({
      status: 'done'
    })
    const resumeInstall = game.install({} as any)
    await flushAsync()

    // The resume must NOT have started a second downloadSteamDepots yet —
    // it is awaiting the prior (aborted) run's settlement first (no
    // stacking).
    expect(downloadSteamDepots).toHaveBeenCalledTimes(1)

    // Let the first (aborted) run settle -> its finally cleanup runs.
    resolveFirstDownload({ status: 'cancelled' })
    await firstInstall
    await flushAsync()

    // The resume's fresh run can now proceed to a NEW downloadSteamDepots
    // call.
    const resumeResult = await resumeInstall
    expect(downloadSteamDepots).toHaveBeenCalledTimes(2)
    expect(resumeResult).toEqual({ status: 'done' })
  })
})

// ── Phase 17 (D-10/D-11): SteamGame.install() bottle routing ────────────────

describe('SteamGame.install() — Phase 17 bottle routing (D-10/D-11)', () => {
  let shellOpenExternal: jest.Mock
  let startInstallPollingSpy: jest.SpyInstance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    startInstallPollingSpy = jest
      .spyOn(libraryModule, 'startInstallPolling')
      .mockImplementation(() => {})
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(isBottleReady as jest.Mock).mockReset()
    ;(tellBottledSteamToInstall as jest.Mock).mockReset()
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
  })

  it('bottle-eligible + un-provisioned: install() does NOT call shell.openExternal and emits steamBottleSetupRequired', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isBottleReady as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(tellBottledSteamToInstall).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBottleSetupRequired',
      { appName: APP_ID }
    )
    // The install did not actually start (no ACF poller) — flag the deferral so
    // the DownloadManager clears the transient 'installing' badge instead of
    // leaving the game stuck "installing" after Confirm or "Not now".
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
  })

  it('bottle-eligible + half-provisioned bottle (conf exists, steam.exe missing — isBottleReady false) does NOT dispatch to bottled Steam', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    // isBottleReady() is the real readiness gate (conf + steam.exe); a
    // half-provisioned bottle (cxbottle.conf present, steam.exe missing —
    // the GAP 1 stuck-loop scenario) reports false here, exactly like an
    // un-provisioned bottle from games.ts's perspective.
    ;(isBottleReady as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBottleSetupRequired',
      { appName: APP_ID }
    )
    expect(tellBottledSteamToInstall).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
  })

  it('bottle-eligible + provisioned: install() calls tellBottledSteamToInstall + bottle-scoped startInstallPolling, NOT shell.openExternal', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(tellBottledSteamToInstall as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(tellBottledSteamToInstall).toHaveBeenCalledWith(APP_ID)
    expect(startInstallPollingSpy).toHaveBeenCalledWith(APP_ID, {
      source: 'bottle'
    })
    expect(startInstallPollingSpy).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ status: 'done' })
  })

  it('WR-01: bottle-eligible dispatch ERROR — install() returns the error and does NOT start the ACF poller (no false "installing")', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(tellBottledSteamToInstall as jest.Mock).mockResolvedValue({
      status: 'error',
      error: 'boom'
    })

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(tellBottledSteamToInstall).toHaveBeenCalledWith(APP_ID)
    // A failed dispatch must NOT spawn the ~60s bottle poller.
    expect(startInstallPollingSpy).not.toHaveBeenCalledWith(APP_ID, {
      source: 'bottle'
    })
    expect(result).toEqual({ status: 'error', error: 'boom' })
  })

  it('D-11 (BLOCKER): NOT-yet-captured macOS game — install() STILL takes the native steam://install path and does NOT emit steamBottleSetupRequired', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: false,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
    expect(tellBottledSteamToInstall).not.toHaveBeenCalled()
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'steamBottleSetupRequired',
      expect.anything()
    )
  })

  it('D-10/scope-fence: NON-eligible (Mac-native) — install() STILL calls shell.openExternal with steam://install/<appId> (native path unchanged)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })

    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
    expect(tellBottledSteamToInstall).not.toHaveBeenCalled()
  })

  it('D-10/scope-fence: NON-eligible (non-mac) — install() STILL calls shell.openExternal with steam://install/<appId>', async () => {
    envMock.isMac = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
    expect(tellBottledSteamToInstall).not.toHaveBeenCalled()
  })
})

// ── Phase 21 Plan 11 (D-15/SNI-08): SteamGame.install() bottle depot-download
// opt-in. Unifies the install mechanism across native and bottle: when the
// opt-in is ON and a game is bottle-eligible + the bottle is ready, install()
// depot-downloads the WINDOWS depot (bottled Steam is a Windows Steam client)
// directly into the bottle's OWN steamapps/ via depot.ts's downloadSteamDepots
// — the SAME mechanism SNI-07's native branch uses, just with the write
// target swapped to getBottleSteamappsDir() and os hard-coded 'windows'. Never
// dispatches to the bottled Steam client for the download itself
// (tellBottledSteamToInstall/dispatchToBottledSteam untouched — that Wine-
// dispatch mechanism stays reserved for guided setup/launch/uninstall). OFF
// preserves the existing tellBottledSteamToInstall bottle path unchanged
// (D-13 safety valve); not-ready still requests guided setup with zero depot
// download attempted.

describe('SteamGame.install() — SNI-08 bottle depot-download opt-in (D-15)', () => {
  let shellOpenExternal: jest.Mock
  let startInstallPollingSpy: jest.SpyInstance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  const BOTTLE_STEAMAPPS_DIR = '/mock/bottle/steamapps'
  // resolveSteamInstallTarget's OWN targetSteamappsDir must be discarded on
  // the bottle path (it resolves a NATIVE macOS Steam library, irrelevant to
  // a bottle write target) — only its PICS-derived installdir is reused.
  const RESOLVED_TARGET = {
    targetSteamappsDir: '/mock/native/steamapps',
    installdir: 'Dota 2'
  }

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    startInstallPollingSpy = jest
      .spyOn(libraryModule, 'startInstallPolling')
      .mockImplementation(() => {})
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isBottleReady as jest.Mock).mockReset()
    ;(tellBottledSteamToInstall as jest.Mock).mockReset()
    ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(BOTTLE_STEAMAPPS_DIR)
    ;(getSteamBottleSettings as jest.Mock).mockReturnValue({
      wineCrossoverBottle: 'GameLib'
    })
    ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({ ready: true })
    ;(resolveSteamInstallTarget as jest.Mock).mockResolvedValue(RESOLVED_TARGET)
    ;(createAbortController as jest.Mock).mockReturnValue({
      signal: 'mock-signal'
    })
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
  })

  it('opt-in ON + bottle-eligible + ready: install() depot-downloads into the bottle steamapps dir with os:"windows", then starts the bottle-scoped poller', async () => {
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(getBottleSteamappsDir).toHaveBeenCalledWith('GameLib')
    expect(downloadSteamDepots).toHaveBeenCalledWith(APP_ID, {
      targetSteamappsDir: BOTTLE_STEAMAPPS_DIR,
      installdir: RESOLVED_TARGET.installdir,
      os: 'windows',
      signal: 'mock-signal'
    })
    // debug/steam-1026-download-restart: this poll starts AFTER GameLib's own
    // depot.ts download finished (D-15/SNI-08 native-ON bottle path) —
    // isNativeHandoff:true so StateFlags 1026 is correctly read as "waiting
    // for Steam restart", not an active download.
    expect(startInstallPollingSpy).toHaveBeenCalledWith(APP_ID, {
      source: 'bottle',
      isNativeHandoff: true
    })
    expect(result).toEqual({ status: 'done' })
  })

  it('opt-in ON + bottle-eligible + ready: install() does NOT dispatch to the bottled Steam client (no Wine dispatch for the download itself)', async () => {
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    expect(tellBottledSteamToInstall).not.toHaveBeenCalled()
    expect(shellOpenExternal).not.toHaveBeenCalled()
  })

  it('opt-in OFF + bottle-eligible + ready: install() takes the legacy tellBottledSteamToInstall path unchanged (D-13 safety valve)', async () => {
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(tellBottledSteamToInstall as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(tellBottledSteamToInstall).toHaveBeenCalledWith(APP_ID)
    expect(downloadSteamDepots).not.toHaveBeenCalled()
    expect(startInstallPollingSpy).toHaveBeenCalledWith(APP_ID, {
      source: 'bottle'
    })
    expect(result).toEqual({ status: 'done' })
  })

  it('opt-in ON + bottle-eligible but NOT ready: install() requests guided setup and never attempts a depot download', async () => {
    ;(isBottleReady as jest.Mock).mockReturnValue(false)
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(downloadSteamDepots).not.toHaveBeenCalled()
    expect(tellBottledSteamToInstall).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith('steamBottleSetupRequired', {
      appName: APP_ID
    })
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
  })
})

// ── Phase 24 Plan 08 (R4/R7, BLOCKER 1, finding #3): allowlist-based bridge
// routing — isBridgeEligible() composition (isBottleEligible() &&
// bridgeAllowlist.has(appId) && !bridgeFailedThisSession.has(appId)) and
// installBridgeGame()'s inline bridge-bottle provisioning + shim placement.
// The bridge bottle target (GameLibSteamBridge) is DISTINCT from the Phase
// 17 GameLibSteam bottle the SNI-08 describe block above exercises.

describe('SteamGame.install() — Phase 24 Plan 08 bridge routing (R4/BLOCKER-1/finding-3)', () => {
  let startInstallPollingSpy: jest.SpyInstance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  const BRIDGE_STEAMAPPS_DIR = '/mock/bridge/bottle/steamapps'
  const RESOLVED_TARGET = {
    targetSteamappsDir: '/mock/native/steamapps',
    installdir: 'Avernum 4'
  }
  const RESOLVED_EXE_PATH =
    '/mock/bridge/bottle/steamapps/common/Avernum 4/Avernum4.exe'

  beforeEach(() => {
    __resetBridgeFailedSessionForTests()
    library.clear()
    pendingFetches.clear()
    library.set(APP_ID, makeEntry({ title: 'Avernum 4' }))
    startInstallPollingSpy = jest
      .spyOn(libraryModule, 'startInstallPolling')
      .mockImplementation(() => {})
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isBottleReady as jest.Mock).mockReset()
    ;(tellBottledSteamToInstall as jest.Mock).mockReset()
    ;(bridgeAllowlist.has as jest.Mock).mockReset()
    ;(isBridgeBottleReady as jest.Mock).mockReset()
    ;(provisionBridgeBottle as jest.Mock).mockReset()
    ;(getBridgeBottleSettings as jest.Mock).mockReturnValue({
      wineCrossoverBottle: 'GameLibSteamBridge'
    })
    ;(getBottleSteamappsDir as jest.Mock).mockImplementation(
      (bottleName: string) =>
        bottleName === 'GameLibSteamBridge'
          ? BRIDGE_STEAMAPPS_DIR
          : '/mock/bottle/steamapps'
    )
    ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({ ready: true })
    ;(resolveSteamInstallTarget as jest.Mock).mockResolvedValue(
      RESOLVED_TARGET
    )
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })
    ;(createAbortController as jest.Mock).mockReturnValue({
      signal: 'mock-signal'
    })
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(
      RESOLVED_EXE_PATH
    )
    ;(placeShimForGame as jest.Mock).mockResolvedValue({
      status: 'placed',
      shimPath: `${BRIDGE_STEAMAPPS_DIR}/common/Avernum 4/steam_api.dll`
    })
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
    // Restore the module-mock's declared defaults — see the identical note
    // in the launch() bridge-routing describe block above.
    envMock.isMac = false
    envMock.isWindows = false
    envMock.isLinux = true
  })

  it('allowlisted + bottle-eligible: install() routes to installBridgeGame (bridge bottle target + shimGenerate called), NOT tellBottledSteamToInstall', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(tellBottledSteamToInstall).not.toHaveBeenCalled()
    expect(provisionBridgeBottle).not.toHaveBeenCalled()
    expect(downloadSteamDepots).toHaveBeenCalledWith(APP_ID, {
      targetSteamappsDir: BRIDGE_STEAMAPPS_DIR,
      installdir: RESOLVED_TARGET.installdir,
      os: 'windows',
      signal: 'mock-signal'
    })
    expect(resolveBridgeLaunchExe).toHaveBeenCalledWith(APP_ID)
    expect(placeShimForGame).toHaveBeenCalledWith(APP_ID, RESOLVED_EXE_PATH)
    expect(result).toEqual({ status: 'done' })
  })

  it('D-UAT-24-05 wiring: installBridgeGame polls the BRIDGE bottle (pollerSource:"bridge"), never "bottle" (which watches the unrelated Phase 17 GameLibSteam bottle and would never observe this manifest)', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)

    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    expect(startInstallPollingSpy).toHaveBeenCalledWith(APP_ID, {
      source: 'bridge',
      isNativeHandoff: true
    })
    expect(startInstallPollingSpy).not.toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ source: 'bottle' })
    )
  })

  it('D-UAT-24-03 cascade (b): a completed bridge install records install.install_path UNDER the bridge bottle (GameLibSteamBridge), never the Phase 17 GameLibSteam bottle', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)

    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    const stored = library.get(APP_ID)
    expect(stored?.install.install_path).toContain(BRIDGE_STEAMAPPS_DIR)
    expect(stored?.install.install_path).toContain('common')
    expect(stored?.install.install_path).not.toContain('/mock/bottle/steamapps')
  })

  it('D-UAT-24-03 cascade (a): a successful bridge install calls clearBridgeFailedThisSession — proven by exercising the exported un-poison hook: after markBridgeFailedThisSession + clearBridgeFailedThisSession for the SAME appId, a subsequent install() reaches the bridge again rather than the bottled fallback', async () => {
    const RETRY_APP_ID = '555555'
    library.set(RETRY_APP_ID, makeEntry({ title: 'Retry After Clear' }))
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)

    // Simulate an earlier recoverable bridge failure this session (e.g. a
    // prior launch() failure, finding #3) that installBridgeGame's success
    // path (`clearBridgeFailedThisSession(this.appId)`, games.ts) is
    // responsible for un-poisoning.
    markBridgeFailedThisSession(RETRY_APP_ID)
    clearBridgeFailedThisSession(RETRY_APP_ID)

    const game = new SteamGame(RETRY_APP_ID)
    const result = await game.install({} as any)

    // Reaching downloadSteamDepots (the bridge's own depot-download engine)
    // proves isBridgeEligible() was true for this appId — i.e. the earlier
    // bridgeFailedThisSession marking no longer applies.
    expect(downloadSteamDepots).toHaveBeenCalled()
    expect(result).toEqual({ status: 'done' })
  })

  it('a FAILED bridge install (depot download error) still marks bridge-failed and does NOT clear it — a subsequent install() for the same appId still routes to the bottled fallback', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValueOnce({
      status: 'error',
      error: 'depot download failed'
    })
    ;(tellBottledSteamToInstall as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID)
    const firstResult = await game.install({} as any)
    expect(firstResult).toEqual({
      status: 'error',
      error: 'depot download failed'
    })
    expect(placeShimForGame).not.toHaveBeenCalled()

    // A subsequent install() call for the SAME appId must stay routed to
    // the bottled fallback — the failure was never cleared.
    const secondGame = new SteamGame(APP_ID)
    const secondResult = await secondGame.install({} as any)
    expect(tellBottledSteamToInstall).toHaveBeenCalledWith(APP_ID)
    expect(secondResult).toEqual({ status: 'done' })
  })

  it('non-allowlisted bottle-eligible: install() takes the existing bottled path unchanged (regression)', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(tellBottledSteamToInstall as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(placeShimForGame).not.toHaveBeenCalled()
    expect(downloadSteamDepots).not.toHaveBeenCalled()
    expect(tellBottledSteamToInstall).toHaveBeenCalledWith(APP_ID)
    expect(result).toEqual({ status: 'done' })
  })

  it('BLOCKER 1: bridge bottle not ready — provisionBridgeBottle is called BEFORE any depot download; on success proceeds to depot download', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(false)
    ;(provisionBridgeBottle as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(provisionBridgeBottle).toHaveBeenCalled()
    expect(downloadSteamDepots).toHaveBeenCalled()
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      expect.objectContaining({ reason: 'bridge-bottle-provision-failed' })
    )
    expect(result).toEqual({ status: 'done' })
  })

  it('BLOCKER 1: bridge bottle provisioning FAILURE fires steamBridgeSetupRequired and returns deferredToSetup:true — no depot download attempted', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(false)
    ;(provisionBridgeBottle as jest.Mock).mockResolvedValue({
      status: 'error',
      error: 'cxbottle create failed'
    })

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(provisionBridgeBottle).toHaveBeenCalled()
    expect(downloadSteamDepots).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      {
        appName: APP_ID,
        reason: 'bridge-bottle-provision-failed',
        fallbackAvailable: true
      }
    )
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
  })

  it('isBridgeEligible() is false when the allowlist lacks the appId, even though the game is bottle-eligible', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(tellBottledSteamToInstall as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    expect(isBridgeBottleReady).not.toHaveBeenCalled()
    expect(tellBottledSteamToInstall).toHaveBeenCalledWith(APP_ID)
  })

  it('finding #3 (fallback bypass): after markBridgeFailedThisSession(appId), install() routes to the bottled path despite the appId being allowlisted + bottle-eligible', async () => {
    // A dedicated appId — never reused elsewhere in this file — so this
    // test's markBridgeFailedThisSession() mutation of the module-scoped
    // bridgeFailedThisSession Set cannot leak into any other test.
    const FALLBACK_TEST_APP_ID = '999999'
    library.set(FALLBACK_TEST_APP_ID, makeEntry({ title: 'Fallback Test' }))
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(tellBottledSteamToInstall as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    markBridgeFailedThisSession(FALLBACK_TEST_APP_ID)

    const game = new SteamGame(FALLBACK_TEST_APP_ID)
    const result = await game.install({} as any)

    expect(provisionBridgeBottle).not.toHaveBeenCalled()
    expect(downloadSteamDepots).not.toHaveBeenCalled()
    expect(tellBottledSteamToInstall).toHaveBeenCalledWith(
      FALLBACK_TEST_APP_ID
    )
    expect(result).toEqual({ status: 'done' })
  })
})

// ── 34.13-06 (D-17): SteamGame.install() Windows-via-bottle override ────────
//
// The regression trap this block exists to avoid (34.13-PLAN-OUTLINE.md note
// 2): installSteamGame() hardcodes platformToInstall: 'Windows' for EVERY
// Steam install, and the Steam backend reads that field nowhere. Every
// pre-existing install() spec in this file calls game.install({} as any) —
// an EMPTY args object, so {}.platformToInstall is undefined and those specs
// are structurally blind to a naive platformToInstall-keyed implementation:
// it would pass all of them while flipping every real mac-native install
// into the bottle. This block's baseline specs use PRODUCTION_ARGS
// (platformToInstall: 'Windows' present, matching every real Steam install)
// specifically to close that blind spot.
describe('SteamGame.install() — D-17 Windows-via-bottle override (34.13-06)', () => {
  let shellOpenExternal: jest.Mock
  let startInstallPollingSpy: jest.SpyInstance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  // Transcribed field-for-field from installSteamGame()'s window.api.install
  // literal (InstallGameModal.ts) — the production call shape for EVERY
  // Steam install. Deliberately carries NO steamForceWindowsViaBottle key;
  // argsWith() below is the only place a spec adds it.
  const PRODUCTION_ARGS: InstallParams = {
    appName: APP_ID,
    path: '',
    runner: 'steam',
    installDlcs: [],
    sdlList: [],
    installLanguage: 'en-US',
    platformToInstall: 'Windows',
    gameInfo: makeEntry()
  }

  function argsWith(overrides: Partial<InstallParams> = {}): InstallParams {
    return { ...PRODUCTION_ARGS, ...overrides }
  }

  /** Spies on all three private-method terminals install() can reach, each
   * resolving { status: 'done' } like a real success — so a spec only has
   * to name the ONE terminal it expects, via assertExactlyOneRoute(). */
  function spyOnAllTerminals(game: SteamGame): {
    installBridgeGame: jest.SpyInstance
    installBottleNative: jest.SpyInstance
    installNative: jest.SpyInstance
  } {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gameAny = game as any
    const installBridgeGame = jest
      .spyOn(gameAny, 'installBridgeGame')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValue({ status: 'done' } as any)
    const installBottleNative = jest
      .spyOn(gameAny, 'installBottleNative')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValue({ status: 'done' } as any)
    const installNative = jest
      .spyOn(gameAny, 'installNative')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValue({ status: 'done' } as any)
    return { installBridgeGame, installBottleNative, installNative }
  }

  type Terminal =
    | 'bridge'
    | 'deferred-to-setup'
    | 'bottle-native'
    | 'bottle-dispatch'
    | 'native-depot'
    | 'native-protocol'

  /** The load-bearing regression guard: asserts the ONE expected terminal
   * fired AND that none of the other five did. A helper that only checks
   * the positive terminal cannot catch a routing change that fires two
   * terminals, or the wrong one — the negative half is the entire point. */
  function assertExactlyOneRoute(
    expected: Terminal,
    terminals: ReturnType<typeof spyOnAllTerminals>
  ): void {
    const fired: Record<Terminal, boolean> = {
      bridge: terminals.installBridgeGame.mock.calls.length > 0,
      'bottle-native': terminals.installBottleNative.mock.calls.length > 0,
      'native-depot': terminals.installNative.mock.calls.length > 0,
      'bottle-dispatch':
        (tellBottledSteamToInstall as jest.Mock).mock.calls.length > 0,
      'native-protocol': shellOpenExternal.mock.calls.some(
        (call) => call[0] === `steam://install/${APP_ID}`
      ),
      'deferred-to-setup': (sendFrontendMessage as jest.Mock).mock.calls.some(
        (call) => call[0] === 'steamBottleSetupRequired'
      )
    }
    ;(Object.keys(fired) as Terminal[]).forEach((key) => {
      expect(fired[key]).toBe(key === expected)
    })
  }

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    startInstallPollingSpy = jest
      .spyOn(libraryModule, 'startInstallPolling')
      .mockImplementation(() => {})
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(isBottleReady as jest.Mock).mockReset()
    ;(tellBottledSteamToInstall as jest.Mock).mockReset()
    // Native-install ON/OFF is a routing axis in this block — every spec
    // sets it explicitly below rather than relying on resetMocks' implicit
    // undefined/false default, so it is never an accidental coupling.
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReset()
    ;(bridgeAllowlist.has as jest.Mock).mockReset()
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
  })

  // ── Override-ABSENT baseline: today's routing, byte-identical ───────────

  it('B1: macOS mac-native game with a proven Windows depot NOT chosen — native install() unchanged', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
    const terminals = spyOnAllTerminals(game)
    await game.install(PRODUCTION_ARGS)

    assertExactlyOneRoute('native-protocol', terminals)
  })

  it('B2: macOS not-yet-captured game — native install() unchanged (D-11 BLOCKER invariant)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: false,
      is_mac_native: false
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
    const terminals = spyOnAllTerminals(game)
    await game.install(PRODUCTION_ARGS)

    assertExactlyOneRoute('native-protocol', terminals)
  })

  it('B3: macOS bottle-eligible, provisioned — dispatches to the bottled Steam client', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(tellBottledSteamToInstall as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID)
    const terminals = spyOnAllTerminals(game)
    await game.install(PRODUCTION_ARGS)

    assertExactlyOneRoute('bottle-dispatch', terminals)
    expect(startInstallPollingSpy).toHaveBeenCalledWith(APP_ID, {
      source: 'bottle'
    })
  })

  it('B4: macOS bottle-eligible, un-provisioned — defers to guided setup', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(isBottleReady as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
    const terminals = spyOnAllTerminals(game)
    const result = await game.install(PRODUCTION_ARGS)

    assertExactlyOneRoute('deferred-to-setup', terminals)
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
  })

  it('B5: macOS bottle-eligible + allowlisted — routes to the bridge', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)

    const game = new SteamGame(APP_ID)
    const terminals = spyOnAllTerminals(game)
    await game.install(PRODUCTION_ARGS)

    assertExactlyOneRoute('bridge', terminals)
  })

  it('B6: macOS mac-native, native install opt-in ON — non-bottle depot-download opt-in unaffected', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
    const terminals = spyOnAllTerminals(game)
    await game.install(PRODUCTION_ARGS)

    assertExactlyOneRoute('native-depot', terminals)
  })

  it('B7: non-mac host — native install() unchanged regardless of eligibility signal', async () => {
    envMock.isMac = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
    const terminals = spyOnAllTerminals(game)
    await game.install(PRODUCTION_ARGS)

    assertExactlyOneRoute('native-protocol', terminals)
  })

  // ── Override-PRESENT positive routing ────────────────────────────────────

  it('F1: the headline D-17 behavior — mac-native + proven Windows depot + override → bottle dispatch', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(tellBottledSteamToInstall as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID)
    const terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))

    // Contrast with B1 above — the identical fixture minus the override,
    // which routes 'native-protocol'. F1 and B1 differ in exactly one key:
    // proof the override is the operative input, not the fixture shape.
    assertExactlyOneRoute('bottle-dispatch', terminals)
    expect(tellBottledSteamToInstall).toHaveBeenCalledWith(APP_ID)
    expect(startInstallPollingSpy).toHaveBeenCalledWith(APP_ID, {
      source: 'bottle'
    })
  })

  it('F2: D-15 preserved on the forced path — un-provisioned bottle still defers to guided setup', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(isBottleReady as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
    const terminals = spyOnAllTerminals(game)
    const result = await game.install(
      argsWith({ steamForceWindowsViaBottle: true })
    )

    assertExactlyOneRoute('deferred-to-setup', terminals)
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
  })

  it('F3: native install opt-in ON — a forced game depot-downloads into the BOTTLE, not the host', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)

    const game = new SteamGame(APP_ID)
    const terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))

    assertExactlyOneRoute('bottle-native', terminals)
  })

  it('F8: additive, never subtractive — an ALREADY bottle-eligible game with the override set is unchanged from B3', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(tellBottledSteamToInstall as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID)
    const terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))

    // The override is an OR; it can never remove a game from the bottle
    // path — this is byte-identical to B3's outcome.
    assertExactlyOneRoute('bottle-dispatch', terminals)
  })

  // ── Containment: a hostile or malformed override cannot reach the bottle ─

  it('F4: Deferred Idea — no proven Windows depot (is_windows_native: false) falls through, logged', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: false
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    const { logWarning } = jest.requireMock('backend/logger')

    const game = new SteamGame(APP_ID)
    const terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))

    assertExactlyOneRoute('native-protocol', terminals)
    expect(logWarning).toHaveBeenCalled()
  })

  it('F5: Deferred Idea — never-captured depot signal (is_windows_native absent) falls through', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
      // is_windows_native deliberately absent — the pre-34.13 cache-entry
      // shape every existing user has on upgrade. undefined and false are
      // distinct upgrade realities, kept as separate specs (F4/F5).
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)

    const game = new SteamGame(APP_ID)
    const terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))

    assertExactlyOneRoute('native-protocol', terminals)
  })

  it('F6: host containment — non-mac hosts (Linux and Windows) never reach the bottle even with a proven depot + override', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)

    // Pass 1: Linux host.
    envMock.isMac = false
    envMock.isLinux = true
    envMock.isWindows = false
    let game = new SteamGame(APP_ID)
    let terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))
    assertExactlyOneRoute('native-protocol', terminals)
    expect(tellBottledSteamToInstall).not.toHaveBeenCalled()

    // Pass 2: Windows host — both non-mac hosts covered, not one assumed
    // from the other.
    envMock.isMac = false
    envMock.isLinux = false
    envMock.isWindows = true
    game = new SteamGame(APP_ID)
    terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))
    assertExactlyOneRoute('native-protocol', terminals)
    expect(tellBottledSteamToInstall).not.toHaveBeenCalled()
  })

  it('F7: value contract — an explicit false override is byte-identical to B1 (only === true has any effect)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)

    const game = new SteamGame(APP_ID)
    const terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: false }))

    assertExactlyOneRoute('native-protocol', terminals)
  })

  it('F9: bridge non-interaction — a forced install never enters the Phase 24 bridge even when allowlisted', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    // isBridgeEligible() composes isBottleEligible(), which stays false for
    // a forced mac-native game — so the bridge branch is structurally
    // unreachable from the forced path even for an allowlisted title. This
    // is deliberate, not an oversight: the allowlist is curated for
    // confirmed-not-native titles and the bridge spawns a separate process.
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(tellBottledSteamToInstall as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID)
    const terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))

    assertExactlyOneRoute('bottle-dispatch', terminals)
    expect(terminals.installBridgeGame).not.toHaveBeenCalled()
  })
})

// ── D-17 forced-verdict durability (34.13-14) ────────────────────────────────
//
// 34.13-06 taught install() to honor args.steamForceWindowsViaBottle for a
// single install call — but never persisted the verdict, so getSettings(),
// isNative(), launch(), uninstall() and checkBottleEligibility() stayed
// unaware of a forced install after it returned (T-34.13-06-06). This block
// characterizes what "durable" means across all six consumers before any
// source is touched (Task 1), then Task 2 appends the write-discipline
// (W-series) specs once the persisted verdict and widened predicate exist.

describe('SteamGame — D-17 forced-verdict durability (34.13-14)', () => {
  let shellOpenExternal: jest.Mock
  let startUninstallPollingSpy: jest.SpyInstance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  /** A game whose persisted entry WAS forced into the bottle by a prior
   * successful D-17 override install (34.13-06) — the shape this plan makes
   * durable. */
  function forcedMeta(overrides: Record<string, unknown> = {}) {
    return {
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true,
      forcedWindowsViaBottle: true,
      ...overrides
    }
  }

  /** The pre-34.13 upgrade shape: the field has never existed on this cache
   * entry at all — deliberately does NOT set forcedWindowsViaBottle to any
   * value. `undefined` (absent) and `false` (explicit, see explicitFalseMeta
   * below) are different upgrade realities; a single merged fixture cannot
   * distinguish them. */
  function unforcedMeta(overrides: Record<string, unknown> = {}) {
    return {
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true,
      ...overrides
    }
  }

  /** A cache entry that explicitly stores forcedWindowsViaBottle: false —
   * pins that only === true re-routes; a stored false must never be treated
   * as a truthiness accident. */
  function explicitFalseMeta(overrides: Record<string, unknown> = {}) {
    return {
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true,
      forcedWindowsViaBottle: false,
      ...overrides
    }
  }

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    startUninstallPollingSpy = jest
      .spyOn(libraryModule, 'startUninstallPolling')
      .mockImplementation(() => {})
    // Routing axes for this block — reset explicitly per spec rather than
    // relying on resetMocks' implicit undefined/false default.
    ;(isBottleReady as jest.Mock).mockReset()
    ;(tellBottledSteamToLaunch as jest.Mock).mockReset()
    ;(tellBottledSteamToUninstall as jest.Mock).mockReset()
    ;(getSteamBottleSettings as jest.Mock).mockReset()
    ;(bridgeAllowlist.has as jest.Mock).mockReset().mockReturnValue(false)
  })

  afterEach(() => {
    startUninstallPollingSpy.mockRestore()
  })

  // ── D1-D6: durability discriminators, all against forcedMeta() ──────────

  it('D1: getSettings() resolves the bottle settings for a forced game, never GameConfig.get', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())
    const bottleSettings = { wineCrossoverBottle: 'GameLibSteam' }
    ;(getSteamBottleSettings as jest.Mock).mockReturnValue(bottleSettings)
    const gameConfigGetMock = jest.requireMock('backend/game_config')
      .GameConfig.get as jest.Mock
    gameConfigGetMock.mockClear()

    const game = new SteamGame(APP_ID)
    const settings = await game.getSettings()

    expect(settings).toBe(bottleSettings)
    expect(gameConfigGetMock).not.toHaveBeenCalled()
  })

  it('D2: isNative() is false for a forced game — launcher.ts must run checkWineBeforeLaunch', () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())
    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(false)
  })

  it('D3: launch() dispatches to the bottled Steam client, never steam://rungameid', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(tellBottledSteamToLaunch as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID)
    const result = await game.launch({} as any)

    expect(tellBottledSteamToLaunch).toHaveBeenCalledWith(APP_ID)
    // The load-bearing negative half: steam://rungameid reaching the host
    // Steam client is the exact defect T-34.13-06-06 closes.
    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toBe(true)
  })

  it('D4 (debug/steam-bottle-uninstall-reverts FINAL): uninstall() routes a forced-bottle game to direct deletion — never tellBottledSteamToUninstall, never steam://uninstall', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(getSteamBottleSettings as jest.Mock).mockReturnValue({
      wineCrossoverBottle: 'GameLibSteam'
    })
    ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(
      '/mock/bottle/steamapps'
    )
    // debug/steam-bottle-uninstall-reverts (routing fix): the library
    // entry's own install_path is now the routing source of truth.
    library.set(
      APP_ID,
      makeEntry({
        title: 'Dota 2',
        install: { install_path: '/mock/bottle/steamapps/common/Dota 2' }
      })
    )
    const readAcfStateSpy = jest
      .spyOn(libraryModule, 'readAcfState')
      .mockResolvedValue({
        state: 'installed',
        installPath: '/mock/bottle/steamapps/common/Dota 2'
      })
    const pollUninstallOnceSpy = jest
      .spyOn(libraryModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)

    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(readAcfStateSpy).toHaveBeenCalledWith(APP_ID, 'bottle')
    expect(pollUninstallOnceSpy).toHaveBeenCalledWith(APP_ID, 'bottle')
    // The delegated path's own bottle-scoped poller is never started —
    // direct deletion completes synchronously via pollUninstallOnce above.
    expect(startUninstallPollingSpy).not.toHaveBeenCalled()

    readAcfStateSpy.mockRestore()
    pollUninstallOnceSpy.mockRestore()
  })

  // D5 is split into two independent specs (launch/uninstall halves) rather
  // than one `it()` with two assertions, so a mutation that only breaks ONE
  // half is observable in the test report instead of being masked by jest
  // stopping at the first failing expectation inside a single test.

  it('D5a: a forced+allowlisted game never enters the Phase 24 bridge on launch() — currently a VACUOUS pass, see Task 2', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(tellBottledSteamToLaunch as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    // The forced bits live in the Phase 17 GameLibSteam bottle; the Phase 24
    // GameLibSteamBridge bottle is a different filesystem root that has
    // never held them — bridging a forced+allowlisted title would swap one
    // broken launch for another, not fix anything.
    //
    // VACUITY (pre-Task-2): isBridgeEligible() composes isBottleEligible(),
    // which is false for this mac-native fixture until Task 2 persists the
    // forced verdict — so the entire bottle block (bridge sub-check
    // included) is unreachable and this spy is never called for the wrong
    // reason (nothing routes there at all, not because containment
    // engaged). Task 2 re-proves this non-vacuously by reverting the bridge
    // pin and observing this spec fail.
    const launchGame = new SteamGame(APP_ID)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const launchBridgeSpy = jest
      .spyOn(launchGame as any, 'launchBridgeGame')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValue(true as any)
    await launchGame.launch({} as any)
    expect(launchBridgeSpy).not.toHaveBeenCalled()
  })

  it('D5b: a forced+allowlisted game never enters the Phase 24 bridge on uninstall() — currently a VACUOUS pass, see Task 2', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(tellBottledSteamToUninstall as jest.Mock).mockResolvedValue({
      status: 'done'
    })
    // debug/steam-bottle-uninstall-reverts FINAL: uninstall() now always
    // reaches uninstallBottleGameDirectly()'s readAcfState('bottle') call
    // (never tellBottledSteamToUninstall), which unconditionally resolves
    // getSteamBottleSettings() before it can even determine the manifest is
    // absent — needs a return value here or the real (unmocked)
    // readAcfState throws destructuring undefined.
    ;(getSteamBottleSettings as jest.Mock).mockReturnValue({
      wineCrossoverBottle: 'GameLibSteam'
    })

    // Same rationale as D5a, mirrored for the uninstall() bridge sub-check
    // — the bridge composition is consulted independently by each caller.
    const uninstallGame = new SteamGame(APP_ID)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uninstallBridgeSpy = jest
      .spyOn(uninstallGame as any, 'uninstallBridgeGame')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValue({ stdout: '', stderr: '' } as any)
    await uninstallGame.uninstall({} as any)
    expect(uninstallBridgeSpy).not.toHaveBeenCalled()
  })

  it('D6: checkBottleEligibility() resolves true for a forced game', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())
    const game = new SteamGame(APP_ID)
    await expect(game.checkBottleEligibility()).resolves.toBe(true)
  })

  // ── N1-N3: fail-safe baselines — must pass BEFORE and AFTER Task 2 ───────

  it('N1: absent flag (pre-34.13 upgrade shape) routes exactly as it does today', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(unforcedMeta())
    const gameConfigGetMock = jest.requireMock('backend/game_config')
      .GameConfig.get as jest.Mock
    gameConfigGetMock.mockReturnValue({
      config: undefined,
      getSettings: jest.fn().mockResolvedValue({ autoSyncSaves: false })
    })

    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(true)
    await game.getSettings()
    expect(gameConfigGetMock).toHaveBeenCalledWith(APP_ID)

    const launchResult = await game.launch({} as any)
    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://rungameid/${APP_ID}`,
      { activate: false }
    )
    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
    expect(launchResult).toBe(true)

    // debug/steam-bottle-uninstall-reverts (routing fix): the library
    // entry's own install_path is now the routing source of truth — give it
    // one resolving inside a mocked native library for the uninstall() half.
    // resolveInstallRoot() also consults the bottle root first (isMac=true
    // in this describe) — production getSteamBottleSettings() always
    // returns a valid object, so mock it the same way rather than leave it
    // unmocked-undefined.
    library.set(
      APP_ID,
      makeEntry({
        title: 'Dota 2',
        install: { install_path: NATIVE_INSTALL_PATH }
      })
    )
    ;(getSteamLibraries as jest.Mock).mockResolvedValue([NATIVE_LIBRARY_ROOT])
    ;(getSteamBottleSettings as jest.Mock).mockReturnValue({
      wineCrossoverBottle: 'GameLibSteam'
    })
    ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(
      '/mock/bottle/steamapps'
    )

    shellOpenExternal.mockClear()
    await game.uninstall({} as any)
    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://uninstall/${APP_ID}`
    )
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
  })

  it('N2: explicit false is byte-identical to N1 — only === true re-routes', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(explicitFalseMeta())

    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(true)

    await game.launch({} as any)
    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://rungameid/${APP_ID}`,
      { activate: false }
    )
    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
  })

  it('N3: a persisted flag can never resurrect a bottle path on a non-mac host (D-18)', async () => {
    envMock.isMac = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())

    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(true)

    await game.launch({} as any)
    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://rungameid/${APP_ID}`,
      { activate: false }
    )
    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
  })

  // ── W1-W7: write discipline — the verdict is written ONLY on a committed
  // forced install, and survives a metadata re-fetch (Task 2) ─────────────

  describe('write discipline (W1-W7)', () => {
    // Transcribed field-for-field from 34.13-06's own local copy (which is
    // itself transcribed from installSteamGame()'s window.api.install
    // literal) — deliberately re-declared here rather than imported across
    // describes, per this plan's own instruction.
    const PRODUCTION_ARGS: InstallParams = {
      appName: APP_ID,
      path: '',
      runner: 'steam',
      installDlcs: [],
      sdlList: [],
      installLanguage: 'en-US',
      platformToInstall: 'Windows',
      gameInfo: makeEntry()
    }

    function argsWith(overrides: Partial<InstallParams> = {}): InstallParams {
      return { ...PRODUCTION_ARGS, ...overrides }
    }

    /** Stateful steamMetadataStore double — .get() reflects the last .set()
     * call, so a write-discipline spec can inspect the FINAL persisted
     * entry after install() returns, not just whether .set() was called
     * (a bare-set implementation could call .set() and still fail the
     * neighboring-field-survival assertion in W1). Shape lifted from the
     * ensurePlatformsCaptured/checkBottleEligibility describes' local copy
     * — not imported across describes, per this plan's own instruction. */
    function mockStatefulMetadataStore(initial: Record<string, unknown>) {
      let state: Record<string, unknown> | undefined = initial
      ;(steamMetadataStore.get as jest.Mock).mockImplementation(() => state)
      ;(steamMetadataStore.set as jest.Mock).mockImplementation(
        (_id, meta) => {
          state = meta
        }
      )
    }

    let startInstallPollingSpy: jest.SpyInstance

    beforeEach(() => {
      startInstallPollingSpy = jest
        .spyOn(libraryModule, 'startInstallPolling')
        .mockImplementation(() => {})
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReset()
    })

    afterEach(() => {
      startInstallPollingSpy.mockRestore()
    })

    it('W1: dispatch terminal (bottled-Steam client accepts) persists the flag AND survives neighboring fields', async () => {
      mockStatefulMetadataStore({
        art_cover: 'https://cdn/570/header.jpg',
        art_square: 'https://cdn/570/library_600x900.jpg',
        extra: { reqs: [] },
        platformsCaptured: true,
        is_mac_native: true,
        is_windows_native: true
      })
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
      ;(isBottleReady as jest.Mock).mockReturnValue(true)
      ;(tellBottledSteamToInstall as jest.Mock).mockResolvedValue({
        status: 'done'
      })

      const game = new SteamGame(APP_ID)
      await game.install(argsWith({ steamForceWindowsViaBottle: true }))

      const stored = steamMetadataStore.get(APP_ID) as unknown as Record<
        string,
        unknown
      >
      expect(stored.forcedWindowsViaBottle).toBe(true)
      // T-18-02-04 guard: a bare-set implementation would wipe these.
      expect(stored.art_cover).toBe('https://cdn/570/header.jpg')
      expect(stored.art_square).toBe('https://cdn/570/library_600x900.jpg')
      expect(stored.extra).toEqual({ reqs: [] })
      expect(stored.platformsCaptured).toBe(true)
    })

    it('W2: depot terminal (native install opt-in ON) persists the flag', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: true,
        is_windows_native: true
      })
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
      ;(isBottleReady as jest.Mock).mockReturnValue(true)

      const game = new SteamGame(APP_ID)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(game as any, 'installBottleNative')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValue({ status: 'done' } as any)

      await game.install(argsWith({ steamForceWindowsViaBottle: true }))

      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            forcedWindowsViaBottle?: boolean
          }
        )?.forcedWindowsViaBottle
      ).toBe(true)
    })

    it('W3: depot terminal failure persists nothing', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: true,
        is_windows_native: true
      })
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
      ;(isBottleReady as jest.Mock).mockReturnValue(true)

      const game = new SteamGame(APP_ID)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(game as any, 'installBottleNative')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValue({ status: 'error', error: 'boom' } as any)

      await game.install(argsWith({ steamForceWindowsViaBottle: true }))

      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            forcedWindowsViaBottle?: boolean
          }
        )?.forcedWindowsViaBottle
      ).not.toBe(true)
    })

    it('W4: deferred-to-setup (bottle not provisioned) persists nothing — status:"done" here is NOT a success signal', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: true,
        is_windows_native: true
      })
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
      ;(isBottleReady as jest.Mock).mockReturnValue(false)

      const game = new SteamGame(APP_ID)
      const result = await game.install(
        argsWith({ steamForceWindowsViaBottle: true })
      )

      expect(result).toEqual({ status: 'done', deferredToSetup: true })
      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            forcedWindowsViaBottle?: boolean
          }
        )?.forcedWindowsViaBottle
      ).not.toBe(true)
    })

    it('W5: a rejected bottled-Steam dispatch persists nothing (the WR-01 guard returns first)', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: true,
        is_windows_native: true
      })
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
      ;(isBottleReady as jest.Mock).mockReturnValue(true)
      ;(tellBottledSteamToInstall as jest.Mock).mockResolvedValue({
        status: 'error',
        error: 'nope'
      })

      const game = new SteamGame(APP_ID)
      await game.install(argsWith({ steamForceWindowsViaBottle: true }))

      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            forcedWindowsViaBottle?: boolean
          }
        )?.forcedWindowsViaBottle
      ).not.toBe(true)
    })

    it('W6: override absent — an ordinarily bottle-eligible game persists NO flag (it never needed one)', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: false
      })
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
      ;(isBottleReady as jest.Mock).mockReturnValue(true)
      ;(tellBottledSteamToInstall as jest.Mock).mockResolvedValue({
        status: 'done'
      })

      const game = new SteamGame(APP_ID)
      await game.install(PRODUCTION_ARGS)

      expect(tellBottledSteamToInstall).toHaveBeenCalledWith(APP_ID)
      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            forcedWindowsViaBottle?: boolean
          }
        )?.forcedWindowsViaBottle
      ).not.toBe(true)
    })

    it('W7: the persisted verdict survives a subsequent appdetails re-fetch (no T-18-02-04 silent drop)', async () => {
      mockStatefulMetadataStore({
        art_cover: '',
        art_square: '',
        extra: { reqs: [] },
        platformsCaptured: true,
        is_mac_native: true,
        is_windows_native: true,
        forcedWindowsViaBottle: true
      })
      ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
      // art_cover:'' (from makeEntry's default) triggers getGameInfo()'s own
      // fire-and-forget fetchMetadataIfNeeded — the SAME re-fetch trigger
      // LIB-04's specs already exercise, not a synthetic direct call.
      library.set(APP_ID, makeEntry())

      new SteamGame(APP_ID).getGameInfo()
      await flushAsync()

      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            forcedWindowsViaBottle?: boolean
          }
        )?.forcedWindowsViaBottle
      ).toBe(true)
    })

    // ── debug/steam-bottle-uninstall-reverts: nativeBottleInstall write
    // discipline — mirrors W2/W6/W7 above, but for a flag set on EVERY
    // committed installBottleNative() completion, not gated on the D-17
    // override.

    it('NBI-1: an ordinary (non-forced) bottle-eligible install via installBottleNative persists nativeBottleInstall:true', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: false
      })
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
      ;(isBottleReady as jest.Mock).mockReturnValue(true)

      const game = new SteamGame(APP_ID)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(game as any, 'installBottleNative')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValue({ status: 'done' } as any)

      // No steamForceWindowsViaBottle override — an ordinary bottle-eligible
      // (mac-incompatible) title with the native-install setting on.
      await game.install(PRODUCTION_ARGS)

      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            nativeBottleInstall?: boolean
            forcedWindowsViaBottle?: boolean
          }
        )?.nativeBottleInstall
      ).toBe(true)
      // W6 pin still holds: no override means no forcedWindowsViaBottle.
      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            forcedWindowsViaBottle?: boolean
          }
        )?.forcedWindowsViaBottle
      ).not.toBe(true)
    })

    it('NBI-2: a failed installBottleNative() persists no nativeBottleInstall flag', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: false
      })
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
      ;(isBottleReady as jest.Mock).mockReturnValue(true)

      const game = new SteamGame(APP_ID)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(game as any, 'installBottleNative')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValue({ status: 'error', error: 'boom' } as any)

      await game.install(PRODUCTION_ARGS)

      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            nativeBottleInstall?: boolean
          }
        )?.nativeBottleInstall
      ).not.toBe(true)
    })

    it('NBI-3: legacy tellBottledSteamToInstall delegation (opt-in OFF) persists no nativeBottleInstall flag', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: false
      })
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
      ;(isBottleReady as jest.Mock).mockReturnValue(true)
      ;(tellBottledSteamToInstall as jest.Mock).mockResolvedValue({
        status: 'done'
      })

      const game = new SteamGame(APP_ID)
      await game.install(PRODUCTION_ARGS)

      expect(tellBottledSteamToInstall).toHaveBeenCalledWith(APP_ID)
      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            nativeBottleInstall?: boolean
          }
        )?.nativeBottleInstall
      ).not.toBe(true)
    })

    it('NBI-4: the persisted nativeBottleInstall verdict survives a subsequent appdetails re-fetch (no T-18-02-04 silent drop)', async () => {
      mockStatefulMetadataStore({
        art_cover: '',
        art_square: '',
        extra: { reqs: [] },
        platformsCaptured: true,
        is_mac_native: false,
        nativeBottleInstall: true
      })
      ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
      library.set(APP_ID, makeEntry())

      new SteamGame(APP_ID).getGameInfo()
      await flushAsync()

      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            nativeBottleInstall?: boolean
          }
        )?.nativeBottleInstall
      ).toBe(true)
    })
  })
})

// ── Phase 17 Plan 09 (MACSTEAM-04 gap closure): ensurePlatformsCaptured() ────
//
// Closes UAT GAP 2: on macOS, an uncaptured Windows-only game's Install/Play
// previously fell through to native steam:// with no guided-setup dialog
// because isBottleEligible() required platformsCaptured===true, which was
// only ever set by a throttled fire-and-forget fetch. install()/launch()/
// uninstall() now await ensurePlatformsCaptured() BEFORE consulting the gate.

describe('SteamGame.install() ensurePlatformsCaptured() — Phase 17 Plan 09 (MACSTEAM-04)', () => {
  let shellOpenExternal: jest.Mock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  /** Windows-only appdetails fixture (mac:false) — the confirmed-not-native case. */
  const windowsOnlyFixture = {
    data: {
      [APP_ID]: {
        success: true,
        data: {
          name: 'Windows Only Game',
          short_description: '',
          platforms: { windows: true, mac: false, linux: false },
          genres: []
        }
      }
    }
  }

  /** Native-Mac appdetails fixture (mac:true). */
  const macNativeFixture = {
    data: {
      [APP_ID]: {
        success: true,
        data: {
          name: 'Mac Native Game',
          short_description: '',
          platforms: { windows: true, mac: true, linux: false },
          genres: []
        }
      }
    }
  }

  /**
   * Stateful steamMetadataStore double — .get() reflects the last .set() call
   * (unlike a static mockReturnValue), so ensurePlatformsCaptured's bounded
   * poll can actually observe the in-flight fetch resolving platformsCaptured,
   * mirroring how the real electron-store behaves.
   */
  function mockStatefulMetadataStore(initial: Record<string, unknown>) {
    let state: Record<string, unknown> | undefined = initial
    ;(steamMetadataStore.get as jest.Mock).mockImplementation(() => state)
    ;(steamMetadataStore.set as jest.Mock).mockImplementation((_id, meta) => {
      state = meta
    })
  }

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(APP_ID, makeEntry({ title: 'Windows Only Game' }))
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(isBottleReady as jest.Mock).mockReset()
  })

  afterEach(() => {
    // Explicit reset (do not rely on test-order discipline in later describes).
    envMock.isMac = false
  })

  it('platformsCaptured-uncaptured macOS install does NOT fall through to native — forces a synchronous capture and routes to guided setup', async () => {
    mockStatefulMetadataStore({ platformsCaptured: undefined })
    ;(axios.get as jest.Mock).mockResolvedValue(windowsOnlyFixture)
    ;(isBottleReady as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(axios.get).toHaveBeenCalled()
    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith('steamBottleSetupRequired', {
      appName: APP_ID
    })
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
  })

  it('native-Mac game routes native after capture — install() calls shell.openExternal once platforms resolve is_mac_native:true', async () => {
    mockStatefulMetadataStore({ platformsCaptured: undefined })
    ;(axios.get as jest.Mock).mockResolvedValue(macNativeFixture)

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(axios.get).toHaveBeenCalled()
    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
    expect(result).toEqual({ status: 'done' })
  })

  it('non-macOS install skips platform capture — axios.get is NOT called by ensurePlatformsCaptured, native path used unchanged', async () => {
    envMock.isMac = false
    mockStatefulMetadataStore({ platformsCaptured: undefined })

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(axios.get).not.toHaveBeenCalled()
    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
    expect(result).toEqual({ status: 'done' })
  })

  it('already-captured game skips the fetch — no redundant network on the hot path', async () => {
    mockStatefulMetadataStore({ platformsCaptured: true, is_mac_native: false })
    ;(isBottleReady as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    expect(axios.get).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith('steamBottleSetupRequired', {
      appName: APP_ID
    })
  })
})

// ── D-09: SteamGame.checkBottleEligibility() — backend-authoritative verdict ─

describe('SteamGame.checkBottleEligibility() — D-09 backend-authoritative verdict', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  /** Windows-only appdetails fixture (mac:false) — the confirmed-not-native case. */
  const windowsOnlyFixture = {
    data: {
      [APP_ID]: {
        success: true,
        data: {
          name: 'Windows Only Game',
          short_description: '',
          platforms: { windows: true, mac: false, linux: false },
          genres: []
        }
      }
    }
  }

  /** Native-Mac appdetails fixture (mac:true). */
  const macNativeFixture = {
    data: {
      [APP_ID]: {
        success: true,
        data: {
          name: 'Mac Native Game',
          short_description: '',
          platforms: { windows: true, mac: true, linux: false },
          genres: []
        }
      }
    }
  }

  /**
   * Stateful steamMetadataStore double — .get() reflects the last .set() call
   * (unlike a static mockReturnValue), so ensurePlatformsCaptured's bounded
   * poll can actually observe the in-flight fetch resolving platformsCaptured,
   * mirroring how the real electron-store behaves.
   */
  function mockStatefulMetadataStore(initial: Record<string, unknown>) {
    let state: Record<string, unknown> | undefined = initial
    ;(steamMetadataStore.get as jest.Mock).mockImplementation(() => state)
    ;(steamMetadataStore.set as jest.Mock).mockImplementation((_id, meta) => {
      state = meta
    })
  }

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    library.set(APP_ID, makeEntry({ title: 'Windows Only Game' }))
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
  })

  afterEach(() => {
    envMock.isMac = false
  })

  it('cold cache + Windows-only game resolves true AND actually performs the capture', async () => {
    mockStatefulMetadataStore({ platformsCaptured: undefined })
    ;(axios.get as jest.Mock).mockResolvedValue(windowsOnlyFixture)

    const result = await new SteamGame(APP_ID).checkBottleEligibility()

    expect(result).toBe(true)
    expect(axios.get).toHaveBeenCalled()
  })

  it('cold cache + mac-native game resolves false', async () => {
    mockStatefulMetadataStore({ platformsCaptured: undefined })
    ;(axios.get as jest.Mock).mockResolvedValue(macNativeFixture)

    const result = await new SteamGame(APP_ID).checkBottleEligibility()

    expect(result).toBe(false)
  })

  it('already-captured entry resolves true with no redundant network', async () => {
    mockStatefulMetadataStore({ platformsCaptured: true, is_mac_native: false })

    const result = await new SteamGame(APP_ID).checkBottleEligibility()

    expect(result).toBe(true)
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('non-macOS resolves false without touching the network', async () => {
    envMock.isMac = false
    mockStatefulMetadataStore({ platformsCaptured: undefined })

    const result = await new SteamGame(APP_ID).checkBottleEligibility()

    expect(result).toBe(false)
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('MAC32-02: a confirmed-32 mac build resolves true through the wrapper', async () => {
    mockStatefulMetadataStore({
      platformsCaptured: true,
      is_mac_native: true,
      mac_arch: '32'
    })

    const result = await new SteamGame(APP_ID).checkBottleEligibility()

    expect(result).toBe(true)
  })
})

// ── GAME-03: SteamGame.uninstall() ───────────────────────────────────────────

describe('SteamGame.uninstall() — GAME-03', () => {
  let shellOpenExternal: jest.Mock
  let notifyMock: jest.Mock
  let showDialogBoxModalAutoMock: jest.Mock
  let startUninstallPollingSpy: jest.SpyInstance

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    notifyMock = jest.requireMock('backend/dialog/dialog').notify as jest.Mock
    showDialogBoxModalAutoMock = jest.requireMock('backend/dialog/dialog')
      .showDialogBoxModalAuto as jest.Mock
    library.set(
      APP_ID,
      makeEntry({
        title: 'Dota 2',
        is_installed: true,
        install: { install_path: NATIVE_INSTALL_PATH }
      })
    )
    ;(getSteamLibraries as jest.Mock).mockResolvedValue([NATIVE_LIBRARY_ROOT])
    // Spy on startUninstallPolling so uninstall() can call it without running the real poller
    startUninstallPollingSpy = jest
      .spyOn(libraryModule, 'startUninstallPolling')
      .mockImplementation(() => {})
  })

  afterEach(() => {
    startUninstallPollingSpy.mockRestore()
  })

  it('GAME-03: uninstall() calls shell.openExternal with steam://uninstall/{appId}', async () => {
    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)

    expect(shellOpenExternal).toHaveBeenCalledTimes(1)
    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://uninstall/${APP_ID}`
    )
  })

  it('GAME-03: uninstall() resolves an ExecResult { stdout, stderr }', async () => {
    const game = new SteamGame(APP_ID)
    const result = await game.uninstall({} as any)

    expect(result).toEqual(expect.objectContaining({ stdout: '', stderr: '' }))
  })

  it('D-07: uninstall() calls startUninstallPolling with this.appId after successful openExternal', async () => {
    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)
    expect(startUninstallPollingSpy).toHaveBeenCalledWith(APP_ID)
  })

  it('D-07: uninstall() does NOT call startUninstallPolling when appId is non-numeric (T-03-01 guard)', async () => {
    const badGame = new SteamGame('abc')
    library.set(
      'abc',
      makeEntry({ app_name: 'abc', title: 'BadGame', is_installed: true })
    )
    await badGame.uninstall({} as any)
    expect(startUninstallPollingSpy).not.toHaveBeenCalled()
  })

  it('uninstall() does NOT show a hand-off toast (toast feature removed)', async () => {
    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)

    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('D-05: uninstall() does NOT show a GamerLib confirmation dialog', async () => {
    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)

    // Steam shows its own confirm dialog — GamerLib must not add a second one
    expect(showDialogBoxModalAutoMock).not.toHaveBeenCalled()
  })

  it('D-01/D-02: uninstall() does NOT call sendFrontendMessage (no optimistic flip, reconcile on focus)', async () => {
    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)

    // Badge state is reconciled only after the focus ACF re-read, never assumed from click
    expect(sendFrontendMessage).not.toHaveBeenCalled()
  })
})

// ── Phase 17 (D-10/D-11): SteamGame.uninstall() bottle routing ──────────────

describe('SteamGame.uninstall() — Phase 17 bottle routing (D-10/D-11)', () => {
  let shellOpenExternal: jest.Mock
  let startUninstallPollingSpy: jest.SpyInstance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(
      APP_ID,
      makeEntry({
        title: 'Dota 2',
        is_installed: true,
        install: { install_path: NATIVE_INSTALL_PATH }
      })
    )
    ;(getSteamLibraries as jest.Mock).mockResolvedValue([NATIVE_LIBRARY_ROOT])
    startUninstallPollingSpy = jest
      .spyOn(libraryModule, 'startUninstallPolling')
      .mockImplementation(() => {})
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(isBottleReady as jest.Mock).mockReset()
    ;(tellBottledSteamToUninstall as jest.Mock).mockReset()
    // debug/steam-bottle-uninstall-reverts (routing fix): resolveInstallRoot()
    // always consults the bottle root first on mac (isMac=true here for every
    // test in this describe, including the native-routing ones) — production
    // getSteamBottleSettings() always returns a valid object (falls back to
    // DEFAULT_STEAM_BOTTLE_NAME), so mock it the same way here rather than
    // leave it unmocked-undefined.
    ;(getSteamBottleSettings as jest.Mock).mockReturnValue({
      wineCrossoverBottle: 'GameLibSteam'
    })
    ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(
      '/mock/bottle/steamapps'
    )
  })

  afterEach(() => {
    startUninstallPollingSpy.mockRestore()
  })

  // NOTE (debug/steam-bottle-uninstall-reverts FINAL): the former
  // "bottle-eligible + provisioned: uninstall() calls
  // tellBottledSteamToUninstall" test used to live here. That routing is
  // retired — EVERY bottle-eligible + provisioned title now uninstalls via
  // direct deletion, never tellBottledSteamToUninstall. That behavior is
  // now fully covered (with the readAcfState/pollUninstallOnce spies it
  // needs) by the "direct deletion for ALL bottle-eligible titles" describe
  // block below, so it is not duplicated here.

  it('bottle-eligible + un-provisioned: uninstall() does NOT call shell.openExternal and emits steamBottleSetupRequired', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isBottleReady as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBottleSetupRequired',
      { appName: APP_ID }
    )
  })

  it('D-10/scope-fence: NON-eligible (Mac-native) — uninstall() STILL calls shell.openExternal with steam://uninstall/<appId> (native path unchanged)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })

    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://uninstall/${APP_ID}`
    )
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
  })

  it('D-11: NOT-yet-captured macOS game — uninstall() STILL takes the native path', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: false,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://uninstall/${APP_ID}`
    )
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
  })

  it('D-10/scope-fence: NON-eligible (non-mac) — uninstall() STILL calls shell.openExternal', async () => {
    envMock.isMac = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://uninstall/${APP_ID}`
    )
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
  })
})

// ── debug/steam-bottle-uninstall-reverts (FINAL): direct deletion for ALL
// bottle-eligible, non-bridge titles — delegating uninstall to the bottled
// Steam client's own confirm dialog was PROVEN architecturally unworkable
// in this CrossOver bottle for every bottle title (CW_USEDEFAULT
// off-screen-window defect), not only GameLib-authored
// (installBottleNative, D-15/SNI-08) ones. uninstall() therefore routes
// EVERY bottle-eligible, non-bridge title to uninstallBottleGameDirectly()
// UNCONDITIONALLY now — the nativeBottleInstall flag no longer changes
// routing (see games.ts JSDoc; the flag itself is kept as provenance-only
// metadata).

describe('SteamGame.uninstall() — direct deletion for ALL bottle-eligible titles (debug/steam-bottle-uninstall-reverts FINAL)', () => {
  let shellOpenExternal: jest.Mock
  let startUninstallPollingSpy: jest.SpyInstance
  let readAcfStateSpy: jest.SpyInstance
  let pollUninstallOnceSpy: jest.SpyInstance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  // Steam-authored installdir (Hoard, appId 63000) — deliberately NOT an
  // 'app_<id>' GameLib-authored name, proving the naming-convention
  // generalization: installRoot is derived purely from the ACF's own
  // on-disk installdir, never FALLBACK_INSTALLDIR_PREFIX.
  const INSTALL_PATH = '/mock/bottle/steamapps/common/Hoard'

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    // debug/steam-bottle-uninstall-reverts (routing fix): uninstall() now
    // routes off the library entry's own install.install_path (never title
    // attributes) — give it one that resolves inside the bottle root by
    // default so this describe's existing tests keep exercising
    // uninstallBottleGameDirectly(). The ACF-level installPath (what
    // readAcfStateSpy controls per-test) is a SEPARATE value, answering a
    // different question — see uninstallBottleGameDirectly()'s own JSDoc.
    library.set(
      APP_ID,
      makeEntry({
        title: 'Hoard',
        is_installed: true,
        install: { install_path: INSTALL_PATH }
      })
    )
    startUninstallPollingSpy = jest
      .spyOn(libraryModule, 'startUninstallPolling')
      .mockImplementation(() => {})
    readAcfStateSpy = jest.spyOn(libraryModule, 'readAcfState')
    pollUninstallOnceSpy = jest
      .spyOn(libraryModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(isBottleReady as jest.Mock).mockReset().mockReturnValue(true)
    ;(tellBottledSteamToUninstall as jest.Mock).mockReset()
    ;(bridgeAllowlist.has as jest.Mock).mockReset().mockReturnValue(false)
    ;(getSteamBottleSettings as jest.Mock).mockReturnValue({
      wineCrossoverBottle: 'GameLibSteam'
    })
    ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(
      '/mock/bottle/steamapps'
    )
  })

  afterEach(() => {
    startUninstallPollingSpy.mockRestore()
    readAcfStateSpy.mockRestore()
    pollUninstallOnceSpy.mockRestore()
  })

  it('nativeBottleInstall:true (GameLib-authored install) routes to direct deletion — never dispatches to the bottled Steam client', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      nativeBottleInstall: true
    })
    readAcfStateSpy.mockResolvedValue({
      state: 'installed',
      installPath: INSTALL_PATH
    })

    const game = new SteamGame(APP_ID)
    const result = await game.uninstall({} as any)

    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(startUninstallPollingSpy).not.toHaveBeenCalled()
    expect(readAcfStateSpy).toHaveBeenCalledWith(APP_ID, 'bottle')
    // Reuses the SAME confirmed-absent completion pipeline the delegated
    // path's own poller uses — badge flip/persist/notify/flag-clear.
    expect(pollUninstallOnceSpy).toHaveBeenCalledWith(APP_ID, 'bottle')
    expect(result).toEqual({ stdout: '', stderr: '' })
  })

  it('nativeBottleInstall:false (explicit — legacy-delegated/Steam-authored install, e.g. Hoard) ALSO routes to direct deletion — routing no longer depends on this flag', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      nativeBottleInstall: false
    })
    readAcfStateSpy.mockResolvedValue({
      state: 'installed',
      installPath: INSTALL_PATH
    })

    const game = new SteamGame(APP_ID)
    const result = await game.uninstall({} as any)

    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(readAcfStateSpy).toHaveBeenCalledWith(APP_ID, 'bottle')
    expect(pollUninstallOnceSpy).toHaveBeenCalledWith(APP_ID, 'bottle')
    expect(result).toEqual({ stdout: '', stderr: '' })
  })

  it('nativeBottleInstall absent (never set — pre-fix cache entry) ALSO routes to direct deletion — no title ever falls through to tellBottledSteamToUninstall anymore', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    readAcfStateSpy.mockResolvedValue({
      state: 'installed',
      installPath: INSTALL_PATH
    })

    const game = new SteamGame(APP_ID)
    const result = await game.uninstall({} as any)

    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(readAcfStateSpy).toHaveBeenCalledWith(APP_ID, 'bottle')
    expect(pollUninstallOnceSpy).toHaveBeenCalledWith(APP_ID, 'bottle')
    expect(result).toEqual({ stdout: '', stderr: '' })
  })

  it('containment: rejects an installPath outside the bottle common/ dir instead of deleting it', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    readAcfStateSpy.mockResolvedValue({
      state: 'installed',
      installPath: '/etc/passwd'
    })

    const game = new SteamGame(APP_ID)
    const result = await game.uninstall({} as any)

    expect(result.stderr).toContain('unsafe path')
    expect(pollUninstallOnceSpy).not.toHaveBeenCalled()
  })

  it('no installed manifest found (already absent/downloading) — syncs state via pollUninstallOnce instead of deleting', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    readAcfStateSpy.mockResolvedValue({ state: 'absent' })

    const game = new SteamGame(APP_ID)
    const result = await game.uninstall({} as any)

    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(pollUninstallOnceSpy).toHaveBeenCalledWith(APP_ID, 'bottle')
    expect(result).toEqual({ stdout: '', stderr: '' })
  })

  // ── SharedDepots hazard: a REAL filesystem regression test, not a mocked
  // one — proves uninstallBottleGameDirectly()'s deletion is scoped to
  // EXACTLY this title's own installdir + own manifest, and never touches
  // a sibling directory another bottle title's SharedDepots points at
  // (Hoard's real manifest declares SharedDepots 228987/228990 -> 228980,
  // "Steamworks Common Redistributables" — see debug session evidence).
  describe('SharedDepots hazard — real filesystem scoping proof', () => {
    let tmp: string
    let steamappsDir: string
    let hoardInstallDir: string
    let sharedDepotOwnerDir: string
    let hoardManifestPath: string
    let siblingManifestPath: string

    beforeEach(() => {
      tmp = mkdtempSync(
        realJoin(tmpdir(), 'gamelib-uninstall-shareddepots-test-')
      )
      steamappsDir = realJoin(tmp, 'steamapps')
      hoardInstallDir = realJoin(steamappsDir, 'common', 'Hoard')
      // The SharedDepots OWNER app's own installdir — a SIBLING of
      // Hoard's own installdir under common/, never a child of it. This is
      // where 228987/228990's actual files live; uninstalling Hoard must
      // never reach into it.
      sharedDepotOwnerDir = realJoin(
        steamappsDir,
        'common',
        'Steamworks Common Redistributables'
      )
      hoardManifestPath = realJoin(steamappsDir, `appmanifest_${APP_ID}.acf`)
      siblingManifestPath = realJoin(steamappsDir, 'appmanifest_228980.acf')

      mkdirSync(hoardInstallDir, { recursive: true })
      mkdirSync(sharedDepotOwnerDir, { recursive: true })
      writeFileSync(realJoin(hoardInstallDir, 'Hoard.exe'), 'binary-stub')
      writeFileSync(
        realJoin(sharedDepotOwnerDir, 'vcredist_x64.exe'),
        'shared-redist-stub'
      )
      writeFileSync(hoardManifestPath, 'hoard manifest content')
      writeFileSync(siblingManifestPath, 'sibling manifest content')

      ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(steamappsDir)
      // Override the outer beforeEach's fake INSTALL_PATH — this nested
      // suite roots the bottle at a REAL tmp dir, so the library entry's own
      // install_path (the new routing source of truth) must resolve inside
      // THIS real tree, not the fake '/mock/bottle/...' path.
      library.set(
        APP_ID,
        makeEntry({
          title: 'Hoard',
          is_installed: true,
          install: { install_path: hoardInstallDir }
        })
      )
    })

    afterEach(() => {
      realRmSync(tmp, { recursive: true, force: true })
    })

    it('removes ONLY Hoard\'s own installdir + own manifest — the SharedDepots owner\'s sibling directory and manifest survive untouched', async () => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false
      })
      readAcfStateSpy.mockResolvedValue({
        state: 'installed',
        installPath: hoardInstallDir
      })

      const game = new SteamGame(APP_ID)
      const result = await game.uninstall({} as any)

      expect(result).toEqual({ stdout: '', stderr: '' })
      // Hoard's own install dir + manifest are gone.
      expect(realExistsSync(hoardInstallDir)).toBe(false)
      expect(realExistsSync(hoardManifestPath)).toBe(false)
      // The SharedDepots owner's sibling directory (and its content) and
      // its own manifest survive completely untouched.
      expect(realExistsSync(sharedDepotOwnerDir)).toBe(true)
      expect(
        realExistsSync(realJoin(sharedDepotOwnerDir, 'vcredist_x64.exe'))
      ).toBe(true)
      expect(realExistsSync(siblingManifestPath)).toBe(true)
    })
  })
})

// ── debug/steam-bottle-uninstall-reverts (OPERATOR PRODUCT DECISION, LOCKED):
// uninstall() routing is driven SOLELY by where install.install_path resolves
// — never by title attributes. These tests prove the routing decision itself
// is install_path-driven (not merely consistent with it by coincidence), and
// cover the required refuse-and-report scenarios RED-provably: each refuse
// assertion checks a positive absence (openExternal/readAcfState never
// called) that the pre-fix, attribute-only routing would NOT have satisfied.

describe('SteamGame.uninstall() — install_path-driven routing (debug/steam-bottle-uninstall-reverts, OPERATOR DECISION LOCKED)', () => {
  let shellOpenExternal: jest.Mock
  let startUninstallPollingSpy: jest.SpyInstance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any
  const BOTTLE_INSTALL_PATH = '/mock/bottle/steamapps/common/SomeGame'

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    startUninstallPollingSpy = jest
      .spyOn(libraryModule, 'startUninstallPolling')
      .mockImplementation(() => {})
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(isBottleReady as jest.Mock).mockReset().mockReturnValue(true)
    ;(tellBottledSteamToUninstall as jest.Mock).mockReset()
    ;(bridgeAllowlist.has as jest.Mock).mockReset().mockReturnValue(false)
    ;(getSteamBottleSettings as jest.Mock).mockReturnValue({
      wineCrossoverBottle: 'GameLibSteam'
    })
    ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(
      '/mock/bottle/steamapps'
    )
  })

  afterEach(() => {
    startUninstallPollingSpy.mockRestore()
  })

  it('native-only: a title with a valid native install_path routes native and deletes correctly, regardless of any bottle-eligibility metadata', async () => {
    // Metadata says bottle-ineligible (ordinary case) — install_path in a
    // registered native library.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })
    library.set(
      APP_ID,
      makeEntry({
        title: 'Dota 2',
        is_installed: true,
        install: { install_path: NATIVE_INSTALL_PATH }
      })
    )
    ;(getSteamLibraries as jest.Mock).mockResolvedValue([NATIVE_LIBRARY_ROOT])

    const game = new SteamGame(APP_ID)
    const result = await game.uninstall({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://uninstall/${APP_ID}`
    )
    expect(startUninstallPollingSpy).toHaveBeenCalledWith(APP_ID)
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(result).toEqual({ stdout: '', stderr: '' })
  })

  it('ROUTING PROOF: a title bottle-eligible PER METADATA still routes NATIVE when install_path resolves to a native library — attributes never drive uninstall routing', async () => {
    // Metadata says bottle-eligible (is_mac_native:false would normally send
    // this down the bottle branch pre-fix) — but install_path resolves to a
    // NATIVE library. install_path must win.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    library.set(
      APP_ID,
      makeEntry({
        title: 'Dota 2',
        is_installed: true,
        install: { install_path: NATIVE_INSTALL_PATH }
      })
    )
    ;(getSteamLibraries as jest.Mock).mockResolvedValue([NATIVE_LIBRARY_ROOT])
    const readAcfStateSpy = jest.spyOn(libraryModule, 'readAcfState')

    const game = new SteamGame(APP_ID)
    const result = await game.uninstall({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://uninstall/${APP_ID}`
    )
    // The bottle-scoped ACF is never even consulted — routing never reached
    // uninstallBottleGameDirectly() despite bottle-eligible metadata.
    expect(readAcfStateSpy).not.toHaveBeenCalled()
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(result).toEqual({ stdout: '', stderr: '' })

    readAcfStateSpy.mockRestore()
  })

  it('ROUTING PROOF (inverse): a title NOT bottle-eligible per metadata still routes BOTTLE when install_path resolves inside the bottle — attributes never drive uninstall routing', async () => {
    // Metadata says NOT bottle-eligible (is_mac_native:true) — but
    // install_path resolves inside the CrossOver bottle. install_path must
    // win, routing to direct bottle deletion, never native delegation.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })
    library.set(
      APP_ID,
      makeEntry({
        title: 'SomeGame',
        is_installed: true,
        install: { install_path: BOTTLE_INSTALL_PATH }
      })
    )
    const readAcfStateSpy = jest
      .spyOn(libraryModule, 'readAcfState')
      .mockResolvedValue({ state: 'installed', installPath: BOTTLE_INSTALL_PATH })
    const pollUninstallOnceSpy = jest
      .spyOn(libraryModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    const game = new SteamGame(APP_ID)
    const result = await game.uninstall({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(startUninstallPollingSpy).not.toHaveBeenCalled()
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(readAcfStateSpy).toHaveBeenCalledWith(APP_ID, 'bottle')
    expect(pollUninstallOnceSpy).toHaveBeenCalledWith(APP_ID, 'bottle')
    expect(result).toEqual({ stdout: '', stderr: '' })

    readAcfStateSpy.mockRestore()
    pollUninstallOnceSpy.mockRestore()
  })

  it('bottle-only (regression, just-shipped mechanism): a title with a valid bottle install_path routes bottle and deletes correctly', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    library.set(
      APP_ID,
      makeEntry({
        title: 'Hoard',
        is_installed: true,
        install: { install_path: BOTTLE_INSTALL_PATH }
      })
    )
    const readAcfStateSpy = jest
      .spyOn(libraryModule, 'readAcfState')
      .mockResolvedValue({ state: 'installed', installPath: BOTTLE_INSTALL_PATH })
    const pollUninstallOnceSpy = jest
      .spyOn(libraryModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    const game = new SteamGame(APP_ID)
    const result = await game.uninstall({} as any)

    expect(readAcfStateSpy).toHaveBeenCalledWith(APP_ID, 'bottle')
    expect(pollUninstallOnceSpy).toHaveBeenCalledWith(APP_ID, 'bottle')
    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toEqual({ stdout: '', stderr: '' })

    readAcfStateSpy.mockRestore()
    pollUninstallOnceSpy.mockRestore()
  })

  it('dual-installed (bottle-pointed): routes ONLY to the bottle copy uninstallBottleGameDirectly() represents — never touches the native delegation path at all', async () => {
    // The library entry's install_path represents the bottle copy (what the
    // user is looking at); a native copy also happens to exist on disk, but
    // uninstall() must never consult it — it acts SOLELY on the represented
    // copy. (The badge-stays-installed / install_path re-resolution half of
    // this scenario is unit-tested directly against pollUninstallOnce() in
    // library.test.ts's "dual-install partial removal" suite — this test
    // proves the ROUTING half: only the pointed-at copy is ever touched.)
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    library.set(
      APP_ID,
      makeEntry({
        title: 'Hoard',
        is_installed: true,
        install: { install_path: BOTTLE_INSTALL_PATH }
      })
    )
    // A native copy also exists — getSteamLibraries() would report it if
    // ever consulted, but routing must never reach that call for a
    // bottle-pointed install_path.
    ;(getSteamLibraries as jest.Mock).mockResolvedValue([NATIVE_LIBRARY_ROOT])
    const readAcfStateSpy = jest
      .spyOn(libraryModule, 'readAcfState')
      .mockResolvedValue({ state: 'installed', installPath: BOTTLE_INSTALL_PATH })
    const pollUninstallOnceSpy = jest
      .spyOn(libraryModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)

    expect(readAcfStateSpy).toHaveBeenCalledWith(APP_ID, 'bottle')
    expect(readAcfStateSpy).not.toHaveBeenCalledWith(APP_ID, 'native')
    expect(pollUninstallOnceSpy).toHaveBeenCalledWith(APP_ID, 'bottle')
    expect(shellOpenExternal).not.toHaveBeenCalled()

    readAcfStateSpy.mockRestore()
    pollUninstallOnceSpy.mockRestore()
  })

  it('stale/absent install_path: refuses and deletes nothing (RED-provable — pre-fix attribute routing would have delegated natively regardless)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })
    // makeEntry()'s default install:{} has no install_path.
    library.set(
      APP_ID,
      makeEntry({ title: 'Dota 2', is_installed: true })
    )
    const readAcfStateSpy = jest.spyOn(libraryModule, 'readAcfState')

    const game = new SteamGame(APP_ID)
    const result = await game.uninstall({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(readAcfStateSpy).not.toHaveBeenCalled()
    expect(startUninstallPollingSpy).not.toHaveBeenCalled()
    expect(result.stderr).toContain('Refused to uninstall')
    expect(result.stdout).toBe('')

    readAcfStateSpy.mockRestore()
  })

  it('install_path outside every known root (bottle AND all native libraries): refuses and deletes nothing (RED-provable)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })
    library.set(
      APP_ID,
      makeEntry({
        title: 'Dota 2',
        is_installed: true,
        install: { install_path: '/completely/unrelated/place/Game' }
      })
    )
    // A real native library IS registered, but does not contain this path —
    // proves the containment check, not just an empty-libraries fallback.
    ;(getSteamLibraries as jest.Mock).mockResolvedValue([NATIVE_LIBRARY_ROOT])
    const readAcfStateSpy = jest.spyOn(libraryModule, 'readAcfState')

    const game = new SteamGame(APP_ID)
    const result = await game.uninstall({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(readAcfStateSpy).not.toHaveBeenCalled()
    expect(startUninstallPollingSpy).not.toHaveBeenCalled()
    expect(result.stderr).toContain('Refused to uninstall')
    expect(result.stdout).toBe('')

    readAcfStateSpy.mockRestore()
  })
})

// ── Phase 24 Plan 08 (R4/R6): allowlist-based bridge uninstall routing —
// removes the game from the DEDICATED bridge bottle directly (no Steam
// client to dispatch a verb to on this path), never touching the Phase 17
// GameLibSteam bottle.

describe('SteamGame.uninstall() — Phase 24 Plan 08 bridge routing (R4/R6)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any
  const RESOLVED_EXE_PATH =
    '/mock/bridge/bottle/steamapps/common/Avernum 4/Avernum4.exe'

  beforeEach(() => {
    __resetBridgeFailedSessionForTests()
    library.clear()
    pendingFetches.clear()
    library.set(APP_ID, makeEntry({ title: 'Avernum 4', is_installed: true }))
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(bridgeAllowlist.has as jest.Mock).mockReset()
    ;(tellBottledSteamToUninstall as jest.Mock).mockReset()
    ;(resolveBridgeLaunchExe as jest.Mock).mockReset()
    ;(getBridgeBottleSettings as jest.Mock).mockReturnValue({
      wineCrossoverBottle: 'GameLibSteamBridge'
    })
    ;(getBottleSteamappsDir as jest.Mock).mockImplementation(
      (bottleName: string) =>
        bottleName === 'GameLibSteamBridge'
          ? '/mock/bridge/bottle/steamapps'
          : '/mock/bottle/steamapps'
    )
  })

  afterEach(() => {
    // Restore the module-mock's declared defaults — see the identical note
    // in the launch() bridge-routing describe block above.
    envMock.isMac = false
    envMock.isWindows = false
    envMock.isLinux = true
  })

  it('allowlisted uninstall: removes the game from the bridge bottle (resolveBridgeLaunchExe consulted), NOT tellBottledSteamToUninstall — Phase 17 GameLibSteam bottle untouched', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)

    const game = new SteamGame(APP_ID)
    const result = await game.uninstall({} as any)

    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(resolveBridgeLaunchExe).toHaveBeenCalledWith(APP_ID)
    expect(result).toEqual({ stdout: '', stderr: '' })
    expect(library.get(APP_ID)?.is_installed).toBe(false)
  })

  it('regression: a non-allowlisted title uninstall() never consults resolveBridgeLaunchExe, and (debug/steam-bottle-uninstall-reverts FINAL) routes to direct deletion instead of tellBottledSteamToUninstall', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(getSteamBottleSettings as jest.Mock).mockReturnValue({
      wineCrossoverBottle: 'GameLibSteam'
    })
    // debug/steam-bottle-uninstall-reverts (routing fix): the library
    // entry's own install_path is now the routing source of truth — must
    // resolve inside the bottle root (getBottleSteamappsDir's
    // 'GameLibSteam' branch, mocked in this describe's outer beforeEach) for
    // this test to still reach uninstallBottleGameDirectly().
    library.set(
      APP_ID,
      makeEntry({
        title: 'Avernum 4',
        is_installed: true,
        install: { install_path: '/mock/bottle/steamapps/common/Hoard' }
      })
    )
    const readAcfStateSpy = jest
      .spyOn(libraryModule, 'readAcfState')
      .mockResolvedValue({
        state: 'installed',
        installPath: '/mock/bottle/steamapps/common/Hoard'
      })
    const pollUninstallOnceSpy = jest
      .spyOn(libraryModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)

    expect(resolveBridgeLaunchExe).not.toHaveBeenCalled()
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(readAcfStateSpy).toHaveBeenCalledWith(APP_ID, 'bottle')
    expect(pollUninstallOnceSpy).toHaveBeenCalledWith(APP_ID, 'bottle')

    readAcfStateSpy.mockRestore()
    pollUninstallOnceSpy.mockRestore()
  })

  // ── D-UAT-24-07 fold-in: markBridgeGameUninstalled() must emit a
  // gameStatusUpdate 'done' — the backend uninstall succeeded, but without
  // this the frontend "Uninstalling" pill never cleared (24-UAT.md RETEST
  // RUN 1 "Also observed").

  it('D-UAT-24-07 fold-in: a completed bridge uninstall emits gameStatusUpdate {status:"done"} (clears the Uninstalling pill) AND pushGameToLibrary with is_installed:false', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)

    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)

    expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: APP_ID,
      runner: 'steam',
      status: 'done'
    })
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: APP_ID, is_installed: false })
    )
  })

  it('D-UAT-24-07 fold-in: gameStatusUpdate {status:"done"} still fires even when the library entry is absent for that appId (resolveBridgeLaunchExe returns undefined — nothing to remove)', async () => {
    library.delete(APP_ID)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(undefined)

    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)

    expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: APP_ID,
      runner: 'steam',
      status: 'done'
    })
    // No library entry existed, so no pushGameToLibrary for this appId.
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: APP_ID })
    )
  })
})

// ── LIB-06: parseSteamStorageRequirement ─────────────────────────────────────

describe('parseSteamStorageRequirement', () => {
  it('LIB-06: returns bytes for "15 GB available space" HTML (15 * 1024^3)', () => {
    const html =
      '<ul><li><strong>Storage:</strong> 15 GB available space</li></ul>'
    expect(parseSteamStorageRequirement(html)).toBe(15 * 1024 ** 3) // 16106127360
  })

  it('LIB-06: returns bytes for plain "512 MB available space" (512 * 1024^2)', () => {
    expect(parseSteamStorageRequirement('512 MB available space')).toBe(
      512 * 1024 ** 2
    ) // 536870912
  })

  it('LIB-06: returns undefined for undefined input', () => {
    expect(parseSteamStorageRequirement(undefined)).toBeUndefined()
  })

  it('LIB-06: returns undefined when string contains no size pattern', () => {
    expect(parseSteamStorageRequirement('no size here')).toBeUndefined()
  })

  it('LIB-06: returns undefined for non-string input (array cast — typeof guard)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(parseSteamStorageRequirement([] as any)).toBeUndefined()
  })
})

// ── MAC32-01: parseSteamMacMinOSVersion / macArchFromMinOS ───────────────────
// Fixtures below are the LITERAL live-fetched mac_requirements.minimum HTML
// strings from 18-RESEARCH.md Pattern 1's corpus (cross-checked against the
// four committed 18-01 appinfo fixtures' real titles).

describe('parseSteamMacMinOSVersion', () => {
  it('canonical bulleted shape: Dota 2 (570) resolves to 10.15', () => {
    expect(
      parseSteamMacMinOSVersion(
        '<li><strong>OS:</strong> macOS 10.15 or newer<br></li>'
      )
    ).toEqual({ major: 10, minor: 15 })
  })

  it('canonical bulleted shape with parenthetical codename: Age of Wonders III (226840, confirmed 32-bit) resolves to 10.9.3', () => {
    expect(
      parseSteamMacMinOSVersion(
        '<li><strong>OS:</strong> 10.9.3 (Mavericks)<br></li>'
      )
    ).toEqual({ major: 10, minor: 9 })
  })

  it('"or higher" phrasing: A Hat in Time (253230, false-flag, real 64-bit) resolves to 10.11.6', () => {
    expect(
      parseSteamMacMinOSVersion(
        '<li><strong>OS:</strong> MAC OS X 10.11.6 or higher<br></li>'
      )
    ).toEqual({ major: 10, minor: 11 })
  })

  it('multi-alternative "or higher" list: Half-Life 2 (220) returns the LOWEST alternative (10.5.8, not 10.6.3)', () => {
    expect(
      parseSteamMacMinOSVersion(
        '<li><strong>OS:</strong> Leopard 10.5.8, Snow Leopard 10.6.3, or higher<br></li>'
      )
    ).toEqual({ major: 10, minor: 5 })
  })

  it('tagless run-on prose: Portal resolves to 10.5.8 without the "1GB" RAM figure leaking in', () => {
    expect(
      parseSteamMacMinOSVersion(
        '<strong>Minimum: </strong>OS X version Leopard 10.5.8, Snow Leopard 10.6.3, 1GB RAM, NVIDIA...'
      )
    ).toEqual({ major: 10, minor: 5 })
  })

  it('label+value co-located inside one <strong>, range format: Terraria resolves to the lowest bound (10.9.5, not 10.11.6)', () => {
    expect(
      parseSteamMacMinOSVersion(
        '<li><strong>OS: OSX 10.9.5 - 10.11.6</strong> <br></li>'
      )
    ).toEqual({ major: 10, minor: 9 })
  })

  it('decoy digits: Dust: An Elysian Tail resolves via 10.6.8, NOT via the literal "32" in "32/64-bit" (no dot, excluded)', () => {
    expect(
      parseSteamMacMinOSVersion(
        '<li><strong>OS:</strong> Snow Leopard 10.6.8, 32/64-bit<br>...'
      )
    ).toEqual({ major: 10, minor: 6 })
  })

  it('major > 10: No Man\'s Sky resolves to 12.3', () => {
    expect(
      parseSteamMacMinOSVersion('<li><strong>OS:</strong> macOS Monterey 12.3<br></li>')
    ).toEqual({ major: 12, minor: 3 })
  })

  it('returns null for undefined input (empty-array proxy: mac_requirements: [] yields undefined via optional chaining)', () => {
    expect(parseSteamMacMinOSVersion(undefined)).toBeNull()
  })

  it('returns null without throwing when no OS line is present at all', () => {
    expect(parseSteamMacMinOSVersion('no os line here at all')).toBeNull()
  })

  it('returns null for non-string input (typeof guard)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(parseSteamMacMinOSVersion([] as any)).toBeNull()
  })
})

describe('macArchFromMinOS', () => {
  it('Dota 2 (570, min-OS 10.15, Catalina floor) resolves to "64" (confident)', () => {
    expect(
      macArchFromMinOS('<li><strong>OS:</strong> macOS 10.15 or newer<br></li>')
    ).toBe('64')
  })

  it('No Man\'s Sky (min-OS 12.3, major > 10) resolves to "64" (confident)', () => {
    expect(
      macArchFromMinOS('<li><strong>OS:</strong> macOS Monterey 12.3<br></li>')
    ).toBe('64')
  })

  it('Age of Wonders III (226840, min-OS 10.9.3, REAL 32-bit) resolves to "unknown" — never a false-negative assert-32', () => {
    expect(
      macArchFromMinOS('<li><strong>OS:</strong> 10.9.3 (Mavericks)<br></li>')
    ).toBe('unknown')
  })

  it('A Hat in Time (253230, min-OS 10.11.6, REAL 64-bit false-flag) resolves to "unknown" — the false-flag-safe anchor', () => {
    expect(
      macArchFromMinOS(
        '<li><strong>OS:</strong> MAC OS X 10.11.6 or higher<br></li>'
      )
    ).toBe('unknown')
  })

  it('Half-Life 2 (220, min-OS 10.5.8, lowest of two alternatives) resolves to "unknown"', () => {
    expect(
      macArchFromMinOS(
        '<li><strong>OS:</strong> Leopard 10.5.8, Snow Leopard 10.6.3, or higher<br></li>'
      )
    ).toBe('unknown')
  })

  it('tagless prose (Portal) resolves to "unknown"', () => {
    expect(
      macArchFromMinOS(
        '<strong>Minimum: </strong>OS X version Leopard 10.5.8, Snow Leopard 10.6.3, 1GB RAM, NVIDIA...'
      )
    ).toBe('unknown')
  })

  it('Terraria range shape resolves to "unknown" (lowest bound 10.9.5)', () => {
    expect(
      macArchFromMinOS('<li><strong>OS: OSX 10.9.5 - 10.11.6</strong> <br></li>')
    ).toBe('unknown')
  })

  it('Dust: An Elysian Tail decoy digits resolve to "unknown" via 10.6.8, not the literal "32"', () => {
    expect(
      macArchFromMinOS(
        '<li><strong>OS:</strong> Snow Leopard 10.6.8, 32/64-bit<br>...'
      )
    ).toBe('unknown')
  })

  it('undefined input (empty-array proxy) resolves to "unknown" without throwing', () => {
    expect(macArchFromMinOS(undefined)).toBe('unknown')
  })

  it('unparseable text resolves to "unknown" without throwing', () => {
    expect(macArchFromMinOS('no os line here at all')).toBe('unknown')
  })
})

// ── LIB-06: getSteamInstallSize ───────────────────────────────────────────────

describe('getSteamInstallSize', () => {
  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    // getFileSize is mocked in backend/utils — set a stable return value per test
    ;(
      jest.requireMock('backend/utils').getFileSize as jest.Mock
    ).mockReturnValue('15.00 GiB')
  })

  it('LIB-06: returns installed game size from install_size without calling axios.get', async () => {
    const gameInfo = makeEntry({
      is_installed: true,
      install: { install_size: '15.00 GiB', install_path: '/games/tf2' }
    })
    const result = await getSteamInstallSize('440', gameInfo)
    expect(jest.mocked(axios.get)).not.toHaveBeenCalled()
    // Fast path returns the already-formatted string straight through — no
    // parse, no getFileSize call — regardless of the mocked getFileSize
    // return value configured in beforeEach.
    expect(result).toBe('15.00 GiB')
    expect(
      jest.requireMock('backend/utils').getFileSize as jest.Mock
    ).not.toHaveBeenCalled()
  })

  it('LIB-06: calls store API for uninstalled game and returns parsed size string', async () => {
    jest.mocked(axios.get).mockResolvedValue({
      data: {
        '440': {
          success: true,
          data: {
            name: 'Team Fortress 2',
            pc_requirements: {
              minimum:
                '<ul><li><strong>Storage:</strong> 15 GB available space</li></ul>'
            }
          }
        }
      }
    })
    const gameInfo = makeEntry({ is_installed: false, install: {} })
    const result = await getSteamInstallSize('440', gameInfo)
    expect(jest.mocked(axios.get)).toHaveBeenCalledTimes(1)
    expect(jest.mocked(axios.get)).toHaveBeenCalledWith(
      'https://store.steampowered.com/api/appdetails?appids=440'
    )
    expect(result).not.toBe('?? MB')
  })

  it('LIB-06: returns "?? MB" when axios.get rejects', async () => {
    jest.mocked(axios.get).mockRejectedValue(new Error('Network error'))
    const gameInfo = makeEntry({ is_installed: false, install: {} })
    const result = await getSteamInstallSize('440', gameInfo)
    expect(result).toBe('?? MB')
  })

  it('T-06-01: returns "?? MB" for non-numeric appId without calling axios.get', async () => {
    const result = await getSteamInstallSize('not-an-id')
    expect(result).toBe('?? MB')
    expect(jest.mocked(axios.get)).not.toHaveBeenCalled()
  })
})

// ── SteamGame.forceUninstall() ────────────────────────────────────────────────

describe('SteamGame.forceUninstall()', () => {
  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    library.set(APP_ID, makeEntry({ title: 'Dota 2', is_installed: true }))
  })

  it('forceUninstall() keeps the appId in the library marked is_installed:false', async () => {
    expect(library.has(APP_ID)).toBe(true)

    const game = new SteamGame(APP_ID)
    await game.forceUninstall()

    expect(library.has(APP_ID)).toBe(true)
    expect(library.get(APP_ID)?.is_installed).toBe(false)
    expect(library.get(APP_ID)?.install).toEqual({})
  })

  it('forceUninstall() calls sendFrontendMessage pushGameToLibrary with is_installed: false', async () => {
    const game = new SteamGame(APP_ID)
    await game.forceUninstall()

    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: APP_ID, is_installed: false })
    )
  })

  it('GAP-18-06: forceUninstall() preserves mac_arch:32 in the Map and persists to steamLibraryStore', async () => {
    library.set(
      APP_ID,
      makeEntry({
        title: 'Old 32-bit Game',
        is_installed: true,
        mac_arch: '32'
      })
    )

    const game = new SteamGame(APP_ID)
    await game.forceUninstall()

    // Badge data survives in the Map
    expect(library.get(APP_ID)?.mac_arch).toBe('32')
    expect(library.get(APP_ID)?.is_installed).toBe(false)

    // Persist happened (GAP-17-BOTTLE-STORE-DIVERGENCE class)
    expect(steamLibraryStore.set).toHaveBeenCalledWith(
      'games',
      expect.any(Array)
    )

    // The pushed payload carries the badge data
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({
        app_name: APP_ID,
        is_installed: false,
        mac_arch: '32'
      })
    )
  })

  it('R5 (D-17, 34.13-14): forceUninstall() does NOT clear the forced verdict — the bits were never removed', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true,
      forcedWindowsViaBottle: true
    })

    const game = new SteamGame(APP_ID)
    await game.forceUninstall()

    // forceUninstall() only touches the library Map/steamLibraryStore — it
    // never calls steamMetadataStore.set, so the persisted verdict is
    // untouched (still true — the files are still in the bottle).
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
  })
})

// ── MAC32-03 Task 3: promptI386Recovery — i386 recovery (CONTEXT D-6) ─────────
//
// Given verifyMacArchGroundTruth (library.ts, Task 2) has already flipped and
// cached mac_arch:'32' for this appId, promptI386Recovery is the decoupled,
// user-consented recovery: confirm → forceUninstall() the dead native copy,
// then install() — which now routes through the bottle because
// isBottleEligible() honors the cached mac_arch:'32' verdict. Cancel → neither
// is called, the '32' verdict (persisted independently by
// verifyMacArchGroundTruth before this prompt ever fires) is left untouched.

describe('promptI386Recovery() — MAC32-03 i386 recovery (CONTEXT D-6)', () => {
  let shellOpenExternal: jest.Mock
  let dialogShowMessageBox: jest.Mock
  let startInstallPollingSpy: jest.SpyInstance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell, dialog } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    dialogShowMessageBox = dialog.showMessageBox as jest.Mock
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    library.set(APP_ID, makeEntry({ title: 'Old 32-bit Game', is_installed: true }))
    startInstallPollingSpy = jest
      .spyOn(libraryModule, 'startInstallPolling')
      .mockImplementation(() => {})
    ;(isBottleReady as jest.Mock).mockReset()
    ;(tellBottledSteamToInstall as jest.Mock).mockReset()
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
    envMock.isMac = false
  })

  it('confirmed dialog — forceUninstall() then install() (bottle path, mac_arch:32) are invoked', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      mac_arch: '32',
      mac_arch_source: 'macho',
      mac_arch_verified: true
    })
    dialogShowMessageBox.mockResolvedValue({ response: 0 })
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(tellBottledSteamToInstall as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    await libraryModule.promptI386Recovery(APP_ID)

    expect(dialogShowMessageBox).toHaveBeenCalledTimes(1)
    // forceUninstall(): kept in the in-memory library, marked not-installed
    // (keep-entry — recovery no longer orphans the game) + pushed not-installed
    expect(library.has(APP_ID)).toBe(true)
    expect(library.get(APP_ID)?.is_installed).toBe(false)
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: APP_ID, is_installed: false })
    )
    // install(): routes through the bottle (mac_arch:'32' → isBottleEligible())
    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(tellBottledSteamToInstall).toHaveBeenCalledWith(APP_ID)
  })

  it('cancelled dialog — neither forceUninstall() nor install() is invoked, mac_arch 32 stays cached', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      mac_arch: '32',
      mac_arch_source: 'macho',
      mac_arch_verified: true
    })
    dialogShowMessageBox.mockResolvedValue({ response: 1 })

    await libraryModule.promptI386Recovery(APP_ID)

    expect(dialogShowMessageBox).toHaveBeenCalledTimes(1)
    expect(tellBottledSteamToInstall).not.toHaveBeenCalled()
    expect(shellOpenExternal).not.toHaveBeenCalled()
    // forceUninstall() never ran — the native (unrunnable) install stays in
    // the in-memory library untouched.
    expect(library.has(APP_ID)).toBe(true)
    // The '32' verdict (cached independently by verifyMacArchGroundTruth
    // before this prompt fires) is never touched by promptI386Recovery itself.
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
  })
})

// ── Supporting read methods: getSettings, getExtraInfo, isGameAvailable ───────

describe('SteamGame supporting read methods — GAME-01 unblock', () => {
  let existsSyncMock: jest.Mock

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    existsSyncMock = jest.requireMock('graceful-fs').existsSync as jest.Mock
    // Re-establish GameConfig mock (resetMocks: true clears return values between tests)
    const mockSettings = {
      autoSyncSaves: false,
      savesPath: '',
      gogSaves: [],
      wineVersion: { name: 'Wine', type: 'wine', bin: '' },
      winePrefix: '',
      wineCrossoverBottle: '',
      autoInstallDxvk: false,
      autoInstallDxvkNvapi: false,
      autoInstallVkd3d: false,
      preferSystemLibs: false,
      enableEsync: false,
      enableFsync: false,
      enableFsrSharpening: false,
      maxSharpening: false,
      enableDXVKFpsLimit: false,
      DXVKFpsCap: '0',
      targetExe: '',
      verboseLogs: false,
      launcherArgs: '',
      enviromentOptions: [],
      wrapperOptions: []
    }
    ;(
      jest.requireMock('backend/game_config').GameConfig.get as jest.Mock
    ).mockReturnValue({
      config: undefined,
      getSettings: jest.fn().mockResolvedValue(mockSettings)
    })
    library.set(APP_ID, makeEntry())
  })

  // ── getSettings ────────────────────────────────────────────────────────────

  it('getSettings() resolves a GameSettings object with autoSyncSaves === false', async () => {
    const game = new SteamGame(APP_ID)
    const settings = await game.getSettings()

    expect(settings).toBeDefined()
    expect(settings.autoSyncSaves).toBe(false)
  })

  it('getSettings() does not throw', async () => {
    const game = new SteamGame(APP_ID)
    await expect(game.getSettings()).resolves.not.toThrow()
  })

  // ── Phase 17 (D-11): getSettings() bottle-eligible resolution ────────────
  //
  // LAUNCH ORDERING: launcher.ts's launchEventCallback runs checkWineBeforeLaunch
  // BEFORE game.launch() for a bottle-eligible game (isNative()===false) — that
  // pre-step consumes THIS getSettings() result. It must resolve the dedicated
  // bottle store (getSteamBottleSettings), never fall through to an empty
  // per-appId GameConfig.get(<numeric appId>) (Pitfall-6 phantom-config guard).

  describe('bottle-eligible resolution (D-11)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let envMock: any

    beforeEach(() => {
      envMock = jest.requireMock('backend/constants/environment')
      envMock.isMac = true
      envMock.isWindows = false
      envMock.isLinux = false
      ;(getSteamBottleSettings as jest.Mock).mockReset()
    })

    it('bottle-eligible game: getSettings() resolves getSteamBottleSettings(), NOT GameConfig.get(<appId>)', async () => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false
      })
      const bottleSettings = {
        autoSyncSaves: false,
        wineVersion: { name: 'CrossOver', type: 'crossover', bin: '' },
        wineCrossoverBottle: 'GameLibSteam'
      }
      ;(getSteamBottleSettings as jest.Mock).mockReturnValue(bottleSettings)
      const gameConfigGetMock = jest.requireMock('backend/game_config')
        .GameConfig.get as jest.Mock
      gameConfigGetMock.mockClear()

      const game = new SteamGame(APP_ID)
      const settings = await game.getSettings()

      expect(settings).toBe(bottleSettings)
      expect(getSteamBottleSettings).toHaveBeenCalledTimes(1)
      expect(gameConfigGetMock).not.toHaveBeenCalled()
    })

    it('non-eligible macOS game (Mac-native): getSettings() falls back to GameConfig.get(<appId>) unchanged', async () => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: true
      })
      const gameConfigGetMock = jest.requireMock('backend/game_config')
        .GameConfig.get as jest.Mock
      gameConfigGetMock.mockReturnValue({
        config: undefined,
        getSettings: jest.fn().mockResolvedValue({ autoSyncSaves: false })
      })

      const game = new SteamGame(APP_ID)
      const settings = await game.getSettings()

      expect(gameConfigGetMock).toHaveBeenCalledWith(APP_ID)
      expect(getSteamBottleSettings).not.toHaveBeenCalled()
      expect(settings.autoSyncSaves).toBe(false)
    })
  })

  // ── getExtraInfo ───────────────────────────────────────────────────────────

  it('getExtraInfo() resolves in-memory GameInfo.extra when present', async () => {
    const extraData = {
      reqs: [],
      about: { description: 'A great game', shortDescription: 'A great game' }
    }
    library.set(APP_ID, makeEntry({ extra: extraData }))

    const game = new SteamGame(APP_ID)
    const extra = await game.getExtraInfo()

    expect(extra).toEqual(extraData)
  })

  it('getExtraInfo() resolves a safe default when extra is absent', async () => {
    library.set(APP_ID, makeEntry({ extra: undefined }))

    const game = new SteamGame(APP_ID)
    const extra = await game.getExtraInfo()

    expect(extra).toEqual(
      expect.objectContaining({
        reqs: [],
        about: expect.objectContaining({
          description: '',
          shortDescription: ''
        })
      })
    )
  })

  it('getExtraInfo() does not throw', async () => {
    const game = new SteamGame(APP_ID)
    await expect(game.getExtraInfo()).resolves.not.toThrow()
  })

  // ── isGameAvailable ────────────────────────────────────────────────────────

  it('isGameAvailable() resolves true when game is installed and install_path existsSync returns true', async () => {
    existsSyncMock.mockReturnValue(true)
    library.set(
      APP_ID,
      makeEntry({
        is_installed: true,
        install: { install_path: '/games/dota2' }
      })
    )

    const game = new SteamGame(APP_ID)
    const available = await game.isGameAvailable()

    expect(available).toBe(true)
    expect(existsSyncMock).toHaveBeenCalledWith('/games/dota2')
  })

  it('isGameAvailable() resolves false when game is not installed', async () => {
    library.set(APP_ID, makeEntry({ is_installed: false, install: {} }))

    const game = new SteamGame(APP_ID)
    const available = await game.isGameAvailable()

    expect(available).toBe(false)
  })

  it('isGameAvailable() resolves false when install_path does not exist on disk', async () => {
    existsSyncMock.mockReturnValue(false)
    library.set(
      APP_ID,
      makeEntry({
        is_installed: true,
        install: { install_path: '/games/dota2' }
      })
    )

    const game = new SteamGame(APP_ID)
    const available = await game.isGameAvailable()

    expect(available).toBe(false)
  })

  it('isGameAvailable() resolves false when game is delisted and installed (LIB-07)', async () => {
    existsSyncMock.mockReturnValue(true)
    library.set(
      APP_ID,
      makeEntry({
        is_installed: true,
        is_delisted: true,
        install: { install_path: '/games/dota2' }
      })
    )

    const game = new SteamGame(APP_ID)
    const available = await game.isGameAvailable()

    expect(available).toBe(false)
  })

  it('isGameAvailable() resolves false when game is delisted and not installed (LIB-07)', async () => {
    library.set(
      APP_ID,
      makeEntry({ is_installed: false, is_delisted: true, install: {} })
    )

    const game = new SteamGame(APP_ID)
    const available = await game.isGameAvailable()

    expect(available).toBe(false)
  })
})

// ── CONSOLE-01 Gap B: is_delisted detection in fetchMetadataIfNeeded ──────────
//
// These tests verify all three behavioural branches of the delisted-detection
// logic in fetchMetadataIfNeeded. The gap was previously grep-verified only.
//
// Branch 1 — DEFINITIVE DELISTED: success:false → is_delisted:true written.
// Branch 2 — AVAILABLE / CLEARED:  success:true with data → is_delisted:false.
// Branch 3 — TRANSIENT (ambiguous empty envelope): no is_delisted write.
// Branch 4 — TRANSIENT (network throw / catch block): no is_delisted write.

describe('SteamGame.fetchMetadataIfNeeded — is_delisted detection (CONSOLE-01 Gap B)', () => {
  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
  })

  it('CONSOLE-01/B1: success:false response sets is_delisted:true on steamMetadataStore, library entry, and pushGameToLibrary', async () => {
    // Arrange: Steam appdetails returns a definitive "no such app" envelope.
    ;(axios.get as jest.Mock).mockResolvedValue({
      data: { [APP_ID]: { success: false } }
    })
    // Seed the metadata store with existing art so the merge preserves it.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      art_cover: 'https://example.com/old-art.jpg',
      art_square: 'https://example.com/old-sq.jpg',
      extra: { reqs: [] }
    })
    library.set(APP_ID, makeEntry())

    // Act: fire getGameInfo → triggers fetchMetadataIfNeeded as fire-and-forget.
    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    // Assert 1: steamMetadataStore persists the delisted flag.
    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ is_delisted: true })
    )
    // Assert 2: in-memory library entry carries is_delisted:true.
    expect(library.get(APP_ID)?.is_delisted).toBe(true)
    // Assert 3: frontend receives the updated GameInfo with is_delisted:true.
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: APP_ID, is_delisted: true })
    )
  })

  it('CONSOLE-01/B2: success:true response clears is_delisted to false on steamMetadataStore, library entry, and pushGameToLibrary', async () => {
    // Arrange: a normal successful appdetails response (existing fixture).
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    // Act
    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    // Assert 1: steamMetadataStore carries is_delisted:false (stale flag cleared).
    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ is_delisted: false })
    )
    // Assert 2: in-memory library entry has is_delisted:false.
    expect(library.get(APP_ID)?.is_delisted).toBe(false)
    // Assert 3: frontend push carries is_delisted:false.
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ is_delisted: false })
    )
  })

  it('CONSOLE-01/B3: ambiguous empty envelope (no success, no data) does NOT write is_delisted — transient failure must not hide owned games', async () => {
    // Arrange: envelope present but both success and data are absent.
    // This represents a rate-limit or partial API response — NOT a delisted verdict.
    ;(axios.get as jest.Mock).mockResolvedValue({
      data: { [APP_ID]: {} }
    })
    library.set(APP_ID, makeEntry())

    // Act
    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    // Assert: no persistence write whatsoever — transient branch returns early.
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
    // Assert: no game pushed — owned game must remain visible (the
    // steamMetadataSyncing on/off signals are expected + allowed).
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.anything()
    )
  })

  it('CONSOLE-01/B4: network error (axios throw) does NOT write is_delisted — catch block must never mark owned games delisted', async () => {
    // Arrange: axios rejects — simulates offline / network timeout.
    ;(axios.get as jest.Mock).mockRejectedValue(new Error('Network timeout'))
    library.set(APP_ID, makeEntry())

    // Act — must not throw synchronously or cause an unhandled rejection.
    expect(() => new SteamGame(APP_ID).getGameInfo()).not.toThrow()
    await flushAsync()

    // Assert: catch block only logs; no store write, no game pushed (the
    // steamMetadataSyncing on/off signals are expected + allowed).
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.anything()
    )
  })
})
