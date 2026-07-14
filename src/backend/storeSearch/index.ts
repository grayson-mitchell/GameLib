import { addHandler } from 'backend/ipc'
import { logError, LogPrefix } from 'backend/logger'
import { searchGames, getGameDeals, getStoreMap } from './cheapshark'

/**
 * IPC handler registration for the aggregated store-search feature
 * (Phase 20 / STORESEARCH-01). Mirrors `backend/discounts/index.ts`'s
 * throw-on-failure `addHandler` contract verbatim — handlers never swallow
 * errors into an empty result; the frontend container is exclusively
 * responsible for converting a rejected promise into the D-14 "provider
 * failed" state.
 */

addHandler('searchStores', async (_event, query) => {
  try {
    return await searchGames(query)
  } catch (err) {
    logError(`searchStores handler failed: ${String(err)}`, LogPrefix.Backend)
    throw err
  }
})

addHandler('getStoreSearchDeals', async (_event, gameId) => {
  try {
    return await getGameDeals(gameId)
  } catch (err) {
    logError(
      `getStoreSearchDeals handler failed: ${String(err)}`,
      LogPrefix.Backend
    )
    throw err
  }
})

addHandler('getStoreSearchStoreMap', async () => {
  try {
    return await getStoreMap()
  } catch (err) {
    logError(
      `getStoreSearchStoreMap handler failed: ${String(err)}`,
      LogPrefix.Backend
    )
    throw err
  }
})
