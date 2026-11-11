/**
 * 49-05 Task 2 (R2, P1, D-17, 260822-vov): GOG's expiry verdict lives inside the
 * single `gogdl auth` spawn site, `GOGUser.getCredentialsWithVerdict`, shared by
 * Block E (`getUserDetails`) and the probe pass. `expired` follows D-17 exactly:
 * a bare `null` stdout, no `Failed to refresh credentials` line, online, with the
 * gogdl auth config present. Everything else is `unknown` or `healthy`.
 *
 * `runRunnerCommand` is mocked and driven through `options.onOutput`, so no
 * binary is spawned (the isolated half of the fake-HOME two-profile rule holds
 * by construction).
 */
import axios from 'axios'
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { logError, logInfo, logWarning } from 'backend/logger'
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
import { probeGogSession } from 'backend/signInProbe/runnerProbes'
import type { FakeFlagStore } from 'backend/signInProbe/__tests__/fakeFlagStore'
import { GOGUser, type GOGUserDeps } from '../user'
import type { ClearCacheDeps } from 'backend/utils'
import type { Stores } from 'backend/services/types'

const { configStore: gogConfigStore } = jest.requireMock<Stores['gog']>(
  'backend/storeManagers/gog/stores'
)

const deps = {
  appInfo: { version: '1.0.0' },
  stores: { gog: { configStore: gogConfigStore } },
  libraryManagers: {
    gog: {
      runRunnerCommand: (...args: unknown[]) => mockRunRunnerCommand(...args)
    }
  }
} as unknown as GOGUserDeps & ClearCacheDeps

let mockOnline = true
let mockAuthConfigExists = true

jest.mock('axios')
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Gog: 'Gog', Backend: 'Backend' }
}))
jest.mock('backend/online_monitor', () => ({
  isOnline: () => mockOnline
}))
jest.mock('backend/ipc', () => ({
  sendFrontendMessage: jest.fn(),
  addHandler: jest.fn()
}))
jest.mock('backend/utils', () => ({ clearCache: jest.fn() }))
jest.mock('backend/storeManagers/gog/constants', () => ({
  gogdlAuthConfig: '/fake/gog_store/auth.json'
}))
jest.mock('graceful-fs', () => ({
  ...jest.requireActual('graceful-fs'),
  existsSync: () => mockAuthConfigExists,
  unlinkSync: () => undefined
}))

const mockRunRunnerCommand = jest.fn()

// Plain-object fake store (immune to resetMocks) for this store's verdict flag.
jest.mock('backend/storeManagers/gog/stores', () => {
  const fake = jest
    .requireActual<
      typeof import('backend/signInProbe/__tests__/fakeFlagStore')
    >('backend/signInProbe/__tests__/fakeFlagStore')
    .makeFakeFlagStore()
  // GOGUser.logout(deps) calls configStore.clear().
  return {
    configStore: Object.assign(fake, { clear: () => fake.data.clear() })
  }
})

const flag = gogConfigStore as unknown as FakeFlagStore

const CREDENTIALS = {
  access_token: 'tok-access',
  refresh_token: 'tok-refresh',
  user_id: 'u1',
  expires_in: 3600,
  token_type: 'bearer',
  scope: '',
  session_id: 's1',
  loginType: 1
}
const SECRET = 'SECRET-CAPTURE-MARKER-9b2e'

type RunOptions = { onOutput?: (chunk: string) => void }

function armRunner(
  stdout: string,
  chunks: string[] = [stdout],
  result: { error?: string; abort?: boolean } = {}
) {
  mockRunRunnerCommand.mockImplementation(
    (_argv: unknown, options: RunOptions) => {
      chunks.forEach((chunk) => options.onOutput?.(chunk))
      return Promise.resolve({
        stdout,
        stderr: '',
        error: result.error,
        abort: result.abort ?? false
      })
    }
  )
}

/** The pass's shape: capture the epoch, probe, apply. */
async function probeAndApply() {
  const epoch = captureSignInEpoch('gog')
  const outcome = await probeGogSession(deps)
  return { outcome, result: applySignInVerdict(deps, 'gog', outcome, epoch) }
}

beforeEach(() => {
  mockOnline = true
  mockAuthConfigExists = true
  flag.reset()
  __resetSignInEpochsForTests()
  __resetSignInProbeOutcomesForTests()
  GOGUser.__resetCredentialsCacheForTests()
  armRunner('null')
})

