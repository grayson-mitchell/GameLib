import { EventEmitter } from 'node:events'

jest.mock('backend/logger', () => ({
  LogPrefix: { Steam: 'Steam' },
  logWarning: jest.fn()
}))
jest.mock('../steamClientProcess', () => ({ listSteamClientPids: jest.fn() }))

import { buildWatchdogSpawn } from '../childWatchdog'
import {
  readSteamDownloadMonitor,
  startSteamDownloadMonitor,
  stopAllSteamDownloadMonitors,
  stopSteamDownloadMonitor,
  type MonitorChild,
  type MonitorDeps
} from '../steamDownloadMonitor'

const STARTED =
  '[x] AppID 43160 update started : download 0/8736151712, store 0/0 \r\n'
const STARTED_OTHER =
  '[x] AppID 238320 update started : download 0/2813215248, store 0/0 \r\n'

class FakeChild extends EventEmitter {
  stdout = Object.assign(new EventEmitter(), { unref: jest.fn() })
  kill = jest.fn()
  unref = jest.fn()
}

function setup(over: Partial<MonitorDeps> & { tail?: string[] } = {}) {
  const child = new FakeChild()
  let t = 0
  const tails = [...(over.tail ?? [STARTED])]
  const spawnFn = jest.fn(() => child as unknown as MonitorChild)
  const deps: MonitorDeps = {
    platform: 'darwin',
    listPids: async () => [900, 500],
    spawn: spawnFn,
    readTail: () => ({ text: tails.shift() ?? '', offset: 1 }),
    now: () => (t += 1000),
    parentPid: 4242,
    ...over
  }
  return { child, deps, spawnFn }
}

const block = (rows: Record<string, number>) =>
  ',bytes_in,\r\n' +
  Object.entries(rows)
    .map(([f, v]) => `tcp4 ${f},${v},\r\n`)
    .join('')

afterEach(() => stopAllSteamDownloadMonitors())

