/**
 * Behavioral + source-text proof that neither nile credential-logging call site ever passes a
 * raw OAuth `code` or PKCE `code_verifier` to the logger (`F-34.5-G6-17`, `F-34.5-G6-20`,
 * `34.5-CYCLE7-ROUTING.md` item 4, plan `34.5-53`).
 *
 * DIAGNOSIS (established at planning time, re-confirmed by Task 1's edit): the leak is a
 * GameLib-side logger call, not `nile`'s own stdout relayed verbatim -- two call sites in
 * `nile/user.ts`, `NileUser.login` (`logDebug(['Got register data:', data], ...)`) and
 * `NileUser.getLoginData` (`logInfo(['Register data is:', output], ...)`), each passed the raw
 * `NileRegisterData`/`NileLoginData` payload straight to the logger. Task 1 replaced both with
 * `redactNileRegisterData`/`redactNileLoginData` calls that emit lengths and presence booleans
 * only, plus (for the login-data site) the authorize URL's host.
 *
 * SENTINEL VALUES ONLY. No real captured OAuth code or PKCE code_verifier appears anywhere in
 * this file -- every secret-shaped value below is a synthetic sentinel string, per this plan's
 * SECURITY-SENSITIVE note and the project's standing redact-forward rule (see the Steam identity
 * redact-forward precedent recorded for `deferred-items.md` item 23).
 *
 * Group A drives the real `NileUser.login`/`getLoginData` call shape with sentinel payloads and
 * inspects every recorded call across all four logger wrappers. Group B is a source-text
 * structural gate mirroring `AdvancedSettings/EosDeclineCallSiteGuard.test.ts`'s shape: positive
 * `toBe`/`toContain` assertions with an explicit non-vacuity anchor, never a bare negative-regex
 * match -- this project has shipped 7 vacuous negative-regex assertions before, and the RED
 * captures recorded in `34.5-53-SUMMARY.md` are the evidence this is not the 8th.
 */

const mockRunRunnerCommand = jest.fn()
const mockLogDebug = jest.fn()
const mockLogInfo = jest.fn()
const mockLogWarning = jest.fn()
const mockLogError = jest.fn()

jest.mock('backend/storeManagers/index', () => ({
  libraryManagerMap: {
    nile: { runRunnerCommand: mockRunRunnerCommand }
  }
}))

jest.mock('backend/logger', () => ({
  logDebug: mockLogDebug,
  logInfo: mockLogInfo,
  logWarning: mockLogWarning,
  logError: mockLogError,
  LogPrefix: { Nile: 'Nile' }
}))

jest.mock('backend/storeManagers/nile/electronStores', () => ({
  configStore: {
    set: jest.fn(),
    delete: jest.fn(),
    get_nodefault: jest.fn()
  }
}))

jest.mock('backend/utils', () => ({
  clearCache: jest.fn()
}))

import { readFileSync } from 'fs'
import { join } from 'path'
import { NileUser } from '../user'

const SENTINEL_CODE = 'SENTINEL_CODE_ac91f3'
const SENTINEL_VERIFIER = 'SENTINEL_VERIFIER_7d02be'
const SENTINEL_SERIAL = 'SENTINEL_SERIAL_11'
const SENTINEL_CLIENT_ID = 'SENTINEL_CLIENT_22'
const SENTINEL_URL =
  'https://amazon.example/authorize?client_id=SENTINEL_CLIENT_22'

function allLoggerCalls(): unknown[][] {
  return [
    ...mockLogDebug.mock.calls,
    ...mockLogInfo.mock.calls,
    ...mockLogWarning.mock.calls,
    ...mockLogError.mock.calls
  ]
}

function serializeAllCalls(): string {
  return JSON.stringify(allLoggerCalls())
}

