/**
 * Transport-shape + registration-kind proof for the sidecar's 6 curated browser-auth channels
 * and their `rustInvoke`-backed login-window seam (Phase 34.4.1 Plan 02 — Task 3, Wave 0 gap 2,
 * REQ-34.4.1-02/-03/-04/-05/-13).
 *
 * Four describe blocks:
 *   1. Registration kind — the file's reason to exist. A send-vs-handle mismatch fails 100%
 *      SILENTLY at runtime (no reject, no timeout, no console line --
 *      `sidecar-send-channels-fail-silently`), so both directions are asserted per channel.
 *   2. rustInvoke frame shape — drives each `LoginWindowSeam` method through the REAL
 *      `sidecarRpc` transport (`startRpcServer` + `requestRustInvoke`, never mocked) against a
 *      `PassThrough` pair, mirroring `rustInvokeChannel.test.ts`'s harness: no real Rust process
 *      exists in Jest, every "Rust response" here is a synthetic line written directly into the
 *      input stream.
 *   3. Curated-import guard — `humbleLoginFlowRegistration.ts` must never import
 *      `humble/ipc_handler` (that file registers these same 6 channels a SECOND time onto
 *      Electron's real `ipcMain`, and would drag `backend/ipc` into the sidecar's curated import
 *      graph). Comment-stripped via the shared `stripSourceComments` util (quick task
 *      260726-q8f) so a docblock merely NAMING `ipc_handler.ts` cannot trip the gate.
 *   4. `classifyCookieRead` truth table (REQ-34.4.1-13) — all four verdicts, plus a no-platform-
 *      branch structural proof.
 *
 * `../../humble/user` and `../../humble/library` are automocked (their own logic is covered by
 * `src/backend/humble/__tests__/`); this suite proves *registration and transport*, not Humble
 * logic. `../../humble/userAgent` is factory-mocked to a fixed, assertable value.
 */

// ── electron / electron-store — route Jest's own module resolution at the REAL sidecar shims
// (mirrors humbleFlows.test.ts / clipboardFlows.test.ts) ──────────────────────────────────────
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── axios — humble/library.ts's import chain reaches ./adapter, which touches axios at module
// scope elsewhere in the humble/ import graph (mirrors humbleFlows.test.ts) ────────────────────
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

// ── backend/utils — no real on-disk Steam install to scan in CI (mirrors humbleFlows.test.ts) ──
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn()
}))

// ── backend/constants/environment — deterministic branch regardless of host OS ─────────────────
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))

// ── HumbleUser / HumbleLibrary — automocked; the network/filesystem-touching surface this suite
// exists to WIRE, not re-test ───────────────────────────────────────────────────────────────────
jest.mock('../../humble/user')
jest.mock('../../humble/library')

// ── standardBrowserUserAgent — factory-mocked to a fixed, assertable string. The real
// implementation reads `app.userAgentFallback`, which electronStub does not populate. ──────────
const FAKE_USER_AGENT =
  'Mozilla/5.0 (Test) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/999.0.0.0 Safari/537.36'
jest.mock('../../humble/userAgent', () => ({
  standardBrowserUserAgent: jest.fn(() => FAKE_USER_AGENT)
}))

// ── Imports (after mocks) — sidecarRpc is DELIBERATELY NOT mocked: describe block 2 drives the
// REAL transport ────────────────────────────────────────────────────────────────────────────────
import { PassThrough } from 'node:stream'
import { readFileSync } from 'fs'
import { join } from 'path'

import {
  registerHumbleLoginFlows,
  createRustLoginWindowSeam
} from '../humbleLoginFlowRegistration'
import { handlerRegistry, listenerRegistry } from '../electronStub'
import { startRpcServer, requestRustInvoke } from '../sidecarRpc'
import {
  RUST_HUMBLE_LOGIN_OPEN,
  RUST_HUMBLE_LOGIN_COOKIES,
  RUST_HUMBLE_LOGIN_COOKIES_FOR_DOMAIN,
  RUST_HUMBLE_LOGIN_TAKE_EVENTS,
  RUST_HUMBLE_LOGIN_CLOSE,
  RUST_HUMBLE_LOGIN_CLEAR_COOKIES,
  RUST_HUMBLE_LOGIN_CLEAR_STORAGE
} from 'common/types/sidecarTransport'
import { classifyCookieRead } from '../../humble/loginWindowSeam'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

