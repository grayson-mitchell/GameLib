import { ENGINE_PINS } from 'backend/enginewine/twin'
import type { EnginePin } from 'common/types/engine'

/**
 * The pinned fallback engine table (phase 59, D-08 release lever).
 *
 * Each GameLib release ships exactly one `current` pin. Gcenx's GitHub releases
 * are not immutable, so the exact build is fixed here by size + sha256 and the
 * downloader refuses anything else. No floating tag is ever used.
 *
 * `previous` is null: no earlier GameLib release shipped a pin, so there is no
 * rollback target yet. The next release that bumps the pin moves this `current`
 * into `previous` (and writes the new build into `current`); retention keeps
 * both on disk (see fallbackEngine.pruneUnpinnedEngines).
 *
 * Phase 87 (87-39, D-24): the table itself and `pinById` live once in `enginewine/twin.ts`, which reads
 * `common/enginePins.json` (the file the Rust crate reads too). They are re-exported here so every caller keeps
 * its import until 87-43 repoints them and deletes this module; the types stay here.
 */
export { ENGINE_PINS, pinById } from 'backend/enginewine/twin'

export type { EnginePin, PinnedArtifact } from 'common/types/engine'

export function pinnedEngineIdsFrom(pins: {
  current: EnginePin
  previous: EnginePin | null
}): string[] {
  return pins.previous ? [pins.current.id, pins.previous.id] : [pins.current.id]
}

export function pinnedEngineIds(): string[] {
  return pinnedEngineIdsFrom(ENGINE_PINS)
}
