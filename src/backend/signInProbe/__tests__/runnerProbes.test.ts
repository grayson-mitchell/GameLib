/**
 * 49-05 Task 1 (R2, D-17, T-49-14, T-49-15): the Epic and Amazon runner probes.
 *
 * No test here spawns a binary: `runRunnerCommand` is mocked and the fixture
 * chunks are fed through `options.onOutput`, so the fake-HOME two-profile rule's
 * isolated half is satisfied by construction.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, sep } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { logDebug, logError, logInfo, logWarning } from 'backend/logger'
import {
  probeLegendarySession,
  probeNileSession,
  SIGN_IN_PROBE_ABORT_IDS
} from '../runnerProbes'

jest.mock('backend/logger', () => ({
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend', Legendary: 'Legendary', Nile: 'Nile' }
}))

const mockLegendaryRun = jest.fn()
const mockNileRun = jest.fn()
jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    legendary: {
      runRunnerCommand: (...args: unknown[]) => mockLegendaryRun(...args)
    },
    nile: { runRunnerCommand: (...args: unknown[]) => mockNileRun(...args) }
  }
}))

type RunOptions = {
  abortId?: string
  skipErrorHandler?: boolean
  onOutput?: (chunk: string) => void
}

/** Arms a mock runner that emits `chunks` through onOutput, then resolves. */
function armRunner(
  mock: jest.Mock,
  chunks: string[],
  result: { error?: string; abort?: boolean } = {}
) {
  mock.mockImplementation((_argv: unknown, options: RunOptions) => {
    chunks.forEach((chunk) => options.onOutput?.(chunk))
    return Promise.resolve({
      stdout: '',
      stderr: '',
      error: result.error,
      abort: result.abort ?? false
    })
  })
}

const LOGGERS = [logDebug, logInfo, logWarning, logError]
const SECRET = 'SECRET-CAPTURE-MARKER-4c1f'

function loggedAnything(needle: string): boolean {
  return LOGGERS.some((logger) =>
    (logger as unknown as jest.Mock).mock.calls.some((args) =>
      JSON.stringify(args).includes(needle)
    )
  )
}

describe('SIGN_IN_PROBE_ABORT_IDS', () => {
  it('uses unique per-probe ids for Epic and Amazon and the existing gogdl id for GOG', () => {
    expect(SIGN_IN_PROBE_ABORT_IDS).toEqual({
      legendary: 'signin-probe-legendary',
      nile: 'signin-probe-nile',
      gog: 'gogdl-get-credentials'
    })
  })
})

describe('probeLegendarySession', () => {
  it('runs legendary status --json once, with its own abort id, no modal and an onOutput capture', async () => {
    armRunner(mockLegendaryRun, ['{"account": "someone"}'])

    await probeLegendarySession()

    expect(mockLegendaryRun).toHaveBeenCalledTimes(1)
    const [argv, options] = mockLegendaryRun.mock.calls[0]
    expect(argv).toEqual({ subcommand: 'status', '--json': true })
    expect(options).toEqual(
      expect.objectContaining({
        abortId: 'signin-probe-legendary',
        skipErrorHandler: true,
        onOutput: expect.any(Function)
      })
    )
  })

  it('returns expired for the stored-credentials marker on a failed run', async () => {
    armRunner(
      mockLegendaryRun,
      ['Stored credentials are no longer valid! Please login again.'],
      { error: 'Process exited with code 1' }
    )
    await expect(probeLegendarySession()).resolves.toBe('expired')
  })

  it('returns healthy for a logged-in status document', async () => {
    armRunner(mockLegendaryRun, [
      '{"account": "someone", "games_available": 3}'
    ])
    await expect(probeLegendarySession()).resolves.toBe('healthy')
  })

  it('returns unknown for a network failure, an abort and a joined (unobserved) spawn', async () => {
    armRunner(mockLegendaryRun, ['HTTP request for login failed: timeout'], {
      error: 'Process exited with code 1'
    })
    await expect(probeLegendarySession()).resolves.toBe('unknown')

    armRunner(
      mockLegendaryRun,
      ['Stored credentials are no longer valid! Please login again.'],
      { abort: true }
    )
    await expect(probeLegendarySession()).resolves.toBe('unknown')

    armRunner(mockLegendaryRun, [])
    await expect(probeLegendarySession()).resolves.toBe('unknown')
  })

  it('returns unknown when the runner call rejects', async () => {
    mockLegendaryRun.mockRejectedValue(new Error('spawn failed'))
    await expect(probeLegendarySession()).resolves.toBe('unknown')
  })

  it('never passes captured text to a logger', async () => {
    armRunner(mockLegendaryRun, [`token=${SECRET}`], { error: 'exit 1' })
    await probeLegendarySession()
    expect(loggedAnything(SECRET)).toBe(false)
  })
})

