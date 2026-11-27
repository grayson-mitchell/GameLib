// debug/steam-cancel-abort-thread-a: unit tests for the misleading
// "Could not find a matching abort controller" log — root-caused to
// callAbortController conflating "id never registered" with "id registered
// but the controller is already aborted" (both fell through to the SAME
// error log). This is exactly the shape of a hardware-observed double-call:
// downloadqueue.ts's stopCurrentDownload() calls registry.call(appName)
// directly, THEN also calls SteamGame.stop(), which calls
// registry.call(this.appId) again for the identical id — the second
// call previously logged a false-alarm error even though the abort had
// already succeeded via the first call.

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

import { logError, logInfo } from 'backend/logger'
import { createAbortRegistry, type AbortRegistry } from '../aborthandler'

describe('aborthandler (debug/steam-cancel-abort-thread-a)', () => {
  let registry: AbortRegistry
  beforeEach(() => {
    // A fresh registry per test: nothing is shared through module state (D-05, 66.4-13).
    registry = createAbortRegistry()
  })

  it('two registries are independent', () => {
    const other = createAbortRegistry()
    const controller = registry.create('id-1')
    expect(other.has('id-1')).toBe(false)
    other.abortAll()
    expect(controller.signal.aborted).toBe(false)
  })

  it('getSignal returns the registered signal and undefined for a miss', () => {
    const controller = registry.create('id-1')
    expect(registry.getSignal('id-1')).toBe(controller.signal)
    expect(registry.getSignal('nope')).toBeUndefined()
  })

  it('a genuinely UNREGISTERED id still logs the "could not find" error (real lookup miss preserved) — 37-05 (REQ-37-04): this exact message text is left BYTE-IDENTICAL for callers other than downloadmanager/utils.ts\'s terminal-error branch, which now asks hasAbortController first instead of softening this log', () => {
    registry.call('never-registered-id')
    expect(logError).toHaveBeenCalledWith(
      [
        'Aborting not possible. Could not find a matching abort controller for',
        'never-registered-id'
      ],
      'Backend'
    )
  })

  it('a registered, not-yet-aborted controller is found and .abort() actually fires — no error logged', () => {
    const controller = registry.create('id-1')
    expect(controller.signal.aborted).toBe(false)

    registry.call('id-1')

    expect(controller.signal.aborted).toBe(true)
    expect(logError).not.toHaveBeenCalled()
  })

  it('THE FIX: calling callAbortController TWICE for the same id (the hardware-observed double-call) aborts once and logs NO error on the second call', () => {
    const controller = registry.create('id-1')

    // First call — e.g. downloadqueue.ts's stopCurrentDownload() calling
    // registry.call(appName) directly.
    registry.call('id-1')
    expect(controller.signal.aborted).toBe(true)
    expect(logError).not.toHaveBeenCalled()

    // Second call — e.g. SteamGame.stop() calling registry.call(this.appId)
    // for the SAME id, moments later, in the SAME cancel. Before this fix,
    // this fell through to the misleading "Could not find a matching abort
    // controller" error even though the controller WAS found (just already
    // aborted).
    registry.call('id-1')
    expect(logError).not.toHaveBeenCalled()
  })

  it('deleteAbortController then callAbortController for the same id IS a genuine miss — error logged', () => {
    registry.create('id-1')
    registry.delete('id-1')

    registry.call('id-1')

    expect(logError).toHaveBeenCalledWith(
      [
        'Aborting not possible. Could not find a matching abort controller for',
        'id-1'
      ],
      'Backend'
    )
  })

  // 37-05 (REQ-37-04): hasAbortController is a READ-ONLY registration-state
  // query added for downloadmanager/utils.ts's terminal-error branch to ask
  // before it tells — see the export's own doc comment in aborthandler.ts.
  describe('hasAbortController (37-05, REQ-37-04)', () => {
    it('returns true for an id that was created and not yet deleted', () => {
      registry.create('id-1')

      expect(registry.has('id-1')).toBe(true)
    })

    it('returns false after deleteAbortController for the same id', () => {
      registry.create('id-1')
      registry.delete('id-1')

      expect(registry.has('id-1')).toBe(false)
    })

    it('returns false for an id that was never created', () => {
      expect(registry.has('never-registered-id')).toBe(false)
    })

    it('is read-only — calling it never mutates registration state or calls logError', () => {
      registry.create('id-1')

      registry.has('id-1')
      registry.has('id-1')

      expect(registry.has('id-1')).toBe(true)
      expect(logError).not.toHaveBeenCalled()
    })
  })

  // debug/steam-install-slow-start (Thread D-2 investigation, FIXED this
  // cycle): the NOTE above (steam-cancel-abort-thread-a cycle) flagged but
  // deliberately left unfixed a `abortAll` bug —
  // `for (const key in abortControllers.keys())` never actually iterates
  // (`for...in` enumerates enumerable STRING-KEYED PROPERTIES, and a
  // `MapIterator` has none), so the function was a silent no-op. It is only
  // reachable from utils.ts's app-quit handler (`handleExit`) — squarely in
  // scope now that Thread D investigates quit-time behavior. Fixed to
  // `for (const key of Array.from(abortControllers.keys()))`.
  describe('abortAll (debug/steam-install-slow-start Thread D-2)', () => {
    it('aborts EVERY registered controller, not zero of them (the for...in-over-.keys() bug)', () => {
      const controllerA = registry.create('id-1')
      const controllerB = registry.create('id-2')

      registry.abortAll()

      expect(controllerA.signal.aborted).toBe(true)
      expect(controllerB.signal.aborted).toBe(true)
      expect(logError).not.toHaveBeenCalled()
    })

    it('is a safe no-op with zero registered controllers', () => {
      expect(() => registry.abortAll()).not.toThrow()
      expect(logError).not.toHaveBeenCalled()
    })

    it('does not throw when a controller is deleted (via callRunner-style cleanup) mid-iteration', () => {
      registry.create('id-1')
      const controllerB = registry.create('id-2')

      // Simulate callAbortController's .abort() synchronously triggering
      // downstream cleanup that deletes a DIFFERENT, not-yet-visited entry
      // from the same shared Map (e.g. a 'close' handler settling another
      // in-flight command and calling deleteAbortController for it) — proves
      // iterating a snapshot (Array.from(...)) rather than the live Map
      // iterator is safe against mutation during the loop.
      registry.delete('id-2')

      expect(() => registry.abortAll()).not.toThrow()
      expect(controllerB.signal.aborted).toBe(false)
    })
  })
  // 88.2-16 (D-02): Rust owns the abort table of the runner calls it runs, so `call(id)` forwards the id there.
  describe('forwardAbort (88.2-16, D-02)', () => {
    const notFound = (id: string) => [
      [
        'Aborting not possible. Could not find a matching abort controller for',
        id
      ],
      'Backend'
    ]

    it('an id Rust found, that the map does not hold, logs nothing', async () => {
      const forwardAbort = jest.fn().mockResolvedValue(true)
      const forwarding = createAbortRegistry({ forwardAbort })

      forwarding.call('rust-only')
      await Promise.resolve()
      await Promise.resolve()

      expect(forwardAbort).toHaveBeenCalledWith('rust-only')
      expect(logError).not.toHaveBeenCalled()
    })

    it('an id neither side knew logs the not-found line once, after Rust answered', async () => {
      let answer: (found: boolean) => void = () => undefined
      const forwardAbort = jest.fn(
        () =>
          new Promise<boolean>((resolve) => {
            answer = resolve
          })
      )
      const forwarding = createAbortRegistry({ forwardAbort })

      forwarding.call('nobody')
      expect(logError).not.toHaveBeenCalled()
      answer(false)
      await Promise.resolve()
      await Promise.resolve()

      expect(logError).toHaveBeenCalledTimes(1)
      expect(logError).toHaveBeenCalledWith(...notFound('nobody'))
    })

    it('a local id is aborted and still forwarded, with no error line whatever Rust answers', async () => {
      const forwardAbort = jest.fn().mockResolvedValue(false)
      const forwarding = createAbortRegistry({ forwardAbort })
      const controller = forwarding.create('both')

      forwarding.call('both')
      await Promise.resolve()
      await Promise.resolve()

      expect(controller.signal.aborted).toBe(true)
      expect(forwardAbort).toHaveBeenCalledWith('both')
      expect(logError).not.toHaveBeenCalled()
    })

    it('a forward that rejects or throws counts as not found, and never rejects the caller', async () => {
      const rejecting = createAbortRegistry({
        forwardAbort: () => Promise.reject(new Error('lost'))
      })
      const throwing = createAbortRegistry({
        forwardAbort: () => {
          throw new Error('no transport')
        }
      })

      expect(() => rejecting.call('a')).not.toThrow()
      expect(() => throwing.call('b')).not.toThrow()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()

      expect(logError).toHaveBeenCalledTimes(2)
      expect(logError).toHaveBeenCalledWith(...notFound('a'))
      expect(logError).toHaveBeenCalledWith(...notFound('b'))
    })

    it('abortAll aborts the local controllers and forwards nothing', () => {
      const forwardAbort = jest.fn().mockResolvedValue(true)
      const forwarding = createAbortRegistry({ forwardAbort })
      const controller = forwarding.create('id-1')

      forwarding.abortAll()

      expect(controller.signal.aborted).toBe(true)
      expect(forwardAbort).not.toHaveBeenCalled()
    })

    it('with no deps a miss logs synchronously, exactly as before', () => {
      createAbortRegistry().call('nope')
      expect(logError).toHaveBeenCalledTimes(1)
      expect(logError).toHaveBeenCalledWith(...notFound('nope'))
    })
  })

  // quick 261128-935: the Stop path (`dispatch.kill`) aborts best-effort, so a miss there is an INFO breadcrumb. Every other
  // caller keeps the ERROR (the default).
  describe('ifMissing (quick 261128-935)', () => {
    const infoLine = (id: string) => [
      ['No abort controller for', id, '- nothing to abort'],
      'Backend'
    ]
    const flush = async () => {
      await Promise.resolve()
      await Promise.resolve()
    }

    it("a synchronous miss with { ifMissing: 'info' } writes one INFO line and no ERROR", () => {
      createAbortRegistry().call('206060', { ifMissing: 'info' })

      expect(logError).not.toHaveBeenCalled()
      expect(logInfo).toHaveBeenCalledTimes(1)
      expect(logInfo).toHaveBeenCalledWith(...infoLine('206060'))
    })

    it('a miss after Rust answered false writes the INFO line only once Rust has answered, and no ERROR', async () => {
      let answer: (found: boolean) => void = () => undefined
      const forwardAbort = jest.fn(
        () =>
          new Promise<boolean>((resolve) => {
            answer = resolve
          })
      )
      const forwarding = createAbortRegistry({ forwardAbort })

      forwarding.call('206060', { ifMissing: 'info' })
      expect(logInfo).not.toHaveBeenCalled()
      expect(logError).not.toHaveBeenCalled()
      answer(false)
      await flush()

      expect(forwardAbort).toHaveBeenCalledWith('206060')
      expect(logInfo).toHaveBeenCalledTimes(1)
      expect(logInfo).toHaveBeenCalledWith(...infoLine('206060'))
      expect(logError).not.toHaveBeenCalled()
    })

    it("an id Rust found logs nothing at either level with { ifMissing: 'info' }", async () => {
      const forwarding = createAbortRegistry({
        forwardAbort: jest.fn().mockResolvedValue(true)
      })

      forwarding.call('rust-only', { ifMissing: 'info' })
      await flush()

      expect(logInfo).not.toHaveBeenCalled()
      expect(logError).not.toHaveBeenCalled()
    })

    it('a local controller is aborted and nothing is logged at either level, with or without deps', async () => {
      const bare = createAbortRegistry()
      const bareController = bare.create('id-1')
      bare.call('id-1', { ifMissing: 'info' })

      const forwarding = createAbortRegistry({
        forwardAbort: jest.fn().mockResolvedValue(false)
      })
      const forwardingController = forwarding.create('id-2')
      forwarding.call('id-2', { ifMissing: 'info' })
      await flush()

      expect(bareController.signal.aborted).toBe(true)
      expect(forwardingController.signal.aborted).toBe(true)
      expect(logInfo).not.toHaveBeenCalled()
      expect(logError).not.toHaveBeenCalled()
    })

    it("{ ifMissing: 'error' } behaves exactly like no options: the byte-identical ERROR and no INFO", async () => {
      createAbortRegistry().call('sync-miss', { ifMissing: 'error' })
      createAbortRegistry({
        forwardAbort: jest.fn().mockResolvedValue(false)
      }).call('rust-miss', { ifMissing: 'error' })
      await flush()

      expect(logError).toHaveBeenCalledTimes(2)
      expect(logError).toHaveBeenCalledWith(
        [
          'Aborting not possible. Could not find a matching abort controller for',
          'sync-miss'
        ],
        'Backend'
      )
      expect(logError).toHaveBeenCalledWith(
        [
          'Aborting not possible. Could not find a matching abort controller for',
          'rust-miss'
        ],
        'Backend'
      )
      expect(logInfo).not.toHaveBeenCalled()
    })
  })
})
