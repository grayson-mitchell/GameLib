import CacheStore from '../cache'
import type { StoreRoot } from 'backend/stores/storeRoot'
import type { WikiInfo } from 'common/types'

export function createWikiGameInfoStores(deps: { root: StoreRoot }) {
  const wikiGameInfoStore = new CacheStore<WikiInfo>(
    'wikigameinfo',
    60 * 24 * 30,
    { root: deps.root, kind: 'cache' }
  )
  const umuStore = new CacheStore<string | null>('umu', 60 * 6, {
    root: deps.root,
    kind: 'cache',
    invalidateCheck: (data) => !data
  })

  return { wikiGameInfoStore, umuStore }
}
