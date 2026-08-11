/**
 * Non-mocked proof for the two startup wirings landed by 34.2 Plan 01 (D-02, D-04, D-07) --
 * i18next initialization and the `releasesInfoReady` -> anticheat-data-download chain.
 *
 * Phase 34.1's CR-01 finding (an un-init'd i18next silently swallowing the whole
 * `changeLanguage` persist path) was invisible to its OWN test suite specifically because
 * that suite's `jest.mock('i18next', ...)` mocked the exact call the bug lived in away.
 * This suite exists to not repeat that mistake: it mocks ONLY the OS boundary (`os.homedir`,
 * `electron`/`electron-store` redirects, `axios`, `backend/constants/environment`,
 * `backend/config`) and the online-monitor (same reasoning as `bootstrap.test.ts`'s own
 * block -- see that file's header). It NEVER mocks `i18next`, `backend_events`,
 * `backend/utils/releases`, or `backend/anticheat/utils` -- the exact four things Task 1/2
 * wired up. Test 2 below is a by-construction guard (reads this file's own source) that a
 * future edit cannot quietly reintroduce an `i18next` mock into this file.
 *
 * Each test runs inside its own `jest.isolateModules()` sandbox (mirrors
 * `appShellFlows.test.ts`'s own single precedent use of this pattern). This is required, not
 * cosmetic: `bootstrap.ts`'s `i18nInitialized` / `anticheatListenerRegistered` /
 * `releasesFetchInitialized` guards and `backendEvents`'s listener list are module-scope
 * singletons that would otherwise leak across every test in this file (a later test seeing
 * "already initialized" from an earlier one), making the idempotency test (test 5) and the
 * per-test emit assertions (test 3/4) order-dependent and flaky. Isolating per test gives
 * each one its own fresh copy of every module in the graph, exactly like a fresh process.
 *
 * `os.homedir()` is redirected to a disposable per-process tmp directory (GAP FIX precedent,
 * `appShellFlows.test.ts` / `tests-clobbering-real-steam-store`) so this suite -- which
 * writes a REAL anticheat data file to disk -- can never reach the developer's real
 * `~/Library/Application Support/GameLib`. Test 7 below asserts the resolved `appFolder` is
 * actually under `os.tmpdir()` so a mis-wired mock fails loudly instead of silently.
 */

import { PassThrough } from 'node:stream'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { READY_SENTINEL } from 'common/types/sidecarTransport'
import { stripSourceComments as stripComments } from 'backend/testUtils/stripSourceComments'

// ── i18next — DEFEAT Jest's project-wide automatic manual mock. This is the load-bearing
// line of this whole suite: `src/backend/__mocks__/i18next.ts` sits adjacent to this jest
// project's `roots` (`src/backend`), so Jest substitutes it for the REAL npm `i18next`
// package in EVERY backend test file automatically -- with no `jest.mock('i18next', ...)`
// call required anywhere -- exactly the quiet-mock trap Phase 34.1's CR-01 header warns
// about, just one level further back than a test file explicitly opting in. Without this
// line, `require('i18next')` here (and inside bootstrap.ts, in the SAME isolated registry)
// would silently resolve to that stub (`t: (key) => key`, no `.init`/`.use`/`.isInitialized`
// at all) regardless of anything else in this file, and this suite would prove nothing about
// the real singleton. `jest.unmock` -- not `jest.mock` -- is the correct call here: it
// restores default (real) module resolution, it does not substitute a replacement. ─────────
jest.unmock('i18next')

// ── os — redirect homedir() to a disposable per-process tmp directory, same GAP FIX
// precedent as appShellFlows.test.ts / steamAuthFlows.test.ts -- this suite writes a REAL
// anticheat data file, so it must never reach the developer's real config directory.
//
// Unlike those suites' single fixed per-process directory, this file additionally
// namespaces by `mockTestHomeSuffix` (bumped in `beforeEach`, `mock`-prefixed so the
// hoisted factory below may reference it): each test drives the REAL, unmocked
// `anticheat/utils.ts` write path via `init()`'s Block A/B side effects (not just the one
// test that asserts on it), and `downloadAntiCheatData`'s own md5-unchanged-skip logic
// would otherwise treat an earlier test's file as "already correct" and silently no-op the
// write this test is trying to observe. A fresh subdirectory per test removes that
// coupling entirely, and also removes any need to delete a directory a sibling test's
// in-flight fire-and-forget log write might still be using. ─────────────────────────────
let mockTestHomeSuffix = 0

jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(
        actual.tmpdir(),
        `gamelib-bootstrapwirings-test-home-${process.pid}`,
        String(mockTestHomeSuffix)
      )
  }
})

// ── electron / electron-store — route Jest's own module resolution at the REAL sidecar
// shims (mirrors appShellFlows.test.ts / steamAuthFlows.test.ts) ────────────────────────────
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── online_monitor — full-surface mock, same reasoning as bootstrap.test.ts's own block
// (its own header explains why: the real function reads `net.isOnline()` from `electron`,
// which the generic automock does not provide, and numerous OTHER modules in the `./handlers`
// import graph call `onConnectivityChange`/`isOnline`/`runOnceWhenOnline` at their own module
// scope) ──────────────────────────────────────────────────────────────────────────────────
jest.mock('../../online_monitor', () => ({
  initOnlineMonitor: jest.fn(),
  isOnline: jest.fn(() => true),
  runOnceWhenOnline: jest.fn((callback: () => unknown) => callback()),
  onConnectivityChange: jest.fn()
}))

// ── axios — scriptable, dispatches on the requested URL. `mock`-prefixed so the hoisted
// jest.mock() factory below is allowed to close over these (Jest's out-of-scope-variable
// naming rule) ────────────────────────────────────────────────────────────────────────────
const mockShaMac = 'mock-sha-mac-abc123'
const mockShaLinux = 'mock-sha-linux-def456'
const mockGamesJson = [
  {
    storeIds: { epic: { namespace: 'mockgame' } },
    status: 'Denied'
  }
]
const mockGamesJsonText = JSON.stringify(mockGamesJson)

jest.mock('axios', () => {
  const mockInstance = {
    get: jest.fn((url: string) => {
      if (typeof url === 'string' && url.includes('release-data.json')) {
        return Promise.resolve({
          data: {
            anticheatFiles: {
              shaMac: mockShaMac,
              shaLinux: mockShaLinux
            }
          }
        })
      }
      if (typeof url === 'string' && url.includes('games.json')) {
        return Promise.resolve({ data: mockGamesJsonText })
      }
      return Promise.reject(
        new Error(`bootstrapWirings.test.ts: unexpected axios.get URL "${url}"`)
      )
    }),
    head: jest.fn(() => Promise.resolve({ status: 200 }))
  }
  return {
    __esModule: true,
    default: {
      head: jest.fn(() => Promise.resolve({ status: 200 })),
      create: jest.fn(() => mockInstance)
    }
  }
})

// ── backend/constants/environment — deterministic branch regardless of host OS (mirrors
// appShellFlows.test.ts / installFlows.test.ts / settingsFlows.test.ts), pinning
// isWindows:false so neither fetchLastestReleases's nor downloadAntiCheatData's early-return
// fires ───────────────────────────────────────────────────────────────────────────────────
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true,
  isIntelMac: false,
  isSteamDeckGameMode: false,
  isFlatpak: false
}))

// ── backend/config — avoid a real on-disk config.json write while leaving the real i18next
// path intact (mirrors settingsFlows.test.ts's own GlobalConfig stub shape) ─────────────────
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: jest.fn()
  }
}))

/** Buffers newline-delimited output from a PassThrough into discrete lines. */
function collectLines(stream: PassThrough): string[] {
  const lines: string[] = []
  let buffer = ''
  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString()
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      lines.push(buffer.slice(0, newlineIndex))
      buffer = buffer.slice(newlineIndex + 1)
      newlineIndex = buffer.indexOf('\n')
    }
  })
  return lines
}

/** Waits a few microtask/macrotask turns for fire-and-forget async work to progress. */
async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

/** Polls a predicate with real timers -- for genuine async I/O (fs reads/writes, i18next's
 * own async resource load) that a fixed number of setImmediate ticks cannot reliably bound. */
async function waitFor(
  predicate: () => boolean,
  { timeoutMs = 5000, intervalMs = 20 } = {}
): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: condition not met within timeout')
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

/**
 * Requires the sidecar bootstrap graph fresh inside its own `jest.isolateModules()`
 * sandbox (see module docstring for why this is required, not cosmetic), configures the
 * isolated `GlobalConfig` stub, and returns the handles this suite's tests need.
 *
 * `eslint-disable @typescript-eslint/no-var-requires` throughout: `jest.isolateModules()`'s
 * callback must run synchronously, so these must be CommonJS `require()` calls, not dynamic
 * `import()` (mirrors appShellFlows.test.ts's own single precedent use of this pattern).
 */
