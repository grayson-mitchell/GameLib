/**
 * Shared contract for the Steam engine layer (phase 59). The types moved to `common/types/engine.ts` and the two pure
 * helpers to the twin (`enginewine/twin.ts`) in Phase 87 (87-55); this file only re-exports them for the TS engine that
 * 87-56 deletes with it.
 */
export type {
  EngineSelection,
  FallbackReason,
  NonCrossoverEngine,
  NonCrossoverSelection
} from 'common/types/engine'
export { engineLogLabel, isNonCrossover } from 'backend/enginewine/twin'
