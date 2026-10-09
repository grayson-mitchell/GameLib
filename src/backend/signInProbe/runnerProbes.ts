/**
 * Phase 49 (49-05, R2, D-17): the Epic and Amazon expiry probes. Each spawns one
 * authenticated runner command, captures its output, and hands the capture to a
 * 49-04 classifier. The only `expired` verdict is an authentication failure;
 * `applySignInVerdict` (49-04) is the only writer, called by 49-08's pass.
 *
 * Limits, recorded plainly (RESEARCH Probe Discretion 1a / 1c):
 *   - legendary `status --json` also checks for updates and refreshes the game
 *     list, so it is not cheap. It is still the only login-only entry that never
 *     falls into the interactive `auth` flow.
 *   - nile `list-updates --json` only refreshes its token when the access token
 *     has already expired, so a revoked refresh token is invisible until the
 *     access token ages out (RESEARCH A4).
 *   Both are live-gated by 49-11 / 49-12; a drifted marker degrades to `unknown`.
 *
 * Every spawn passes `skipErrorHandler: true` (no modal, P2) and feeds
 * `onOutput` into a bounded capture. The capture is NEVER logged: a runner's
 * output can carry tokens (T-49-15), so this module imports no logger.
 *
 * `libraryManagerMap` is imported lazily (`await import('../storeManagers')`),
 * never statically, to stay out of the storeManagers import cycle (the same
 * pattern as `eos_overlay.ts`).
 *
 * GOG's probe lives below and delegates to `GOGUser.getCredentialsWithVerdict`:
 * that is the single `gogdl auth` spawn site, shared with Block E.
 *
 * Sidecar exit contract: this module creates no timer, watcher or socket, so it
 * `unref()`s nothing. The child processes it starts are created by `callRunner`,
 * which does not `unref()` them (`launcher.ts`), so they ARE in-flight work and
 * the contract's second half applies: each is bounded by 49-08's
 * `boundedSignInProbe`, whose bound-abort path is
 * `callAbortController(SIGN_IN_PROBE_ABORT_IDS[store])` at
 * `SIGN_IN_PROBE_BOUND_MS` (45 000 ms). That kills the child through the
 * `AbortController` `callRunner` registered under the id. The ids are therefore
 * unique per probe (`signin-probe-legendary`, `signin-probe-nile`) or the
 * existing single GOG id (`gogdl-get-credentials`), so a bound abort can never
 * kill an unrelated runner command.
 */
import type { SignInProbeOutcome } from 'common/signInState'
import {
  classifyLegendaryStatus,
  classifyNileOutput,
  createBoundedOutputCapture
} from './classify'

export const SIGN_IN_PROBE_ABORT_IDS = {
  legendary: 'signin-probe-legendary',
  nile: 'signin-probe-nile',
  gog: 'gogdl-get-credentials'
} as const

/** `legendary status --json`: classify the captured output (RESEARCH 1a). */
export async function probeLegendarySession(): Promise<SignInProbeOutcome> {
  try {
    const { libraryManagerMap } = await import('../storeManagers')
    const capture = createBoundedOutputCapture()
    const res = await libraryManagerMap.legendary.runRunnerCommand(
      { subcommand: 'status', '--json': true },
      {
        abortId: SIGN_IN_PROBE_ABORT_IDS.legendary,
        skipErrorHandler: true,
        logMessagePrefix: 'Sign-in probe',
        onOutput: (chunk) => capture.onOutput(chunk)
      }
    )
    return classifyLegendaryStatus({
      output: capture.text(),
      observed: capture.observed(),
      errored: Boolean(res.error),
      aborted: Boolean(res.abort)
    })
  } catch {
    return 'unknown'
  }
}

/** `nile list-updates --json`: classify the captured output (RESEARCH 1c). */
export async function probeNileSession(): Promise<SignInProbeOutcome> {
  try {
    const { libraryManagerMap } = await import('../storeManagers')
    const capture = createBoundedOutputCapture()
    const res = await libraryManagerMap.nile.runRunnerCommand(
      ['list-updates', '--json'],
      {
        abortId: SIGN_IN_PROBE_ABORT_IDS.nile,
        skipErrorHandler: true,
        logMessagePrefix: 'Sign-in probe',
        onOutput: (chunk) => capture.onOutput(chunk)
      }
    )
    return classifyNileOutput({
      output: capture.text(),
      observed: capture.observed(),
      errored: Boolean(res.error),
      aborted: Boolean(res.abort)
    })
  } catch {
    return 'unknown'
  }
}

/**
 * GOG: the verdict is decided inside `GOGUser.getCredentialsWithVerdict`, the
 * single `gogdl auth` spawn site shared with Block E (D-17). Lazy import for the
 * same cycle reason as `libraryManagerMap` above.
 */
export async function probeGogSession(): Promise<SignInProbeOutcome> {
  try {
    const { GOGUser } = await import('../storeManagers/gog/user')
    return (await GOGUser.getCredentialsWithVerdict()).verdict
  } catch {
    return 'unknown'
  }
}
