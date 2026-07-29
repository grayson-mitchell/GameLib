/**
 * Bidirectional registration-kind proof, containment proof, send-body-safety proof and the
 * darwin `GAMELIB_SHELL_EXE` pin for the sidecar's 4 desktop-shortcut/hotkey channels (Phase 34.5
 * Plan 08 — Task 3, REQ-34.5-05).
 *
 * Mirrors `humbleLoginFlows.test.ts`'s Describe 1 template (registration-kind cross-check, both
 * directions) for the kind-check block. `getGame`/`handleExit` (`backend/utils`), `notify`
 * (`backend/dialog/dialog`), `sendFrontendMessage` (`backend/ipc`) and `backend/logger` are
 * factory-mocked so this suite proves *registration, the guard shape, and (for `addShortcut`
 * specifically) the real `shortcuts.ts` darwin `.app`/`run.sh` write path* — not `getGame`'s own
 * store-manager plumbing (covered elsewhere) or `notify`'s `Notification` forwarding (covered by
 * `lifecycleStub.test.ts`).
 *
 * Containment: this file relies ENTIRELY on the structural `jest.setupContainment.ts` mock
 * (`setupFiles`, active for every backend test file before this file's own imports run) rather
 * than adding a redundant local `jest.mock('os', ...)`. This deliberately follows
 * `pathShim.test.ts`'s (Phase 34.5 Plan 01, same phase) own stated reasoning: a second,
 * differently-scoped `homedir()` override in this file would be redundant with, and could
 * disagree with, the structural mock already installed — and this suite specifically needs to
 * compare its resolved paths against `realHomeAtSetup` (the one pre-redirect real home the
 * structural mock itself exports), which only stays meaningful if this file does not install a
 * second, different redirection on top of it. This is the first suite in the slice whose code
 * path (via `addShortcut`) writes real files (`.app`/`Info.plist`/`run.sh`) outside the app-support
 * dir by design — every one of those writes lands under `os.homedir()`, i.e. the structurally
 * redirected containment root, never the developer's real `~/Applications`.
 *
 * `addShortcut`'s darwin exe pin drives the REAL `shortcuts/shortcuts/shortcuts.ts` `addShortcuts`/
 * `generateMacOsApp` chain (imported directly, not mocked) so the assertion proves the real code
 * path, not a re-implementation. `getIcon` (`backend/shortcuts/utils`), `nativeImage.createFromBuffer`
 * (`electron`, only this one member overridden — `app.getPath` stays the REAL `electronStub`
 * forward to `pathShim.ts`, which is the whole point) and `IconIcns` (`@shockpkg/icon-encoder`)
 * are the three dependencies `convertPngToICNS` (module-private, try/catch-wrapped, returns false
 * on ANY failure) needs — mocked here specifically so the CONTROL case can reach `shortcuts.ts:227`
 * at all; see that describe block's own header for why the control case must be written and pass
 * FIRST.
 *
 * GAP FIX (found while writing this suite): `jest.config.js` sets `resetMocks: true`, which wipes
 * ANY mock implementation — including one supplied inline inside a `jest.mock(...)` factory —
 * before EVERY test (the same gotcha `steamAuthFlows.test.ts` documents for
 * `mockRequestRustInvoke`). `nativeImage.createFromBuffer` and `IconIcns`'s constructor are
 * therefore re-armed in the shared `beforeEach` below, not left as one-shot factory bodies; the
 * first attempt at this suite left them factory-only and every darwin-exe-pin case failed with
 * `Cannot read properties of undefined (reading 'resize')` because the mock had been silently
 * reset back to a bare no-op before the test body ran.
 */

// ── backend/config — avoid a real on-disk config.json read while driving the real addShortcuts
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: jest.fn()
  }
}))

// ── backend/utils — getGame/handleExit are the two real exports shortcutsFlowRegistration.ts
// and this test both need directly controllable; every other real export of this module is
// untouched by the channels under test.
jest.mock('backend/utils', () => ({
  getGame: jest.fn(),
  handleExit: jest.fn()
}))

