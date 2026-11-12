/**
 * GOG presence keep-alive lifecycle (todo
 * 2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md,
 * quick-260910-drs).
 *
 * The keep-alive handle lives on the boot's GogRuntime presence slot (66.4-10; it was a module
 * `let interval`), armed on the injected clock. `setPresence()` arms a 5-minute
 * keep-alive exactly once, guarded by the slot's `armKeepAlive()`. `deletePresence()` used to call
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
 * Each case builds its own runtime on its own fake clock, so no case depends on another's
 * armed-or-torn-down state and no real timer is ever armed.
 *
 * NO reference to the `node:os` specifier or `homedir`/`userInfo` anywhere in this file --
 * containment is already structural via `src/backend/jest.setupContainment.ts` (registered as
 * `setupFiles` for the whole `Backend` project), so `structuralContainment.test.ts`'s gate stays
 * inert against this file.
 */

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Gog: 'Gog' }
}))

// Narrow factory exposing only what presence.ts consumes -- never mock the whole real utils
// module, per the established gog-suite pattern (see logoutCookies.test.ts).
jest.mock('backend/utils', () => ({
  axiosClient: {
    post: jest.fn(),
    delete: jest.fn()
  }
}))

jest.mock('backend/storeManagers/gog/user', () => ({
  GOGUser: {
    isLoggedIn: jest.fn(),
    getCredentials: jest.fn()
  }
}))

import { axiosClient } from 'backend/utils'
import type { GOGPresenceDeps } from '../presence'
import { GOGUser } from 'backend/storeManagers/gog/user'
import gogPresence from '../presence'
import { createFakeClock } from 'backend/testUtils/fakeClock'
import { createTestGogRuntime } from 'backend/testUtils/testGogRuntime'

type MockAxiosClient = {
  post: jest.Mock
  delete: jest.Mock
}
const mockAxiosClient = axiosClient as unknown as MockAxiosClient
const mockIsLoggedIn = jest.mocked(GOGUser).isLoggedIn
const mockGetCredentials = jest.mocked(GOGUser).getCredentials

const mockGetSettings = jest.fn()
// A fresh runtime on a fresh fake clock per case: GOGUser is mocked, so only the presence slot and
// the settings/online reads are used.
let clock = createFakeClock()
let deps = makeDeps()

function makeDeps(): GOGPresenceDeps {
  clock = createFakeClock()
  return {
    stores: {},
    libraryManagers: {},
    appInfo: { version: '1.0.0' },
    onlineMonitor: { isOnline: () => true, runOnceWhenOnline: jest.fn() },
    config: { getSettings: mockGetSettings },
    gogRuntime: createTestGogRuntime(clock)
  } as unknown as GOGPresenceDeps
}

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
  mockGetSettings.mockReturnValue({
    disableGOGPresence: false,
    disablePlaytimeSync: false
  })
  mockIsLoggedIn.mockReturnValue(true)
  mockGetCredentials.mockResolvedValue(FAKE_CREDENTIALS)
  mockAxiosClient.post.mockResolvedValue({ status: 204 })
  mockAxiosClient.delete.mockResolvedValue({ status: 204 })
}

beforeEach(() => {
  jest.clearAllMocks()
  deps = makeDeps()
  installDefaultMocks()
})

