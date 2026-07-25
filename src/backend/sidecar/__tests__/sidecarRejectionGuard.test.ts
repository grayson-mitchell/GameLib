/**
 * Proves REQ-34.2-07 gap #2 / code-review CR-02 is actually closed (Phase 34.2 Plan 09,
 * Task 3) and pins the contract of the two mitigations Tasks 1/2 landed:
 *
 * Group 1 drives the REAL, unmocked `bootstrap.ts` `releasesInfoReady` listener with a
 * REJECTING `downloadAntiCheatData` (the exact fault T-34.2-38 describes -- an `EACCES`/
 * `ENOENT`/TOCTOU/is-a-directory fault on `<appFolder>/areweanticheatyet.json`) and proves the
 * sidecar survives: no `unhandledRejection` fires, a warning is logged, and the listener still
 * ran. This is the RED case this whole plan exists to fix -- see the `RED-PROOF` comment on
 * the first test in that group for exactly which line makes it fail if reverted.
 *
 * Group 2 unit-tests `installUnhandledRejectionGuard` in isolation against a fake
 * `EventEmitter` (never the real jest worker `process`): idempotency, that it logs without
 * throwing, and -- the `sidecar-dialog-reject-crashes`-governed case -- that it still does not
 * throw even when its OWN `logWarning` call throws (the early-boot, `heroicLogWriter`-unset
 * window before `bootstrap.init()` runs).
 *
 * Group 3 is a by-construction, source-text gate proving `installUnhandledRejectionGuard()`
 * precedes `init()` in `src/sidecar/index.ts`. That file is READ as text, never imported --
 * `src/sidecar/` is not a jest project root (see `jest.config.js`'s `projects` list), and
 * importing it would execute the real `init()` at module scope.
 *
 * Mirrors `bootstrapWirings.test.ts`'s harness shape: `jest.isolateModules()` + CommonJS
 * `require()` per test (module-scope singletons in `bootstrap.ts` --
 * `anticheatListenerRegistered`/`releasesFetchInitialized` -- and in `processGuards.ts` --
 * `unhandledRejectionGuardInstalled` -- would otherwise leak across tests in this file), the
 * `jest.unmock('i18next')` line (defeats the project-wide automatic manual mock so the real
 * singleton bootstrap.ts uses is exercised, same reasoning as that file's own header), and the
 * `mock`-prefixed, per-test-namespaced `os.homedir()` redirect to a disposable tmp directory.
 *
 * NO FILESYSTEM WRITES: `downloadAntiCheatData` is mocked in every test in this file, and this
 * suite never calls any directory-creation, file-write, or file-removal Node fs API itself.
 * This is deliberate (finding CR-03, T-34.2-42): `pathShim.resolveAppDataDir()` prefers
 * `env.APPDATA`/`env.XDG_CONFIG_HOME` over `homedir()` on Windows/Linux, so an `os.homedir()`
 * mock alone does not guarantee redirection there. The `beforeAll` below adds a
 * `resolve`+`relative` containment tripwire on `appFolder` (mirroring `fileStore.ts`'s own
 * containment-check idiom -- `relative(resolve(base), target)` then
 * `startsWith('..') || isAbsolute(...)`, NOT `path.join`, which this project's recorded
 * convention holds is not a containment check) so a future edit that starts writing fails
 * loudly here instead of silently reaching a real user config directory.
 */

import { PassThrough } from 'node:stream'
import EventEmitter from 'node:events'
import { readFileSync } from 'fs'
import { join, resolve, relative, isAbsolute } from 'path'
import { tmpdir } from 'os'

// ── i18next — defeat Jest's project-wide automatic manual mock (same load-bearing reasoning
// as bootstrapWirings.test.ts's own header: without this, `require('i18next')` inside the
// isolated registry below would silently resolve to `src/backend/__mocks__/i18next.ts`'s stub
// regardless of anything else in this file). Not load-bearing for THIS suite's assertions the
// way it is for bootstrapWirings' own i18next test, but kept for parity with the harness this
// file mirrors, so `bootstrap.init()` initializes exactly as it does in production. ──────────
jest.unmock('i18next')

// ── os — redirect homedir() to a disposable per-process tmp directory (GAP FIX precedent,
// appShellFlows.test.ts / bootstrapWirings.test.ts), namespaced per test via
// `mockTestHomeSuffix` so `downloadAntiCheatData`'s own md5-unchanged-skip logic (were it not
// mocked) could never see a sibling test's file -- kept even though this suite mocks
// `downloadAntiCheatData` away, for parity with the harness and as defence-in-depth. ─────────
let mockTestHomeSuffix = 0

jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(
        actual.tmpdir(),
        `gamelib-sidecarrejectionguard-test-home-${process.pid}`,
        String(mockTestHomeSuffix)
      )
  }
})

// ── electron / electron-store — route Jest's own module resolution at the REAL sidecar shims
// (mirrors bootstrapWirings.test.ts / appShellFlows.test.ts) ──────────────────────────────────
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── online_monitor — full-surface mock, same reasoning as bootstrapWirings.test.ts's own
// block ─────────────────────────────────────────────────────────────────────────────────────
jest.mock('../../online_monitor', () => ({
  initOnlineMonitor: jest.fn(),
  isOnline: jest.fn(() => true),
  runOnceWhenOnline: jest.fn((callback: () => unknown) => callback()),
  onConnectivityChange: jest.fn()
}))

// ── axios — every call rejects. This suite never needs a real `releasesInfoReady` auto-fire
// from `fetchLastestReleases` (Block B) -- it drives the listener directly via a manual
// `backendEvents.emit`, below -- and `fetchLastestReleases`'s own try/catch already swallows
// this rejection into a `logWarning` call (see `backend/utils/releases.ts`), so it can never
// produce an unhandled rejection of its own. Keeping every URL rejecting (rather than
// resolving release-data.json like bootstrapWirings.test.ts does) guarantees Block A's real
// listener fires EXACTLY ONCE per test -- from our manual emit only -- which the
// "called exactly once" assertion below depends on. ────────────────────────────────────────
jest.mock('axios', () => {
  const mockInstance = {
    get: jest.fn(() =>
      Promise.reject(
        new Error(
          'sidecarRejectionGuard.test.ts: axios.get is not exercised in this suite'
        )
      )
    ),
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
// bootstrapWirings.test.ts), pinning isMac:false/isLinux:true so Block A's
// `isMac ? shaMac : shaLinux` selects the `shaLinux` argument deterministically ──────────────
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true,
  isIntelMac: false,
  isSteamDeckGameMode: false,
  isFlatpak: false
}))

// ── backend/config — avoid a real on-disk config.json write while leaving the real i18next
// path intact (mirrors bootstrapWirings.test.ts) ──────────────────────────────────────────────
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: jest.fn()
  }
}))

// ── backend/anticheat/utils — the fault this whole plan exists to survive. `downloadAntiCheatData`
// always REJECTS with a filesystem-fault-shaped Error (the T-34.2-38 scenario); `gameAnticheatInfo`
// stays a plain jest.fn() so any other registration module that imports this file still loads
// cleanly. ──────────────────────────────────────────────────────────────────────────────────
jest.mock('../../anticheat/utils', () => ({
  downloadAntiCheatData: jest.fn(() =>
    Promise.reject(
      new Error(
        "EACCES: permission denied, open 'areweanticheatyet.json'"
      )
    )
  ),
  gameAnticheatInfo: jest.fn()
}))

// Deliberately NOT `jest.mock('backend/logger', ...)`: `backend/logger/index.ts` and
// `log_writer.ts` import each other circularly (`log_writer.ts` imports `getLogFilePath` FROM
// `./index`, which itself imports `LogWriter` from `./log_writer`). A `jest.mock` factory that
// calls `jest.requireActual('backend/logger')` re-enters that SAME mocked module specifier
// while `log_writer.ts`'s own `require('./index')` resolves to the identical absolute path --
// breaking the circular reference Node's plain CJS caching otherwise resolves cleanly (empirically
// confirmed: throws `TypeError: getLogFilePath is not a function` inside `LogWriter`'s
// constructor). `jest.spyOn` below wraps the REAL, already-fully-loaded module object in place
// instead of re-triggering module resolution, so the circular require path is never disturbed.

/** Waits a few microtask/macrotask turns for fire-and-forget async work to progress (mirrors
 * bootstrapWirings.test.ts's own `flush`). */
async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((res) => setImmediate(res))
  }
}

/** Strips `//`, `/* ... *\/`-continuation, and `*`-prefixed docblock lines before matching, so
 * this file's own explanatory comments (which necessarily name the patterns under test) cannot
 * self-satisfy a gate (mirrors gameDetailsImportGate.test.ts's/bootstrapWirings.test.ts's own
 * `stripComments`). */
function stripComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
}