// ── backend/ipc — sendFrontendMessage is processShortcut's ctrl+k/j/l push target
jest.mock('backend/ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

// ── backend/dialog/dialog — notify() would otherwise construct a real electronStub Notification
// and attempt a real (unbound, in this file) rustInvoke round-trip; not this suite's concern
// (covered by lifecycleStub.test.ts's own Notification describe block).
jest.mock('backend/dialog/dialog', () => ({
  notify: jest.fn(),
  showDialogBoxModalAuto: jest.fn()
}))

// ── backend/logger — routes logSendFailure's real logWarning call (and shortcuts.ts's own
// logInfo/logError calls) to jest.fn()s instead of the real, uninitialized heroicLogWriter.
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

// ── backend/storeManagers — shortcuts.ts's win32 branch reads libraryManagerMap['gog'], never
// reached by this suite's darwin-only exe-pin path; an empty map avoids importing the entire
// eager store-manager construction chain for a branch this suite never exercises.
jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {}
}))

// ── backend/shortcuts/nonesteamgame/nonesteamgame — never invoked (every fixture below pins
// addSteamShortcuts: false), mocked to avoid importing its own heavier dependency chain
// (wiki_game_info, key_value_stores) for a branch this suite deliberately never takes.
jest.mock('backend/shortcuts/nonesteamgame/nonesteamgame', () => ({
  addNonSteamGame: jest.fn(),
  removeNonSteamGame: jest.fn(),
  isAddedToSteam: jest.fn()
}))

// ── backend/shortcuts/utils — getIcon is network/store-manager-touching; mocked to resolve a
// fixture file path so convertPngToICNS's own readFileSync(iconPath) has a real file to read.
jest.mock('backend/shortcuts/utils', () => ({
  getIcon: jest.fn()
}))

// ── @shockpkg/icon-encoder — IconIcns is a real native-adjacent PNG->ICNS encoder; mocked so
// convertPngToICNS's control case can succeed without a real 512x512 PNG fixture. Re-armed in
// beforeEach below (resetMocks wipes this factory body too).
jest.mock('@shockpkg/icon-encoder', () => ({
  IconIcns: jest.fn()
}))

// ── electron / electron-store — route Jest's own module resolution at the REAL sidecar shims,
// same three-way preamble every prior real-shim suite uses, EXCEPT `nativeImage.createFromBuffer`
// is overridden (the one member convertPngToICNS needs and the real stub does not implement) —
// `app.getPath` is deliberately left as the REAL electronStub forward to pathShim.ts, since proving
// THAT chain (GAMELIB_SHELL_EXE -> getPath('exe') -> shortcuts.ts:227) is this suite's whole point.
// Re-armed in beforeEach below (resetMocks wipes this factory body too).
jest.mock('electron', () => {
  const actual = jest.requireActual('../electronStub')
  return {
    ...actual,
    nativeImage: {
      ...actual.nativeImage,
      createFromBuffer: jest.fn()
    }
  }
})
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { realHomeAtSetup } from 'backend/jest.setupContainment'
import { registerShortcutsFlows } from '../shortcutsFlowRegistration'
import { handlerRegistry, listenerRegistry } from '../electronStub'
import { getPath } from '../pathShim'
import { getGame, handleExit } from 'backend/utils'
import { sendFrontendMessage } from 'backend/ipc'
import { logWarning } from 'backend/logger'
import { GlobalConfig } from 'backend/config'
import { getIcon } from 'backend/shortcuts/utils'
import { nativeImage } from 'electron'
import { IconIcns } from '@shockpkg/icon-encoder'
import {
  addShortcuts as realAddShortcuts,
  shortcutFiles
} from 'backend/shortcuts/shortcuts/shortcuts'
import type { GameInfo, AppSettings } from 'common/types'
import type { Game } from 'common/types/game_manager'

function overrideProcessPlatform(os: string): string {
  const original = process.platform
  Object.defineProperty(process, 'platform', { value: os, configurable: true })
  return original
}

