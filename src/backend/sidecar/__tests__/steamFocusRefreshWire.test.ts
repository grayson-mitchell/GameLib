/**
 * Steam focus-refresh WIRE CONTRACT — cross-side pin plus a real-transport consumer proof
 * (quick task 260908-ci2).
 *
 * WHY THIS FILE EXISTS. `send`-kind channels fail SILENTLY on a name mismatch between the two
 * sides of the sidecar transport: no marker frame, no timeout, no log line — the Rust producer
 * (`src-tauri/src/main.rs`, `.setup()`'s `WindowEvent::Focused(true)` handler) and the TS
 * consumer (`steamFlowRegistration.ts`'s `ipcMain.on(SHELL_WINDOW_FOCUSED, ...)`) each reference
 * the channel name independently — a Rust-side rename with no matching TS-side rename (or vice
 * versa) compiles, typechecks, and lints clean on both sides, and the badge-reconciliation
 * trigger this restores would simply never fire again, with nothing anywhere to say so.
 * Coverage of each end in isolation is not coverage of the boundary between them — the same
 * lesson `storeEmbedWireContract.test.ts` encodes for the store-embed channels, applied here to
 * a Rust-to-sidecar `send` frame instead of a sidecar-to-Rust one.
 *
 * Four gates:
 *   T-A — cross-side name pin: the Rust `const` literal is templated FROM the TS constant, so
 *         renaming either side alone reds this test, plus a self-check that the stripping is
 *         live (a comment-only phrase must not survive it).
 *   T-B — producer wiring pin: `Focused(true)` present, `SHELL_WINDOW_FOCUSED` + `write_frame`
 *         referenced in the SAME window-event block, `Focused(false)` absent.
 *   T-C — consumer over the REAL transport: `startRpcServer` + `PassThrough`, a real `send`
 *         frame, `dispatchSend`/`listenerRegistry` in the loop (never the listener called
 *         directly), `refreshInstallState` observed called exactly once.
 *   T-D — fail-soft consumer: same transport, `refreshInstallState` mocked to REJECT; no
 *         unhandled rejection, and a subsequent frame is still processed afterward.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import {
  stripSourceComments,
  stripTrailingLineComment
} from '../../testUtils/stripSourceComments'
import { SHELL_WINDOW_FOCUSED } from '../../../common/types/sidecarTransport'

const MAIN_RS_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'src-tauri',
  'src',
  'main.rs'
)

/**
 * Two-stage comment-stripping recipe copied verbatim from `tauriShellSource.test.ts` (per this
 * task's own instruction: reuse the recipe, do not invent a new one). `main.rs`'s own doc
 * comments on the `SHELL_WINDOW_FOCUSED` const and the focus-listener block quote the very
 * strings under assertion below, so an unstripped match could pass on prose alone.
 */
function loadMainRsCode(source?: string): string {
  const raw = source ?? readFileSync(MAIN_RS_PATH, 'utf-8')
  return stripSourceComments(raw)
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .map(stripTrailingLineComment)
    .join('\n')
}

describe('loadMainRsCode comment-stripping self-test', () => {
  test('a comment-only phrase from the SHELL_WINDOW_FOCUSED doc comment is NOT in the stripped output', () => {
    // "Mirrors SHELL_WINDOW_FOCUSED." appears only in the const's /// doc comment, never in
    // real code -- if it survived stripping, T-A's positive assertion below could be passing
    // on prose rather than on the actual const declaration.
    expect(loadMainRsCode()).not.toContain('Mirrors SHELL_WINDOW_FOCUSED')
  })
})

describe('T-A: cross-side name pin (main.rs const <-> SHELL_WINDOW_FOCUSED)', () => {
  test('the stripped source declares the const with the exact TS constant value', () => {
    // Templated FROM the TS constant, not hand-typed twice -- renaming either side alone
    // breaks this string and reds the test.
    const expectedDecl = `const SHELL_WINDOW_FOCUSED: &str = "${SHELL_WINDOW_FOCUSED}";`
    expect(loadMainRsCode()).toContain(expectedDecl)
  })
})

