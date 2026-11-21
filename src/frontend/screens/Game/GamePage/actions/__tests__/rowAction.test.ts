/**
 * Phase 100 (D-12): the row busy/failed machine and its never-throw failure
 * logging. No jsdom (testEnvironment: 'node'), so the reducer and the helpers
 * are called directly; `window.api` is a plain object of jest mocks.
 */
import {
  isInvokeTimeout,
  rowActionReducer,
  runRowAction,
  reportRowActionFailure,
  type RowActionEvent,
  type RowActionState
} from '../rowAction'

describe('rowActionReducer', () => {
  const idle: RowActionState = { phase: 'idle' }
  const busy: RowActionState = { phase: 'busy' }
  const failed: RowActionState = { phase: 'failed' }

  it.each<[string, RowActionState, RowActionEvent, string]>([
    ['idle + start', idle, { type: 'start' }, 'busy'],
    ['busy + succeed', busy, { type: 'succeed' }, 'idle'],
    ['busy + fail', busy, { type: 'fail' }, 'failed'],
    ['failed + start (retry)', failed, { type: 'start' }, 'busy'],
    ['failed + dismiss', failed, { type: 'dismiss' }, 'idle'],
    ['busy + release', busy, { type: 'release' }, 'idle']
  ])('%s -> %s', (_name, from, event, to) => {
    expect(rowActionReducer(from, event).phase).toBe(to)
  })

  it.each<[string, RowActionState, RowActionEvent]>([
    ['idle + succeed', idle, { type: 'succeed' }],
    ['idle + fail', idle, { type: 'fail' }],
    ['idle + dismiss', idle, { type: 'dismiss' }],
    ['busy + start', busy, { type: 'start' }],
    ['busy + dismiss', busy, { type: 'dismiss' }],
    ['failed + succeed', failed, { type: 'succeed' }],
    ['failed + fail', failed, { type: 'fail' }],
    ['idle + release', idle, { type: 'release' }],
    ['failed + release', failed, { type: 'release' }]
  ])('an event that does not apply (%s) returns the same state', (_n, s, e) => {
    expect(rowActionReducer(s, e)).toBe(s)
  })
})

describe('isInvokeTimeout (CR-02)', () => {
  it.each<[string, unknown, boolean]>([
    ['the shell string', 'sidecar invoke timed out: moveInstall', true],
    ['an Error wrapping it', new Error('sidecar invoke timed out: x'), true],
    ['an unrelated Error', new Error('rsync exited 23'), false],
    ['undefined', undefined, false],
    ['a number', 408, false]
  ])('%s -> %s', (_name, value, expected) => {
    expect(isInvokeTimeout(value)).toBe(expected)
  })
})

