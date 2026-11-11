/**
 * Quick 261111-8b5: when `legendary launch` exits non-zero and its output
 * carries a login-failure marker, the user gets a "Launch aborted" dialog
 * instead of silence. Zero jest.mock: `t` is injected as a recording fake.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  EPIC_AUTH_FAILURE_MARKER,
  EPIC_NETWORK_FAILURE_MARKER,
  SIGN_IN_PROBE_OUTPUT_CAP
} from 'backend/signInProbe/classify'
import {
  LEGENDARY_LAUNCH_LOGIN_FAILED_MARKER,
  LEGENDARY_LAUNCH_OUTPUT_CAP,
  classifyLegendaryLaunchFailure,
  legendaryLaunchFailureDialog
} from '../launchFailure'

const authOutput =
  '[Core] ERROR: Stored credentials are no longer valid! Please login again.\n[cli] ERROR: Login failed, cannot continue!'
const networkOutput =
  '[Core] ERROR: HTTP request for login failed: ConnectionError(...), please try again later.\n[cli] ERROR: Login failed, cannot continue!'
const genericOutput = '[cli] ERROR: Login failed, cannot continue!'

const failed = { errored: true, aborted: false }

describe('classifyLegendaryLaunchFailure', () => {
  it('pins the shared markers', () => {
    expect(authOutput).toContain(EPIC_AUTH_FAILURE_MARKER)
    expect(networkOutput).toContain(EPIC_NETWORK_FAILURE_MARKER)
    expect(genericOutput).toContain(LEGENDARY_LAUNCH_LOGIN_FAILED_MARKER)
  })

  it("returns 'credentials' for the stored-credentials marker", () => {
    expect(
      classifyLegendaryLaunchFailure({ output: authOutput, ...failed })
    ).toBe('credentials')
  })

  it("returns 'network' for the login-request marker", () => {
    expect(
      classifyLegendaryLaunchFailure({ output: networkOutput, ...failed })
    ).toBe('network')
  })

  it("returns 'login' when only the generic marker is present", () => {
    expect(
      classifyLegendaryLaunchFailure({ output: genericOutput, ...failed })
    ).toBe('login')
  })

  it('prefers auth over network over generic', () => {
    expect(
      classifyLegendaryLaunchFailure({
        output: `${networkOutput}\n${authOutput}`,
        ...failed
      })
    ).toBe('credentials')
    expect(
      classifyLegendaryLaunchFailure({
        output: `${genericOutput}\n${networkOutput}`,
        ...failed
      })
    ).toBe('network')
  })

  it('returns null when the launch did not error, even with a marker', () => {
    expect(
      classifyLegendaryLaunchFailure({
        output: authOutput,
        errored: false,
        aborted: false
      })
    ).toBeNull()
  })

  it('returns null when the launch was aborted, even with a marker', () => {
    expect(
      classifyLegendaryLaunchFailure({
        output: authOutput,
        errored: true,
        aborted: true
      })
    ).toBeNull()
  })

  it('returns null for an errored launch with no marker (a game crash)', () => {
    expect(
      classifyLegendaryLaunchFailure({
        output: 'wine: unhandled page fault',
        ...failed
      })
    ).toBeNull()
    expect(classifyLegendaryLaunchFailure({ output: '', ...failed })).toBeNull()
  })
})

describe('legendaryLaunchFailureDialog', () => {
  const makeT = () =>
    jest.fn(
      (
        _key: string,
        defaultValue: string,
        _options?: Record<string, unknown>
      ) => defaultValue
    )

  it.each([
    ['credentials', 'gamelib:box.error.launch.epic.credentials'],
    ['network', 'gamelib:box.error.launch.epic.network'],
    ['login', 'gamelib:box.error.launch.epic.loginFailed']
  ] as const)('maps %s to %s', (kind, key) => {
    const t = makeT()
    const dialog = legendaryLaunchFailureDialog(kind, 'SOMA', t)
    expect(dialog.type).toBe('ERROR')
    expect(t).toHaveBeenCalledWith('box.error.launchAborted', 'Launch aborted')
    expect(t).toHaveBeenCalledWith(key, expect.any(String), { title: 'SOMA' })
    expect(dialog.title).toBe('Launch aborted')
    expect(typeof dialog.message).toBe('string')
    expect(dialog.message.length).toBeGreaterThan(0)
  })
})

describe('LEGENDARY_LAUNCH_OUTPUT_CAP', () => {
  it('is a positive number no larger than the sign-in probe cap', () => {
    expect(LEGENDARY_LAUNCH_OUTPUT_CAP).toBeGreaterThan(0)
    expect(LEGENDARY_LAUNCH_OUTPUT_CAP).toBeLessThanOrEqual(
      SIGN_IN_PROBE_OUTPUT_CAP
    )
  })
})

describe('launchFailure.ts source gate (secrets)', () => {
  const source = stripSourceComments(
    readFileSync(join(__dirname, '..', 'launchFailure.ts'), 'utf8')
  )

  it('imports no logging module and makes no console call', () => {
    expect(source).not.toMatch(/logger|logInfo|logWarning|logError|console\./)
    expect(source).not.toMatch(/from '[^']*logger[^']*'/)
  })
})

describe('games.ts launch() wiring gate', () => {
  const source = stripSourceComments(
    readFileSync(join(__dirname, '..', 'games.ts'), 'utf8')
  )
  const start = source.indexOf('async launch(')
  const body = source.slice(start, source.indexOf('isNative(): boolean'))

  it('captures bounded output and classifies the failure', () => {
    expect(start).toBeGreaterThan(-1)
    expect(body).toContain(
      'createBoundedOutputCapture(LEGENDARY_LAUNCH_OUTPUT_CAP)'
    )
    expect(body).toMatch(/onOutput:[^,]*launchOutput\.onOutput\(/)
    expect(body).toContain('classifyLegendaryLaunchFailure(')
  })

  it('shows the dialog through showDialogBoxModalAuto', () => {
    expect(body).toMatch(
      /showDialogBoxModalAuto\(\s*this\.deps,\s*legendaryLaunchFailureDialog\(/
    )
  })

  it('never logs the captured text', () => {
    expect(body).not.toMatch(/log\w*\([^)]*launchOutput\.text/)
  })
})