describe('GOG: getCredentialsWithVerdict follows D-17', () => {
  it('spawns gogdl auth once, with its abort id, a sanitizer, no modal and an onOutput capture', async () => {
    armRunner(JSON.stringify(CREDENTIALS))

    await GOGUser.getCredentialsWithVerdict(deps)

    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(1)
    const [argv, options] = mockRunRunnerCommand.mock.calls[0]
    expect(argv).toEqual(['auth'])
    expect(options).toEqual(
      expect.objectContaining({
        abortId: 'gogdl-get-credentials',
        skipErrorHandler: true,
        logSanitizer: expect.any(Function),
        onOutput: expect.any(Function)
      })
    )
  })

  it('a bare null stdout, online, with the auth config present is expired and latches through applySignInVerdict', async () => {
    const verdict = await GOGUser.getCredentialsWithVerdict(deps)
    expect(verdict.verdict).toBe('expired')
    expect(verdict.credentials).toBeFalsy()

    const { outcome, result } = await probeAndApply()
    expect(outcome).toBe('expired')
    expect(result).toBe('latched')
    expect(flag.data.get('expired')).toBe(true)
  })

  it.each([
    [
      'null with a "Failed to refresh credentials" line',
      () => armRunner('null', ['Failed to refresh credentials', 'null'])
    ],
    ['an aborted run', () => armRunner('null', ['null'], { abort: true })],
    ['a failed run', () => armRunner('null', ['null'], { error: 'exit 1' })],
    ['a joined spawn that produced no output', () => armRunner('null', [])],
    ['unparsable stdout', () => armRunner('<html>502</html>')],
    [
      'the auth config file being absent',
      () => {
        mockAuthConfigExists = false
        armRunner('null')
      }
    ]
  ])('%s is unknown and leaves the flag unchanged', async (_label, arm) => {
    arm()

    const { outcome, result } = await probeAndApply()

    expect(outcome).toBe('unknown')
    expect(result).toBe('unchanged')
    expect(flag.sets).toEqual([])
    expect(flag.data.has('expired')).toBe(false)
  })

  it('offline is unknown, returns no credentials, and spawns nothing', async () => {
    mockOnline = false

    const result = await GOGUser.getCredentialsWithVerdict(deps)

    expect(result).toEqual({ credentials: undefined, verdict: 'unknown' })
    expect(mockRunRunnerCommand).not.toHaveBeenCalled()
  })

  it('valid credentials are healthy, cached, and a second call inside the TTL does not spawn', async () => {
    armRunner(JSON.stringify(CREDENTIALS))

    const first = await GOGUser.getCredentialsWithVerdict(deps)
    const second = await GOGUser.getCredentialsWithVerdict(deps)

    expect(first.verdict).toBe('healthy')
    expect(first.credentials?.access_token).toBe('tok-access')
    expect(second.verdict).toBe('healthy')
    expect(second.credentials?.access_token).toBe('tok-access')
    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(1)
  })

  it('a healthy verdict clears a latched flag', async () => {
    flag.data.set('expired', true)
    armRunner(JSON.stringify(CREDENTIALS))

    const { outcome, result } = await probeAndApply()

    expect(outcome).toBe('healthy')
    expect(result).toBe('cleared')
    expect(flag.data.has('expired')).toBe(false)
  })

  it('an unknown verdict does not clear a latched flag', async () => {
    flag.data.set('expired', true)
    armRunner('null', ['Failed to refresh credentials', 'null'])

    await probeAndApply()

    expect(flag.data.get('expired')).toBe(true)
    expect(flag.deletes).toEqual([])
  })
})

describe('GOG: one in-flight spawn is shared (RESEARCH Pitfall 2)', () => {
  it('two concurrent getCredentialsWithVerdict calls spawn exactly once and share the verdict', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mockRunRunnerCommand.mockImplementation(
      async (_argv: unknown, options: RunOptions) => {
        options.onOutput?.('null')
        await gate
        return { stdout: 'null', stderr: '', error: undefined, abort: false }
      }
    )

    const a = GOGUser.getCredentialsWithVerdict(deps)
    const b = GOGUser.getCredentialsWithVerdict(deps)
    release()
    const [first, second] = await Promise.all([a, b])

    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(1)
    expect(first.verdict).toBe('expired')
    expect(second.verdict).toBe('expired')
  })

  it('a getCredentials() call joins the in-flight spawn too, so a joiner never loses the verdict', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mockRunRunnerCommand.mockImplementation(
      async (_argv: unknown, options: RunOptions) => {
        options.onOutput?.('null')
        await gate
        return { stdout: 'null', stderr: '', error: undefined, abort: false }
      }
    )

    const blockE = GOGUser.getCredentials(deps)
    const pass = GOGUser.getCredentialsWithVerdict(deps)
    release()
    const [credentials, withVerdict] = await Promise.all([blockE, pass])

    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(1)
    expect(credentials).toBeFalsy()
    expect(withVerdict.verdict).toBe('expired')
  })

  it('clears the in-flight promise afterwards, so the next call spawns again', async () => {
    await GOGUser.getCredentialsWithVerdict(deps)
    await GOGUser.getCredentialsWithVerdict(deps)

    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(2)
  })

  it('clears the in-flight promise when the spawn rejects', async () => {
    mockRunRunnerCommand.mockRejectedValueOnce(new Error('spawn failed'))
    await expect(GOGUser.getCredentialsWithVerdict(deps)).rejects.toThrow(
      'spawn failed'
    )

    armRunner('null')
    await expect(GOGUser.getCredentialsWithVerdict(deps)).resolves.toEqual(
      expect.objectContaining({ verdict: 'expired' })
    )
  })
})

