/**
 * Unit tests for the running-app probe (readRunningAppId, readMacRunningAppId) and the
 * boot-built poller (createRunningPoll). Moved out of library.test.ts by Phase 65 plan 04
 * (D-03); rebuilt on a scripted runner and a fake clock by 66.2-06 (the poller and its last-id
 * state are closure state of an instance now, no child_process mock).
 */
import { existsSync, readFileSync } from 'graceful-fs'
import {
  vdf,
  mockedFsSteamFiles
} from '../localFiles/__tests__/fixtures/mockedFsSteamFiles'
import { join, resolve, sep } from 'path'

import { createCaptureLog } from 'backend/testUtils/captureLog'
import { stubRustSteamFiles } from '../localFiles/__tests__/fixtures/stubRustSteamFiles'
import { createFakeClock } from 'backend/testUtils/fakeClock'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import type { ScriptStep } from 'backend/testUtils/scriptedRunner'

import {
  createRunningPoll,
  readMacRunningAppId,
  readRunningAppId
} from '../library/runningPoll'
import { windowsSystem32Path } from '../runningFromFolder'
import {
  cancelSteamLaunchWatch,
  startSteamLaunchWatch,
  type SteamLaunchWatchDeps,
  type SteamLaunchWatchRegistry
} from '../steamLaunchWatch'

