import { spawnAsync } from 'backend/utils'
import { logInfo, logWarning } from 'backend/logger'
import {
  raiseWineGameWindow,
  windowsExeNameFromCommand,
  __stopWineWindowRaises
} from '../wineWindowRaise'

jest.mock('backend/utils', () => ({ spawnAsync: jest.fn() }))
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('backend/constants/environment', () => ({ isMac: true }))

const mockedSpawn = spawnAsync as jest.Mock
const mockedInfo = logInfo as jest.Mock
const mockedWarn = logWarning as jest.Mock
const ok = (stdout: string) => ({ stdout, stderr: '', code: 0 })

describe('wineWindowRaise', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    __stopWineWindowRaises()
    expect(jest.getTimerCount()).toBe(0)
    jest.useRealTimers()
  })

  test('no-op off macOS', async () => {
    const env = jest.requireMock('backend/constants/environment')
    env.isMac = false
    try {
      await raiseWineGameWindow({ context: 'c', pids: ['1'] })
      expect(mockedSpawn).not.toHaveBeenCalled()
    } finally {
      env.isMac = true
    }
  })

  test('hit: pid passed as separate argv, one settle re-raise', async () => {
    mockedSpawn.mockResolvedValue(ok('Avernum 6.exe pid=123'))
    const p = raiseWineGameWindow({
      context: 'bridge:1',
      pids: ['123'],
      processNames: ['Avernum 6.exe']
    })
    await jest.advanceTimersByTimeAsync(0)
    expect(mockedSpawn).toHaveBeenCalledTimes(1)
    const [cmd, args] = mockedSpawn.mock.calls[0]
    expect(cmd).toBe('osascript')
    expect(args.slice(2)).toEqual(['1', '123', 'Avernum 6.exe'])
    expect(args[1]).not.toContain('123')
    expect(mockedInfo).toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(2500)
    await p
    expect(mockedSpawn).toHaveBeenCalledTimes(2)
  })

  test('miss then hit', async () => {
    mockedSpawn
      .mockResolvedValueOnce(ok('none'))
      .mockResolvedValue(ok('X.exe pid=5'))
    const p = raiseWineGameWindow({ context: 'c', pids: ['5'] })
    await jest.advanceTimersByTimeAsync(1500)
    expect(mockedSpawn).toHaveBeenCalledTimes(2)
    await jest.advanceTimersByTimeAsync(2500)
    await p
    expect(mockedSpawn).toHaveBeenCalledTimes(3)
  })

  test('persistent miss stops at 12 attempts with one warning', async () => {
    mockedSpawn.mockResolvedValue(ok('none'))
    const p = raiseWineGameWindow({ context: 'c', pids: ['5'] })
    await jest.advanceTimersByTimeAsync(1500 * 20)
    await p
    expect(mockedSpawn).toHaveBeenCalledTimes(12)
    expect(mockedWarn).toHaveBeenCalledTimes(1)
  })

  test('spawn rejection is logged and loop continues', async () => {
    mockedSpawn
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(ok('X.exe pid=5'))
    const p = raiseWineGameWindow({ context: 'c', pids: ['5'] })
    await jest.advanceTimersByTimeAsync(1500)
    expect(mockedWarn).toHaveBeenCalledTimes(1)
    expect(mockedSpawn).toHaveBeenCalledTimes(2)
    await jest.advanceTimersByTimeAsync(2500)
    await expect(p).resolves.toBeUndefined()
  })

  test('non-numeric pids dropped; names only as argv', async () => {
    mockedSpawn.mockResolvedValue(ok('none'))
    const p = raiseWineGameWindow({
      context: 'c',
      pids: ['12; do shell script'],
      processNames: ['a"b.exe']
    })
    await jest.advanceTimersByTimeAsync(0)
    const args = mockedSpawn.mock.calls[0][1]
    expect(args.slice(2)).toEqual(['0', 'a"b.exe'])
    expect(args[1]).not.toContain('a"b.exe')
    __stopWineWindowRaises()
    void p // cleared timers never resolve; do not await
  })

  test('only invalid pids and no names: no spawn', async () => {
    await raiseWineGameWindow({ context: 'c', pids: ['x'] })
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
    const p = raiseWineGameWindow({ context: 'c', pids: ['5'] })
    await jest.advanceTimersByTimeAsync(0)
    expect(mockedSpawn).toHaveBeenCalledTimes(1)
    __stopWineWindowRaises()
    await jest.advanceTimersByTimeAsync(10000)
    expect(mockedSpawn).toHaveBeenCalledTimes(1)
    void p
  })
})