describe('reportRowActionFailure and runRowAction', () => {
  let logError: jest.Mock
  let logInfo: jest.Mock
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    logError = jest.fn()
    logInfo = jest.fn()
    const globalWithWindow = globalThis as unknown as { window?: unknown }
    if (!globalWithWindow.window) {
      globalWithWindow.window = {}
    }
    ;(globalThis as unknown as { window: { api: unknown } }).window.api = {
      logError,
      logInfo
    }
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('logs "<action> failed for <appName>: <stack>" and a console line, and shows no dialog', () => {
    const error = new Error('boom')
    reportRowActionFailure({ action: 'repair', appName: 'MyGame', error })

    expect(logError).toHaveBeenCalledTimes(1)
    const message = String(logError.mock.calls[0][0])
    expect(message.startsWith('repair failed for MyGame: ')).toBe(true)
    expect(message).toContain('boom')

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    const [line, second] = consoleErrorSpy.mock.calls[0] as [string, unknown]
    expect(line).toBe('repair failed for MyGame:')
    expect(second).toBe(error)
  })

  it('an error whose toString throws logs "<unstringifiable error>"', () => {
    const hostile = Object.create(null) as unknown
    reportRowActionFailure({
      action: 'repair',
      appName: 'MyGame',
      error: hostile
    })

    expect(String(logError.mock.calls[0][0])).toBe(
      'repair failed for MyGame: <unstringifiable error>'
    )
  })

  it('a throwing logError never throws and falls back to console.error', () => {
    logError.mockImplementation(() => {
      throw new Error('no transport')
    })

    expect(() =>
      reportRowActionFailure({
        action: 'repair',
        appName: 'MyGame',
        error: new Error('boom')
      })
    ).not.toThrow()
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2)
  })

  it('a throwing console.error does not stop logError', () => {
    consoleErrorSpy.mockImplementation(() => {
      throw new Error('console broken')
    })

    reportRowActionFailure({
      action: 'repair',
      appName: 'MyGame',
      error: new Error('boom')
    })

    expect(logError).toHaveBeenCalledTimes(1)
  })

  describe('runRowAction', () => {
    const types = (dispatch: jest.Mock) =>
      dispatch.mock.calls.map(([e]) => (e as RowActionEvent).type)

    it('resolved: start then succeed', async () => {
      const dispatch = jest.fn()
      await runRowAction({
        action: 'repair',
        appName: 'MyGame',
        run: async () => true,
        dispatch
      })

      expect(types(dispatch)).toEqual(['start', 'succeed'])
      expect(logError).not.toHaveBeenCalled()
    })

    it('rejected: fail, logs, and never rethrows', async () => {
      const dispatch = jest.fn()
      await expect(
        runRowAction({
          action: 'repair',
          appName: 'MyGame',
          run: async () => {
            throw new Error('transport down')
          },
          dispatch
        })
      ).resolves.toBeUndefined()

      expect(types(dispatch)).toEqual(['start', 'fail'])
      expect(logError).toHaveBeenCalledTimes(1)
      expect(String(logError.mock.calls[0][0])).toMatch(
        /^repair failed for MyGame: /
      )
    })

    it('a contradicting answer (isFailure true): fail and logged', async () => {
      const dispatch = jest.fn()
      await runRowAction({
        action: 'shortcuts',
        appName: 'MyGame',
        run: async () => false,
        isFailure: (result) => result !== true,
        dispatch
      })

      expect(types(dispatch)).toEqual(['start', 'fail'])
      expect(logError).toHaveBeenCalledTimes(1)
    })

    it('isFailure false: succeed', async () => {
      const dispatch = jest.fn()
      await runRowAction({
        action: 'shortcuts',
        appName: 'MyGame',
        run: async () => true,
        isFailure: (result) => result !== true,
        dispatch
      })

      expect(types(dispatch)).toEqual(['start', 'succeed'])
    })

    it('rejected while stillRunning holds: start then release, info log only (CR-02)', async () => {
      const dispatch = jest.fn()
      await expect(
        runRowAction({
          action: 'moveInstall',
          appName: 'MyGame',
          run: async () => {
            throw new Error('sidecar invoke timed out: moveInstall')
          },
          stillRunning: () => true,
          dispatch
        })
      ).resolves.toBeUndefined()

      expect(types(dispatch)).toEqual(['start', 'release'])
      expect(logInfo).toHaveBeenCalledTimes(1)
      expect(logError).not.toHaveBeenCalled()
    })

    it('rejected while stillRunning is false: start then fail, error logged', async () => {
      const dispatch = jest.fn()
      await runRowAction({
        action: 'moveInstall',
        appName: 'MyGame',
        run: async () => {
          throw new Error('boom')
        },
        stillRunning: () => false,
        dispatch
      })

      expect(types(dispatch)).toEqual(['start', 'fail'])
      expect(logError).toHaveBeenCalledTimes(1)
      expect(logInfo).not.toHaveBeenCalled()
    })

    it('a throwing logInfo during the hand-off still releases the row', async () => {
      logInfo.mockImplementation(() => {
        throw new Error('no transport')
      })
      const dispatch = jest.fn()
      await runRowAction({
        action: 'moveInstall',
        appName: 'MyGame',
        run: async () => {
          throw new Error('timeout')
        },
        stillRunning: () => true,
        dispatch
      })

      expect(types(dispatch)).toEqual(['start', 'release'])
    })

    it('a throwing logError does not make runRowAction throw', async () => {
      logError.mockImplementation(() => {
        throw new Error('no transport')
      })
      const dispatch = jest.fn()

      await expect(
        runRowAction({
          action: 'repair',
          appName: 'MyGame',
          run: async () => {
            throw new Error('boom')
          },
          dispatch
        })
      ).resolves.toBeUndefined()
      expect(types(dispatch)).toEqual(['start', 'fail'])
    })
  })
})
