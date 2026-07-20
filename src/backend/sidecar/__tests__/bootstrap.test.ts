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
 */

import { PassThrough } from 'node:stream'
import { init } from '../bootstrap'
import { handlerRegistry } from '../electronStub'
import { READY_SENTINEL } from 'common/types/sidecarTransport'

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