describe('T-B: producer wiring pin (Focused(true) block references the channel + write_frame)', () => {
  function focusListenerBlock(): string {
    const code = loadMainRsCode()
    const startMarker = 'focus_window.on_window_event(move |event| {'
    const startIdx = code.indexOf(startMarker)
    expect(startIdx).toBeGreaterThan(-1)
    // First real call to load_recent_games_from_disk (not its `fn` definition, which precedes
    // this block entirely) marks the end of the focus-listener setup region.
    const endIdx = code.indexOf('load_recent_games_from_disk(', startIdx)
    expect(endIdx).toBeGreaterThan(startIdx)
    return code.slice(startIdx, endIdx)
  }

  test('the block matches on Focused(true)', () => {
    expect(focusListenerBlock()).toContain('tauri::WindowEvent::Focused(true)')
  })

  test('the same block references SHELL_WINDOW_FOCUSED', () => {
    expect(focusListenerBlock()).toContain('SHELL_WINDOW_FOCUSED')
  })

  test('the same block references write_frame', () => {
    expect(focusListenerBlock()).toContain('write_frame')
  })

  test('the block does NOT match on Focused(false) -- refocus only, never blur', () => {
    expect(focusListenerBlock()).not.toContain('Focused(false)')
  })
})

// ---- T-C / T-D: consumer over the REAL transport ----
//
// Hybrid pattern: the LIGHT direct-transport harness (`startRpcServer` + `PassThrough`,
// `storeEmbedWireContract.test.ts`'s own pattern) avoids the heavy `init()`/`startSidecar()`
// bootstrap, combined with `steamFlows.test.ts`'s mock set -- needed because
// `steamFlowRegistration.ts`'s import graph (via `launcher.ts`) is too heavy to import safely
// under Jest without it, even though this file drives none of those flows.
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  return {
    ...actual,
    homedir: () => `/tmp/gamelib-focus-wire-test-${process.pid}`
  }
})

jest.mock('backend/store_backend', () =>
  jest.requireActual('backend/store_backend')
)

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    head: jest.fn().mockResolvedValue({ status: 200 }),
    create: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ data: {} })
    }),
    get: jest.fn().mockResolvedValue({ data: {} })
  }
}))

jest.mock('backend/utils', () => ({
  ...jest.requireActual('backend/utils'),
  getSteamLibraries: jest.fn().mockResolvedValue([]),
  getFileSize: jest.fn().mockReturnValue(0)
}))

jest.mock('backend/constants/environment', () => ({
  ...jest.requireActual('backend/constants/environment'),
  isLinux: true
}))

jest.mock('../../storeManagers/steam/user')

const launchEventCallbackMock = jest.fn()
jest.mock('../../launcher', () => ({
  launchEventCallback: (...args: unknown[]) => launchEventCallbackMock(...args)
}))

// `backend/storeManagers` is DELIBERATELY left unmocked -- `libraryManagerMap.steam` must be
// the real singleton `steamFlowRegistration.ts` dispatches through, so `jest.spyOn` on its
// `refreshInstallState` method observes the real production call path, not a stand-in.
import { libraryManagerMap } from '../../storeManagers'
import { registerSteamFlows } from '../steamFlowRegistration'
import { startRpcServer } from '../sidecarRpc'
import { listenerRegistry } from '../../platform'

// `backend/logger`'s real `logWarning`/`logInfo` dereference a module-private
// `heroicLogWriter` that only a full `init()`/`initHeadless()` call assigns -- neither of which
// this light transport harness runs. `jest.spyOn` on the REAL, already-loaded module object
// (via `require`, matching `sidecarRejectionGuard.test.ts`'s own precedent and its documented
// reason: a `jest.mock` factory calling `jest.requireActual('backend/logger')` re-enters the
// index.ts/log_writer.ts circular import and throws) no-ops the wrapper without needing a
// writer at all -- this file asserts the rejection is CAUGHT, not what gets logged.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const loggerModule = require('../../logger')

