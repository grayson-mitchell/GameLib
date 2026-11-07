import { isWritableEngineOverride } from './engineConfig'
import { getPerGameBottleNameFor } from './gameEngineState'

/**
 * Phase 61 D-17, T-61-58, T-61-59: the settings an engine-choice import adds to
 * a game's config. Returns null when the renderer sent no writable engine id
 * (the caller then keeps the Wine prefix/version path). The bottle name is
 * computed here; a renderer-sent name is never trusted.
 */
export function importEngineSettings(args: {
  runner: string
  appName: string
  engineOverride?: unknown
}): { engineOverride: string; wineCrossoverBottle?: string } | null {
  const { runner, appName, engineOverride } = args
  if (!isWritableEngineOverride(engineOverride)) return null
  const bottle = getPerGameBottleNameFor({ runner, appName })
  return {
    engineOverride,
    ...(bottle ? { wineCrossoverBottle: bottle } : {})
  }
}