/** Flushes real timers/microtasks so the void-async-IIFE fire-and-forget guard shape (and the
 * multi-level real await chain addShortcuts -> generateMacOsApp -> convertPngToICNS -> getIcon)
 * has a chance to fully settle before assertions run. */
function flush(ms = 25): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeGameInfo(overrides: Partial<GameInfo> = {}): GameInfo {
  return {
    runner: 'legendary',
    app_name: 'shortcuts-test-app',
    art_cover: '',
    art_square: '',
    install: { is_dlc: false },
    is_installed: true,
    title: 'Shortcuts Test Game',
    canRunOffline: true,
    ...overrides
  }
}

/** A minimal `Game`-shaped fake whose `addShortcuts` calls the REAL exported `addShortcuts`
 * (`shortcuts.ts`), so `getGame(appName, runner).addShortcuts(fromMenu)` inside the registration
 * module reaches the real darwin `.app`/`run.sh` write path, not a re-implementation. */
function makeFakeGame(gameInfo: GameInfo) {
  const fakeGame = { getGameInfo: () => gameInfo } as unknown as Game
  return {
    getGameInfo: () => gameInfo,
    addShortcuts: (fromMenu?: boolean) => realAddShortcuts(fakeGame, fromMenu),
    removeShortcuts: jest.fn()
  }
}

const mockGetGame = getGame as jest.Mock
const mockHandleExit = handleExit as jest.Mock
const mockSendFrontendMessage = sendFrontendMessage as jest.Mock
const mockLogWarning = logWarning as jest.Mock
const mockGlobalConfigGet = GlobalConfig.get as jest.Mock
const mockGetIcon = getIcon as jest.Mock
const mockCreateFromBuffer = nativeImage.createFromBuffer as jest.Mock
const mockIconIcns = IconIcns as unknown as jest.Mock

// A real fixture image `getIcon` resolves to -- read once by `convertPngToICNS` before the
// (mocked) nativeImage/IconIcns pipeline runs. Deliberately OUTSIDE the redirected home (a
// read-only scratch INPUT under the real os.tmpdir(), never a destination this suite asserts
// against) -- every path this suite actually makes assertions about (the `.app`/run.sh writes) is
// under the structurally redirected `homedir()`.
const FIXTURE_ICON_PATH = join(
  tmpdir(),
  `gamelib-shortcuts-test-fixture-icon-${process.pid}.jpg`
)
writeFileSync(FIXTURE_ICON_PATH, Buffer.from('fake-fixture-icon-bytes'))

// Registered ONCE for this whole file (not per-test) -- `listenerRegistry`/`handlerRegistry` are
// module-scope maps; calling registerShortcutsFlows() more than once would stack a duplicate
// listener onto the same channel array (clipboardFlowRegistration's own test docstring names this
// hazard).
registerShortcutsFlows()

const shellExeAtFileLoad = process.env.GAMELIB_SHELL_EXE

beforeEach(() => {
  mockHandleExit.mockResolvedValue(undefined)
  mockGlobalConfigGet.mockReturnValue({
    getSettings: () =>
      ({
        addDesktopShortcuts: false,
        addStartMenuShortcuts: true,
        addSteamShortcuts: false
      }) as Partial<AppSettings>
  })
  mockGetIcon.mockResolvedValue(FIXTURE_ICON_PATH)
  // GAP FIX (see module docstring): resetMocks wipes these two factory-supplied implementations
  // before every test -- re-armed here every time, mirroring steamAuthFlows.test.ts's own
  // `mockRequestRustInvoke.mockImplementation(...)` re-wiring convention.
  mockCreateFromBuffer.mockReturnValue({
    resize: () => ({
      crop: () => ({
        toPNG: () => Buffer.from('mock-png-bytes')
      })
    })
  })
  mockIconIcns.mockImplementation(() => ({
    addFromPng: jest.fn(),
    encode: jest.fn(() => Buffer.from('mock-icns-bytes'))
  }))
})