function setupIsolatedBootstrap(): {
  init: (input: PassThrough, output: PassThrough) => void
  deliverStartupProtocolUrl: (argv?: string[]) => boolean

  backendEvents: any
  axiosGet: jest.Mock

  i18nextInstance: any
  appFolder: string
  logFilePath: string
  handlerRegistry: Map<string, (...args: unknown[]) => unknown>
} {
  let harness!: ReturnType<typeof setupIsolatedBootstrap>
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const axiosModule = require('axios')
    const axiosInstance = axiosModule.default.create()

    const { GlobalConfig } = require('backend/config')
    ;(GlobalConfig.get as jest.Mock).mockReturnValue({
      getSettings: () => ({ language: 'en' }),
      setSetting: jest.fn(),
      set: jest.fn(),
      flush: jest.fn()
    })

    const { backendEvents } = require('../../backend_events')
    const { init, deliverStartupProtocolUrl } = require('../bootstrap')
    // Plain CJS require -- NOT `.default`. TS's `import i18next from 'i18next'`
    // (used by bootstrap.ts) compiles under esModuleInterop to
    // `__importDefault(require('i18next')).default`, but `__importDefault` only WRAPS
    // the raw CJS module (`{ default: mod }`) rather than cloning it -- so the object
    // this plain `require('i18next')` returns is reference-identical, within this same
    // isolated module registry, to the singleton bootstrap.ts's `i18next` import
    // resolves to. i18next's own CJS export has no literal `.default` property, so
    // appending `.default` here would silently yield `undefined`.
    const i18nextInstance = require('i18next')
    const { appFolder } = require('../../constants/paths')
    // Phase 34.5 gap cycle 6 plan 44 (Test A/C): required INSIDE this same
    // jest.isolateModules() callback, not after setupIsolatedBootstrap() returns -- a
    // require() outside this callback would resolve against the OUTER, non-isolated module
    // registry, a DIFFERENT `handlerRegistry`/`getLogFilePath` instance than the one `init`
    // (also required here) actually populates.
    const { getLogFilePath } = require('../../logger/paths')
    const { handlerRegistry } = require('../electronStub')
    /* eslint-enable @typescript-eslint/no-require-imports */

    harness = {
      init,
      deliverStartupProtocolUrl,
      backendEvents,
      axiosGet: axiosInstance.get,
      i18nextInstance,
      appFolder,
      logFilePath: getLogFilePath({}),
      handlerRegistry
    }
  })
  return harness
}

