/**
 * Sidecar boot-time GOG queued-playtime drain (todo 2026-09-06, quick-260908-wk0).
 *
 * `syncQueuedPlaytimeWhenOnline()` (`../bootstrap`) restores the boot-time side effect deleted
 * with `src/backend/main.ts` in commit `5643c7583` ("feat(35-14)!: delete the Electron entry
 * points") -- see the exported function's own doc comment in `bootstrap.ts` for the full
 * provenance, the ported-source excerpt, and the design rationale (D1-D6, D13) this suite
 * proves.
 *
 * WHY A DEDICATED FILE, and not an addition to `bootstrap.test.ts` or `bootstrapWirings.test.ts`.
 * Verified at planning time: `bootstrap.test.ts` already calls `init()` at ~L138 ("reaches READY
 * under bare node") and `bootstrapWirings.test.ts` at ~L320, long before any new describe block
 * appended to either would run -- the module-scope `playtimeQueueDrainInitialized` guard would
 * already be consumed by that first call, so a wiring test placed in either file could only ever
 * measure a consumed guard, i.e. a no-op. The alternative, `jest.resetModules()` + a fresh
 * `require('../bootstrap')`, was rejected too: that re-evaluates `installElectronHook`, which
 * has NO idempotency guard of its own and would leave a nested global hook in the worker for
 * every subsequent suite. This is the exact reasoning `playtimeLockBootClear.test.ts`'s and
 * `bootstrapUserReconcile.test.ts`'s own docstrings record for their own existence, and this
 * file follows their shape: a virgin file gets a virgin module registry and a virgin guard flag
 * for free, with zero module tricks.
 *
 * D7 -- THE WIRING PROOF AND THE ORDERING PROOF ARE FUSED into a single `init()`-driven test, and
 * that is forced, not preferred. The module-scope once-guard means exactly ONE `init()` call per
 * test file does any work, so two separate `init()`-driven tests are impossible in one file, and
 * a second file for one assertion would be disproportionate. Case 1 below seeds a stranded
 * `lock`, calls `init()` once, and carries three assertions at once -- do not "split it up for
 * clarity" and silently create a test that measures a consumed guard.
 *
 * D8 -- THE ORDERING PROOF IS HONEST BY CONSTRUCTION: it records the lock state AT CALL TIME. The
 * naive version ("seed a lock, call `init()`, assert the drain still happened") is VACUOUS -- the
 * spy replaces the real `has('lock')` early-return, so a mocked `syncQueuedPlaytime` is called
 * whether or not the lock is present, and the assertion would pass for the wrong reason. Instead
 * the spy's implementation pushes `playtimeSyncQueue.has('lock')` onto an array at the moment it
 * is invoked, and case 1 asserts that array is `[false]`. This proves the PRECONDITION holds at
 * call time (the lock is already cleared when the drain fires) -- not that the real function
 * drained a real queue. That is the correct thing to assert at this seam.
 *
 * D9 -- THE MOCK MUST PROVE THE CALLBACK RAN, and the proof is structural. `runOnceWhenOnline` is
 * mocked as `jest.fn((cb) => cb())` -- invoke inline -- and every assertion in this suite is on
 * an EFFECT that only occurs INSIDE the callback (the `syncQueuedPlaytime` spy's call count, and
 * the lock-state array it populates). NO test in this file asserts
 * `expect(runOnceWhenOnline).toHaveBeenCalled()` -- that assertion would be exactly the vacuous
 * shape the standing project finding warns about, and it is BANNED in this file. If the mock
 * silently stopped invoking, the spy would have zero calls and every test would go RED.
 *
 * NO per-suite `jest.mock('os', ...)`. Containment is structural: `src/backend/jest.config.js`
 * registers `setupFiles: ['<rootDir>/src/backend/jest.setupContainment.ts']` for the whole
 * `Backend` project, redirecting HOME/USERPROFILE/APPDATA/XDG_* before any test file's own
 * imports run -- and `jest.setupContainment.ts` SHADOWS any per-suite `os` mock this file might
 * otherwise declare. This file never references the `'node:os'` specifier anywhere, so
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
//    synchronous (cases 4/6 excepted, which need a microtask flush / their own deferred capture).
//    `initOnlineMonitor` is stubbed to a no-op so init()'s own real listener registration never
//    runs against the mocked emitter shape; `isOnline` is forced `true` for parity with "invoke
//    inline" even though nothing here reads it directly.
jest.mock('../../online_monitor', () => ({
  ...jest.requireActual('../../online_monitor'),
  initOnlineMonitor: jest.fn(),
  isOnline: jest.fn(() => true),
  runOnceWhenOnline: jest.fn((cb: () => unknown) => cb())
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { PassThrough } from 'node:stream'
import { init, syncQueuedPlaytimeWhenOnline } from '../bootstrap'
import * as loggerModule from '../../logger'
import { libraryManagerMap } from '../../storeManagers'
import { playtimeSyncQueue } from '../../storeManagers/gog/electronStores'
import { GlobalConfig } from '../../config'
import { runOnceWhenOnline as mockedRunOnceWhenOnline } from '../../online_monitor'

const SKIP_LOG_MESSAGE =
  'Skipping playtime sync queue upload - playtime sync disabled'
const SKIP_LOG_OPTIONS = { prefix: loggerModule.LogPrefix.Backend }

// `src/backend/jest.config.js` sets `resetMocks: true`, which strips the implementation off
// EVERY `jest.fn(...)`-created mock -- including the one supplied at module-factory creation
// time above -- before every single test, the very first one included. So the inline-invoke
// behaviour has to be re-armed here, once per test, rather than relied upon from the factory
// alone. Case 6 overrides it locally.
beforeEach(() => {
  ;(mockedRunOnceWhenOnline as jest.Mock).mockImplementation(
    (cb: () => unknown) => cb()
  )
})

describe('todo 2026-09-06 -- sidecar boot drains queued GOG playtime once online', () => {
  // FUSED WIRING + ORDERING PROOF (D7), deliberately the FIRST test in this file that calls
  // `init()`.
  it('wiring + ordering proof: init() drains the queue after the stranded lock is already cleared', () => {
    playtimeSyncQueue.set('lock', [])
    expect(playtimeSyncQueue.has('lock')).toBe(true)

    const lockStateAtCallTime: boolean[] = []
    const syncQueuedPlaytimeSpy = jest
      .spyOn(libraryManagerMap.gog, 'syncQueuedPlaytime')
      .mockImplementation(() => {
        lockStateAtCallTime.push(playtimeSyncQueue.has('lock'))
        return Promise.resolve()
      })

    init(new PassThrough(), new PassThrough())

    // (a) WIRING: the helper is CALLED from init(), not merely exported. RED today: init() has
    // no such call at all.
    expect(syncQueuedPlaytimeSpy).toHaveBeenCalledTimes(1)
    // (b) ORDERING (D8): Block D had already cleared the stranded lock by the time the drain
    // fired. This proves the PRECONDITION holds at call time, not that a real queue drained.
    expect(lockStateAtCallTime).toEqual([false])
    // (c) Block D's own effect, unchanged.
    expect(playtimeSyncQueue.has('lock')).toBe(false)

    syncQueuedPlaytimeSpy.mockRestore()
  })

  describe('syncQueuedPlaytimeWhenOnline() -- called directly', () => {
    it('case 2 -- enabled arm: default settings drain the queue, no skip log', () => {
      const syncQueuedPlaytimeSpy = jest
        .spyOn(libraryManagerMap.gog, 'syncQueuedPlaytime')
        .mockResolvedValue(undefined)
      const logDebugSpy = jest.spyOn(loggerModule, 'logDebug')

      syncQueuedPlaytimeWhenOnline()

      expect(syncQueuedPlaytimeSpy).toHaveBeenCalledTimes(1)
      expect(
        logDebugSpy.mock.calls.some(([message]) => message === SKIP_LOG_MESSAGE)
      ).toBe(false)

      logDebugSpy.mockRestore()
      syncQueuedPlaytimeSpy.mockRestore()
    })

    it('case 3 -- disabled arm: disablePlaytimeSync skips the drain and logs the exact skip receipt', () => {
      const globalConfigGetSpy = jest
        .spyOn(GlobalConfig, 'get')
        .mockReturnValue({
          getSettings: () => ({ disablePlaytimeSync: true })
        } as unknown as GlobalConfig)
      const syncQueuedPlaytimeSpy = jest.spyOn(
        libraryManagerMap.gog,
        'syncQueuedPlaytime'
      )
      const logDebugSpy = jest.spyOn(loggerModule, 'logDebug')

      syncQueuedPlaytimeWhenOnline()

      expect(syncQueuedPlaytimeSpy).not.toHaveBeenCalled()
      // Assert the options object too, not just the message -- the verbatim options form is
      // half of what D6 decided, and a message-only assertion would pass with it dropped.
      const matchingCalls = logDebugSpy.mock.calls.filter(
        ([message, options]) =>
          message === SKIP_LOG_MESSAGE &&
          JSON.stringify(options) === JSON.stringify(SKIP_LOG_OPTIONS)
      )
      expect(matchingCalls).toHaveLength(1)

      logDebugSpy.mockRestore()
      syncQueuedPlaytimeSpy.mockRestore()
      globalConfigGetSpy.mockRestore()
    })

    it('case 4 -- never-fails-boot (async arm): a rejected syncQueuedPlaytime() is caught and warned', async () => {
      const syncQueuedPlaytimeSpy = jest
        .spyOn(libraryManagerMap.gog, 'syncQueuedPlaytime')
        .mockRejectedValue(new Error('gameplay.gog.com unreachable'))
      const logWarningSpy = jest.spyOn(loggerModule, 'logWarning')

      expect(() => syncQueuedPlaytimeWhenOnline()).not.toThrow()
      // This is what proves D4's `.catch` exists: without it, this rejection would surface as
      // an unhandled rejection instead of a caught, logged warning.
      await new Promise(setImmediate)

      expect(
        logWarningSpy.mock.calls.some(([message]) =>
          String(message).includes('syncQueuedPlaytimeWhenOnline')
        )
      ).toBe(true)

      logWarningSpy.mockRestore()
      syncQueuedPlaytimeSpy.mockRestore()
    })

    it('case 5 -- never-fails-boot (outer arm): a throwing GlobalConfig.get() is caught and warned', () => {
      const globalConfigGetSpy = jest
        .spyOn(GlobalConfig, 'get')
        .mockImplementation(() => {
          throw new Error('config read failed')
        })
      const logWarningSpy = jest.spyOn(loggerModule, 'logWarning')

      expect(() => syncQueuedPlaytimeWhenOnline()).not.toThrow()

      expect(
        logWarningSpy.mock.calls.some(([message]) =>
          String(message).includes('syncQueuedPlaytimeWhenOnline')
        )
      ).toBe(true)

      logWarningSpy.mockRestore()
      globalConfigGetSpy.mockRestore()
    })

    it('case 6 -- never-fails-boot (inner arm, deferred): a synchronously-throwing syncQueuedPlaytime() is caught and warned', () => {
      // D10: this is the ONLY shape that can prove the inner guard exists. Under the
      // inline-invoke mock (the beforeEach default), a callback throw propagates back out
      // through the mock into the OUTER try, so an inline-invoke test cannot distinguish inner
      // from outer and would pass even with the inner guard deleted. This test instead captures
      // the callback instead of invoking it, calls the helper (registration only), then invokes
      // the captured callback from the test's OWN frame -- outside anything the helper wraps.
      let capturedCallback: (() => unknown) | undefined
      ;(mockedRunOnceWhenOnline as jest.Mock).mockImplementation(
        (cb: () => unknown) => {
          capturedCallback = cb
        }
      )
      const syncQueuedPlaytimeSpy = jest
        .spyOn(libraryManagerMap.gog, 'syncQueuedPlaytime')
        .mockImplementation(() => {
          throw new Error('synchronous failure')
        })
      const logWarningSpy = jest.spyOn(loggerModule, 'logWarning')

      expect(() => syncQueuedPlaytimeWhenOnline()).not.toThrow()
      expect(syncQueuedPlaytimeSpy).not.toHaveBeenCalled()
      expect(capturedCallback).toBeDefined()

      expect(() => capturedCallback?.()).not.toThrow()
      expect(
        logWarningSpy.mock.calls.some(([message]) =>
          String(message).includes('syncQueuedPlaytimeWhenOnline')
        )
      ).toBe(true)

      logWarningSpy.mockRestore()
      syncQueuedPlaytimeSpy.mockRestore()
    })
  })
})
