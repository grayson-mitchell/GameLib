import { logWarning, LogPrefix } from 'backend/logger'

/**
 * Build a validated steam:// protocol URL.
 *
 * Returns the URL only when appId is a pure decimal integer string (/^\d+$/).
 * Non-numeric appIds (injected strings, path traversal, shell metacharacters)
 * are rejected here — this is the single chokepoint that mitigates appId
 * injection into steam:// URLs (threat T-03-01).
 *
 * Reused by install/uninstall (plan 03-02) for the same guard.
 *
 * `launch` (Windows Play, quick 261029-i1n) is the only verb with a suffix.
 * The suffix is the fixed literal `/Dialog`, never caller input, so the numeric
 * guard still covers every variable byte of every URL.
 */
export function buildSteamProtocolUrl(
  verb: 'rungameid' | 'launch' | 'install' | 'uninstall',
  appId: string
): string | null {
  if (!/^\d+$/.test(appId)) {
    logWarning(
      `SteamGame: rejected non-numeric appId "${appId}" — not constructing steam:// URL (T-03-01)`,
      LogPrefix.Steam
    )
    return null
  }
  if (verb === 'launch') {
    return `steam://launch/${appId}/Dialog`
  }
  return `steam://${verb}/${appId}`
}
