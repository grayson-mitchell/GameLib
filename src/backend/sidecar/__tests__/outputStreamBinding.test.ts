/**
 * IN-04 (`34.2-REVIEW.md` round 1): frames produced before the transport is
 * bound must not escape to the real `process.stdout`.
 *
 * `sidecarRpc.ts`'s `outputStream` used to be initialised to `process.stdout`
 * and only reassigned inside `startRpcServer()`. Every push that happened
 * ahead of that bind therefore went to the real terminal instead of the stream
 * the caller was about to inject. Measured across the backend suite before the
 * fix: 77 escaped frames, including store payloads. IN-04 reported ONE of
 * them, because only the first leak per suite is visible -- after the first
 * `startRpcServer()` the module-level binding points at that test's dead
 * stream, so subsequent writes are silently discarded rather than printed.
 *
 * Three real producers get in ahead of the bind, so this is not a
 * test-only concern: the `register-handlers` boot step (handler registration) runs at
 * boot, ahead of the bind; `init()` floats `applyMigrations()` above its own `startRpcServer()`
 * call and a migration writes `migrationsStore.appliedMigrations`; and test
 * setup may touch a store before starting its sidecar.
 *
 * This suite gates the queue-until-bound behaviour directly. It deliberately
 * does NOT go through `bootstrap.init()` -- the property under test is a
 * property of `sidecarRpc` alone, and routing through bootstrap would drag in
 * GlobalConfig/i18next and make a failure ambiguous.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { PassThrough } from 'node:stream'

import { stripSourceComments } from '../../testUtils/stripSourceComments'
import { createTestSidecarRpc } from '../../testUtils/testSidecarRpc'
import { createIpcRegistry } from '../ipcRegistry'

describe('sidecarRpc output-stream binding (IN-04)', () => {
  let stdoutSpy: jest.SpyInstance

  beforeEach(() => {
    jest.resetModules()
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
  })

  function freshRpc() {
    const rpc = createTestSidecarRpc()
    return {
      pushFrontendMessage: rpc.pushFrontendMessage,
      // `start()` binds the output stream and flushes what was buffered before it.
      attachOutput: (output: PassThrough) =>
        rpc.start(new PassThrough(), output, createIpcRegistry())
    }
  }

  /**
   * Drains EVERY buffered chunk, not just the first. `stream.read()` returns
   * one chunk; two same-tick writes stay two chunks, so a single `read()` sees
   * only the first frame and an ordering assertion would silently check half
   * of what it claims to. Written the naive way first, and it did exactly that.
   */
  function framesFrom(stream: PassThrough): unknown[] {
    let raw = ''
    let chunk = stream.read() as Buffer | string | null
    while (chunk !== null) {
      raw += chunk.toString()
      chunk = stream.read() as Buffer | string | null
    }
    return raw
      .split('\n')
      .filter((line: string) => line.trim().length > 0)
      .map((line: string) => JSON.parse(line))
  }

  it('IN-04 a push before any bind writes NOTHING to process.stdout', () => {
    const { pushFrontendMessage } = freshRpc()

    pushFrontendMessage('storeChanged', { store: 'configStore', key: 'a' })

    // RED-PROOF: against the pre-fix `let outputStream: Writable =
    // process.stdout`, this push lands on the real stream and the spy records
    // exactly the leaked frame IN-04 named.
    expect(stdoutSpy).not.toHaveBeenCalled()
  })

  it('IN-04 frames pushed before the bind are flushed to the bound stream, in order', () => {
    const { pushFrontendMessage, attachOutput } = freshRpc()

    pushFrontendMessage('storeChanged', { key: 'first' })
    pushFrontendMessage('storeChanged', { key: 'second' })

    const output = new PassThrough()
    attachOutput(output)

    expect(framesFrom(output)).toEqual([
      {
        kind: 'frontendMessage',
        channel: 'storeChanged',
        args: [{ key: 'first' }]
      },
      {
        kind: 'frontendMessage',
        channel: 'storeChanged',
        args: [{ key: 'second' }]
      }
    ])
    expect(stdoutSpy).not.toHaveBeenCalled()
  })

  it('IN-04 the queue is drained by the flush — a second bind replays nothing', () => {
    const { pushFrontendMessage, attachOutput } = freshRpc()

    pushFrontendMessage('storeChanged', { key: 'once' })

    const first = new PassThrough()
    attachOutput(first)
    expect(framesFrom(first)).toHaveLength(1)

    const second = new PassThrough()
    attachOutput(second)
    expect(second.read()).toBeNull()
  })

  it('IN-04 after the bind, pushes go straight to the bound stream and never to stdout', () => {
    const { pushFrontendMessage, attachOutput } = freshRpc()

    const output = new PassThrough()
    attachOutput(output)
    pushFrontendMessage('storeChanged', { key: 'after' })

    expect(framesFrom(output)).toEqual([
      {
        kind: 'frontendMessage',
        channel: 'storeChanged',
        args: [{ key: 'after' }]
      }
    ])
    expect(stdoutSpy).not.toHaveBeenCalled()
  })

  // ── Anti-vacuity ───────────────────────────────────────────────────────
  //
  // Three of the four assertions above are `not.toHaveBeenCalled()`, which a
  // broken spy would satisfy forever. Prove the spy actually observes a write
  // to this exact stream, and pin the source so the default cannot quietly
  // revert to `process.stdout`.
  describe('self-test', () => {
    it('the process.stdout spy really does observe a direct write', () => {
      process.stdout.write('synthetic\n')
      expect(stdoutSpy).toHaveBeenCalledWith('synthetic\n')
    })

    it('sidecarRpc.ts does not initialise outputStream to process.stdout', () => {
      // Comment-stripped, and that is load-bearing: `sidecarRpc.ts`'s own
      // docstring QUOTES the old `let outputStream` initialiser while explaining
      // why it is gone, so a raw-source negative assertion fails against the
      // FIXED file. Written naively first, and it did.
      const source = stripSourceComments(
        readFileSync(join(__dirname, '..', 'sidecarRpc.ts'), 'utf-8')
      )

      expect(source).toContain('let outputStream: Writable | null = null')
      expect(source).not.toContain(
        'let outputStream: Writable = process.stdout'
      )
    })
  })
})
