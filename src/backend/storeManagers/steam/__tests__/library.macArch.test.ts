import {
  createTestManagerDeps,
  createInertSteamProcesses,
  createTestStores
} from 'backend/testUtils/testServices'
/**
 * Unit tests for steam/library/macArch.ts (Mach-O ground-truth check, i386
 * recovery). Moved out of library.test.ts by Phase 65 plan 03 (D-03); mock
 * preamble copied.
 */

// ── Imports ───────────────────────────────────────────────────────────────────
import { createTestHostServices } from 'backend/testUtils/testHostServices'
import SteamLibraryManager from '../library'
import { startInstallPolling } from '../library/installPolling'
import { stopInstallPolling } from '../library/installStop'
import { locateMachOBinary, verifyMacArchGroundTruth } from '../library/macArch'
import { machOArchsOfAsync, verdictFromArchs } from 'backend/utils/macArch'
import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import {
  vdf,
  mockedFsSteamFiles
} from '../localFiles/__tests__/fixtures/mockedFsSteamFiles'
import { getSteamLibraries, getFileSize } from 'backend/utils'
import { reportDetectedFix } from 'backend/knownFixReport'
const sendFrontendMessage = jest.fn()
import { t as i18nextT } from 'i18next'
import { backfillBridgeLaunchTargets } from '../bridge/launchTarget'
import { getBottleSteamappsDir } from '../bottle'
import { listReadyBridgeBottleNames } from '../bridgeBottle'
import { join } from 'path'
import type { ManagerDeps, Stores } from 'backend/services/types'

const { steamLibraryStore, steamMetadataStore } =
  jest.requireMock<Stores['steam']>('../stores')
const steamStoresModule = jest.requireMock<Stores['steam']>('../stores')

// The lipo/file probes run on the runner. `probe(cmd, argv)` scripts them in the shape the
// pre-runner tests used: a return value is a clean exit's stdout, a throw is a failed tool.
const probe = jest.fn<string, [string, readonly string[]]>()
const archRunner = {
  run: (cmd: string, argv: readonly string[]) => {
    try {
      return Promise.resolve({
        code: 0,
        signal: null,
        stdout: String(probe(cmd, argv) ?? ''),
        stderr: '',
        timedOut: false,
        aborted: false,
        truncated: false,
        pid: undefined
      })
    } catch {
      return Promise.resolve({
        code: 1,
        signal: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        aborted: false,
        truncated: false,
        pid: undefined
      })
    }
  }
} as unknown as ManagerDeps['runner']

