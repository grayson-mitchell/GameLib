/**
 * Unit tests for the running-app poller (readRunningAppId, pollRunningOnce, start/stopRunningPoll).
 * Moved out of library.test.ts by Phase 65 plan 04 (D-03); mock preamble
 * copied.
 */

// ── Imports ───────────────────────────────────────────────────────────────────
import { existsSync, readFileSync } from 'graceful-fs'
import * as vdf from '@node-steam/vdf'
import { spawnSync, execFileSync } from 'child_process'
import { sendFrontendMessage } from '../../../ipc'
import { t as i18nextT } from 'i18next'
import { backfillBridgeLaunchTargets } from '../bridge/launchTarget'
import { listReadyBridgeBottleNames } from '../bridgeBottle'
import {
  readRunningAppId,
  pollRunningOnce,
  startRunningPoll,
  stopRunningPoll
} from '../library/runningPoll'

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

// ── @node-steam/vdf mock — parse() ───────────────────────────────────────────
jest.mock('@node-steam/vdf')

// ── IPC mock — sendFrontendMessage ───────────────────────────────────────────
jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

// ── dialog/dialog mock — notify (GAME-02/03: poller fires confirmed toast) ───
jest.mock('../../../dialog/dialog', () => ({
  notify: jest.fn()
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

// ── SteamUser mock — controls getClient() / isLoggedIn() return values ───────
jest.mock('../user')

// ── online_monitor mock — prevents electron/net import at module load time ───
jest.mock('backend/online_monitor', () => ({
  runOnceWhenOnline: jest.fn(),
  isOnline: jest.fn().mockReturnValue(false)
}))

// ── child_process mock — spawnSync (Windows reg.exe) + execFileSync (Linux ps,
// MAC32-03 lipo/file) ─────────────────────────────────────────────────────────
jest.mock('child_process', () => ({
  spawnSync: jest.fn(),
  execFileSync: jest.fn()
}))

// ── electron mock — dialog.showMessageBox (MAC32-03 i386 recovery confirm) +
// app.getPath (backend/constants/paths reads this at module load time) ───────
// library.ts's only electron usage is `dialog`; games.ts's `shell` import
// (pulled in transitively via `import SteamGame from './games'`) resolves to
// undefined here, which is fine — SteamGame.install()/forceUninstall() are
// only reached via a CONFIRMED promptI386Recovery, and this file's tests
// keep the dialog mocked to a cancel response unless a test explicitly opts
// into the confirm path.
jest.mock('backend/platform', () => ({
  dialog: { showMessageBox: jest.fn() },
  app: {
    getPath: jest.fn().mockReturnValue('/tmp/mock-path'),
    // Plain method (survives resetMocks) -- publicDir resolves it at module load.
    getAppPath: () => '/tmp/mock-path'
  },
  shell: { openExternal: jest.fn() }
}))

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
jest.mock('../anonymousClient', () => ({
  getAnonymousPicsClient: jest.fn()
}))
jest.mock('../bridge/launchTarget', () => ({
  backfillBridgeLaunchTargets: jest.fn()
}))
jest.mock('../platformCapture', () => ({
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
jest.mock('../steamDownloadMonitor', () => ({
  startSteamDownloadMonitor: jest.fn(),
  readSteamDownloadMonitor: jest.fn(),
  stopSteamDownloadMonitor: jest.fn()
}))
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

// ── GAME-05: readRunningAppId() — per-platform dispatch ───────────────────────

describe('readRunningAppId() — per-platform dispatch', () => {
  let envMock: any

  beforeEach(() => {
    envMock = jest.requireMock('backend/constants/environment')
    // Default: Linux
    envMock.isWindows = false
    envMock.isMac = false
    envMock.isLinux = true
  })

  describe('Windows platform', () => {
    beforeEach(() => {
      envMock.isWindows = true
      envMock.isMac = false
    })

    it('windowsRunningAppId: parses REG_DWORD 0x1b58 → 7000', () => {
      ;(spawnSync as jest.Mock).mockReturnValue({
        status: 0,
        stdout: 'RunningAppID    REG_DWORD    0x1b58'
      })
      expect(readRunningAppId()).toBe(7000)
    })

    it('windowsRunningAppId: returns 0 when reg.exe exits with non-zero status', () => {
      ;(spawnSync as jest.Mock).mockReturnValue({ status: 1, stdout: '' })
      expect(readRunningAppId()).toBe(0)
    })

    it('windowsRunningAppId: returns 0 when spawnSync throws', () => {
      ;(spawnSync as jest.Mock).mockImplementation(() => {
        throw new Error('reg.exe not available')
      })
      expect(readRunningAppId()).toBe(0)
    })

    it('windowsRunningAppId: returns 0 when RunningAppID not present in output', () => {
      ;(spawnSync as jest.Mock).mockReturnValue({
        status: 0,
        stdout:
          'ERROR: The system was unable to find the specified registry key'
      })
      expect(readRunningAppId()).toBe(0)
    })
  })

  describe('macOS platform', () => {
    beforeEach(() => {
      envMock.isWindows = false
      envMock.isMac = true
      envMock.isLinux = false
    })

    it('macOsRunningAppId: parses registry.vdf and returns numeric RunningAppID', () => {
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readFileSync as jest.Mock).mockReturnValue('vdf-content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        Registry: {
          HKCU: { Software: { Valve: { Steam: { RunningAppID: '440' } } } }
        }
      })
      expect(readRunningAppId()).toBe(440)
    })

    it('macOsRunningAppId: returns 0 when registry.vdf does not exist', () => {
      ;(existsSync as jest.Mock).mockReturnValue(false)
      expect(readRunningAppId()).toBe(0)
    })

    it('macOsRunningAppId: returns 0 when vdf.parse throws', () => {
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockImplementation(() => {
        throw new Error('parse error')
      })
      expect(readRunningAppId()).toBe(0)
    })

    it('macOsRunningAppId: returns 0 when RunningAppID key is missing in VDF', () => {
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({ Registry: {} })
      expect(readRunningAppId()).toBe(0)
    })
  })

  describe('Linux platform', () => {
    it('linuxRegistryVdfRunningAppId: returns VDF RunningAppID when non-zero', () => {
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        Registry: {
          HKCU: { Software: { Valve: { Steam: { RunningAppID: '570' } } } }
        }
      })
      expect(readRunningAppId()).toBe(570)
    })

    it('linuxFallbackRunningAppId: falls back to reaper process scan when VDF RunningAppID is 0', () => {
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        Registry: {
          HKCU: { Software: { Valve: { Steam: { RunningAppID: '0' } } } }
        }
      })
      ;(execFileSync as jest.Mock).mockReturnValue(
        'reaper SteamLaunch --AppId 440 -- /path/to/game'
      )
      expect(readRunningAppId()).toBe(440)
    })

    it('linuxFallbackRunningAppId: returns 0 when VDF is 0 and reaper scan finds nothing', () => {
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        Registry: {
          HKCU: { Software: { Valve: { Steam: { RunningAppID: '0' } } } }
        }
      })
      ;(execFileSync as jest.Mock).mockReturnValue('no reaper here')
      expect(readRunningAppId()).toBe(0)
    })

    it('linuxFallbackRunningAppId: returns 0 when execFileSync throws', () => {
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        Registry: {
          HKCU: { Software: { Valve: { Steam: { RunningAppID: '0' } } } }
        }
      })
      ;(execFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('ps not available')
      })
      expect(readRunningAppId()).toBe(0)
    })
  })
})

