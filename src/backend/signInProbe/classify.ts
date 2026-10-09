/**
 * Phase 49 (49-04, R2, P1): pure runner-output classifiers -- the ONLY place an
 * `expired` sign-in verdict can come from.
 *
 * Rule (260822-vov, "proven failure only"): `expired` is returned from exactly
 * one evidence shape per runner, an authentication failure. Every network
 * error, timeout, abort, 5xx/429/408, unparsable output and joined spawn is
 * `unknown`. `healthy` needs positive evidence from the classifier's OWN spawn
 * and is evaluated last, so no failure shape can fall through to it. Each
 * classifier is a first-match-wins sequence with `aborted` first.
 *
 * Runner tags the marker strings were derived from (meta/releaseTags.ts):
 * legendary 0.21.0, gogdl v1.3.0, nile v1.2.0. The strings are SOURCE-DERIVED,
 * not yet observed in a real log: they are live-gated by 49-11 / 49-12
 * (RESEARCH A1, A3, A5, A6). If a marker drifts the failure mode is safe --
 * the classifier degrades to `unknown`, it never invents an `expired`.
 *
 * Accepted residual (D-17): gogdl 1.3.0 prints a bare `null` for any non-OK
 * refresh and cannot separate an invalid_grant 400 from a 5xx/429 on
 * auth.gog.com, so a rare GOG 5xx reads as `expired` until the next healthy
 * probe or sign-in clears the flag. The operator accepted that residual over
 * re-implementing the refresh in Node, which would rotate GOG's refresh token
 * behind gogdl's back.
 *
 * Input is CAPTURED OUTPUT (the bounded capture below, fed from `onOutput`),
 * never `ExecResult.stderr`: `callRunner` replaces stderr with
 * `Process exited with code N` on any non-zero exit (RESEARCH Pitfall 1), so
 * the evidence is already gone by the time the result object exists.
 *
 * `observed` is false when the capture saw zero chunks. That is a joined
 * in-flight spawn (RESEARCH Pitfall 2: `callRunner` joins identical commands,
 * and the joiner's `onOutput` never fires), so an empty capture is "we did not
 * see this spawn", not "the spawn was clean".
 *
 * Secrets: captured output can contain tokens (gogdl's `auth` stdout is a
 * token-exchange object). This module therefore has no log path at all -- it
 * imports nothing but a type, and a source gate in classify.test.ts pins that
 * (T-49-09). The capture is bounded at SIGN_IN_PROBE_OUTPUT_CAP characters.
 *
 * Sidecar exit contract: pure, no timer, watcher, socket or child, so there is
 * nothing to unref() and no in-flight work. The bound-abort path for the
 * children whose output is classified here is 49-08's
 * `callAbortController(SIGN_IN_PROBE_ABORT_IDS[store])` at
 * `SIGN_IN_PROBE_BOUND_MS`.
 */
import type { SignInProbeOutcome } from 'common/signInState'

export const EPIC_AUTH_FAILURE_MARKER = 'Stored credentials are no longer valid'
export const EPIC_NETWORK_FAILURE_MARKER = 'HTTP request for login failed'
export const GOG_REFRESH_CONNECTION_FAILURE_MARKER =
  'Failed to refresh credentials'
export const NILE_REFRESH_FAILURE_MARKER = 'Failed to refresh the token'
export const NILE_AUTH_FAILURE_STATUSES = ['400', '401', '403']

/** Upper bound on captured runner output, in characters. */
export const SIGN_IN_PROBE_OUTPUT_CAP = 64_000

// WHY exported ahead of its consumer: 49-05 / 49-06 type their probe-function
// capture parameters with it. Remove this marker when they land.
// ts-prune-ignore-next
export interface BoundedOutputCapture {
  /** Feed one raw chunk (stdout or stderr) from `CallRunnerOptions.onOutput`. */
  onOutput(chunk: string): void
  text(): string
  /** True once at least one chunk has arrived, false for a joined spawn. */
  observed(): boolean
}

