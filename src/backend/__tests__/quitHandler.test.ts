import { createQuitHandler, type QuitHandlerDeps } from '../quitHandler'

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
    isLocked: () => false,
    isRunning: () => false,
    isBridgeHosting: () => false,
    showMessageBox: async (opts) => {
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
      'releaseSteam',
      'presence',
      'runner.teardown',
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
    expect(dialogs[0]!.cancelId).toBe(0)
    expect(calls).toEqual([
      'dialog',
      // A-WR-5: long-lived teardowns run BEFORE the raw tracked kill. The registry empties on
      // teardownAll, so the final call is a no-op in the real runner.
      'runner.teardown',
      'runner.kill',
      'abort',
      'releaseSteam',
      'presence',
      'runner.teardown',
      'exit'
    ])
  })

  test('bridge hosting only: bridge-hosting message', async () => {
    const { dialogs, deps } = setup({ isBridgeHosting: () => true }, 0)
    await createQuitHandler(deps).handleExit()
    expect(String(dialogs[0]!.message)).toMatch(/Steam bridge/)
  })

  test('pending operations: generic message', async () => {
    const { dialogs, deps } = setup(
      { isBridgeHosting: () => true, isLocked: () => true },
      0
    )
    await createQuitHandler(deps).handleExit()
    expect(String(dialogs[0]!.message)).toMatch(/pending operations/)
  })
})
