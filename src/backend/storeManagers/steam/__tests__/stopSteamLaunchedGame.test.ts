import { createCaptureLog } from 'backend/testUtils/captureLog'
import { createFakeClock } from 'backend/testUtils/fakeClock'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import type { ScriptStep } from 'backend/testUtils/scriptedRunner'

import {
  stopSteamLaunchedGame,
  type StopSteamLaunchedGameDeps
} from '../stopSteamLaunchedGame'

const FOLDER = '/lib/steamapps/common/WazHack'
const GAME = `${FOLDER}/WazHack.app/Contents/MacOS/WazHack`

function ps(lines: string[]): ScriptStep {
  return {
    cmd: '/bin/ps',
    result: { code: 0, stdout: lines.join('\n') + '\n' }
  }
}

function setup(
  script: ScriptStep[],
  o: {
    platform?: NodeJS.Platform
    alive?: number[]
    /** pids that die on SIGTERM */
    dieOnTerm?: number[]
    readExe?: (pid: number) => string | undefined
    termError?: Record<number, string>
  } = {}
) {
  const alive = new Set(o.alive ?? [])
  const runner = createScriptedRunner(script)
  const clock = createFakeClock()
  const log = createCaptureLog()
  const signal = jest.fn((pid: number, sig: 'SIGTERM' | 'SIGKILL' | 0) => {
    if (sig === 'SIGTERM' && o.termError?.[pid]) {
      throw Object.assign(new Error('x'), { code: o.termError[pid] })
    }
    if (sig !== 0 && !alive.has(pid) && sig === 'SIGTERM') {
      throw Object.assign(new Error('gone'), { code: 'ESRCH' })
    }
    if (sig === 0 && !alive.has(pid)) {
      throw Object.assign(new Error('gone'), { code: 'ESRCH' })
    }
    if (sig === 'SIGKILL' || (sig === 'SIGTERM' && o.dieOnTerm?.includes(pid)))
      alive.delete(pid)
  })
  const deps: StopSteamLaunchedGameDeps = {
    runner,
    clock,
    platform: o.platform ?? 'darwin',
    log,
    getSteamLibraries: () => Promise.resolve(['/lib']),
    readAcfInstalldir: () => 'WazHack',
    sanitizeInstalldir: (c) => c,
    signal,
    readExe: o.readExe ?? jest.fn(),
    realpath: (p) => p,
    selfPids: [900, 901]
  }
  return { deps, runner, clock, log, signal }
}

async function run(
  deps: StopSteamLaunchedGameDeps,
  clock: ReturnType<typeof createFakeClock>
) {
  const p = stopSteamLaunchedGame(deps, '264160', {
    graceMs: 1000,
    pollMs: 250
  })
  for (let i = 0; i < 40; i++) {
    await Promise.resolve()
    await Promise.resolve()
    clock.advance(250)
  }
  return p
}

