/**
 * D-08 dev-only fallback flags; the text flag covers ACF/VDF reads, the scan, discovery and the
 * no-depots ACF finalize; deleted at the delete gate (plan 34). Env-only (README section 5: no
 * AppSettings, no UI). Pure: an unknown value falls back to the default silently, because a
 * warn-once latch would be module state.
 */

export type SteamFilesImpl = 'rust' | 'ts'

/** Flipped to rust by plan 75-25 after 75-PARITY.md was APPROVED (plan 24, 2026-11-14). */
export const STEAMFILES_TEXT_DEFAULT: SteamFilesImpl = 'rust'
export const STEAMFILES_SHORTCUTS_DEFAULT: SteamFilesImpl = 'rust'

function pick(raw: string | undefined, fallback: SteamFilesImpl) {
  return raw === 'rust' || raw === 'ts' ? raw : fallback
}

export function steamFilesTextImpl(
  env: NodeJS.ProcessEnv = process.env
): SteamFilesImpl {
  return pick(env.GAMELIB_STEAMFILES_TEXT, STEAMFILES_TEXT_DEFAULT)
}

export function steamFilesShortcutsImpl(
  env: NodeJS.ProcessEnv = process.env
): SteamFilesImpl {
  return pick(env.GAMELIB_STEAMFILES_SHORTCUTS, STEAMFILES_SHORTCUTS_DEFAULT)
}
