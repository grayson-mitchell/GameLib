/**
 * Engine override id grammar (phase 59, D-14). A closed set: anything else,
 * including any path, parses to `automatic`. This is the backend validation
 * point for the renderer-supplied per-game override.
 */
import { pinById } from './enginePins'

export type EngineOverrideId =
  | 'automatic'
  | 'crossover'
  | `pinned:${string}`
  | `wine-manager:${string}`

const WM_VERSION_RE = /^[A-Za-z0-9._-]{1,64}$/

export function parseEngineOverride(raw: unknown): EngineOverrideId {
  if (typeof raw !== 'string') return 'automatic'
  if (raw === 'automatic' || raw === 'crossover') return raw
  if (raw.startsWith('pinned:')) {
    return pinById(raw.slice('pinned:'.length))
      ? (raw as EngineOverrideId)
      : 'automatic'
  }
  if (raw.startsWith('wine-manager:')) {
    const v = raw.slice('wine-manager:'.length)
    if (!WM_VERSION_RE.test(v) || v.includes('..')) return 'automatic'
    if (v.endsWith('-DXMT')) return 'automatic'
    if (/toolkit|gptk|porting/i.test(v)) return 'automatic'
    return raw as EngineOverrideId
  }
  return 'automatic'
}
