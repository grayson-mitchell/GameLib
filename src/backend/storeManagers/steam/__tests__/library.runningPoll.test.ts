/**
 * Unit tests for the running-app probe (readRunningAppId, readMacRunningAppId) and the
 * boot-built poller (createRunningPoll). Moved out of library.test.ts by Phase 65 plan 04
 * (D-03); rebuilt on a scripted runner and a fake clock by 66.2-06 (the poller and its last-id
 * state are closure state of an instance now, no child_process mock).
 */
import { existsSync, readFileSync } from 'graceful-fs'
import * as vdf from '@node-steam/vdf'
import { join, resolve, sep } from 'path'

import { createCaptureLog } from 'backend/testUtils/captureLog'
import { createFakeClock } from 'backend/testUtils/fakeClock'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import type { ScriptStep } from 'backend/testUtils/scriptedRunner'

import {
  createRunningPoll,
  readMacRunningAppId,
  readRunningAppId
} from '../library/runningPoll'
import {
  startSteamLaunchWatch,
  type SteamLaunchWatchDeps,
  type SteamLaunchWatchRegistry
} from '../steamLaunchWatch'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('backend/constants/paths', () => ({ userHome: '/home/test' }))
jest.mock('graceful-fs')
jest.mock('@node-steam/vdf')

const vdfWith = (appId: string | undefined) => {
  jest.mocked(existsSync).mockReturnValue(true)
  jest.mocked(readFileSync).mockReturnValue('content')
  jest.mocked(vdf.parse).mockReturnValue({
    Registry: {
      HKCU: {
        Software: {
          Valve: { Steam: appId === undefined ? {} : { RunningAppID: appId } }
        }
      }
    }
  })
}

const REG_ARGV = ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID']

describe('readRunningAppId() -- per-platform dispatch', () => {
  describe('win32', () => {
    it('parses REG_DWORD 0x1b58 -> 7000 through reg.exe with the 2000 ms bound', async () => {
      const runner = createScriptedRunner([
        {
          cmd: 'reg',
          argv: REG_ARGV,
          result: {
            code: 0,
            stdout: 'RunningAppID    REG_DWORD    0x1b58'
          }
        }
      ])
      await expect(readRunningAppId({ runner }, 'win32')).resolves.toBe(7000)
      expect(runner.calls[0]?.opts).toMatchObject({
        timeoutMs: 2000,
        windowsHide: true
      })
    })

    it.each([
      ['a non-zero exit', { code: 1, stdout: '' }],
      ['a timeout', { code: null, timedOut: true }],
      [
        'no RunningAppID in the output',
        { code: 0, stdout: 'ERROR: unable to find the specified registry key' }
      ]
    ])('returns 0 on %s', async (_n, result) => {
      const runner = createScriptedRunner([
        { cmd: 'reg', argv: REG_ARGV, result }
      ])
      await expect(readRunningAppId({ runner }, 'win32')).resolves.toBe(0)
    })

    it('returns 0 when reg.exe cannot be spawned', async () => {
      const runner = createScriptedRunner([
        { cmd: 'reg', argv: REG_ARGV, error: { code: 'ENOENT' } }
      ])
      await expect(readRunningAppId({ runner }, 'win32')).resolves.toBe(0)
    })
  })

  describe('darwin', () => {
    it('parses registry.vdf and makes no runner call', async () => {
      vdfWith('440')
      const runner = createScriptedRunner([])
      await expect(readRunningAppId({ runner }, 'darwin')).resolves.toBe(440)
      expect(runner.calls).toHaveLength(0)
    })

    it('readMacRunningAppId: 0 when registry.vdf is absent, unparsable or lacks the key', () => {
      jest.mocked(existsSync).mockReturnValue(false)
      expect(readMacRunningAppId()).toBe(0)
      jest.mocked(existsSync).mockReturnValue(true)
      jest.mocked(readFileSync).mockReturnValue('content')
      jest.mocked(vdf.parse).mockImplementation(() => {
        throw new Error('parse error')
      })
      expect(readMacRunningAppId()).toBe(0)
      jest.mocked(vdf.parse).mockReturnValue({ Registry: {} })
      expect(readMacRunningAppId()).toBe(0)
    })
  })

  describe('linux', () => {
    const psStep = (result: object) => ({
      cmd: 'ps',
      argv: ['-eo', 'args'],
      result
    })

    it('returns the VDF RunningAppID when non-zero, without spawning', async () => {
      vdfWith('570')
      const runner = createScriptedRunner([])
      await expect(readRunningAppId({ runner }, 'linux')).resolves.toBe(570)
      expect(runner.calls).toHaveLength(0)
    })

    it('falls back to the reaper scan (ps, 1000 ms) only when the VDF value is 0', async () => {
      vdfWith('0')
      const runner = createScriptedRunner([
        psStep({
          code: 0,
          stdout: 'reaper SteamLaunch --AppId 440 -- /path/to/game'
        })
      ])
      await expect(readRunningAppId({ runner }, 'linux')).resolves.toBe(440)
      expect(runner.calls[0]?.opts).toMatchObject({ timeoutMs: 1000 })
    })

    it.each([
      ['no reaper line', psStep({ code: 0, stdout: 'no reaper here' })],
      ['a ps failure', psStep({ code: 1, stdout: '' })],
      ['a ps timeout', psStep({ code: null, timedOut: true })],
      [
        'ps unavailable',
        { cmd: 'ps', argv: ['-eo', 'args'], error: { code: 'ENOENT' } }
      ]
    ])(
      'returns 0 when the VDF is 0 and the scan finds nothing: %s',
      async (_n, step) => {
        vdfWith('0')
        const runner = createScriptedRunner([step])
        await expect(readRunningAppId({ runner }, 'linux')).resolves.toBe(0)
      }
    )
  })
})

