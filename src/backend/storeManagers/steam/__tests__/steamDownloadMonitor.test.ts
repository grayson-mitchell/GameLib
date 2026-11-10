jest.mock('backend/logger', () => ({
  LogPrefix: { Steam: 'Steam' },
  logWarning: jest.fn()
}))

import type {
  LongLivedHandle,
  LongLivedOptions,
  ProcessRunner
} from 'backend/process/types'
import { buildWatchdogSpawn } from '../childWatchdog'
import {
  createSteamDownloadMonitor,
  type MonitorDeps
} from '../steamDownloadMonitor'

const STARTED =
  '[x] AppID 43160 update started : download 0/8736151712, store 0/0 \r\n'
const STARTED_OTHER =
  '[x] AppID 238320 update started : download 0/2813215248, store 0/0 \r\n'

interface FakeSpawn {
  cmd: string
  argv: readonly string[]
  opts: LongLivedOptions
  kill: jest.Mock
  exit(): void
}

/** A runner whose spawnLongLived records each child and lets the test feed stdout / end it. */
function setup(over: Partial<MonitorDeps> & { tail?: string[] } = {}) {
  const spawns: FakeSpawn[] = []
  let t = 0
  const tails = [...(over.tail ?? [STARTED])]
  const runner: Pick<ProcessRunner, 'spawnLongLived'> = {
    spawnLongLived: (cmd, argv, opts) => {
      let resolveExit!: (v: {
        code: number | null
        signal: NodeJS.Signals | null
      }) => void
      const exited = new Promise<{
        code: number | null
        signal: NodeJS.Signals | null
      }>((r) => {
        resolveExit = r
      })
      const kill = jest.fn(() => true)
      spawns.push({
        cmd,
        argv,
        opts,
        kill,
        exit: () => resolveExit({ code: 0, signal: null })
      })
      const handle: LongLivedHandle = {
        id: opts.id,
        pid: undefined,
        exited,
        closed: exited.then(() => undefined),
        kill,
        unregister: () => undefined
      }
      return handle
    }
  }
  const deps: MonitorDeps = {
    runner,
    platform: 'darwin',
    listPids: async () => [900, 500],
    readTail: () => ({ text: tails.shift() ?? '', offset: 1 }),
    now: () => (t += 1000),
    parentPid: 4242,
    ...over
  }
  const monitor = createSteamDownloadMonitor(deps)
  const feed = (n: number, chunk: string) =>
    spawns[n]?.opts.onStdout?.(chunk, {
      pid: undefined,
      exitCode: null,
      signalCode: null,
      kill: () => false
    })
  return { monitor, spawns, feed }
}

const block = (rows: Record<string, number>) =>
  ',bytes_in,\r\n' +
  Object.entries(rows)
    .map(([f, v]) => `tcp4 ${f},${v},\r\n`)
    .join('')

