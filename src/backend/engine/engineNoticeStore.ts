/**
 * Persisted dismissals for the engine notices (phase 59 D-04, D-15; moved out of the Steam
 * store module in phase 61 plan 10).
 *
 * The CacheStore name stays `steam_engine_notices`: it is the on-disk file name, so renaming it
 * would reset every user's dismissed notices.
 */
import CacheStore from 'backend/cache'

/** @public consumed through the lazy `require('./engineNoticeStore')` in engineState.ts default deps, which knip cannot trace */
export const engineNoticeStore = new CacheStore<unknown>(
  'steam_engine_notices',
  null
)
