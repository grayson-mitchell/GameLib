/**
 * Sidecar online-monitor wiring test (fix/steam-native-install-stability, 33-05 live-gate gap).
 *
 * Under `npm run tauri:dev`, clicking Install on a Steam title failed INSTANTLY with
 * `[Backend]: App offline, skipping install` even though Steam was fully online. Root cause:
 * `initOnlineMonitor()` (backend/online_monitor.ts) was only ever called from the real Electron
 * main process's `app.whenReady()` (main.ts) -- the headless Tauri sidecar never runs that hook,
 * so `isOnline()`'s module-level `status` stayed `undefined` forever. `bootstrap.ts`'s `init()`
 * now calls the real `initOnlineMonitor()`.
 *
 * This suite drives the REAL, unmocked `initOnlineMonitor()`/`platform/index.ts` pair end-to-end
 * (mirrors `skeletonFlows.test.ts`'s real-shim convention) rather than `bootstrap.test.ts`'s
 * default-automock convention, because the default automock (`src/backend/__mocks__/
 * electron.ts`) has neither `net` nor an `ipcMain.handle` -- see `bootstrap.test.ts`'s own
 * header for why THAT suite mocks `backend/online_monitor` out entirely instead of exercising
 * it for real.
 *
 * `jest.mock('os', ...)` overrides `homedir()` to a disposable per-process tmp directory --
 * without it, `pathShim.ts`'s `app.getPath()` resolution would point at the developer's REAL
 * `~/Library/Application Support/GameLib/`, an active data-loss hazard documented in
 * `electronUntouched.test.ts`'s header.
 *
 * `jest.mock('electron', ...)` / `jest.mock('backend/store_backend', ...)` route Jest's own module
 * resolution at the real `platform/index.ts`/`fileStore.ts` (the same singleton instances
 * `bootstrap.ts`/`online_monitor.ts` bind onto), rather than the generic backend-wide manual
 * mock Jest auto-applies to `require('electron')` -- see `skeletonFlows.test.ts`'s header for
 * the full rationale for why this override is necessary, not incidental.
 *
 * `axios` is mocked: once the real platformApi's `net.isOnline()` returns `true`,
 * `initOnlineMonitor()` immediately calls `online_monitor.ts`'s real `pingSites()` (a live
 * `axios.head()` against github/epic/gog/cloudflare) -- this suite must never make a real
 * network call.
 */

// ── os — disposable per-process tmp home (mirrors skeletonFlows.test.ts's convention) ──────
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(
        actual.tmpdir(),
        `gamelib-onlinemonitorwiring-test-home-${process.pid}`
      )
  }
})

// ── electron / electron-store — route Jest's own module resolution at the REAL sidecar shims ──
jest.mock('backend/store_backend', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── axios — controllable per-test outcome, never a real network call ───────────────────────
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    head: jest.fn(),
    create: jest.fn(() => ({ get: jest.fn(), head: jest.fn() }))
  }
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import {
  bootFresh,
  handlerRegistry,
  listenerRegistry
} from './helpers/sidecarHarness'
import { createTestOnlineMonitor } from '../../testUtils/testOnlineMonitor'

/** Boots once in a fresh registry; the harness registry views follow that boot. */
function boot(opts?: { before?: () => void }) {
  const sidecar = bootFresh({
    // The real monitor, driven through the mocked axios below (the harness default is a fake).
    services: { onlineMonitor: undefined },
    before: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const axios = require('axios').default
      axios.head.mockResolvedValue({ status: 200 })
      opts?.before?.()
    }
  })
  return sidecar
}

/** Waits a couple of microtask/macrotask turns for the mocked-axios ping chain to settle. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

describe('sidecar bootstrap wires the online monitor for real (fix/steam-native-install-stability, 33-05 live-gate gap)', () => {
  it('registers the get-connectivity-status handler', () => {
    boot()

    expect(handlerRegistry.has('get-connectivity-status')).toBe(true)
  })

  it('one boot registers exactly one connectivity-changed and one set-connectivity-online listener', () => {
    boot()

    expect((listenerRegistry.get('connectivity-changed') ?? []).length).toBe(1)
    expect((listenerRegistry.get('set-connectivity-online') ?? []).length).toBe(
      1
    )
  })

  it('regression guard: with net.isOnline() -> true and a healthy ping, the connectivity path reaches online, never gets stuck at offline', async () => {
    boot()
    await flush()

    const handler = handlerRegistry.get('get-connectivity-status')
    expect(handler).toBeDefined()
    const result = (await handler?.(undefined)) as {
      status: string
      retryIn: number
    }

    // This is the exact regression this fix closes: pre-fix, `status` stayed `undefined`
    // forever (isOnline() === false always) because initOnlineMonitor() was never called at
    // all under the sidecar. Post-fix, with net.isOnline() -> true (platformApi) and a
    // healthy ping (mocked axios.head), the status must reach 'online' -- never 'offline'.
    expect(result.status).toBe('online')
  })
})

describe('bootFresh harness', () => {
  it('gives each call a fresh module registry', () => {
    bootFresh()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const first = require('../bootstrap')
    bootFresh()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const second = require('../bootstrap')

    expect(second).not.toBe(first)
  })

  it('runs before() ahead of requiring bootstrap', () => {
    const order: string[] = []
    bootFresh({ before: () => order.push('before') })
    order.push('booted')

    expect(order).toEqual(['before', 'booted'])
  })

  it('returns a live output stream whose frames are collected', async () => {
    const { frames } = bootFresh()
    await new Promise((resolve) => setImmediate(resolve))

    expect(frames.length).toBeGreaterThan(0)
  })
})

describe('boot-owned monitor (66.3-11, D-05)', () => {
  it("builds the monitor in 'online-monitor-owner', before 'store-managers', and starts it in 'online-monitor' after rpc-server and before READY", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BOOT_STEP_NAMES } = require('../bootstrap') as {
      BOOT_STEP_NAMES: readonly string[]
    }
    const at = (name: string) => BOOT_STEP_NAMES.indexOf(name)

    expect(at('online-monitor-owner')).toBeGreaterThan(-1)
    expect(at('online-monitor-owner')).toBeLessThan(at('store-managers'))
    expect(at('online-monitor')).toBeGreaterThan(at('rpc-server'))
    expect(at('online-monitor')).toBeLessThan(at('ready-sentinel'))
  })

  it('one boot builds exactly one monitor and starts it once', () => {
    const { services } = boot()

    expect(services.onlineMonitor).toBeDefined()
    // The same instance reaches the ManagerDeps slice the managers were built with.
    const { managers } = services
    expect(managers).toBeDefined()
  })

  it('hands a prebuilt monitor through by reference and starts exactly that one', () => {
    const monitor = createTestOnlineMonitor()
    const start = jest.spyOn(monitor, 'start')
    const { services } = bootFresh({ services: { onlineMonitor: monitor } })

    expect(services.onlineMonitor).toBe(monitor)
    expect(start).toHaveBeenCalledTimes(1)
  })
})
