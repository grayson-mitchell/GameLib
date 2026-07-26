/**
 * End-to-end transport-level proof for the sidecar's curated `logError`
 * channel (Phase 34.2 gap cycle 2, plan 34.2-16 — closes verification gap #1
 * / code-review CR-01 / REQ-34.2-12, -08, -09, -13, -14).
 *
 * Drives the REAL sidecar RPC server in-process (`gameDetailsFlows.test.ts`'s
 * own real-shim black-box pattern — the shim under test is the actual
 * `electronStub.ts`/`loggerFlowRegistration.ts`/`backend/logger` code,
 * unmocked) against injected `stream.PassThrough` pairs, and asserts a
 * POSITIVE SIDE EFFECT: a `send` frame for `logError` carrying a unique
 * marker string must actually appear inside the sidecar's real log file. "It
 * didn't throw" and "no `UNPORTED_CHANNEL_MARKER` appeared" are explicitly
 * NOT acceptable evidence for a `send` channel (REQ-34.2-08/09) — this is the
 * project's own `sidecar-send-channels-fail-silently` / G-30-01 failure
 * class, and gap cycle 1 recreated exactly that void for a real repair
 * failure before this plan closed it.
 *
 * This suite `init()`s the REAL sidecar bootstrap, which genuinely writes a
 * real log file — unlike some sibling suites, this file makes no claim that
 * it avoids touching disk. What this suite guarantees instead is
 * CONTAINMENT: every path `init()` can possibly touch is redirected, by
 * construction, under a disposable per-process tmp root
 * (`gamelib-loggerflows-test-home-${process.pid}`, under `os.tmpdir()`)
 * before the first destructive write can happen, enforced by the `beforeAll`
 * tripwire below.
 *
 * Containment kit (all four elements, per this suite's own acceptance
 * criteria — shipped from day one, not retrofitted in a later gap cycle):
 *
 *   1. `jest.mock('os', ...)` redirects `homedir()` to the tmp root.
 *   2. `jest.mock('../pathShim', ...)` — the REAL choke point:
 *      `constants/paths.ts`'s module-scope `app.getPath('appData'|'userData')`
 *      calls resolve through `electronStub.ts` -> `pathShim.getPath()`, whose
 *      real `resolveAppDataDir()` prefers `env.APPDATA` (win32) /
 *      `env.XDG_CONFIG_HOME` (default/Linux) over `homedir()` — bypassing
 *      element 1 above on those platforms. Copied verbatim from
 *      `gameDetailsFlows.test.ts:136-161` except for the tmp-root name, with
 *      no platform branch and no env-var reference.
 *   3. `jest.mock('backend/logger/paths', ...)` — `getLogFilePath`'s real
 *      `getBaseLogPath()` (`backend/logger/paths.ts`) computes the log
 *      directory independently of `pathShim`, straight from
 *      `process.env.LOCALAPPDATA`/`XDG_STATE_HOME` plus `homedir()` — so it
 *      bypasses BOTH elements 1 and 2 above. This factory reimplements
 *      `getLogFilePath`'s relative-path derivation (heroic log vs runner log
 *      vs game log) rooted at the SAME tmp root, so distinct arguments still
 *      yield distinct paths. It does NOT call `jest.requireActual('backend/
 *      logger')` — `backend/logger/index.ts` and `backend/logger/
 *      log_writer.ts` import each other circularly, and re-entering that
 *      cycle from inside a mock factory throws inside `LogWriter`'s
 *      constructor (see `sidecarRejectionGuard.test.ts`'s own note on this).
 *   4. A `beforeAll` containment tripwire (`resolve`+`relative`, never
 *      `join`, never a bare `startsWith` on the raw string — Phase 18's "join
 *      is not containment" lesson) asserting `appFolder`, `userDataPath`,
 *      `fixesPath`, AND `getLogFilePath({})` all resolve inside
 *      `os.tmpdir()`, throwing a loud "REFUSING TO RUN" error otherwise.
 *
 * Mocked only at the boundaries that would otherwise do real network I/O or
 * a real on-disk config write, mirroring `gameDetailsFlows.test.ts`'s own
 * boundary list: `axios`, `backend/online_monitor` (full surface),
 * `backend/config` (`GlobalConfig.get()`, so `init()`'s i18next-init read
 * doesn't need a real config.json), `backend/constants/environment`
 * (deterministic platform branch), and Jest's own module resolution for
 * `electron`/`electron-store` pointed at the real `electronStub.ts`/
 * `fileStore.ts` shims. `backend/logger` itself is NEVER mocked — only
 * `jest.spyOn`'d in place (see the note above the import) — so the REAL
 * `LogWriter`/`logError` code runs and genuinely writes the log line this
 * suite's positive test reads back.
 */