describe('sidecar bootstrap wirings (Phase 34.2 Plan 01 -- REQ-34.2-02/04/07/14)', () => {
  let originalCi: string | undefined

  beforeAll(() => {
    // Both fetchLastestReleases and downloadAntiCheatData early-return on
    // `process.env.CI === 'e2e'` -- this suite must never be under that value.
    originalCi = process.env.CI
    if (process.env.CI === 'e2e') {
      delete process.env.CI
    }
  })

  afterAll(() => {
    if (originalCi === undefined) {
      delete process.env.CI
    } else {
      process.env.CI = originalCi
    }
    // Deviation (Rule 1 -- bug, found empirically running this suite repeatedly):
    // deleting the tmp home directory tree here -- even once, after every test's own
    // `await`s have settled -- reproducibly crashed the WHOLE Node process with an
    // uncaught `ENOENT`/`ENOTDIR` from `LogWriter.writeString()` (backend/logger/
    // log_writer.ts). `initLogger()` (real, run once per isolated `init()` call in this
    // suite) queues its own log writes fire-and-forget -- no caller in this codebase
    // `await`s a `logXXX()` call -- so a write can still be in flight, mid-`mkdir`, when
    // this hook runs, and `rmSync` out from under it throws an UNHANDLED rejection that
    // is not scoped to any one test and kills the process outright (exit 1 even though
    // Jest itself reports every test green). This is the same class of pre-existing
    // async leak this codebase's own `library.ts` jest exit-1 precedent names.
    // `steamAuthFlows.test.ts` -- this repo's other suite that redirects `os.homedir()`
    // to a disposable tmp directory and drives the real, unmocked sidecar -- does NOT
    // clean that directory up either, for the same reason; this suite follows that
    // precedent instead of the literal plan instruction. Per-test uniqueness
    // (`mockTestHomeSuffix`) already guarantees no cross-test contamination (see that
    // guard's own comment above); leaving the tree behind only costs disk space the OS
    // temp directory already exists to reclaim.
  })

  beforeEach(() => {
    mockTestHomeSuffix += 1
  })

  it('REQ-34.2-02: i18next actually initializes so t() returns real strings, not undefined', async () => {
    const { init, i18nextInstance } = setupIsolatedBootstrap()
    const input = new PassThrough()
    const output = new PassThrough()

    init(input, output)
    await waitFor(() => i18nextInstance.isInitialized === true)

    const translated = i18nextInstance.t(
      'notify.error.reparing',
      'Error Repairing'
    )
    // Explicit regression assertion: before D-02, i18next was never init()'d under the
    // sidecar and `t()` returned `undefined` for every backend call site.
    expect(typeof translated).toBe('string')
    expect(translated).not.toBe('')
    expect(translated).toBe('Error Repairing')
  })

  it('REQ-34.2-02 negative control: this suite never mocks i18next (by-construction guard)', () => {
    const source = readFileSync(__filename, 'utf-8')
    const stripped = stripComments(source)
    expect(stripped).not.toMatch(/jest\.mock\(\s*['"]i18next['"]/)
  })

  it('REQ-34.2-07: releasesInfoReady genuinely fires with the fetched payload', async () => {
    const { init, backendEvents, axiosGet } = setupIsolatedBootstrap()
    const spy = jest.fn()
    backendEvents.on('releasesInfoReady', spy)

    const input = new PassThrough()
    const output = new PassThrough()
    init(input, output)
    await flush()

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        anticheatFiles: { shaMac: mockShaMac, shaLinux: mockShaLinux }
      })
    )
    expect(
      axiosGet.mock.calls.some(([url]: [string]) =>
        String(url).includes('release-data.json')
      )
    ).toBe(true)
  })

  it('REQ-34.2-04/REQ-34.2-07: the re-homed listener writes the anticheat data file to disk', async () => {
    const { init, appFolder } = setupIsolatedBootstrap()
    // Electron guarantees userData exists before any file operation runs; the sidecar's
    // fileStore only mkdir's on its own first WRITE (fileStore.ts's persist()), so this test
    // pre-creates the directory the same way a real Electron app start would have.
    mkdirSync(appFolder, { recursive: true })

    const input = new PassThrough()
    const output = new PassThrough()
    init(input, output)

    const anticheatDataPath = join(appFolder, 'areweanticheatyet.json')
    await flush()
    await waitFor(() => existsSync(anticheatDataPath))

    const contents = readFileSync(anticheatDataPath, 'utf-8')
    expect(contents).toBe(mockGamesJsonText)
  })

  it('REQ-34.2-07 idempotency: two init() calls yield exactly one fetch and one listener', async () => {
    const { init, backendEvents, axiosGet } = setupIsolatedBootstrap()
    // `backendEvents` is a real, unmocked, process-wide singleton -- the `./handlers` import
    // graph pulled in by `setupIsolatedBootstrap()` above already registers its OWN
    // unrelated `releasesInfoReady` listeners (backend/tools/dxmt.ts,
    // backend/wine/manager/ipc_handler.ts) before this line runs, so a raw
    // `listenerCount('releasesInfoReady')` would be polluted by those legitimate,
    // out-of-scope features. `jest.spyOn` wraps (never replaces) the real `.on` method --
    // it is instrumentation, not a mock of `backend_events` itself -- so it isolates
    // exactly the `.on('releasesInfoReady', ...)` calls made by Block A's own guard,
    // triggered by the two `init()` calls below.
    const onSpy = jest.spyOn(backendEvents, 'on')

    const input1 = new PassThrough()
    const output1 = new PassThrough()
    init(input1, output1)
    await flush()

    const input2 = new PassThrough()
    const output2 = new PassThrough()
    init(input2, output2)
    await flush()

    const releaseDataCalls = axiosGet.mock.calls.filter(([url]: [string]) =>
      String(url).includes('release-data.json')
    )
    expect(releaseDataCalls).toHaveLength(1)

    const releasesInfoReadyRegistrations = onSpy.mock.calls.filter(
      ([eventName]) => eventName === 'releasesInfoReady'
    )
    expect(releasesInfoReadyRegistrations).toHaveLength(1)
  })

  it('REQ-34.2-14: the sidecar still reaches READY_SENTINEL and does not throw', async () => {
    const { init } = setupIsolatedBootstrap()
    const input = new PassThrough()
    const output = new PassThrough()
    const lines = collectLines(output)

    expect(() => init(input, output)).not.toThrow()
    await flush()

    expect(lines).toContain(READY_SENTINEL)
  })

  it('REQ-34.2-04/T-34.2-05: appFolder resolves inside the disposable tmp home, never the real config directory', () => {
    const { appFolder } = setupIsolatedBootstrap()
    expect(appFolder.startsWith(tmpdir())).toBe(true)
  })
})

