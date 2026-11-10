import CacheStore from '../cache'
import type { WikiInfo } from 'common/types'

export function createWikiGameInfoStores() {
  const wikiGameInfoStore = new CacheStore<WikiInfo>(
    'wikigameinfo',
    60 * 24 * 30,
    { kind: 'cache' }
  )
  const umuStore = new CacheStore<string | null>('umu', 60 * 6, {
    kind: 'cache',
    invalidateCheck: (data) => !data
  })

  return { wikiGameInfoStore, umuStore }
}