// ── i18next — defeat Jest's project-wide automatic manual mock (same
// load-bearing reasoning as gameDetailsFlows.test.ts's own header) so
// bootstrap.ts's real i18next.init() call runs as it does in production,
// rather than against src/backend/__mocks__/i18next.ts's stub (which has no
// `.use()`/`.init()` members and would otherwise throw inside bootstrap.ts's
// own try/catch, logging a spurious WARNING line into the very log file this
// suite's positive test greps). ─────────────────────────────────────────────
jest.unmock('i18next')

import { PassThrough } from 'node:stream'
import { existsSync, readFileSync } from 'fs'
import { relative, resolve, isAbsolute } from 'path'
import { tmpdir } from 'os'

const TMP_ROOT_NAME = `gamelib-loggerflows-test-home-${process.pid}`

// ── os — redirect homedir() to a disposable per-process tmp directory
// (GAP FIX precedent, gameDetailsFlows.test.ts) ─────────────────────────────
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () => path.join(actual.tmpdir(), TMP_ROOT_NAME)
  }
})

// ── pathShim — CR-03: the REAL choke point. Copied verbatim from
// gameDetailsFlows.test.ts:136-161 except for the tmp-root name — no
// platform branch, no environment variable participating. ──────────────────
jest.mock('../pathShim', () => {
  const actualOs = jest.requireActual('os')
  const actualPath = jest.requireActual('path')
  const tmpRoot = actualPath.join(
    actualOs.tmpdir(),
    `gamelib-loggerflows-test-home-${process.pid}`
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

// ── backend/logger/paths — the log path is computed INDEPENDENTLY of
// pathShim (getBaseLogPath() reads process.env.LOCALAPPDATA/XDG_STATE_HOME
// plus homedir() directly), so it bypasses both mocks above. Reimplements
// getLogFilePath's real relative-path derivation rooted at the SAME tmp
// root — never delegates to jest.requireActual('backend/logger'), which
// would re-enter the logger/log_writer circular require and throw inside
// LogWriter's constructor. ───────────────────────────────────────────────────
jest.mock('backend/logger/paths', () => {
  const actualPath = jest.requireActual('path')
  const actualOs = jest.requireActual('os')
  const tmpRoot = actualPath.join(
    actualOs.tmpdir(),
    `gamelib-loggerflows-test-home-${process.pid}`
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
        relativeFilePath = actualPath.join('games', `${appName}_${runner}`, type)
      }
      return actualPath.join(logBaseDir, relativeFilePath + '.log')
    }
  }
})

// ── electron / electron-store — route Jest's own module resolution at the
// REAL sidecar shims (mirrors gameDetailsFlows.test.ts) ─────────────────────
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── axios — init() wires the REAL initOnlineMonitor()/fetchLastestReleases()
// call paths, which reach axiosClient (backend/utils.ts). Mocked so this
// suite never makes a real network call. ────────────────────────────────────
jest.mock('axios', () => {
  const mockInstance = {
    get: jest.fn(() => Promise.resolve({ data: {} })),
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

// ── backend/constants/environment — deterministic branch regardless of host
// OS (mirrors gameDetailsFlows.test.ts) ──────────────────────────────────────
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true,
  isIntelMac: false,
  isSteamDeckGameMode: false,
  isFlatpak: false
}))

// ── backend/config — avoid a real on-disk config.json write while still
// exercising bootstrap.ts's real i18next init (settings.language) ───────────
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: jest.fn()
  }
}))

// ── backend/online_monitor mock (full surface, per bootstrap.test.ts's own
// reasoning) — deterministic isOnline()=true, no real electron `net` surface
// touched by bootstrap.ts's initOnlineMonitor() call ────────────────────────
jest.mock('../../online_monitor', () => ({
  initOnlineMonitor: jest.fn(),
  isOnline: jest.fn(() => true),
  runOnceWhenOnline: jest.fn((callback: () => unknown) => callback()),
  onConnectivityChange: jest.fn()
}))

// Deliberately NOT `jest.mock('backend/logger', ...)`: `backend/logger/
// index.ts` and `log_writer.ts` import each other circularly. A `jest.mock`
// factory that calls `jest.requireActual('backend/logger')` re-enters that
// same cycle and throws inside `LogWriter`'s constructor (empirically
// confirmed by `sidecarRejectionGuard.test.ts`'s own note). `jest.spyOn`
// below wraps the REAL, already-fully-loaded module object in place instead,
// so the circular require path is never disturbed. ──────────────────────────

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { init } from '../bootstrap'
import { GlobalConfig } from 'backend/config'
import { handlerRegistry, listenerRegistry } from '../electronStub'
import { UNPORTED_CHANNEL_MARKER } from 'common/types/sidecarTransport'
import { fixesPath, appFolder, userDataPath } from '../../constants/paths'
import { getLogFilePath } from 'backend/logger/paths'
import * as logger from '../../logger'
import { LogPrefix } from '../../logger/constants'