describe('createRunningPoll()', () => {
  const build = (ids: number[] | (() => Promise<number>)) => {
    const clock = createFakeClock()
    const notify = jest.fn()
    const read =
      typeof ids === 'function'
        ? ids
        : jest.fn(async () => (ids.length > 1 ? ids.shift()! : ids[0]!))
    const poll = createRunningPoll({
      clock,
      readRunningAppId: read,
      notify
    })
    return { clock, notify, poll, read }
  }

  it('sends playing when RunningAppID goes 0 -> X, and no done (no prior game)', async () => {
    const { poll, notify } = build([440])
    await poll.pollOnce()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(440, 'playing')
    expect(poll.lastAppId()).toBe(440)
  })

  it('sends done when RunningAppID goes X -> 0', async () => {
    const { poll, notify } = build([440, 0])
    await poll.pollOnce()
    notify.mockClear()
    await poll.pollOnce()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(440, 'done')
    expect(poll.lastAppId()).toBe(0)
  })

  it('sends nothing when RunningAppID is unchanged', async () => {
    const { poll, notify } = build([440])
    await poll.pollOnce()
    notify.mockClear()
    await poll.pollOnce()
    expect(notify).not.toHaveBeenCalled()
  })

  it('sends done for the old id then playing for the new id on X -> Y', async () => {
    const { poll, notify } = build([440, 570])
    await poll.pollOnce()
    notify.mockClear()
    await poll.pollOnce()
    expect(notify.mock.calls).toEqual([
      [440, 'done'],
      [570, 'playing']
    ])
  })

  it('start schedules one clock interval, is idempotent, and stop clears it and resets the last id', async () => {
    const { poll, clock, notify } = build([440])
    poll.start(5000)
    poll.start(5000)
    expect(clock.pendingCount()).toBe(1)
    clock.advance(5000)
    await Promise.resolve()
    await Promise.resolve()
    expect(notify).toHaveBeenCalledWith(440, 'playing')
    expect(poll.lastAppId()).toBe(440)
    poll.stop()
    expect(clock.pendingCount()).toBe(0)
    expect(poll.lastAppId()).toBe(0)
    poll.start(5000)
    expect(clock.pendingCount()).toBe(1)
    poll.stop()
  })

  it('the interval is a default (unref) clock timer: no keepAlive reason', () => {
    const { poll, clock } = build([0])
    poll.start()
    clock.assertNoKeepAlive()
    poll.stop()
  })

  it('never overlaps itself: a tick while the probe is still pending is skipped (Pitfall 7)', async () => {
    let release!: (n: number) => void
    const read = jest.fn(
      () =>
        new Promise<number>((resolve) => {
          release = resolve
        })
    )
    const { poll, clock, notify } = build(read)
    poll.start(5000)
    clock.advance(5000) // tick 1 starts and holds the probe
    clock.advance(5000) // tick 2 fires while tick 1 is in flight
    expect(read).toHaveBeenCalledTimes(1)
    release(440)
    await Promise.resolve()
    await Promise.resolve()
    expect(notify).toHaveBeenCalledWith(440, 'playing')
    clock.advance(5000) // the flag is released: the next tick probes again
    expect(read).toHaveBeenCalledTimes(2)
    release(440)
    poll.stop()
  })
})

