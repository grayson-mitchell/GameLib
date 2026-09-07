/**
 * Sidecar boot-time Epic/GOG user reconciliation (todo 2026-09-06, quick-260908-fre).
 *
 * `reconcileStoreUsersWhenOnline()` (`../bootstrap`) restores the boot-time side effect deleted
 * with `src/backend/main.ts` in commit `5643c7583` ("feat(35-14)!: delete the Electron entry
 * points") -- see the exported function's own doc comment in `bootstrap.ts` for the full
 * provenance, the ported-source excerpt, and the design rationale (D1-D6) this suite proves.
 *
 * WHY A DEDICATED FILE, and not an addition to `bootstrapWirings.test.ts`. Verified at planning
 * time: `bootstrapWirings.test.ts` calls `init()` at ~L320, long before any new describe block
 * appended to it would run -- the module-scope `storeUserReconcileInitialized` guard would
 * already be consumed by that first call, so a wiring test placed there could only ever measure
 * a no-op. This is the exact reasoning `playtimeLockBootClear.test.ts`'s own docstring records
 * for its own existence, and this file follows its shape: a virgin file gets a virgin module
 * registry and a virgin guard flag for free, with zero module tricks.
 *
 * NO per-suite `jest.mock('os', ...)`. Containment is structural: `src/backend/jest.config.js`
 * registers `setupFiles: ['<rootDir>/src/backend/jest.setupContainment.ts']` for the whole
 * `Backend` project, redirecting HOME/USERPROFILE/APPDATA/XDG_* before any test file's own
 * imports run -- and `jest.setupContainment.ts` SHADOWS any per-suite `os` mock this file might
 * otherwise declare (established fact 8 / the recorded `per-suite-jest-mock-os-is-inert` finding),
 * so declaring one here would be actively misleading, not merely redundant. This file never
 * references the `'node:os'` specifier anywhere, so `structuralContainment.test.ts`'s `node:os`
 * + `homedir`/`userInfo` gate (established fact 12) stays inert even though this suite mentions
 * `'userInfo'` (the configStore key) throughout.
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
//    synchronous (case 6 excepted, which awaits one microtask flush). This is the standard
//    pattern across the sidecar suites (see this repo's other *Flows.test.ts files driving
//    fetchLastestReleases the same way). `initOnlineMonitor` is stubbed to a no-op so init()'s
//    own real listener registration never runs against the mocked emitter shape; `isOnline` is
//    forced `true` for parity with "invoke inline" even though nothing here reads it directly.
jest.mock('../../online_monitor', () => ({
  ...jest.requireActual('../../online_monitor'),
  initOnlineMonitor: jest.fn(),
  isOnline: jest.fn(() => true),
  runOnceWhenOnline: jest.fn((cb: () => unknown) => cb())
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { PassThrough } from 'node:stream'
import { init, reconcileStoreUsersWhenOnline } from '../bootstrap'
import * as loggerModule from '../../logger'
import { LegendaryUser } from '../../storeManagers/legendary/user'
import { GOGUser } from '../../storeManagers/gog/user'
import { configStore } from '../../constants/key_value_stores'
import { runOnceWhenOnline as mockedRunOnceWhenOnline } from '../../online_monitor'

const EXPECTED_LOG_MESSAGE = 'User Not Found, removing it from Store'
const EXPECTED_LOG_OPTIONS = {
  prefix: loggerModule.LogPrefix.Backend,
  forceLog: true
}

// `src/backend/jest.config.js` sets `resetMocks: true`, which strips the implementation off
// EVERY `jest.fn(...)`-created mock -- including the one supplied at module-factory creation
// time above -- before every single test, the very first one included (verified empirically:
// a bare `jest.mock(..., () => ({ fn: jest.fn(impl) }))` with no re-establishing `beforeEach`
// calls `impl` zero times once resetMocks is active). So the inline-invoke behaviour has to be
// re-armed here, once per test, rather than relied upon from the factory alone.
beforeEach(() => {
  ;(mockedRunOnceWhenOnline as jest.Mock).mockImplementation(
    (cb: () => unknown) => cb()
  )
})

describe('todo 2026-09-06 -- sidecar boot restores Epic/GOG user reconciliation', () => {
  // WIRING PROOF, deliberately the FIRST test in this file that calls `init()`: this is the
  // test that proves `reconcileStoreUsersWhenOnline` is actually CALLED from `init()`, not
  // merely present as an exported, uncalled function.
  it('wiring proof: init() reconciles a logged-out Epic user and logs it', () => {
    const legendaryIsLoggedInSpy = jest
      .spyOn(LegendaryUser, 'isLoggedIn')
      .mockReturnValue(false)
    const gogIsLoggedInSpy = jest
      .spyOn(GOGUser, 'isLoggedIn')
      .mockReturnValue(false)
    configStore.set('userInfo', {
      account_id: 'stale',
      displayName: 'Stale',
      user: 'stale-user'
    })
    const logInfoSpy = jest.spyOn(loggerModule, 'logInfo')

    init(new PassThrough(), new PassThrough())

    expect(configStore.has('userInfo')).toBe(false)
    expect(logInfoSpy).toHaveBeenCalledWith(
      EXPECTED_LOG_MESSAGE,
      EXPECTED_LOG_OPTIONS
    )

    logInfoSpy.mockRestore()
    legendaryIsLoggedInSpy.mockRestore()
    gogIsLoggedInSpy.mockRestore()
  })

  describe('reconcileStoreUsersWhenOnline() -- called directly', () => {
    afterEach(() => {
      configStore.delete('userInfo')
    })

    it('case 2 -- Epic logged OUT: seeded userInfo is deleted, exact log call made', () => {
      const legendaryIsLoggedInSpy = jest
        .spyOn(LegendaryUser, 'isLoggedIn')
        .mockReturnValue(false)
      const gogIsLoggedInSpy = jest
        .spyOn(GOGUser, 'isLoggedIn')
        .mockReturnValue(false)
      configStore.set('userInfo', {
        account_id: 'stale',
        displayName: 'Stale',
        user: 'stale-user'
      })
      const logInfoSpy = jest.spyOn(loggerModule, 'logInfo')

      reconcileStoreUsersWhenOnline()

      expect(configStore.has('userInfo')).toBe(false)
      // Assert the options object, not just the message -- `forceLog` is the receipt D5 exists
      // to protect, and a message-only assertion would pass with it silently dropped.
      const matchingCalls = logInfoSpy.mock.calls.filter(
        ([message, options]) =>
          message === EXPECTED_LOG_MESSAGE &&
          JSON.stringify(options) === JSON.stringify(EXPECTED_LOG_OPTIONS)
      )
      expect(matchingCalls).toHaveLength(1)

      logInfoSpy.mockRestore()
      legendaryIsLoggedInSpy.mockRestore()
      gogIsLoggedInSpy.mockRestore()
    })

    it('case 3 -- Epic logged IN: seeded userInfo SURVIVES, no such log call made', () => {
      const legendaryIsLoggedInSpy = jest
        .spyOn(LegendaryUser, 'isLoggedIn')
        .mockReturnValue(true)
      const gogIsLoggedInSpy = jest
        .spyOn(GOGUser, 'isLoggedIn')
        .mockReturnValue(false)
      configStore.set('userInfo', {
        account_id: 'live',
        displayName: 'Live',
        user: 'live-user'
      })
      const logInfoSpy = jest.spyOn(loggerModule, 'logInfo')

      reconcileStoreUsersWhenOnline()

      expect(configStore.get_nodefault('userInfo')).toEqual({
        account_id: 'live',
        displayName: 'Live',
        user: 'live-user'
      })
      expect(
        logInfoSpy.mock.calls.some(
          ([message]) => message === EXPECTED_LOG_MESSAGE
        )
      ).toBe(false)

      logInfoSpy.mockRestore()
      legendaryIsLoggedInSpy.mockRestore()
      gogIsLoggedInSpy.mockRestore()
    })

    it('case 4 -- GOG logged IN: getUserDetails() called exactly once', async () => {
      const legendaryIsLoggedInSpy = jest
        .spyOn(LegendaryUser, 'isLoggedIn')
        .mockReturnValue(true)
      const gogIsLoggedInSpy = jest
        .spyOn(GOGUser, 'isLoggedIn')
        .mockReturnValue(true)
      const gogGetUserDetailsSpy = jest
        .spyOn(GOGUser, 'getUserDetails')
        .mockResolvedValue(undefined)

      reconcileStoreUsersWhenOnline()
      // Flush the microtask the floated .catch() attaches to, so the spy's call is settled
      // before the test body returns.
      await new Promise(setImmediate)

      expect(gogGetUserDetailsSpy).toHaveBeenCalledTimes(1)

      gogGetUserDetailsSpy.mockRestore()
      legendaryIsLoggedInSpy.mockRestore()
      gogIsLoggedInSpy.mockRestore()
    })

    it('case 5 -- GOG logged OUT: getUserDetails() NOT called', () => {
      const legendaryIsLoggedInSpy = jest
        .spyOn(LegendaryUser, 'isLoggedIn')
        .mockReturnValue(true)
      const gogIsLoggedInSpy = jest
        .spyOn(GOGUser, 'isLoggedIn')
        .mockReturnValue(false)
      const gogGetUserDetailsSpy = jest.spyOn(GOGUser, 'getUserDetails')

      reconcileStoreUsersWhenOnline()

      expect(gogGetUserDetailsSpy).not.toHaveBeenCalled()

      gogGetUserDetailsSpy.mockRestore()
      legendaryIsLoggedInSpy.mockRestore()
      gogIsLoggedInSpy.mockRestore()
    })

    it('case 6 -- never-fails-boot (async arm): a rejected getUserDetails() is caught and warned', async () => {
      const legendaryIsLoggedInSpy = jest
        .spyOn(LegendaryUser, 'isLoggedIn')
        .mockReturnValue(true)
      const gogIsLoggedInSpy = jest
        .spyOn(GOGUser, 'isLoggedIn')
        .mockReturnValue(true)
      const gogGetUserDetailsSpy = jest
        .spyOn(GOGUser, 'getUserDetails')
        .mockRejectedValue(new Error('gogdl auth failed'))
      const logWarningSpy = jest.spyOn(loggerModule, 'logWarning')

      expect(() => reconcileStoreUsersWhenOnline()).not.toThrow()
      // This is what proves D4's `.catch` exists: without it, this rejection would surface as
      // an unhandled rejection instead of a caught, logged warning.
      await new Promise(setImmediate)

      expect(
        logWarningSpy.mock.calls.some(([message]) =>
          String(message).includes('reconcileStoreUsersWhenOnline')
        )
      ).toBe(true)

      logWarningSpy.mockRestore()
      gogGetUserDetailsSpy.mockRestore()
      legendaryIsLoggedInSpy.mockRestore()
      gogIsLoggedInSpy.mockRestore()
    })

    it('case 7 -- never-fails-boot (sync arm): a throwing isLoggedIn() is caught and warned', () => {
      // With `runOnceWhenOnline` mocked to invoke its callback INLINE (the preamble above),
      // the outer try/catch around the `runOnceWhenOnline(...)` registration call ALSO covers
      // this synchronous throw -- so this test alone cannot distinguish the outer guard from
      // the inner one. What it DOES prove is that the throw is caught somewhere and boot is
      // never failed; case 6 above is what isolates the inner guard (a throw that occurs after
      // `runOnceWhenOnline` has already returned, on a later microtask turn, which the outer
      // try/catch's stack frame cannot reach).
      const legendaryIsLoggedInSpy = jest
        .spyOn(LegendaryUser, 'isLoggedIn')
        .mockImplementation(() => {
          throw new Error('existsSync EACCES')
        })
      const gogIsLoggedInSpy = jest
        .spyOn(GOGUser, 'isLoggedIn')
        .mockReturnValue(false)
      const logWarningSpy = jest.spyOn(loggerModule, 'logWarning')

      expect(() => reconcileStoreUsersWhenOnline()).not.toThrow()

      expect(
        logWarningSpy.mock.calls.some(([message]) =>
          String(message).includes('reconcileStoreUsersWhenOnline')
        )
      ).toBe(true)

      logWarningSpy.mockRestore()
      legendaryIsLoggedInSpy.mockRestore()
      gogIsLoggedInSpy.mockRestore()
    })
  })
})
