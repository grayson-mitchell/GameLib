/**
 * The settings-file strip shared by `settings-game-v1-v2` and
 * `settings-global-v1-v2` (Phase 70 gap G3, 70-REVIEW WR-02).
 *
 * Settings are user state, not a regenerable cache, so the strip is leaf- and
 * element-granular: one bad environment variable, wrapper or dismissed notice
 * is removed and its valid siblings stay. Known legacy shapes are repaired
 * before validation, with the value the runtime already assumed for the
 * missing field, so an older-build `gamescope` keeps its other fields. Each
 * top-level key the strip removed or changed is written to stderr by name
 * only (never a value), so a lost setting can be traced to the engine's 0600
 * pre-migration backup.
 *
 * No `backend/logger` import: module-init cycle (see storeVersioning/backup.ts).
 */
import type { z } from 'zod'
import { stripToSchema } from './schemaStrip'

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * `gamescope` fields added after the first gamescope build. Each default is
 * what the runtime already uses when the field is absent
 * (gamescopeCommand.ts: `additionalOptions ?? ''`, a falsy
 * `enableForceGrabCursor` adds no flag).
 */
const GAMESCOPE_ADDITIVE_DEFAULTS: Readonly<Record<string, unknown>> = {
  additionalOptions: '',
  enableForceGrabCursor: false
}

function repairLegacyShapes(
  settings: Record<string, unknown>
): Record<string, unknown> {
  const gamescope = settings['gamescope']
  if (!isPlainObject(gamescope)) return settings
  const missing = Object.entries(GAMESCOPE_ADDITIVE_DEFAULTS).filter(
    ([key]) => gamescope[key] === undefined || gamescope[key] === null
  )
  if (missing.length === 0) return settings
  return {
    ...settings,
    gamescope: { ...gamescope, ...Object.fromEntries(missing) }
  }
}

/**
 * Repair, then strip `settings` against `schema` (a `.partial()` settings
 * schema), logging by name each top-level key that was removed or changed.
 * `where` names the file region for the log line (no values).
 */
export function stripSettings(
  settings: Record<string, unknown>,
  schema: z.ZodType,
  where: string
): unknown {
  const repaired = repairLegacyShapes(settings)
  const out = stripToSchema(repaired, schema, {
    dropInvalidOptional: true,
    dropInvalidElements: true
  })
  if (!isPlainObject(out)) return out
  const removed = Object.keys(settings).filter(
    (key) => !Object.hasOwn(out, key)
  )
  const changed = Object.keys(out).filter(
    (key) => JSON.stringify(out[key]) !== JSON.stringify(settings[key])
  )
  if (removed.length > 0 || changed.length > 0) {
    process.stderr.write(
      `[storeVersion] ${where}: removed [${removed.join(', ')}], cleaned [${changed.join(', ')}]; the pre-migration backup keeps the original\n`
    )
  }
  return out
}
