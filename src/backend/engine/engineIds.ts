/**
 * Engine override id grammar (phase 59, D-14). The grammar and its Rust twin live in `enginewine/twin.ts`
 * (`parseEngineOverride`, 87-56b); this module re-exports them for the engine files 87-56c deletes with the directory.
 */
export { parseEngineOverride } from 'backend/enginewine/twin'
export type { EngineOverrideId } from 'common/types/engine'