type Frame = Record<string, unknown>

/** Buffers newline-delimited output from a PassThrough into parsed frames (copied from
 * rustInvokeChannel.test.ts's `collectLines` + JSON.parse, humbleFlows.test.ts's
 * `collectFrames`).
 *
 * WR-10: deliberately NOT replaced by `./helpers/sidecarHarness`'s identical
 * copy. That module imports `init` from `../../bootstrap`, so importing it
 * would pull GlobalConfig/i18next in at module load -- exactly the
 * full-bootstrap cost `startTransport` below exists to avoid. Keep local. */
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
          // Non-JSON diagnostic line — ignore.
        }
      }
      newlineIndex = buffer.indexOf('\n')
    }
  })
  return frames
}

/** Waits a couple of microtask/macrotask turns for async work to progress. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

/** Starts a fresh, lightweight sidecar RPC transport (NOT the full `bootstrap.ts` init() —
 * `requestRustInvoke` only needs `startRpcServer`'s stream binding, not GlobalConfig/i18next/etc). */
function startTransport(): { input: PassThrough; frames: Frame[] } {
  const input = new PassThrough()
  const output = new PassThrough()
  const frames = collectFrames(output)
  startRpcServer(input, output)
  return { input, frames }
}

// ── Describe 1: Registration kind ──────────────────────────────────────────────────────────────
// Registered ONCE for this whole file (not per-test) -- `listenerRegistry`/`handlerRegistry` are
// module-scope maps; calling registerHumbleLoginFlows() more than once would stack a duplicate
// listener onto the same channel array (clipboardFlowRegistration's own test docstring names this
// hazard).
registerHumbleLoginFlows()

describe('registration kind — the 6 channels are registered with the correct kind, both directions', () => {
  const HANDLE_CHANNELS = [
    'humbleStartLogin',
    'humbleReconnect',
    'humbleGetLoginUserAgent',
    'humbleRevealKey'
  ]
  const SEND_CHANNELS = ['humbleStopLogin', 'humbleLoginNavigated']

  it.each(HANDLE_CHANNELS)(
    'REQ-34.4.1-02/-03/-04 %s is registered as ipcMain.handle, and NOT as ipcMain.on',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(true)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )

  it.each(SEND_CHANNELS)(
    'REQ-34.4.1-03/-05 %s is registered as ipcMain.on, and NOT as ipcMain.handle',
    (channel) => {
      expect((listenerRegistry.get(channel) ?? []).length).toBe(1)
      expect(handlerRegistry.has(channel)).toBe(false)
    }
  )
})

