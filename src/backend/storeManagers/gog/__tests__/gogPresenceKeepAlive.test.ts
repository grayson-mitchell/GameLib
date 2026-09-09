/**
 * GOG presence keep-alive lifecycle (todo
 * 2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md,
 * quick-260910-drs).
 *
 * `presence.ts` declares `let interval` at module scope. `setPresence()` arms a 5-minute
 * keep-alive exactly once, guarded by `if (!interval)`. `deletePresence()` used to call
 * `clearInterval(interval)` without ever resetting `interval` back to a falsy value --
 * `clearInterval` does not mutate its argument, so `interval` stayed truthy forever and the
 * keep-alive could never re-arm after the first `deletePresence()` call in a process, even
 * though `setPresence()` itself kept being called and kept posting presence successfully.
 *
 * What this file proves, and why each case is load-bearing:
 *
 *  1. Case 1 is THE defect: a full `setPresence()` -> `deletePresence(true)` -> `setPresence()`
 *     lifecycle in one ordered test, proven behaviourally by advancing fake timers 5 minutes
 *     after the re-arm and observing an ADDITIONAL `axiosClient.post`. Asserting on the `post`
 *     call count (not `jest.getTimerCount()`) is what makes this case fail against the pre-fix
 *     code: a naive fix that resets `interval` but forgets `setPresence` never re-registers a
 *     LIVE timer would still show a nonzero handle count while never actually POSTing again.
 *  2. Case 2 guards against the opposite naive fix -- unconditionally calling `setInterval` on
 *     every `setPresence()` call, which would stack a new 5-minute timer per invocation and fan
 *     out into N presence POSTs per tick instead of one.
 *  3. Case 3 pins D-DRS-01 (see `presence.ts`'s `deletePresence()` docblock): the audit chose
 *     OPTION A, hoisting the local timer teardown above every early-return guard, so a guarded
 *     `deletePresence()` call (here, `disablePlaytimeSync: true`) still clears the live keep-alive
 *     even though the guard blocks the network DELETE. If D-DRS-01 is ever silently reverted back
 *     to Option B (teardown at the original post-guard site), this case goes RED because the
 *     timer survives and the module-scope `interval` stays live past a guarded call.
 *
 * Module-state ordering matters: `interval` is module scope and sticky across every test in this
 * file, which is why Case 1's lifecycle is written as ONE ordered `it` and placed first, and why
 * Case 3 re-requires a virgin module via `jest.isolateModules` rather than relying on Case 1/2's
 * already-armed-or-torn-down module state.
 *
 * NO reference to the `node:os` specifier or `homedir`/`userInfo` anywhere in this file --
 * containment is already structural via `src/backend/jest.setupContainment.ts` (registered as
 * `setupFiles` for the whole `Backend` project), so `structuralContainment.test.ts`'s gate stays
 * inert against this file.
 */

jest.mock('backend/platform', () => ({
  app: { getVersion: () => '1.0.0' }
}))

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Gog: 'Gog' }
}))

jest.mock('backend/online_monitor', () => ({
  isOnline: () => true
}))

// Narrow factory exposing only what presence.ts consumes -- never mock the whole real utils
// module, per the established gog-suite pattern (see logoutCookies.test.ts).
jest.mock('backend/utils', () => ({
  axiosClient: {
    post: jest.fn(),
    delete: jest.fn()
  }
}))

jest.mock('backend/config', () => ({
  GlobalConfig: { get: jest.fn() }
}))

jest.mock('backend/storeManagers/gog/user', () => ({
  GOGUser: {
    isLoggedIn: jest.fn(),
    getCredentials: jest.fn()
  }
}))

import { axiosClient } from 'backend/utils'
import { GlobalConfig } from 'backend/config'
import { GOGUser } from 'backend/storeManagers/gog/user'
import gogPresence from '../presence'