interface Frame {
  id?: string
  ok?: boolean
}

function collectFrames(stream: PassThrough): Frame[] {
  const frames: Frame[] = []
  let buffered = ''
  stream.on('data', (chunk: Buffer) => {
    buffered += chunk.toString('utf8')
    let nl = buffered.indexOf('\n')
    while (nl !== -1) {
      const line = buffered.slice(0, nl)
      buffered = buffered.slice(nl + 1)
      if (line.trim()) {
        try {
          frames.push(JSON.parse(line) as Frame)
        } catch {
          /* a non-JSON line is not a frame */
        }
      }
      nl = buffered.indexOf('\n')
    }
  })
  return frames
}

function startTransport(): { input: PassThrough; frames: Frame[] } {
  const input = new PassThrough()
  const output = new PassThrough()
  const frames = collectFrames(output)
  startRpcServer(input, output)
  return { input, frames }
}

function writeSend(
  input: PassThrough,
  id: string,
  channel: string,
  args: unknown[]
): void {
  input.write(`${JSON.stringify({ id, kind: 'send', channel, args })}\n`)
}

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

describe('T-C / T-D: shellWindowFocused consumer over the real transport', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // `ipcMain.on` APPENDS to `listenerRegistry` (fire-and-forget channels can have more than
    // one listener by design) -- registering fresh every test without clearing first would
    // stack listeners across tests and multiply the call count this suite asserts on. Cleared
    // here rather than never re-registering, so each test still exercises the real
    // `registerSteamFlows()` registration path end to end.
    listenerRegistry.delete(SHELL_WINDOW_FOCUSED)
  })

  test('T-C: a real send frame on SHELL_WINDOW_FOCUSED calls refreshInstallState exactly once via dispatchSend/listenerRegistry', async () => {
    const refreshInstallState = jest
      .spyOn(libraryManagerMap.steam, 'refreshInstallState')
      .mockResolvedValue(undefined)

    registerSteamFlows()
    const { input } = startTransport()

    // A real newline-terminated frame, channel read from the SHARED constant -- never call
    // the registered listener directly (that is exactly how `shutdownBridgeHelper()` stayed
    // green with zero production callers).
    writeSend(input, 'focus-1', SHELL_WINDOW_FOCUSED, [])
    await flush()

    expect(refreshInstallState).toHaveBeenCalledTimes(1)
  })

  test('T-D: a rejecting refreshInstallState is caught (fail-soft) and a subsequent frame is still processed', async () => {
    jest.spyOn(loggerModule, 'logWarning').mockImplementation(() => undefined)
    const refreshInstallState = jest
      .spyOn(libraryManagerMap.steam, 'refreshInstallState')
      .mockRejectedValueOnce(new Error('acf read failed'))
      .mockResolvedValueOnce(undefined)

    registerSteamFlows()
    const { input } = startTransport()

    let unhandled: unknown
    const onUnhandled = (reason: unknown) => {
      unhandled = reason
    }
    process.on('unhandledRejection', onUnhandled)
    try {
      writeSend(input, 'focus-2', SHELL_WINDOW_FOCUSED, [])
      await flush()

      expect(refreshInstallState).toHaveBeenCalledTimes(1)
      expect(unhandled).toBeUndefined()

      // A second frame after the first rejection must still reach the listener -- the
      // rejection must not have wedged dispatchSend or the transport.
      writeSend(input, 'focus-3', SHELL_WINDOW_FOCUSED, [])
      await flush()

      expect(refreshInstallState).toHaveBeenCalledTimes(2)
      expect(unhandled).toBeUndefined()
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})
