/**
 * debug/shared-redist-slow-wine-calls: WineCommandArgs.resolveOnExit.
 *
 * Root cause: runWineCommand settled on the child's `close` event, which waits for every holder
 * of the piped stdout/stderr. The wineserver a wine call starts inherits those pipes and lingers
 * seconds after the command itself exited, so every call paid that extra time.
 *
 * The fake child below models exactly that: `exit` fires first, `close` only later (when the
 * grandchild releases the pipes). No real process is spawned, so no fake-HOME profile is needed.
 *
 * Mock implementations are assigned in beforeEach (jest.config.js sets resetMocks: true).
 */
import { EventEmitter } from 'events'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Backend: 'Backend' },
  getRunnerLogWriter: jest.fn(),
  createGameLogWriter: jest.fn()
}))

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  spawnSync: jest.fn(),
  exec: jest.fn(),
  execFile: jest.fn(),
  execSync: jest.fn()
}))

import { spawn } from 'child_process'
import { runWineCommand } from 'backend/launcher'
import type { GameSettings } from 'common/types'

class FakeStream extends EventEmitter {
  destroy = jest.fn()
  setEncoding() {
    return this
  }
}

class FakeChildProcess extends EventEmitter {
  killed = false
  stdout = new FakeStream()
  stderr = new FakeStream()
}

// /bin/sh exists on every platform this suite runs on, so validWine() accepts it.
const SETTINGS = {
  winePrefix: '/nonexistent-prefix',
  wineCrossoverBottle: 'GameLibSteamBridge-0',
  wineVersion: { type: 'crossover', name: 'fake', bin: '/bin/sh' }
} as unknown as GameSettings

const flush = () => new Promise<void>((r) => setImmediate(r))

let child: FakeChildProcess

beforeEach(() => {
  child = new FakeChildProcess()
  ;(spawn as unknown as jest.Mock).mockReturnValue(child)
})

function run(resolveOnExit?: boolean) {
  let settled = false
  const promise = runWineCommand({
    commandParts: ['reg', 'query', 'HKCU'],
    gameSettings: SETTINGS,
    wait: true,
    skipPrefixCheckIKnowWhatImDoing: true,
    ...(resolveOnExit === undefined ? {} : { resolveOnExit })
  }).then((r) => {
    settled = true
    return r
  })
  return { promise, isSettled: () => settled }
}

describe('runWineCommand resolveOnExit', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate'] }))
  afterEach(() => jest.useRealTimers())

  it('settles shortly after exit while a grandchild still holds the pipes (close never fires)', async () => {
    const { promise, isSettled } = run(true)
    await flush()

    child.stdout.emit('data', 'HKEY_CURRENT_USER\n')
    child.emit('exit', 0, null)
    await flush()
    expect(isSettled()).toBe(false) // still inside the drain grace

    jest.advanceTimersByTime(250)
    const res = await promise

    expect(res.stdout).toBe('HKEY_CURRENT_USER\n')
    expect(res.code).toBe(0)
    expect(child.stdout.destroy).toHaveBeenCalled()
    expect(child.stderr.destroy).toHaveBeenCalled()
  })

  it('settles exactly once when close arrives after the grace timer fired', async () => {
    const { promise } = run(true)
    await flush()

    child.emit('exit', 0, null)
    jest.advanceTimersByTime(250)
    const res = await promise
    child.emit('close', 0, null)
    await flush()

    expect(res.code).toBe(0)
  })

  it('an early close settles without waiting for the grace timer', async () => {
    const { promise } = run(true)
    await flush()

    child.emit('exit', 0, null)
    child.emit('close', 0, null)
    const res = await promise

    expect(res.code).toBe(0)
    expect(child.stdout.destroy).not.toHaveBeenCalled()
  })

  it('default: exit alone never settles; only close does', async () => {
    const { promise, isSettled } = run()
    await flush()

    child.emit('exit', 0, null)
    jest.advanceTimersByTime(60_000)
    await flush()
    expect(isSettled()).toBe(false)
    expect(child.stdout.destroy).not.toHaveBeenCalled()

    child.emit('close', 0, null)
    const res = await promise
    expect(res.code).toBe(0)
  })

  it('resolveOnExit: false behaves as the default', async () => {
    const { promise, isSettled } = run(false)
    await flush()

    child.emit('exit', 0, null)
    jest.advanceTimersByTime(60_000)
    await flush()
    expect(isSettled()).toBe(false)

    child.emit('close', 0, null)
    await promise
  })
})
