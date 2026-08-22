// debug/steam-cancel-abort-thread-a: unit tests for the misleading
// "Could not find a matching abort controller" log — root-caused to
// callAbortController conflating "id never registered" with "id registered
// but the controller is already aborted" (both fell through to the SAME
// error log). This is exactly the shape of a hardware-observed double-call:
// downloadqueue.ts's stopCurrentDownload() calls callAbortController(appName)
// directly, THEN also calls SteamGame.stop(), which calls
// callAbortController(this.appId) again for the identical id — the second
// call previously logged a false-alarm error even though the abort had
// already succeeded via the first call.

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

import { logError } from 'backend/logger'
import {
  createAbortController,
  callAbortController,
  callAllAbortControllers,
  deleteAbortController,
  hasAbortController
} from '../aborthandler'

describe('aborthandler (debug/steam-cancel-abort-thread-a)', () => {
  afterEach(() => {
    // best-effort cleanup so one test's registration never leaks into the
    // next — the module keeps a single shared, unexported Map.
    deleteAbortController('id-1')
    deleteAbortController('id-2')
  })

  it('a genuinely UNREGISTERED id still logs the "could not find" error (real lookup miss preserved) — 37-05 (REQ-37-04): this exact message text is left BYTE-IDENTICAL for callers other than downloadmanager/utils.ts\'s terminal-error branch, which now asks hasAbortController first instead of softening this log', () => {
    callAbortController('never-registered-id')
    expect(logError).toHaveBeenCalledWith(
      [
        'Aborting not possible. Could not find a matching abort controller for',
        'never-registered-id'
      ],
      'Backend'
    )
  })

  it('a registered, not-yet-aborted controller is found and .abort() actually fires — no error logged', () => {
    const controller = createAbortController('id-1')
    expect(controller.signal.aborted).toBe(false)

    callAbortController('id-1')

    expect(controller.signal.aborted).toBe(true)
    expect(logError).not.toHaveBeenCalled()
  })

  it('THE FIX: calling callAbortController TWICE for the same id (the hardware-observed double-call) aborts once and logs NO error on the second call', () => {
    const controller = createAbortController('id-1')

    // First call — e.g. downloadqueue.ts's stopCurrentDownload() calling
    // callAbortController(appName) directly.
    callAbortController('id-1')
    expect(controller.signal.aborted).toBe(true)
    expect(logError).not.toHaveBeenCalled()

    // Second call — e.g. SteamGame.stop() calling callAbortController(this.appId)
    // for the SAME id, moments later, in the SAME cancel. Before this fix,
    // this fell through to the misleading "Could not find a matching abort
    // controller" error even though the controller WAS found (just already
    // aborted).
    callAbortController('id-1')
    expect(logError).not.toHaveBeenCalled()
  })

  it('deleteAbortController then callAbortController for the same id IS a genuine miss — error logged', () => {
    createAbortController('id-1')
    deleteAbortController('id-1')

    callAbortController('id-1')

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
      createAbortController('id-1')

      expect(hasAbortController('id-1')).toBe(true)
    })

    it('returns false after deleteAbortController for the same id', () => {
      createAbortController('id-1')
      deleteAbortController('id-1')

      expect(hasAbortController('id-1')).toBe(false)
    })

    it('returns false for an id that was never created', () => {
      expect(hasAbortController('never-registered-id')).toBe(false)
    })

    it('is read-only — calling it never mutates registration state or calls logError', () => {
      createAbortController('id-1')

      hasAbortController('id-1')
      hasAbortController('id-1')

      expect(hasAbortController('id-1')).toBe(true)
      expect(logError).not.toHaveBeenCalled()
    })
  })

  // debug/steam-install-slow-start (Thread D-2 investigation, FIXED this
  // cycle): the NOTE above (steam-cancel-abort-thread-a cycle) flagged but
  // deliberately left unfixed a `callAllAbortControllers` bug —
  // `for (const key in abortControllers.keys())` never actually iterates
  // (`for...in` enumerates enumerable STRING-KEYED PROPERTIES, and a
  // `MapIterator` has none), so the function was a silent no-op. It is only
  // reachable from utils.ts's app-quit handler (`handleExit`) — squarely in
  // scope now that Thread D investigates quit-time behavior. Fixed to
  // `for (const key of Array.from(abortControllers.keys()))`.
  describe('callAllAbortControllers (debug/steam-install-slow-start Thread D-2)', () => {
    it('aborts EVERY registered controller, not zero of them (the for...in-over-.keys() bug)', () => {
      const controllerA = createAbortController('id-1')
      const controllerB = createAbortController('id-2')

      callAllAbortControllers()

      expect(controllerA.signal.aborted).toBe(true)
      expect(controllerB.signal.aborted).toBe(true)
      expect(logError).not.toHaveBeenCalled()
    })

    it('is a safe no-op with zero registered controllers', () => {
      expect(() => callAllAbortControllers()).not.toThrow()
      expect(logError).not.toHaveBeenCalled()
    })

    it('does not throw when a controller is deleted (via callRunner-style cleanup) mid-iteration', () => {
      createAbortController('id-1')
      const controllerB = createAbortController('id-2')

      // Simulate callAbortController's .abort() synchronously triggering
      // downstream cleanup that deletes a DIFFERENT, not-yet-visited entry
      // from the same shared Map (e.g. a 'close' handler settling another
      // in-flight command and calling deleteAbortController for it) — proves
      // iterating a snapshot (Array.from(...)) rather than the live Map
      // iterator is safe against mutation during the loop.
      deleteAbortController('id-2')

      expect(() => callAllAbortControllers()).not.toThrow()
      expect(controllerB.signal.aborted).toBe(false)
    })
  })
})
