/**
 * D-18 dev-only fallback flags for the Rust CM client (Phase 79). Env-only: never in
 * AppSettings or the UI (D-18). Read at call time. Pure: an unknown value falls back to
 * the default silently.
 * Exit contract: no timers, no handles, no work at import.
 */

export type SteamCmImpl = 'rust' | 'ts'

/** Flipped to rust by plan 79-25 after 79-PARITY.md APPROVED (CM ops); deleted at the delete gate (plan 79-41). */
export const STEAMCM_CM_DEFAULT: SteamCmImpl = 'rust'
/** flipped by plan 79-26 after UAT-A sign-in items passed (D-18); deleted at the delete gate (plan 79-41). */
export const STEAMCM_SIGNIN_DEFAULT: SteamCmImpl = 'rust'

function pick(raw: string | undefined, fallback: SteamCmImpl): SteamCmImpl {
  return raw === 'rust' || raw === 'ts' ? raw : fallback
}

/** Scope: every CM call, anonymous and signed-in, plus Refresh. */
export function steamCmImpl(env: NodeJS.ProcessEnv = process.env): SteamCmImpl {
  return pick(env.GAMELIB_STEAMCM_CM, STEAMCM_CM_DEFAULT)
}

/** Scope: Web API QR + credentials sign-in. */
export function steamCmSignInImpl(
  env: NodeJS.ProcessEnv = process.env
): SteamCmImpl {
  return pick(env.GAMELIB_STEAMCM_SIGNIN, STEAMCM_SIGNIN_DEFAULT)
}
