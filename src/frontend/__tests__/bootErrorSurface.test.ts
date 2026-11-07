// The frontend project runs in the node environment; the module registers window
// listeners at import, so provide a stub window before requiring it.
const stubAddEventListener = (): void => undefined
;(globalThis as unknown as { window: unknown }).window = {
  addEventListener: stubAddEventListener
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { classifyBootError } = require('../bootErrorSurface') as {
  classifyBootError: (m: string) => 'unported' | 'invalid-args' | 'fatal'
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
  test('anything else is fatal', () => {
    expect(classifyBootError('TypeError: x is undefined')).toBe('fatal')
  })
})