describe('steamDownloadMonitor', () => {
  it('spawns the watchdog around script/nettop for the lowest pid with no env, and unrefs', async () => {
    const { deps, spawnFn, child } = setup()
    await startSteamDownloadMonitor('43160', deps)
    const inner = [
      '/usr/bin/script',
      '-q',
      '/dev/null',
      '/usr/bin/nettop',
      '-x',
      '-n',
      '-L',
      '0',
      '-s',
      '1',
      '-J',
      'bytes_in',
      '-p',
      '500'
    ]
    expect(spawnFn).toHaveBeenCalledWith(
      '/bin/sh',
      buildWatchdogSpawn(4242, 500, inner).args,
      { stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const opts = (spawnFn.mock.calls[0] as unknown[])[2] as object
    expect(opts).not.toHaveProperty('env')
    expect(child.unref).toHaveBeenCalled()
    expect(child.stdout.unref).toHaveBeenCalled()
  })

  it('is idempotent per appId', async () => {
    const { deps, spawnFn } = setup()
    await Promise.all([
      startSteamDownloadMonitor('43160', deps),
      startSteamDownloadMonitor('43160', deps)
    ])
    expect(spawnFn).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['non-darwin', { platform: 'linux' as NodeJS.Platform }],
    ['no pids', { listPids: async () => [] }],
    ['unknown pids', { listPids: async () => undefined }]
  ])('does not spawn: %s', async (_n, over) => {
    const { deps, spawnFn } = setup(over)
    await startSteamDownloadMonitor('43160', deps)
    expect(spawnFn).not.toHaveBeenCalled()
    expect(readSteamDownloadMonitor('43160')).toBeUndefined()
  })

  it('reads bytes and speed from two blocks plus the log anchor', async () => {
    const { deps, child } = setup()
    await startSteamDownloadMonitor('43160', deps)
    child.stdout.emit('data', block({ 'a<->b': 1000 }))
    expect(readSteamDownloadMonitor('43160')).toBeUndefined() // one block
    child.stdout.emit('data', block({ 'a<->b': 3000, 'c<->d': 500 }))
    child.stdout.emit('data', block({ 'a<->b': 4000, 'c<->d': 500 }))
    const r = readSteamDownloadMonitor('43160')!
    expect(r.bytesTotal).toBe(8736151712)
    expect(r.bytesDone).toBe(2000 + 500 + 1000)
    expect(r.speedBytesPerSec).toBeGreaterThan(0)
  })

  it('returns undefined with no active update or with two active updates', async () => {
    const none = setup({ tail: [''] })
    await startSteamDownloadMonitor('43160', none.deps)
    none.child.stdout.emit('data', block({ x: 1 }) + block({ x: 2 }))
    expect(readSteamDownloadMonitor('43160')).toBeUndefined()
    stopAllSteamDownloadMonitors()

    const two = setup({ tail: [STARTED + STARTED_OTHER] })
    await startSteamDownloadMonitor('43160', two.deps)
    two.child.stdout.emit('data', block({ x: 1 }) + block({ x: 2 }))
    expect(readSteamDownloadMonitor('43160')).toBeUndefined()
  })

  it('ignores a ghost update from before the last Steam client start (284100 shape)', async () => {
    const ghost =
      '[2026-10-25 21:38:12] AppID 284100 update started : download 0/223021728, store 0/0 \r\n'
    const boot = '[2026-11-03 19:49:43] Client version: 1792618285\r\n'
    const live =
      '[2026-11-05 17:29:38] AppID 333300 update started : download 0/5000, store 0/0 \r\n'
    const { deps, child } = setup({ tail: [ghost + boot + live] })
    await startSteamDownloadMonitor('333300', deps)
    child.stdout.emit('data', block({ x: 1 }) + block({ x: 2 }))
    child.stdout.emit('data', block({ x: 502 }))
    const r = readSteamDownloadMonitor('333300')!
    expect(r.bytesTotal).toBe(5000)
    expect(r.bytesDone).toBe(501)
  })

  it('keeps this app anchor that predates the monitor (boot re-armed poll)', async () => {
    const boot = '[x] Client version: 1\r\n'
    const { deps, child } = setup({
      tail: [boot + STARTED],
      now: () => 1
    })
    await startSteamDownloadMonitor('43160', deps)
    child.stdout.emit('data', block({ x: 1 }) + block({ x: 2 }))
    expect(readSteamDownloadMonitor('43160')?.bytesTotal).toBe(8736151712)
  })

  it('still falls back for a genuine concurrent pair in the same client session', async () => {
    const boot = '[x] Client version: 1\r\n'
    const { deps, child } = setup({ tail: [boot + STARTED_OTHER + STARTED] })
    await startSteamDownloadMonitor('43160', deps)
    child.stdout.emit('data', block({ x: 1 }) + block({ x: 2 }))
    expect(readSteamDownloadMonitor('43160')).toBeUndefined()
  })

  it('falls back after child error or exit', async () => {
    for (const ev of ['error', 'exit']) {
      const { deps, child } = setup()
      await startSteamDownloadMonitor('43160', deps)
      child.stdout.emit('data', block({ x: 1 }) + block({ x: 2 }))
      expect(readSteamDownloadMonitor('43160')).toBeDefined()
      child.emit(ev)
      expect(readSteamDownloadMonitor('43160')).toBeUndefined()
      stopAllSteamDownloadMonitors()
    }
  })

  it('stop and stopAll kill the child', async () => {
    const a = setup()
    await startSteamDownloadMonitor('43160', a.deps)
    stopSteamDownloadMonitor('43160')
    expect(a.child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(readSteamDownloadMonitor('43160')).toBeUndefined()

    const b = setup()
    const c = setup()
    await startSteamDownloadMonitor('1', b.deps)
    await startSteamDownloadMonitor('2', c.deps)
    stopAllSteamDownloadMonitors()
    expect(b.child.kill).toHaveBeenCalled()
    expect(c.child.kill).toHaveBeenCalled()
  })

  it('stop during pid lookup prevents the spawn', async () => {
    const { deps, spawnFn } = setup()
    const p = startSteamDownloadMonitor('43160', deps)
    stopSteamDownloadMonitor('43160')
    await p
    expect(spawnFn).not.toHaveBeenCalled()
  })
})