type MockAxiosClient = {
  post: jest.Mock
  delete: jest.Mock
}
const mockAxiosClient = axiosClient as unknown as MockAxiosClient
// `jest.mocked(GOGUser).isLoggedIn`/`.getCredentials` do NOT trip
// @typescript-eslint/unbound-method here, but `GlobalConfig.get` is a real class static
// method and DOES -- so it is deliberately never extracted to a standalone reference below.
// It is always cast-and-called inline instead: `(GlobalConfig.get as jest.Mock).mockReturnValue(...)`.
// See depot.test.ts's own precedent comment for the same constraint against a different class.
const mockIsLoggedIn = jest.mocked(GOGUser).isLoggedIn
const mockGetCredentials = jest.mocked(GOGUser).getCredentials

const FIVE_MINUTES_MS = 5 * 60 * 1000

// Fabricated credentials -- no real token, no real GOG account (T-DRS-05).
const FAKE_CREDENTIALS = {
  access_token: 't1',
  expires_in: 3600,
  token_type: 'bearer',
  scope: '',
  session_id: 's1',
  refresh_token: 'r1',
  user_id: 'u1',
  loginType: 1
}

function installDefaultMocks(): void {
  ;(GlobalConfig.get as jest.Mock).mockReturnValue({
    getSettings: () => ({
      disableGOGPresence: false,
      disablePlaytimeSync: false
    })
  })
  mockIsLoggedIn.mockReturnValue(true)
  mockGetCredentials.mockResolvedValue(FAKE_CREDENTIALS)
  mockAxiosClient.post.mockResolvedValue({ status: 204 })
  mockAxiosClient.delete.mockResolvedValue({ status: 204 })
}

interface IsolatedPresenceHarness {
  presence: typeof gogPresence
  axiosClient: MockAxiosClient
  globalConfigGet: jest.Mock
  isLoggedIn: jest.Mock
  getCredentials: jest.Mock
}

/**
 * `interval` is module scope in presence.ts and sticky across every test in this file that
 * imports the module at file scope (Case 1, Case 2's own baseline). Case 2 and Case 3 each need
 * a virgin `interval` unaffected by whatever an earlier case left armed or torn down, so each
 * gets its own fresh module copy via `jest.isolateModules` (mirrors
 * bootstrapWirings.test.ts's own single precedent use of this pattern) rather than relying on
 * file-scope import order. Exactly two call sites use this helper (Case 2, Case 3) -- each
 * re-require also re-registers presence.ts's module-scope `settingChanged` listener on the real
 * `backendEvents` emitter, and Node warns past ten listeners.
 */