async function driveLoginWithSentinels() {
  mockRunRunnerCommand.mockResolvedValueOnce({
    stderr: 'not a successful register line'
  })
  await NileUser.login({
    code: SENTINEL_CODE,
    code_verifier: SENTINEL_VERIFIER,
    serial: SENTINEL_SERIAL,
    client_id: SENTINEL_CLIENT_ID
  })
}

async function driveGetLoginDataWithSentinels() {
  mockRunRunnerCommand.mockResolvedValueOnce({
    stdout: JSON.stringify({
      url: SENTINEL_URL,
      code_verifier: SENTINEL_VERIFIER,
      serial: SENTINEL_SERIAL,
      client_id: SENTINEL_CLIENT_ID
    })
  })
  await NileUser.getLoginData()
}

describe('nile credential redaction -- Group A: behavioral', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    NileUser.__resetInFlightLoginDataForTests()
  })

  it('non-vacuity anchor: driving login() + getLoginData() together records at least 2 logger calls', async () => {
    await driveLoginWithSentinels()
    await driveGetLoginDataWithSentinels()

    expect(allLoggerCalls().length).toBeGreaterThanOrEqual(2)
  })

  it('no recorded logger call anywhere contains the raw sentinel code or code_verifier', async () => {
    await driveLoginWithSentinels()
    await driveGetLoginDataWithSentinels()

    const serialized = serializeAllCalls()
    expect(serialized).not.toContain(SENTINEL_CODE)
    expect(serialized).not.toContain(SENTINEL_VERIFIER)
  })

  it('the redacted register-data log carries code_len and code_verifier_len instead of the raw values', async () => {
    await driveLoginWithSentinels()

    const serialized = serializeAllCalls()
    expect(serialized).toContain(`"code_len":${SENTINEL_CODE.length}`)
    expect(serialized).toContain(
      `"code_verifier_len":${SENTINEL_VERIFIER.length}`
    )
  })

  it('the redacted login-data log carries url_host instead of the full authorize URL', async () => {
    await driveGetLoginDataWithSentinels()

    const serialized = serializeAllCalls()
    expect(serialized).toContain('"url_host":"amazon.example"')
    expect(serialized).not.toContain(SENTINEL_URL)
  })
})

describe('nile credential redaction -- Group B: source-text gate', () => {
  const sourcePath = join(__dirname, '..', 'user.ts')
  const source = readFileSync(sourcePath, 'utf-8')
  const collapsed = source.replace(/\s+/g, ' ')

  /**
   * Set by direct recount against the post-Task-1 file: one function definition plus one call
   * site for each helper. See `34.5-53-SUMMARY.md` for the exact `grep -c` command and output.
   */
  const EXPECTED_REDACT_REGISTER_OCCURRENCES = 2
  const EXPECTED_REDACT_LOGIN_OCCURRENCES = 2

  it('non-vacuity anchor: redactNileRegisterData appears exactly EXPECTED_REDACT_REGISTER_OCCURRENCES times', () => {
    const count = (collapsed.match(/redactNileRegisterData/g) ?? []).length
    expect(count).toBeGreaterThan(0)
    expect(count).toBe(EXPECTED_REDACT_REGISTER_OCCURRENCES)
  })

  it('non-vacuity anchor: redactNileLoginData appears exactly EXPECTED_REDACT_LOGIN_OCCURRENCES times', () => {
    const count = (collapsed.match(/redactNileLoginData/g) ?? []).length
    expect(count).toBeGreaterThan(0)
    expect(count).toBe(EXPECTED_REDACT_LOGIN_OCCURRENCES)
  })

  it('the register-data call site passes redactNileRegisterData(data), not the raw data object', () => {
    expect(collapsed).toContain('redactNileRegisterData(data)')
  })

  it('the login-data call site passes redactNileLoginData(output), not the raw output object', () => {
    expect(collapsed).toContain('redactNileLoginData(output)')
  })

  it('neither pre-fix raw call-site string is present in the source', () => {
    expect(collapsed).not.toContain("'Got register data:', data")
    expect(collapsed).not.toContain("'Register data is:', output")
  })
})
