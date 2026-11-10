import { createCaptureLog } from 'backend/testUtils/captureLog'
import { createFakeClock } from 'backend/testUtils/fakeClock'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import type { ScriptStep } from 'backend/testUtils/scriptedRunner'

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
  const deps: SteamLaunchWatchDeps = {
    runner,
    clock,
    platform: o.platform ?? 'darwin',
    log,
    getSteamLibraries: () => Promise.resolve('libs' in o ? o.libs : ['/lib']),
    readAcfInstalldir: () => ('acf' in o ? o.acf : 'WazHack'),
    sanitizeInstalldir: (c) => c,
    readExe: jest.fn(),
    realpath: (p) => p,
    selfPids: [900],
    registry,
    sendStatus: (_id, status) => void sent.push(status),
    pollerReports: o.poller ?? (() => false)
  }
  return { deps, runner, clock, log, registry, sent }
}

async function tick(clock: ReturnType<typeof createFakeClock>, n = 1) {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 10; j++) await Promise.resolve()
    clock.advance(2000)
    for (let j = 0; j < 10; j++) await Promise.resolve()
  }
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

  it('T6 win32 is unsupported', () => {
    const { deps, runner, registry } = setup([], { platform: 'win32' })
    const r = startSteamLaunchWatch(deps, '264160')
    expect(r.status).toBe('unsupported-platform')
    expect(runner.calls).toHaveLength(0)
    expect(registry.size).toBe(0)
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
