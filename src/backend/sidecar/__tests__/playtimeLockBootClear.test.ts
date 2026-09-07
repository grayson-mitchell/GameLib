/**
 * Sidecar boot-time stranded playtime-lock clear (finding A1 LEG 2, quick-260907-odi).
 *
 * `syncQueuedPlaytime()`'s `lock` sentinel (`gog/library.ts:169`) is stored in
 * `playtimeSyncQueue`, a file-backed `CacheStore` (`gog/electronStores.ts:42`) that survives
 * process restarts. `CacheStore` evaluates its lifespan/expiry only inside `get()`
 * (`cache.ts:64-88`); the guard at `library.ts:170` uses `has()` (`cache.ts:142`), a raw
 * passthrough with NO expiry check, and nothing ever calls `get('lock')` for that key -- so a
 * lock stranded by process death (SIGKILL, crash, power loss) never ages out on its own. The
 * deleted Electron `main.ts:469` cleared a stranded lock at every boot
 * (`playtimeSyncQueue.delete('lock')`); that line has no successor in the Tauri sidecar. This is
 * LEG 2 of a two-leg fix -- LEG 1 is the `try/finally` added to `syncQueuedPlaytime()` itself
 * (`gog/library.test.ts`'s "finding A1 LEG 1" describe block), which covers an in-process throw
 * but cannot cover process death, since `finally` never runs if the process is killed. Neither
 * leg alone fixes the wedge.
 *
 * WHY A DEDICATED FILE, and not an addition to `bootstrap.test.ts`. Verified at planning time:
 * `bootstrap.test.ts` already calls `init()` at ~L138 ("reaches READY under bare node"), long
 * before any new describe block in that file would run. `clearStrandedPlaytimeSyncLock` must be
 * called from `init()` behind a module-scope once-guard flag (this file's own convention, shared
 * with `bootstrap.ts`'s other seven guards) -- placed anywhere in `bootstrap.test.ts` that guard
 * would already be consumed by that first `init()` call, so a boot-clear test placed there could
 * only ever measure a no-op. The alternative, `jest.resetModules()` + a fresh
 * `require('../bootstrap')`, was rejected too: that re-evaluates `installElectronHook`, which has
 * NO idempotency guard of its own (`installElectronHook.ts:44-46` rebinds `Module._load`
 * unconditionally) and would leave a nested global hook in the worker for every subsequent suite.
 * A virgin file gets a virgin module registry and a virgin guard flag for free, with zero module
 * tricks -- `migrationsWiring.test.ts` exists for exactly this reason, and this file follows its
 * shape: real `backend/store_backend` routed at the sidecar's real file-backed shim, `axios`
 * mocked so `initOnlineMonitor()`'s `pingSites()` cannot make a live network call, and NO
 * per-suite `jest.mock('os', ...)` -- containment comes from `src/backend/jest.setupContainment.ts`'s
 * `setupFiles` registration for the whole backend project, not a local mock.
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

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { PassThrough } from 'node:stream'
import { init, clearStrandedPlaytimeSyncLock } from '../bootstrap'
import * as loggerModule from '../../logger'
import { playtimeSyncQueue } from '../../storeManagers/gog/electronStores'

const EXPECTED_LOG_MESSAGE =
  '[bootstrap] Cleared a stranded GOG playtime sync lock left by an interrupted sync'

describe('finding A1 LEG 2 -- sidecar boot clears a stranded GOG playtime sync lock', () => {
  // WIRING PROOF, deliberately the FIRST test in this file that calls `init()`: this is the
  // test that proves `clearStrandedPlaytimeSyncLock` is actually CALLED from `init()`, not
  // merely present as an exported, uncalled function. RED today: `init()` has no such call at
  // all, so the seeded lock survives and nothing is logged.
  it('wiring proof: init() clears a stranded lock and logs it', () => {
    playtimeSyncQueue.set('lock', [])
    expect(playtimeSyncQueue.has('lock')).toBe(true)
    const logWarningSpy = jest.spyOn(loggerModule, 'logWarning')

    init(new PassThrough(), new PassThrough())

    expect(playtimeSyncQueue.has('lock')).toBe(false)
    expect(
      logWarningSpy.mock.calls.some(
        ([message]) => message === EXPECTED_LOG_MESSAGE
      )
    ).toBe(true)

    logWarningSpy.mockRestore()
  })

  describe('clearStrandedPlaytimeSyncLock() -- the two arms, called directly', () => {
    it('stranded arm: a seeded lock is cleared, and the exact message is logged once', () => {
      playtimeSyncQueue.set('lock', [])
      expect(playtimeSyncQueue.has('lock')).toBe(true)
      const logWarningSpy = jest.spyOn(loggerModule, 'logWarning')

      clearStrandedPlaytimeSyncLock()

      expect(playtimeSyncQueue.has('lock')).toBe(false)
      const matchingCalls = logWarningSpy.mock.calls.filter(
        ([message]) => message === EXPECTED_LOG_MESSAGE
      )
      expect(matchingCalls).toHaveLength(1)

      logWarningSpy.mockRestore()
    })

    it('clean arm: no lock seeded -- the store is untouched and nothing is logged', () => {
      expect(playtimeSyncQueue.has('lock')).toBe(false)
      const logWarningSpy = jest.spyOn(loggerModule, 'logWarning')

      clearStrandedPlaytimeSyncLock()

      expect(playtimeSyncQueue.has('lock')).toBe(false)
      expect(logWarningSpy).not.toHaveBeenCalled()

      logWarningSpy.mockRestore()
    })
  })
})
