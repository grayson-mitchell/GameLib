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

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs'
import { relative, resolve, isAbsolute, dirname } from 'path'
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

// ── sidecarRpc — Phase 34.3 plan 04: PARTIAL mock (mirrors
// shellFilesFlows.test.ts), real startRpcServer/pushFrontendMessage,
// scriptable requestRustInvoke only. Needed for showLogFileInFolder's
// showItemInFolder -> electronStub.shell.showItemInFolder ->
// requestRustInvoke(RUST_SHELL_SHOW_ITEM_IN_FOLDER, ...) round-trip. ───────
jest.mock('../sidecarRpc', () => ({
  ...jest.requireActual('../sidecarRpc'),
  requestRustInvoke: jest.fn()
}))

// Deliberately NOT `jest.mock('backend/logger', ...)`: `backend/logger/
// index.ts` and `log_writer.ts` import each other circularly. A `jest.mock`
// factory that calls `jest.requireActual('backend/logger')` re-enters that
// same cycle and throws inside `LogWriter`'s constructor (empirically
// confirmed by `sidecarRejectionGuard.test.ts`'s own note). `jest.spyOn`
// below wraps the REAL, already-fully-loaded module object in place instead,
// so the circular require path is never disturbed. ──────────────────────────

// ── Imports (after mocks) ────────────────────────────────────────────────────
import {
  Frame,
  startSidecar,
  writeInvoke,
  writeSend,
  findResponse
} from './helpers/sidecarHarness'
import { GlobalConfig } from 'backend/config'
import { handlerRegistry, listenerRegistry } from '../electronStub'
import {
  UNPORTED_CHANNEL_MARKER,
  RUST_SHELL_SHOW_ITEM_IN_FOLDER
} from 'common/types/sidecarTransport'
import { fixesPath, appFolder, userDataPath } from '../../constants/paths'
import { getLogFilePath } from 'backend/logger/paths'
import * as logger from '../../logger'
import { LogPrefix } from '../../logger/constants'
import { requestRustInvoke } from '../sidecarRpc'
import { uploadedLogFileStore } from '../../logger/electronStores'
import * as uploaderModule from '../../logger/uploader'

// ── Containment guard (WR-10 correction, Phase 34.2 gap cycle 4, plan
// 34.2-26). This `beforeAll` is a POST-HOC DETECTOR, not a preventer, and
// its own comment previously implied otherwise. This file imports `../
// bootstrap` and `../../constants/paths` at MODULE SCOPE (see the `Imports
// (after mocks)` section above) — `constants/paths.ts` performs real work at
// module scope — so under a broken containment mock those imports have
// ALREADY RUN, and any resulting write has already happened, before this
// `beforeAll` (or any other test-time hook in this file) ever gets a chance
// to run. The actual preventer is `src/backend/jest.setupContainment.ts`'s
// `setupFiles`-time precondition (added by plan 34.2-25): `setupFiles`
// entries run once per test file, strictly BEFORE that file's own imports,
// which is exactly what this `beforeAll` structurally cannot do. This block
// is retained, unweakened, as localised documentation at the site of the
// historical defect (`34.2-VERIFICATION.md`'s three live reproductions) and
// as defence-in-depth for THIS file's own four containment mocks
// specifically (`os`/`pathShim`/`backend/logger/paths` plus the
// `getLogFilePath({})` check below) — not as the project's primary
// containment mechanism, which now lives structurally in `setupFiles`.
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
const mockRequestRustInvoke = requestRustInvoke as jest.Mock

/** Points the mocked GlobalConfig.get() at a fresh settings object. */
function mockAppSettings(partial: Record<string, unknown>) {
  mockedGlobalConfigGet.mockReturnValue({
    getSettings: () => partial,
    setSetting: jest.fn(),
    set: jest.fn(),
    flush: jest.fn()
  })
}

/** Waits a couple of microtask/macrotask turns for async invoke handlers to resolve. */
async function flush(): Promise<void> {
  await new Promise((r) => setImmediate(r))
  await new Promise((r) => setImmediate(r))
  await new Promise((r) => setImmediate(r))
}

