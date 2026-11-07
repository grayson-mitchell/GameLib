// The frontend project runs in the node environment; the module registers window
// listeners at import, so provide a stub window before requiring it.
const stubAddEventListener = (): void => undefined
;(globalThis as unknown as { window: unknown }).window = {
  addEventListener: stubAddEventListener
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { classifyBootError } = require('../bootErrorSurface') as {
  classifyBootError: (
    m: string
  ) => 'unported' | 'invalid-args' | 'invalid-channel' | 'fatal'
}

describe('classifyBootError', () => {
  test('unported channel marker', () => {
    expect(classifyBootError('Error: [GAMELIB_UNPORTED_CHANNEL] foo')).toBe(
      'unported'
    )
  })
  test('invalid-args marker', () => {
    expect(
      classifyBootError(
        'IpcValidationError: [GAMELIB_IPC_INVALID_ARGS] {"code":"IPC_INVALID_ARGS"}'
      )
    ).toBe('invalid-args')
  })
  test('invalid-channel marker is warn-and-continue, not fatal', () => {
    expect(
      classifyBootError(
        'Error: [GAMELIB_IPC_INVALID_CHANNEL] channel not allowed: nope'
      )
    ).toBe('invalid-channel')
  })
  test('anything else is fatal', () => {
    expect(classifyBootError('TypeError: x is undefined')).toBe('fatal')
  })
})