describe('GOG: getCredentials() is unchanged for existing callers', () => {
  it('returns only the credentials', async () => {
    armRunner(JSON.stringify(CREDENTIALS))
    await expect(GOGUser.getCredentials(deps)).resolves.toEqual(CREDENTIALS)
  })

  it('returns undefined offline, as before', async () => {
    mockOnline = false
    await expect(GOGUser.getCredentials(deps)).resolves.toBeUndefined()
    expect(logWarning).toHaveBeenCalled()
  })
})

describe('probeGogSession', () => {
  it('returns the verdict from getCredentialsWithVerdict', async () => {
    await expect(probeGogSession(deps)).resolves.toBe('expired')

    armRunner(JSON.stringify(CREDENTIALS))
    GOGUser.__resetCredentialsCacheForTests()
    await expect(probeGogSession(deps)).resolves.toBe('healthy')
  })

  it('returns unknown when the spawn rejects', async () => {
    mockRunRunnerCommand.mockRejectedValue(new Error('spawn failed'))
    await expect(probeGogSession(deps)).resolves.toBe('unknown')
  })

  it('never passes captured text to a logger', async () => {
    armRunner('null', [`Failed to refresh credentials ${SECRET}`, 'null'])
    await probeGogSession(deps)

    const logged = [logInfo, logWarning, logError].some((logger) =>
      (logger as unknown as jest.Mock).mock.calls.some((args) =>
        JSON.stringify(args).includes(SECRET)
      )
    )
    expect(logged).toBe(false)
  })
})

describe('GOG: sign-in success and logout clear the flag', () => {
  it('login success deletes expired and publishes healthy via noteSignInSucceeded', async () => {
    flag.data.set('expired', true)
    armRunner(
      JSON.stringify({
        access_token: 'fresh',
        refresh_token: 'r1',
        user_id: 'u1',
        expires_in: 3600,
        loginTime: Date.now()
      })
    )
    ;(axios.get as jest.Mock).mockResolvedValue({
      data: { username: 'tester' }
    })

    const res = await GOGUser.login(deps, 'oauth-code')

    expect(res.status).toBe('done')
    expect(flag.deletes).toContain('expired')
    expect(flag.data.has('expired')).toBe(false)
    expect(getSignInProbeOutcomes().gog).toBe('healthy')
  })

  it('a failed login leaves the flag and the outcome alone', async () => {
    flag.data.set('expired', true)
    armRunner(JSON.stringify({ error: 'invalid_grant' }))

    const res = await GOGUser.login(deps, 'oauth-code')

    expect(res.status).toBe('error')
    expect(flag.data.get('expired')).toBe(true)
    expect(getSignInProbeOutcomes().gog).toBeUndefined()
  })

  it('logout clears expired, returns the outcome to pending and bumps the epoch', async () => {
    flag.data.set('expired', true)
    noteSignInSucceeded('gog')
    const epochBefore = captureSignInEpoch('gog')

    await GOGUser.logout(deps)

    expect(flag.data.has('expired')).toBe(false)
    expect(getSignInProbeOutcomes().gog).toBeUndefined()
    expect(captureSignInEpoch('gog')).not.toBe(epochBefore)
  })
})

describe('GOG: the only latch is applySignInVerdict (source gate)', () => {
  const source = stripSourceComments(
    readFileSync(join(__dirname, '..', 'user.ts'), 'utf8')
  )

  it('gog/user.ts never writes set("expired", true)', () => {
    expect(source).not.toMatch(/set\(\s*'expired'\s*,\s*true\s*\)/)
  })

  it('gog/user.ts keeps a single gogdl auth spawn site', () => {
    expect(source.match(/runRunnerCommand\(\s*\['auth'\]/g)).toHaveLength(1)
  })
})

describe('GOG: a probe that began before a sign-in cannot re-set expired', () => {
  it('returns stale with no write when the epoch moved after the probe started', async () => {
    const epochAtStart = captureSignInEpoch('gog')
    const outcome = await probeGogSession(deps)
    expect(outcome).toBe('expired')

    noteSignInSucceeded('gog')
    const result = applySignInVerdict(deps, 'gog', outcome, epochAtStart)

    expect(result).toBe('stale')
    expect(flag.sets).toEqual([])
    expect(flag.data.has('expired')).toBe(false)
  })
})
