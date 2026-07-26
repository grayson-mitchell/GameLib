/**
 * Unit tests for the sidecar's real `dialog.*` forwarding paths (Phase 30 Plan 03's
 * `showOpenDialog` folder-picker, Phase 31 Plan 02's `showMessageBox`/`showErrorBox`/
 * `showSaveDialog`), the D-03 logged-no-op Sync members, and a by-construction proof that
 * `notify()`'s no-op is logged. `shell.showItemInFolder` and `clipboard.writeText` both
 * graduated from a D-04 logged no-op to real Rust forwarding (see the pointer comments below);
 * `clipboard.readText()`'s documented-dead no-op assertion is the one surviving piece of D-04
 * coverage still living in this file.
 *
 * There is no real Rust process here — `requestRustInvoke` (from `../sidecarRpc`) is mocked
 * with a small in-memory per-channel program, mirroring `keyringTokenStore.test.ts`'s
 * convention, so each test can script a resolve/reject outcome and assert on exactly what was
 * called and returned.
 *
 * `jest.mock('electron', ...)` routes Jest's own module resolution at the REAL `electronStub.ts`
 * (mirrors `skeletonFlows.test.ts`/`electronUntouched.test.ts`'s three-way mock preamble) so
 * the dialog members' actual forwarding logic runs, not the generic backend-wide
 * `src/backend/__mocks__/electron.ts` manual mock. `jest.mock('os', ...)` keeps any import-time
 * path resolution inside electronStub.ts's module graph away from the developer's real config
 * directory (same gotcha `electronUntouched.test.ts`'s header documents).
 *
 * `shell.showItemInFolder` graduated from a D-04 logged no-op to real forwarding in Phase 33
 * Plan 04 (D-05) -- its coverage moved to `lifecycleStub.test.ts`, which mocks `requestRustInvoke`
 * for every test in that file (this file's D-04 describe block below only spies on
 * `console.warn`, so a call that now actually forwards would throw here).
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments as stripComments } from 'backend/testUtils/stripSourceComments'

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
// electronStub.ts's imports) -- its error paths use `console.warn` directly, spied on below.

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { clipboard, dialog } from '../electronStub'
import { requestRustInvoke } from '../sidecarRpc'
import {
  RUST_DIALOG_MESSAGE,
  RUST_DIALOG_OPEN,
  RUST_DIALOG_SAVE,
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
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('RUST_DIALOG_OPEN is a member of RUST_INVOKE_CHANNELS (so requestRustInvoke will emit, not pre-reject)', () => {
    expect(
      (RUST_INVOKE_CHANNELS as readonly string[]).includes(RUST_DIALOG_OPEN)
    ).toBe(true)
  })

  it('resolves { canceled: false, filePaths: [path] } when requestRustInvoke resolves a picked path', async () => {
    program = { type: 'resolve', value: '/Users/dev/Games' }

    const result = await dialog.showOpenDialog(undefined, {
      properties: ['openDirectory']
    })

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
})

describe('electronStub dialog.showMessageBox (Phase 33 Plan 03, D-06/D-07 real multi-button)', () => {
  beforeEach(() => {
    program = null
    callLog = []
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
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
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('resolves { response: 0, checkboxChecked: false } when requestRustInvoke resolves true (buttons[0] clicked)', async () => {
    program = { type: 'resolve', value: true }

    await expect(
      dialog.showMessageBox(undefined, {
        type: 'warning',
        title: 'Force uninstall?',
        message: 'This will delete local files',
        buttons: ['Confirm', 'Cancel'],
        cancelId: 1
      })
    ).resolves.toEqual({ response: 0, checkboxChecked: false })
    expect(callLog.some((entry) => entry.channel === RUST_DIALOG_MESSAGE)).toBe(
      true
    )
  })

  it('resolves { response: 1, checkboxChecked: false } when requestRustInvoke resolves false (buttons[1] clicked)', async () => {
    program = { type: 'resolve', value: false }

    await expect(
      dialog.showMessageBox(undefined, {
        type: 'warning',
        title: 'Force uninstall?',
        message: 'This will delete local files',
        buttons: ['Confirm', 'Cancel'],
        cancelId: 1
      })
    ).resolves.toEqual({ response: 1, checkboxChecked: false })
  })

  it('fails safe to the caller-declared cancelId 0 on transport rejection (askForceUninstall shape: destructive is buttons[1])', async () => {
    program = {
      type: 'reject',
      error: new Error('rustInvoke: timeout')
    }

    await expect(
      dialog.showMessageBox(undefined, {
        buttons: [i18nLike('box.no'), i18nLike('box.yes')],
        cancelId: 0
      })
    ).resolves.toEqual({ response: 0, checkboxChecked: false })
  })

  it('fails safe to the caller-declared cancelId 1 on transport rejection (promptI386Recovery shape: destructive is buttons[0])', async () => {
    program = {
      type: 'reject',
      error: new Error('rustInvoke: timeout')
    }

    await expect(
      dialog.showMessageBox(undefined, {
        buttons: [
          i18nLike('box.steam.mac32Detected.confirm'),
          i18nLike('box.cancel')
        ],
        cancelId: 1
      })
    ).resolves.toEqual({ response: 1, checkboxChecked: false })
  })

  it('never rejects/throws on transport error -- the returned promise always resolves', async () => {
    program = {
      type: 'reject',
      error: new Error('rustInvoke: channel not allowed: dialog_message')
    }

    await expect(
      dialog.showMessageBox(undefined, {
        buttons: ['Confirm', 'Cancel'],
        cancelId: 1
      })
    ).resolves.toBeDefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [warningArg] = warnSpy.mock.calls[0]
    expect(String(warningArg)).toContain('showMessageBox')
  })

  it('showMessageBoxSync still logs and defaults to 0 (no-op unchanged)', () => {
    const result = dialog.showMessageBoxSync()

    expect(result).toBe(0)
  })
})

// Small local stand-in so this test file doesn't need a real i18next dependency -- these tests
// only care about button LABELS being opaque strings, not their translated content.
function i18nLike(key: string): string {
  return key
}

describe('electronStub dialog.showErrorBox (Phase 31 Plan 02, D-03/REQ-31-03)', () => {
  beforeEach(() => {
    program = null
    callLog = []
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
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
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('RUST_DIALOG_MESSAGE is a member of RUST_INVOKE_CHANNELS', () => {
    expect(
      (RUST_INVOKE_CHANNELS as readonly string[]).includes(RUST_DIALOG_MESSAGE)
    ).toBe(true)
  })

  it('forwards to RUST_DIALOG_MESSAGE with an error kind and resolves undefined', async () => {
    program = { type: 'resolve', value: true }

    const result = await dialog.showErrorBox('Title', 'Content')

    expect(result).toBeUndefined()
    expect(callLog).toHaveLength(1)
    expect(callLog[0].channel).toBe(RUST_DIALOG_MESSAGE)
    expect(callLog[0].args[0]).toMatchObject({ kind: 'error' })
  })

  it('never throws and warns when requestRustInvoke rejects', async () => {
    program = { type: 'reject', error: new Error('rustInvoke: timeout') }

    await expect(
      dialog.showErrorBox('Title', 'Content')
    ).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [warningArg] = warnSpy.mock.calls[0]
    expect(String(warningArg)).toContain(RUST_DIALOG_MESSAGE)
  })
})

describe('electronStub dialog.showSaveDialog (Phase 31 Plan 02, D-03/REQ-31-03)', () => {
  beforeEach(() => {
    program = null
    callLog = []
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
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
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('RUST_DIALOG_SAVE is a member of RUST_INVOKE_CHANNELS', () => {
    expect(
      (RUST_INVOKE_CHANNELS as readonly string[]).includes(RUST_DIALOG_SAVE)
    ).toBe(true)
  })

  it('maps a picked path to { canceled: false, filePath } and forwards via RUST_DIALOG_SAVE', async () => {
    program = { type: 'resolve', value: '/Users/dev/save.json' }

    const result = await dialog.showSaveDialog(undefined, {
      defaultPath: 'save.json'
    })

    expect(result).toEqual({
      canceled: false,
      filePath: '/Users/dev/save.json'
    })
    expect(callLog).toEqual([
      { channel: RUST_DIALOG_SAVE, args: [{ defaultPath: 'save.json' }] }
    ])
  })

  it('maps a null (cancelled) result to { canceled: true, filePath: undefined }', async () => {
    program = { type: 'resolve', value: null }

    const result = await dialog.showSaveDialog(undefined, {})

    expect(result).toEqual({ canceled: true, filePath: undefined })
  })

  it('resolves { canceled: true } and warns (never throws) when requestRustInvoke rejects', async () => {
    program = { type: 'reject', error: new Error('rustInvoke: timeout') }

    await expect(dialog.showSaveDialog(undefined, {})).resolves.toEqual({
      canceled: true,
      filePath: undefined
    })
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [warningArg] = warnSpy.mock.calls[0]
    expect(String(warningArg)).toContain(RUST_DIALOG_SAVE)
  })
})

describe('electronStub dialog Sync members stay logged no-ops (D-03)', () => {
  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('showMessageBoxSync stays a logged no-op returning the documented safe default', () => {
    expect(dialog.showMessageBoxSync()).toBe(0)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('showOpenDialogSync stays a logged no-op returning the documented safe default', () => {
    expect(dialog.showOpenDialogSync()).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})

// `shell.showItemInFolder`'s D-04 coverage was here until Phase 33 Plan 04 graduated it to real
// forwarding (D-05) -- see `lifecycleStub.test.ts` for its current coverage. `clipboard.writeText`
// followed the same path in Phase 34.3 Plan 05 (D-01/D-03) -- see `lifecycleStub.test.ts`'s
// `electronStub clipboard.writeText real forwarding` describe block for its current coverage.
// `clipboard.readText` did NOT graduate (D-04): it stays a documented, deliberately-dead
// synchronous no-op, so its assertion remains here rather than being deleted.
describe('electronStub clipboard — D-04 no-op GRADUATED to real forwarding (Phase 34.3 Plan 05, REQ-34.3-03/04)', () => {
  it("clipboard.readText() still returns '' synchronously and is documented-dead (REQ-34.3-04)", () => {
    expect(clipboard.readText()).toBe('')
  })
})

// ── By-construction gate (mirrors electronUntouched.test.ts's stripped-source idiom): proves
// notify()'s no-op branch is logged rather than silent, without importing dialog.ts's heavier
// getMainWindow()/sendFrontendMessage() import chain into this lightweight sidecar suite.
describe('backend/dialog/dialog.ts notify() logged no-op (REQ-30-07/D-09)', () => {
  it('the else branch alongside isSteamDeckGameMode calls logInfo (comments stripped)', () => {
    const src = readFileSync(join(__dirname, '../../dialog/dialog.ts'), 'utf-8')
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

// Comment-stripping now delegates to the shared
// `backend/testUtils/stripSourceComments` util (strips block comments first,
// then the line-prefix filter), imported above as `stripComments`.
