/**
 * Headless-boot integration test for the sidecar (Phase 27 Plan 02 — Task 3).
 *
 * Proves spike 009's two import-time walls (app.getPath, electron-store) are
 * shimmed and the sidecar serves its transport contract, by driving
 * bootstrap.ts's exported `init()` in-process with the `Module._load` hook
 * it installs at import time, against injected `stream.PassThrough` pairs.
 * Follows the project's real-tmpdir black-box pattern (steam
 * library.test.ts precedent) rather than mocking `node:fs`/`graceful-fs`,
 * since this project's ts-jest/CJS interop makes fs exports non-mockable
 * (non-configurable getters) — the shims under test (fileStore.ts,
 * pathShim.ts) read/write the real OS config directory instead, exactly as
 * they would in production.
 *
 * `axios` is mocked (fix/steam-native-install-stability, 33-05 live-gate gap): `init()` now
 * wires `initOnlineMonitor()` (see the "online monitor wiring" describe block below), which -- as
 * soon as the sidecar's `net.isOnline()` stub returns `true` -- immediately kicks off
 * `online_monitor.ts`'s real `pingSites()` (axios HEAD against github/epic/gog/cloudflare). Every
 * test in this file calls `init()`, so without this mock EVERY test here would make real network
 * calls. `axios.head` resolves instantly so `Promise.any` settles the same tick tests otherwise
 * observe as passing.
 */
jest.mock('axios', () => {
  // `backend/utils.ts` calls `axios.create(...)` at MODULE SCOPE (its `axiosClient` singleton),
  // so the mock must support both the default export's own `.head()` (online_monitor.ts's
  // direct call) and `.create()` (returning an instance whose `.get`/`.head` are also mocked --
  // covers utils.ts's `axiosClient.get`/`axiosClient.head` callers, not exercised by this file's
  // tests but must not throw at import time).
  const mockInstance = {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    head: jest.fn(() => Promise.resolve({ status: 200 }))
  }
  return {
    __esModule: true,
    default: {
      head: jest.fn(() => Promise.resolve({ status: 200 })),
      create: jest.fn(() => mockInstance)
    }
  }
})

import { PassThrough } from 'node:stream'
import { init } from '../bootstrap'
import { handlerRegistry, listenerRegistry } from '../electronStub'
import {
  READY_SENTINEL,
  UNPORTED_CHANNEL_MARKER
} from 'common/types/sidecarTransport'

/** Buffers newline-delimited output from a PassThrough into discrete lines. */
function collectLines(stream: PassThrough): string[] {
  const lines: string[] = []
  let buffer = ''
  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString()
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      lines.push(buffer.slice(0, newlineIndex))
      buffer = buffer.slice(newlineIndex + 1)
      newlineIndex = buffer.indexOf('\n')
    }
  })
  return lines
}

