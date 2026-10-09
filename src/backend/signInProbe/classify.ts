/**
 * 49-04 Task 1 RED stub: deliberately incomplete so the classifier tests fail
 * on assertions rather than on a missing module. Replaced in the GREEN commit.
 */
import type { SignInProbeOutcome } from 'common/signInState'

export const EPIC_AUTH_FAILURE_MARKER = 'Stored credentials are no longer valid'
export const EPIC_NETWORK_FAILURE_MARKER = 'HTTP request for login failed'
export const GOG_REFRESH_CONNECTION_FAILURE_MARKER =
  'Failed to refresh credentials'
export const NILE_REFRESH_FAILURE_MARKER = 'Failed to refresh the token'
export const NILE_AUTH_FAILURE_STATUSES = ['400', '401', '403']
export const SIGN_IN_PROBE_OUTPUT_CAP = 64_000

export interface BoundedOutputCapture {
  onOutput(chunk: string): void
  text(): string
  observed(): boolean
}

export function createBoundedOutputCapture(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _cap: number = SIGN_IN_PROBE_OUTPUT_CAP
): BoundedOutputCapture {
  return {
    onOutput: () => undefined,
    text: () => '',
    observed: () => false
  }
}

interface CommonInput {
  output: string
  observed: boolean
  errored: boolean
  aborted: boolean
}

export function classifyLegendaryStatus(
  _input: CommonInput
): SignInProbeOutcome {
  return 'unknown'
}

export function classifyGogdlAuth(
  _input: CommonInput & {
    stdout: string
    online: boolean
    authConfigExists: boolean
  }
): SignInProbeOutcome {
  return 'unknown'
}

export function classifyNileOutput(_input: CommonInput): SignInProbeOutcome {
  return 'unknown'
}
