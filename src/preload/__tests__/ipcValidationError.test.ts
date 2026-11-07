jest.mock('../tauriTransport', () => ({
  invoke: jest.fn(),
  send: jest.fn(),
  listen: jest.fn()
}))

import { invoke } from '../tauriTransport'
import { IpcValidationError } from '../ipcValidationError'
import { makeHandlerInvoker } from '../ipc'

const MARKER =
  '[GAMELIB_IPC_INVALID_ARGS] {"code":"IPC_INVALID_ARGS","channel":"pathExists","paths":["0"],"codes":["invalid_type"]}'

const mockInvoke = invoke as unknown as jest.Mock

describe('IpcValidationError.fromRejection', () => {
  test('parses an Error carrying the marker', () => {
    const e = IpcValidationError.fromRejection(new Error(MARKER))
    expect(e).toBeInstanceOf(IpcValidationError)
    expect(e).toBeInstanceOf(Error)
    expect(e?.name).toBe('IpcValidationError')
    expect(e?.code).toBe('IPC_INVALID_ARGS')
    expect(e?.channel).toBe('pathExists')
    expect(e?.paths).toEqual(['0'])
    expect(e?.codes).toEqual(['invalid_type'])
  })

  test('parses a plain string rejection', () => {
    const e = IpcValidationError.fromRejection(MARKER)
    expect(e?.channel).toBe('pathExists')
  })

  test('returns null for unported marker, malformed tail and non-string', () => {
    expect(IpcValidationError.fromRejection('[GAMELIB_UNPORTED_CHANNEL] x')).toBeNull()
    expect(IpcValidationError.fromRejection('[GAMELIB_IPC_INVALID_ARGS] {nope')).toBeNull()
    expect(IpcValidationError.fromRejection(42)).toBeNull()
    expect(IpcValidationError.fromRejection({ message: MARKER })).toBeNull()
  })
})

describe('makeHandlerInvoker', () => {
  beforeEach(() => mockInvoke.mockReset())

  test('rejects with IpcValidationError on the marker', async () => {
    mockInvoke.mockRejectedValue(MARKER)
    const fn = makeHandlerInvoker('pathExists' as never) as () => Promise<unknown>
    await expect(fn()).rejects.toBeInstanceOf(IpcValidationError)
  })

  test('passes other rejections through unchanged', async () => {
    const boom = new Error('boom')
    mockInvoke.mockRejectedValue(boom)
    const fn = makeHandlerInvoker('pathExists' as never) as () => Promise<unknown>
    await expect(fn()).rejects.toBe(boom)
  })

  test('resolves unchanged', async () => {
    mockInvoke.mockResolvedValue({ ok: 1 })
    const fn = makeHandlerInvoker('pathExists' as never) as () => Promise<unknown>
    await expect(fn()).resolves.toEqual({ ok: 1 })
  })
})