// 66.3-15: the bottle helpers are read through the deps slice, so they are plain mocks here.
const getSteamBottleSettings = jest.fn()
const isSteamBottleProvisioned = jest.fn()
// The i386-recovery confirm goes through deps.dialogs; this recording fake is what it calls.
const dialog = { showMessageBox: jest.fn() }
const steamTestDeps = createTestManagerDeps({
  requestRustInvoke: mockedFsSteamFiles().requestRustInvoke,
  sendFrontendMessage,
  steamBottle: { getSteamBottleSettings, isSteamBottleProvisioned } as never,
  dialogs: {
    ...createTestHostServices().dialogs,
    showMessageBox: (...a: unknown[]) => dialog.showMessageBox(...a)
  },
  steamProcesses: createInertSteamProcesses(),
  stores: createTestStores({ steam: steamStoresModule }),
  runner: archRunner
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

jest.mock('backend/knownFixReport', () => ({
  reportDetectedFix: jest.fn(),
  knownFixReportDeps: () => ({ post: () => undefined })
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

// ── MAC32-03: Mach-O classification primitives ───────────────────────────────

/** Flush pending microtask/macrotask queues (real timers only). */
const flushAsync = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('machOArchsOfAsync()', () => {
  it('runs lipo -archs argv-form and returns the space-split arch list', async () => {
    probe.mockReturnValue('x86_64 arm64\n')

    const result = await machOArchsOfAsync(
      { runner: archRunner },
      '/Games/Foo.app/Contents/MacOS/Foo'
    )

    expect(probe).toHaveBeenCalledWith('lipo', [
      '-archs',
      '/Games/Foo.app/Contents/MacOS/Foo'
    ])
    expect(result).toEqual(['x86_64', 'arm64'])
  })

  it('falls back to `file` when lipo fails, and still classifies correctly', async () => {
    probe.mockImplementation((cmd: string) => {
      if (cmd === 'lipo') throw new Error('lipo not found')
      if (cmd === 'file') {
        return '/Games/Foo.app/Contents/MacOS/Foo: Mach-O executable i386\n'
      }
      throw new Error(`unexpected command ${cmd}`)
    })

    const result = await machOArchsOfAsync(
      { runner: archRunner },
      '/Games/Foo.app/Contents/MacOS/Foo'
    )

    expect(probe).toHaveBeenCalledWith('file', [
      '/Games/Foo.app/Contents/MacOS/Foo'
    ])
    expect(result).toEqual(['i386'])
  })

  it('returns [] (inconclusive) when BOTH lipo and file fail — never a 32-bit verdict', async () => {
    probe.mockImplementation(() => {
      throw new Error('neither tool available')
    })

    const result = await machOArchsOfAsync(
      { runner: archRunner },
      '/Games/Foo.app/Contents/MacOS/Foo'
    )

    expect(result).toEqual([])
  })
})

describe('verdictFromArchs()', () => {
  it("maps ['i386'] to '32'", () => {
    expect(verdictFromArchs(['i386'])).toBe('32')
  })

  it("maps ['x86_64'] to '64'", () => {
    expect(verdictFromArchs(['x86_64'])).toBe('64')
  })

  it("maps ['x86_64','arm64'] to '64'", () => {
    expect(verdictFromArchs(['x86_64', 'arm64'])).toBe('64')
  })

  it("maps ['i386','x86_64'] to '64' — any 64 wins over i386 (universal binary)", () => {
    expect(verdictFromArchs(['i386', 'x86_64'])).toBe('64')
  })

  it('maps [] to null — inconclusive, must NOT be coerced to 32', () => {
    expect(verdictFromArchs([])).toBeNull()
  })
})

describe('locateMachOBinary()', () => {
  const INSTALL_PATH = join('/steam', 'steamapps', 'common', 'oldgame')

  beforeEach(() => {
    ;(existsSync as jest.Mock).mockReset()
    ;(readdirSync as jest.Mock).mockReset()
  })

  it('prefers a supplied launch executable path when it exists', () => {
    const launchExe = join('OldGame.app', 'Contents', 'MacOS', 'OldGame')
    ;(existsSync as jest.Mock).mockImplementation(
      (p: string) => p === join(INSTALL_PATH, launchExe)
    )

    const result = locateMachOBinary(INSTALL_PATH, launchExe)

    expect(result).toBe(join(INSTALL_PATH, launchExe))
    expect(readdirSync).not.toHaveBeenCalled()
  })

  it('scans for a top-level *.app bundle and returns Contents/MacOS/<first bin> when no launch executable is supplied', () => {
    const macOsDir = join(INSTALL_PATH, 'OldGame.app', 'Contents', 'MacOS')
    ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
      if (dir === INSTALL_PATH) return ['OldGame.app', 'readme.txt']
      if (dir === macOsDir) return ['OldGame']
      return []
    })
    ;(existsSync as jest.Mock).mockReturnValue(true)

    const result = locateMachOBinary(INSTALL_PATH)

    expect(result).toBe(join(macOsDir, 'OldGame'))
  })

  it('returns null (no throw) when no *.app bundle is found', () => {
    ;(readdirSync as jest.Mock).mockReturnValue(['readme.txt'])

    expect(locateMachOBinary(INSTALL_PATH)).toBeNull()
  })

  it('returns null (no throw) when readdirSync throws', () => {
    ;(readdirSync as jest.Mock).mockImplementation(() => {
      throw new Error('ENOENT')
    })

    expect(locateMachOBinary(INSTALL_PATH)).toBeNull()
  })

  it('returns null when the *.app bundle has no Contents/MacOS dir', () => {
    ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
      dir === INSTALL_PATH ? ['OldGame.app'] : []
    )
    ;(existsSync as jest.Mock).mockReturnValue(false)

    expect(locateMachOBinary(INSTALL_PATH)).toBeNull()
  })

  // T-18-03-04: a launchExecutable that escapes installPath's subtree must be
  // rejected, never filesystem-touched — join() alone does not contain '../'.
  it('rejects a launchExecutable that escapes installPath via ".." traversal (never touches the filesystem)', () => {
    ;(existsSync as jest.Mock).mockReturnValue(true) // even if it "exists", it must be refused
    ;(readdirSync as jest.Mock).mockReturnValue([]) // fall-through scan finds nothing

    const result = locateMachOBinary(INSTALL_PATH, '../../../../etc/passwd')

    expect(result).toBeNull()
    // The escaped candidate must never be returned, and existsSync must never
    // be consulted for it (containment is checked before the fs probe).
    expect(existsSync).not.toHaveBeenCalledWith(
      join(INSTALL_PATH, '../../../../etc/passwd')
    )
  })

  it('rejects a launchExecutable that resolves to an absolute path outside installPath', () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue([])

    const result = locateMachOBinary(INSTALL_PATH, '/etc/passwd')

    expect(result).toBeNull()
  })
})

describe('verifyMacArchGroundTruth() — MAC32-03', () => {
  const APP_ID = '226840'
  const INSTALL_PATH = join('/steam', 'steamapps', 'common', 'oldgame')
  const MACOS_DIR = join(INSTALL_PATH, 'OldGame.app', 'Contents', 'MacOS')

  let envMock: any

  beforeEach(() => {
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isWindows = false
    envMock.isMac = true
    envMock.isLinux = false
    ;(existsSync as jest.Mock).mockReset()
    ;(readdirSync as jest.Mock).mockReset()
    probe.mockReset()
    ;(steamMetadataStore.get as jest.Mock).mockReset()
    ;(steamMetadataStore.set as jest.Mock).mockReset()
    // Default to a cancel response — tests that exercise the confirm path
    // (games.test.ts, MAC32-03 Task 3) override this explicitly. Prevents an
    // unhandled rejection from the fire-and-forget promptI386Recovery call
    // on an i386 flip.
    dialog.showMessageBox.mockResolvedValue({ response: 1 })
  })

  afterEach(() => {
    envMock.isWindows = false
    envMock.isMac = false
    envMock.isLinux = true
    // CR-01 regression test seeds the real library Map (imported from
    // '../state') — clean it up so it never leaks into sibling tests.
    library.delete(APP_ID)
  })

  it("skips entirely (no subprocess, no cache write) when source==='bottle'", async () => {
    await verifyMacArchGroundTruth(
      steamTestDeps,
      APP_ID,
      INSTALL_PATH,
      'bottle'
    )

    expect(probe).not.toHaveBeenCalled()
    expect(readdirSync).not.toHaveBeenCalled()
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
  })

  it('skips when !isMac (non-macOS host)', async () => {
    envMock.isMac = false

    await verifyMacArchGroundTruth(
      steamTestDeps,
      APP_ID,
      INSTALL_PATH,
      'native'
    )

    expect(probe).not.toHaveBeenCalled()
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
  })

  it("skips when mac_arch is already '32' (nothing to correct)", async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({ mac_arch: '32' })

    await verifyMacArchGroundTruth(
      steamTestDeps,
      APP_ID,
      INSTALL_PATH,
      'native'
    )

    expect(probe).not.toHaveBeenCalled()
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
  })

  it('skips when mac_arch_verified is already true (already resolved)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      mac_arch: '64',
      mac_arch_verified: true
    })

    await verifyMacArchGroundTruth(
      steamTestDeps,
      APP_ID,
      INSTALL_PATH,
      'native'
    )

    expect(probe).not.toHaveBeenCalled()
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
  })

  it('logs+skips (no cache write) when locateMachOBinary finds nothing', async () => {
    ;(readdirSync as jest.Mock).mockReturnValue(['readme.txt'])
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)

    await verifyMacArchGroundTruth(
      steamTestDeps,
      APP_ID,
      INSTALL_PATH,
      'native'
    )

    expect(steamMetadataStore.set).not.toHaveBeenCalled()
  })

  it('inconclusive verdict (both tools fail) does NOT overwrite an existing mac_arch hint', async () => {
    ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
      if (dir === INSTALL_PATH) return ['OldGame.app']
      if (dir === MACOS_DIR) return ['OldGame']
      return []
    })
    ;(existsSync as jest.Mock).mockReturnValue(true)
    probe.mockImplementation(() => {
      throw new Error('neither tool available')
    })
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      mac_arch: 'unknown',
      mac_arch_source: 'minos'
    })

    await verifyMacArchGroundTruth(
      steamTestDeps,
      APP_ID,
      INSTALL_PATH,
      'native'
    )

    expect(steamMetadataStore.set).not.toHaveBeenCalled()
  })

  it("i386-only binary — persists mac_arch '32', mac_arch_source 'macho', mac_arch_verified true, spreading existing fields", async () => {
    ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
      if (dir === INSTALL_PATH) return ['OldGame.app']
      if (dir === MACOS_DIR) return ['OldGame']
      return []
    })
    ;(existsSync as jest.Mock).mockReturnValue(true)
    probe.mockImplementation((cmd: string) => {
      if (cmd === 'lipo') return 'i386\n'
      throw new Error(`unexpected command ${cmd}`)
    })
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      art_cover: 'cover.jpg',
      art_square: 'square.jpg',
      extra: { reqs: [] },
      is_mac_native: true,
      platformsCaptured: true
    })

    await verifyMacArchGroundTruth(
      steamTestDeps,
      APP_ID,
      INSTALL_PATH,
      'native'
    )

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        art_cover: 'cover.jpg',
        art_square: 'square.jpg',
        is_mac_native: true,
        platformsCaptured: true,
        mac_arch: '32',
        mac_arch_source: 'macho',
        mac_arch_verified: true
      })
    )
  })

  it("x86_64 present — persists mac_arch '64' confirmed (Mach-O ground truth)", async () => {
    ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
      if (dir === INSTALL_PATH) return ['OldGame.app']
      if (dir === MACOS_DIR) return ['OldGame']
      return []
    })
    ;(existsSync as jest.Mock).mockReturnValue(true)
    probe.mockImplementation((cmd: string) => {
      if (cmd === 'lipo') return 'x86_64\n'
      throw new Error(`unexpected command ${cmd}`)
    })
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      art_cover: '',
      art_square: '',
      extra: { reqs: [] }
    })

    await verifyMacArchGroundTruth(
      steamTestDeps,
      APP_ID,
      INSTALL_PATH,
      'native'
    )

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        mac_arch: '64',
        mac_arch_source: 'macho',
        mac_arch_verified: true
      })
    )
  })

  describe('Phase 57 report hook', () => {
    const arrange = (lipoOut: string, meta: Record<string, unknown>) => {
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === INSTALL_PATH) return ['OldGame.app']
        if (dir === MACOS_DIR) return ['OldGame']
        return []
      })
      ;(existsSync as jest.Mock).mockReturnValue(true)
      probe.mockImplementation((cmd: string) => {
        if (cmd === 'lipo') return lipoOut
        throw new Error(`unexpected command ${cmd}`)
      })
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue(meta)
    }

    beforeEach(() => {
      ;(reportDetectedFix as jest.Mock).mockReset()
    })

    it("reports a '32' verdict once as macArch add", async () => {
      arrange('i386\n', { art_cover: '', art_square: '', extra: { reqs: [] } })
      await verifyMacArchGroundTruth(
        steamTestDeps,
        APP_ID,
        INSTALL_PATH,
        'native'
      )
      expect(reportDetectedFix).toHaveBeenCalledTimes(1)
      expect(reportDetectedFix).toHaveBeenCalledWith(
        {
          appId: APP_ID,
          key: 'macArch',
          op: 'add',
          detector: 'macho'
        },
        expect.objectContaining({ post: expect.any(Function) })
      )
    })

    it("reports a curated '32' contradicted by '64' as macArch remove", async () => {
      arrange('x86_64\n', { mac_arch: '32', mac_arch_source: 'known-fix' })
      await verifyMacArchGroundTruth(
        steamTestDeps,
        APP_ID,
        INSTALL_PATH,
        'native'
      )
      expect(reportDetectedFix).toHaveBeenCalledTimes(1)
      expect(reportDetectedFix).toHaveBeenCalledWith(
        {
          appId: APP_ID,
          key: 'macArch',
          op: 'remove',
          detector: 'macho'
        },
        expect.objectContaining({ post: expect.any(Function) })
      )
    })

    it("reports nothing for a plain '64' verdict", async () => {
      arrange('x86_64\n', {
        art_cover: '',
        art_square: '',
        extra: { reqs: [] }
      })
      await verifyMacArchGroundTruth(
        steamTestDeps,
        APP_ID,
        INSTALL_PATH,
        'native'
      )
      expect(reportDetectedFix).not.toHaveBeenCalled()
    })

    it('reports nothing on the early-return paths', async () => {
      await verifyMacArchGroundTruth(
        steamTestDeps,
        APP_ID,
        INSTALL_PATH,
        'bottle'
      )
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        mac_arch: '64',
        mac_arch_verified: true
      })
      await verifyMacArchGroundTruth(
        steamTestDeps,
        APP_ID,
        INSTALL_PATH,
        'native'
      )
      envMock.isMac = false
      await verifyMacArchGroundTruth(
        steamTestDeps,
        APP_ID,
        INSTALL_PATH,
        'native'
      )
      expect(reportDetectedFix).not.toHaveBeenCalled()
    })

    it('still resolves when the hook never settles', async () => {
      ;(reportDetectedFix as jest.Mock).mockImplementation(
        () => new Promise(() => undefined)
      )
      arrange('i386\n', { art_cover: '', art_square: '', extra: { reqs: [] } })
      await expect(
        verifyMacArchGroundTruth(steamTestDeps, APP_ID, INSTALL_PATH, 'native')
      ).resolves.toBeUndefined()
    })
  })

  describe('quick 261027-bqe: curated known-fix seed', () => {
    const arrange = (lipoOut: string, meta: Record<string, unknown>) => {
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === INSTALL_PATH) return ['OldGame.app']
        if (dir === MACOS_DIR) return ['OldGame']
        return []
      })
      ;(existsSync as jest.Mock).mockReturnValue(true)
      probe.mockImplementation((cmd: string) => {
        if (cmd === 'lipo') return lipoOut
        throw new Error(`unexpected command ${cmd}`)
      })
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue(meta)
    }
    const logger = () =>
      jest.requireMock<{ logInfo: jest.Mock; logWarning: jest.Mock }>(
        'backend/logger'
      )

    it("a known-fix '32' seed does not skip: Mach-O '32' is persisted as macho/verified", async () => {
      arrange('i386\n', { mac_arch: '32', mac_arch_source: 'known-fix' })
      await verifyMacArchGroundTruth(
        steamTestDeps,
        APP_ID,
        INSTALL_PATH,
        'native'
      )
      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock handle, never invoked unbound
      expect(steamMetadataStore.set).toHaveBeenCalledWith(
        APP_ID,
        expect.objectContaining({
          mac_arch: '32',
          mac_arch_source: 'macho',
          mac_arch_verified: true
        })
      )
    })

    it("a known-fix '32' seed contradicted by Mach-O '64' persists '64' and warns", async () => {
      arrange('x86_64\n', { mac_arch: '32', mac_arch_source: 'known-fix' })
      await verifyMacArchGroundTruth(
        steamTestDeps,
        APP_ID,
        INSTALL_PATH,
        'native'
      )
      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock handle, never invoked unbound
      expect(steamMetadataStore.set).toHaveBeenCalledWith(
        APP_ID,
        expect.objectContaining({
          mac_arch: '64',
          mac_arch_source: 'macho',
          mac_arch_verified: true
        })
      )
      expect(
        logger().logWarning.mock.calls.some((c: unknown[]) =>
          /contradicted/.test(String(c[0]))
        )
      ).toBe(true)
    })

    it("any '32' verdict logs a paste-ready known-fixes entry", async () => {
      arrange('i386\n', { art_cover: '', art_square: '', extra: { reqs: [] } })
      await verifyMacArchGroundTruth(
        steamTestDeps,
        APP_ID,
        INSTALL_PATH,
        'native'
      )
      expect(
        logger().logInfo.mock.calls.some(
          (c: unknown[]) =>
            String(c[0]).includes('-steam.json') &&
            String(c[0]).includes('"macArch":"32"')
        )
      ).toBe(true)
    })

    it("a macho '32' entry still short-circuits", async () => {
      arrange('i386\n', { mac_arch: '32', mac_arch_source: 'macho' })
      await verifyMacArchGroundTruth(
        steamTestDeps,
        APP_ID,
        INSTALL_PATH,
        'native'
      )
      expect(probe).not.toHaveBeenCalled()
      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock handle, never invoked unbound
      expect(steamMetadataStore.set).not.toHaveBeenCalled()
    })
  })

  it('MAC32-03/CONTEXT D-6: an i386 flip triggers the user-consent dialog (never a silent uninstall) — decoupled fire-and-forget, cancel leaves the cached verdict untouched', async () => {
    ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
      if (dir === INSTALL_PATH) return ['OldGame.app']
      if (dir === MACOS_DIR) return ['OldGame']
      return []
    })
    ;(existsSync as jest.Mock).mockReturnValue(true)
    probe.mockImplementation((cmd: string) => {
      if (cmd === 'lipo') return 'i386\n'
      throw new Error(`unexpected command ${cmd}`)
    })
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      art_cover: '',
      art_square: '',
      extra: { reqs: [] }
    })
    dialog.showMessageBox.mockResolvedValue({ response: 1 })

    await verifyMacArchGroundTruth(
      steamTestDeps,
      APP_ID,
      INSTALL_PATH,
      'native'
    )
    // Fire-and-forget: the dialog call itself runs synchronously up to its
    // own first await when promptI386Recovery is invoked, so it has already
    // been recorded by the time verifyMacArchGroundTruth returns.
    await flushAsync()

    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1)
    // Cancelled — the '32' verdict persisted just above is left untouched
    // (no second steamMetadataStore.set call from the recovery path).
    expect(steamMetadataStore.set).toHaveBeenCalledTimes(1)
  })

  // ── CR-01 gap closure (18-05): verdict reaches the frontend-visible ───────
  // in-memory library Map + pushGameToLibrary payload, not just
  // steamMetadataStore (backend disk cache).

  it('CR-01: an i386 verdict updates the in-memory library Map and pushes the updated GameInfo to the frontend', async () => {
    // Seed the real library Map (imported from '../state') with an existing
    // GameInfo for APP_ID — the propagation fix only updates entries already
    // present in the Map (never fabricates one).
    library.set(APP_ID, {
      runner: 'steam',
      app_name: APP_ID,
      title: 'Old Game',
      is_installed: true,
      install: { install_path: INSTALL_PATH },
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)
    ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
      if (dir === INSTALL_PATH) return ['OldGame.app']
      if (dir === MACOS_DIR) return ['OldGame']
      return []
    })
    ;(existsSync as jest.Mock).mockReturnValue(true)
    probe.mockImplementation((cmd: string) => {
      if (cmd === 'lipo') return 'i386\n'
      throw new Error(`unexpected command ${cmd}`)
    })
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      art_cover: '',
      art_square: '',
      extra: { reqs: [] }
    })
    // Cancel path — promptI386Recovery is a no-op, keeps this test focused
    // on the propagation fix rather than the recovery dialog flow.
    dialog.showMessageBox.mockResolvedValue({ response: 1 })

    await verifyMacArchGroundTruth(
      steamTestDeps,
      APP_ID,
      INSTALL_PATH,
      'native'
    )

    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: APP_ID, mac_arch: '32' })
    )
    expect(library.get(APP_ID)?.mac_arch).toBe('32')
    expect(steamLibraryStore.set).toHaveBeenCalledWith(
      'games',
      expect.arrayContaining([
        expect.objectContaining({ app_name: APP_ID, mac_arch: '32' })
      ])
    )
  })

  it('CR-01: does not push or throw when appId is not present in the in-memory library Map', async () => {
    // library does not have APP_ID (afterEach deletes it)
    ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
      if (dir === INSTALL_PATH) return ['OldGame.app']
      if (dir === MACOS_DIR) return ['OldGame']
      return []
    })
    ;(existsSync as jest.Mock).mockReturnValue(true)
    probe.mockImplementation((cmd: string) =>
      cmd === 'lipo'
        ? 'i386\n'
        : (() => {
            throw new Error('unexpected')
          })()
    )
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      art_cover: '',
      art_square: '',
      extra: { reqs: [] }
    })
    dialog.showMessageBox.mockResolvedValue({ response: 1 })

    await expect(
      verifyMacArchGroundTruth(steamTestDeps, APP_ID, INSTALL_PATH, 'native')
    ).resolves.not.toThrow()

    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: APP_ID })
    )
    expect(library.has(APP_ID)).toBe(false)
  })
})

