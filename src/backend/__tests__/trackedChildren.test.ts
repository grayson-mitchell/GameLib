/**
 * Phase 72 D-13: tracked-PID kills replace name-pattern kills.
 */
import { EventEmitter } from 'events'
import { spawn, spawnSync } from 'child_process'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import type { ChildProcess } from 'child_process'
import { createFakeHomeProfile } from '../testUtils/fakeHomeProfile'
import { killAllTracked, killTracked, trackChild } from '../trackedChildren'

jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process')
  return { ...actual, spawnSync: jest.fn() }
})
jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

function fakeChild(pid: number | undefined): ChildProcess {
  const ee = new EventEmitter() as ChildProcess
  Object.defineProperty(ee, 'pid', { value: pid })
  return ee
}

describe('trackedChildren', () => {
  let killSpy: jest.SpyInstance
  const cleanup: ChildProcess[] = []

  beforeEach(() => {
    killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true)
  })

  afterEach(() => {
    cleanup.splice(0).forEach((c) => c.emit('close'))
    killSpy.mockRestore()
  })

  function track(pid: number | undefined, runner: string, key: string) {
    const c = fakeChild(pid)
    cleanup.push(c)
    return { c, untrack: trackChild(c, { runner, key }) }
  }

  test('close removes the entry', () => {
    const { c } = track(101, 'legendary', 'GameA')
    c.emit('close')
    expect(killAllTracked()).toBe(0)
    expect(killSpy).not.toHaveBeenCalled()
  })

  test('untrack removes only its own entry', () => {
    const a = track(101, 'legendary', 'GameA')
    track(102, 'legendary', 'GameA')
    a.untrack()
    expect(killTracked({ runner: 'legendary', key: 'GameA' })).toBe(1)
    expect(killSpy).toHaveBeenCalledWith(102, 'SIGTERM')
  })

  test('killTracked filters by runner and key', () => {
    track(201, 'legendary', 'GameA')
    track(202, 'gogdl', 'GameA')
    expect(killTracked({ runner: 'legendary', key: 'GameA' })).toBe(1)
    expect(killSpy).toHaveBeenCalledTimes(1)
    expect(killSpy).toHaveBeenCalledWith(201, 'SIGTERM')
  })

  test('a runner filter without a key kills every entry of that runner', () => {
    track(301, 'nile', 'a')
    track(302, 'nile', 'b')
    track(303, 'legendary', 'a')
    expect(killTracked({ runner: 'nile' })).toBe(2)
  })

  test('killAllTracked survives a throwing kill and is a no-op when empty', () => {
    expect(killAllTracked()).toBe(0)
    track(401, 'legendary', 'a')
    track(402, 'gogdl', 'b')
    killSpy.mockImplementationOnce(() => {
      throw new Error('ESRCH')
    })
    expect(killAllTracked()).toBe(1)
    expect(killSpy).toHaveBeenCalledTimes(2)
  })

  test('a child with undefined pid is not registered', () => {
    track(undefined, 'legendary', 'a')
    expect(killAllTracked()).toBe(0)
  })

  test('win32 kills the tree with taskkill', () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try {
      track(501, 'legendary', 'a')
      expect(killAllTracked()).toBe(1)
      expect(spawnSync).toHaveBeenCalledWith(
        'taskkill',
        ['/PID', '501', '/T', '/F'],
        { windowsHide: true }
      )
      expect(killSpy).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(process, 'platform', original)
    }
  })
})

const describePosix = process.platform === 'win32' ? describe.skip : describe

describePosix('trackedChildren real spawn (fake HOME)', () => {
  test('killAllTracked terminates a real child with SIGTERM', async () => {
    const profile = createFakeHomeProfile({ prefix: 'gamelib-tracked-' })
    try {
      const child = spawn('sleep', ['30'], { env: profile.childEnv() })
      trackChild(child, { runner: 'test', key: 'sleep' })
      const exited = new Promise<string | null>((resolve) =>
        child.once('close', (_code, signal) => resolve(signal))
      )
      expect(killAllTracked()).toBe(1)
      await expect(exited).resolves.toBe('SIGTERM')
    } finally {
      profile.dispose()
    }
  }, 10000)
})

describe('no name-pattern kill remains in src/backend', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        return name === '__tests__' || name === 'node_modules'
          ? []
          : sources(full)
      }
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
    })
  }

  test('no pkill outside comments', () => {
    const offenders = sources(join(__dirname, '..')).filter((file) =>
      readFileSync(file, 'utf-8')
        .split('\n')
        .some((line) => {
          const t = line.trim()
          return (
            line.includes('pkill') &&
            !t.startsWith('//') &&
            !t.startsWith('*') &&
            !t.startsWith('/*')
          )
        })
    )
    expect(offenders).toEqual([])
  })
})
