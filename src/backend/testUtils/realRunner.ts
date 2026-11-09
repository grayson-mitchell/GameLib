/**
 * D-12(b): the real process runner for the few tests that must actually spawn.
 *
 * Isolated by default: baseEnv and pinnedEnv come from a fresh
 * createFakeHomeProfile(), so a spawned child can never read or write the
 * operator's real profile. The two-profile rule also needs the opposite arm,
 * for a defect that only arms under a populated profile: pass
 * `realProfile: { justification }` and the runner uses the real environment.
 * The justification must name the profile-dependent defect, the way
 * meta/sidecarStartupSmoke.cjs justifies its exemption in place.
 *
 * openDetached throws under test: it would open a real URL in the user session.
 */
import { createClock } from '../process/clock'
import { createProcessRunner } from '../process/runner'
import type { Clock, LogSink, ProcessRunner } from '../process/types'
import { createCaptureLog } from './captureLog'
import { createFakeHomeProfile, type FakeHomeProfile } from './fakeHomeProfile'

export function createRealRunner(opts?: {
  realProfile?: { justification: string }
  clock?: Clock
  log?: LogSink
}): {
  runner: ProcessRunner
  profile: FakeHomeProfile | null
  dispose(): void
} {
  const real = opts?.realProfile
  if (real !== undefined && real.justification.trim().length === 0) {
    throw new TypeError(
      'the real-profile arm requires a non-empty justification naming the profile-dependent defect'
    )
  }
  const profile = real
    ? null
    : createFakeHomeProfile({ prefix: 'gamelib-real-runner-' })
  const inner = createProcessRunner({
    clock: opts?.clock ?? createClock(),
    log: opts?.log ?? createCaptureLog(),
    platform: process.platform,
    baseEnv: profile ? profile.childEnv() : process.env,
    pinnedEnv: profile ? profile.env : null,
    openerPath: '/usr/bin/open'
  })
  const runner: ProcessRunner = {
    ...inner,
    openDetached() {
      throw new Error(
        'openDetached is not allowed under test: it would open a real URL in the user session'
      )
    }
  }
  return { runner, profile, dispose: () => profile?.dispose() }
}