// Phase 34.5 gap cycle 6 plan 44 (F-34.5-G6-09, REQ-34.5-01/05/12): production wiring for
// `deliverStartupProtocolUrl`/`registerProtocolUrlHandler`, not a replica -- reuses this
// file's own `jest.isolateModules()` + redirected-`homedir` harness (see module docstring).
describe('sidecar bootstrap protocol-url wiring (Phase 34.5 gap cycle 6 plan 44, F-34.5-G6-09)', () => {
  beforeEach(() => {
    mockTestHomeSuffix += 1
  })

  it('Test A (behaviour, real log file): deliverStartupProtocolUrl makes the real LogWriter write the [ProtocolHandler] Received line', async () => {
    const { init, deliverStartupProtocolUrl, logFilePath, appFolder } =
      setupIsolatedBootstrap()
    // Same precondition the pre-existing anticheat-data test (above) states explicitly: a
    // real Electron app guarantees `userData` exists before any file operation runs, via
    // `app.whenReady()`; the sidecar has no such hook. Belt-and-braces here even though the
    // runner-less URL below is not expected to reach a GameConfig write (see next comment).
    mkdirSync(join(appFolder, 'GamesConfig'), { recursive: true })

    const input = new PassThrough()
    const output = new PassThrough()
    init(input, output)
    await flush()

    // Deviation (Rule 1 -- bug, found live running this test): the plan's own draft used
    // `&runner=gog`, but with an explicit runner `findGame` (protocol.ts:188) calls
    // `libraryManagerMap[runner].getGame(appName).getGameInfo()` DIRECTLY, skipping the
    // truthy-`app_name` check the runner-LESS branch (protocol.ts:191-196) applies -- every
    // real, unmocked store manager's `getGameInfo()` returns `{app_name: '', ...}` for an
    // unrecognised appName (confirmed by direct read of gog/legendary/nile/sideload
    // `games.ts`), which is still a DEFINED object, so `handleLaunch` proceeded past its
    // `if (!gameInfo) return` guard and reached the REAL, unmocked
    // `GOGGame.getSettings()` -> `GameConfig.get()` -> `new GameConfigV0(...)`, which needs
    // far more of the real settings-merge machinery (`enviromentOptions` and friends) than
    // this file's minimal `GlobalConfig` mock provides -- an unrelated crash, not the log
    // observable this test exists to prove. Dropping `runner=` here restores the plan's own
    // STATED intent ("findGame returns nothing and no real launch is attempted"): with no
    // runner, `findGame` iterates every manager and returns `undefined` since ALL FOUR real
    // implementations report a falsy `app_name` for this appName, so `handleLaunch` logs
    // "Could not receive game data" and returns immediately after the `Received` line below.
    const testUrl = 'gamelib://launch?appName=__gamelib_test_missing__'
    deliverStartupProtocolUrl(['--no-gui', testUrl])

    // Real, unmocked LogWriter queues its write fire-and-forget (no caller in this codebase
    // `await`s a `logXXX()` call) -- poll for the CONTENT, not merely the file's existence,
    // since the file can exist (from init()'s own earlier boot-diagnostic writes) before this
    // specific line has landed.
    await waitFor(() => {
      if (!existsSync(logFilePath)) return false
      return readFileSync(logFilePath, 'utf-8').includes(
        'Received gamelib://launch?appName=__gamelib_test_missing__'
      )
    })

    const contents = readFileSync(logFilePath, 'utf-8')
    expect(contents).toMatch(
      /\[ProtocolHandler\]:\s+Received gamelib:\/\/launch\?appName=__gamelib_test_missing__/
    )
  })

  it('Test A negative control: logFilePath resolves under the redirected tmp home, never the real ~/Library/Logs/GameLib', () => {
    const { logFilePath } = setupIsolatedBootstrap()
    expect(logFilePath.startsWith(tmpdir())).toBe(true)
    expect(logFilePath).not.toContain('Library/Logs/GameLib')
  })

  // Test B is intentionally SEPARATE from Test A: calling `deliverStartupProtocolUrl`
  // directly (Test A) proves the FUNCTION works, never that `init()` actually calls it. The
  // two failures are independent -- a deleted call site inside `init()` would leave Test A
  // green forever, which is exactly the trap `test-must-exercise-production-call-shape`
  // names. This is a by-construction source gate instead, reading `bootstrap.ts`'s own
  // source text.
  describe('Test B (by-construction, source gate): init() calls both registerProtocolUrlHandler() and deliverStartupProtocolUrl()', () => {
    function extractInitBody(source: string): string {
      const stripped = stripComments(source)
      const startMarker = 'export function init('
      const start = stripped.indexOf(startMarker)
      expect(start).toBeGreaterThan(-1)
      // init() is the last top-level export in bootstrap.ts -- slice to EOF rather than
      // hunting for a second marker that could itself drift.
      return stripped.slice(start)
    }

    it('the real bootstrap.ts source calls both inside init()', () => {
      const source = readFileSync(
        join(__dirname, '..', 'bootstrap.ts'),
        'utf-8'
      )
      const initBody = extractInitBody(source)
      expect(initBody).toContain('registerProtocolUrlHandler()')
      expect(initBody).toContain('deliverStartupProtocolUrl()')
    })

    it('self-test (RED proof): a synthetic init() missing both calls does NOT satisfy the gate', () => {
      const synthetic = [
        'export function init(input, output) {',
        '  startRpcServer(input, output)',
        "  output.write(`${READY_SENTINEL}\\n`)",
        '}'
      ].join('\n')
      const initBody = extractInitBody(synthetic)
      expect(initBody).not.toContain('registerProtocolUrlHandler()')
      expect(initBody).not.toContain('deliverStartupProtocolUrl()')
    })

    it('self-test (RED proof): a synthetic init() missing ONLY registerProtocolUrlHandler() still fails the gate', () => {
      const synthetic = [
        'export function init(input, output) {',
        '  startRpcServer(input, output)',
        "  output.write(`${READY_SENTINEL}\\n`)",
        '  deliverStartupProtocolUrl()',
        '}'
      ].join('\n')
      const initBody = extractInitBody(synthetic)
      expect(initBody).not.toContain('registerProtocolUrlHandler()')
    })
  })

  it('Test C (registration + rejection): handleProtocolUrl accepts a gamelib:// url and rejects a non-gamelib one without echoing it', async () => {
    const { init, handlerRegistry, appFolder } = setupIsolatedBootstrap()
    // Same precondition as Test A above -- the accepted URL below carries no `runner` param,
    // so findGame's all-runner search may reach a real GameConfig read/write for whichever
    // runner (if any) resolves a match.
    mkdirSync(join(appFolder, 'GamesConfig'), { recursive: true })

    const input = new PassThrough()
    const output = new PassThrough()
    init(input, output)
    await flush()

    const handler = handlerRegistry.get('handleProtocolUrl')
    expect(handler).toBeDefined()

    // `registerProtocolUrlHandler`'s handler is NOT declared `async` -- it dispatches
    // `handleProtocol` via a fire-and-forget `Promise.resolve(...).catch(...)` and returns
    // `true` SYNCHRONOUSLY (load-bearing: it must never await the launch, Task 1's
    // `handle_protocol_url_channel_is_bounded_at_invoke_timeout` pins why). Assert the plain
    // return value, not a resolved promise.
    expect(
      handler?.(undefined, 'gamelib://launch?appName=__gamelib_test_missing__')
    ).toBe(true)

    // The rejection is a SYNCHRONOUS throw (the handler function itself is not async), so
    // this is a plain try/catch, not an awaited rejection.
    let rejection: unknown
    try {
      handler?.(undefined, 'https://evil.example/x')
    } catch (error) {
      rejection = error
    }
    expect(rejection).toBeDefined()
    expect(String(rejection)).toMatch(/rejected a non-gamelib argument/)
    // T-34.5-G6-25: the rejection message must never echo the rejected value.
    expect(String(rejection)).not.toContain('evil.example')
  })
})

// Comment-stripping now delegates to the shared
// `backend/testUtils/stripSourceComments` util (strips block comments first,
// then the line-prefix filter), imported above as `stripComments`.
