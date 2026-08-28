/**
 * Round-trip test for the sidecar's curated clipboard channel registration (Phase 34.3 Plan 06
 * — REQ-34.3-03/REQ-34.3-04/REQ-34.3-13).
 *
 * Calls `registerClipboardFlows()` directly (never through `../bootstrap`'s full `init()`), so
 * this suite only ever loads `clipboardFlowRegistration.ts`'s own import graph
 * (`./electronStub`, `./sidecarRpc`, `../utils/systeminfo`, `common/types/sidecarTransport`) —
 * never the rest of `handlers.ts`'s side-effecting module-scope registrations, which this
 * module never touches and which would otherwise require mocking a much larger surface (axios,
 * `GlobalConfig`, `backend/storeManagers`, dialog, ...) for no reason. Mirrors
 * `lifecycleStub.test.ts`'s own "mock only the Rust boundary, invoke electronStub's real
 * members directly, assert channel + args + logged-not-thrown failures" shape — the closest
 * analog in this codebase for this exact kind of coverage.
 *
 * Mocks ONLY the Rust boundary (`requestRustInvoke`) and the `utils/systeminfo` boundary
 * (`getSystemInfo`/`formatSystemInfo`) — never `clipboard.writeText` itself, never
 * `registerClipboardFlows`, and never either handler under test.
 */

// ── os — per-pid tmp home, same convention as lifecycleStub.test.ts/dialogStub.test.ts ────────
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(
        actual.tmpdir(),
        `gamelib-clipboardflows-test-home-${process.pid}`
      )
  }
})

