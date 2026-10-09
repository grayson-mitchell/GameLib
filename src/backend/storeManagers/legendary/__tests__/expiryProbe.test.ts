/**
 * 49-05 Task 1 (R2, P1, D-05, 260822-vov): Epic's expiry probe and its flag clear
 * sites. `expired` is set ONLY by `applySignInVerdict`, and only from an
 * authentication failure; sign-in success and logout clear it.
 *
 * `runRunnerCommand` is mocked and driven through `options.onOutput`, so no
 * binary is spawned (the isolated half of the fake-HOME two-profile rule holds
 * by construction).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { sendFrontendMessage } from 'backend/ipc'
import { legendaryConfigStore } from 'backend/storeManagers/legendary/electronStores'
import {
  __resetSignInEpochsForTests,
  captureSignInEpoch
} from 'backend/signInProbe/sessionEpoch'
import {
  __resetSignInProbeOutcomesForTests,
  getSignInProbeOutcomes,
  noteSignInSucceeded
} from 'backend/signInProbe/outcomes'
import { applySignInVerdict } from 'backend/signInProbe/verdict'
import { probeLegendarySession } from 'backend/signInProbe/runnerProbes'
import type { FakeFlagStore } from 'backend/signInProbe/__tests__/fakeFlagStore'
import { LegendaryUser } from '../user'

jest.mock('../constants', () => ({
  legendaryUserInfo: '/tmp/gamelib-legendary-expiry-test/user.json'
}))
jest.mock('backend/logger', () => ({
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Legendary: 'Legendary', Backend: 'Backend' }
}))
jest.mock('../../../utils', () => ({ clearCache: jest.fn() }))
jest.mock('backend/constants/key_value_stores', () => ({
  configStore: {
    get: jest.fn(),
    get_nodefault: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn()
  }
}))
jest.mock('../../../humble/userAgent', () => ({
  standardBrowserUserAgent: () => 'Mozilla/5.0 (Test)'
}))
jest.mock('backend/ipc', () => ({
  sendFrontendMessage: jest.fn(),
  addHandler: jest.fn()
}))

const mockRunRunnerCommand = jest.fn()
jest.mock('../..', () => ({
  libraryManagerMap: {
    legendary: {
      runRunnerCommand: (...args: unknown[]) => mockRunRunnerCommand(...args)
    }
  }
}))

// Plain-object fake stores (immune to resetMocks), one per store verdict.ts reaches.
jest.mock('backend/storeManagers/legendary/electronStores', () => ({
  legendaryConfigStore: jest
    .requireActual<
      typeof import('backend/signInProbe/__tests__/fakeFlagStore')
    >('backend/signInProbe/__tests__/fakeFlagStore')
    .makeFakeFlagStore()
}))
jest.mock('backend/storeManagers/gog/electronStores', () => ({
  configStore: jest
    .requireActual<
      typeof import('backend/signInProbe/__tests__/fakeFlagStore')
    >('backend/signInProbe/__tests__/fakeFlagStore')
    .makeFakeFlagStore()
}))
jest.mock('backend/storeManagers/nile/electronStores', () => ({
  configStore: jest
    .requireActual<
      typeof import('backend/signInProbe/__tests__/fakeFlagStore')
    >('backend/signInProbe/__tests__/fakeFlagStore')
    .makeFakeFlagStore()
}))
jest.mock('backend/storeManagers/steam/electronStores', () => ({
  configStore: jest
    .requireActual<
      typeof import('backend/signInProbe/__tests__/fakeFlagStore')
    >('backend/signInProbe/__tests__/fakeFlagStore')
    .makeFakeFlagStore()
}))
jest.mock('backend/humble/electronStores', () => ({
  configStore: jest
    .requireActual<
      typeof import('backend/signInProbe/__tests__/fakeFlagStore')
    >('backend/signInProbe/__tests__/fakeFlagStore')
    .makeFakeFlagStore()
}))

const flag = legendaryConfigStore as unknown as FakeFlagStore
const sendMock = sendFrontendMessage as unknown as jest.Mock

type RunOptions = { onOutput?: (chunk: string) => void }

function armRunner(
  chunks: string[],
  result: { error?: string; abort?: boolean } = {}
) {
  mockRunRunnerCommand.mockImplementation(
    (_command: unknown, options: RunOptions) => {
      chunks.forEach((chunk) => options.onOutput?.(chunk))
      return Promise.resolve({
        stdout: '',
        stderr: '',
        error: result.error,
        abort: result.abort ?? false
      })
    }
  )
}

/** The pass's shape: capture the epoch, probe, apply. */
async function probeAndApply() {
  const epoch = captureSignInEpoch('legendary')
  const outcome = await probeLegendarySession()
  return { outcome, result: applySignInVerdict('legendary', outcome, epoch) }
}