function loadIsolatedPresence(): IsolatedPresenceHarness {
  let harness!: IsolatedPresenceHarness
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const axiosClientHandle = require('backend/utils').axiosClient
    const globalConfigGetHandle = require('backend/config').GlobalConfig.get
    const gogUserHandle = require('backend/storeManagers/gog/user').GOGUser
    const presenceHandle = require('../presence').default
    /* eslint-enable @typescript-eslint/no-require-imports */
    harness = {
      presence: presenceHandle,
      axiosClient: axiosClientHandle,
      globalConfigGet: globalConfigGetHandle,
      isLoggedIn: gogUserHandle.isLoggedIn,
      getCredentials: gogUserHandle.getCredentials
    }
  })

  harness.globalConfigGet.mockReturnValue({
    getSettings: () => ({
      disableGOGPresence: false,
      disablePlaytimeSync: false
    })
  })
  harness.isLoggedIn.mockReturnValue(true)
  harness.getCredentials.mockResolvedValue(FAKE_CREDENTIALS)
  harness.axiosClient.post.mockResolvedValue({ status: 204 })
  harness.axiosClient.delete.mockResolvedValue({ status: 204 })

  return harness
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] })
  installDefaultMocks()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('todo 2026-09-09 -- GOG presence keep-alive re-arm after deletePresence()', () => {
  // Case 1: THE defect, deliberately the FIRST test in this file so `interval`'s module-scope
  // sticky state starts virgin for the lifecycle it drives.
  it('case 1 -- setPresence() re-arms the keep-alive after a deletePresence() teardown, in the SAME process', async () => {
    // Arm: first setPresence() call.
    await gogPresence.setPresence()
    expect(mockAxiosClient.post).toHaveBeenCalledTimes(1)

    // Tear down.
    await gogPresence.deletePresence(true)
    expect(mockAxiosClient.delete).toHaveBeenCalledTimes(1)

    // A timer that survived teardown would fire here and produce an extra POST before the
    // re-arming call below -- prove it does not.
    jest.advanceTimersByTime(FIVE_MINUTES_MS)
    await Promise.resolve()
    expect(mockAxiosClient.post).toHaveBeenCalledTimes(1)

    // Re-arm: THIRD call, in the same process, after teardown.
    await gogPresence.setPresence()
    expect(mockAxiosClient.post).toHaveBeenCalledTimes(2)

    // Behavioural proof the keep-alive is LIVE again: advancing 5 minutes produces an
    // ADDITIONAL, timer-driven POST -- not merely a truthy timer handle.
    jest.advanceTimersByTime(FIVE_MINUTES_MS)
    await new Promise(setImmediate)
    expect(mockAxiosClient.post).toHaveBeenCalledTimes(3)
  })

  // Case 2: guards against the opposite naive fix (unconditional setInterval on every call).
  // Uses its own isolated module copy so its baseline is not contaminated by whatever Case 1
  // left `interval` holding.
  it('case 2 -- two consecutive setPresence() calls while a keep-alive is already live arm exactly ONE timer', async () => {
    const { presence, axiosClient: isolatedAxiosClient } =
      loadIsolatedPresence()

    await presence.setPresence()
    await presence.setPresence()
    expect(isolatedAxiosClient.post).toHaveBeenCalledTimes(2)

    jest.advanceTimersByTime(FIVE_MINUTES_MS)
    await new Promise(setImmediate)

    // Exactly one additional, timer-driven POST -- not two.
    expect(isolatedAxiosClient.post).toHaveBeenCalledTimes(3)
  })

  // Case 3: D-DRS-01 receipt. Also uses an isolated module copy so this case's `interval` state
  // does not depend on Case 1/2 having already run in this file, and does not leave a stray
  // timer behind for whatever test runs after it.
  it('case 3 -- D-DRS-01 receipt: a guarded deletePresence() call still tears down the live keep-alive (Option A hoists teardown above the guards)', async () => {
    const {
      presence: isolatedPresence,
      axiosClient: isolatedAxiosClient,
      globalConfigGet: isolatedGlobalConfigGet
    } = loadIsolatedPresence()

    // Arm the keep-alive under normal settings.
    await isolatedPresence.setPresence()
    expect(isolatedAxiosClient.post).toHaveBeenCalledTimes(1)

    // Now flip disablePlaytimeSync on -- deletePresence()'s early-return guard blocks the
    // network DELETE, but per D-DRS-01 Option A the local teardown runs anyway.
    isolatedGlobalConfigGet.mockReturnValue({
      getSettings: () => ({
        disableGOGPresence: false,
        disablePlaytimeSync: true
      })
    })

    await isolatedPresence.deletePresence(true)

    // The guard blocked the network call.
    expect(isolatedAxiosClient.delete).not.toHaveBeenCalled()

    // Re-enable settings WITHOUT calling setPresence()/deletePresence() again. This is the part
    // that actually distinguishes Option A from Option B/today's code: setPresence()'s own
    // disablePlaytimeSync guard would mask a still-live timer's tick either way, so re-enabling
    // before advancing is what makes a surviving timer observable as an extra POST.
    isolatedGlobalConfigGet.mockReturnValue({
      getSettings: () => ({
        disableGOGPresence: false,
        disablePlaytimeSync: false
      })
    })

    // Under D-DRS-01 Option A, the local keep-alive was torn down UNCONDITIONALLY inside the
    // guarded deletePresence() call above, so no timer survives to fire here -- advancing 5
    // minutes produces NO additional POST. (Under Option B / today's unfixed code, the guard
    // short-circuits before `clearInterval` is ever reached, so the ORIGINAL timer from the arm
    // above is still live and DOES fire here, producing a second POST once settings are
    // re-enabled -- that is the failure this case is designed to catch if D-DRS-01 is silently
    // reverted.)
    jest.advanceTimersByTime(FIVE_MINUTES_MS)
    await new Promise(setImmediate)
    expect(isolatedAxiosClient.post).toHaveBeenCalledTimes(1)
  })
})