describe('steamDownloadMonitor', () => {
  it('spawns the watchdog around script/nettop for the lowest pid as a long-lived child with no env', async () => {
    const { monitor, spawns } = setup()
    await monitor.start('43160')
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
    expect(spawns).toHaveLength(1)
    expect(spawns[0]?.cmd).toBe('/bin/sh')
    expect(spawns[0]?.argv).toEqual(buildWatchdogSpawn(4242, 500, inner).args)
    expect(spawns[0]?.opts).toMatchObject({
      id: 'steam-download-monitor:43160',
      stdio: 'pipe'
    })
    expect(spawns[0]?.opts).not.toHaveProperty('env')
    // D-10: an app-lifetime child has no timeout and the monitor never unrefs it itself.
    expect(spawns[0]?.opts).not.toHaveProperty('timeoutMs')
  })

  it('is idempotent per appId', async () => {
    const { monitor, spawns } = setup()
    await Promise.all([monitor.start('43160'), monitor.start('43160')])
    expect(spawns).toHaveLength(1)
  })

  it.each([
    ['non-darwin', { platform: 'linux' as NodeJS.Platform }],
    ['no pids', { listPids: async () => [] }],
    ['unknown pids', { listPids: async () => undefined }]
  ])('does not spawn: %s', async (_n, over) => {
    const { monitor, spawns } = setup(over)
    await monitor.start('43160')
    expect(spawns).toHaveLength(0)
    expect(monitor.read('43160')).toBeUndefined()
  })

  it('reads bytes and speed from two blocks plus the log anchor', async () => {
    const { monitor, feed } = setup()
    await monitor.start('43160')
    feed(0, block({ 'a<->b': 1000 }))
    expect(monitor.read('43160')).toBeUndefined() // one block
    feed(0, block({ 'a<->b': 3000, 'c<->d': 500 }))
    feed(0, block({ 'a<->b': 4000, 'c<->d': 500 }))
    const r = monitor.read('43160')!
    expect(r.bytesTotal).toBe(8736151712)
    expect(r.bytesDone).toBe(2000 + 500 + 1000)
    expect(r.speedBytesPerSec).toBeGreaterThan(0)
  })

  it('returns undefined with no active update or with two active updates', async () => {
    const none = setup({ tail: [''] })
    await none.monitor.start('43160')
    none.feed(0, block({ x: 1 }) + block({ x: 2 }))
    expect(none.monitor.read('43160')).toBeUndefined()

    const two = setup({ tail: [STARTED + STARTED_OTHER] })
    await two.monitor.start('43160')
    two.feed(0, block({ x: 1 }) + block({ x: 2 }))
    expect(two.monitor.read('43160')).toBeUndefined()
  })

  it('ignores a ghost update from before the last Steam client start (284100 shape)', async () => {
    const ghost =
      '[2026-10-25 21:38:12] AppID 284100 update started : download 0/223021728, store 0/0 \r\n'
    const boot = '[2026-11-03 19:49:43] Client version: 1792618285\r\n'
    const live =
      '[2026-11-05 17:29:38] AppID 333300 update started : download 0/5000, store 0/0 \r\n'
    const { monitor, feed } = setup({ tail: [ghost + boot + live] })
    await monitor.start('333300')
    feed(0, block({ x: 1 }) + block({ x: 2 }))
    feed(0, block({ x: 502 }))
    const r = monitor.read('333300')!
    expect(r.bytesTotal).toBe(5000)
    expect(r.bytesDone).toBe(501)
  })

  it('keeps this app anchor that predates the monitor (boot re-armed poll)', async () => {
    const boot = '[x] Client version: 1\r\n'
    const { monitor, feed } = setup({
      tail: [boot + STARTED],
      now: () => 1
    })
    await monitor.start('43160')
    feed(0, block({ x: 1 }) + block({ x: 2 }))
    expect(monitor.read('43160')?.bytesTotal).toBe(8736151712)
  })

  it('still falls back for a genuine concurrent pair in the same client session', async () => {
    const boot = '[x] Client version: 1\r\n'
    const { monitor, feed } = setup({ tail: [boot + STARTED_OTHER + STARTED] })
    await monitor.start('43160')
    feed(0, block({ x: 1 }) + block({ x: 2 }))
    expect(monitor.read('43160')).toBeUndefined()
  })

  it('falls back after the child exits', async () => {
    const { monitor, spawns, feed } = setup()
    await monitor.start('43160')
    feed(0, block({ x: 1 }) + block({ x: 2 }))
    expect(monitor.read('43160')).toBeDefined()
    spawns[0]?.exit()
    await Promise.resolve()
    await Promise.resolve()
    expect(monitor.read('43160')).toBeUndefined()
  })

  it('stop sends SIGTERM (the watchdog traps it) and stopAll stops every live monitor', async () => {
    const { monitor, spawns } = setup({ tail: [STARTED, STARTED] })
    await monitor.start('43160')
    monitor.stop('43160')
    expect(spawns[0]?.kill).toHaveBeenCalledWith('SIGTERM')
    expect(monitor.read('43160')).toBeUndefined()

    await monitor.start('1')
    await monitor.start('2')
    monitor.stopAll()
    expect(spawns[1]?.kill).toHaveBeenCalled()
    expect(spawns[2]?.kill).toHaveBeenCalled()
  })

  it('stop during pid lookup prevents the spawn', async () => {
    const { monitor, spawns } = setup()
    const p = monitor.start('43160')
    monitor.stop('43160')
    await p
    expect(spawns).toHaveLength(0)
  })
})
