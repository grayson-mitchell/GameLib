/**
 * 49-04 Task 1 (R2, P1): the three runner classifiers are the only place an
 * `expired` verdict can come from. Every negative row pins the 260822-vov rule:
 * only a proven authentication failure counts; a timeout, a network error, an
 * abort, a joined spawn (nothing observed) or unparsable output is `unknown`.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  classifyGogdlAuth,
  classifyLegendaryStatus,
  classifyNileOutput,
  createBoundedOutputCapture,
  EPIC_AUTH_FAILURE_MARKER,
  EPIC_NETWORK_FAILURE_MARKER,
  GOG_REFRESH_CONNECTION_FAILURE_MARKER,
  NILE_AUTH_FAILURE_STATUSES,
  NILE_REFRESH_FAILURE_MARKER,
  SIGN_IN_PROBE_OUTPUT_CAP
} from '../classify'
import type { SignInProbeOutcome } from 'common/signInState'

const epicBase = {
  output: '',
  observed: true,
  errored: false,
  aborted: false
}

const epicHealthy = '{"account": "SomeName", "games_available": 12}'

describe('classifyLegendaryStatus (Epic, RESEARCH 1a)', () => {
  const rows: Array<
    [string, Partial<typeof epicBase> & { output: string }, SignInProbeOutcome]
  > = [
    [
      'auth marker, errored (both legendary failure branches exit 1)',
      {
        output: `[Core] ERROR: ${EPIC_AUTH_FAILURE_MARKER}! Please login again.\nLog in failed!`,
        errored: true
      },
      'expired'
    ],
    [
      'auth marker, clean exit',
      { output: `${EPIC_AUTH_FAILURE_MARKER}! Please login again.` },
      'expired'
    ],
    [
      'stdout JSON with a real account, clean exit',
      { output: epicHealthy },
      'healthy'
    ],
    // ---- negatives: 260822-vov, only an auth failure is a verdict ----
    [
      '260822-vov: network failure line (creds NOT cleared) is unknown',
      {
        output: `${EPIC_NETWORK_FAILURE_MARKER}: ConnectionError\nLog in failed!`,
        errored: true
      },
      'unknown'
    ],
    [
      '260822-vov: abort is unknown even when the auth marker is present',
      {
        output: `${EPIC_AUTH_FAILURE_MARKER}!`,
        aborted: true,
        errored: true
      },
      'unknown'
    ],
    [
      '260822-vov: account <not logged in> is unknown (creds vanished mid-probe)',
      { output: '{"account": "<not logged in>"}' },
      'unknown'
    ],
    [
      '260822-vov: healthy-looking text with a zero-chunk capture (joined spawn) is unknown',
      { output: epicHealthy, observed: false },
      'unknown'
    ],
    [
      '260822-vov: any other non-zero exit is unknown',
      { output: 'Traceback (most recent call last):', errored: true },
      'unknown'
    ],
    [
      '260822-vov: healthy-looking text but errored is unknown',
      { output: epicHealthy, errored: true },
      'unknown'
    ],
    [
      '260822-vov: empty output, clean exit is unknown',
      { output: '' },
      'unknown'
    ]
  ]

  it.each(rows)('%s', (_label, partial, expected) => {
    expect(classifyLegendaryStatus({ ...epicBase, ...partial })).toBe(expected)
  })
})

const gogBase = {
  stdout: 'null',
  output: 'null',
  observed: true,
  errored: false,
  aborted: false,
  online: true,
  authConfigExists: true
}

describe('classifyGogdlAuth (GOG, RESEARCH 1b, D-17)', () => {
  const token = JSON.stringify({ access_token: 'x', refresh_token: 'y' })

  const rows: Array<[string, Partial<typeof gogBase>, SignInProbeOutcome]> = [
    [
      'credentials JSON with access_token',
      { stdout: token, output: token },
      'healthy'
    ],
    ['D-17: bare null, online, auth config present, observed', {}, 'expired'],
    // ---- negatives ----
    [
      '260822-vov: connection-error line beside null is unknown',
      {
        output: `null\n${GOG_REFRESH_CONNECTION_FAILURE_MARKER}`
      },
      'unknown'
    ],
    ['D-17 condition 1: offline is unknown', { online: false }, 'unknown'],
    [
      'D-17 condition 2: auth config file absent is unknown',
      { authConfigExists: false },
      'unknown'
    ],
    [
      'D-17 condition 3: zero-chunk capture (joined spawn) is unknown',
      { observed: false },
      'unknown'
    ],
    [
      'D-17 condition 4: errored spawn is unknown',
      { errored: true },
      'unknown'
    ],
    [
      '260822-vov: unparsable stdout is unknown',
      { stdout: 'Traceback (most recent call last):', output: 'Traceback' },
      'unknown'
    ],
    [
      '260822-vov: empty stdout is unknown',
      { stdout: '', output: '' },
      'unknown'
    ],
    ['260822-vov: abort is unknown', { aborted: true }, 'unknown'],
    [
      '260822-vov: JSON object without an access_token is unknown',
      { stdout: '{"foo": 1}', output: '{"foo": 1}' },
      'unknown'
    ],
    [
      '260822-vov: healthy token JSON while offline is unknown (no positive evidence of a live session)',
      { stdout: token, output: token, online: false },
      'unknown'
    ],
    [
      '260822-vov: healthy token JSON with a zero-chunk capture is unknown',
      { stdout: token, output: token, observed: false },
      'unknown'
    ]
  ]

  it.each(rows)('%s', (_label, partial, expected) => {
    expect(classifyGogdlAuth({ ...gogBase, ...partial })).toBe(expected)
  })
})

const nileBase = {
  output: '',
  observed: true,
  errored: false,
  aborted: false
}

describe('classifyNileOutput (Amazon, RESEARCH 1c)', () => {
  const refreshFailure = (status: string) =>
    `${NILE_REFRESH_FAILURE_MARKER} <Response [${status}]>`

  const expiredRows: Array<[string, SignInProbeOutcome]> =
    NILE_AUTH_FAILURE_STATUSES.map((s) => [s, 'expired'])

  it.each(expiredRows)('status %s is an auth failure', (status, expected) => {
    expect(
      classifyNileOutput({ ...nileBase, output: refreshFailure(status) })
    ).toBe(expected)
  })

  it('the auth status set is exactly 400, 401 and 403', () => {
    expect([...NILE_AUTH_FAILURE_STATUSES]).toEqual(['400', '401', '403'])
  })

  it('an auth failure line is expired even when the runner exited non-zero', () => {
    expect(
      classifyNileOutput({
        ...nileBase,
        output: refreshFailure('401'),
        errored: true
      })
    ).toBe('expired')
  })

  it('no refresh failure line, clean exit, observed is healthy', () => {
    expect(classifyNileOutput({ ...nileBase, output: '[{"id": "abc"}]' })).toBe(
      'healthy'
    )
  })

  it('no refresh failure line and empty output (nothing installed), observed, is healthy', () => {
    expect(classifyNileOutput({ ...nileBase, output: '' })).toBe('healthy')
  })

  // ---- negatives ----
  it.each(['500', '503', '429', '408'])(
    '260822-vov: status %s is unknown, not expired',
    (status) => {
      expect(
        classifyNileOutput({ ...nileBase, output: refreshFailure(status) })
      ).toBe('unknown')
    }
  )

  it('260822-vov: a mixed 401 and 503 capture is unknown (the 503 means the 401 may be transient)', () => {
    expect(
      classifyNileOutput({
        ...nileBase,
        output: `${refreshFailure('401')}\n${refreshFailure('503')}`
      })
    ).toBe('unknown')
  })

  it('260822-vov: refresh failure with connection-error text and no <Response [ is unknown', () => {
    expect(
      classifyNileOutput({
        ...nileBase,
        output: `${NILE_REFRESH_FAILURE_MARKER} HTTPSConnectionPool(host=...): Max retries exceeded`
      })
    ).toBe('unknown')
  })

  it('260822-vov: no refresh line but errored is unknown', () => {
    expect(
      classifyNileOutput({ ...nileBase, output: 'boom', errored: true })
    ).toBe('unknown')
  })

  it('260822-vov: a zero-chunk capture (joined spawn) is unknown', () => {
    expect(classifyNileOutput({ ...nileBase, observed: false })).toBe('unknown')
  })

  it('260822-vov: abort is unknown even with an auth failure line', () => {
    expect(
      classifyNileOutput({
        ...nileBase,
        output: refreshFailure('401'),
        aborted: true
      })
    ).toBe('unknown')
  })
})

describe('createBoundedOutputCapture', () => {
  it('concatenates chunks in order', () => {
    const capture = createBoundedOutputCapture()
    capture.onOutput('ab')
    capture.onOutput('cd')
    capture.onOutput('ef')
    expect(capture.text()).toBe('abcdef')
  })

  it('observed() is false before the first chunk and true after', () => {
    const capture = createBoundedOutputCapture()
    expect(capture.observed()).toBe(false)
    capture.onOutput('x')
    expect(capture.observed()).toBe(true)
  })

  it('an empty chunk still counts as observed (the spawn did produce output events)', () => {
    const capture = createBoundedOutputCapture()
    capture.onOutput('')
    expect(capture.observed()).toBe(true)
    expect(capture.text()).toBe('')
  })

  it('the cap constant is 64 000', () => {
    expect(SIGN_IN_PROBE_OUTPUT_CAP).toBe(64_000)
  })

  it('a 100 000-char chunk leaves at most the cap', () => {
    const capture = createBoundedOutputCapture()
    capture.onOutput('a'.repeat(100_000))
    expect(capture.text().length).toBeLessThanOrEqual(SIGN_IN_PROBE_OUTPUT_CAP)
    expect(capture.text().length).toBeGreaterThan(0)
  })

  it('stops appending once the cap is held', () => {
    const capture = createBoundedOutputCapture(10)
    capture.onOutput('0123456789')
    capture.onOutput('more')
    expect(capture.text()).toBe('0123456789')
    expect(capture.observed()).toBe(true)
  })

  it('a chunk that straddles the cap is truncated to fit', () => {
    const capture = createBoundedOutputCapture(6)
    capture.onOutput('abcd')
    capture.onOutput('efgh')
    expect(capture.text()).toBe('abcdef')
  })
})

describe('classify.ts source gate (T-49-09)', () => {
  const source = stripSourceComments(
    readFileSync(join(__dirname, '..', 'classify.ts'), 'utf8')
  )

  it('contains no logger, logInfo, logWarning or console. reference', () => {
    expect(source).not.toMatch(/logger|logInfo|logWarning|console\./)
  })

  it('has exactly one import, the type-only signInState import', () => {
    const imports = source.split('\n').filter((l) => /^import /.test(l))
    expect(imports).toHaveLength(1)
    expect(imports[0]).toMatch(/^import type .* from 'common\/signInState'/)
  })
})
