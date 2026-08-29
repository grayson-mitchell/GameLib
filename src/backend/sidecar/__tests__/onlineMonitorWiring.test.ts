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
 * This suite drives the REAL, unmocked `initOnlineMonitor()`/`electronStub.ts` pair end-to-end
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
 * resolution at the real `electronStub.ts`/`fileStore.ts` (the same singleton instances
 * `bootstrap.ts`/`online_monitor.ts` bind onto), rather than the generic backend-wide manual
 * mock Jest auto-applies to `require('electron')` -- see `skeletonFlows.test.ts`'s header for
 * the full rationale for why this override is necessary, not incidental.
 *
 * `axios` is mocked: once the real electronStub's `net.isOnline()` returns `true`,
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
jest.mock('electron', () => jest.requireActual('../../platform'))
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
import { PassThrough } from 'node:stream'
import { init } from '../bootstrap'
import { handlerRegistry, listenerRegistry } from '../../platform'
import axios from 'axios'

const mockedAxiosHead = axios.head as jest.Mock

/** Waits a couple of microtask/macrotask turns for the mocked-axios ping chain to settle. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

beforeEach(() => {
  // resetMocks: true wipes any factory-supplied implementation before every test (same
  // gotcha dialogStub.test.ts/lifecycleStub.test.ts document) -- default to a resolved ping
  // (healthy/online) so tests that don't care about the exact outcome aren't left hanging.
  mockedAxiosHead.mockResolvedValue({ status: 200 })
})

describe('sidecar bootstrap wires the online monitor for real (fix/steam-native-install-stability, 33-05 live-gate gap)', () => {
  it('registers the get-connectivity-status handler', () => {
    init(new PassThrough(), new PassThrough())

    expect(handlerRegistry.has('get-connectivity-status')).toBe(true)
  })

  it('is idempotent: calling init() again does not re-register connectivity-changed/set-connectivity-online listeners', () => {
    init(new PassThrough(), new PassThrough())
    const changedBefore = (listenerRegistry.get('connectivity-changed') ?? [])
      .length
    const setOnlineBefore = (
      listenerRegistry.get('set-connectivity-online') ?? []
    ).length

    // A second (and third) init() call -- production never does this, but every other test
    // in this file (and bootstrap.test.ts/skeletonFlows.test.ts) call init() repeatedly
    // against fresh streams, so this must hold regardless of how many times init() has
    // already run in this process.
    init(new PassThrough(), new PassThrough())
    init(new PassThrough(), new PassThrough())

    expect((listenerRegistry.get('connectivity-changed') ?? []).length).toBe(
      changedBefore
    )
    expect((listenerRegistry.get('set-connectivity-online') ?? []).length).toBe(
      setOnlineBefore
    )
  })

  it('regression guard: with net.isOnline() -> true and a healthy ping, the connectivity path reaches online, never gets stuck at offline', async () => {
    mockedAxiosHead.mockResolvedValue({ status: 200 })

    init(new PassThrough(), new PassThrough())
    await flush()

    const handler = handlerRegistry.get('get-connectivity-status')
    expect(handler).toBeDefined()
    const result = (await handler?.(undefined)) as {
      status: string
      retryIn: number
    }

    // This is the exact regression this fix closes: pre-fix, `status` stayed `undefined`
    // forever (isOnline() === false always) because initOnlineMonitor() was never called at
    // all under the sidecar. Post-fix, with net.isOnline() -> true (electronStub) and a
    // healthy ping (mocked axios.head), the status must reach 'online' -- never 'offline'.
    expect(result.status).toBe('online')
  })
})