describe('stopSteamLaunchedGame', () => {
  it('win32 is a no-op', async () => {
    const t = setup([])
    t.deps.platform = 'win32'
    await expect(stopSteamLaunchedGame(t.deps, '264160')).resolves.toEqual({
      kind: 'unsupported-platform'
    })
    expect(t.runner.calls).toHaveLength(0)
    expect(t.signal).not.toHaveBeenCalled()
  })

  it('non-numeric appId and missing/throwing libraries -> no-folder', async () => {
    const t = setup([])
    await expect(stopSteamLaunchedGame(t.deps, 'x1')).resolves.toEqual({
      kind: 'no-folder'
    })
    t.deps.getSteamLibraries = () => Promise.resolve(undefined)
    await expect(stopSteamLaunchedGame(t.deps, '1')).resolves.toEqual({
      kind: 'no-folder'
    })
    t.deps.getSteamLibraries = () => Promise.reject(new Error('boom'))
    await expect(stopSteamLaunchedGame(t.deps, '1')).resolves.toEqual({
      kind: 'no-folder'
    })
  })

  it('blank installdir and sanitize throw skip the library', async () => {
    const t = setup([])
    t.deps.readAcfInstalldir = () => '  '
    await expect(stopSteamLaunchedGame(t.deps, '1')).resolves.toEqual({
      kind: 'no-folder'
    })
    t.deps.readAcfInstalldir = () => '../x'
    t.deps.sanitizeInstalldir = () => {
      throw new Error('unsafe')
    }
    await expect(stopSteamLaunchedGame(t.deps, '1')).resolves.toEqual({
      kind: 'no-folder'
    })
  })

  it('no matching pid -> no-process, nothing signalled', async () => {
    const t = setup([ps(['  5 /usr/bin/other'])])
    await expect(run(t.deps, t.clock)).resolves.toEqual({
      kind: 'no-process',
      folder: FOLDER
    })
    expect(t.signal).not.toHaveBeenCalled()
  })

  it('stops early when the pid dies on SIGTERM: no rescan, no SIGKILL', async () => {
    const t = setup([ps([`  42 ${GAME}`])], { alive: [42], dieOnTerm: [42] })
    await expect(run(t.deps, t.clock)).resolves.toEqual({
      kind: 'stopped',
      folder: FOLDER,
      termed: [42],
      killed: []
    })
    expect(t.signal).not.toHaveBeenCalledWith(42, 'SIGKILL')
    expect(t.runner.calls).toHaveLength(1)
    expect(t.clock.pendingCount()).toBe(0)
    t.clock.assertNoKeepAlive()
  })

  it('escalates to SIGKILL for survivors still in the rescan', async () => {
    const t = setup([ps([`  42 ${GAME}`]), ps([`  42 ${GAME}`])], {
      alive: [42]
    })
    const out = await run(t.deps, t.clock)
    expect(out).toEqual({
      kind: 'stopped',
      folder: FOLDER,
      termed: [42],
      killed: [42]
    })
    expect(t.signal).toHaveBeenCalledWith(42, 'SIGTERM')
    expect(t.signal).toHaveBeenCalledWith(42, 'SIGKILL')
    expect(t.log.lines.map((l) => l.msg).join('\n')).toContain('SIGTERM pids')
    expect(t.clock.pendingCount()).toBe(0)
    t.clock.assertNoKeepAlive()
  })

  it('does not SIGKILL a pid absent from the rescan (PID reuse)', async () => {
    const t = setup([ps([`  42 ${GAME}`]), ps(['  7 /usr/bin/other'])], {
      alive: [42]
    })
    const out = await run(t.deps, t.clock)
    expect(out).toMatchObject({ kind: 'stopped', killed: [] })
    expect(t.signal).not.toHaveBeenCalledWith(42, 'SIGKILL')
  })

  it('never signals siblings, argument-only, steam helpers or self', async () => {
    const t = setup(
      [
        ps([
          `  42 ${GAME}`,
          '  600 /lib/steamapps/common/WazHack2/run',
          `  601 /usr/bin/tail -f ${FOLDER}/log.txt`,
          `  602 ${FOLDER}/steam_osx`,
          `  900 ${FOLDER}/self`,
          `  901 ${FOLDER}/parent`
        ]),
        ps([`  42 ${GAME}`])
      ],
      { alive: [42, 600, 601, 602, 900, 901] }
    )
    await run(t.deps, t.clock)
    const targets = t.signal.mock.calls.map((c) => c[0])
    expect(new Set(targets)).toEqual(new Set([42]))
  })

  it('linux drops pids whose exe is unreadable or outside the folder', async () => {
    const t = setup(
      [ps([`  1000 ${FOLDER}/a`, `  1001 ${FOLDER}/b`, `  1002 ${FOLDER}/c`])],
      {
        platform: 'linux',
        alive: [1000],
        dieOnTerm: [1000],
        readExe: (pid) =>
          pid === 1000
            ? `${FOLDER}/a (deleted)`
            : pid === 1001
              ? '/usr/bin/evil'
              : undefined
      }
    )
    const out = await run(t.deps, t.clock)
    expect(out).toMatchObject({ kind: 'stopped', termed: [1000] })
    expect(new Set(t.signal.mock.calls.map((c) => c[0]))).toEqual(
      new Set([1000])
    )
  })

  it('darwin does not call readExe', async () => {
    const readExe = jest.fn()
    const t = setup([ps([`  42 ${GAME}`])], {
      alive: [42],
      dieOnTerm: [42],
      readExe
    })
    await run(t.deps, t.clock)
    expect(readExe).not.toHaveBeenCalled()
  })

  it('ignores SIGTERM ESRCH; logs and skips EPERM', async () => {
    const t = setup(
      [ps([`  42 ${GAME}`, `  43 ${FOLDER}/x`, `  44 ${FOLDER}/y`])],
      {
        alive: [43],
        dieOnTerm: [43],
        termError: { 44: 'EPERM' }
      }
    )
    const out = await run(t.deps, t.clock)
    expect(out).toMatchObject({ kind: 'stopped', termed: [43] })
    expect(t.log.lines.some((l) => l.level === 'warn')).toBe(true)
  })

  it.each([{ code: 1 }, { code: null, timedOut: true }])(
    'ps failure %p -> failed, no signals',
    async (result) => {
      const t = setup([{ cmd: '/bin/ps', result }])
      const out = await run(t.deps, t.clock)
      expect(out.kind).toBe('failed')
      expect(t.signal).not.toHaveBeenCalled()
    }
  )
})
