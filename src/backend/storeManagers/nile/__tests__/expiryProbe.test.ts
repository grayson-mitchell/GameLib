/**
 * 49-05 Task 1 (R2, P1, D-05, 260822-vov): Amazon's expiry probe and its flag
 * clear sites. `expired` is set ONLY by `applySignInVerdict`, and only from a
 * 400/401/403 token-refresh failure; sign-in success and logout clear it.
 *
 * `runRunnerCommand` is mocked and driven through `options.onOutput`, so no
 * binary is spawned (the isolated half of the fake-HOME two-profile rule holds
 * by construction).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { sendFrontendMessage } from 'backend/ipc'
import { configStore as nileConfigStore } from 'backend/storeManagers/nile/electronStores'
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
import { probeNileSession } from 'backend/signInProbe/runnerProbes'
import type { FakeFlagStore } from 'backend/signInProbe/__tests__/fakeFlagStore'
import { NileUser } from '../user'

jest.mock('backend/logger', () => ({
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Nile: 'Nile', Backend: 'Backend' }
}))
jest.mock('backend/utils', () => ({ clearCache: jest.fn() }))
jest.mock('backend/ipc', () => ({
  sendFrontendMessage: jest.fn(),
  addHandler: jest.fn()
}))

const mockRunRunnerCommand = jest.fn()
jest.mock('../..', () => ({
  libraryManagerMap: {
    nile: {
      runRunnerCommand: (...args: unknown[]) => mockRunRunnerCommand(...args)
    }
  }
}))

// Plain-object fake stores (immune to resetMocks), one per store verdict.ts reaches.
jest.mock('backend/storeManagers/nile/electronStores', () => ({
  configStore: jest
    .requireActual<
      typeof import('backend/signInProbe/__tests__/fakeFlagStore')
    >('backend/signInProbe/__tests__/fakeFlagStore')
    .makeFakeFlagStore()
}))
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

const flag = nileConfigStore as unknown as FakeFlagStore
const sendMock = sendFrontendMessage as unknown as jest.Mock

type RunOptions = { onOutput?: (chunk: string) => void }

function armRunner(
  chunks: string[],
  result: { error?: string; abort?: boolean; stderr?: string } = {}
) {
  mockRunRunnerCommand.mockImplementation(
    (_argv: unknown, options: RunOptions) => {
      chunks.forEach((chunk) => options.onOutput?.(chunk))
      return Promise.resolve({
        stdout: '',
        stderr: result.stderr ?? '',
        error: result.error,
        abort: result.abort ?? false
      })
    }
  )
}

/** The pass's shape: capture the epoch, probe, apply. */
async function probeAndApply() {
  const epoch = captureSignInEpoch('nile')
  const outcome = await probeNileSession()
  return { outcome, result: applySignInVerdict('nile', outcome, epoch) }
}

const REGISTER_DATA = {
  code: 'code-1',
  code_verifier: 'verifier-1',
  serial: 'serial-1',
  client_id: 'client-1'
}

beforeEach(() => {
  flag.reset()
  __resetSignInEpochsForTests()
  __resetSignInProbeOutcomesForTests()
  armRunner([])
})

describe('Amazon: an authentication failure latches the flag', () => {
  it.each(['400', '401', '403'])(
    'latches expired for "Failed to refresh the token <Response [%s]>" through applySignInVerdict',
    async (status) => {
      armRunner([`Failed to refresh the token <Response [${status}]>`])

      const { outcome, result } = await probeAndApply()

      expect(outcome).toBe('expired')
      expect(result).toBe('latched')
      expect(flag.data.get('expired')).toBe(true)
    }
  )
})

