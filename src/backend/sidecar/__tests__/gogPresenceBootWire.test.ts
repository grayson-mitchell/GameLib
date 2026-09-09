/**
 * Sidecar boot-time GOG presence call (todo
 * 2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md, quick-260909-k5x).
 *
 * `setGogPresenceWhenOnline()` (`../bootstrap`) restores the boot-time side effect deleted with
 * `src/backend/main.ts` in commit `5643c7583` ("feat(35-14)!: delete the Electron entry
 * points") -- see the exported function's own doc comment in `bootstrap.ts` for the full
 * provenance, the ported-source excerpt, and the design rationale (D-K5X-01, D-K5X-02) this
 * suite proves.
 *
 * WHY A DEDICATED FILE, and not an addition to `bootstrap.test.ts` or `bootstrapWirings.test.ts`.
 * Verified at planning time: both already call `init()` early in their own files, long before any
 * new describe block appended to either would run -- the module-scope `gogPresenceInitialized`
 * guard would already be consumed by that first call, so a wiring test placed in either file
 * could only ever measure a consumed guard, i.e. a no-op. The `jest.resetModules()` + a fresh
 * `require('../bootstrap')` alternative is rejected too: that re-evaluates
 * `installElectronHook`, which has NO idempotency guard of its own and would leave a nested
 * global hook in the worker for every subsequent suite. This is the exact reasoning
 * `playtimeLockBootClear.test.ts`'s and `bootstrapUserReconcile.test.ts`'s own docstrings record
 * for their own existence, and `playtimeQueueBootDrain.test.ts` follows the same shape -- this
 * file follows theirs: a virgin file gets a virgin module registry and a virgin guard flag for
 * free, with zero module tricks.
 *
 * NO `expect(runOnceWhenOnline).toHaveBeenCalled()` anywhere in this file. Every assertion is on
 * an effect that only occurs INSIDE the callback (the `gogPresence.setPresence` spy's call
 * count). That is the vacuous shape a standing project finding warns about, and it is BANNED in
 * this file family -- if the inline-invoke mock silently stopped invoking, the spy would show
 * zero calls and the suite would go RED, which is the point.
 *
 * NO reference to the `'node:os'` specifier anywhere in this file. Containment is already
 * structural via `src/backend/jest.setupContainment.ts` (registered as `setupFiles` for the
 * whole `Backend` project), so no `jest.mock('os', ...)` is needed or wanted here --
 * `structuralContainment.test.ts`'s `node:os` + `homedir`/`userInfo` gate stays inert.
 */

// ── electron / electron-store — route Jest's resolution at the REAL sidecar shims ──────────
jest.mock('backend/store_backend', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── axios — never a real network call (initOnlineMonitor()'s pingSites() runs during init()) ─
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    head: jest.fn(() => Promise.resolve({ status: 200 })),
    get: jest.fn(),
    create: jest.fn(() => ({ get: jest.fn(), head: jest.fn() }))
  }
}))