export function createBoundedOutputCapture(
  cap: number = SIGN_IN_PROBE_OUTPUT_CAP
): BoundedOutputCapture {
  let held = ''
  let seen = false
  return {
    onOutput(chunk: string) {
      seen = true
      const room = cap - held.length
      if (room <= 0) {
        return
      }
      held += chunk.length > room ? chunk.slice(0, room) : chunk
    },
    text: () => held,
    observed: () => seen
  }
}

interface ClassifierInput {
  /** Everything the capture held (stdout and stderr, interleaved). */
  output: string
  /** `BoundedOutputCapture.observed()` -- false means a joined spawn. */
  observed: boolean
  /** The runner exited non-zero or failed to spawn. */
  errored: boolean
  /** The probe was aborted (bound hit, shutdown, or a sign-out). */
  aborted: boolean
}

/**
 * Epic, `legendary status --json` (RESEARCH 1a). Both legendary failure
 * branches (stale credentials, network error) exit 1 with the same trailing
 * `Log in failed!`, so the exit code cannot discriminate; the preceding log
 * line does.
 */
export function classifyLegendaryStatus(
  input: ClassifierInput
): SignInProbeOutcome {
  if (input.aborted || !input.observed) {
    return 'unknown'
  }
  if (input.output.includes(EPIC_AUTH_FAILURE_MARKER)) {
    return 'expired'
  }
  if (input.output.includes(EPIC_NETWORK_FAILURE_MARKER)) {
    return 'unknown'
  }
  if (input.errored) {
    return 'unknown'
  }
  // `<not logged in>` means the credentials vanished mid-probe: not healthy.
  if (/"account"\s*:\s*"(?!<not logged in>)[^"]+"/.test(input.output)) {
    return 'healthy'
  }
  return 'unknown'
}

/**
 * GOG, `gogdl auth` (RESEARCH 1b, D-17). `stdout` is gogdl's stdout alone (a
 * credentials object or a bare `null`); `output` is the full capture, which is
 * where the connection-error line lands.
 */
export function classifyGogdlAuth(
  input: ClassifierInput & {
    stdout: string
    /** The online monitor said online when the probe ran. */
    online: boolean
    /** gogdl's auth config file is present on disk. */
    authConfigExists: boolean
  }
): SignInProbeOutcome {
  if (input.aborted || !input.observed || input.errored || !input.online) {
    return 'unknown'
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(input.stdout.trim())
  } catch {
    return 'unknown'
  }
  if (parsed === null) {
    if (
      input.authConfigExists &&
      !input.output.includes(GOG_REFRESH_CONNECTION_FAILURE_MARKER)
    ) {
      return 'expired'
    }
    return 'unknown'
  }
  if (
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    'access_token' in parsed
  ) {
    return 'healthy'
  }
  return 'unknown'
}

const NILE_REFRESH_RESPONSE_PATTERN = new RegExp(
  `${NILE_REFRESH_FAILURE_MARKER}\\s*<Response \\[(\\d{3})\\]>`,
  'g'
)

/**
 * Amazon, `nile list-updates --json` (RESEARCH 1c). nile logs
 * `Failed to refresh the token <Response [NNN]>` on a non-OK refresh and carries
 * on with the stale token, so the HTTP status is recoverable from the line and
 * the exit code says nothing. Only 400/401/403 are an authentication failure
 * (A3: which of those Amazon returns for a dead refresh token is assumed).
 */
export function classifyNileOutput(input: ClassifierInput): SignInProbeOutcome {
  if (input.aborted || !input.observed) {
    return 'unknown'
  }
  const statuses = [
    ...input.output.matchAll(NILE_REFRESH_RESPONSE_PATTERN)
  ].map((match) => match[1])
  if (statuses.length > 0) {
    // One non-auth status among the lines (a 5xx, 429, 408) means the failure
    // may have been transient, so it is not a proven authentication failure.
    return statuses.every((status) =>
      NILE_AUTH_FAILURE_STATUSES.includes(status)
    )
      ? 'expired'
      : 'unknown'
  }
  // A refresh failure with no `<Response [` is connection-error text.
  if (input.output.includes(NILE_REFRESH_FAILURE_MARKER)) {
    return 'unknown'
  }
  if (input.errored) {
    return 'unknown'
  }
  return 'healthy'
}
