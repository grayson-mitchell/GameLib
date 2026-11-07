/**
 * Store-agnostic engine key (phase 61, D-12).
 *
 * A Steam title keeps its bare numeric appId (the store whose capability
 * `appNameIsSteamAppId` is true); every other store uses `${runner}:${appName}`.
 * The two forms are disjoint (only the second contains `:`), so a GOG numeric
 * appName can never collide with a Steam appId.
 */
import { hasCapability, storeCapabilities } from 'common/storeCapabilities'

export type EngineKey = string

const STEAM_APP_ID_RE = /^[0-9]{1,10}$/

function isCleanAppName(appName: unknown): appName is string {
  if (typeof appName !== 'string') return false
  if (appName.length < 1 || appName.length > 255) return false
  if (appName !== appName.trim()) return false
  if (/[/\\\0]/.test(appName)) return false
  if (appName.split(/[/\\]/).includes('..') || appName.includes('..')) {
    return false
  }
  return true
}

function isKnownRunner(runner: unknown): runner is string {
  return (
    typeof runner === 'string' &&
    Object.prototype.hasOwnProperty.call(storeCapabilities, runner)
  )
}

export function engineKeyFor(
  runner: string,
  appName: unknown
): EngineKey | null {
  if (!isKnownRunner(runner) || !isCleanAppName(appName)) return null
  if (hasCapability(runner, 'appNameIsSteamAppId')) {
    return STEAM_APP_ID_RE.test(appName) ? appName : null
  }
  return `${runner}:${appName}`
}

export function isEngineKey(key: unknown): key is EngineKey {
  if (typeof key !== 'string') return false
  if (STEAM_APP_ID_RE.test(key)) return true
  const idx = key.indexOf(':')
  if (idx <= 0) return false
  const runner = key.slice(0, idx)
  const appName = key.slice(idx + 1)
  if (!isKnownRunner(runner) || hasCapability(runner, 'appNameIsSteamAppId')) {
    return false
  }
  return isCleanAppName(appName)
}

export function describeEngineKey(key: EngineKey): string {
  return key
}