// ── electron / electron-store — route Jest's own module resolution at the REAL sidecar shims ──
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('backend/store_backend', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── sidecarRpc — full mock, scriptable requestRustInvoke only (mirrors lifecycleStub.test.ts) ─
jest.mock('../sidecarRpc', () => ({
  requestRustInvoke: jest.fn()
}))

// ── utils/systeminfo — mocked so copySystemInfoToClipboard's coverage targets ITS OWN wiring
// (the curated-import boundary, formatted-string forwarding), not systeminfo's real CPU/GPU/OS
// gathering ──────────────────────────────────────────────────────────────────────────────────
jest.mock('../../utils/systeminfo', () => ({
  getSystemInfo: jest.fn(),
  formatSystemInfo: jest.fn()
}))

// ── Imports (after mocks) ───────────────────────────────────────────────────────────────────
import { registerClipboardFlows } from '../clipboardFlowRegistration'
import { clipboard, listenerRegistry, handlerRegistry } from '../electronStub'
import { requestRustInvoke } from '../sidecarRpc'
import { getSystemInfo, formatSystemInfo } from '../../utils/systeminfo'
import {
  RUST_CLIPBOARD_WRITE_TEXT,
  RUST_CLIPBOARD_READ_TEXT
} from 'common/types/sidecarTransport'

type ProgrammedOutcome =
  | { type: 'resolve'; value: unknown }
  | { type: 'reject'; error: Error }

const mockRequestRustInvoke = requestRustInvoke as jest.Mock
const mockGetSystemInfo = getSystemInfo as jest.Mock
const mockFormatSystemInfo = formatSystemInfo as jest.Mock

let program: ProgrammedOutcome | null = null
let callLog: Array<{ channel: string; args: unknown[] }> = []
let warnSpy: jest.SpyInstance

/** Waits a few macrotask turns for a fire-and-forget async chain to settle. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/** Invokes a registered `ipcMain.on` listener directly, mirroring a `send` frame arriving. */
function invokeListener(channel: string, ...args: unknown[]): void {
  const listeners = listenerRegistry.get(channel) ?? []
  expect(listeners.length).toBeGreaterThan(0)
  listeners[0](undefined, ...args)
}

/** Invokes a registered `ipcMain.handle` handler directly, mirroring an `invoke` frame arriving. */
function invokeHandler(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlerRegistry.get(channel)
  expect(handler).toBeDefined()
  return Promise.resolve(handler?.(undefined, ...args))
}

// The 7 already-ported channels `utils/ipc_handler.ts`/`logger/ipc_handler.ts` also register —
// a side-effect import of either would double-register these. Snapshotted BEFORE
// `registerClipboardFlows()` runs (below) so the guard test at the bottom of this file proves
// the CALL adds nothing for them, not merely that nothing else in this isolated module graph
// happens to register them.
const FOREIGN_CHANNELS = [
  'abort',
  'getSystemInfo',
  'hasExecutable',
  'getLegendaryVersion',
  'getGogdlVersion',
  'getCometVersion',
  'getNileVersion'
]

function snapshotForeignChannels(): Record<
  string,
  { handler: boolean; listeners: number }
> {
  const snapshot: Record<string, { handler: boolean; listeners: number }> = {}
  for (const channel of FOREIGN_CHANNELS) {
    snapshot[channel] = {
      handler: handlerRegistry.has(channel),
      listeners: (listenerRegistry.get(channel) ?? []).length
    }
  }
  return snapshot
}

const foreignChannelsBefore = snapshotForeignChannels()

// Registered ONCE for this whole file (not per-test) — `listenerRegistry`/`handlerRegistry`
// are module-scope maps; calling this more than once would stack a duplicate listener onto
// the SAME channel array.
registerClipboardFlows()

beforeEach(() => {
  program = null
  callLog = []
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  // resetMocks: true (src/backend/jest.config.js) wipes even a factory-supplied
  // implementation before every test (dialogStub.test.ts/lifecycleStub.test.ts's own
  // documented gotcha) -- re-wire here.
  mockRequestRustInvoke.mockImplementation(
    (channel: string, args: unknown[]) => {
      callLog.push({ channel, args })
      if (!program) {
        return Promise.reject(
          new Error(`no outcome programmed for channel: ${channel}`)
        )
      }
      return program.type === 'resolve'
        ? Promise.resolve(program.value)
        : Promise.reject(program.error)
    }
  )
  mockGetSystemInfo.mockResolvedValue({})
  mockFormatSystemInfo.mockResolvedValue('')
})

afterEach(() => {
  warnSpy.mockRestore()
})

describe('sidecar clipboard flows (Phase 34.3 Plan 06 — REQ-34.3-03/REQ-34.3-04)', () => {
  // ── REQ-34.3-03: clipboardWriteText (send) ────────────────────────────────────────────────

  it('REQ-34.3-03 clipboardWriteText (send) reaches clipboard.writeText -> exactly one clipboard_write_text rustInvoke call', async () => {
    program = { type: 'resolve', value: null }
    const synthetic = 'synthetic-clipboard-write-text-payload'

    invokeListener('clipboardWriteText', synthetic)
    await flush()

    expect(callLog).toEqual([
      { channel: RUST_CLIPBOARD_WRITE_TEXT, args: [synthetic] }
    ])
  })

  it('REQ-34.3-03 clipboardWriteText (send) never throws when requestRustInvoke rejects, and logs a warning naming clipboard_write_text', async () => {
    program = {
      type: 'reject',
      error: new Error('synthetic transport failure')
    }

    expect(() => invokeListener('clipboardWriteText', 'x')).not.toThrow()
    await flush()

    expect(warnSpy).toHaveBeenCalled()
    const warned = warnSpy.mock.calls.some(([first]) =>
      String(first).includes(RUST_CLIPBOARD_WRITE_TEXT)
    )
    expect(warned).toBe(true)
  })

  // ── REQ-34.3-04: clipboardReadText (invoke) ───────────────────────────────────────────────

  it('REQ-34.3-04 clipboardReadText (invoke) round-trips a real clipboard value', async () => {
    program = { type: 'resolve', value: 'pasted' }

    const result = await invokeHandler('clipboardReadText')

    expect(result).toBe('pasted')
    expect(callLog).toEqual([{ channel: RUST_CLIPBOARD_READ_TEXT, args: [] }])
  })

  it('REQ-34.3-04 clipboardReadText (invoke) resolves an empty string for an empty clipboard — not undefined, not a rejection', async () => {
    program = { type: 'resolve', value: '' }

    const result = await invokeHandler('clipboardReadText')

    expect(result).toBe('')
  })

  it('REQ-34.3-04 clipboardReadText (invoke) coerces a non-string Rust result to an empty string', async () => {
    program = { type: 'resolve', value: null }

    const result = await invokeHandler('clipboardReadText')

    expect(result).toBe('')
  })

  it('REQ-34.3-04 clipboardReadText (invoke) resolves an empty string (never rejects) when requestRustInvoke rejects, and logs a warning', async () => {
    program = { type: 'reject', error: new Error('synthetic read failure') }

    const result = await invokeHandler('clipboardReadText')

    expect(result).toBe('')
    expect(warnSpy).toHaveBeenCalled()
    const warned = warnSpy.mock.calls.some(([first]) =>
      String(first).includes('clipboardReadText')
    )
    expect(warned).toBe(true)
  })

  it('REQ-34.3-04 clipboardReadText (invoke) never calls electronStub.clipboard.readText (D-04)', async () => {
    const readTextSpy = jest.spyOn(clipboard, 'readText')
    program = { type: 'resolve', value: 'pasted' }

    await invokeHandler('clipboardReadText')

    expect(readTextSpy).not.toHaveBeenCalled()
    readTextSpy.mockRestore()
  })

  // ── REQ-34.3-03: copySystemInfoToClipboard (send) ─────────────────────────────────────────

  it('REQ-34.3-03 copySystemInfoToClipboard (send) writes the formatted system info to the real clipboard', async () => {
    program = { type: 'resolve', value: null }
    const formatted = 'CPU: 8x Synthetic Test CPU\nMemory: 16 GiB'
    mockGetSystemInfo.mockResolvedValue({ synthetic: true })
    mockFormatSystemInfo.mockResolvedValue(formatted)

    invokeListener('copySystemInfoToClipboard')
    await flush()

    expect(mockFormatSystemInfo).toHaveBeenCalledWith({ synthetic: true })
    expect(callLog).toEqual([
      { channel: RUST_CLIPBOARD_WRITE_TEXT, args: [formatted] }
    ])
  })

  it('REQ-34.3-03 copySystemInfoToClipboard (send) never crashes the sidecar when getSystemInfo rejects — no unhandled rejection, logs a warning', async () => {
    mockGetSystemInfo.mockRejectedValue(
      new Error('synthetic systeminfo failure')
    )

    expect(() => invokeListener('copySystemInfoToClipboard')).not.toThrow()
    await flush()

    expect(callLog).toEqual([])
    expect(warnSpy).toHaveBeenCalled()
    const warned = warnSpy.mock.calls.some(([first]) =>
      String(first).includes('copySystemInfoToClipboard')
    )
    expect(warned).toBe(true)
  })

  // ── send-vs-handle registration-kind contract (Phase 31 Pitfall 2 / T-34.3-04) ────────────

  it('REQ-34.3-03/REQ-34.3-04 send-vs-handle contract: clipboardWriteText/copySystemInfoToClipboard are listeners, clipboardReadText is a handler -- and NOT the reverse', () => {
    expect(
      (listenerRegistry.get('clipboardWriteText') ?? []).length
    ).toBeGreaterThan(0)
    expect(handlerRegistry.has('clipboardWriteText')).toBe(false)

    expect(
      (listenerRegistry.get('copySystemInfoToClipboard') ?? []).length
    ).toBeGreaterThan(0)
    expect(handlerRegistry.has('copySystemInfoToClipboard')).toBe(false)

    expect(handlerRegistry.has('clipboardReadText')).toBe(true)
    expect((listenerRegistry.get('clipboardReadText') ?? []).length).toBe(0)
  })

  // ── D-14 curated-import scope guard ───────────────────────────────────────────────────────

  it('registerClipboardFlows() does not register any of the 8 already-ported channels utils/ipc_handler.ts and logger/ipc_handler.ts also declare', () => {
    const after = snapshotForeignChannels()
    for (const channel of FOREIGN_CHANNELS) {
      expect(after[channel]).toEqual(foreignChannelsBefore[channel])
      expect(after[channel].handler).toBe(false)
      expect(after[channel].listeners).toBe(0)
    }
  })
})