beforeEach(() => {
  flag.reset()
  __resetSignInEpochsForTests()
  __resetSignInProbeOutcomesForTests()
  armRunner([])
})

describe('Epic: an authentication failure latches the flag', () => {
  it('latches expired for "Stored credentials are no longer valid" through applySignInVerdict', async () => {
    armRunner(['Stored credentials are no longer valid! Please login again.'], {
      error: 'Process exited with code 1'
    })

    const { outcome, result } = await probeAndApply()

    expect(outcome).toBe('expired')
    expect(result).toBe('latched')
    expect(flag.data.get('expired')).toBe(true)
  })
})

describe('Epic: a non-auth failure leaves the flag unchanged (260822-vov)', () => {
  it.each([
    [
      'HTTP request for login failed',
      ['HTTP request for login failed: connection reset'],
      { error: 'Process exited with code 1' }
    ],
    [
      'an abort (timeout or bound)',
      ['Stored credentials are no longer valid! Please login again.'],
      { abort: true }
    ],
    ['a joined spawn that produced no output', [], {}]
  ])('%s does not set expired', async (_label, chunks, result) => {
    armRunner(chunks, result)

    const applied = await probeAndApply()

    expect(applied.outcome).toBe('unknown')
    expect(applied.result).toBe('unchanged')
    expect(flag.sets).toEqual([])
    expect(flag.data.has('expired')).toBe(false)
  })

  it('does not clear an already latched flag on a non-auth failure either', async () => {
    flag.data.set('expired', true)
    armRunner(['HTTP request for login failed: timeout'], { error: 'exit 1' })

    await probeAndApply()

    expect(flag.data.get('expired')).toBe(true)
    expect(flag.deletes).toEqual([])
  })
})

describe('Epic: sign-in success and logout clear the flag', () => {
  it('login success deletes expired and publishes healthy via noteSignInSucceeded', async () => {
    flag.data.set('expired', true)
    armRunner([])

    const res = await LegendaryUser.login('auth-code-123')

    expect(res.status).toBe('done')
    expect(flag.deletes).toContain('expired')
    expect(flag.data.has('expired')).toBe(false)
    expect(getSignInProbeOutcomes().legendary).toBe('healthy')
    expect(sendMock).toHaveBeenCalledWith('signInProbeOutcomes', {
      outcomes: expect.objectContaining({ legendary: 'healthy' })
    })
  })

  it('a failed login leaves the flag and the outcome alone', async () => {
    flag.data.set('expired', true)
    armRunner([], { error: 'login exploded' })

    const res = await LegendaryUser.login('auth-code-123')

    expect(res.status).toBe('failed')
    expect(flag.data.get('expired')).toBe(true)
    expect(getSignInProbeOutcomes().legendary).toBeUndefined()
  })

  it('logout deletes expired, returns the outcome to pending and bumps the epoch', async () => {
    flag.data.set('expired', true)
    noteSignInSucceeded('legendary')
    const epochBefore = captureSignInEpoch('legendary')
    armRunner([])

    // The cookie wipe steps are not under test (no login-window seam is
    // installed, so the fatal step rejects); the credential-side cleanup runs
    // unconditionally before that rethrow (Phase 40 CR-03).
    await LegendaryUser.logout().catch(() => undefined)

    expect(flag.data.has('expired')).toBe(false)
    expect(getSignInProbeOutcomes().legendary).toBeUndefined()
    expect(captureSignInEpoch('legendary')).not.toBe(epochBefore)
  })
})

describe('Epic: the only latch is applySignInVerdict (source gate)', () => {
  it('legendary/user.ts never writes set("expired", true)', () => {
    const source = stripSourceComments(
      readFileSync(join(__dirname, '..', 'user.ts'), 'utf8')
    )
    expect(source).not.toMatch(/set\(\s*'expired'\s*,\s*true\s*\)/)
  })
})

describe('Epic: a probe that began before a sign-in cannot re-set expired', () => {
  it('returns stale with no write when the epoch moved after the probe started', () => {
    const epochAtStart = captureSignInEpoch('legendary')
    noteSignInSucceeded('legendary')

    const result = applySignInVerdict('legendary', 'expired', epochAtStart)

    expect(result).toBe('stale')
    expect(flag.sets).toEqual([])
    expect(flag.data.has('expired')).toBe(false)
  })
})
