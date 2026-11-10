/**
 * TEMPORARY (plan 14, deleted by plan 23): `spawnAsync` for engine callers that do not hold a
 * deps slice yet. Resolved at CALL time through a dynamic import because `backend/utils` sits in
 * the storeManagers/launcher import cycle (R4); the legacy spawnAsync is the same contract as the
 * boot service.
 */
import type { SpawnAsync } from 'backend/spawnAsync'

export const legacySpawnAsync: SpawnAsync = async (...args) =>
  (await import('backend/utils')).spawnAsync(...args)