describe('probeNileSession', () => {
  it('runs nile list-updates --json once, with its own abort id and no modal', async () => {
    armRunner(mockNileRun, ['[]'])

    await probeNileSession()

    expect(mockNileRun).toHaveBeenCalledTimes(1)
    const [argv, options] = mockNileRun.mock.calls[0]
    expect(argv).toEqual(['list-updates', '--json'])
    expect(options).toEqual(
      expect.objectContaining({
        abortId: 'signin-probe-nile',
        skipErrorHandler: true,
        onOutput: expect.any(Function)
      })
    )
  })

  it('returns expired for a 401 refresh failure', async () => {
    armRunner(mockNileRun, ['Failed to refresh the token <Response [401]>'])
    await expect(probeNileSession()).resolves.toBe('expired')
  })

  it('returns healthy for clean output and unknown for a 503, a connection error and an abort', async () => {
    armRunner(mockNileRun, ['[]'])
    await expect(probeNileSession()).resolves.toBe('healthy')

    armRunner(mockNileRun, ['Failed to refresh the token <Response [503]>'])
    await expect(probeNileSession()).resolves.toBe('unknown')

    armRunner(mockNileRun, ['Failed to refresh the token'])
    await expect(probeNileSession()).resolves.toBe('unknown')

    armRunner(mockNileRun, ['Failed to refresh the token <Response [401]>'], {
      abort: true
    })
    await expect(probeNileSession()).resolves.toBe('unknown')
  })

  it('returns unknown when the runner call rejects', async () => {
    mockNileRun.mockRejectedValue(new Error('spawn failed'))
    await expect(probeNileSession()).resolves.toBe('unknown')
  })

  it('never passes captured text to a logger', async () => {
    armRunner(mockNileRun, [`token=${SECRET}`])
    await probeNileSession()
    expect(loggedAnything(SECRET)).toBe(false)
  })
})

describe('runnerProbes.ts source gates', () => {
  const source = stripSourceComments(
    readFileSync(join(__dirname, '..', 'runnerProbes.ts'), 'utf8')
  )

  it('imports storeManagers lazily only (stays out of the storeManagers cycle)', () => {
    expect(source).not.toMatch(
      /^import [^\n]*['"](backend|\.\.)\/storeManagers/m
    )
    expect(source).toMatch(/await import\('\.\.\/storeManagers'\)/)
  })

  it('passes skipErrorHandler on every runner spawn and never logs', () => {
    expect(
      source.match(/skipErrorHandler: true/g)?.length
    ).toBeGreaterThanOrEqual(2)
    expect(source).not.toMatch(/\blog(Info|Warning|Error|Debug)\b/)
    expect(source).not.toMatch(/console\./)
  })
})

describe('T-49-07: skipErrorHandler is confined to the probe sites', () => {
  // __tests__ -> signInProbe -> backend
  const backendRoot = join(__dirname, '..', '..')

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        return entry === '__tests__' || entry === 'node_modules'
          ? []
          : sourceFiles(full)
      }
      return entry.endsWith('.ts') || entry.endsWith('.tsx') ? [full] : []
    })
  }

  /** Backend-relative paths of every non-test file that sets the option. */
  function filesPassingSkipErrorHandler(): string[] {
    return sourceFiles(backendRoot)
      .filter((file) =>
        stripSourceComments(readFileSync(file, 'utf8')).includes(
          'skipErrorHandler: true'
        )
      )
      .map((file) => relative(backendRoot, file).split(sep).join('/'))
  }

  it('only src/backend/signInProbe/** and GOGUser.getCredentialsWithVerdict pass skipErrorHandler: true', () => {
    const offenders = filesPassingSkipErrorHandler().filter(
      (file) =>
        !file.startsWith('signInProbe/') && file !== 'storeManagers/gog/user.ts'
    )

    expect(offenders).toEqual([])
  })

  it('the gate sees the allowed sites (so an empty offender list is not vacuous)', () => {
    const seen = filesPassingSkipErrorHandler()

    expect(seen).toEqual(
      expect.arrayContaining([
        'signInProbe/runnerProbes.ts',
        'storeManagers/gog/user.ts'
      ])
    )
  })
})