// ── Containment guard — MUST run before anything in this suite can write.
// Uses resolve+relative, never startsWith/join (Phase 18: "join is not
// containment"). Throws loudly rather than relying on an afterAll as a
// safety net (tests-clobbering-real-steam-store, commit 92c29a5e: an
// afterAll restore is not a safety net under jest worker force-exit).
// Includes getLogFilePath({}) — the choke point element 3 above exists to
// contain — alongside appFolder/userDataPath/fixesPath. ─────────────────────
beforeAll(() => {
  const tmpRoot = resolve(tmpdir())
  const candidates = [appFolder, userDataPath, fixesPath, getLogFilePath({})]
  for (const candidate of candidates) {
    const rel = relative(tmpRoot, resolve(candidate))
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(
        `[loggerFlows.test.ts] REFUSING TO RUN: "${candidate}" resolves ` +
          `outside os.tmpdir() (${tmpRoot}) — a containment mock is not in ` +
          'effect, and this suite would write into a real user log/config ' +
          'directory.'
      )
    }
  }
})

const mockedGlobalConfigGet = GlobalConfig.get as jest.Mock

/** Points the mocked GlobalConfig.get() at a fresh settings object. */
function mockAppSettings(partial: Record<string, unknown>) {
  mockedGlobalConfigGet.mockReturnValue({
    getSettings: () => partial,
    setSetting: jest.fn(),
    set: jest.fn(),
    flush: jest.fn()
  })
}

type Frame = Record<string, unknown>

/** Buffers newline-delimited output from a PassThrough into parsed frames. */
function collectFrames(stream: PassThrough): Frame[] {
  const frames: Frame[] = []
  let buffer = ''
  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString()
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      if (line.trim().length > 0) {
        try {
          frames.push(JSON.parse(line))
        } catch {
          // Non-JSON diagnostic line (e.g. READY_SENTINEL) — ignore.
        }
      }
      newlineIndex = buffer.indexOf('\n')
    }
  })
  return frames
}

/** Waits a couple of microtask/macrotask turns for async invoke handlers to resolve. */
async function flush(): Promise<void> {
  await new Promise((r) => setImmediate(r))
  await new Promise((r) => setImmediate(r))
  await new Promise((r) => setImmediate(r))
}

/** Starts a fresh sidecar RPC loop bound to its own stream pair. */
function startSidecar(): { input: PassThrough; frames: Frame[] } {
  const input = new PassThrough()
  const output = new PassThrough()
  const frames = collectFrames(output)
  init(input, output)
  return { input, frames }
}

/** Writes a well-formed `send` (fire-and-forget) request frame to the sidecar's stdin. */
function writeSend(
  input: PassThrough,
  id: string,
  channel: string,
  args: unknown[]
): void {
  input.write(`${JSON.stringify({ id, kind: 'send', channel, args })}\n`)
}

function findResponse(
  frames: Frame[],
  id: string
): { ok: boolean; result?: unknown; error?: string } | undefined {
  return frames.find((f) => f.id === id) as
    | { ok: boolean; result?: unknown; error?: string }
    | undefined
}

/**
 * Polls the real log file (bounded, up to `maxIterations`, alternating a
 * `setImmediate` tick and a short timer) until it exists and contains
 * `marker`. Returns the file content if found, `undefined` if the poll runs
 * out — a timeout/absence, never a thrown exception, is the RED signature
 * this suite's own RED-PROOF spot-check below relies on.
 */
async function pollForMarker(
  logPath: string,
  marker: string,
  maxIterations = 50
): Promise<string | undefined> {
  for (let i = 0; i < maxIterations; i++) {
    if (i % 2 === 0) {
      await new Promise((r) => setImmediate(r))
    } else {
      await new Promise((r) => setTimeout(r, 10))
    }
    if (existsSync(logPath)) {
      const content = readFileSync(logPath, 'utf-8')
      if (content.includes(marker)) {
        return content
      }
    }
  }
  return undefined
}

