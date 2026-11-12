/**
 * 66.4-05: the boot-owned engine runtime. Two runtimes share nothing; single-flight is per
 * instance; launch deadlines run on the injected clock and leave no timer behind; construction
 * arms nothing.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { GameSettings } from 'common/types'
import * as logger from 'backend/logger'

import { createFakeClock } from 'backend/testUtils/fakeClock'
import { createTestEngineRuntime } from 'backend/testUtils/testEngineRuntime'
import { createTestEngineServices } from 'backend/testUtils/testServices'
import { LAUNCH_DEADLINE_MS } from '../launchDeadline'
import { ENGINE_MARKER_FILE, switchContextFrom } from '../engineSwitch'
import type { EngineSwitchDeps } from '../engineSwitch'
import { buildFallbackGameSettings } from '../bottlePrimitives'
import type { EngineSelection } from '../engineTypes'

const cx: EngineSelection = {
  kind: 'crossover',
  reason: 'cx-healthy',
  crossoverBuild: null,
  binDir: '/cx/bin'
}

// The boot installs the real log writer; here the three levels the engine uses are silenced.
beforeEach(() => {
  jest.spyOn(logger, 'logInfo').mockImplementation(() => undefined)
  jest.spyOn(logger, 'logWarning').mockImplementation(() => undefined)
  jest.spyOn(logger, 'logError').mockImplementation(() => undefined)
})

describe('createEngineRuntime', () => {
  it('construction arms no timer', () => {
    const clock = createFakeClock()
    createTestEngineRuntime({ clock })
    expect(clock.pendingCount()).toBe(0)
  })

  it('two runtimes share no ledger, selection, overlay context or deadline', () => {
    const clock = createFakeClock()
    const a = createTestEngineRuntime({ clock })
    const b = createTestEngineRuntime({ clock })
    a.ledger.markGameRunning('GameLib', 'gog:1')
    expect(b.ledger.gamesRunningIn('GameLib')).toEqual([])
    a.launchSettings.setLaunchOverlayContext('gog:1', {
      prefix: { kind: 'plain' }
    })
    expect(b.launchSettings.getLaunchOverlayContext('gog:1')).toBeUndefined()
    a.deadlines.armLaunchDeadline({ key: 'gog:1', onDeadline: jest.fn() })
    expect(a.deadlines.activeCount()).toBe(1)
    expect(b.deadlines.activeCount()).toBe(0)
    a.launchState.rememberLedgerBottle('gog:1', 'GameLib')
    expect(b.launchState.takeLedgerBottle('gog:1')).toBeUndefined()
    expect(a.launchState.takeLedgerBottle('gog:1')).toBe('GameLib')
  })

  it('a launch deadline fires on the injected clock and leaves no timer after stop', () => {
    const clock = createFakeClock()
    const rt = createTestEngineRuntime({ clock })
    const onDeadline = jest.fn()
    rt.deadlines.armLaunchDeadline({ key: 'gog:1', onDeadline })
    expect(clock.pendingCount()).toBe(1)
    expect(clock.keepAliveReasons()).toEqual([])
    clock.advance(LAUNCH_DEADLINE_MS - 1)
    expect(onDeadline).not.toHaveBeenCalled()
    clock.advance(1)
    expect(onDeadline).toHaveBeenCalledTimes(1)
    rt.deadlines.armLaunchDeadline({ key: 'gog:2', onDeadline: jest.fn() })
    rt.deadlines.cancelLaunchDeadline('gog:2', 'launcher-exited')
    expect(clock.pendingCount()).toBe(0)
    expect(rt.deadlines.activeCount()).toBe(0)
  })

  it('the CrossOver memo is per instance', () => {
    const a = createTestEngineRuntime()
    const b = createTestEngineRuntime()
    expect(a.crossover).not.toBe(b.crossover)
    expect(a.registry.setEngineSelection('gog:1', cx)).toBe(true)
    expect(b.registry.getEngineSelection('gog:1')).toBeUndefined()
  })
})

describe('FALLBACK_STRIPPED_ENV_KEYS (T-66.4-16)', () => {
  it('still strips every former member, case-insensitively, and keeps the rest', () => {
    const former = [
      'USER',
      'WINEPREFIX',
      'CX_BOTTLE',
      'CX_ROOT',
      'WINELOADER',
      'WINESERVER',
      'WINEDEBUG',
      'MVK_CONFIG_LOG_LEVEL'
    ]
    const out = buildFallbackGameSettings(
      { userHome: '/h' },
      'B',
      {
        wineBin: '/w',
        wineserverBin: '/s',
        label: 'L',
        version: '1',
        dxvk: null
      },
      {
        enviromentOptions: [
          ...former.map((key) => ({ key: key.toLowerCase(), value: 'bad' })),
          { key: 'KEEP', value: 'yes' }
        ]
      } as GameSettings
    )
    const keys = (out.enviromentOptions ?? []).map((e) => e.key)
    for (const key of former) {
      expect(
        (out.enviromentOptions ?? []).filter(
          (e) => e.key.toLowerCase() === key.toLowerCase() && e.value === 'bad'
        )
      ).toEqual([])
    }
    expect(keys).toContain('KEEP')
  })
})

describe('single-flight per boot instance', () => {
  let root: string
  const NAME = 'GameLibSteamBridge-620'
  const pinned: EngineSelection = {
    kind: 'pinned',
    pinId: 'p',
    reason: 'cx-missing',
    wineBin: '/pin/wine',
    wineserverBin: '/pin/wineserver',
    label: 'Pinned',
    version: '1',
    dxvk: { dir: '/pin/dxvk', version: 'v1' }
  }
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'gamelib-runtime-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  function switchDeps(
    rt: ReturnType<typeof createTestEngineRuntime>,
    install: jest.Mock
  ): Pick<EngineSwitchDeps, never> & EngineSwitchDeps {
    const services = createTestEngineServices({
      engineRuntime: rt,
      paths: { ...createTestEngineServices().paths, userHome: root }
    })
    return {
      ctx: switchContextFrom(services),
      getMonitorPhase: () => null,
      killWith: jest.fn().mockResolvedValue(true),
      resolveCrossoverBinDir: () => Promise.resolve('/cx/bin'),
      installRemove: install,
      crossoverSettings: () => ({}) as GameSettings,
      fallbackSettings: () => ({}) as GameSettings,
      currentPinEngine: () => null,
      ensurePinEngine: () => Promise.resolve(null)
    }
  }

  const bottleDir = () =>
    join(root, 'Library/Application Support/CrossOver/Bottles', NAME)

  function seed(): void {
    const dir = bottleDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, ENGINE_MARKER_FILE),
      JSON.stringify({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    )
  }

  const tick = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve()
  }

  it('concurrent switches of one bottle share one runtime and run the install once; another runtime is independent', async () => {
    seed()
    let release: (v: boolean) => void = () => undefined
    const gate = new Promise<boolean>((res) => {
      release = res
    })
    const dxvkMarker = () =>
      writeFileSync(join(bottleDir(), 'current_dxvk-macOS'), 'v1')
    const install = jest
      .fn()
      .mockImplementation(async (_s: unknown, _t: unknown, action: string) => {
        await gate
        if (action === 'backup') dxvkMarker()
        return true
      })
    const rt = createTestEngineRuntime()
    const deps = switchDeps(rt, install)
    const a = rt.switcher.prepareBottleForEngine({
      key: '620',
      bottleName: NAME,
      next: pinned,
      deps
    })
    const b = rt.switcher.prepareBottleForEngine({
      key: '620',
      bottleName: NAME,
      next: pinned,
      deps
    })
    await tick()
    expect(install).toHaveBeenCalledTimes(1)

    // A second boot instance is not serialised behind the first.
    const otherInstall = jest
      .fn()
      .mockImplementation(async (_s: unknown, _t: unknown, action: string) => {
        await gate
        if (action === 'backup') dxvkMarker()
        return true
      })
    const other = createTestEngineRuntime()
    const c = other.switcher.prepareBottleForEngine({
      key: '620',
      bottleName: NAME,
      next: pinned,
      deps: switchDeps(other, otherInstall)
    })
    await tick()
    expect(otherInstall).toHaveBeenCalledTimes(1)

    release(true)
    await Promise.all([a, b, c])
    expect(install).toHaveBeenCalledTimes(1)

    // After it settles a new request starts a new switch.
    const again = await rt.switcher.prepareBottleForEngine({
      key: '620',
      bottleName: NAME,
      next: pinned,
      deps
    })
    expect(again).toEqual({ ok: true, changed: false })
  })

  it('concurrent per-game bottle creations share one promise; another runtime starts its own', async () => {
    const rt = createTestEngineRuntime()
    const services = createTestEngineServices({ engineRuntime: rt })
    let release: (v: unknown) => void = () => undefined
    const gate = new Promise((res) => {
      release = res
    })
    const make = () => ({
      isProvisioned: () => false,
      currentPin: () => ({ id: 'pin' }) as never,
      decide: jest
        .fn()
        .mockResolvedValue({ kind: 'pinned', reason: 'cx-missing', pin: {} }),
      resolveBinDir: () => Promise.resolve(undefined),
      createCrossover: jest.fn(),
      ensurePin: jest.fn().mockResolvedValue({
        ok: true,
        engine: { wineBin: '/w', wineserverBin: '/s', label: 'L' }
      }),
      createFallback: jest.fn().mockImplementation(async () => {
        await gate
        return { status: 'done', createdHere: true }
      })
    })
    const args = {
      key: 'gog:1' as const,
      bottleName: 'GameLib-gog-1',
      appName: '1',
      runner: 'gog' as const
    }
    const d1 = make()
    const d2 = make()
    const a = rt.perGameBottle.ensureGameBottle(services, args, d1 as never)
    const b = rt.perGameBottle.ensureGameBottle(services, args, d1 as never)
    const other = createTestEngineRuntime()
    const c = other.perGameBottle.ensureGameBottle(services, args, d2 as never)
    await tick()
    release(undefined)
    await Promise.all([a, b, c])
    expect(d1.createFallback).toHaveBeenCalledTimes(1)
    expect(d2.createFallback).toHaveBeenCalledTimes(1)
    // after it settled, a new request starts a new creation
    await rt.perGameBottle.ensureGameBottle(services, args, d1 as never)
    expect(d1.createFallback).toHaveBeenCalledTimes(2)
  })
})