/** Waits a couple of microtask/macrotask turns for async invoke handlers to resolve. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

describe('sidecar bootstrap (headless boot)', () => {
  // Behavior 1: building + running the sidecar entry under bare `node`
  // (electron absent) reaches READY without an uncaught exception --
  // proves paths.ts's app.getPath() and electron_store.ts's `new Store()`
  // import-time walls (spike 009) are shimmed before backend code sees them.
  it('reaches READY under bare node without an uncaught exception', () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const lines = collectLines(output)

    expect(() => init(input, output)).not.toThrow()

    expect(lines).toContain(READY_SENTINEL)
  })

  // Behavior 2: a health/ping invoke frame written to the sidecar's stdin
  // yields a matching SidecarRpcResponse on stdout within a timeout.
  it('round-trips a health/ping invoke frame over stdio', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const lines = collectLines(output)

    init(input, output)
    input.write(
      `${JSON.stringify({
        id: 'test-ping-1',
        kind: 'invoke',
        channel: 'health',
        args: []
      })}\n`
    )

    await flush()

    const responseLine = lines.find((line) => line.includes('"id":"test-ping-1"'))
    expect(responseLine).toBeDefined()
    expect(JSON.parse(responseLine as string)).toEqual({
      id: 'test-ping-1',
      ok: true,
      result: 'ok'
    })
  })

  // Behavior 2b (27-05 regression): an invoke for one of the ~217 deliberately-unported
  // channels must reject with the UNPORTED_CHANNEL_MARKER tag, not a bare message. The
  // renderer's on-page error surface keys off that marker to distinguish a documented seam
  // gap from a real bootstrap failure; without it, any module-scope `.then()` on an unported
  // channel (e.g. getUploadedLogFiles) paints over the whole app at boot.
  it('tags an unported-channel invoke as an expected seam gap', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const lines = collectLines(output)

    init(input, output)
    input.write(
      `${JSON.stringify({
        id: 'test-unported-1',
        kind: 'invoke',
        channel: 'getUploadedLogFiles',
        args: []
      })}\n`
    )

    await flush()

    const responseLine = lines.find((line) =>
      line.includes('"id":"test-unported-1"')
    )
    expect(responseLine).toBeDefined()
    const response = JSON.parse(responseLine as string)
    // Still an honest rejection -- only the reason is classified.
    expect(response.ok).toBe(false)
    expect(response.error).toContain(UNPORTED_CHANNEL_MARKER)
    expect(response.error).toContain('getUploadedLogFiles')
  })

  // Behavior 3: importing REAL backend modules under the installed stub does
  // not throw -- require('backend/electron_store') constructs a store
  // (electron-store wall shimmed) AND
  // require('backend/storeManagers/steam/library') imports headlessly (the
  // transitive Electron coupling the live 27-05 run hits -- it pulls in
  // backend/utils.ts -> backend/storeManagers/index.ts, which eagerly
  // constructs EVERY store manager at import time). At least one ipcMain
  // handler (bootstrap's own ./handlers import) is recorded in the
  // electronStub registry.
  it('imports real backend modules headlessly under the installed stub', () => {
    expect(() => require('backend/electron_store')).not.toThrow()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TypeCheckedStoreBackend } = require('backend/electron_store')
    const store = new TypeCheckedStoreBackend('configStore', { cwd: 'store' })
    expect(typeof store.get).toBe('function')
    expect(typeof store.set).toBe('function')

    expect(() => require('backend/storeManagers/steam/library')).not.toThrow()

    expect(handlerRegistry.has('health')).toBe(true)
  })
})

// 33-05 live-gate gap (fix/steam-native-install-stability): `initOnlineMonitor()`
// (backend/online_monitor.ts) was never called anywhere in the sidecar's boot path -- only
// Electron's real `main.ts` `app.whenReady()` called it, which the headless sidecar never runs.
// With no init, `online_monitor.ts`'s module-level `status` stayed `undefined` forever, so
// `isOnline()` (`status === 'online'`) was permanently false and every Steam install request
// under Tauri failed instantly with "App offline, skipping install" even though the machine (and
// Steam) were fully online. `init()` now wires it in, guarded for idempotency the same way
// `loggerInitialized` guards `initLogger()` above -- `init()` is called many times per test file
// (fresh streams each time), and `initOnlineMonitor()`'s own `addListener`/`addHandler` calls are
// NOT idempotent by themselves (`ipcMain.on` pushes onto an array every call; a second `init()`
// without a guard would double-fire `connectivity-changed`/`set-connectivity-online` listeners).
describe('sidecar bootstrap wires the online monitor (fix/steam-native-install-stability, 33-05 live-gate gap)', () => {
  /** Waits a couple of microtask/macrotask turns for the mocked-axios ping chain to settle. */
  async function flush(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
  }

  it('registers the get-connectivity-status handler', () => {
    init(new PassThrough(), new PassThrough())

    expect(handlerRegistry.has('get-connectivity-status')).toBe(true)
  })

  it('is idempotent: calling init() again does not re-register connectivity-changed/set-connectivity-online listeners', () => {
    init(new PassThrough(), new PassThrough())
    const changedBefore = (
      listenerRegistry.get('connectivity-changed') ?? []
    ).length
    const setOnlineBefore = (
      listenerRegistry.get('set-connectivity-online') ?? []
    ).length

    // A second (and third) init() call -- production never does this, but every other test in
    // this file (and skeletonFlows.test.ts) call init() repeatedly against fresh streams, so
    // this must hold regardless of how many times init() has already run in this process.
    init(new PassThrough(), new PassThrough())
    init(new PassThrough(), new PassThrough())

    expect(
      (listenerRegistry.get('connectivity-changed') ?? []).length
    ).toBe(changedBefore)
    expect(
      (listenerRegistry.get('set-connectivity-online') ?? []).length
    ).toBe(setOnlineBefore)
  })

  it('regression guard: with net.isOnline() -> true, the connectivity path reaches check-online/online, never gets stuck at offline', async () => {
    init(new PassThrough(), new PassThrough())
    await flush()

    const handler = handlerRegistry.get('get-connectivity-status')
    expect(handler).toBeDefined()
    const result = (await handler?.(undefined)) as {
      status: string
      retryIn: number
    }

    // The mocked axios.head above always resolves, so pingSites() settles 'online'. The
    // regression this guards against is permanent 'offline' (the pre-fix state) -- accept either
    // 'online' (ping settled) or the intermediate 'check-online' (ping still in flight) as
    // healthy, but never 'offline'.
    expect(result.status).not.toBe('offline')
  })
})
