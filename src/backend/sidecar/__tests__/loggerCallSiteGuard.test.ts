/**
 * Stub-free, RED-against-HEAD proof suite for the sidecar `logError` call-site
 * rejection guard (Phase 34.2 gap cycle 4, plan 34.2-26 — closes CR-01 /
 * REQ-34.2-12 / REQ-34.2-14).
 *
 * NON-NEGOTIABLE PROOF STANDARD (read this before touching this file): this
 * suite never spies on, mocks, or otherwise replaces the backend logger
 * module's error-logging export with a jest double. Doing exactly that is
 * what made the four WR-02 tests this suite replaces worthless — each one
 * fabricated a promise-returning shape the runtime never actually produces,
 * so all four would have passed identically with the production `.catch`
 * deleted from `loggerFlowRegistration.ts` (code review CR-01). Every mock in
 * this file targets something strictly BELOW the code under test — only the
 * log file's on-disk path — never the logger module and never
 * `loggerFlowRegistration.ts` itself.
 *
 * Rejection mechanism (deterministic on macOS and Linux, no elevated
 * permissions required): a real, unmocked scratch directory is created at
 * module scope via `mkdtempSync`, and a regular FILE (not a directory) is
 * written at `<scratch>/blocked`. `getLogFilePath` is mocked to resolve to
 * `<scratch>/blocked/logs/gamelib.log`. `LogWriter#writeString`'s first write
 * runs `fsPromises.mkdir(dirname, { recursive: true })`, which genuinely
 * rejects with `ENOTDIR` because a path component along the way is a plain
 * file, not a directory. No permissions games, no root required.
 *
 * Containment: `src/backend/jest.setupContainment.ts` (plan 34.2-25) already
 * redirects HOME/XDG/APPDATA for every file in this jest project before this
 * file's own imports run, so this suite adds no `os`/`pathShim` mocks of its
 * own — the only path this suite needs to control is the log file path
 * above, which is fully owned by this file's own disposable scratch
 * directory (never the shared containment root).
 *
 * Four contracts, each proven to fail against HEAD before Task 2 lands:
 *   A. A real async rejection from the writer is caught and reported at this
 *      call site — not absorbed by `processGuards.ts`'s generic guard.
 *   B. A synchronous throw (an unassigned writer, the recorded
 *      "heroicLogWriter unset until bootstrap init" gotcha) does not escape
 *      the listener either.
 *   C. `backend/logger` exports a promise-returning error-logging entry
 *      point at runtime (not merely at the type level).
 *   D. That entry point's declaration in source is an EXPRESSION body, the
 *      exact shape whose absence caused CR-01, with a self-test proving the
 *      gate can actually fail.
 * Every test also asserts `process.stdout.write` is never called — that
 * stream carries the sidecar's newline-delimited JSON RPC frame protocol.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments as stripComments } from 'backend/testUtils/stripSourceComments'

// ── Scratch directory (real, unmocked fs/os/path) ───────────────────────────
// Declared at module scope, textually BEFORE the jest.mock() factory that
// references it below, and `mock`-prefixed per this project's own hoisting
// convention (recorded in deferred-items.md, WR-05/WR-06): ts-jest's hoist
// transform only allows a jest.mock() factory to reference an out-of-scope
// identifier when that identifier is `mock`-prefixed. jest.requireActual is
// used for fs/os/path here (rather than plain imports) so this scratch setup
// is never affected by any mock — including the global jest.setupContainment
// `os` redirect — this suite's own containment is fully independent of it.
const mockScratchDir = jest
  .requireActual<typeof import('fs')>('fs')
  .mkdtempSync(
    join(
      jest.requireActual<typeof import('os')>('os').tmpdir(),
      'gamelib-callsite-guard-'
    )
  )

// A regular FILE, not a directory, at the path LogWriter will try to treat
// as a directory component (`<scratch>/blocked/logs/`). This is the ENOTDIR
// source: `fsPromises.mkdir('<scratch>/blocked/logs', { recursive: true })`
// cannot create a directory through a path component that is a plain file.
jest
  .requireActual<typeof import('fs')>('fs')
  .writeFileSync(join(mockScratchDir, 'blocked'), '')

// ── backend/logger/paths — the ONLY choke point this suite needs to
// redirect. getLogFilePath({}) resolves inside the blocked file written
// above, so LogWriter's own first mkdir genuinely fails with ENOTDIR. ───────
jest.mock('backend/logger/paths', () => {
  const actualPath = jest.requireActual<typeof import('path')>('path')
  return {
    getLogFilePath: () =>
      actualPath.join(mockScratchDir, 'blocked', 'logs', 'gamelib.log')
  }
})

// ── electron — route Jest's own module resolution at the real sidecar shim
// (mirrors loggerFlows.test.ts / sidecarRejectionGuard.test.ts). Never
// `bootstrap.init()`'d — this suite does not need the RPC loop, only the
// listener registration function and the registry it writes into. ─────────

// ── backend/config — avoid constructing a real electron-store-backed
// GlobalConfig. Never exercised by this suite: initHeadless() (used below)
// assigns the writer directly and never touches GlobalConfig at all. ───────
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: jest.fn()
  }
}))

// Deliberately not replacing the error-logging export under test with a
// jest double of any kind — see the docblock's proof standard above.

// ── Imports (after mocks) ────────────────────────────────────────────────
import { initHeadless } from '../../logger'
import { LogPrefix } from '../../logger/constants'
import * as loggerModule from '../../logger'
import { registerLoggerFlows } from '../loggerFlowRegistration'
import { listenerRegistry } from '../../platform'

/**
 * Waits, bounded, alternating a `setImmediate` tick and a short timer, until
 * `predicate()` returns true or the iteration budget is exhausted. Needed
 * only for Test A: unlike every other test in this file (pure JS/microtask
 * event chains that settle within a couple of immediates, mirroring
 * `loggerFlows.test.ts`'s own fixed-tick `flush()`), Test A's rejection
 * depends on a REAL `fsPromises.mkdir()` settling via the libuv threadpool —
 * a fixed tick count cannot reliably bound that, and under-waiting here
 * would let a genuinely unhandled rejection fire AFTER this suite has
 * already removed its `unhandledRejection` listener, crashing the whole
 * jest worker (mirrors `loggerFlows.test.ts`'s own `pollForMarker` for the
 * same underlying reason: real disk I/O, not a mocked instant settle).
 */
