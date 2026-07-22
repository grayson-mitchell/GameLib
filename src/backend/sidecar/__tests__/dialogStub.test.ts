/**
 * Unit tests for the sidecar's real `dialog.showOpenDialog` folder-picker path (Phase 30
 * Plan 03 — Task 3), plus a by-construction proof that `notify()`'s no-op is logged.
 *
 * There is no real Rust process here — `requestRustInvoke` (from `../sidecarRpc`) is mocked
 * with a small in-memory per-channel program, mirroring `keyringTokenStore.test.ts`'s
 * convention, so each test can script a resolve/reject outcome and assert on exactly what was
 * called and returned.
 *
 * `jest.mock('electron', ...)` routes Jest's own module resolution at the REAL `electronStub.ts`
 * (mirrors `skeletonFlows.test.ts`/`electronUntouched.test.ts`'s three-way mock preamble) so
 * `dialog.showOpenDialog`'s actual forwarding logic runs, not the generic backend-wide
 * `src/backend/__mocks__/electron.ts` manual mock. `jest.mock('os', ...)` keeps any import-time
 * path resolution inside electronStub.ts's module graph away from the developer's real config
 * directory (same gotcha `electronUntouched.test.ts`'s header documents).
 */

import { readFileSync } from 'fs'
import { join } from 'path'

// ── os — per-pid tmp home, same convention as skeletonFlows.test.ts / electronUntouched.test.ts
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-dialogstub-test-home-${process.pid}`)
  }
})

// ── electron / electron-store — route Jest's own module resolution at the REAL sidecar shims
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── sidecarRpc mock — fake Rust responder, in-memory program (mirrors keyringTokenStore.test.ts)
jest.mock('../sidecarRpc', () => ({
  requestRustInvoke: jest.fn()
}))

// NOTE: electronStub.ts deliberately does NOT import 'backend/logger' (it would reintroduce
// the app.getPath() import-time wall bootstrap.ts's docstring warns about -- see the note above
// electronStub.ts's imports) -- its one error path uses `console.warn` directly, spied on below.

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { dialog } from '../electronStub'
import { requestRustInvoke } from '../sidecarRpc'
import {
  RUST_DIALOG_OPEN,
  RUST_INVOKE_CHANNELS
} from 'common/types/sidecarTransport'

type ProgrammedOutcome =
  | { type: 'resolve'; value: unknown }
  | { type: 'reject'; error: Error }

const mockRequestRustInvoke = requestRustInvoke as jest.Mock

let program: ProgrammedOutcome | null = null
let callLog: Array<{ channel: string; args: unknown[] }> = []
let warnSpy: jest.SpyInstance

describe('electronStub dialog.showOpenDialog (Phase 30 Plan 03)', () => {
  beforeEach(() => {
    program = null
    callLog = []
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    // resetMocks: true (jest.config.js) wipes even a factory-supplied implementation before
    // every test (same gotcha keyringTokenStore.test.ts documents) — re-wire here.
    mockRequestRustInvoke.mockImplementation((channel: string, args: unknown[]) => {
      callLog.push({ channel, args })
      if (!program) {
        return Promise.reject(new Error(`no outcome programmed for channel: ${channel}`))
      }
      return program.type === 'resolve'
        ? Promise.resolve(program.value)
        : Promise.reject(program.error)
    })
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('RUST_DIALOG_OPEN is a member of RUST_INVOKE_CHANNELS (so requestRustInvoke will emit, not pre-reject)', () => {
    expect((RUST_INVOKE_CHANNELS as readonly string[]).includes(RUST_DIALOG_OPEN)).toBe(true)
  })

  it('resolves { canceled: false, filePaths: [path] } when requestRustInvoke resolves a picked path', async () => {
    program = { type: 'resolve', value: '/Users/dev/Games' }

    const result = await dialog.showOpenDialog(undefined, { properties: ['openDirectory'] })

    expect(result).toEqual({ canceled: false, filePaths: ['/Users/dev/Games'] })
    expect(callLog).toEqual([
      {
        channel: RUST_DIALOG_OPEN,
        args: [{ properties: ['openDirectory'] }]
      }
    ])
  })

  it('resolves { canceled: true, filePaths: [] } when requestRustInvoke resolves null (user cancelled)', async () => {
    program = { type: 'resolve', value: null }

    const result = await dialog.showOpenDialog(undefined, {})

    expect(result).toEqual({ canceled: true, filePaths: [] })
  })

  it('resolves { canceled: true, filePaths: [] } and never throws when requestRustInvoke rejects', async () => {
    program = {
      type: 'reject',
      error: new Error('rustInvoke: channel not allowed: dialog_open')
    }

    await expect(dialog.showOpenDialog(undefined, {})).resolves.toEqual({
      canceled: true,
      filePaths: []
    })
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [warningArg] = warnSpy.mock.calls[0]
    expect(String(warningArg)).toContain(RUST_DIALOG_OPEN)
  })

  it('the other five dialog.* stub members are unchanged', async () => {
    expect(dialog.showErrorBox()).toBeUndefined()
    await expect(dialog.showMessageBox()).resolves.toEqual({
      response: 0,
      checkboxChecked: false
    })
    expect(dialog.showMessageBoxSync()).toBe(0)
    expect(dialog.showOpenDialogSync()).toBeUndefined()
    await expect(dialog.showSaveDialog()).resolves.toEqual({
      canceled: true,
      filePath: undefined
    })
  })
})

// ── By-construction gate (mirrors electronUntouched.test.ts's stripped-source idiom): proves
// notify()'s no-op branch is logged rather than silent, without importing dialog.ts's heavier
// getMainWindow()/sendFrontendMessage() import chain into this lightweight sidecar suite.
describe('backend/dialog/dialog.ts notify() logged no-op (REQ-30-07/D-09)', () => {
  it('the else branch alongside isSteamDeckGameMode calls logInfo (comments stripped)', () => {
    const src = readFileSync(
      join(__dirname, '../../dialog/dialog.ts'),
      'utf-8'
    )
    const stripped = stripComments(src)
    const notifyMatch = stripped.match(
      /function notify\([^)]*\)\s*{[\s\S]*?\n}/
    )
    expect(notifyMatch).not.toBeNull()
    const notifyBody = notifyMatch ? notifyMatch[0] : ''
    expect(notifyBody).toMatch(/}\s*else\s*{/)
    expect(notifyBody).toMatch(/logInfo\(/)
  })
})

/** Strips `//`, `/* ... *\/`-continuation, and `*`-prefixed docblock lines before matching. */
function stripComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
}