// ── GAME-05: pollRunningOnce() ────────────────────────────────────────────────

describe('pollRunningOnce()', () => {
  let envMock: any

  // Helper: configure vdf.parse to return a specific RunningAppID value
  const mockRunningAppId = (appId: number): void => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      Registry: {
        HKCU: {
          Software: { Valve: { Steam: { RunningAppID: String(appId) } } }
        }
      }
    })
  }

  beforeEach(() => {
    envMock = jest.requireMock('backend/constants/environment')
    // Use macOS path for simple VDF-based control
    envMock.isWindows = false
    envMock.isMac = true
    envMock.isLinux = false
    // Reset lastKnownRunningAppId to 0 between tests
    stopRunningPoll()
  })

  it('sends gameStatusUpdate { status: "playing" } when RunningAppID goes 0→X', () => {
    mockRunningAppId(440)
    pollRunningOnce()
    expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: '440',
      runner: 'steam',
      status: 'playing'
    })
  })

  it('does NOT send a "done" message on 0→X transition (no prior game)', () => {
    mockRunningAppId(440)
    pollRunningOnce()
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({ status: 'done' })
    )
  })

  it('sends gameStatusUpdate { status: "done" } when RunningAppID goes X→0', () => {
    // Establish X=440 as the known running game
    mockRunningAppId(440)
    pollRunningOnce()
    ;(sendFrontendMessage as jest.Mock).mockClear()

    mockRunningAppId(0)
    pollRunningOnce()

    expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: '440',
      runner: 'steam',
      status: 'done'
    })
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({ status: 'playing' })
    )
  })

  it('sends no message when RunningAppID is unchanged', () => {
    mockRunningAppId(440)
    pollRunningOnce() // 0→440
    ;(sendFrontendMessage as jest.Mock).mockClear()

    // Same value — no delta
    pollRunningOnce()
    expect(sendFrontendMessage).not.toHaveBeenCalled()
  })

  it('sends done for old ID and playing for new ID on X→Y transition', () => {
    mockRunningAppId(440)
    pollRunningOnce() // 0→440
    ;(sendFrontendMessage as jest.Mock).mockClear()

    mockRunningAppId(570)
    pollRunningOnce() // 440→570

    expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: '440',
      runner: 'steam',
      status: 'done'
    })
    expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: '570',
      runner: 'steam',
      status: 'playing'
    })
  })
})

// ── GAME-05: startRunningPoll() / stopRunningPoll() lifecycle ─────────────────

describe('startRunningPoll() and stopRunningPoll()', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    stopRunningPoll() // reset state (clears timer + lastKnownRunningAppId)
  })

  afterEach(() => {
    stopRunningPoll()
    jest.useRealTimers()
  })

  it('startRunningPoll is idempotent — second call does not create a second timer', () => {
    const spy = jest.spyOn(global, 'setInterval')
    startRunningPoll(5000)
    startRunningPoll(5000) // second call is a no-op
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('stopRunningPoll clears the timer so a subsequent startRunningPoll creates a new one', () => {
    const spy = jest.spyOn(global, 'setInterval')
    startRunningPoll(5000)
    stopRunningPoll()
    startRunningPoll(5000) // new registration after stop
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })
})
