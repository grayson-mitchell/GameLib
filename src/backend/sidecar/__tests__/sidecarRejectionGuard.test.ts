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
 * CONTAINMENT (closes 34.2 gap cycle 2 / CR-03 / WR-01): every test in this file drives the
 * REAL, unmocked `bootstrap.init()` -> `initLogger()`, which creates and rotates a REAL log
 * file on disk (`LogWriter#archiveOldLogFile()` `renameSync`s an existing `gamelib.log` to
 * `gamelib.log.old` on first write) -- this suite's earlier claim of touching zero files on
 * disk was false. Those writes are redirected into a disposable per-suite tmp root by TWO
 * separate mocks below: a `pathShim` module mock (the choke point `constants/paths.ts`'s
 * `appFolder`/`userDataPath`/`fixesPath` resolve through, since `pathShim.resolveAppDataDir()`
 * prefers `env.APPDATA`/`env.XDG_CONFIG_HOME` over `homedir()` on Windows/Linux -- the
 * `os.homedir()` mock above is insufficient by itself, per finding CR-03/T-34.2-42, first
 * fixed for `gameDetailsFlows.test.ts`/`enrichmentFlows.test.ts` in plan 34.2-10) and a
 * `backend/logger/paths` module mock (the log path is computed INDEPENDENTLY of `pathShim` --
 * `getBaseLogPath()` reads `process.env.LOCALAPPDATA`/`XDG_STATE_HOME` plus `homedir()`
 * directly, so it bypasses BOTH the `os` mock and the `pathShim` mock -- finding WR-01,
 * uncovered by every tripwire in this cluster until now). The `beforeAll` below adds a
 * `resolve`+`relative` containment tripwire (mirroring `fileStore.ts`'s own containment-check
 * idiom -- `relative(resolve(base), target)` then `startsWith('..') || isAbsolute(...)`, NOT
 * `path.join`, which this project's recorded convention holds is not a containment check) over
 * `appFolder`, `userDataPath`, `fixesPath` AND `getLogFilePath({})` so a future edit that
 * starts writing, or a regression in either mock, fails loudly here instead of silently
 * reaching a real user config or log directory.
 */

import { PassThrough } from 'node:stream'
import EventEmitter from 'node:events'
import { readFileSync, readdirSync } from 'fs'
import { join, resolve, relative, isAbsolute } from 'path'
import { tmpdir } from 'os'
import { getLogFilePath } from 'backend/logger/paths'
import { stripSourceComments as stripComments } from 'backend/testUtils/stripSourceComments'

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

// ── pathShim — CR-03: the REAL choke point. `constants/paths.ts`'s module-scope
// `app.getPath('appData'|'userData')` calls resolve through `electronStub.ts` ->
// `pathShim.getPath()`, whose real `resolveAppDataDir()` prefers `env.APPDATA` (win32) /
// `env.XDG_CONFIG_HOME` (default/Linux) over `homedir()` -- bypassing the `jest.mock('os', ...)`
// redirect above on those platforms. Copied verbatim from `gameDetailsFlows.test.ts:136-161`
// except for the tmp-root name -- no platform branch, no environment variable participating.
//
// NOTE (deliberately NOT reconciled): this tmp root is the PARENT of the per-test
// `os.homedir()` redirect above (which appends a `mockTestHomeSuffix` segment).
// `constants/paths.ts`'s `appFolder`/`userDataPath`/`fixesPath` are resolved ONCE, at
// require-time, via this pathShim mock's `appData`/`userData` branches -- before any
// per-test suffix exists -- so this root must stay stable across the whole suite's
// lifetime. Do NOT append `mockTestHomeSuffix` here to "match" the os mock; that would break
// module-scope singleton resolution the isolated harnesses below rely on. ──────────────────
jest.mock('../pathShim', () => {
  const actualOs = jest.requireActual('os')
  const actualPath = jest.requireActual('path')
  const tmpRoot = actualPath.join(
    actualOs.tmpdir(),
    `gamelib-sidecarrejectionguard-test-home-${process.pid}`
  )
  return {
    getPath: (name: string) => {
      switch (name) {
        case 'appData':
          return tmpRoot
        case 'userData':
          return actualPath.join(tmpRoot, 'GameLib')
        case 'temp':
          return actualOs.tmpdir()
        case 'home':
          return tmpRoot
        default:
          throw new Error(
            `[pathShim mock] getPath('${name}') is not shimmed for this test`
          )
      }
    }
  }
})

// ── backend/logger/paths — WR-01: `getLogFilePath`'s real `getBaseLogPath()` computes the log
// directory INDEPENDENTLY of `pathShim`, straight from `process.env.LOCALAPPDATA`/
// `XDG_STATE_HOME` plus `homedir()` -- so it bypasses BOTH the `os` mock and the `pathShim`
// mock above. This factory reimplements `getLogFilePath`'s relative-path derivation (heroic
// log vs runner log vs game log), rooted at the SAME tmp root as the `pathShim` mock, so
// distinct arguments still yield distinct paths. Copied verbatim from
// `loggerFlows.test.ts:134-158` except for the tmp-root name. Deliberately does NOT call
// `jest.requireActual('backend/logger')` -- `backend/logger/index.ts` and `log_writer.ts`
// import each other circularly, and re-entering that cycle from inside a mock factory throws
// inside `LogWriter`'s constructor (see this file's own note above the `jest.mock('electron',
// ...)` block on why `jest.spyOn`, not `jest.mock`, is used for `backend/logger` itself). ────
jest.mock('backend/logger/paths', () => {
  const actualPath = jest.requireActual('path')
  const actualOs = jest.requireActual('os')
  const tmpRoot = actualPath.join(
    actualOs.tmpdir(),
    `gamelib-sidecarrejectionguard-test-home-${process.pid}`
  )
  const logBaseDir = actualPath.join(tmpRoot, 'logs')
  return {
    getLogFilePath: (
      args: { appName?: string; runner?: string; type?: string } = {}
    ): string => {
      let relativeFilePath: string
      if (!(args?.appName || args?.runner)) {
        relativeFilePath = 'gamelib'
      } else if (args.runner && !args.appName) {
        relativeFilePath = actualPath.join('runners', args.runner)
      } else {
        const { appName, runner, type = 'launch' } = args
        relativeFilePath = actualPath.join(
          'games',
          `${appName}_${runner}`,
          type
        )
      }
      return actualPath.join(logBaseDir, relativeFilePath + '.log')
    }
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
      new Error("EACCES: permission denied, open 'areweanticheatyet.json'")
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

// Comment-stripping now delegates to the shared
// `backend/testUtils/stripSourceComments` util (strips block comments first,
// then the line-prefix filter), imported above as `stripComments`.

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
      logWarningMock: logWarningSpy
    }
  })
  return harness
}

