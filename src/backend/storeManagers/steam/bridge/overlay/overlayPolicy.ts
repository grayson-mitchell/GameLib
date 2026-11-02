/**
 * Phase 60: pure overlay policy. D-01 default on, D-02 per-game toggle,
 * D-03 a known fix can turn it off and the user wins both ways, D-10 the
 * abnormal-exit predicate. No global switch.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { gamesConfigPath } from 'backend/constants/paths'

// ts-prune-ignore-next
export type OverlayOverride = 'automatic' | 'on' | 'off'

// ts-prune-ignore-next
export function parseOverlayOverride(value: unknown): OverlayOverride {
  return value === 'on' || value === 'off' ? value : 'automatic'
}

// ts-prune-ignore-next
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
 * The title's stored overlay override, read straight from its GameConfig
 * file: GameConfig.get(id).config is filled asynchronously after
 * construction (59-UAT G11). Unvalidated: pass through parseOverlayOverride.
 */
// ts-prune-ignore-next
export function readStoredOverlayOverride(appId: string): unknown {
  if (!/^[0-9]{1,10}$/.test(appId)) return undefined
  const path = join(gamesConfigPath, `${appId}.json`)
  if (!existsSync(path)) return undefined
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<
      string,
      { steamOverlayOverride?: unknown } | undefined
    >
    return raw[appId]?.steamOverlayOverride
  } catch {
    return undefined
  }
}

// ts-prune-ignore-next
export const OVERLAY_ABNORMAL_EXIT_WINDOW_MS = 30_000

/**
 * D-10: a game seen and then gone within the window, with a non-zero or
 * unknown wrapper code, is abnormal. Never-seen is Phase 59's deadline.
 */
// ts-prune-ignore-next
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