// ── online_monitor — invoke runOnceWhenOnline's callback INLINE so every assertion below is
//    synchronous (cases 4/5 excepted, which need a microtask flush / their own deferred
//    capture). `initOnlineMonitor` is stubbed to a no-op so init()'s own real listener
//    registration never runs against the mocked emitter shape; `isOnline` is forced `true` for
//    parity with "invoke inline" even though nothing here reads it directly.
jest.mock('../../online_monitor', () => ({
  ...jest.requireActual('../../online_monitor'),
  initOnlineMonitor: jest.fn(),
  isOnline: jest.fn(() => true),
  runOnceWhenOnline: jest.fn((cb: () => unknown) => cb())
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { PassThrough } from 'node:stream'
import { init, setGogPresenceWhenOnline } from '../bootstrap'
import * as loggerModule from '../../logger'
import gogPresence from '../../storeManagers/gog/presence'
import { GlobalConfig } from '../../config'
import { runOnceWhenOnline as mockedRunOnceWhenOnline } from '../../online_monitor'

// `src/backend/jest.config.js` sets `resetMocks: true`, which strips the implementation off
// EVERY `jest.fn(...)`-created mock -- including the one supplied at module-factory creation
// time above -- before every single test, the very first one included. So the inline-invoke
// behaviour has to be re-armed here, once per test, rather than relied upon from the factory
// alone. Case 5 overrides it locally.
beforeEach(() => {
  ;(mockedRunOnceWhenOnline as jest.Mock).mockImplementation(
    (cb: () => unknown) => cb()
  )
})

describe('todo 2026-09-06 -- sidecar boot sets GOG presence once online (Block H)', () => {
  // Case 1: FUSED WIRING PROOF, deliberately the FIRST test in this file that calls `init()`.
  it('case 1 -- wiring proof: init() calls gogPresence.setPresence() exactly once', () => {
    const setPresenceSpy = jest
      .spyOn(gogPresence, 'setPresence')
      .mockResolvedValue(undefined)

    init(new PassThrough(), new PassThrough())

    // WIRING: the helper is CALLED from init(), not merely exported. RED today: init() has no
    // such call at all.
    expect(setPresenceSpy).toHaveBeenCalledTimes(1)

    setPresenceSpy.mockRestore()
  })

  describe('setGogPresenceWhenOnline() -- called directly', () => {
    it('case 2 -- direct, enabled: setGogPresenceWhenOnline() calls setPresence() exactly once', () => {
      const setPresenceSpy = jest
        .spyOn(gogPresence, 'setPresence')
        .mockResolvedValue(undefined)

      setGogPresenceWhenOnline()

      expect(setPresenceSpy).toHaveBeenCalledTimes(1)

      setPresenceSpy.mockRestore()
    })

    it('case 3 -- D-K5X-02 receipt: disableGOGPresence still calls setPresence(), no skip-log -- the gate is inside setPresence()', () => {
      const globalConfigGetSpy = jest
        .spyOn(GlobalConfig, 'get')
        .mockReturnValue({
          getSettings: () => ({
            disableGOGPresence: true,
            disablePlaytimeSync: true
          })
        } as unknown as GlobalConfig)
      const setPresenceSpy = jest
        .spyOn(gogPresence, 'setPresence')
        .mockResolvedValue(undefined)
      const logDebugSpy = jest.spyOn(loggerModule, 'logDebug')

      setGogPresenceWhenOnline()

      // Block H itself reads NO settings -- it must call setPresence() regardless of
      // disableGOGPresence. If someone later "helpfully" hoists a settings read to helper
      // entry (mirroring Block G's D5), this assertion goes RED.
      expect(setPresenceSpy).toHaveBeenCalledTimes(1)
      // There is no skip-log arm in Block H (D-K5X-02) -- the deleted source never had one.
      expect(logDebugSpy).not.toHaveBeenCalled()

      logDebugSpy.mockRestore()
      setPresenceSpy.mockRestore()
      globalConfigGetSpy.mockRestore()
    })

    it('case 4 -- never-fails-boot (async arm): a rejected setPresence() is caught and warned', async () => {
      const setPresenceSpy = jest
        .spyOn(gogPresence, 'setPresence')
        .mockRejectedValue(new Error('presence.gog.com unreachable'))
      const logWarningSpy = jest.spyOn(loggerModule, 'logWarning')

      expect(() => setGogPresenceWhenOnline()).not.toThrow()
      // This is what proves the explicit `.catch` exists: without it, this rejection would
      // surface as an unhandled rejection instead of a caught, logged warning.
      await new Promise(setImmediate)

      expect(
        logWarningSpy.mock.calls.some(([message]) =>
          String(message).includes('setGogPresenceWhenOnline')
        )
      ).toBe(true)

      logWarningSpy.mockRestore()
      setPresenceSpy.mockRestore()
    })

    it('case 5 -- never-fails-boot (inner arm, deferred): a synchronously-throwing setPresence() is caught and warned', () => {
      // This is the ONLY shape that can prove the inner guard exists. Under the inline-invoke
      // mock (the beforeEach default), a callback throw propagates back out through the mock
      // into the OUTER try, so an inline-invoke test cannot distinguish inner from outer and
      // would pass even with the inner guard deleted. This test instead captures the callback
      // instead of invoking it, calls the helper (registration only), then invokes the
      // captured callback from the test's OWN frame -- outside anything the helper wraps.
      let capturedCallback: (() => unknown) | undefined
      ;(mockedRunOnceWhenOnline as jest.Mock).mockImplementation(
        (cb: () => unknown) => {
          capturedCallback = cb
        }
      )
      const setPresenceSpy = jest
        .spyOn(gogPresence, 'setPresence')
        .mockImplementation(() => {
          throw new Error('synchronous failure')
        })
      const logWarningSpy = jest.spyOn(loggerModule, 'logWarning')

      expect(() => setGogPresenceWhenOnline()).not.toThrow()
      expect(setPresenceSpy).not.toHaveBeenCalled()
      expect(capturedCallback).toBeDefined()

      expect(() => capturedCallback?.()).not.toThrow()
      expect(
        logWarningSpy.mock.calls.some(([message]) =>
          String(message).includes('setGogPresenceWhenOnline')
        )
      ).toBe(true)

      logWarningSpy.mockRestore()
      setPresenceSpy.mockRestore()
    })
  })
})