describe('todo 2026-09-09 -- GOG presence keep-alive re-arm after deletePresence()', () => {
  // Case 1: THE defect, deliberately the FIRST test in this file so `interval`'s module-scope
  // sticky state starts virgin for the lifecycle it drives.
  it('case 1 -- setPresence() re-arms the keep-alive after a deletePresence() teardown, in the SAME process', async () => {
    // Arm: first setPresence() call.
    await gogPresence.setPresence(deps)
    expect(mockAxiosClient.post).toHaveBeenCalledTimes(1)

    // Tear down.
    await gogPresence.deletePresence(deps, true)
    expect(mockAxiosClient.delete).toHaveBeenCalledTimes(1)

    // A timer that survived teardown would fire here and produce an extra POST before the
    // re-arming call below -- prove it does not.
    clock.advance(FIVE_MINUTES_MS)
    await Promise.resolve()
    expect(mockAxiosClient.post).toHaveBeenCalledTimes(1)

    // Re-arm: THIRD call, in the same process, after teardown.
    await gogPresence.setPresence(deps)
    expect(mockAxiosClient.post).toHaveBeenCalledTimes(2)

    // Behavioural proof the keep-alive is LIVE again: advancing 5 minutes produces an
    // ADDITIONAL, timer-driven POST -- not merely a truthy timer handle.
    clock.advance(FIVE_MINUTES_MS)
    await new Promise(setImmediate)
    expect(mockAxiosClient.post).toHaveBeenCalledTimes(3)
  })

  // Case 2: guards against the opposite naive fix (unconditional setInterval on every call).
  // Uses its own fresh runtime, so its baseline is not contaminated by Case 1.
  it('case 2 -- two consecutive setPresence() calls while a keep-alive is already live arm exactly ONE timer', async () => {
    const presence = gogPresence
    const isolatedAxiosClient = mockAxiosClient

    await presence.setPresence(deps)
    await presence.setPresence(deps)
    expect(isolatedAxiosClient.post).toHaveBeenCalledTimes(2)

    clock.advance(FIVE_MINUTES_MS)
    await new Promise(setImmediate)

    // Exactly one additional, timer-driven POST -- not two.
    expect(isolatedAxiosClient.post).toHaveBeenCalledTimes(3)
  })

  // Case 3: D-DRS-01 receipt. Also uses a fresh runtime so this case's keep-alive state
  // does not depend on Case 1/2 having already run in this file, and does not leave a stray
  // timer behind for whatever test runs after it.
  it('case 3 -- D-DRS-01 receipt: a guarded deletePresence() call still tears down the live keep-alive (Option A hoists teardown above the guards)', async () => {
    const isolatedPresence = gogPresence
    const isolatedAxiosClient = mockAxiosClient

    // Arm the keep-alive under normal settings.
    await isolatedPresence.setPresence(deps)
    expect(isolatedAxiosClient.post).toHaveBeenCalledTimes(1)

    // Now flip disablePlaytimeSync on -- deletePresence()'s early-return guard blocks the
    // network DELETE, but per D-DRS-01 Option A the local teardown runs anyway.
    mockGetSettings.mockReturnValue({
      disableGOGPresence: false,
      disablePlaytimeSync: true
    })

    await isolatedPresence.deletePresence(deps, true)

    // The guard blocked the network call.
    expect(isolatedAxiosClient.delete).not.toHaveBeenCalled()

    // Re-enable settings WITHOUT calling setPresence()/deletePresence() again. This is the part
    // that actually distinguishes Option A from Option B/today's code: setPresence()'s own
    // disablePlaytimeSync guard would mask a still-live timer's tick either way, so re-enabling
    // before advancing is what makes a surviving timer observable as an extra POST.
    mockGetSettings.mockReturnValue({
      disableGOGPresence: false,
      disablePlaytimeSync: false
    })

    // Under D-DRS-01 Option A, the local keep-alive was torn down UNCONDITIONALLY inside the
    // guarded deletePresence() call above, so no timer survives to fire here -- advancing 5
    // minutes produces NO additional POST. (Under Option B / today's unfixed code, the guard
    // short-circuits before `clearInterval` is ever reached, so the ORIGINAL timer from the arm
    // above is still live and DOES fire here, producing a second POST once settings are
    // re-enabled -- that is the failure this case is designed to catch if D-DRS-01 is silently
    // reverted.)
    clock.advance(FIVE_MINUTES_MS)
    await new Promise(setImmediate)
    expect(isolatedAxiosClient.post).toHaveBeenCalledTimes(1)
  })
})