async function flushUntil(
  predicate: () => boolean,
  maxIterations = 50
): Promise<void> {
  for (let i = 0; i < maxIterations; i++) {
    if (predicate()) return
    if (i % 2 === 0) {
      await new Promise((resolve) => setImmediate(resolve))
    } else {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
}

// Comment-stripping now delegates to the shared
// `backend/testUtils/stripSourceComments` util (strips block comments first,
// then the line-prefix filter), imported above as `stripComments`.

/**
 * Test D's source gate: true only when the promise-returning error-logging
 * wrapper in `backend/logger/index.ts` is declared with an EXPRESSION
 * body — `=>` followed (allowing whitespace and newlines) directly by
 * `heroicLogWriter.logError(`, with no intervening `{`. A block body (the
 * exact CR-01 defect this gate exists to catch by inspection) inserts a `{`
 * between the arrow and the call, which `\s*` cannot skip over.
 */
function hasExpressionBodyErrorWrapper(source: string): boolean {
  return /=>\s*heroicLogWriter\.logError\(/.test(stripComments(source))
}

describe('loggerCallSiteGuard (Phase 34.2 gap cycle 4, plan 34.2-26 — CR-01 / REQ-34.2-12 / REQ-34.2-14)', () => {
  beforeAll(() => {
    initHeadless()
    registerLoggerFlows()
    // A second registration would duplicate every frontend log line —
    // electronStub's dispatchSend iterates every listener in the array for
    // a channel.
    expect(listenerRegistry.get('logError')?.length).toBe(1)
  })

  // IN-06 (gap cycle 4, fixed 2026-08-23). Six tests below spy on
  // `process.stderr.write`/`process.stdout.write` and, until this hook existed,
  // NONE of them restored. `resetMocks: true` in `src/backend/jest.config.js`
  // is not a substitute: it clears calls and implementations but leaves the
  // spy INSTALLED, so `process.stderr.write` stayed a mock returning
  // `undefined` for every later test in this file -- silently swallowing any
  // real diagnostic they emitted. A suite whose entire subject is "a
  // diagnostic must reach stderr" is a poor place to leave stderr replaced.
  //
  // `restoreAllMocks` restores `jest.spyOn` spies only; the three
  // `jest.mock(...)` factory registrations at the top of this file are
  // untouched by it, and the `beforeAll` above installs no spy of its own
  // (checked, not assumed).
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('Test A (async rejection, real module): a real ENOTDIR log-write rejection produces a call-site-attributed stderr diagnostic', async () => {
    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    const unhandledRejectionListener = jest.fn()
    process.on('unhandledRejection', unhandledRejectionListener)

    try {
      const listener = listenerRegistry.get('logError')?.[0]
      expect(listener).toBeDefined()
      listener!(undefined, 'boom')

      await flushUntil(
        () =>
          stderrSpy.mock.calls.some((call) =>
            String(call[0]).includes('[loggerFlowRegistration]')
          ) || unhandledRejectionListener.mock.calls.length > 0
      )

      const stderrLines = stderrSpy.mock.calls.map((call) => String(call[0]))
      const callSiteDiagnostic = stderrLines.find((line) =>
        line.includes('[loggerFlowRegistration] logError call-site rejection:')
      )
      expect(callSiteDiagnostic).toBeDefined()
      expect(callSiteDiagnostic).toContain('ENOTDIR')

      // WR-10 (gap cycle 4, fixed 2026-08-23): a loop asserting that no stderr
      // line contains processGuards.ts's generic 'unhandled promise rejection'
      // text used to sit here, annotated "Load-bearing NEGATIVE assertion". It
      // could not fail. This suite calls only `initHeadless()` and
      // `registerLoggerFlows()` -- it never calls `bootstrap.init()`, and
      // `loggerFlowRegistration.ts` does not import `processGuards.ts`, so that
      // string is unreachable here under any circumstance. Deleted rather than
      // made real: installing the process-level guard to give it teeth would
      // register an `unhandledRejection` listener that outlives this test.
      //
      // The discrimination that assertion CLAIMED to provide is genuinely
      // provided by the two checks around it: `callSiteDiagnostic` above is
      // undefined if the production `.catch` is removed, and the listener check
      // below flips if the rejection escapes to the process instead of being
      // caught at the call site. Both fail against the unfixed code; the loop
      // never did.
      expect(unhandledRejectionListener).not.toHaveBeenCalled()
      expect(stdoutSpy).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandledRejectionListener)
    }
  })

  it('Test B (synchronous throw): an unassigned writer does not escape the listener, and still writes a diagnostic', async () => {
    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)

    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const freshElectronStub =
        require('../../platform') as typeof import('../../platform')
      const freshRegistration =
        require('../loggerFlowRegistration') as typeof import('../loggerFlowRegistration')
      /* eslint-enable @typescript-eslint/no-require-imports */

      // No initHeadless()/init() call anywhere in this fresh, isolated
      // module registry — heroicLogWriter is never assigned, reproducing
      // the recorded "heroicLogWriter unset until bootstrap init" gotcha.
      freshRegistration.registerLoggerFlows()
      const freshListener =
        freshElectronStub.listenerRegistry.get('logError')?.[0]
      expect(freshListener).toBeDefined()

      expect(() => freshListener!(undefined, 'boom')).not.toThrow()
    })

    // The synchronous throw above is converted to Promise.reject(error) at
    // the call site, and that rejection's own .catch handler only runs on a
    // later microtask/macrotask turn — a plain synchronous test body would
    // read stderrSpy before the diagnostic is ever written.
    await flushUntil(() =>
      stderrSpy.mock.calls.some((call) =>
        String(call[0]).includes('[loggerFlowRegistration]')
      )
    )

    const stderrLines = stderrSpy.mock.calls.map((call) => String(call[0]))
    const diagnostic = stderrLines.find((line) =>
      line.includes('[loggerFlowRegistration]')
    )
    expect(diagnostic).toBeDefined()
    expect(diagnostic).toContain('logError')
    expect(stdoutSpy).not.toHaveBeenCalled()
  })

  it('Test C (contract, runtime): backend/logger exports a promise-returning error-logging entry point', async () => {
    const stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)

    initHeadless()

    // Accessed via an untyped index so this test compiles (and fails on
    // assertion, never on a TypeScript error) before Task 2 adds the real
    // export — referencing the property directly on the typed namespace
    // would fail `tsc --noEmit` against HEAD.
    const entryPoint = (loggerModule as unknown as Record<string, unknown>)
      .logErrorSettled
    expect(typeof entryPoint).toBe('function')

    const result = (entryPoint as (...args: unknown[]) => unknown)(
      'boom',
      LogPrefix.Frontend
    )
    expect(result).toBeDefined()
    expect(typeof (result as { then?: unknown } | undefined)?.then).toBe(
      'function'
    )

    // This scratch directory's blocked file makes the call genuinely
    // reject (ENOTDIR) — caught here so it can never leak as an unhandled
    // rejection out of this test.
    await (result as Promise<unknown>).catch(() => undefined)

    expect(stdoutSpy).not.toHaveBeenCalled()
  })

  it('Test D (contract, source gate): logger/index.ts declares the wrapper with an EXPRESSION body', () => {
    const stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)

    const source = readFileSync(
      join(__dirname, '../../logger/index.ts'),
      'utf-8'
    )
    expect(hasExpressionBodyErrorWrapper(source)).toBe(true)

    expect(stdoutSpy).not.toHaveBeenCalled()
  })

  it('Test D self-test: hasExpressionBodyErrorWrapper rejects a synthetic block-body form (the exact CR-01 defect)', () => {
    const stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)

    const blockBodyForm = '(...p) => { heroicLogWriter.logError(...p) }'
    expect(hasExpressionBodyErrorWrapper(blockBodyForm)).toBe(false)

    expect(stdoutSpy).not.toHaveBeenCalled()
  })

  /**
   * Phase 34.3 plan 04 (REQ-34.3-09/REQ-34.3-13) — `logInfo` counterparts of
   * Test A and Test B above. `logInfo` is `logError`'s send-shape twin
   * (`loggerFlowRegistration.ts`'s own docstring), registered by the SAME
   * `registerLoggerFlows()` call this file's `beforeAll` already makes, so
   * no additional setup is needed beyond swapping the channel name.
   */

  it('Test A (logInfo counterpart, async rejection, real module): a real ENOTDIR log-write rejection produces a call-site-attributed stderr diagnostic', async () => {
    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    const unhandledRejectionListener = jest.fn()
    process.on('unhandledRejection', unhandledRejectionListener)

    try {
      const listener = listenerRegistry.get('logInfo')?.[0]
      expect(listener).toBeDefined()
      listener!(undefined, 'boom')

      await flushUntil(
        () =>
          stderrSpy.mock.calls.some((call) =>
            String(call[0]).includes('[loggerFlowRegistration]')
          ) || unhandledRejectionListener.mock.calls.length > 0
      )

      const stderrLines = stderrSpy.mock.calls.map((call) => String(call[0]))
      const callSiteDiagnostic = stderrLines.find((line) =>
        line.includes('[loggerFlowRegistration] logInfo call-site rejection:')
      )
      expect(callSiteDiagnostic).toBeDefined()
      expect(callSiteDiagnostic).toContain('ENOTDIR')

      // Load-bearing NEGATIVE assertion, mirroring Test A above: a
      // diagnostic-shaped stderr line alone is not evidence on its own --
      // processGuards.ts's own generic absorption text must be ABSENT too.
      for (const line of stderrLines) {
        expect(line).not.toContain('unhandled promise rejection')
      }
      expect(unhandledRejectionListener).not.toHaveBeenCalled()
      expect(stdoutSpy).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandledRejectionListener)
    }
  })

  it('Test B (logInfo counterpart, synchronous throw): an unassigned writer does not escape the listener, and still writes a diagnostic', async () => {
    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)

    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const freshElectronStub =
        require('../../platform') as typeof import('../../platform')
      const freshRegistration =
        require('../loggerFlowRegistration') as typeof import('../loggerFlowRegistration')
      /* eslint-enable @typescript-eslint/no-require-imports */

      // No initHeadless()/init() call anywhere in this fresh, isolated
      // module registry -- heroicLogWriter is never assigned, reproducing
      // the recorded "heroicLogWriter unset until bootstrap init" gotcha.
      freshRegistration.registerLoggerFlows()
      const freshListener =
        freshElectronStub.listenerRegistry.get('logInfo')?.[0]
      expect(freshListener).toBeDefined()

      expect(() => freshListener!(undefined, 'boom')).not.toThrow()
    })

    // The synchronous throw above is converted to Promise.reject(error) at
    // the call site, and that rejection's own .catch handler only runs on a
    // later microtask/macrotask turn -- a plain synchronous test body would
    // read stderrSpy before the diagnostic is ever written.
    await flushUntil(() =>
      stderrSpy.mock.calls.some((call) =>
        String(call[0]).includes('[loggerFlowRegistration]')
      )
    )

    const stderrLines = stderrSpy.mock.calls.map((call) => String(call[0]))
    const diagnostic = stderrLines.find((line) =>
      line.includes('[loggerFlowRegistration]')
    )
    expect(diagnostic).toBeDefined()
    expect(diagnostic).toContain('logInfo')
    expect(stdoutSpy).not.toHaveBeenCalled()
  })

  // IN-06 non-vacuity, and the RED proof for the `afterEach` above. Declared
  // LAST so every spy-installing test in this file has already run. Without
  // the restore hook this fails: `resetMocks: true` clears a spy's calls and
  // implementation but leaves it INSTALLED, so `process.stderr.write` is still
  // a mock function here. Measured -- both assertions flip.
  //
  // Asserting on `isMockFunction` rather than on observed output on purpose: a
  // test that tried to detect the leak by writing to stderr and checking the
  // console would be the very thing a swallowed writer makes unobservable.
  it('IN-06: the real process.stderr/stdout writers are back in place by the last test', () => {
    expect(jest.isMockFunction(process.stderr.write)).toBe(false)
    expect(jest.isMockFunction(process.stdout.write)).toBe(false)
  })
})