jest.mock('backend/logger', () => ({
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
const paths = { userHome: '/home/test' }
jest.mock('graceful-fs')
// Phase 75: removed with the flag in plan 34
const priorSteamFilesText = process.env.GAMELIB_STEAMFILES_TEXT
process.env.GAMELIB_STEAMFILES_TEXT = 'rust'
afterAll(() => {
  if (priorSteamFilesText === undefined)
    delete process.env.GAMELIB_STEAMFILES_TEXT
  else process.env.GAMELIB_STEAMFILES_TEXT = priorSteamFilesText
})

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

// The registry reads answer from the mocked filesystem and programmed vdf.parse results.
const noRust = mockedFsSteamFiles().requestRustInvoke

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
      await expect(
        readRunningAppId({ runner, paths, requestRustInvoke: noRust }, 'win32')
      ).resolves.toBe(7000)
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
      await expect(
        readRunningAppId({ runner, paths, requestRustInvoke: noRust }, 'win32')
      ).resolves.toBe(0)
    })

    it('returns 0 when reg.exe cannot be spawned', async () => {
      const runner = createScriptedRunner([
        { cmd: 'reg', argv: REG_ARGV, error: { code: 'ENOENT' } }
      ])
      await expect(
        readRunningAppId({ runner, paths, requestRustInvoke: noRust }, 'win32')
      ).resolves.toBe(0)
    })
  })

  describe('darwin', () => {
    it('parses registry.vdf and makes no runner call', async () => {
      vdfWith('440')
      const runner = createScriptedRunner([])
      await expect(
        readRunningAppId({ runner, paths, requestRustInvoke: noRust }, 'darwin')
      ).resolves.toBe(440)
      expect(runner.calls).toHaveLength(0)
    })

    it('readMacRunningAppId: 0 when registry.vdf is absent, unparsable or lacks the key', async () => {
      jest.mocked(existsSync).mockReturnValue(false)
      await expect(
        readMacRunningAppId({ paths, requestRustInvoke: noRust })
      ).resolves.toBe(0)
      jest.mocked(existsSync).mockReturnValue(true)
      jest.mocked(readFileSync).mockReturnValue('content')
      jest.mocked(vdf.parse).mockImplementation(() => {
        throw new Error('parse error')
      })
      await expect(
        readMacRunningAppId({ paths, requestRustInvoke: noRust })
      ).resolves.toBe(0)
      jest.mocked(vdf.parse).mockReturnValue({ Registry: {} })
      await expect(
        readMacRunningAppId({ paths, requestRustInvoke: noRust })
      ).resolves.toBe(0)
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
      await expect(
        readRunningAppId({ runner, paths, requestRustInvoke: noRust }, 'linux')
      ).resolves.toBe(570)
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
      await expect(
        readRunningAppId({ runner, paths, requestRustInvoke: noRust }, 'linux')
      ).resolves.toBe(440)
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
        await expect(
          readRunningAppId(
            { runner, paths, requestRustInvoke: noRust },
            'linux'
          )
        ).resolves.toBe(0)
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

describe('createRunningPoll() hold / release (quick 261111-a9g)', () => {
  const X = 264160
  const build = (drainMs = 20000) => {
    const clock = createFakeClock()
    const notify = jest.fn()
    let current = 0
    const poll = createRunningPoll({
      clock,
      readRunningAppId: () => Promise.resolve(current),
      notify,
      drainMs
    })
    const read = async (n: number) => {
      current = n
      await poll.pollOnce()
    }
    return { clock, notify, poll, read }
  }

  it('H1 (a9g) hold: 0 -> X -> 0 sends nothing while held, and lastAppId still tracks X', async () => {
    const { poll, notify, read } = build()
    poll.hold(X)
    await read(0)
    await read(X)
    expect(poll.lastAppId()).toBe(X)
    await read(0)
    expect(notify).not.toHaveBeenCalled()
    expect(poll.lastAppId()).toBe(0)
  })

  it('H2 (a9g) release(true) after the poller saw X: X -> 0 is silent, a later 0 -> X sends playing', async () => {
    const { poll, notify, read } = build()
    const release = poll.hold(X)
    await read(X)
    release(true)
    await read(0)
    expect(notify).not.toHaveBeenCalled()
    await read(X)
    expect(notify.mock.calls).toEqual([[X, 'playing']])
  })

  it('H3 (a9g) release(true) before the poller saw X: the lagging X then 0 reads are both silent', async () => {
    const { poll, notify, read } = build()
    poll.hold(X)(true)
    await read(X)
    await read(0)
    expect(notify).not.toHaveBeenCalled()
  })

  it('H4 (a9g) drain deadline: X persisting past drainMs sends one playing, then done at X -> 0', async () => {
    const { poll, notify, clock, read } = build(3000)
    poll.hold(X)(true)
    await read(X)
    clock.advance(2000)
    await read(X)
    expect(notify).not.toHaveBeenCalled()
    clock.advance(1000)
    await read(X)
    expect(notify.mock.calls).toEqual([[X, 'playing']])
    clock.advance(5000)
    await read(X)
    expect(notify).toHaveBeenCalledTimes(1)
    await read(0)
    expect(notify.mock.calls).toEqual([
      [X, 'playing'],
      [X, 'done']
    ])
  })

  it('H5 (a9g) release(false): playing at once when the poller already reads X, else at a later 0 -> X', async () => {
    const a = build()
    const releaseA = a.poll.hold(X)
    await a.read(X)
    expect(a.notify).not.toHaveBeenCalled()
    releaseA(false)
    expect(a.notify.mock.calls).toEqual([[X, 'playing']])
    await a.read(0)
    expect(a.notify.mock.calls).toEqual([
      [X, 'playing'],
      [X, 'done']
    ])

    const b = build()
    const releaseB = b.poll.hold(X)
    releaseB(false)
    expect(b.notify).not.toHaveBeenCalled()
    await b.read(X)
    expect(b.notify.mock.calls).toEqual([[X, 'playing']])
  })

  it('H6 (a9g) a second hold replaces the claim (a stale release is a no-op); stop() clears claims', async () => {
    const { poll, notify, read } = build()
    const first = poll.hold(X)
    poll.hold(X)
    first(false) // stale: must not delete the live claim
    await read(X)
    await read(0)
    expect(notify).not.toHaveBeenCalled()

    poll.hold(X)
    poll.stop()
    await read(X)
    expect(notify.mock.calls).toEqual([[X, 'playing']])
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

  type Frame = {
    src: 'watch' | 'poller' | 'stop'
    status: 'launching' | 'playing' | 'done'
  }

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

  // The win32 watch advances in 500 ms alive ticks, so its chained timers need 500 ms steps too.
  async function step500(
    clock: ReturnType<typeof createFakeClock>,
    ms: number
  ) {
    for (let moved = 0; moved < ms; moved += 500) {
      for (let i = 0; i < 20; i++) await Promise.resolve()
      clock.advance(500)
      for (let i = 0; i < 20; i++) await Promise.resolve()
    }
  }

  const WIN_LIB = 'C:\\Steam'
  const WIN_GAME = join(
    WIN_LIB,
    'steamapps',
    'common',
    'WazHack',
    'WazHack.exe'
  )
  const WIN_PS = windowsSystem32Path(
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  )
  const winList = (pids: number[], repeat?: true): ScriptStep => ({
    cmd: WIN_PS,
    result: {
      code: 0,
      stdout: pids.map((p) => `${p} ${WIN_GAME}`).join('\r\n') + '\r\n'
    },
    ...(repeat ? { repeat } : {})
  })

  function setup(script: ScriptStep[], platform: NodeJS.Platform = 'darwin') {
    const clock = createFakeClock()
    const runner = createScriptedRunner(script)
    const log = createCaptureLog()
    const registry: SteamLaunchWatchRegistry = new Map()
    const frames: Frame[] = []
    const state = { running: 0, alive: new Set<number>() }
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
      getSteamLibraries: () =>
        Promise.resolve([platform === 'win32' ? WIN_LIB : LIB]),
      readAcfInstalldir: async () => 'WazHack',
      sanitizeInstalldir: (c) => c,
      readExe: jest.fn(),
      realpath: (p) => p,
      selfPids: [900],
      registry,
      sendStatus: (_id, status) => void frames.push({ src: 'watch', status }),
      // Mirrors steamLaunchedDeps.ts: the watch hands status to the poller once it reports the id.
      pollerReports: (appId) => String(poll.lastAppId()) === appId,
      readRunningAppId: () => Promise.resolve(state.running),
      pidAlive: (pid) => state.alive.has(pid),
      pollerHold: (id) => poll.hold(Number(id))
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

  it('C3 win32 (a9g/am0): the watch shows launching, playing and sends done within 1 s of the pid dying; the poller stays silent', async () => {
    const { clock, registry, frames, state, poll, watchDeps } = setup(
      [winList([42]), winList([])],
      'win32'
    )
    state.running = Number(APP_ID)
    state.alive.add(42)
    poll.start() // default 5000 ms
    const { settled } = startSteamLaunchWatch(watchDeps, APP_ID)

    expect(frames).toEqual([{ src: 'watch', status: 'launching' }])
    await step500(clock, 2000) // t = 2000: the gated scan finds pid 42
    expect(frames).toEqual([
      { src: 'watch', status: 'launching' },
      { src: 'watch', status: 'playing' }
    ])
    await step500(clock, 8000) // t = 10000: the poller ticked at 5000 and 10000, silently
    state.alive.delete(42)
    await step500(clock, 1000) // t = 11000: one confirm scan, then done
    await settled
    expect(registry.size).toBe(0)
    state.running = 0 // Steam clears RunningAppID 2100 ms after the exit
    await step500(clock, 9000) // two more poller ticks add nothing
    expect(frames).toEqual([
      { src: 'watch', status: 'launching' },
      { src: 'watch', status: 'playing' },
      { src: 'watch', status: 'done' }
    ])
    expect(collapse(frames)).toEqual(['launching', 'playing', 'done'])
    poll.stop()
  })

  it('C4 win32 (a9g/am0) Stop: [watch launching, watch playing, stop done]; the poller stays silent through the cancel', async () => {
    const { clock, registry, frames, state, poll, watchDeps } = setup(
      [winList([42])],
      'win32'
    )
    state.running = Number(APP_ID)
    state.alive.add(42)
    poll.start()
    startSteamLaunchWatch(watchDeps, APP_ID)
    await step500(clock, 6000)
    // games.ts stop(): cancel the watch, then send the one done
    expect(cancelSteamLaunchWatch(registry, APP_ID).shown).toBe(true)
    frames.push({ src: 'stop', status: 'done' })
    await step500(clock, 3000) // the poller still reads the appId
    state.alive.delete(42)
    state.running = 0
    await step500(clock, 10000)
    expect(frames).toEqual([
      { src: 'watch', status: 'launching' },
      { src: 'watch', status: 'playing' },
      { src: 'stop', status: 'done' }
    ])
    poll.stop()
  })

  it('C6 win32 (a9g) handover: the 5-empty-scan bail hands the status to the poller', async () => {
    const { clock, registry, frames, state, poll, watchDeps } = setup(
      [winList([], true)],
      'win32'
    )
    state.running = Number(APP_ID)
    poll.start()
    const { settled } = startSteamLaunchWatch(watchDeps, APP_ID)
    await step500(clock, 10500) // t = 10000: the fifth empty scan
    await settled
    expect(registry.size).toBe(0)
    expect(frames).toEqual([
      { src: 'watch', status: 'launching' },
      { src: 'poller', status: 'playing' }
    ])
    state.running = 0
    await step500(clock, 5000)
    expect(frames).toEqual([
      { src: 'watch', status: 'launching' },
      { src: 'poller', status: 'playing' },
      { src: 'poller', status: 'done' }
    ])
    poll.stop()
  })

  it('C7 win32 (a9g) self-heal: a premature watch done is repaired 20 s later', async () => {
    const { clock, frames, state, poll, watchDeps } = setup(
      [winList([42]), winList([])],
      'win32'
    )
    state.running = Number(APP_ID)
    state.alive.add(42)
    poll.start()
    const { settled } = startSteamLaunchWatch(watchDeps, APP_ID)
    await step500(clock, 10000)
    state.alive.delete(42) // the watch sends done at about t = 10500
    await step500(clock, 1000)
    await settled
    expect(frames).toEqual([
      { src: 'watch', status: 'launching' },
      { src: 'watch', status: 'playing' },
      { src: 'watch', status: 'done' }
    ])
    await step500(clock, 25000) // t = 36000: the poller tick at 35000 is past the drain
    expect(frames).toEqual([
      { src: 'watch', status: 'launching' },
      { src: 'watch', status: 'playing' },
      { src: 'watch', status: 'done' },
      { src: 'poller', status: 'playing' }
    ])
    state.running = 0
    await step500(clock, 5000)
    expect(frames).toEqual([
      { src: 'watch', status: 'launching' },
      { src: 'watch', status: 'playing' },
      { src: 'watch', status: 'done' },
      { src: 'poller', status: 'playing' },
      { src: 'poller', status: 'done' }
    ])
    poll.stop()
  })

  it('C8 win32 (am0): a game never detected ends Launching with one done after the window', async () => {
    const { clock, registry, frames, poll, watchDeps } = setup([], 'win32')
    poll.start()
    const { settled } = startSteamLaunchWatch(watchDeps, APP_ID, {
      startWindowMs: 6000
    })
    expect(frames).toEqual([{ src: 'watch', status: 'launching' }])
    await step500(clock, 8000)
    await settled
    expect(registry.size).toBe(0)
    expect(frames).toEqual([
      { src: 'watch', status: 'launching' },
      { src: 'watch', status: 'done' }
    ])
    await step500(clock, 10000) // two more poller ticks add nothing
    expect(frames).toEqual([
      { src: 'watch', status: 'launching' },
      { src: 'watch', status: 'done' }
    ])
    poll.stop()
  })

  it('C9 win32 (am0): already running at Play sends no launching and the poller playing is never overwritten', async () => {
    const { clock, frames, state, poll, watchDeps } = setup(
      [winList([42]), winList([])],
      'win32'
    )
    state.running = Number(APP_ID)
    state.alive.add(42)
    await poll.pollOnce() // the poller shows playing before this Play
    const { settled } = startSteamLaunchWatch(watchDeps, APP_ID)
    expect(frames).toEqual([{ src: 'poller', status: 'playing' }])
    await step500(clock, 2000)
    state.alive.delete(42)
    await step500(clock, 1000)
    await settled
    expect(frames).toEqual([
      { src: 'poller', status: 'playing' },
      { src: 'watch', status: 'playing' },
      { src: 'watch', status: 'done' }
    ])
    expect(collapse(frames)).toEqual(['playing', 'done'])
  })
})

describe('registry.vdf RunningAppID on the rust flag', () => {
  const realEnv = process.env.GAMELIB_STEAMFILES_TEXT
  beforeEach(() => {
    process.env.GAMELIB_STEAMFILES_TEXT = 'rust'
  })
  afterEach(() => {
    if (realEnv === undefined) delete process.env.GAMELIB_STEAMFILES_TEXT
    else process.env.GAMELIB_STEAMFILES_TEXT = realEnv
  })

  it('macOS reads RunningAppID through steamfiles_read_running_app_id', async () => {
    const stub = stubRustSteamFiles({
      steamfiles_read_running_app_id: () => ({ runningAppId: 1245620 })
    })
    await expect(
      readMacRunningAppId({ paths, requestRustInvoke: stub.requestRustInvoke })
    ).resolves.toBe(1245620)
    expect(stub.calls[0]?.args).toEqual({
      path: '/home/test/Library/Application Support/Steam/registry.vdf'
    })
  })

  it('0 when the transport rejects', async () => {
    const stub = stubRustSteamFiles({})
    await expect(
      readMacRunningAppId({ paths, requestRustInvoke: stub.requestRustInvoke })
    ).resolves.toBe(0)
  })

  it('Linux reads ~/.steam/registry.vdf on Rust and skips the reaper scan when it is non-zero', async () => {
    const stub = stubRustSteamFiles({
      steamfiles_read_running_app_id: () => ({ runningAppId: 440 })
    })
    const runner = createScriptedRunner([])
    await expect(
      readRunningAppId(
        { runner, paths, requestRustInvoke: stub.requestRustInvoke },
        'linux'
      )
    ).resolves.toBe(440)
    expect(stub.calls[0]?.args).toEqual({
      path: '/home/test/.steam/registry.vdf'
    })
    expect(runner.calls).toHaveLength(0)
  })

  it('does not re-enter pollOnce while the previous read is still pending (inFlight guard)', async () => {
    let release: (id: number) => void = () => undefined
    const read = jest.fn(
      () =>
        new Promise<number>((resolve) => {
          release = resolve
        })
    )
    const clock = createFakeClock()
    const notify = jest.fn()
    const poll = createRunningPoll({ clock, readRunningAppId: read, notify })
    poll.start(1000)
    clock.advance(1000)
    clock.advance(1000)
    clock.advance(1000)
    expect(read).toHaveBeenCalledTimes(1)
    release(440)
    await poll.pollOnce().catch(() => undefined)
    await Promise.resolve()
    expect(notify).toHaveBeenCalledWith(440, 'playing')
    poll.stop()
  })
})