/**
 * Polls `frames` (bounded, real setTimeout-based) until a response frame for
 * `id` appears. Needed for the upload channels below, whose real work
 * (fs/promises file read, a mocked-but-still-microtask-chained fetch) can
 * outlast the fixed 3-tick `flush()` helper (34.3-01-SUMMARY.md's own
 * precedent for `checkDiskSpace`/`getShellPath`).
 */
async function waitForResponse(
  frames: Frame[],
  id: string,
  timeoutMs = 5000
): Promise<Frame | undefined> {
  const start = Date.now()
  for (;;) {
    const found = frames.find((f) => f.id === id)
    if (found || Date.now() - start >= timeoutMs) {
      return found
    }
    await new Promise((r) => setTimeout(r, 20))
  }
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

  it('REQ-34.2-12 the real backend/logger logErrorSettled export is called with the frame message and LogPrefix.Frontend', async () => {
    // Spies on logErrorSettled, not logError -- gap cycle 4 (plan 34.2-26,
    // CR-01) changed loggerFlowRegistration.ts's call site to import
    // logErrorSettled (the expression-body sibling that actually forwards
    // the writer's promise) instead of the block-body logError wrapper.
    const spy = jest.spyOn(logger, 'logErrorSettled')
    const message = `[loggerFlows.test.ts] spy-check-${process.pid}`

    // IN-06 (gap cycle 4): `mockRestore()` used to sit AFTER the assertion it
    // guards, so a failing expectation leaked a live spy on the REAL
    // `backend/logger` module into every later test in this file. `finally`
    // restores on both paths.
    //
    // `resetMocks: true` in `src/backend/jest.config.js` does NOT cover this:
    // it clears a spy's calls and implementation but leaves it INSTALLED, so
    // the leaked `logErrorSettled` would be a mock returning `undefined` for
    // the rest of the file rather than the real export. Measured in
    // `loggerCallSiteGuard.test.ts`, whose IN-06 guard test asserts exactly
    // that and goes red when its restore hook is removed.
    //
    // Stated plainly: a passing suite cannot falsify this change, because the
    // leak only occurs when an assertion fails. The `finally` is correct on
    // the mechanism, not on a green run.
    try {
      const { input } = startSidecar()
      writeSend(input, 'le-2', 'logError', [message])
      await flush()

      expect(spy).toHaveBeenCalledWith(message, LogPrefix.Frontend)
    } finally {
      spy.mockRestore()
    }
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

// The WR-02 "call-site guard" describe block that used to live here (Phase
// 34.2 gap cycle 3, plan 34.2-20 — four tests: A/B/C/D) was DELETED by gap
// cycle 4, plan 34.2-26 (CR-01). Each of those four tests did
// `jest.spyOn(logger, 'logError').mockImplementation(() => Promise.reject
// (...))`, fabricating a promise-returning shape `logError(...)` never
// actually produces at runtime (it is a block-body arrow with no `return` —
// see `backend/logger/index.ts`). All four would have passed identically
// with the production `.catch` deleted from `loggerFlowRegistration.ts`
// (code review CR-01) — a test that must stub the function under test to
// observe the behaviour under test is not evidence. The stub-free
// replacement, which drives the REAL `backend/logger`/`loggerFlowRegistration
// .ts` modules end to end (real ENOTDIR rejection, real synchronous throw,
// no spy or mock on the logger module anywhere), is
// `src/backend/sidecar/__tests__/loggerCallSiteGuard.test.ts`.

/**
 * REQ-34.3-09 / REQ-34.3-01 Phase 34.3 plan 04 — round-trip coverage for the
 * 5 logger channels this plan registers: `logInfo`, `showLogFileInFolder`,
 * `uploadLogFile`, `deleteUploadedLogFile`, `getUploadedLogFiles`.
 *
 * `logInfo` is observed via the SAME mechanism the existing `logError` spy
 * test above uses (`jest.spyOn` on the real `backend/logger` module,
 * asserting the call arguments) — no new observation point is invented.
 * `uploadLogFile`/`deleteUploadedLogFile`/`getUploadedLogFiles` mock only at
 * the HTTP boundary (`global.fetch`) or the store boundary
 * (`uploadedLogFileStore`), never by replacing the uploader functions
 * themselves with a jest double that skips their own logic.
 */
describe('REQ-34.3-09 / REQ-34.3-01 Phase 34.3 logger channels', () => {
  beforeEach(() => {
    mockAppSettings({ language: 'en' })
    mockRequestRustInvoke.mockReset()
  })

  it('REQ-34.3-09 logInfo (send) reaches the real logInfo path with LogPrefix.Frontend', async () => {
    const spy = jest.spyOn(logger, 'logInfoSettled')
    const message = `[loggerFlows.test.ts] logInfo-check-${process.pid}`

    // IN-06 (gap cycle 4): see the logError sibling above -- restore on both
    // paths, not only the passing one.
    try {
      const { input } = startSidecar()
      writeSend(input, 'li-1', 'logInfo', [message])
      await flush()

      expect(spy).toHaveBeenCalledWith(message, LogPrefix.Frontend)
    } finally {
      spy.mockRestore()
    }
  })

  it('REQ-34.3-01 showLogFileInFolder (send) reveals the real log file at the path getLogFilePath returns', async () => {
    const logPath = getLogFilePath({})
    mkdirSync(dirname(logPath), { recursive: true })
    writeFileSync(logPath, 'x')

    const { input } = startSidecar()
    writeSend(input, 'slf-1', 'showLogFileInFolder', [{}])
    await flush()

    expect(mockRequestRustInvoke).toHaveBeenCalledWith(
      RUST_SHELL_SHOW_ITEM_IN_FOLDER,
      [logPath]
    )
  })

  it('REQ-34.3-01 send-vs-handle contract: logInfo/showLogFileInFolder/logError are listeners; uploadLogFile/deleteUploadedLogFile/getUploadedLogFiles are handlers', async () => {
    startSidecar()
    await flush()

    for (const channel of ['logError', 'logInfo', 'showLogFileInFolder']) {
      expect(listenerRegistry.get(channel)?.length).toBeGreaterThanOrEqual(1)
      expect(handlerRegistry.get(channel)).toBeUndefined()
    }
    for (const channel of [
      'uploadLogFile',
      'deleteUploadedLogFile',
      'getUploadedLogFiles'
    ]) {
      expect(handlerRegistry.get(channel)).toBeDefined()
      expect(listenerRegistry.get(channel)).toBeUndefined()
    }

    // The double-registration guard (T-34.3-15): logError must still be
    // registered exactly once, even after this slice's 5 new registrations
    // landed in the same module.
    expect(listenerRegistry.get('logError')?.length).toBe(1)
  })

  describe('uploadLogFile / deleteUploadedLogFile / getUploadedLogFiles', () => {
    const logPath = getLogFilePath({})

    beforeEach(() => {
      mkdirSync(dirname(logPath), { recursive: true })
      writeFileSync(logPath, 'log content for the upload-channel tests')
      uploadedLogFileStore.clear()
    })

    afterEach(() => {
      uploadedLogFileStore.clear()
      jest.restoreAllMocks()
      delete (global as unknown as { fetch?: unknown }).fetch
    })

    it('REQ-34.3-01 uploadLogFile (invoke) resolves the paste URL and records it in uploadedLogFileStore', async () => {
      const pasteUrl = `https://dpaste.com/upload-${process.pid}-${Math.random()
        .toString(36)
        .slice(2)}.txt`
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: () => Promise.resolve(pasteUrl)
        })
      ) as unknown as typeof fetch

      const { input, frames } = startSidecar()
      writeInvoke(input, 'ul-1', 'uploadLogFile', ['test-upload', {}])
      const response = await waitForResponse(frames, 'ul-1')

      expect(response?.ok).toBe(true)
      expect(response?.result).toEqual([
        pasteUrl,
        expect.objectContaining({ name: 'test-upload' })
      ])
      expect(uploadedLogFileStore.get_nodefault(pasteUrl)).toEqual(
        expect.objectContaining({ name: 'test-upload' })
      )
    })

    it('REQ-34.3-01 uploadLogFile (invoke) rejects when the HTTP boundary fails, rather than resolving a falsely-successful value', async () => {
      // A normal HTTP-level failure (a rejected fetch promise, or an
      // ok:false response) is swallowed by logger/uploader.ts's own
      // sendRequestToApi().catch(...) and surfaces as a resolved `false` --
      // that is Electron parity, not a defect. To prove the invoke genuinely
      // REJECTS (never a falsely-successful resolution) when the boundary
      // itself is unusable, this mocks fetch to throw synchronously, which
      // sendRequestToApi's `.catch()` chain never gets a chance to attach
      // to -- the throw propagates through uploadLogFile's own await,
      // converting the ipcMain.handle('uploadLogFile', ...) promise into a
      // rejection, which dispatchInvoke turns into an { ok: false, error }
      // frame (the same contract checkDiskSpace's ASVS V5 test already pins).
      global.fetch = jest.fn(() => {
        throw new Error('uploadLogFile HTTP boundary failure')
      }) as unknown as typeof fetch

      const { input, frames } = startSidecar()
      writeInvoke(input, 'ul-2', 'uploadLogFile', ['test-upload-fail', {}])
      const response = await waitForResponse(frames, 'ul-2')

      expect(response?.ok).toBe(false)
      expect(response?.error).toBeDefined()
    })

    it("REQ-34.3-01/D-08 deleteUploadedLogFile (invoke) dispatches to logger/uploader.ts's deleteUploadedLogFile -- proves DISPATCH ONLY, not that deletion actually works (uploader.ts:74-77's hardcoded token makes real deletion impossible in either build)", async () => {
      const url = `https://dpaste.com/delete-${process.pid}.txt`
      uploadedLogFileStore.set(url, {
        name: 'seed',
        token: '1',
        uploadedAt: Date.now()
      })

      const spy = jest.spyOn(uploaderModule, 'deleteUploadedLogFile')

      // IN-06 (gap cycle 4): third of three `mockRestore()` calls that sat
      // after the assertion they guard. This one spies on the real
      // `logger/uploader` module, so a leak would silently neuter deletion for
      // every later test in this block.
      try {
        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            text: () => Promise.resolve('')
          })
        ) as unknown as typeof fetch

        const { input, frames } = startSidecar()
        writeInvoke(input, 'dul-1', 'deleteUploadedLogFile', [url])
        await waitForResponse(frames, 'dul-1')

        expect(spy).toHaveBeenCalledWith(url)
      } finally {
        spy.mockRestore()
      }
    })

    it('REQ-34.3-01 getUploadedLogFiles (invoke) returns only the still-valid entry and prunes the expired one from the store', async () => {
      const liveUrl = `https://dpaste.com/live-${process.pid}.txt`
      const expiredUrl = `https://dpaste.com/expired-${process.pid}.txt`
      uploadedLogFileStore.set(liveUrl, {
        name: 'live',
        token: '1',
        uploadedAt: Date.now()
      })
      uploadedLogFileStore.set(expiredUrl, {
        name: 'expired',
        token: '1',
        uploadedAt: Date.now() - 3 * 24 * 60 * 60 * 1000
      })

      const { input, frames } = startSidecar()
      writeInvoke(input, 'gul-1', 'getUploadedLogFiles', [])
      const response = await waitForResponse(frames, 'gul-1')

      expect(response?.ok).toBe(true)
      expect(response?.result).toEqual({
        [liveUrl]: expect.objectContaining({ name: 'live' })
      })
      expect(uploadedLogFileStore.get_nodefault(expiredUrl)).toBeUndefined()
      expect(uploadedLogFileStore.get_nodefault(liveUrl)).toBeDefined()
    })
  })
})
