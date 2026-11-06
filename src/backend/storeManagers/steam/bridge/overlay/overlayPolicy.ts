/**
 * Phase 60: pure overlay policy. D-01 default on, D-02 per-game toggle,
 * D-03 a known fix can turn it off and the user wins both ways, D-10 the
 * abnormal-exit predicate. No global switch.
 */
import { readStoredTitleConfig } from '../../titleSettings'

export type OverlayOverride = 'automatic' | 'on' | 'off'

export function parseOverlayOverride(value: unknown): OverlayOverride {
  return value === 'on' || value === 'off' ? value : 'automatic'
}

export function resolveOverlayEnabled(a: {
  platform: NodeJS.Platform
  userOverride: unknown
  knownFixOff: boolean
}): {
  enabled: boolean
  source: 'platform' | 'user' | 'known-fix' | 'default'
} {
  if (a.platform !== 'darwin') return { enabled: false, source: 'platform' }
  const user = parseOverlayOverride(a.userOverride)
  if (user === 'on') return { enabled: true, source: 'user' }
  if (user === 'off') return { enabled: false, source: 'user' }
  if (a.knownFixOff) return { enabled: false, source: 'known-fix' }
  return { enabled: true, source: 'default' }
}

/**
 * The title's stored overlay override (file-read rationale: titleSettings.ts).
 * Unvalidated: pass through parseOverlayOverride.
 */
export function readStoredOverlayOverride(appId: string): unknown {
  return readStoredTitleConfig(appId)?.steamOverlayOverride
}

export const OVERLAY_ABNORMAL_EXIT_WINDOW_MS = 30_000

/**
 * D-10: a game seen and then gone within the window, with a non-zero or
 * unknown wrapper code, is abnormal. Never-seen is Phase 59's deadline.
 */
export function isAbnormalOverlayExit(a: {
  firstMatchAt?: number
  stoppedAt: number
  wrapperCode?: number | null
}): boolean {
  if (typeof a.firstMatchAt !== 'number') return false
  if (a.stoppedAt - a.firstMatchAt > OVERLAY_ABNORMAL_EXIT_WINDOW_MS) {
    return false
  }
  return a.wrapperCode !== 0
}