/**
 * Requires `constants/paths.ts` fresh inside its own `jest.isolateModules()` sandbox and
 * returns just the three path constants the containment tripwire below needs.
 *
 * Refinement (gap cycle 2, plan 34.2-18, IN-03): the tripwire previously called the full
 * `setupIsolatedBootstrapHarness()` above -- building the entire bootstrap graph (backend
 * events, `downloadAntiCheatData`, the `logWarning` spy, GlobalConfig) and leaving an
 * unrestored `jest.spyOn` -- just to read one module's constants. This narrower helper reads
 * only `constants/paths.ts`, still inside `jest.isolateModules()` so the require-time
 * legacy-folder migration in that module runs against the SAME mocked `pathShim` as every
 * other test in this file, without the unrelated side effects.
 */
function loadConstantsPaths(): {
  appFolder: string
  userDataPath: string
  fixesPath: string
} {
  let result!: ReturnType<typeof loadConstantsPaths>
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const {
      appFolder,
      userDataPath,
      fixesPath
    } = require('../../constants/paths')
    /* eslint-enable @typescript-eslint/no-require-imports */
    result = { appFolder, userDataPath, fixesPath }
  })
  return result
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
    const {
      installUnhandledRejectionGuard,
      setUnhandledRejectionLogSink
    } = require('../processGuards')
    /* eslint-enable @typescript-eslint/no-require-imports */
    const logWarningSpy = jest.spyOn(loggerModule, 'logWarning')
    // WR-04 (gap cycle 1): `processGuards.ts` no longer imports `logWarning` -- it
    // cannot, because a single static import there drags the whole backend graph into
    // evaluation ahead of `installElectronHook` and kills the sidecar on boot. The
    // logger is late-bound, and `bootstrap.init()` binds it right after `initLogger()`.
    // This helper reproduces exactly that binding, which is why every assertion in
    // Group 2 below still reads `logWarningMock` unchanged: the observable contract
    // ("a rejection reaches logWarning with LogPrefix.Backend") did not move, only the
    // mechanism that delivers it. The UNBOUND path is covered separately by the
    // early-boot stderr test.
    setUnhandledRejectionLogSink((message: string) => {
      loggerModule.logWarning(message, loggerModule.LogPrefix.Backend)
    })
    harness = {
      installUnhandledRejectionGuard,
      logWarningMock: logWarningSpy
    }
  })
  return harness
}

