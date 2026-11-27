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
    isGameRunning: async () => false,
    killTrackedRust: async () => (calls.push('rust.kill'), 0),
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
      'rust.kill',
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

  test('a running game alone opens the pending-operations dialog and Yes ends it through the Rust registry', async () => {
    const { calls, dialogs, deps } = setup(
      { isGameRunning: async () => true },
      1
    )
    await createQuitHandler(deps).handleExit()
    expect(dialogs).toHaveLength(1)
    expect(dialogs[0]).toMatchObject({
      buttons: ['No', 'Yes'],
      cancelId: 0,
      title: 'Exit',
      message: 'There are pending operations, are you sure?'
    })
    expect(calls.filter((c) => c === 'rust.kill')).toHaveLength(1)
    expect(calls).toEqual([
      'dialog',
      'runner.teardown',
      'runner.kill',
      'rust.kill',
      'abort',
      'releaseSteam',
      'presence',
      'runner.teardown',
      'exit'
    ])
  })

  test('No with a running game kills nothing and does not exit', async () => {
    const { calls, deps } = setup({ isGameRunning: async () => true }, 0)
    await createQuitHandler(deps).handleExit()
    expect(calls).toEqual(['dialog'])
  })

  test('a dismissal (the cancelId answer) with a running game kills nothing', async () => {
    let cancelId: number | undefined
    const { calls, deps } = setup({
      isGameRunning: async () => true,
      showMessageBox: async (opts) => {
        cancelId = opts.cancelId
        calls.push('dialog')
        return { response: opts.cancelId }
      }
    })
    await createQuitHandler(deps).handleExit()
    expect(cancelId).toBe(0)
    expect(calls).toEqual(['dialog'])
  })

  test('a rejected registry read is treated as a running game: the dialog still asks', async () => {
    const { calls, dialogs, deps } = setup(
      { isGameRunning: async () => Promise.reject(new Error('transport')) },
      0
    )
    await createQuitHandler(deps).handleExit()
    expect(dialogs).toHaveLength(1)
    expect(calls).toEqual(['dialog'])
  })

  test('a running game together with a lock shows the generic message', async () => {
    const { dialogs, deps } = setup(
      { isGameRunning: async () => true, isLocked: () => true },
      0
    )
    await createQuitHandler(deps).handleExit()
    expect(String(dialogs[0]!.message)).toMatch(/pending operations/)
  })

  test('a running game together with bridge hosting shows the generic message', async () => {
    const { dialogs, deps } = setup(
      { isGameRunning: async () => true, isBridgeHosting: () => true },
      0
    )
    await createQuitHandler(deps).handleExit()
    expect(String(dialogs[0]!.message)).toMatch(/pending operations/)
  })

  test('no game and no other condition: no dialog, no kill, and the quit exits as before', async () => {
    const { calls, dialogs, deps } = setup({ isGameRunning: async () => false })
    await createQuitHandler(deps).handleExit()
    expect(dialogs).toHaveLength(0)
    expect(calls).toEqual([
      'releaseSteam',
      'presence',
      'runner.teardown',
      'exit'
    ])
  })

  test('a failed Rust kill on Yes does not strand the quit: abortAll and exit still run', async () => {
    const { calls, deps } = setup(
      {
        isGameRunning: async () => true,
        killTrackedRust: async () => Promise.reject(new Error('shell gone'))
      },
      1
    )
    await createQuitHandler(deps).handleExit()
    expect(calls).toContain('abort')
    expect(calls[calls.length - 1]).toBe('exit')
  })
})
