/**
 * The boot-owned Steam launch runtime (66.4-06, D-05): two runtimes keep independent state, the
 * raise loop runs on the injected clock and cancels cleanly, the DRM-mode notice latch fires once
 * per key per runtime, the platform-capture chain runs strictly in order and survives a rejection,
 * and construction arms nothing.
 */
import { createFakeClock } from 'backend/testUtils/fakeClock'
import { createSteamLaunchRuntime } from '../steamLaunchRuntime'
import type { BottledRaiseDeps } from '../bottledSteam'
import type { DrmBridgeRunner } from '../bridgeBottle'

const flush = async (times = 20) => {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

describe('createSteamLaunchRuntime', () => {
  it('arms no timer at construction', () => {
    const clock = createFakeClock()
    createSteamLaunchRuntime({ clock })
    expect(clock.pendingCount()).toBe(0)
  })

  it('keeps two runtimes fully independent', () => {
    const a = createSteamLaunchRuntime({ clock: createFakeClock() })
    const b = createSteamLaunchRuntime({ clock: createFakeClock() })
    expect(a.monitors).not.toBe(b.monitors)
    expect(a.raiser).not.toBe(b.raiser)
    expect(a.drmRunners).not.toBe(b.drmRunners)
    expect(a.drmNotice).not.toBe(b.drmNotice)
    expect(a.platformCapture).not.toBe(b.platformCapture)
    expect(a.monitors.getBottleProcessMonitorPhase('1')).toBeNull()
    expect(a.monitors.getActiveMonitorKind('1')).toBeUndefined()
    a.monitors.stopBottleProcessMonitor('1')
    a.monitors.stopAllBottleProcessMonitors()
  })

  describe('DRM runner registry', () => {
    const runner = {
      cxRoot: '/cx',
      crossoverBuild: '1',
      runnerDir: '/cx/run',
      wrapperBin: '/cx/run/wrap'
    } as unknown as DrmBridgeRunner

    it('refuses a non-numeric appId and starts empty per runtime', () => {
      const a = createSteamLaunchRuntime({ clock: createFakeClock() })
      const b = createSteamLaunchRuntime({ clock: createFakeClock() })
      expect(a.drmRunners.setOverlayBridgeRunner('abc', runner)).toBe(false)
      expect(a.drmRunners.getDrmBridgeRunner('1')).toBeUndefined()
      expect(b.drmRunners.getDrmBridgeRunner('1')).toBeUndefined()
      expect(a.drmRunners.drmRunnerBinDir('1')).toBeUndefined()
      a.drmRunners.clearDrmBridgeRunner('1')
      expect(a.drmRunners.getBridgeRunnerKind('1')).toBeUndefined()
    })
  })

  describe('DRM-mode notice latch', () => {
    it('claims once per key per runtime', () => {
      const a = createSteamLaunchRuntime({ clock: createFakeClock() })
      const b = createSteamLaunchRuntime({ clock: createFakeClock() })
      expect(a.drmNotice.claim('1|bottle-stage')).toBe(true)
      expect(a.drmNotice.claim('1|bottle-stage')).toBe(false)
      expect(a.drmNotice.claim('1|resign')).toBe(true)
      expect(b.drmNotice.claim('1|bottle-stage')).toBe(true)
    })
  })

  describe('platform capture chain', () => {
    it('runs sections strictly in order and a rejection does not break the chain', async () => {
      const { platformCapture } = createSteamLaunchRuntime({
        clock: createFakeClock()
      })
      const order: string[] = []
      let releaseFirst: () => void = () => undefined
      const first = platformCapture.withPlatformCaptureLock(async () => {
        order.push('first-start')
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
        order.push('first-end')
        throw new Error('boom')
      })
      const second = platformCapture.withPlatformCaptureLock(() => {
        order.push('second')
        return Promise.resolve('ok')
      })
      await flush()
      expect(order).toEqual(['first-start'])
      releaseFirst()
      await expect(first).rejects.toThrow('boom')
      await expect(second).resolves.toBe('ok')
      expect(order).toEqual(['first-start', 'first-end', 'second'])
    })

    it('does not share a chain between runtimes', async () => {
      const a = createSteamLaunchRuntime({ clock: createFakeClock() })
      const b = createSteamLaunchRuntime({ clock: createFakeClock() })
      let hold: () => void = () => undefined
      const blocked = a.platformCapture.withPlatformCaptureLock(
        () =>
          new Promise<void>((resolve) => {
            hold = resolve
          })
      )
      await expect(
        b.platformCapture.withPlatformCaptureLock(() => Promise.resolve(1))
      ).resolves.toBe(1)
      hold()
      await blocked
    })
  })

  describe('bottled-Steam raise loop', () => {
    const makeDeps = (
      runtime: ReturnType<typeof createSteamLaunchRuntime>
    ): { deps: BottledRaiseDeps; hide: jest.Mock; spawn: jest.Mock } => {
      const hide = jest.fn()
      const spawn = jest.fn().mockResolvedValue({
        code: 0,
        stdout: 'none',
        stderr: ''
      })
      return {
        deps: {
          spawnAsync: spawn,
          runner: { run: jest.fn() },
          appState: { hide },
          steamLaunchRuntime: runtime
        } as unknown as BottledRaiseDeps,
        hide,
        spawn
      }
    }

    it('sleeps on the injected clock and cancelRaiseLoops clears every pending timer', async () => {
      const clock = createFakeClock()
      const runtime = createSteamLaunchRuntime({ clock })
      const { deps, hide } = makeDeps(runtime)
      void runtime.raiser.raiseFrontmostBottledProcess(deps, 'test', 'script')
      await flush()
      expect(clock.pendingCount()).toBe(1)
      clock.assertNoKeepAlive()

      runtime.raiser.cancelRaiseLoops()
      expect(clock.pendingCount()).toBe(0)
      // The cancelled loop's sleep never resolves, so it never reaches the app.hide() fallback.
      clock.runAll()
      await flush()
      expect(hide).not.toHaveBeenCalled()
    })

    it('a fresh loop after a cancel is not suppressed (the flag resets per loop)', async () => {
      const clock = createFakeClock()
      const runtime = createSteamLaunchRuntime({ clock })
      const { deps } = makeDeps(runtime)
      runtime.raiser.cancelRaiseLoops()
      void runtime.raiser.raiseFrontmostBottledProcess(deps, 'test', 'script')
      await flush()
      expect(clock.pendingCount()).toBe(1)
      runtime.raiser.cancelRaiseLoops()
    })

    it('the cancel of one runtime leaves another runtime loop untouched', async () => {
      const clockA = createFakeClock()
      const clockB = createFakeClock()
      const a = createSteamLaunchRuntime({ clock: clockA })
      const b = createSteamLaunchRuntime({ clock: clockB })
      void b.raiser.raiseFrontmostBottledProcess(
        makeDeps(b).deps,
        'test',
        'script'
      )
      await flush()
      a.raiser.cancelRaiseLoops()
      expect(clockB.pendingCount()).toBe(1)
      b.raiser.cancelRaiseLoops()
      expect(clockB.pendingCount()).toBe(0)
    })
  })
})
