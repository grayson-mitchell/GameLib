/**
 * The pinned base environment for the Phase 88 launch oracles (88-04, D-12).
 *
 * A launch golden stores the full env a game or script was given. If the case ran on the
 * operator's own shell, that env would carry whatever the shell happened to export (`DYLD_*`,
 * `LD_*`, `SSH_AUTH_SOCK`, a real `HOME`) and the golden would differ per machine, or worse leak a
 * real value into a committed file (RESEARCH Pitfall 11, T-88-08). `withPinnedBaseEnv` therefore
 * REPLACES `process.env` for the duration of a case with exactly:
 *
 *   - the fake HOME's eight variables (`createFakeHomeProfile().env`), and
 *   - `PINNED_BASE`: a fixed `PATH`, `LANG` and `USER`.
 *
 * That is eleven keys and no others, so what a golden records is what the launcher set, not what
 * the shell had. The original `process.env` object is restored in `finally`, whatever the case did.
 *
 * Two-profile rule: this harness is the isolated half only. 88 has no real-profile arm; a case
 * runs on a fresh fake HOME and never reads the real one. The harness spawns nothing.
 */
import {
  FAKE_HOME_ENV_KEYS,
  type FakeHomeProfile
} from 'backend/testUtils/fakeHomeProfile'

/** The three variables a golden's base env pins besides the fake HOME's eight. */
export const PINNED_BASE: Readonly<Record<'PATH' | 'LANG' | 'USER', string>> = {
  PATH: '/usr/bin:/bin',
  LANG: 'C.UTF-8',
  USER: 'gamelib-oracle'
}

/**
 * Runs `fn` with `process.env` replaced by the profile's eight home variables plus `PINNED_BASE`.
 * The previous `process.env` object is put back afterwards, also when `fn` throws or rejects.
 */
export async function withPinnedBaseEnv<T>(
  profile: Pick<FakeHomeProfile, 'env'>,
  fn: () => Promise<T> | T
): Promise<T> {
  const original = process.env
  const pinned: NodeJS.ProcessEnv = {}
  for (const key of FAKE_HOME_ENV_KEYS) pinned[key] = profile.env[key]
  Object.assign(pinned, PINNED_BASE)
  process.env = pinned
  try {
    return await fn()
  } finally {
    process.env = original
  }
}