/**
 * IN-06 (Phase 34.2 gap cycle 2): this suite emitted
 * `MaxListenersExceededWarning: ... 11 exit listeners added to [process]`.
 *
 * THE REVIEW'S DIAGNOSIS IS WRONG, and both of its proposed fixes follow from it.
 * It says "each `init()` attaches process-level listeners that are never removed"
 * and offers a module-scope idempotency flag in `bootstrap.init()` as the
 * principled option. `bootstrap.ts` registers NO process listeners at all
 * (`grep "process.on(" src/backend/sidecar/bootstrap.ts` is empty), so that fix
 * is not merely wrong, it is impossible.
 *
 * Traced with `--trace-warnings`, the real source is third-party and module-scope:
 * `node_modules/tmp/lib/tmp.js:732` runs `process.addListener(EXIT,
 * _garbageCollector)` unconditionally at load, and `backend/constants/paths.ts:11`
 * imports `tmp`. This file calls `jest.isolateModules()` nine times; every fresh
 * registry re-executes `paths.ts`, re-loads `tmp`, and adds one more listener to
 * the one real `process` object. Nine plus the ambient loads is the eleven.
 *
 * An idempotency flag could not fix it even in our own code: such a flag would
 * live in the module registry `isolateModules` has just replaced.
 *
 * So the count is a bounded, understood artifact of module isolation, not a leak.
 * The review's other option, `process.setMaxListeners(0)`, disables leak detection
 * outright and forever. A specific ceiling keeps the detector armed for a genuine
 * runaway while accommodating the known bound -- and the test at the end of this
 * file asserts the bound actually holds, so this is a measured limit rather than
 * a silenced alarm.
 */
