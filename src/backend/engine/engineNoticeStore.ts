/**
 * Persisted dismissals for the engine notices (phase 59 D-04, D-15; moved out of the Steam
 * store module in phase 61 plan 10; built per boot from the StoreRoot in 66.4 plan 04).
 *
 * The CacheStore name below is the on-disk file name and must not change: renaming it would reset
 * every user's dismissed notices.
 */
import CacheStore from 'backend/cache'
import type { StoreRoot } from 'backend/stores/storeRoot'

export function createEngineStores(deps: { root: StoreRoot }) {
  const noticeStore = new CacheStore<unknown>('steam_engine_notices', null, {
    root: deps.root,
    kind: 'user-state'
  })
  return { noticeStore }
}
