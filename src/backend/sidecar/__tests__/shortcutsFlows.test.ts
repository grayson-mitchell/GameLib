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
 * path, not a re-implementation.
 *
 * UPDATED (Phase 34.5 gap cycle 6, plan 34.5-45, F-34.5-G6-07): `convertPngToICNS`'s full chain
 * now runs REAL, nothing mocked — `nativeImage.createFromBuffer` resolves to the real
 * `sips`-backed shim (`nativeImageShim.ts`, via `electron`'s real `electronStub` forward) and
 * `@shockpkg/icon-encoder`'s `IconIcns` is the real encoder. This file previously mocked BOTH
 * (`createFromBuffer: jest.fn()` on the `electron` factory, plus a whole-module
 * `jest.mock('@shockpkg/icon-encoder', ...)`) with an explicit comment naming
 * `nativeImage.createFromBuffer` as "the one member `convertPngToICNS` needs and the real stub
 * does not implement" — that pair of mocks is exactly why a 4462-test green suite never caught
 * `nativeImage`'s missing members (F-34.5-G6-07); both are gone, not merely adjusted
 * (T-34.5-C6-24). `app.getPath` was already the REAL `electronStub` forward to `pathShim.ts`
 * before this change and still is.
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

// ── backend/shortcuts/nonesteamgame/nonesteamgame — Plan 34.5-08 mocked this module wholesale
// because none of its fixtures ever invoked it (addSteamShortcuts: false gates the addShortcuts
// branch that would reach it). Plan 34.5-11's `addToSteam`/`removeFromSteam`/`isAddedToSteam`
// channels call it DIRECTLY and their whole security property (the exe-in-VDF pin, T-34.5-39/40)
// requires the REAL VDF-write code path -- a mock would prove nothing. So this module is left
// UNMOCKED here; `backend/wiki_game_info/wiki_game_info` is auto-mocked below instead (mirroring
// `nonesteamgame.test.ts`'s own precedent) to keep addNonSteamGame's real call chain network-free.
jest.mock('backend/wiki_game_info/wiki_game_info')

// ── backend/shortcuts/utils — shared by two real, unmocked call chains this file now drives:
// `shortcuts.ts`'s darwin `.app` icon path (getIcon) and, new in plan 34.5-11, `steamhelper.ts`'s
// `prepareImagesForSteam` (checkImageExistsAlready/createImage/downloadImage/removeImage), reached
// transitively from the real, unmocked `addNonSteamGame` above. `getIcon` resolves a fixture file
// path so `convertPngToICNS`'s own readFileSync(iconPath) has a real file to read.
// checkImageExistsAlready/createImage/downloadImage/removeImage are safe no-ops -- this suite's
// addToSteam fixture (`makeGameInfo`) has no art_cover/art_square/art_logo/steamID, so
// `prepareImagesForSteam` only reaches the logo branch's `createImage` call; none of these four
// touch the filesystem for real, keeping every write this suite asserts against confined to the
// shortcuts.vdf path it constructs itself.
jest.mock('backend/shortcuts/utils', () => ({
  getIcon: jest.fn(),
  checkImageExistsAlready: jest.fn().mockReturnValue(false),
  createImage: jest.fn().mockReturnValue(undefined),
  downloadImage: jest.fn().mockReturnValue(undefined),
  removeImage: jest.fn().mockReturnValue(undefined)
}))

// ── electron / electron-store — route Jest's own module resolution at the REAL sidecar shims.
// `nativeImage` (F-34.5-G6-07 fix) and `app.getPath` are BOTH the real electronStub forward now
// — proving the real `sips`-backed `nativeImageShim.ts` chain (and, for `app.getPath('exe')`,
// GAMELIB_SHELL_EXE -> getPath('exe') -> shortcuts.ts:227) is this suite's whole point.
jest.mock('backend/store_backend', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  statSync
} from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { dirSync, type DirResult } from 'tmp'
import { realHomeAtSetup } from 'backend/jest.setupContainment'
import { registerShortcutsFlows } from '../shortcutsFlowRegistration'
import { handlerRegistry, listenerRegistry } from '../../platform'
import { getPath } from '../pathShim'
import { getGame, handleExit } from 'backend/utils'
import { sendFrontendMessage } from 'backend/ipc'
import { logWarning, logError } from 'backend/logger'
import { GlobalConfig } from 'backend/config'
import { getIcon } from 'backend/shortcuts/utils'
import { execFileSync } from 'node:child_process'
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
const mockLogError = logError as jest.Mock
const mockGlobalConfigGet = GlobalConfig.get as jest.Mock
const mockGetIcon = getIcon as jest.Mock

// A real fixture image `getIcon` resolves to -- read once by `convertPngToICNS`, which now (F-34.5-G6-07
// fix, plan 34.5-45) runs the REAL nativeImage/IconIcns chain end to end, nothing mocked. Deliberately
// OUTSIDE the redirected home (a read-only scratch INPUT under the real os.tmpdir(), never a
// destination this suite asserts against) -- every path this suite actually makes assertions about
// (the `.app`/run.sh writes) is under the structurally redirected `homedir()`.
//
// Generated at test-file load time by converting a file that ships with every macOS install
// (GenericDocumentIcon.icns, present since at least 10.x) to a real PNG via the real `sips` binary
// -- never a committed binary fixture, and never hand-rolled fake bytes (`Buffer.from('fake-fixture-icon-bytes')`
// is not a decodable image and fails the real shim).
const FIXTURE_ICON_PATH = join(
  tmpdir(),
  `gamelib-shortcuts-test-fixture-icon-${process.pid}.png`
)
execFileSync('/usr/bin/sips', [
  '-s',
  'format',
  'png',
  '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericDocumentIcon.icns',
  '--out',
  FIXTURE_ICON_PATH
])

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
// Extended by plan 34.5-11: HANDLE_CHANNELS now carries all 4 invoke channels (shortcutsExists
// from plan 34.5-08, plus addToSteam/removeFromSteam/isAddedToSteam from this plan), completing
// the cluster at 7 (4 handle, 3 send).
describe('registration kind — the 7 channels are registered with the correct kind, both directions', () => {
  const HANDLE_CHANNELS = [
    'shortcutsExists',
    'addToSteam',
    'removeFromSteam',
    'isAddedToSteam'
  ]
  const SEND_CHANNELS = ['addShortcut', 'removeShortcut', 'processShortcut']

  it('the cluster is complete at 7: 4 handle + 3 send', () => {
    expect(HANDLE_CHANNELS).toHaveLength(4)
    expect(SEND_CHANNELS).toHaveLength(3)
  })

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
        addShortcuts: jest
          .fn()
          .mockRejectedValue(new Error('boom-addShortcuts')),
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
    const icnsPath = `${menuFile}/Contents/Resources/shortcut.icns`

    // F-34.5-G6-07: with the real nativeImage shim + real IconIcns, convertPngToICNS's
    // downstream artifact (shortcut.icns) exists alongside run.sh -- both files, not one.
    expect(existsSync(icnsPath)).toBe(true)
    expect(statSync(icnsPath).size).toBeGreaterThan(0)

    expect(existsSync(runShPath)).toBe(true)
    const contents = readFileSync(runShPath, 'utf-8')
    // T-34.5-C6-17 (plan 34.5-45): exe path double-quoted, gamelib:// URL single-quoted.
    expect(contents).toContain(
      '"/Applications/GameLib Test.app/Contents/MacOS/GameLib" --no-gui \'gamelib://launch?appName='
    )
    expect(contents).not.toContain(process.execPath)

    // F-34.5-G6-07: convertPngToICNS succeeded for real -- no swallowed-throw failure line.
    const sawFailure = mockLogError.mock.calls.some((call) =>
      JSON.stringify(call).includes('Error generating MacOS App')
    )
    expect(sawFailure).toBe(false)
  })

  // Injection proof (T-34.5-C6-17, F-34.5-G6-07 follow-on) — plan 34.5-45's Task 1 makes
  // generateMacOsApp reachable for the first time, which makes the injection this template opens
  // reachable too. Proven RED first: with the encodeURIComponent calls temporarily reverted
  // (`shortcuts.ts`'s `gamelibUrl` built from the raw, un-encoded `app_name`/`runner`), this exact
  // test FAILED -- see 34.5-45-SUMMARY.md for the verbatim failure output. Restored, it passes.
  it('a malicious app_name cannot inject a shell command into run.sh (RED-proven, see SUMMARY for the failing-run transcript)', async () => {
    process.env.GAMELIB_SHELL_EXE =
      '/Applications/GameLib.app/Contents/MacOS/GameLib'
    const maliciousAppName = 'x&runner=gog;touch /tmp/gamelib-pwned'
    const title = 'Injection Pin Game'

    mockGetGame.mockImplementation(() =>
      makeFakeGame(
        makeGameInfo({ title, app_name: maliciousAppName, runner: 'legendary' })
      )
    )

    const listener = listenerRegistry.get('addShortcut')?.[0]
    listener?.(null, title, 'legendary', undefined)
    await flush()

    const [, menuFile] = shortcutFiles(title)
    const runShPath = `${menuFile}/Contents/MacOS/run.sh`
    expect(existsSync(runShPath)).toBe(true)
    const contents = readFileSync(runShPath, 'utf-8')

    const urlMatch = /'(gamelib:\/\/[^']*)'/.exec(contents)
    expect(urlMatch).not.toBeNull()
    const parsedAppName = new URL(urlMatch![1]).searchParams.get('appName')
    expect(parsedAppName).toBe(maliciousAppName)

    // No bare `;` or `&` outside the single-quoted URL region -- strip that region and assert
    // what remains (the launch command's exe/flag portion) contains neither. Once percent-encoded,
    // the malicious payload lives entirely inside the single-quoted URL, so a passing assertion
    // here means nothing of it escaped into unquoted shell syntax.
    const withoutUrl = contents.replace(/'gamelib:\/\/[^']*'/, "''")
    expect(withoutUrl).not.toContain(';')
    expect(withoutUrl).not.toContain('&')
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

// ── Describe 6: addToSteam's GAMELIB_SHELL_EXE pin (plan 34.5-11) ─────────────────────────────
//
// This is the security-relevant test of THIS plan, and the invoke-kind counterpart to Describe
// 5's send-kind `addShortcut` pin above (which this suite does not delete, merge or weaken). Same
// underlying property (T-34.5-39/40, D-10 rejects `process.execPath`), two different observable
// shapes: `addShortcut` (send-kind) logs via `logSendFailure` and writes nothing; `addToSteam`
// (invoke-kind) REJECTS to the caller and writes nothing.
//
// Drives the REAL `addNonSteamGame`/`removeNonSteamGame`/`isAddedToSteam` (`nonesteamgame.ts`,
// left unmocked above) through the registered `addToSteam` handler in `handlerRegistry`, using a
// disposable `tmp` Steam-root fixture (mirroring `nonesteamgame/__tests__/nonesteamgame.test.ts`'s
// own proven harness) -- never the developer's real Steam userdata directory, and never the
// structurally redirected home either (this fixture is self-contained and cleaned up per test via
// `tmpDir.removeCallback()`, independent of `jest.setupContainment.ts`'s home redirection).
describe("addToSteam's GAMELIB_SHELL_EXE pin (T-34.5-39/40, invoke-kind counterpart to addShortcut's send-kind pin above)", () => {
  let tmpDir: DirResult
  let steamUserConfigDir: string
  let shortcutsFile: string
  let savedShellExe: string | undefined

  // The exact bytes of an empty, valid shortcuts.vdf ("\x00shortcuts\x00\x08\x08"), the same
  // literal `nonesteamgame.test.ts`'s own "Create shortcuts.vdf if not exist" case asserts
  // against. Pre-writing this (rather than starting from a missing file) is the PLAN-TIME
  // CORRECTION this suite needs: `addNonSteamGame` creates an empty shortcuts.vdf via
  // `writeShortcutFile` BEFORE it ever reaches `newEntry.Exe = getPath('exe')` (the `if
  // (!existsSync(shortcutsFile))` branch runs first in the same iteration) -- so "no file
  // exists" is not a byte-for-byte-safe assertion when the file starts absent. Starting from a
  // pre-existing empty file sidesteps that branch entirely, so the load-bearing assertion below
  // (byte-identical content, no entry appended) proves the entry-append itself never happened,
  // mirroring plan 34.5-08's own "run.sh specifically absent" correction for the analogous
  // send-kind pin.
  const EMPTY_SHORTCUTS_VDF = Buffer.from([
    0, 115, 104, 111, 114, 116, 99, 117, 116, 115, 0, 8, 8
  ])

  beforeEach(() => {
    tmpDir = dirSync({ unsafeCleanup: true })
    steamUserConfigDir = join(tmpDir.name, 'userdata', 'steam_user', 'config')
    mkdirSync(steamUserConfigDir, { recursive: true })
    shortcutsFile = join(steamUserConfigDir, 'shortcuts.vdf')
    writeFileSync(shortcutsFile, EMPTY_SHORTCUTS_VDF)

    mockGlobalConfigGet.mockReturnValue({
      getSettings: () => ({
        defaultSteamPath: tmpDir.name,
        addDesktopShortcuts: false,
        addStartMenuShortcuts: true,
        addSteamShortcuts: false
      })
    })
    mockGetGame.mockReturnValue({
      getGameInfo: () => makeGameInfo({ title: 'AddToSteam Pin Game' })
    })

    savedShellExe = process.env.GAMELIB_SHELL_EXE
  })

  afterEach(() => {
    tmpDir.removeCallback()
    if (savedShellExe === undefined) {
      delete process.env.GAMELIB_SHELL_EXE
    } else {
      process.env.GAMELIB_SHELL_EXE = savedShellExe
    }
  })

  it('UNSET: rejects with "GAMELIB_SHELL_EXE was not set", and appends no entry to shortcuts.vdf', async () => {
    delete process.env.GAMELIB_SHELL_EXE
    const before = readFileSync(shortcutsFile)
    const filesBefore = readdirSync(steamUserConfigDir)

    const handler = handlerRegistry.get('addToSteam')
    expect(handler).toBeDefined()
    await expect(
      handler?.(undefined, 'AddToSteam Pin Game', 'legendary')
    ).rejects.toThrow(/GAMELIB_SHELL_EXE was not set/)

    // The security-relevant guarantee (T-34.5-39): NOT merely that the promise rejected, but
    // that shortcuts.vdf's own bytes are unchanged (no entry was appended) and the config dir's
    // file listing is unchanged (no new file was created either).
    expect(readFileSync(shortcutsFile)).toEqual(before)
    expect(readdirSync(steamUserConfigDir)).toEqual(filesBefore)
  })

  it('EMPTY: an empty-string GAMELIB_SHELL_EXE behaves identically to unset — rejects, appends no entry', async () => {
    process.env.GAMELIB_SHELL_EXE = ''
    const before = readFileSync(shortcutsFile)
    const filesBefore = readdirSync(steamUserConfigDir)

    const handler = handlerRegistry.get('addToSteam')
    await expect(
      handler?.(undefined, 'AddToSteam Pin Game', 'legendary')
    ).rejects.toThrow(/GAMELIB_SHELL_EXE was not set/)

    expect(readFileSync(shortcutsFile)).toEqual(before)
    expect(readdirSync(steamUserConfigDir)).toEqual(filesBefore)
  })

  it('SET: a plausible absolute GAMELIB_SHELL_EXE containing a space produces a shortcuts.vdf whose Exe field contains that exact value, never process.execPath', async () => {
    process.env.GAMELIB_SHELL_EXE =
      '/Applications/GameLib Test.app/Contents/MacOS/GameLib'

    const handler = handlerRegistry.get('addToSteam')
    const result = await handler?.(
      undefined,
      'AddToSteam Pin Game',
      'legendary'
    )

    expect(result).toBe(true)
    expect(existsSync(shortcutsFile)).toBe(true)

    // shortcuts.vdf is steam-shortcut-editor's binary VDF format, but string field values
    // (AppName, Exe, ...) are embedded as literal ASCII substrings between null-byte
    // delimiters -- `.toContain()` against the raw buffer's string form is the same technique
    // `nonesteamgame.test.ts` uses to assert on written VDF content.
    const contents = readFileSync(shortcutsFile).toString()
    expect(contents).toContain(
      '"/Applications/GameLib Test.app/Contents/MacOS/GameLib"'
    )
    // D-10's explicitly rejected alternative: the node interpreter must never be the value
    // written as the launch command.
    expect(contents).not.toContain(process.execPath)
  })
})

// ── Describe 7: F-34.5-G6-08 discriminator offline arm (plan 34.5-45, Task 2) ─────────────────
//
// Drives a REAL `{id, kind:'invoke', channel:'addToSteam', args:[...]}` frame through the REAL
// `startRpcServer` loop (`sidecarRpc.ts`) -- the same harness shape `appShellFlows.test.ts` and
// `skeletonFlows.test.ts` use -- and asserts on the PARSED STDOUT FRAME, not on the handler's own
// return value (Describe 6's `SET` case already covers that, at the handler level, bypassing the
// RPC envelope entirely). This is the H2/H3 discriminator: `frame.ok === true`, an OWN `result`
// key present (`Object.prototype.hasOwnProperty`, not merely `frame.result === true` --
// `JSON.stringify` OMITS a key whose value is `undefined`, so a dropped key and a `false` value
// are different failures), and `frame.result === true`.
describe('F-34.5-G6-08 discriminator — addToSteam over the REAL RPC frame path (offline H2/H3 arm)', () => {
  let tmpDir: DirResult
  let steamUserConfigDir: string
  let savedShellExe: string | undefined

  const EMPTY_SHORTCUTS_VDF = Buffer.from([
    0, 115, 104, 111, 114, 116, 99, 117, 116, 115, 0, 8, 8
  ])

  beforeEach(() => {
    tmpDir = dirSync({ unsafeCleanup: true })
    steamUserConfigDir = join(tmpDir.name, 'userdata', 'steam_user', 'config')
    mkdirSync(steamUserConfigDir, { recursive: true })
    writeFileSync(
      join(steamUserConfigDir, 'shortcuts.vdf'),
      EMPTY_SHORTCUTS_VDF
    )

    mockGlobalConfigGet.mockReturnValue({
      getSettings: () => ({
        defaultSteamPath: tmpDir.name,
        addDesktopShortcuts: false,
        addStartMenuShortcuts: true,
        addSteamShortcuts: false
      })
    })
    mockGetGame.mockReturnValue({
      getGameInfo: () => makeGameInfo({ title: 'RPC Frame Discriminator Game' })
    })

    savedShellExe = process.env.GAMELIB_SHELL_EXE
    process.env.GAMELIB_SHELL_EXE =
      '/Applications/GameLib.app/Contents/MacOS/GameLib'
  })

  afterEach(() => {
    tmpDir.removeCallback()
    if (savedShellExe === undefined) {
      delete process.env.GAMELIB_SHELL_EXE
    } else {
      process.env.GAMELIB_SHELL_EXE = savedShellExe
    }
  })

  it("the emitted stdout frame has ok:true, an OWN 'result' key, and result === true", async () => {
    const { PassThrough } = await import('node:stream')
    const { startRpcServer } = await import('../sidecarRpc')

    const input = new PassThrough()
    const output = new PassThrough()
    const frames: Record<string, unknown>[] = []
    let buffer = ''
    output.on('data', (chunk: Buffer | string) => {
      buffer += chunk.toString()
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        if (line.trim().length > 0) {
          try {
            frames.push(JSON.parse(line))
          } catch {
            // non-JSON diagnostic line, ignore
          }
        }
        newlineIndex = buffer.indexOf('\n')
      }
    })

    startRpcServer(input, output)

    input.write(
      `${JSON.stringify({
        id: 'g6-08-frame-1',
        kind: 'invoke',
        channel: 'addToSteam',
        args: ['RPC Frame Discriminator Game', 'legendary']
      })}\n`
    )
    await flush()

    const frame = frames.find((f) => f.id === 'g6-08-frame-1')
    expect(frame).toBeDefined()
    expect(frame?.ok).toBe(true)
    // H2/H3 discriminator: an OWN key, not merely a truthy/matching value.
    expect(Object.prototype.hasOwnProperty.call(frame, 'result')).toBe(true)
    expect(frame?.result).toBe(true)
  })

  // Pins interfaces fact 2 (34.5-45-PLAN.md): the Rust leg's response branch can never deliver a
  // genuine `undefined` -- the smallest value it can produce is `null` (Serde's
  // `unwrap_or(Value::Null)`). A source-text assertion, so this floor cannot silently change
  // without this test noticing.
  it("main.rs's response branch still floors a missing result at Value::Null (source-text pin)", () => {
    const mainRsPath = join(__dirname, '../../../../src-tauri/src/main.rs')
    const source = readFileSync(mainRsPath, 'utf-8')
    expect(source).toContain('unwrap_or(Value::Null)')
  })
})