afterAll(() => {
  // Restore discipline (mirrors pathShim.test.ts's own afterEach convention) -- proves a
  // following suite in the same jest worker is unaffected by anything this file did.
  if (shellExeAtFileLoad === undefined) {
    expect(process.env.GAMELIB_SHELL_EXE).toBeUndefined()
  } else {
    expect(process.env.GAMELIB_SHELL_EXE).toBe(shellExeAtFileLoad)
  }
})

// ── Describe 1: Registration kind ──────────────────────────────────────────────────────────────
describe('registration kind — the 4 channels are registered with the correct kind, both directions', () => {
  const HANDLE_CHANNELS = ['shortcutsExists']
  const SEND_CHANNELS = ['addShortcut', 'removeShortcut', 'processShortcut']

  it.each(HANDLE_CHANNELS)(
    'REQ-34.5-05 %s is registered as ipcMain.handle, and NOT as ipcMain.on',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(true)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )

  it.each(SEND_CHANNELS)(
    'REQ-34.5-05 %s is registered as ipcMain.on, and NOT as ipcMain.handle',
    (channel) => {
      expect((listenerRegistry.get(channel) ?? []).length).toBe(1)
      expect(handlerRegistry.has(channel)).toBe(false)
    }
  )
})

// Forward-looking pin (per this plan's own action item 6): plan 34.5-11 flips these three
// assertions to the opposite kind pair — it MAY NOT delete them, only invert handlerRegistry/
// listenerRegistry.has() to true/1.
describe('forward-looking pin — addToSteam/removeFromSteam/isAddedToSteam are NOT yet registered by this module (plan 34.5-11 flips this)', () => {
  it.each(['addToSteam', 'removeFromSteam', 'isAddedToSteam'])(
    '%s is registered in NEITHER registry as of plan 34.5-08',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(false)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )
})

// ── Describe 2: Containment ─────────────────────────────────────────────────────────────────────
describe('containment — getPath(desktop) never resolves under the developer real home (tests-clobbering-real-steam-store rule, applied to a cluster that writes outside the app-support dir by design)', () => {
  it('resolves under the structurally redirected home, and differs from the pre-redirect real home', () => {
    const desktop = getPath('desktop')
    expect(desktop.startsWith(homedir())).toBe(true)
    expect(desktop).not.toBe(realHomeAtSetup)
    expect(desktop.startsWith(realHomeAtSetup)).toBe(false)
  })
})