describe('sidecar logger flow: logError (Phase 34.2 gap cycle 2, plan 34.2-16)', () => {
  beforeEach(() => {
    mockAppSettings({ language: 'en' })
  })

  it('REQ-34.2-13 registers logError exactly once as a listener, never as a handler', async () => {
    startSidecar()
    await flush()

    expect(listenerRegistry.get('logError')?.length).toBe(1)
    expect(handlerRegistry.get('logError')).toBeUndefined()
  })

  // ── The load-bearing test: a real send frame must produce a real log line ──

  it('REQ-34.2-08/09/12 a logError send frame over the real transport lands in the sidecar log file', async () => {
    const marker = `logError-marker-${process.pid}-${Math.random()
      .toString(36)
      .slice(2)}`
    const message = `[loggerFlows.test.ts] ${marker}`

    const { input } = startSidecar()
    writeSend(input, 'le-1', 'logError', [message])
    await flush()

    const logPath = getLogFilePath({})
    const content = await pollForMarker(logPath, marker)

    // Not "nothing threw" — the actual file content is read back and must
    // contain the marker (REQ-34.2-08/09's own evidence standard for a
    // `send` channel).
    expect(content).toBeDefined()
    expect(content).toContain(marker)
  })

  it('REQ-34.2-12 the real backend/logger logError export is called with the frame message and LogPrefix.Frontend', async () => {
    const spy = jest.spyOn(logger, 'logError')
    const message = `[loggerFlows.test.ts] spy-check-${process.pid}`

    const { input } = startSidecar()
    writeSend(input, 'le-2', 'logError', [message])
    await flush()

    expect(spy).toHaveBeenCalledWith(message, LogPrefix.Frontend)
    spy.mockRestore()
  })

  it('REQ-34.2-14 no response frame is produced for the send frame id, and no UNPORTED_CHANNEL_MARKER appears', async () => {
    const { input, frames } = startSidecar()
    writeSend(input, 'le-3', 'logError', ['no-response-expected'])
    await flush()

    expect(findResponse(frames, 'le-3')).toBeUndefined()
    for (const frame of frames) {
      expect(String(frame.error ?? '')).not.toContain(UNPORTED_CHANNEL_MARKER)
    }
  })

  it('REQ-34.2-13 idempotency: two startSidecar() calls do not double-register logError', async () => {
    startSidecar()
    await flush()
    startSidecar()
    await flush()

    expect(listenerRegistry.get('logError')?.length).toBe(1)
  })
})

/**
 * RED-PROOF (recorded verbatim in 34.2-16-SUMMARY.md): the single line that
 * makes the positive side-effect test above fail if reverted is the
 * `registerLoggerFlows()` call in `src/backend/sidecar/handlers.ts` (Task
 * 1). Reverting it (commenting out the import + call) and re-running this
 * suite makes the positive test fail by TIMEOUT — `pollForMarker` exhausts
 * its 50 iterations and returns `undefined`, so `expect(content).toBeDefined()`
 * fails on a plain assertion, never an exception — reproducing this
 * project's own `sidecar-send-channels-fail-silently` failure mode
 * first-hand, exactly as REQ-34.2-08/09 predicts for an unregistered `send`
 * channel. Restoring the call and re-running turns the suite green again,
 * confirmed via `git diff` showing zero difference against the Task 1 commit.
 */

/**
 * WR-02 call-site guarantee (Phase 34.2 gap cycle 3, plan 34.2-20 — closes
 * REQ-34.2-12/-14). Drives a REJECTING `backend/logger` `logError` export
 * through the registered `logError` listener and proves the rejection is
 * settled by `loggerFlowRegistration.ts`'s own `.catch` handler — never by
 * `processGuards.ts`'s generic, defence-in-depth `unhandledRejection`
 * absorption.
 *
 * `jest.spyOn(logger, 'logError')` is used, never `jest.mock('backend/
 * logger', ...)` — this suite's own header (and `sidecarRejectionGuard.
 * test.ts`'s note) already documents the `logger`/`log_writer.ts`
 * circular-require hazard a mock factory calling `jest.requireActual`
 * would re-enter. `jest.restoreAllMocks()` in `afterEach` undoes every spy
 * from this block so the earlier positive side-effect test (which relies on
 * the REAL `logger.logError`) is unaffected by test ordering.
 */