describe('Amazon: a non-auth failure leaves the flag unchanged (260822-vov)', () => {
  it.each([
    [
      'a connection error',
      ['Failed to refresh the token HTTPSConnectionPool: Max retries exceeded'],
      {}
    ],
    ['a 503 response', ['Failed to refresh the token <Response [503]>'], {}],
    [
      'an abort (timeout or bound)',
      ['Failed to refresh the token <Response [401]>'],
      { abort: true }
    ],
    ['a joined spawn that produced no output', [], {}]
  ])('%s does not set expired', async (_label, chunks, result) => {
    armRunner(chunks, result)

    const applied = await probeAndApply()

    expect(applied.result).toBe('unchanged')
    expect(flag.sets).toEqual([])
    expect(flag.data.has('expired')).toBe(false)
  })

  it('does not clear an already latched flag on a 5xx either', async () => {
    flag.data.set('expired', true)
    armRunner(['Failed to refresh the token <Response [503]>'])

    await probeAndApply()

    expect(flag.data.get('expired')).toBe(true)
    expect(flag.deletes).toEqual([])
  })
})

describe('Amazon: sign-in success and logout clear the flag', () => {
  it('login success deletes expired and publishes healthy via noteSignInSucceeded', async () => {
    flag.data.set('expired', true)
    armRunner([], {
      stderr: '[AUTH_MANAGER]: Succesfully registered a device'
    })
    jest
      .spyOn(NileUser, 'getUserData')
      .mockResolvedValue({ user_id: 'amzn-1' } as never)

    const res = await NileUser.login(REGISTER_DATA)

    expect(res.status).toBe('done')
    expect(flag.deletes).toContain('expired')
    expect(flag.data.has('expired')).toBe(false)
    expect(getSignInProbeOutcomes().nile).toBe('healthy')
    expect(sendMock).toHaveBeenCalledWith('signInProbeOutcomes', {
      outcomes: expect.objectContaining({ nile: 'healthy' })
    })
  })

  it('a failed login leaves the flag and the outcome alone', async () => {
    flag.data.set('expired', true)
    armRunner([], { stderr: 'something went wrong' })

    const res = await NileUser.login(REGISTER_DATA)

    expect(res.status).toBe('failed')
    expect(flag.data.get('expired')).toBe(true)
    expect(getSignInProbeOutcomes().nile).toBeUndefined()
  })

  it('a login that registers but yields no user data leaves the flag alone', async () => {
    flag.data.set('expired', true)
    armRunner([], {
      stderr: '[AUTH_MANAGER]: Succesfully registered a device'
    })
    jest.spyOn(NileUser, 'getUserData').mockResolvedValue(undefined)

    const res = await NileUser.login(REGISTER_DATA)

    expect(res.status).toBe('failed')
    expect(flag.data.get('expired')).toBe(true)
  })

  it('logout deletes expired, returns the outcome to pending and bumps the epoch', async () => {
    flag.data.set('expired', true)
    noteSignInSucceeded('nile')
    const epochBefore = captureSignInEpoch('nile')
    armRunner([])

    await NileUser.logout()

    expect(flag.data.has('expired')).toBe(false)
    expect(getSignInProbeOutcomes().nile).toBeUndefined()
    expect(captureSignInEpoch('nile')).not.toBe(epochBefore)
  })
})

describe('Amazon: the only latch is applySignInVerdict (source gate)', () => {
  it('nile/user.ts never writes set("expired", true)', () => {
    const source = stripSourceComments(
      readFileSync(join(__dirname, '..', 'user.ts'), 'utf8')
    )
    expect(source).not.toMatch(/set\(\s*'expired'\s*,\s*true\s*\)/)
  })
})

describe('Amazon: a probe that began before a sign-in cannot re-set expired', () => {
  it('returns stale with no write when the epoch moved after the probe started', () => {
    const epochAtStart = captureSignInEpoch('nile')
    noteSignInSucceeded('nile')

    const result = applySignInVerdict('nile', 'expired', epochAtStart)

    expect(result).toBe('stale')
    expect(flag.sets).toEqual([])
    expect(flag.data.has('expired')).toBe(false)
  })
})