// ── Describe 3: Send-body safety ────────────────────────────────────────────────────────────────
describe('send-body safety — each of the 3 send channels guards its own promise; a removed guard would fail this suite via a real unhandledRejection event', () => {
  it('addShortcut: a rejecting getGame().addShortcuts() never becomes an unhandled rejection, and logs the failure', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)
    try {
      mockGetGame.mockReturnValue({
        getGameInfo: () => makeGameInfo(),
        addShortcuts: jest.fn().mockRejectedValue(new Error('boom-addShortcuts')),
        removeShortcuts: jest.fn()
      })

      const listener = listenerRegistry.get('addShortcut')?.[0]
      expect(listener).toBeDefined()
      listener?.(null, 'app', 'legendary', false)
      await flush()

      expect(unhandled).toHaveLength(0)
      const found = mockLogWarning.mock.calls.some((call) =>
        JSON.stringify(call).includes('addShortcut')
      )
      expect(found).toBe(true)
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('removeShortcut: a rejecting getGame().removeShortcuts() never becomes an unhandled rejection, and logs the failure', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)
    try {
      mockGetGame.mockReturnValue({
        getGameInfo: () => makeGameInfo(),
        addShortcuts: jest.fn(),
        removeShortcuts: jest
          .fn()
          .mockRejectedValue(new Error('boom-removeShortcuts'))
      })

      const listener = listenerRegistry.get('removeShortcut')?.[0]
      expect(listener).toBeDefined()
      listener?.(null, 'app', 'legendary')
      await flush()

      expect(unhandled).toHaveLength(0)
      const found = mockLogWarning.mock.calls.some((call) =>
        JSON.stringify(call).includes('removeShortcut')
      )
      expect(found).toBe(true)
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('processShortcut: a rejecting handleExit() (ctrl+q) never becomes an unhandled rejection, and logs the failure', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)
    try {
      mockHandleExit.mockRejectedValue(new Error('boom-handleExit'))

      const listener = listenerRegistry.get('processShortcut')?.[0]
      expect(listener).toBeDefined()
      listener?.(null, 'ctrl+q')
      await flush()

      expect(unhandled).toHaveLength(0)
      const found = mockLogWarning.mock.calls.some((call) =>
        JSON.stringify(call).includes('processShortcut')
      )
      expect(found).toBe(true)
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})

// ── Describe 4: processShortcut behaviour ───────────────────────────────────────────────────────
describe('processShortcut — six-case switch behaviour', () => {
  beforeEach(() => {
    mockGetGame.mockReturnValue({
      getGameInfo: () => makeGameInfo(),
      addShortcuts: jest.fn(),
      removeShortcuts: jest.fn()
    })
  })

  it.each([
    ['ctrl+k', '/settings/general'],
    ['ctrl+j', '/download-manager'],
    ['ctrl+l', '/library']
  ])('%s pushes openScreen(%s)', async (combo, route) => {
    const listener = listenerRegistry.get('processShortcut')?.[0]
    listener?.(null, combo)
    await flush()
    expect(mockSendFrontendMessage).toHaveBeenCalledWith('openScreen', route)
  })

  it('ctrl+q reaches handleExit', async () => {
    const listener = listenerRegistry.get('processShortcut')?.[0]
    listener?.(null, 'ctrl+q')
    await flush()
    expect(mockHandleExit).toHaveBeenCalledTimes(1)
  })

  it('ctrl+r does not throw and reaches the electronStub fakeWindow.reload() no-op (T-34.5-27, declared degraded)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const listener = listenerRegistry.get('processShortcut')?.[0]
      expect(() => listener?.(null, 'ctrl+r')).not.toThrow()
      await flush()
      expect(
        warnSpy.mock.calls.some((call) => String(call[0]).includes('reload'))
      ).toBe(true)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('ctrl+shift+i does not throw and reaches the electronStub fakeWebContents.openDevTools() no-op (T-34.5-27, declared degraded)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const listener = listenerRegistry.get('processShortcut')?.[0]
      expect(() => listener?.(null, 'ctrl+shift+i')).not.toThrow()
      await flush()
      expect(
        warnSpy.mock.calls.some((call) =>
          String(call[0]).includes('openDevTools')
        )
      ).toBe(true)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('an unknown combination is a no-op', async () => {
    const listener = listenerRegistry.get('processShortcut')?.[0]
    expect(() => listener?.(null, 'ctrl+totally-unknown')).not.toThrow()
    await flush()
    expect(mockSendFrontendMessage).not.toHaveBeenCalled()
    expect(mockHandleExit).not.toHaveBeenCalled()
  })
})

// ── Describe 5: addShortcut's darwin GAMELIB_SHELL_EXE pin ─────────────────────────────────────
//
// This is the security-relevant test of this plan, and the `addShortcut` counterpart to plan
// 34.5-11's `addToSteam` pin. The CONTROL case (a) is written and MUST PASS FIRST: `:227` is only
// reached when `convertPngToICNS` returns true, and that function is module-private, wraps
// everything in try/catch, and returns false on ANY failure — so if the CONTROL case fails, cases
// (b)/(c) would pass for the wrong reason (run.sh never written regardless of GAMELIB_SHELL_EXE).
// A DIFFERENT game title is used per case so each gets its own `.app` folder — reusing one folder
// across cases would let an earlier case's run.sh/plist leak into a later case's assertions.
describe("addShortcut's darwin GAMELIB_SHELL_EXE pin (T-34.5-65/66, D-10 rejects process.execPath)", () => {
  let originalPlatform: string
  let savedShellExe: string | undefined

  beforeEach(() => {
    originalPlatform = overrideProcessPlatform('darwin')
    savedShellExe = process.env.GAMELIB_SHELL_EXE
    mockGetGame.mockImplementation((appName: string) =>
      // fromMenu is NOT passed by the caller in these cases — addStartMenuShortcuts: true
      // (this file's shared beforeEach) is the darwin gate that reaches generateMacOsApp instead.
      makeFakeGame(makeGameInfo({ title: appName }))
    )
  })

  afterEach(() => {
    overrideProcessPlatform(originalPlatform)
    if (savedShellExe === undefined) {
      delete process.env.GAMELIB_SHELL_EXE
    } else {
      process.env.GAMELIB_SHELL_EXE = savedShellExe
    }
  })

  it('CONTROL (must run and pass first): a plausible absolute GAMELIB_SHELL_EXE containing a space produces a run.sh with that exact value, never process.execPath', async () => {
    process.env.GAMELIB_SHELL_EXE =
      '/Applications/GameLib Test.app/Contents/MacOS/GameLib'
    const title = 'Exe Pin Control Game'

    const listener = listenerRegistry.get('addShortcut')?.[0]
    listener?.(null, title, 'legendary', undefined)
    await flush()

    const [, menuFile] = shortcutFiles(title)
    const runShPath = `${menuFile}/Contents/MacOS/run.sh`

    expect(existsSync(runShPath)).toBe(true)
    const contents = readFileSync(runShPath, 'utf-8')
    expect(contents).toContain(
      '/Applications/GameLib Test.app/Contents/MacOS/GameLib --no-gui gamelib://launch?appName='
    )
    expect(contents).not.toContain(process.execPath)
  })

  it('UNSET: deleting GAMELIB_SHELL_EXE writes no run.sh, does not reject the listener, and logs the failure', async () => {
    delete process.env.GAMELIB_SHELL_EXE
    const title = 'Exe Pin Unset Game'
    const [, menuFile] = shortcutFiles(title)
    const runShPath = `${menuFile}/Contents/MacOS/run.sh`

    const listener = listenerRegistry.get('addShortcut')?.[0]
    expect(() => listener?.(null, title, 'legendary', undefined)).not.toThrow()
    await flush()

    // PLAN-TIME CORRECTION: `generateMacOsApp` creates the `.app`/Resources/MacOS folders and
    // writes `Info.plist` BEFORE the `getPath('exe')` throw (the throw happens while building
    // `launchCommand`, the line immediately before the run.sh write) — so the directory is NOT
    // byte-for-byte unchanged; the plist/icon scaffold IS written regardless. The
    // security-relevant guarantee this plan's threat model actually needs (T-34.5-65) is
    // specifically that `run.sh` — the file whose contents would embed an empty/absent launch
    // command — is never written, which is what this assertion pins.
    expect(existsSync(runShPath)).toBe(false)
    const found = mockLogWarning.mock.calls.some(
      (call) =>
        JSON.stringify(call).includes('addShortcut') &&
        JSON.stringify(call).includes('GAMELIB_SHELL_EXE was not set')
    )
    expect(found).toBe(true)
  })

  it('EMPTY: an empty-string GAMELIB_SHELL_EXE behaves identically to unset — no run.sh, no reject, logged failure', async () => {
    process.env.GAMELIB_SHELL_EXE = ''
    const title = 'Exe Pin Empty Game'
    const [, menuFile] = shortcutFiles(title)
    const runShPath = `${menuFile}/Contents/MacOS/run.sh`

    const listener = listenerRegistry.get('addShortcut')?.[0]
    expect(() => listener?.(null, title, 'legendary', undefined)).not.toThrow()
    await flush()

    expect(existsSync(runShPath)).toBe(false)
    const found = mockLogWarning.mock.calls.some(
      (call) =>
        JSON.stringify(call).includes('addShortcut') &&
        JSON.stringify(call).includes('GAMELIB_SHELL_EXE was not set')
    )
    expect(found).toBe(true)
  })
})