describe('poller + launch watch coexistence (quick 261111-7wo)', () => {
  // Host-agnostic fixture paths: built from this machine's path module so the suite passes on
  // the Windows dev box and on ubuntu CI alike (steamLaunchWatch.test.ts uses POSIX literals).
  const LIB = resolve(sep + 'lib')
  const FOLDER = join(LIB, 'steamapps', 'common', 'WazHack')
  const GAME = join(FOLDER, 'WazHack.app', 'Contents', 'MacOS', 'WazHack')
  const PRESENT: ScriptStep = {
    cmd: '/bin/ps',
    result: {
      code: 0,
      stdout: `23175 ${GAME}
`
    },
    repeat: true
  }
  const APP_ID = '264160'

  type Frame = { src: 'watch' | 'poller'; status: 'playing' | 'done' }

  // Drain pending microtasks, move the shared fake clock, drain again. Moves in 1000 ms
  // increments so the watch's chained timers (each scheduled after an async scan) re-arm from
  // the right time rather than from the far end of one big jump.
  async function step(clock: ReturnType<typeof createFakeClock>, ms: number) {
    for (let moved = 0; moved < ms; moved += 1000) {
      for (let i = 0; i < 10; i++) await Promise.resolve()
      clock.advance(Math.min(1000, ms - moved))
      for (let i = 0; i < 10; i++) await Promise.resolve()
    }
  }

  function setup(script: ScriptStep[], platform: NodeJS.Platform = 'darwin') {
    const clock = createFakeClock()
    const runner = createScriptedRunner(script)
    const log = createCaptureLog()
    const registry: SteamLaunchWatchRegistry = new Map()
    const frames: Frame[] = []
    const state = { running: 0 }
    const poll = createRunningPoll({
      clock,
      readRunningAppId: () => Promise.resolve(state.running),
      notify: (_id, status) => void frames.push({ src: 'poller', status })
    })
    const watchDeps: SteamLaunchWatchDeps = {
      runner,
      clock,
      platform,
      log,
      getSteamLibraries: () => Promise.resolve([LIB]),
      readAcfInstalldir: () => 'WazHack',
      sanitizeInstalldir: (c) => c,
      readExe: jest.fn(),
      realpath: (p) => p,
      selfPids: [900],
      registry,
      sendStatus: (_id, status) => void frames.push({ src: 'watch', status }),
      // Mirrors steamLaunchedDeps.ts: the watch hands status to the poller once it reports the id.
      pollerReports: (appId) => String(poll.lastAppId()) === appId
    }
    return { clock, runner, registry, frames, state, poll, watchDeps }
  }

  // What libraryState.handleGameStatus renders: a repeat of the same status is dropped.
  const collapse = (frames: Frame[]) =>
    frames
      .map((f) => f.status)
      .filter((status, i, all) => i === 0 || status !== all[i - 1])

  it('C1 poller first: the poller sends [playing, done] and the watch sends nothing', async () => {
    const { clock, runner, registry, frames, state, poll, watchDeps } = setup([
      PRESENT
    ])
    state.running = Number(APP_ID)
    await poll.pollOnce() // the poller reports before the watch's first scan

    const { settled } = startSteamLaunchWatch(watchDeps, APP_ID)
    await step(clock, 2000)
    await settled
    expect(registry.size).toBe(0)
    expect(runner.calls.filter((c) => c.cmd === '/bin/ps')).toHaveLength(0)

    state.running = 0
    await poll.pollOnce()
    expect(frames).toEqual([
      { src: 'poller', status: 'playing' },
      { src: 'poller', status: 'done' }
    ])
  })

  it('C2 watch first: [watch playing, poller playing, poller done], one done and it is last', async () => {
    const { clock, registry, frames, state, poll, watchDeps } = setup([PRESENT])
    poll.start() // default 5000 ms
    const { settled } = startSteamLaunchWatch(watchDeps, APP_ID) // default 2000 ms
    state.running = Number(APP_ID)

    // t = 2000: the watch's first scan finds the game and shows playing.
    await step(clock, 2000)
    expect(frames).toEqual([{ src: 'watch', status: 'playing' }])
    // t = 5000: the poller's first tick reports the same game a second time.
    await step(clock, 3000)
    expect(frames).toEqual([
      { src: 'watch', status: 'playing' },
      { src: 'poller', status: 'playing' }
    ])
    // t = 6000: the watch sees pollerReports and ends quietly, with no done of its own.
    await step(clock, 1000)
    await settled
    expect(registry.size).toBe(0)
    expect(frames).toHaveLength(2)

    // The game quits: the poller's next tick sends the single done.
    state.running = 0
    await step(clock, 4000) // t = 10000
    expect(frames).toEqual([
      { src: 'watch', status: 'playing' },
      { src: 'poller', status: 'playing' },
      { src: 'poller', status: 'done' }
    ])
    expect(frames.filter((f) => f.status === 'done')).toHaveLength(1)
    expect(frames[frames.length - 1]?.status).toBe('done')
    expect(collapse(frames)).toEqual(['playing', 'done'])
    poll.stop()
  })

  it('C3 win32: the watch is unsupported and the poller alone sends [playing, done]', async () => {
    const reg = (stdout: string, repeat?: true): ScriptStep => ({
      cmd: 'reg',
      argv: REG_ARGV,
      result: { code: 0, stdout },
      ...(repeat ? { repeat } : {})
    })
    const { clock, runner, registry, frames, watchDeps } = setup(
      [
        reg('RunningAppID    REG_DWORD    0x407e0'),
        reg('RunningAppID    REG_DWORD    0x0', true)
      ],
      'win32'
    )
    const poll = createRunningPoll({
      clock,
      readRunningAppId: () => readRunningAppId({ runner }, 'win32'),
      notify: (_id, status) => void frames.push({ src: 'poller', status })
    })

    expect(startSteamLaunchWatch(watchDeps, APP_ID).status).toBe(
      'unsupported-platform'
    )
    expect(registry.size).toBe(0)

    poll.start()
    await step(clock, 5000)
    await step(clock, 5000)
    expect(frames).toEqual([
      { src: 'poller', status: 'playing' },
      { src: 'poller', status: 'done' }
    ])
    poll.stop()
  })
})