// ── quick 261024-exo: arch check after a delegated steam://install ────────────

describe('delegated install -> verifyMacArchGroundTruth (quick 261024-exo)', () => {
  const APP_ID = '226840'
  const STEAMAPPS = join('/steam', 'steamapps')
  const INSTALL_PATH = join(STEAMAPPS, 'common', 'oldgame')
  const MACOS_DIR = join(INSTALL_PATH, 'OldGame.app', 'Contents', 'MacOS')

  let envMock: any
  let manifestPresent = false

  // flushAsync() waits on setImmediate, which fake timers freeze — drain the
  // microtask queue instead (verifyMacArchGroundTruth is sync-probe + awaits).
  const flushMicrotasks = async () => {
    for (let i = 0; i < 25; i++) await Promise.resolve()
  }

  const seedGame = () =>
    library.set(APP_ID, {
      runner: 'steam',
      app_name: APP_ID,
      title: 'Old Game',
      is_installed: false,
      install: {},
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)

  beforeEach(() => {
    jest.useFakeTimers()
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isWindows = false
    envMock.isMac = true
    envMock.isLinux = false
    manifestPresent = false
    library.clear()
    seedGame()
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])
    jest.mocked(isSteamBottleProvisioned).mockReturnValue(false)
    jest
      .mocked(getFileSize)
      .mockImplementation((bytes: unknown) => `${String(bytes)} B`)
    ;(existsSync as jest.Mock).mockImplementation(
      (p: string) => !String(p).includes('appmanifest_') || manifestPresent
    )
    ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
      if (dir === STEAMAPPS) return [`appmanifest_${APP_ID}.acf`]
      if (dir === INSTALL_PATH) return ['OldGame.app']
      if (dir === MACOS_DIR) return ['OldGame']
      return []
    })
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    probe.mockReset()
    probe.mockImplementation((cmd: string) => {
      if (cmd === 'lipo') return 'i386\n'
      throw new Error(`unexpected command ${cmd}`)
    })
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      art_cover: 'cover.jpg'
    })
    ;(steamMetadataStore.set as jest.Mock).mockReset()
    dialog.showMessageBox.mockReset()
    dialog.showMessageBox.mockResolvedValue({ response: 1 })
  })

  afterEach(() => {
    stopInstallPolling(steamTestDeps, APP_ID)
    envMock.isMac = false
    envMock.isLinux = true
    library.clear()
    jest.useRealTimers()
  })

  const installedAcf = {
    AppState: {
      appid: APP_ID,
      StateFlags: '4',
      installdir: 'oldgame',
      SizeOnDisk: '50000'
    }
  }
  const downloadingAcf = {
    AppState: {
      appid: APP_ID,
      StateFlags: '1026',
      installdir: 'oldgame',
      SizeOnDisk: '0',
      BytesDownloaded: '5',
      BytesToDownload: '10'
    }
  }

  async function runDelegatedPoll(source: 'native' | 'bottle') {
    if (source === 'bottle') {
      jest.mocked(getBottleSteamappsDir).mockReturnValue(STEAMAPPS)
      jest
        .mocked(getSteamBottleSettings)
        .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as never)
    }
    startInstallPolling(steamTestDeps, APP_ID, {
      intervalMs: 10,
      source,
      delegatedToSteamClient: true
    })
    await jest.advanceTimersByTimeAsync(30) // absent
    manifestPresent = true
    vdf.parse.mockReturnValue(downloadingAcf)
    await jest.advanceTimersByTimeAsync(20)
    vdf.parse.mockReturnValue(installedAcf)
    await jest.advanceTimersByTimeAsync(20)
    await flushMicrotasks()
  }

  it('E1: a delegated native poll reaching FullyInstalled runs the Mach-O check and offers i386 recovery', async () => {
    await runDelegatedPoll('native')

    expect(library.get(APP_ID)?.is_installed).toBe(true)
    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ mac_arch: '32', mac_arch_verified: true })
    )
    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1)
  })

  it('E2: no Mach-O check or dialog on a non-mac host, nor for a delegated bottle poll', async () => {
    envMock.isMac = false
    await runDelegatedPoll('native')
    expect(probe).not.toHaveBeenCalled()
    expect(dialog.showMessageBox).not.toHaveBeenCalled()

    stopInstallPolling(steamTestDeps, APP_ID)
    envMock.isMac = true
    manifestPresent = false
    seedGame()
    await runDelegatedPoll('bottle')
    expect(probe).not.toHaveBeenCalled()
    expect(dialog.showMessageBox).not.toHaveBeenCalled()
  })

  it('E3: focus reconciliation catches a native false->true flip with no live poll and offers i386 recovery once', async () => {
    manifestPresent = true
    vdf.parse.mockReturnValue(installedAcf)

    await new SteamLibraryManager(steamTestDeps).refreshInstallState()
    await flushMicrotasks()

    expect(library.get(APP_ID)?.is_installed).toBe(true)
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: APP_ID, is_installed: true })
    )
    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1)
  })

  it('E4: with a live poll registered for the appId, focus reconciliation flips the badge but leaves the arch check to the poll', async () => {
    manifestPresent = true
    vdf.parse.mockReturnValue(installedAcf)
    // Long interval: the poll is registered but never ticks during the test.
    startInstallPolling(steamTestDeps, APP_ID, {
      intervalMs: 1_000_000,
      delegatedToSteamClient: true
    })

    await new SteamLibraryManager(steamTestDeps).refreshInstallState()
    await flushMicrotasks()

    expect(library.get(APP_ID)?.is_installed).toBe(true)
    expect(probe).not.toHaveBeenCalled()
    expect(dialog.showMessageBox).not.toHaveBeenCalled()
  })
})
