import { join } from 'path'

import { createCaptureLog } from 'backend/testUtils/captureLog'
import { createFakeClock } from 'backend/testUtils/fakeClock'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import type { ScriptStep } from 'backend/testUtils/scriptedRunner'

import { windowsSystem32Path } from '../runningFromFolder'
import {
  cancelSteamLaunchWatch,
  startSteamLaunchWatch,
  type SteamLaunchWatchDeps,
  type SteamLaunchWatchRegistry
} from '../steamLaunchWatch'

const FOLDER = '/lib/steamapps/common/WazHack'
const GAME = `${FOLDER}/WazHack.app/Contents/MacOS/WazHack`
const EMPTY: ScriptStep = { cmd: '/bin/ps', result: { code: 0, stdout: '\n' } }
const PRESENT: ScriptStep = {
  cmd: '/bin/ps',
  result: { code: 0, stdout: `23175 ${GAME}\n` }
}
const FAIL: ScriptStep = { cmd: '/bin/ps', result: { code: 1, stdout: '' } }
const TIMEOUT: ScriptStep = {
  cmd: '/bin/ps',
  result: { code: null, timedOut: true, stdout: '' }
}

const WIN_LIB = 'C:\\Steam'
const WIN_GAME = join(WIN_LIB, 'steamapps', 'common', 'WazHack', 'WazHack.exe')
const WIN_PS = windowsSystem32Path(
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe'
)
// 9p6 fixture style: CRLF-joined `<pid> <exe>` lines, host-agnostic
const winList = (pids: number[]): ScriptStep => ({
  cmd: WIN_PS,
  result: {
    code: 0,
    stdout: pids.map((p) => `${p} ${WIN_GAME}`).join('\r\n') + '\r\n'
  }
})
const WIN_FAIL: ScriptStep = {
  cmd: WIN_PS,
  result: { code: 1, stdout: '' }
}

function setup(
  script: ScriptStep[],
  o: {
    platform?: NodeJS.Platform
    libs?: string[] | undefined
    acf?: string | undefined
    poller?: () => boolean
  } = {}
) {
  const runner = createScriptedRunner(script)
  const clock = createFakeClock()
  const log = createCaptureLog()
  const registry: SteamLaunchWatchRegistry = new Map()
  const sent: string[] = []
  const state = { running: 0, alive: new Set<number>() }
  const holds: string[] = []
  const released: boolean[] = []
  const deps: SteamLaunchWatchDeps = {
    runner,
    clock,
    platform: o.platform ?? 'darwin',
    log,
    getSteamLibraries: () => Promise.resolve('libs' in o ? o.libs : ['/lib']),
    readAcfInstalldir: () => Promise.resolve('acf' in o ? o.acf : 'WazHack'),
    sanitizeInstalldir: (c) => c,
    readExe: jest.fn(),
    realpath: (p) => p,
    selfPids: [900],
    registry,
    sendStatus: (_id, status) => void sent.push(status),
    pollerReports: o.poller ?? (() => false),
    readRunningAppId: () => Promise.resolve(state.running),
    pidAlive: (pid) => state.alive.has(pid),
    pollerHold: (id) => {
      holds.push(id)
      return (terminalSent) => void released.push(terminalSent)
    }
  }
  return { deps, runner, clock, log, registry, sent, state, holds, released }
}

async function tick(clock: ReturnType<typeof createFakeClock>, n = 1) {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 10; j++) await Promise.resolve()
    clock.advance(2000)
    for (let j = 0; j < 10; j++) await Promise.resolve()
  }
}

// 500 ms steps: the win32 tracking phase re-arms its timer every 500 ms
async function tick500(clock: ReturnType<typeof createFakeClock>, ms: number) {
  for (let moved = 0; moved < ms; moved += 500) {
    for (let j = 0; j < 20; j++) await Promise.resolve()
    clock.advance(500)
    for (let j = 0; j < 20; j++) await Promise.resolve()
  }
}

function setupWin(script: ScriptStep[]) {
  const t = setup(script, { platform: 'win32', libs: [WIN_LIB] })
  const psCalls = () => t.runner.calls.filter((c) => c.cmd === WIN_PS).length
  return { ...t, psCalls }
}

