import type { WinetricksComponent } from 'common/types'
import type {
  deriveNeedsGuiVerbs,
  parseWinetricksMetadata
} from 'common/winetricks/metadata'
import {
  createWinetricksEnvironment,
  type WinetricksEnvironment
} from './winetricksEnvironment'

// Phase 45 Plan 06 (D-19/D-17): what `Winetricks.scriptMetadata` derives from
// the downloaded script, cached by the script's `mtimeMs:size`.
export type ScriptMetadata = {
  byVerb: ReturnType<typeof parseWinetricksMetadata>
  needsGui: ReturnType<typeof deriveNeedsGuiVerbs>
}

/**
 * The tools' process-wide state, owned by the 'tools-state' boot step (66.4-14, D-05, D-66.2-03).
 * `createTools` builds Tools per call, so the single-flight slot and the caches live here and
 * every Tools of a boot receives the same instance. No I/O, timer or handle.
 */
export function createToolsState() {
  let installingComponent = ''
  let scriptMetadata: { key: string; value: ScriptMetadata } | null = null
  // Phase 45 Plan 01 (D-01/T-45-01): the last non-empty `listAvailable` result per game,
  // keyed `${runner}:${appName}`.
  const catalogCache = new Map<string, WinetricksComponent[]>()

  return {
    installing: {
      get: (): string => installingComponent,
      set: (value: string): void => {
        installingComponent = value
      }
    },
    catalogCache,
    scriptMetadata: {
      get: (): { key: string; value: ScriptMetadata } | null => scriptMetadata,
      set: (entry: { key: string; value: ScriptMetadata } | null): void => {
        scriptMetadata = entry
      }
    },
    winetricksEnv: createWinetricksEnvironment()
  }
}

export type ToolsState = ReturnType<typeof createToolsState>
export type { WinetricksEnvironment }