/**
 * Requires the sidecar bootstrap graph fresh inside its own `jest.isolateModules()` sandbox
 * (see module docstring for why this is required, not cosmetic) and returns the handles
 * Group 1's tests need, including the mocked `downloadAntiCheatData` and the wrapped
 * `logWarning` spy from THIS SAME isolated registry -- the one `bootstrap.ts`'s Block A
 * listener actually calls.
 *
 * `eslint-disable @typescript-eslint/no-require-imports` throughout: `jest.isolateModules()`'s
 * callback must run synchronously, so these must be CommonJS `require()` calls, not dynamic
 * `import()` (mirrors bootstrapWirings.test.ts's own precedent).
 */
function setupIsolatedBootstrapHarness(): {
  init: (input: PassThrough, output: PassThrough) => void

  backendEvents: any
  downloadAntiCheatDataMock: jest.Mock
  logWarningMock: jest.SpyInstance
  appFolder: string
} {
  let harness!: ReturnType<typeof setupIsolatedBootstrapHarness>
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GlobalConfig } = require('backend/config')
    ;(GlobalConfig.get as jest.Mock).mockReturnValue({
      getSettings: () => ({ language: 'en' }),
      setSetting: jest.fn(),
      set: jest.fn(),
      flush: jest.fn()
    })

    const { backendEvents } = require('../../backend_events')
    const { init } = require('../bootstrap')
    const { downloadAntiCheatData } = require('../../anticheat/utils')
    const loggerModule = require('backend/logger')
    const { appFolder } = require('../../constants/paths')
    /* eslint-enable @typescript-eslint/no-require-imports */

    // spyOn (not jest.mock) — wraps the real, already-loaded module object in place so
    // logWarning's actual implementation still runs (observable call history) without
    // disturbing backend/logger's own circular require graph. See the module-level comment
    // above the `jest.mock('electron', ...)` block for why a factory-based mock breaks here.
    const logWarningSpy = jest.spyOn(loggerModule, 'logWarning')

    harness = {
      init,
      backendEvents,
      downloadAntiCheatDataMock: downloadAntiCheatData,
      logWarningMock: logWarningSpy,
      appFolder
    }
  })
  return harness
}

/**
 * Requires `processGuards.ts` fresh inside its own `jest.isolateModules()` sandbox, so the
 * module-scope `unhandledRejectionGuardInstalled` singleton (mirroring `bootstrap.ts`'s own
 * `anticheatListenerRegistered`/`releasesFetchInitialized` pattern) starts `false` for every
 * test in Group 2 -- otherwise a test that calls `installUnhandledRejectionGuard` first would
 * make every later test's call a silent no-op against ITS OWN fresh `EventEmitter` target,
 * since the flag is not keyed by target.
 */
function loadFreshProcessGuards(): {
  installUnhandledRejectionGuard: (target?: NodeJS.EventEmitter) => void
  logWarningMock: jest.SpyInstance
} {
  let harness!: ReturnType<typeof loadFreshProcessGuards>
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const loggerModule = require('backend/logger')
    const { installUnhandledRejectionGuard } = require('../processGuards')
    /* eslint-enable @typescript-eslint/no-require-imports */
    const logWarningSpy = jest.spyOn(loggerModule, 'logWarning')
    harness = {
      installUnhandledRejectionGuard,
      logWarningMock: logWarningSpy
    }
  })
  return harness
}

