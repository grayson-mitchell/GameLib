/**
 * Unit tests for the running-app probe (readRunningAppId, readMacRunningAppId) and the
 * boot-built poller (createRunningPoll). Moved out of library.test.ts by Phase 65 plan 04
 * (D-03); rebuilt on a scripted runner and a fake clock by 66.2-06 (the poller and its last-id
 * state are closure state of an instance now, no child_process mock).
 */
import { existsSync, readFileSync } from 'graceful-fs'
import * as vdf from '@node-steam/vdf'

import { createFakeClock } from 'backend/testUtils/fakeClock'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'

import {
  createRunningPoll,
  readMacRunningAppId,
  readRunningAppId
} from '../library/runningPoll'

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