// ── Describe 2: rustInvoke frame shape ─────────────────────────────────────────────────────────
describe('rustInvoke frame shape — createRustLoginWindowSeam() drives the real sidecarRpc transport', () => {
  it('humble_login_open: emits [url, visible, userAgent] and resolves the coerced string label', async () => {
    const { input, frames } = startTransport()
    const seam = createRustLoginWindowSeam()

    const promise = seam.open('https://www.humblebundle.com/login', {
      visible: true,
      userAgent: FAKE_USER_AGENT
    })
    await flush()

    const frame = frames.find((f) => f.channel === RUST_HUMBLE_LOGIN_OPEN)
    expect(frame).toBeDefined()
    expect(frame?.kind).toBe('rustInvoke')
    expect(frame?.args).toEqual([
      'https://www.humblebundle.com/login',
      true,
      FAKE_USER_AGENT
    ])

    input.write(
      `${JSON.stringify({ id: frame?.id, ok: true, result: 'login-humble-1' })}\n`
    )
    await expect(promise).resolves.toBe('login-humble-1')
  })

  it('humble_login_open: throws on a malformed (non-string) response', async () => {
    const { input, frames } = startTransport()
    const seam = createRustLoginWindowSeam()

    const promise = seam.open('https://www.humblebundle.com/login', {
      visible: true,
      userAgent: FAKE_USER_AGENT
    })
    await flush()
    const frame = frames.find((f) => f.channel === RUST_HUMBLE_LOGIN_OPEN)

    input.write(
      `${JSON.stringify({ id: frame?.id, ok: true, result: null })}\n`
    )
    await expect(promise).rejects.toThrow(/malformed response/)
  })

  it('humble_login_cookies: emits [label, host, names] and resolves { total, matched }', async () => {
    const { input, frames } = startTransport()
    const seam = createRustLoginWindowSeam()

    const promise = seam.cookies('login-humble-1', 'www.humblebundle.com', [
      '_simpleauth_sess'
    ])
    await flush()

    const frame = frames.find((f) => f.channel === RUST_HUMBLE_LOGIN_COOKIES)
    expect(frame).toBeDefined()
    expect(frame?.args).toEqual([
      'login-humble-1',
      'www.humblebundle.com',
      ['_simpleauth_sess']
    ])

    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: {
          total: 33,
          matched: [
            {
              name: '_simpleauth_sess',
              domain: 'humblebundle.com',
              value: 'abc'
            }
          ]
        }
      })}\n`
    )
    await expect(promise).resolves.toEqual({
      total: 33,
      matched: [
        { name: '_simpleauth_sess', domain: 'humblebundle.com', value: 'abc' }
      ]
    })
  })

  // Load-bearing: a response that OMITS `total` must THROW, never silently coerce to 0 --
  // conflating "the read threw" with "the jar is empty" defeats classifyCookieRead's whole
  // purpose (REQ-34.4.1-13).
  it('humble_login_cookies: throws (never coerces to 0) when the response omits total', async () => {
    const { input, frames } = startTransport()
    const seam = createRustLoginWindowSeam()

    const promise = seam.cookies('login-humble-1', 'www.humblebundle.com', [
      '_simpleauth_sess'
    ])
    await flush()
    const frame = frames.find((f) => f.channel === RUST_HUMBLE_LOGIN_COOKIES)

    input.write(
      `${JSON.stringify({ id: frame?.id, ok: true, result: { matched: [] } })}\n`
    )
    await expect(promise).rejects.toThrow(/malformed response/)
  })

  // ── humble_login_cookies_for_domain (Phase 34.4.1 Plan 22, F-6 Defect A, REQ-34.4.1-GAP-07)
  it('humble_login_cookies_for_domain: emits [label, domain, names] and resolves { total, matched }', async () => {
    const { input, frames } = startTransport()
    const seam = createRustLoginWindowSeam()

    const promise = seam.cookiesForDomain(
      'login-humble-1',
      'humblebundle.com',
      []
    )
    await flush()

    const frame = frames.find(
      (f) => f.channel === RUST_HUMBLE_LOGIN_COOKIES_FOR_DOMAIN
    )
    expect(frame).toBeDefined()
    expect(frame?.kind).toBe('rustInvoke')
    expect(frame?.args).toEqual(['login-humble-1', 'humblebundle.com', []])

    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: {
          total: 33,
          matched: [
            {
              name: '_simpleauth_sess',
              domain: '.humblebundle.com',
              value: 'abc'
            }
          ]
        }
      })}\n`
    )
    await expect(promise).resolves.toEqual({
      total: 33,
      matched: [
        { name: '_simpleauth_sess', domain: '.humblebundle.com', value: 'abc' }
      ]
    })
  })

  // Load-bearing: this arm must reject a coerced-zero total exactly like `cookies()` does above
  // -- a missing/non-numeric total must THROW, never silently become 0. Asserted separately from
  // the `cookies()` case above so the pre-existing guard is verified adjacent to the new one,
  // not merely assumed to still hold.
  it('humble_login_cookies_for_domain: throws (never coerces to 0) when the response omits total', async () => {
    const { input, frames } = startTransport()
    const seam = createRustLoginWindowSeam()

    const promise = seam.cookiesForDomain(
      'login-humble-1',
      'humblebundle.com',
      []
    )
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_HUMBLE_LOGIN_COOKIES_FOR_DOMAIN
    )

    input.write(
      `${JSON.stringify({ id: frame?.id, ok: true, result: { matched: [] } })}\n`
    )
    await expect(promise).rejects.toThrow(/malformed response/)
  })

  // Same guard, re-asserted for the PRE-EXISTING `cookies()` flow -- the already-present arm
  // adjacent to the new code, checked by name per this plan's own binding constraint 1.
  it('humble_login_cookies: (adjacent-already-present check) still throws when the response omits total', async () => {
    const { input, frames } = startTransport()
    const seam = createRustLoginWindowSeam()

    const promise = seam.cookies('login-humble-1', 'www.humblebundle.com', [])
    await flush()
    const frame = frames.find((f) => f.channel === RUST_HUMBLE_LOGIN_COOKIES)

    input.write(
      `${JSON.stringify({ id: frame?.id, ok: true, result: { matched: [] } })}\n`
    )
    await expect(promise).rejects.toThrow(/malformed response/)
  })

  it('humble_login_take_events: emits [label] and resolves the coerced event array', async () => {
    const { input, frames } = startTransport()
    const seam = createRustLoginWindowSeam()

    const promise = seam.takeEvents('login-humble-1')
    await flush()

    const frame = frames.find(
      (f) => f.channel === RUST_HUMBLE_LOGIN_TAKE_EVENTS
    )
    expect(frame).toBeDefined()
    expect(frame?.args).toEqual(['login-humble-1'])

    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: [
          { event: 'started', url: 'https://www.humblebundle.com/login' },
          { event: 'finished', url: 'https://www.humblebundle.com/home' }
        ]
      })}\n`
    )
    await expect(promise).resolves.toEqual([
      { event: 'started', url: 'https://www.humblebundle.com/login' },
      { event: 'finished', url: 'https://www.humblebundle.com/home' }
    ])
  })

  // Quick task 260803-eee Task 5: `'closed'` was added to `coerceNavEvent`'s allow-list
  // alongside `'started'`/`'finished'`. Before this change, `coerceNavEvent` silently defaulted
  // any unrecognized `event` value to `'finished'` -- which would have swallowed a real
  // window-close signal from Rust into a bogus, non-matching nav event with no trace. This test
  // proves the value survives the coercion layer unchanged, which `oauthLoginCapture.ts`'s
  // cancel-detection logic (`captureOAuthLogin`) depends on to ever see it at all.
  it("humble_login_take_events: a 'closed' event passes through uncoerced (does NOT default to 'finished')", async () => {
    const { input, frames } = startTransport()
    const seam = createRustLoginWindowSeam()

    const promise = seam.takeEvents('oauth-capture-0')
    await flush()

    const frame = frames.find(
      (f) => f.channel === RUST_HUMBLE_LOGIN_TAKE_EVENTS
    )
    expect(frame).toBeDefined()

    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: [{ event: 'closed', url: '' }]
      })}\n`
    )
    await expect(promise).resolves.toEqual([{ event: 'closed', url: '' }])
  })

  it('humble_login_take_events: a genuinely unrecognized event value still defaults to "finished" (the pre-existing fail-safe is unchanged)', async () => {
    const { input, frames } = startTransport()
    const seam = createRustLoginWindowSeam()

    const promise = seam.takeEvents('login-humble-1')
    await flush()

    const frame = frames.find(
      (f) => f.channel === RUST_HUMBLE_LOGIN_TAKE_EVENTS
    )

    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: [
          { event: 'something-else', url: 'https://www.humblebundle.com/x' }
        ]
      })}\n`
    )
    await expect(promise).resolves.toEqual([
      { event: 'finished', url: 'https://www.humblebundle.com/x' }
    ])
  })

  it('humble_login_close: emits [label] and resolves the coerced boolean', async () => {
    const { input, frames } = startTransport()
    const seam = createRustLoginWindowSeam()

    const promise = seam.close('login-humble-1')
    await flush()

    const frame = frames.find((f) => f.channel === RUST_HUMBLE_LOGIN_CLOSE)
    expect(frame).toBeDefined()
    expect(frame?.args).toEqual(['login-humble-1'])

    input.write(
      `${JSON.stringify({ id: frame?.id, ok: true, result: true })}\n`
    )
    await expect(promise).resolves.toBe(true)
  })

  it('humble_login_clear_cookies: emits [label, domain] and resolves the coerced count', async () => {
    const { input, frames } = startTransport()
    const seam = createRustLoginWindowSeam()

    const promise = seam.clearCookies('login-humble-1', 'humblebundle.com')
    await flush()

    const frame = frames.find(
      (f) => f.channel === RUST_HUMBLE_LOGIN_CLEAR_COOKIES
    )
    expect(frame).toBeDefined()
    expect(frame?.args).toEqual(['login-humble-1', 'humblebundle.com'])

    input.write(`${JSON.stringify({ id: frame?.id, ok: true, result: 2 })}\n`)
    await expect(promise).resolves.toBe(2)
  })

  // ── humble_login_clear_storage (34.4.1 gap cycle plan 15, F-6, REQ-34.4.1-06/REQ-34.4.1-GAP-03)
  it('humble_login_clear_storage: emits [originUrl, userAgent] and resolves the coerced per-category report', async () => {
    const { input, frames } = startTransport()
    const seam = createRustLoginWindowSeam()

    const promise = seam.clearStorage(
      'https://www.humblebundle.com',
      FAKE_USER_AGENT
    )
    await flush()

    const frame = frames.find(
      (f) => f.channel === RUST_HUMBLE_LOGIN_CLEAR_STORAGE
    )
    expect(frame).toBeDefined()
    expect(frame?.kind).toBe('rustInvoke')
    expect(frame?.args).toEqual([
      'https://www.humblebundle.com',
      FAKE_USER_AGENT
    ])

    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: {
          localStorage: 4,
          sessionStorage: 0,
          indexedDB: 'unsupported',
          caches: 2,
          serviceWorkers: 0
        }
      })}\n`
    )
    await expect(promise).resolves.toEqual({
      localStorage: 4,
      sessionStorage: 0,
      indexedDB: 'unsupported',
      caches: 2,
      serviceWorkers: 0
    })
  })

  // Load-bearing: an 'unsupported' category must survive verbatim, never coerced to 0 --
  // conflating "the API is missing" with "the API cleared zero items" defeats the whole point of
  // the discriminator, exactly as classifyCookieRead's own total/everProvedLive distinction does.
  it("humble_login_clear_storage: an 'unsupported' category is not coerced to 0", async () => {
    const { input, frames } = startTransport()
    const seam = createRustLoginWindowSeam()

    const promise = seam.clearStorage(
      'https://www.humblebundle.com',
      FAKE_USER_AGENT
    )
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_HUMBLE_LOGIN_CLEAR_STORAGE
    )

    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: {
          localStorage: 'unsupported',
          sessionStorage: 'unsupported',
          indexedDB: 'unsupported',
          caches: 'unsupported',
          serviceWorkers: 'unsupported'
        }
      })}\n`
    )
    const result = await promise
    expect(result.localStorage).toBe('unsupported')
    expect(result.localStorage).not.toBe(0)
  })

  it('humble_login_clear_storage: throws (never coerces to a fake success) on a malformed response', async () => {
    const { input, frames } = startTransport()
    const seam = createRustLoginWindowSeam()

    const promise = seam.clearStorage(
      'https://www.humblebundle.com',
      FAKE_USER_AGENT
    )
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_HUMBLE_LOGIN_CLEAR_STORAGE
    )

    input.write(
      `${JSON.stringify({ id: frame?.id, ok: true, result: { localStorage: true } })}\n`
    )
    await expect(promise).rejects.toThrow(/malformed/)
  })

  it('humble_login_clear_storage: a rejecting requestRustInvoke surfaces as a rejection, never a swallowed fake success', async () => {
    const { input, frames } = startTransport()
    const seam = createRustLoginWindowSeam()

    const promise = seam.clearStorage(
      'https://www.humblebundle.com',
      FAKE_USER_AGENT
    )
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_HUMBLE_LOGIN_CLEAR_STORAGE
    )

    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: false,
        error: 'humble_login_clear_storage:timeout'
      })}\n`
    )
    await expect(promise).rejects.toThrow(/timeout/)
  })

  it('sanity: requestRustInvoke refuses a non-allowlisted channel without emitting a frame', async () => {
    const { frames } = startTransport()
    await expect(
      requestRustInvoke('not_a_real_channel' as never, [])
    ).rejects.toThrow(/channel not allowed/)
    expect(frames).toHaveLength(0)
  })
})