describe('sidecarRejectionGuard (Phase 34.2 Plan 09 Task 3 -- REQ-34.2-07 gap #2 / CR-02 / T-34.2-38..41)', () => {
  let originalCi: string | undefined

  beforeAll(() => {
    // downloadAntiCheatData and fetchLastestReleases both early-return on
    // `process.env.CI === 'e2e'` -- this suite must never be under that value (mirrors
    // bootstrapWirings.test.ts).
    originalCi = process.env.CI
    if (process.env.CI === 'e2e') {
      delete process.env.CI
    }

    // T-34.2-42 / CR-03 containment tripwire: prove the resolved `appFolder` this whole
    // suite's redirected `os.homedir()` produces is actually contained inside `os.tmpdir()`,
    // using the SAME `resolve`+`relative` idiom `fileStore.ts`'s own containment check uses
    // (`relative(resolve(base), target)` then `startsWith('..') || isAbsolute(...)`) --
    // never `path.join`, which is not a containment check.
    const { appFolder } = setupIsolatedBootstrapHarness()
    const relativeToTmpdir = relative(resolve(tmpdir()), resolve(appFolder))
    expect(relativeToTmpdir.startsWith('..')).toBe(false)
    expect(isAbsolute(relativeToTmpdir)).toBe(false)
  })

  afterAll(() => {
    if (originalCi === undefined) {
      delete process.env.CI
    } else {
      process.env.CI = originalCi
    }
    // Deviation precedent (bootstrapWirings.test.ts's own `afterAll`): deleting the tmp home
    // directory tree here is deliberately NOT done -- `initLogger()`'s fire-and-forget log
    // writes can still be mid-flight when this hook runs, and a directory removal out from
    // under one reproducibly crashes the whole Node process with an unscoped unhandled
    // `ENOENT`/`ENOTDIR`.
    // Per-test uniqueness (`mockTestHomeSuffix`) already guarantees no cross-test
    // contamination; leaving the tree behind only costs disk space the OS temp directory
    // already exists to reclaim.
  })

  beforeEach(() => {
    mockTestHomeSuffix += 1
  })

  describe('Group 1: survival proof -- a rejecting downloadAntiCheatData cannot kill the sidecar', () => {
    // RED-PROOF: reverting Task 1's `.catch()` on the `downloadAntiCheatData(...)` call in
    // `bootstrap.ts`'s Block A back to a bare `void downloadAntiCheatData(...)` makes THIS
    // test fail -- the local `process.on('unhandledRejection', ...)` spy below observes the
    // rejection instead of it being caught at the call site. Verified by hand during this
    // task's execution (recorded in the plan SUMMARY's RED spot-check note) and restored
    // immediately afterwards.
    it('RED-PROOF REQ-34.2-07: no unhandledRejection fires when downloadAntiCheatData rejects', async () => {
      const { init, backendEvents } = setupIsolatedBootstrapHarness()

      const unhandledRejectionSpy = jest.fn()
      process.on('unhandledRejection', unhandledRejectionSpy)
      try {
        const input = new PassThrough()
        const output = new PassThrough()
        init(input, output)

        backendEvents.emit('releasesInfoReady', {
          anticheatFiles: { shaMac: 'mock-sha-mac', shaLinux: 'mock-sha-linux' }
        })
        await flush()

        expect(unhandledRejectionSpy).toHaveBeenCalledTimes(0)
      } finally {
        process.off('unhandledRejection', unhandledRejectionSpy)
      }
    })

    it('REQ-34.2-07/CR-02: logs a warning containing "[bootstrap] downloadAntiCheatData failed:"', async () => {
      const { init, backendEvents, logWarningMock } =
        setupIsolatedBootstrapHarness()

      const input = new PassThrough()
      const output = new PassThrough()
      init(input, output)

      backendEvents.emit('releasesInfoReady', {
        anticheatFiles: { shaMac: 'mock-sha-mac', shaLinux: 'mock-sha-linux' }
      })
      await flush()

      const matched = logWarningMock.mock.calls.some(
        ([message]) =>
          typeof message === 'string' &&
          message.includes('[bootstrap] downloadAntiCheatData failed:')
      )
      expect(matched).toBe(true)
    })

    it('REQ-34.2-07: the listener still ran -- downloadAntiCheatData was called exactly once with the platform-selected hash', async () => {
      const { init, backendEvents, downloadAntiCheatDataMock } =
        setupIsolatedBootstrapHarness()

      const input = new PassThrough()
      const output = new PassThrough()
      init(input, output)

      backendEvents.emit('releasesInfoReady', {
        anticheatFiles: { shaMac: 'mock-sha-mac', shaLinux: 'mock-sha-linux' }
      })
      await flush()

      // isMac:false/isLinux:true (mocked above) -> Block A selects shaLinux, never shaMac.
      expect(downloadAntiCheatDataMock).toHaveBeenCalledTimes(1)
      expect(downloadAntiCheatDataMock).toHaveBeenCalledWith('mock-sha-linux')
    })
  })

  describe('Group 2: installUnhandledRejectionGuard contract', () => {
    it('registers exactly one unhandledRejection listener on the given target', () => {
      const { installUnhandledRejectionGuard } = loadFreshProcessGuards()
      const target = new EventEmitter()

      installUnhandledRejectionGuard(target)

      expect(target.listenerCount('unhandledRejection')).toBe(1)
    })

    it('idempotency: a second call on the same target does not register a second listener', () => {
      const { installUnhandledRejectionGuard } = loadFreshProcessGuards()
      const target = new EventEmitter()

      installUnhandledRejectionGuard(target)
      installUnhandledRejectionGuard(target)

      expect(target.listenerCount('unhandledRejection')).toBe(1)
    })

    it('logs "[sidecar] unhandled promise rejection:" and never throws out of emit()', () => {
      const { installUnhandledRejectionGuard, logWarningMock } =
        loadFreshProcessGuards()
      const target = new EventEmitter()
      installUnhandledRejectionGuard(target)

      const reason = new Error('disk full')

      expect(() => target.emit('unhandledRejection', reason)).not.toThrow()
      expect(logWarningMock).toHaveBeenCalledWith(
        expect.stringContaining('[sidecar] unhandled promise rejection:'),
        expect.anything()
      )
    })

    it('T-34.2-40 (sidecar-dialog-reject-crashes precedent): still never throws when logWarning itself throws -- falls back to process.stderr.write', () => {
      const { installUnhandledRejectionGuard, logWarningMock } =
        loadFreshProcessGuards()
      logWarningMock.mockImplementationOnce(() => {
        // Simulates the early-boot window before bootstrap.init() runs initLogger(), where
        // heroicLogWriter is unset and a real logWarning() call would itself throw.
        throw new Error('heroicLogWriter is not initialized')
      })
      const stderrWriteSpy = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true)

      try {
        const target = new EventEmitter()
        installUnhandledRejectionGuard(target)
        const reason = new Error('EACCES')

        expect(() => target.emit('unhandledRejection', reason)).not.toThrow()
        expect(stderrWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[sidecar] unhandled promise rejection:')
        )
      } finally {
        stderrWriteSpy.mockRestore()
      }
    })

    // RED-PROOF (gap cycle 2, CR-02): reverting processGuards.ts's `let message = <fallback
    // literal>; try { message = ... }` back to a single `const message = \`...${String(reason)}\``
    // built OUTSIDE its own try -- i.e. moving the reassignment above/out of the try block --
    // makes THIS test fail: `target.emit('unhandledRejection', ...)` throws
    // `TypeError: Cannot convert object to primitive value` instead of returning normally.
    // Verified by hand during this task's execution (recorded in the plan SUMMARY's RED
    // spot-check note) and restored immediately afterwards.
    it('CR-02 regression (gap cycle 2): never throws out of emit() for a null-prototype reason', () => {
      const { installUnhandledRejectionGuard, logWarningMock } =
        loadFreshProcessGuards()
      const target = new EventEmitter()
      installUnhandledRejectionGuard(target)

      const reason = Object.create(null)

      expect(() => target.emit('unhandledRejection', reason)).not.toThrow()
      expect(logWarningMock).toHaveBeenCalledWith(
        '[sidecar] unhandled promise rejection: <unstringifiable reason>',
        expect.anything()
      )
    })

    it('CR-02 regression (gap cycle 2): never throws out of emit() when reason.toString throws', () => {
      const { installUnhandledRejectionGuard, logWarningMock } =
        loadFreshProcessGuards()
      const target = new EventEmitter()
      installUnhandledRejectionGuard(target)

      const reason = {
        toString() {
          throw new Error('toString exploded')
        }
      }

      expect(() => target.emit('unhandledRejection', reason)).not.toThrow()
      expect(logWarningMock).toHaveBeenCalledWith(
        '[sidecar] unhandled promise rejection: <unstringifiable reason>',
        expect.anything()
      )
    })

    it('CR-02 regression (gap cycle 2): never throws out of emit() when reason[Symbol.toPrimitive] throws', () => {
      const { installUnhandledRejectionGuard, logWarningMock } =
        loadFreshProcessGuards()
      const target = new EventEmitter()
      installUnhandledRejectionGuard(target)

      const reason = {
        [Symbol.toPrimitive]() {
          throw new Error('toPrimitive exploded')
        }
      }

      expect(() => target.emit('unhandledRejection', reason)).not.toThrow()
      expect(logWarningMock).toHaveBeenCalledWith(
        '[sidecar] unhandled promise rejection: <unstringifiable reason>',
        expect.anything()
      )
    })
  })

  describe('Group 3: entry-ordering gate (by-construction, source text -- src/sidecar/ is not a jest project root)', () => {
    it('src/sidecar/index.ts calls installUnhandledRejectionGuard() before init()', () => {
      const source = readFileSync(
        join(__dirname, '../../../sidecar/index.ts'),
        'utf-8'
      )
      const stripped = stripComments(source)

      const guardCallIndex = stripped.indexOf('installUnhandledRejectionGuard(')
      const initCallIndex = stripped.indexOf('init()')

      expect(guardCallIndex).toBeGreaterThan(-1)
      expect(initCallIndex).toBeGreaterThan(-1)
      expect(guardCallIndex).toBeLessThan(initCallIndex)
    })
  })
})
