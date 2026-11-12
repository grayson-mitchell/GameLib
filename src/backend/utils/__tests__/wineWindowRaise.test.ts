import { logInfo, logWarning } from 'backend/logger'
import {
  createWineWindowRaiser,
  windowsExeNameFromCommand,
  type WineWindowRaiser
} from '../wineWindowRaise'
import { createFakeClock, type FakeClock } from '../../testUtils/fakeClock'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('backend/constants/environment', () => ({ isMac: true }))

const mockedSpawn = jest.fn()
const deps = {
  spawnAsync: (...args: unknown[]) => mockedSpawn(...args)
} as unknown as Parameters<WineWindowRaiser['raise']>[0]
const mockedInfo = logInfo as jest.Mock
const mockedWarn = logWarning as jest.Mock
const ok = (stdout: string) => ({ stdout, stderr: '', code: 0 })

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

describe('wineWindowRaise', () => {
  let clock: FakeClock
  let raiser: WineWindowRaiser
  const raiseWineGameWindow: WineWindowRaiser['raise'] = (d, o) =>
    raiser.raise(d, o)
  /** Advance the injected clock in steps, flushing the raise loop's promises between them. */
  const advance = async (ms: number) => {
    await flush()
    for (let left = ms; left > 0; left -= 500) {
      clock.advance(Math.min(500, left))
      await flush()
    }
  }
  beforeEach(() => {
    clock = createFakeClock()
    raiser = createWineWindowRaiser({ clock })
  })
  afterEach(() => {
    raiser.stop()
    expect(clock.pendingCount()).toBe(0)
  })

  test('construction arms no timer and two raisers are independent', () => {
    expect(clock.pendingCount()).toBe(0)
    const other = createWineWindowRaiser({ clock })
    other.stop()
    expect(clock.pendingCount()).toBe(0)
  })

  test('no-op off macOS', async () => {
    const env = jest.requireMock('backend/constants/environment')
    env.isMac = false
    try {
      await raiseWineGameWindow(deps, { context: 'c', pids: ['1'] })
      expect(mockedSpawn).not.toHaveBeenCalled()
    } finally {
      env.isMac = true
    }
  })

  test('hit: pid passed as separate argv, one settle re-raise', async () => {
    mockedSpawn.mockResolvedValue(ok('Avernum 6.exe pid=123'))
    const p = raiseWineGameWindow(deps, {
      context: 'bridge:1',
      pids: ['123'],
      processNames: ['Avernum 6.exe']
    })
    await advance(0)
    expect(mockedSpawn).toHaveBeenCalledTimes(1)
    const [cmd, args] = mockedSpawn.mock.calls[0]
    expect(cmd).toBe('osascript')
    expect(args.slice(2)).toEqual(['1', '123', 'Avernum 6.exe'])
    expect(args[1]).not.toContain('123')
    expect(mockedInfo).toHaveBeenCalled()
    await advance(2500)
    await p
    expect(mockedSpawn).toHaveBeenCalledTimes(2)
  })

  test('miss then hit', async () => {
    mockedSpawn
      .mockResolvedValueOnce(ok('none'))
      .mockResolvedValue(ok('X.exe pid=5'))
    const p = raiseWineGameWindow(deps, { context: 'c', pids: ['5'] })
    await advance(1500)
    expect(mockedSpawn).toHaveBeenCalledTimes(2)
    await advance(2500)
    await p
    expect(mockedSpawn).toHaveBeenCalledTimes(3)
  })

  test('persistent miss stops at 12 attempts with one warning', async () => {
    mockedSpawn.mockResolvedValue(ok('none'))
    const p = raiseWineGameWindow(deps, { context: 'c', pids: ['5'] })
    await advance(1500 * 20)
    await p
    expect(mockedSpawn).toHaveBeenCalledTimes(12)
    expect(mockedWarn).toHaveBeenCalledTimes(1)
  })

  test('spawn rejection is logged and loop continues', async () => {
    mockedSpawn
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(ok('X.exe pid=5'))
    const p = raiseWineGameWindow(deps, { context: 'c', pids: ['5'] })
    await advance(1500)
    expect(mockedWarn).toHaveBeenCalledTimes(1)
    expect(mockedSpawn).toHaveBeenCalledTimes(2)
    await advance(2500)
    await expect(p).resolves.toBeUndefined()
  })

  test('non-numeric pids dropped; names only as argv', async () => {
    mockedSpawn.mockResolvedValue(ok('none'))
    const p = raiseWineGameWindow(deps, {
      context: 'c',
      pids: ['12; do shell script'],
      processNames: ['a"b.exe']
    })
    await advance(0)
    const args = mockedSpawn.mock.calls[0][1]
    expect(args.slice(2)).toEqual(['0', 'a"b.exe'])
    expect(args[1]).not.toContain('a"b.exe')
    raiser.stop()
    void p // cleared timers never resolve; do not await
  })

  test('only invalid pids and no names: no spawn', async () => {
    await raiseWineGameWindow(deps, { context: 'c', pids: ['x'] })
    expect(mockedSpawn).not.toHaveBeenCalled()
  })

  test('windowsExeNameFromCommand', () => {
    expect(
      windowsExeNameFromCommand('C:\\Games\\Avernum 6\\Avernum 6.exe -x')
    ).toBe('Avernum 6.exe')
    expect(windowsExeNameFromCommand('/usr/bin/foo')).toBeNull()
  })

  test('stop mid-loop halts further spawns', async () => {
    mockedSpawn.mockResolvedValue(ok('none'))
    const p = raiseWineGameWindow(deps, { context: 'c', pids: ['5'] })
    await advance(0)
    expect(mockedSpawn).toHaveBeenCalledTimes(1)
    raiser.stop()
    await advance(10000)
    expect(mockedSpawn).toHaveBeenCalledTimes(1)
    void p
  })
})