// ── Describe 3: Curated-import guard ───────────────────────────────────────────────────────────
describe('curated-import guard — humbleLoginFlowRegistration.ts never imports humble/ipc_handler', () => {
  /** True iff comment-stripped `source` contains an import statement referencing
   * `humble/ipc_handler` (a bare side-effect import, a named/default import via `from`, or a
   * CommonJS `require(...)`). Mirrors `humbleFlows.test.ts`'s own `importsIpcHandler` gate. */
  function importsIpcHandler(source: string): boolean {
    const stripped = stripSourceComments(source)
    return (
      /import\s+['"](?:\.\.\/)*humble\/ipc_handler['"]/.test(stripped) ||
      /from\s+['"](?:\.\.\/)*humble\/ipc_handler['"]/.test(stripped) ||
      /require\(\s*['"](?:\.\.\/)*humble\/ipc_handler['"]\s*\)/.test(stripped)
    )
  }

  it('REQ-34.4.1-02 humbleLoginFlowRegistration.ts contains no import statement referencing humble/ipc_handler', () => {
    const source = readFileSync(
      join(__dirname, '..', 'humbleLoginFlowRegistration.ts'),
      'utf-8'
    )
    expect(importsIpcHandler(source)).toBe(false)
  })

  it('gate self-test: a synthetic source with a named import of humble/ipc_handler is detected', () => {
    const synthetic = [
      "import { registerHumbleIpcHandlers } from '../humble/ipc_handler'",
      'export function registerHumbleLoginFlows(): void {}'
    ].join('\n')
    expect(importsIpcHandler(synthetic)).toBe(true)
  })

  it('gate self-test: a synthetic source with a bare side-effect import of humble/ipc_handler is detected', () => {
    const synthetic = [
      "import '../humble/ipc_handler'",
      'export function registerHumbleLoginFlows(): void {}'
    ].join('\n')
    expect(importsIpcHandler(synthetic)).toBe(true)
  })

  it('gate self-test (anti-vacuity): a docblock-only mention of humble/ipc_handler.ts is NOT detected as an import', () => {
    const synthetic = [
      '/**',
      ' * Never side-effect-import humble/ipc_handler.ts — it registers',
      ' * these same 6 channels a second time.',
      ' */',
      'export function registerHumbleLoginFlows(): void {}'
    ].join('\n')
    expect(importsIpcHandler(synthetic)).toBe(false)
  })
})

// ── Describe 4: classifyCookieRead truth table (REQ-34.4.1-13) ────────────────────────────────
describe('classifyCookieRead truth table (REQ-34.4.1-13)', () => {
  it('total === null -> UNSUPPORTED_OR_ERROR (the read itself threw)', () => {
    expect(classifyCookieRead({ total: null, everProvedLive: false })).toBe(
      'UNSUPPORTED_OR_ERROR'
    )
    // everProvedLive must not matter once total is null.
    expect(classifyCookieRead({ total: null, everProvedLive: true })).toBe(
      'UNSUPPORTED_OR_ERROR'
    )
  })

  it('total > 0 -> SUPPORTED_NONEMPTY (cookies returned; API demonstrably live)', () => {
    expect(classifyCookieRead({ total: 33, everProvedLive: false })).toBe(
      'SUPPORTED_NONEMPTY'
    )
  })

  it('total === 0 && everProvedLive -> SUPPORTED_BUT_EMPTY (a real "not logged in yet")', () => {
    expect(classifyCookieRead({ total: 0, everProvedLive: true })).toBe(
      'SUPPORTED_BUT_EMPTY'
    )
  })

  it('total === 0 && !everProvedLive -> UNDECIDABLE (empty and dead are indistinguishable; NEVER poll)', () => {
    expect(classifyCookieRead({ total: 0, everProvedLive: false })).toBe(
      'UNDECIDABLE'
    )
  })

  it('REQ-34.4.1-13: classifyCookieRead has no platform branch — a structural, source-text proof', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'humble', 'loginWindowSeam.ts'),
      'utf-8'
    )
    const stripped = stripSourceComments(source)
    expect(stripped).not.toMatch(/process\.platform/)
    expect(stripped).not.toMatch(/isWindows|isMac|isLinux/)
  })
})