describe('sidecar logger flow: logError call-site guard (WR-02, Phase 34.2 gap cycle 3, plan 34.2-20)', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('WR-02 Test A: a rejecting logError write is caught at the call site, not by processGuards.ts, and produces no unhandledRejection', async () => {
    const rejectionMessage = `wr-02-marker-${process.pid}-${Math.random()
      .toString(36)
      .slice(2)}`
    jest
      .spyOn(logger, 'logError')
      .mockImplementation(() => Promise.reject(new Error(rejectionMessage)))

    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    const unhandledRejectionListener = jest.fn()
    process.on('unhandledRejection', unhandledRejectionListener)

    try {
      const { input } = startSidecar()
      writeSend(input, 'le-wr02-a', 'logError', ['trigger'])
      await flush()

      const stderrLines = stderrSpy.mock.calls.map((call) => String(call[0]))

      // Load-bearing NEGATIVE assertion: a test that only checked "some
      // diagnostic appeared on stderr" would pass identically against
      // pre-fix code, because processGuards.ts's own unhandledRejection
      // guard ALREADY writes a stderr-reachable diagnostic (its
      // logWarning-throws fallback path) — that absorption is exactly what
      // made WR-02 invisible before this plan. Asserting the call-site
      // prefix is present AND that processGuards.ts's generic text is
      // ABSENT is what proves this specific call site caught the
      // rejection, not the process-level guard.
      const callSiteDiagnostic = stderrLines.find((line) =>
        line.includes('[loggerFlowRegistration]')
      )
      expect(callSiteDiagnostic).toBeDefined()
      expect(callSiteDiagnostic).toContain(rejectionMessage)
      for (const line of stderrLines) {
        expect(line).not.toContain('unhandled promise rejection')
      }

      // The rejection was settled by loggerFlowRegistration.ts's own
      // .catch, so no unhandledRejection event should ever have reached
      // the real process listener list.
      expect(unhandledRejectionListener).not.toHaveBeenCalled()

      // stdout carries the RPC frame protocol — the diagnostic must never
      // land there.
      expect(stdoutSpy).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandledRejectionListener)
    }
  })

  it('WR-02 Test B: a logError rejection with a null-prototype reason still writes a fallback diagnostic and never throws', async () => {
    jest
      .spyOn(logger, 'logError')
      .mockImplementation(() => Promise.reject(Object.create(null) as Error))

    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    const unhandledRejectionListener = jest.fn()
    process.on('unhandledRejection', unhandledRejectionListener)

    try {
      const { input } = startSidecar()
      // Must not throw synchronously while writing the frame, and must not
      // reject the surrounding test.
      expect(() =>
        writeSend(input, 'le-wr02-b', 'logError', ['trigger'])
      ).not.toThrow()
      await flush()

      const stderrLines = stderrSpy.mock.calls.map((call) => String(call[0]))
      const callSiteDiagnostic = stderrLines.find((line) =>
        line.includes('[loggerFlowRegistration]')
      )
      // Object.create(null) cannot be stringified (no toString/valueOf),
      // so the hardcoded fallback literal is the expected, acceptable
      // content -- the load-bearing point is that a diagnostic is still
      // written and the process never crashes.
      expect(callSiteDiagnostic).toBeDefined()
      expect(unhandledRejectionListener).not.toHaveBeenCalled()
      expect(stdoutSpy).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandledRejectionListener)
    }
  })

  it('WR-02 Test C: a logError rejection whose reason has a throwing toString still writes a fallback diagnostic and never throws', async () => {
    const hostileReason = {
      toString() {
        throw new Error('hostile toString')
      }
    }
    jest
      .spyOn(logger, 'logError')
      .mockImplementation(() => Promise.reject(hostileReason as unknown as Error))

    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    const unhandledRejectionListener = jest.fn()
    process.on('unhandledRejection', unhandledRejectionListener)

    try {
      const { input } = startSidecar()
      expect(() =>
        writeSend(input, 'le-wr02-c', 'logError', ['trigger'])
      ).not.toThrow()
      await flush()

      const stderrLines = stderrSpy.mock.calls.map((call) => String(call[0]))
      const callSiteDiagnostic = stderrLines.find((line) =>
        line.includes('[loggerFlowRegistration]')
      )
      expect(callSiteDiagnostic).toBeDefined()
      expect(unhandledRejectionListener).not.toHaveBeenCalled()
      expect(stdoutSpy).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandledRejectionListener)
    }
  })

  it('WR-02 Test D: nothing is ever written to process.stdout across any rejection shape (Error, null-prototype, throwing toString)', async () => {
    const stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const rejectionReasons: unknown[] = [
      new Error(`wr-02-marker-d-${process.pid}`),
      Object.create(null),
      {
        toString() {
          throw new Error('hostile toString')
        }
      }
    ]

    for (const [index, reason] of rejectionReasons.entries()) {
      jest
        .spyOn(logger, 'logError')
        .mockImplementation(() => Promise.reject(reason as Error))
      const { input } = startSidecar()
      writeSend(input, `le-wr02-d-${index}`, 'logError', ['trigger'])
      await flush()
    }

    expect(stdoutSpy).not.toHaveBeenCalled()
  })
})
