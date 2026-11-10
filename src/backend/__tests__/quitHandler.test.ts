import { createQuitHandler, type QuitHandlerDeps } from '../quitHandler'
import {
  __resetLongLivedChildrenForTests,
  registerLongLivedChild,
  shutdownLongLivedChildren
} from '../longLivedChildren'

function setup(
  over: Partial<QuitHandlerDeps> = {},
  response = 1
): {
  calls: string[]
  dialogs: Record<string, unknown>[]
  deps: QuitHandlerDeps
} {
  const calls: string[] = []
  const dialogs: Record<string, unknown>[] = []
  const deps: QuitHandlerDeps = {
    runner: {
      killAllTracked: () => (calls.push('runner.kill'), 0),
      teardownAll: () => void calls.push('runner.teardown')
    },
    legacyChildren: {
      killAllTracked: () => void calls.push('legacy.kill'),
      shutdownLongLivedChildren: () => void calls.push('legacy.shutdown')
    },
    isLocked: () => false,
    isRunning: () => false,
    isBridgeHosting: () => false,
    getMainWindow: () => ({ hide: () => void calls.push('hide') }),
    showMessageBox: async (_w, opts) => {
      dialogs.push(opts as unknown as Record<string, unknown>)
      calls.push('dialog')
      return { response }
    },
    t: (_k, fallback) => fallback,
    abortAll: () => void calls.push('abort'),
    releaseSteam: async () => void calls.push('releaseSteam'),
    deletePresence: async () => void calls.push('presence'),
    exit: () => void calls.push('exit'),
    ...over
  }
  return { calls, dialogs, deps }
}

describe('createQuitHandler', () => {
  test('nothing pending: no dialog, teardown order, no kill', async () => {
    const { calls, deps } = setup()
    await createQuitHandler(deps).handleExit()
    expect(calls).toEqual([
      'hide',
      'releaseSteam',
      'presence',
      'runner.teardown',
      'legacy.shutdown',
      'exit'
    ])
  })

  test('pending and the user answers No: returns before any teardown', async () => {
    const { calls, deps } = setup({ isLocked: () => true }, 0)
    await createQuitHandler(deps).handleExit()
    expect(calls).toEqual(['dialog'])
  })

  test('pending and Yes: dialog with cancelId 0, then the full ordered teardown', async () => {
    const { calls, dialogs, deps } = setup({ isRunning: () => true }, 1)
    await createQuitHandler(deps).handleExit()
    expect(dialogs[0].cancelId).toBe(0)
    expect(calls).toEqual([
      'dialog',
      'runner.kill',
      'legacy.kill',
      'abort',
      'hide',
      'releaseSteam',
      'presence',
      'runner.teardown',
      'legacy.shutdown',
      'exit'
    ])
  })

  test('bridge hosting only: bridge-hosting message', async () => {
    const { dialogs, deps } = setup({ isBridgeHosting: () => true }, 0)
    await createQuitHandler(deps).handleExit()
    expect(String(dialogs[0].message)).toMatch(/Steam bridge/)
  })

  test('pending operations: generic message', async () => {
    const { dialogs, deps } = setup(
      { isBridgeHosting: () => true, isLocked: () => true },
      0
    )
    await createQuitHandler(deps).handleExit()
    expect(String(dialogs[0].message)).toMatch(/pending operations/)
  })

  test('no main window: no dialog, still tears down', async () => {
    const { calls, deps } = setup({
      isLocked: () => true,
      getMainWindow: () => null
    })
    await createQuitHandler(deps).handleExit()
    expect(calls).not.toContain('dialog')
    expect(calls).toContain('exit')
  })

  describe('both registries while both exist (deleted by plan 27)', () => {
    afterEach(() => __resetLongLivedChildrenForTests())

    test('a quit tears down the runner and the real legacy long-lived registry', async () => {
      const { calls, deps } = setup({
        legacyChildren: {
          killAllTracked: () => void calls.push('legacy.kill'),
          // The real export. Its trailing logInfo needs an initialised log writer, which would
          // write to the operator's real log path; every teardown has already run by then, so
          // the logger TypeError is swallowed rather than initialising the writer.
          shutdownLongLivedChildren: () => {
            try {
              shutdownLongLivedChildren()
            } catch (error) {
              if (!(error instanceof TypeError)) throw error
            }
          }
        }
      })
      registerLongLivedChild('comet', () => void calls.push('comet.teardown'))
      await createQuitHandler(deps).handleExit()
      expect(calls).toContain('runner.teardown')
      expect(calls).toContain('comet.teardown')
    })
  })
})