const EXIT_LISTENER_CEILING = 20
process.setMaxListeners(EXIT_LISTENER_CEILING)

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

    // T-34.2-42 / CR-03 / WR-01 containment tripwire: prove `appFolder`, `userDataPath`,
    // `fixesPath` (via the `pathShim` mock) AND `getLogFilePath({})` (via the
    // `backend/logger/paths` mock) all resolve inside `os.tmpdir()`, using the SAME
    // `resolve`+`relative` idiom `fileStore.ts`'s own containment check uses
    // (`relative(resolve(base), target)` then `startsWith('..') || isAbsolute(...)`) --
    // never `path.join`, which is not a containment check. Throws loudly ("REFUSING TO RUN")
    // rather than relying on an `afterAll` restore as a safety net -- this repo's own
    // `tests-clobbering-real-steam-store` incident (commit 92c29a5e) recorded that an
    // `afterAll` restore is not a safety net under jest worker force-exit.
    const { appFolder, userDataPath, fixesPath } = loadConstantsPaths()
    const tmpRoot = resolve(tmpdir())
    const candidates = [appFolder, userDataPath, fixesPath, getLogFilePath({})]
    for (const candidate of candidates) {
      const rel = relative(tmpRoot, resolve(candidate))
      if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new Error(
          `[sidecarRejectionGuard.test.ts] REFUSING TO RUN: "${candidate}" resolves ` +
            `outside os.tmpdir() (${tmpRoot}) -- a containment mock is not in effect, ` +
            'and this suite would write into a real user log/config directory.'
        )
      }
    }
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

  // IN-03 (Phase 34.2 gap cycle 2): `setupIsolatedBootstrapHarness()` and
  // `loadFreshProcessGuards()` each create a `jest.spyOn(loggerModule, 'logWarning')`
  // and neither restored it. Plan 34.2-18 had already narrowed
  // `loadConstantsPaths()` specifically to avoid "leaving an unrestored
  // `jest.spyOn`", so the stated rationale was only half-applied.
  //
  // The restore CANNOT go inside those helpers: both return the spy as
  // `logWarningMock` and their callers assert on it, so restoring before the test
  // body runs would break every caller. It belongs here, after assertions.
  //
  // `resetMocks: true` in `src/backend/jest.config.js` does not cover this -- it
  // clears a spy's calls and implementation but leaves it INSTALLED.
  afterEach(() => {
    jest.restoreAllMocks()
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

  describe('Group 1b: WR-04 late-bound sink -- bootstrap.init() is what connects the guard to the logger', () => {
    // The zero-imports gate in Group 3 proves `processGuards.ts` CANNOT reach the
    // logger by import. That makes `bootstrap.init()`'s
    // `setUnhandledRejectionLogSink(...)` call the only thing that ever connects the
    // two, so it is load-bearing in a way a source gate cannot express: delete that
    // one statement and every sidecar rejection silently degrades to a bare stderr
    // line for the life of the process, with all of Group 2 still green (its helper
    // binds the sink itself). This test drives the REAL `init()` and observes the
    // transition.
    it('WR-04: a rejection routes to stderr before init() and to logWarning after it', () => {
      let installGuard!: (target?: NodeJS.EventEmitter) => void
      let init!: (input: PassThrough, output: PassThrough) => void
      let logWarningSpy!: jest.SpyInstance

      jest.isolateModules(() => {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const { GlobalConfig } = require('backend/config')
        ;(GlobalConfig.get as jest.Mock).mockReturnValue({
          getSettings: () => ({ language: 'en' }),
          setSetting: jest.fn(),
          set: jest.fn(),
          flush: jest.fn()
        })
        // Same registry for both, or the module-scope `logSink` singleton `init()`
        // writes would not be the one the guard reads.
        installGuard =
          require('../processGuards').installUnhandledRejectionGuard
        init = require('../bootstrap').init
        logWarningSpy = jest.spyOn(require('backend/logger'), 'logWarning')
        /* eslint-enable @typescript-eslint/no-require-imports */
      })

      const stderrWriteSpy = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true)

      try {
        const target = new EventEmitter()
        installGuard(target)

        // BEFORE init(): no sink bound.
        target.emit('unhandledRejection', new Error('before init'))
        expect(stderrWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('before init')
        )
        expect(logWarningSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('before init'),
          expect.anything()
        )

        init(new PassThrough(), new PassThrough())

        // AFTER init(): the sink is bound, so the same emit reaches the logger.
        target.emit('unhandledRejection', new Error('after init'))
        expect(logWarningSpy).toHaveBeenCalledWith(
          expect.stringContaining('after init'),
          expect.anything()
        )
      } finally {
        stderrWriteSpy.mockRestore()
      }
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

    it('WR-04 (gap cycle 1): with NO sink bound -- the real early-boot state before bootstrap.init() -- the message goes to stderr and never to stdout', () => {
      // The window this guard exists to cover is the one BEFORE `bootstrap.init()`
      // runs `initLogger()` and binds the sink. `loadFreshProcessGuards()` binds it
      // (so Group 2's other tests can assert on logWarning), so this test loads the
      // module raw and leaves the sink at its module-scope default of null.
      let installGuard!: (target?: NodeJS.EventEmitter) => void
      jest.isolateModules(() => {
        /* A BLOCK disable, not disable-next-line: prettier reflowed this
         * assignment across two lines, which moved the `require` off the line
         * the old `disable-next-line` covered and silently un-suppressed it.
         * A line-scoped suppression is only as stable as the formatter's line
         * breaks; the block form survives reflow. */
        /* eslint-disable @typescript-eslint/no-require-imports */
        installGuard =
          require('../processGuards').installUnhandledRejectionGuard
        /* eslint-enable @typescript-eslint/no-require-imports */
      })

      const stderrWriteSpy = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true)
      const stdoutWriteSpy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true)

      try {
        const target = new EventEmitter()
        installGuard(target)

        expect(() =>
          target.emit('unhandledRejection', new Error('early boot'))
        ).not.toThrow()
        expect(stderrWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[sidecar] unhandled promise rejection:')
        )
        // stdout carries the newline-delimited JSON RPC frame stream. A diagnostic
        // byte written there corrupts the transport, which is a worse failure than
        // the crash this guard prevents.
        expect(stdoutWriteSpy).not.toHaveBeenCalled()
      } finally {
        stdoutWriteSpy.mockRestore()
        stderrWriteSpy.mockRestore()
      }
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
    // WR-04 (gap cycle 1, closed 2026-08-23). This group used to compare
    // `indexOf('installUnhandledRejectionGuard(')` against `indexOf('init()')` in
    // `src/sidecar/index.ts` and call that proof the guard was live before
    // `bootstrap.ts`'s module scope. It was not: ES modules evaluate every static
    // import before any statement in the importing body, so the CALL order those two
    // indices measured had nothing to do with the EVALUATION order the docstring
    // claimed -- the gate would have passed unchanged even if the guard could not
    // possibly cover module scope. The property is now IMPORT order, and the two
    // gates below measure it directly.
    //
    // Reading `src/sidecar/index.ts` as text rather than importing it is unchanged
    // and still load-bearing: importing it would execute the real `init()` at module
    // scope against the jest worker's own stdio.
    function importLines(source: string): string[] {
      return stripComments(source)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('import '))
    }

    it('WR-04: the guard install is the FIRST import of src/sidecar/index.ts, so it evaluates before bootstrap.ts', () => {
      const source = readFileSync(
        join(__dirname, '../../../sidecar/index.ts'),
        'utf-8'
      )
      const imports = importLines(source)

      expect(imports.length).toBeGreaterThan(1)
      expect(imports[0]).toBe("import './installRejectionGuard'")
      // The property is ordering, not mere presence: bootstrap must come after.
      const bootstrapIndex = imports.findIndex((line) =>
        line.includes('backend/sidecar/bootstrap')
      )
      expect(bootstrapIndex).toBeGreaterThan(0)
    })

    it('WR-04: installRejectionGuard.ts installs the guard at module scope', () => {
      const source = readFileSync(
        join(__dirname, '../../../sidecar/installRejectionGuard.ts'),
        'utf-8'
      )
      const stripped = stripComments(source)

      // A module-scope call -- column 0, not nested inside a function body. If this
      // ever became a function that something has to remember to call, the import
      // ordering above would stop meaning anything.
      expect(stripped).toMatch(/^installUnhandledRejectionGuard\(\)$/m)
    })

    it('WR-04: processGuards.ts has ZERO static imports -- the invariant that makes the first-import position safe', () => {
      // This is the gate that stands between the current, working arrangement and
      // the two boot failures recorded in `src/sidecar/index.ts`. A single
      // `import ... from 'backend/logger'` here drags the entire backend module graph
      // into evaluation ahead of `installElectronHook`, so `app.getPath()` returns
      // undefined and the sidecar dies before writing READY. Jest cannot observe that
      // (all 176 backend suites stayed green through it) -- this source gate and
      // `pnpm smoke:sidecar` are the two checks that can.
      const source = readFileSync(
        join(__dirname, '../processGuards.ts'),
        'utf-8'
      )
      const stripped = stripComments(source)

      expect(stripped).not.toMatch(/^\s*import\s/m)
      expect(stripped).not.toMatch(/\brequire\s*\(/)
      // Positive control: the file really was read and really does contain the guard,
      // so the two negatives above cannot pass against an empty or missing read.
      expect(stripped).toContain('installUnhandledRejectionGuard')
    })

    it('WR-04: installRejectionGuard.ts imports nothing but processGuards, so its own graph stays empty too', () => {
      const source = readFileSync(
        join(__dirname, '../../../sidecar/installRejectionGuard.ts'),
        'utf-8'
      )
      const imports = importLines(source)

      expect(imports).toEqual([
        "import { installUnhandledRejectionGuard } from 'backend/sidecar/processGuards'"
      ])
    })
  })

  describe('Group 4: gap-cycle-2 hygiene guards (IN-03, IN-06)', () => {
    // Declared LAST on purpose. The IN-03 proof spans two tests: the first
    // installs a spy and stashes the module object it was installed on, the
    // second asserts the `afterEach` above restored it. A single-test assertion
    // could not observe a hook that runs between tests.
    let stashedLoggerModule: { logWarning: unknown } | null = null

    it('IN-03 (setup) a helper-created logWarning spy is installed during its own test', () => {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const loggerModule = require('backend/logger')
        jest.spyOn(loggerModule, 'logWarning')
        stashedLoggerModule = loggerModule
      })

      // Non-vacuity: if this ever fails, the assertion below proves nothing,
      // because it would be asserting "not a mock" about something that was
      // never mocked.
      expect(stashedLoggerModule).not.toBeNull()
      expect(jest.isMockFunction(stashedLoggerModule!.logWarning)).toBe(true)
    })

    it('IN-03 the spy is restored by the time the next test runs', () => {
      // The property the fix delivers. Goes RED if the describe-level
      // `afterEach(jest.restoreAllMocks)` is removed -- verified by removing it.
      //
      // Note this asserts against the module object captured INSIDE
      // `isolateModules`. Asserting on a top-level `require('backend/logger')`
      // instead would pass vacuously: that is a different module instance, in a
      // different registry, which was never spied on.
      expect(stashedLoggerModule).not.toBeNull()
      expect(jest.isMockFunction(stashedLoggerModule!.logWarning)).toBe(false)
    })

    it('WR-04 no module-scope floating promise exists in the sidecar graph (why the gap is not observable)', () => {
      // The reason WR-04 was never observable: nothing can REJECT in the
      // uncovered window, because nothing creates a promise at module scope.
      // That is an unenforced invariant holding the finding harmless, so it is
      // pinned here -- the day someone writes `void somethingAsync()` at module
      // scope, the window goes live silently and this goes red instead.
      const roots = [
        resolve(__dirname, '../..'),
        resolve(__dirname, '../../../sidecar')
      ]
      const offenders: string[] = []

      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name)
          if (entry.isDirectory()) {
            if (entry.name === '__tests__' || entry.name === 'node_modules')
              continue
            walk(full)
            continue
          }
          if (!entry.name.endsWith('.ts')) continue
          const stripped = stripComments(readFileSync(full, 'utf-8'))
          for (const line of stripped.split('\n')) {
            // Column 0 only: a top-level statement. An indented `void x()` is
            // inside a function and runs when called, not at import.
            if (
              /^(void |Promise\.(all|resolve|reject)\(|[\w$.]+\.then\()/.test(
                line
              )
            ) {
              offenders.push(`${full}: ${line.trim().slice(0, 80)}`)
            }
          }
        }
      }
      roots.forEach(walk)

      expect(offenders).toEqual([])
    })

    it('IN-06 the process exit-listener count stays inside the declared ceiling', () => {
      // Makes `setMaxListeners` a MEASURED bound rather than a silenced alarm:
      // if a future change starts adding exit listeners in earnest, this fails
      // instead of the warning simply being suppressed.
      //
      // Uses `<`, not `<=`: landing exactly on the ceiling means the next
      // isolateModules call breaches it, which is a warning worth getting early.
      // Measured 2026-08-23: 12 at the end of a full run of this file, against a
      // ceiling of 20 -- eight further `isolateModules` calls of headroom.
      //
      // KNOWN LIMITATION, found while RED-proving this test rather than assumed:
      // it is VACUOUS under `-t` filtering. The listeners are added by the nine
      // `jest.isolateModules()` calls in the other tests, so `jest <file> -t
      // "IN-06"` runs this assertion against a near-empty count and passes even
      // with the ceiling set to 3. It only measures anything on a full run of
      // this file, which is how CI runs it. Proven both ways: ceiling 3 with a
      // filter passes (vacuous), ceiling 3 on the full file fails with
      // "Expected: < 3, Received: 12".
      expect(process.listenerCount('exit')).toBeLessThan(EXIT_LISTENER_CEILING)
    })
  })
})