describe('steamLaunchWatch', () => {
  it('T1 sends playing once when the pid appears', async () => {
    const { deps, clock, registry, sent } = setup([EMPTY, PRESENT, PRESENT])
    startSteamLaunchWatch(deps, '264160')
    await tick(clock)
    expect(sent).toEqual([])
    await tick(clock, 2)
    expect(sent).toEqual(['playing'])
    expect(registry.has('264160')).toBe(true)
  })

  it('T2 sends one done after two empty scans and ends', async () => {
    const { deps, clock, registry, sent } = setup([PRESENT, EMPTY, EMPTY])
    const { settled } = startSteamLaunchWatch(deps, '264160')
    await tick(clock, 4)
    await settled
    expect(sent).toEqual(['playing', 'done'])
    expect(registry.size).toBe(0)
    expect(clock.pendingCount()).toBe(0)
  })

  it('T3 one empty scan between present scans sends no done', async () => {
    const { deps, clock, sent } = setup([PRESENT, EMPTY, PRESENT, PRESENT])
    startSteamLaunchWatch(deps, '264160')
    await tick(clock, 4)
    expect(sent).toEqual(['playing'])
  })

  it('T4 sends nothing when no pid shows inside the start window', async () => {
    const { deps, clock, registry, sent } = setup([{ ...EMPTY, repeat: true }])
    const { settled } = startSteamLaunchWatch(deps, '264160', {
      startWindowMs: 10000
    })
    await tick(clock, 8)
    await settled
    expect(sent).toEqual([])
    expect(registry.size).toBe(0)
    expect(clock.pendingCount()).toBe(0)
  })

  it('T5 no folder: no ps, no status, entry removed', async () => {
    const a = setup([], { libs: undefined })
    const r = startSteamLaunchWatch(a.deps, '264160')
    await r.settled
    expect(a.runner.calls).toHaveLength(0)
    expect(a.sent).toEqual([])
    expect(a.registry.size).toBe(0)
    const b = setup([], { acf: '  ' })
    await startSteamLaunchWatch(b.deps, '264160').settled
    expect(b.runner.calls).toHaveLength(0)
    expect(b.registry.size).toBe(0)
  })

  it('W1 (a9g) win32: gated scan finds the game, pid liveness is free, one confirm scan sends done', async () => {
    const { deps, clock, registry, sent, state, psCalls } = setupWin([
      winList([42]),
      winList([])
    ])
    const { status, settled } = startSteamLaunchWatch(deps, '264160')
    expect(status).toBe('started')
    await tick500(clock, 2000) // RunningAppID reads 0: nothing is spawned
    expect(psCalls()).toBe(0)
    expect(sent).toEqual(['launching'])
    state.running = 264160
    state.alive.add(42)
    await tick500(clock, 2000)
    expect(sent).toEqual(['launching', 'playing'])
    expect(psCalls()).toBe(1)
    await tick500(clock, 10000) // alive: no further PowerShell
    expect(psCalls()).toBe(1)
    clock.assertNoKeepAlive()
    state.alive.delete(42)
    await tick500(clock, 1000)
    await settled
    expect(sent).toEqual(['launching', 'playing', 'done'])
    expect(psCalls()).toBe(2)
    expect(registry.size).toBe(0)
    expect(clock.pendingCount()).toBe(0)
  })

  it('W2 (a9g) win32: a successor pid found by the confirm scan defers done', async () => {
    const { deps, clock, sent, state, psCalls } = setupWin([
      winList([42]),
      winList([77]),
      winList([])
    ])
    const { settled } = startSteamLaunchWatch(deps, '264160')
    state.running = 264160
    state.alive.add(42).add(77)
    await tick500(clock, 2000)
    expect(sent).toEqual(['launching', 'playing'])
    state.alive.delete(42)
    await tick500(clock, 3000)
    expect(psCalls()).toBe(2)
    expect(sent).toEqual(['launching', 'playing'])
    state.alive.delete(77)
    await tick500(clock, 1000)
    await settled
    expect(sent).toEqual(['launching', 'playing', 'done'])
    expect(psCalls()).toBe(3)
  })

  it('W3 (a9g) win32: RunningAppID never matching spawns no PowerShell across the start window', async () => {
    const { deps, clock, registry, sent, psCalls } = setupWin([])
    const { settled } = startSteamLaunchWatch(deps, '264160')
    await tick500(clock, 92000)
    await settled
    expect(psCalls()).toBe(0)
    expect(sent).toEqual(['launching', 'done'])
    expect(registry.size).toBe(0)
  })

  it('W4 (a9g) win32: Steam reports the appId but 5 scans are empty and the poller has not read it: launching then done', async () => {
    const { deps, clock, registry, sent, state, psCalls } = setupWin([
      { ...winList([]), repeat: true }
    ])
    state.running = 264160
    const { settled } = startSteamLaunchWatch(deps, '264160')
    await tick500(clock, 12000)
    await settled
    expect(psCalls()).toBe(5)
    expect(sent).toEqual(['launching', 'done'])
    expect(registry.size).toBe(0)
  })

  it('W5 (a9g) win32: 10 failed confirm scans after playing send exactly one done', async () => {
    const { deps, clock, sent, state } = setupWin([
      winList([42]),
      { ...WIN_FAIL, repeat: true }
    ])
    state.running = 264160
    state.alive.add(42)
    const { settled } = startSteamLaunchWatch(deps, '264160')
    await tick500(clock, 2000)
    expect(sent).toEqual(['launching', 'playing'])
    state.alive.delete(42)
    await tick500(clock, 8000)
    await settled
    expect(sent).toEqual(['launching', 'playing', 'done'])
  })

  it('W6 (a9g) win32: pollerHold is taken synchronously at start, and released with true after the watch own done', async () => {
    const { deps, clock, holds, released, state } = setupWin([
      winList([42]),
      winList([])
    ])
    state.running = 264160
    state.alive.add(42)
    const { settled } = startSteamLaunchWatch(deps, '264160')
    expect(holds).toEqual(['264160'])
    expect(released).toEqual([])
    await tick500(clock, 2000)
    state.alive.delete(42)
    await tick500(clock, 1000)
    await settled
    expect(released).toEqual([true])
  })

  it('W7 (a9g) win32: cancel releases true; start-window end, bail and no folder release false; exactly once', async () => {
    const cancel = setupWin([winList([42])])
    cancel.state.running = 264160
    cancel.state.alive.add(42)
    const c = startSteamLaunchWatch(cancel.deps, '264160')
    await tick500(cancel.clock, 2000)
    cancelSteamLaunchWatch(cancel.registry, '264160')
    await c.settled
    await tick500(cancel.clock, 2000)
    expect(cancel.released).toEqual([true])

    const window = setupWin([])
    const w = startSteamLaunchWatch(window.deps, '264160', {
      startWindowMs: 6000
    })
    await tick500(window.clock, 8000)
    await w.settled
    expect(window.released).toEqual([false])

    const bail = setupWin([{ ...winList([]), repeat: true }])
    bail.state.running = 264160
    const b = startSteamLaunchWatch(bail.deps, '264160')
    await tick500(bail.clock, 12000)
    await b.settled
    expect(bail.released).toEqual([false])

    const noFolder = setup([], { platform: 'win32', libs: undefined })
    await startSteamLaunchWatch(noFolder.deps, '264160').settled
    expect(noFolder.holds).toEqual(['264160'])
    expect(noFolder.released).toEqual([false])
  })

  it('W8 (a9g) a darwin watch never calls pollerHold', async () => {
    const t = setup([], { libs: undefined })
    await startSteamLaunchWatch(t.deps, '264160').settled
    expect(t.holds).toEqual([])
    expect(t.released).toEqual([])
    expect(t.sent).toEqual([])
  })

  it('A1 (am0) win32 already running: no launching, the poller playing is not overwritten', async () => {
    const t = setupWin([winList([42]), winList([])])
    t.state.running = 264160
    t.state.alive.add(42)
    const { deps, clock, sent } = t
    deps.pollerReports = () => true
    const { settled } = startSteamLaunchWatch(deps, '264160')
    expect(sent).toEqual([])
    await tick500(clock, 2000)
    expect(sent).toEqual(['playing'])
    t.state.alive.delete(42)
    await tick500(clock, 1000)
    await settled
    expect(sent).toEqual(['playing', 'done'])
  })

  it('A2 (am0) win32 Stop during Launching: shown is true and the watch sends nothing more', async () => {
    const { deps, clock, registry, sent, released } = setupWin([])
    startSteamLaunchWatch(deps, '264160')
    expect(sent).toEqual(['launching'])
    expect(cancelSteamLaunchWatch(registry, '264160')).toEqual({
      cancelled: true,
      shown: true
    })
    await tick500(clock, 92000)
    expect(sent).toEqual(['launching'])
    expect(released).toEqual([true])
    expect(registry.size).toBe(0)
    expect(clock.pendingCount()).toBe(0)
  })

  it('A3 (am0) win32 relaunch during Launching: one watch, no second launching, no stacked timer, window restarts', async () => {
    const { deps, clock, sent } = setupWin([])
    const first = startSteamLaunchWatch(deps, '264160', { startWindowMs: 6000 })
    await tick500(clock, 3000)
    const again = startSteamLaunchWatch(deps, '264160', { startWindowMs: 6000 })
    expect(first.status).toBe('started')
    expect(again.status).toBe('already-watching')
    expect(sent).toEqual(['launching'])
    expect(clock.pendingCount()).toBe(1)
    await tick500(clock, 3000) // t = 6000: the original window would have ended
    expect(sent).toEqual(['launching'])
    await tick500(clock, 4500) // t = 10500: the 2 s search tick at 10000 ends the restarted window
    await first.settled
    expect(sent).toEqual(['launching', 'done'])
  })

  it('A3b (am0) win32 relaunch during Launching then found: exactly one playing', async () => {
    const { deps, clock, sent, state } = setupWin([winList([42]), winList([])])
    const { settled } = startSteamLaunchWatch(deps, '264160')
    await tick500(clock, 1000)
    startSteamLaunchWatch(deps, '264160')
    state.running = 264160
    state.alive.add(42)
    await tick500(clock, 4000)
    expect(sent).toEqual(['launching', 'playing'])
    state.alive.delete(42)
    await tick500(clock, 1000)
    await settled
    expect(sent).toEqual(['launching', 'playing', 'done'])
  })

  it('A4 (am0) win32: the poller claim is released before the fallback done', async () => {
    const order: string[] = []
    const t = setupWin([])
    t.deps.sendStatus = (_id, status) => void order.push(status)
    t.deps.pollerHold = () => (terminalSent) =>
      void order.push(`release:${String(terminalSent)}`)
    const { settled } = startSteamLaunchWatch(t.deps, '264160', {
      startWindowMs: 6000
    })
    await tick500(t.clock, 8000)
    await settled
    expect(order).toEqual(['launching', 'release:false', 'done'])
  })

  it('A5 (am0) win32 hand-back: the poller reporting the appId by the bail suppresses done', async () => {
    const t = setupWin([{ ...winList([]), repeat: true }])
    t.state.running = 264160
    let reports = false
    t.deps.pollerReports = () => reports
    const { settled } = startSteamLaunchWatch(t.deps, '264160')
    await tick500(t.clock, 8000) // four empty scans
    reports = true
    await tick500(t.clock, 4000)
    await settled
    expect(t.sent).toEqual(['launching'])
    expect(t.released).toEqual([false])
  })

  it('A6 (am0) win32 no install folder: launching then done, claim released false', async () => {
    const t = setup([], { platform: 'win32', libs: undefined })
    await startSteamLaunchWatch(t.deps, '264160').settled
    expect(t.sent).toEqual(['launching', 'done'])
    expect(t.released).toEqual([false])
  })

  it('A7 (am0) win32 unexpected error: one warn, launching then done', async () => {
    const t = setup([], { platform: 'win32', libs: [WIN_LIB] })
    t.deps.readRunningAppId = () => Promise.reject(new Error('reg boom'))
    const { settled } = startSteamLaunchWatch(t.deps, '264160')
    await tick500(t.clock, 2000)
    await settled
    expect(t.sent).toEqual(['launching', 'done'])
    expect(t.released).toEqual([false])
    expect(t.log.lines.filter((l) => l.level === 'warn')).toHaveLength(1)
  })

  it('A8 (am0) win32 holds no keepAlive while Launching', async () => {
    const { deps, clock } = setupWin([])
    startSteamLaunchWatch(deps, '264160')
    await tick500(clock, 4000)
    clock.assertNoKeepAlive()
  })

  it('T7 relaunch dedupes and re-asserts playing', async () => {
    const { deps, clock, runner, sent } = setup([{ ...PRESENT, repeat: true }])
    startSteamLaunchWatch(deps, '264160')
    await tick(clock, 2)
    expect(sent).toEqual(['playing'])
    const again = startSteamLaunchWatch(deps, '264160')
    expect(again.status).toBe('already-watching')
    const before = runner.calls.length
    await tick(clock)
    expect(runner.calls.length - before).toBe(1)
    expect(sent).toEqual(['playing', 'playing'])
    await tick(clock)
    expect(sent).toEqual(['playing', 'playing'])
  })

  it('T7b relaunch before playing resets the start window', async () => {
    const { deps, clock, sent } = setup([{ ...EMPTY, repeat: true }])
    const { settled } = startSteamLaunchWatch(deps, '264160', {
      startWindowMs: 10000
    })
    await tick(clock, 3)
    startSteamLaunchWatch(deps, '264160')
    await tick(clock, 3)
    // 12s after first start, 6s after the relaunch: still watching
    expect(deps.registry.has('264160')).toBe(true)
    await tick(clock, 3)
    await settled
    expect(sent).toEqual([])
    expect(deps.registry.size).toBe(0)
  })

  it('T8 cancel stops everything', async () => {
    const { deps, clock, runner, registry, sent } = setup([
      { ...PRESENT, repeat: true }
    ])
    startSteamLaunchWatch(deps, '264160')
    await tick(clock, 2)
    expect(cancelSteamLaunchWatch(registry, '264160')).toEqual({
      cancelled: true,
      shown: true
    })
    const calls = runner.calls.length
    await tick(clock, 3)
    expect(runner.calls.length).toBe(calls)
    expect(sent).toEqual(['playing'])
    expect(clock.pendingCount()).toBe(0)
    expect(cancelSteamLaunchWatch(registry, 'nope')).toEqual({
      cancelled: false,
      shown: false
    })
  })

  it('T8b cancel during an in-flight scan sends nothing', async () => {
    const { deps, clock, runner, registry, sent } = setup([
      {
        cmd: '/bin/ps',
        hold: true,
        result: { code: 0, stdout: `1234 ${GAME}\n` }
      }
    ])
    const { settled } = startSteamLaunchWatch(deps, '264160')
    await tick(clock)
    cancelSteamLaunchWatch(registry, '264160')
    runner.release('/bin/ps')
    await settled
    expect(sent).toEqual([])
  })

  it('T9 poller reporting the appId ends the watch quietly', async () => {
    let report = false
    const { deps, clock, registry, sent } = setup(
      [{ ...PRESENT, repeat: true }],
      {
        poller: () => report
      }
    )
    const { settled } = startSteamLaunchWatch(deps, '264160')
    await tick(clock, 2)
    report = true
    await tick(clock)
    await settled
    expect(sent).toEqual(['playing'])
    expect(registry.size).toBe(0)
  })

  it('T10 consecutive scan failures after playing send one done', async () => {
    const { deps, clock, log, sent } = setup([
      PRESENT,
      FAIL,
      TIMEOUT,
      { ...FAIL, repeat: true }
    ])
    const { settled } = startSteamLaunchWatch(deps, '264160', {
      maxScanFailures: 3
    })
    await tick(clock, 6)
    await settled
    expect(sent).toEqual(['playing', 'done'])
    expect(log.lines.some((l) => l.level === 'warn')).toBe(true)
  })

  it('T10b failures before playing run down the start window', async () => {
    const { deps, clock, sent } = setup([{ ...FAIL, repeat: true }])
    const { settled } = startSteamLaunchWatch(deps, '264160', {
      startWindowMs: 6000,
      maxScanFailures: 2
    })
    await tick(clock, 5)
    await settled
    expect(sent).toEqual([])
  })

  it('T11 no keepAlive timers while live', async () => {
    const { deps, clock } = setup([{ ...PRESENT, repeat: true }])
    startSteamLaunchWatch(deps, '264160')
    await tick(clock, 2)
    clock.assertNoKeepAlive()
  })
})
