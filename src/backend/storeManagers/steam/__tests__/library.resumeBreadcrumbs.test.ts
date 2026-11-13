import {
  createTestManagerDeps,
  createInertSteamProcesses,
  createTestStores
} from 'backend/testUtils/testServices'
/**
 * Unit tests for steam/library/resumeBreadcrumbs.ts. Moved out of
 * library.test.ts by Phase 65 plan 03 (D-03); mock preamble copied.
 */

// ── Imports ───────────────────────────────────────────────────────────────────
import {
  markSteamInstallIncomplete,
  markSteamNativeInstallStarted,
  clearSteamResumeBreadcrumb,
  breadcrumbAppIsFullyInstalledOnDisk
} from '../library/resumeBreadcrumbs'
import { join } from 'path'
import { mockedFsSteamFiles } from '../localFiles/__tests__/fixtures/mockedFsSteamFiles'
import { stubRustSteamFiles } from '../localFiles/__tests__/fixtures/stubRustSteamFiles'
const sendFrontendMessage = jest.fn()
import { t as i18nextT } from 'i18next'
import { backfillBridgeLaunchTargets } from '../bridge/launchTarget'
import { listReadyBridgeBottleNames } from '../bridgeBottle'
import type { Stores } from 'backend/services/types'

const { steamLibraryStore } = jest.requireMock<Stores['steam']>('../stores')
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

// ── D-UAT-09 (21-17): markSteamInstallIncomplete() — same-session cancel ─────

describe('markSteamInstallIncomplete()', () => {
  beforeEach(() => {
    library.clear()
    jest.mocked(sendFrontendMessage).mockClear()
    ;(steamLibraryStore.set as jest.Mock).mockClear()
  })

  it('Test E: flips is_installed to false and steamResumePending to true, persists, and pushes to the frontend', () => {
    library.set('730', {
      runner: 'steam',
      app_name: '730',
      title: 'CS:GO',
      is_installed: true,
      install: { install_path: '/steam/steamapps/common/csgo' },
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)

    markSteamInstallIncomplete(steamTestDeps, '730')

    expect(library.get('730')?.is_installed).toBe(false)
    expect(library.get('730')?.install?.steamResumePending).toBe(true)
    // Prior install fields must survive the merge, not be clobbered.
    expect(library.get('730')?.install?.install_path).toBe(
      '/steam/steamapps/common/csgo'
    )
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({
        app_name: '730',
        is_installed: false,
        install: expect.objectContaining({ steamResumePending: true })
      })
    )
  })

  it('Test E: is a no-op (never throws) when the appId has no in-memory library entry', () => {
    library.clear()
    expect(() =>
      markSteamInstallIncomplete(steamTestDeps, 'nonexistent')
    ).not.toThrow()
    expect(sendFrontendMessage).not.toHaveBeenCalled()
  })
})

describe('steamResumeInstalledAtStart breadcrumb field (todo 2026-11-09)', () => {
  beforeEach(() => {
    library.clear()
    library.set('730', {
      runner: 'steam',
      app_name: '730',
      is_installed: true,
      install: {}
    } as any)
  })

  it('persists installedAtStart true and clear deletes it', () => {
    markSteamNativeInstallStarted(steamTestDeps, '730', {
      targetSteamappsDir: '/s/steamapps',
      installdir: 'csgo',
      installedAtStart: true
    })
    expect(library.get('730')?.install?.steamResumeInstalledAtStart).toBe(true)

    clearSteamResumeBreadcrumb(steamTestDeps, '730')
    const install = library.get('730')?.install
    expect(install?.steamResumeInstalledAtStart).toBeUndefined()
    expect(install?.steamResumePending).toBe(false)
  })

  it('a fresh start without the flag overwrites a stale true', () => {
    markSteamNativeInstallStarted(steamTestDeps, '730', {
      targetSteamappsDir: '/s/steamapps',
      installdir: 'csgo',
      installedAtStart: true
    })
    markSteamNativeInstallStarted(steamTestDeps, '730', {
      targetSteamappsDir: '/s/steamapps',
      installdir: 'csgo'
    })
    expect(library.get('730')?.install?.steamResumeInstalledAtStart).toBe(false)
  })
})

// Phase 75-20: breadcrumbAppIsFullyInstalledOnDisk on the rust branch.
describe('breadcrumbAppIsFullyInstalledOnDisk, rust branch', () => {
  const prior = process.env.GAMELIB_STEAMFILES_TEXT
  beforeEach(() => {
    process.env.GAMELIB_STEAMFILES_TEXT = 'rust'
  })
  afterEach(() => {
    if (prior === undefined) delete process.env.GAMELIB_STEAMFILES_TEXT
    else process.env.GAMELIB_STEAMFILES_TEXT = prior
  })

  const install = { steamResumeTargetSteamappsDir: '/s/steamapps' }
  const read = (stateFlags: number | null, over = {}) => ({
    exists: true,
    parsed: true,
    readError: null,
    record: { stateFlags },
    ...over
  })
  const ask = (reply: () => unknown, inst: object | undefined = install) => {
    const stub = stubRustSteamFiles({
      steamfiles_read_acf: reply as never
    })
    return {
      stub,
      result: breadcrumbAppIsFullyInstalledOnDisk(stub, '730', inst)
    }
  }

  it('is true for a fully installed manifest and reads the breadcrumb dir', async () => {
    const { stub, result } = ask(() => read(4))
    expect(await result).toBe(true)
    expect(stub.calls).toEqual([
      {
        channel: 'steamfiles_read_acf',
        args: { path: join('/s/steamapps', 'appmanifest_730.acf') }
      }
    ])
  })

  it('is false while downloading', async () => {
    expect(await ask(() => read(1026)).result).toBe(false)
  })

  it('is false for a missing, unparseable or flagless manifest', async () => {
    expect(await ask(() => read(null, { exists: false })).result).toBe(false)
    expect(await ask(() => read(null, { parsed: false })).result).toBe(false)
    expect(await ask(() => read(null)).result).toBe(false)
  })

  it('is false without a breadcrumb dir and never calls Rust', async () => {
    const { stub, result } = ask(() => read(4), {})
    expect(await result).toBe(false)
    expect(stub.calls).toHaveLength(0)
  })

  it('is false when the invoke rejects', async () => {
    const { result } = ask(() => {
      throw new Error('down')
    })
    expect(await result).toBe(false)
  })
})
