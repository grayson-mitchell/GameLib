import { addHandler } from 'backend/ipc'
import {
  handleSearchStores,
  handleGetStoreSearchDeals,
  handleGetStoreSearchStoreMap
} from './handlers'

/**
 * IPC handler registration for the aggregated store-search feature
 * (Phase 20 / STORESEARCH-01). The three handler bodies (including the
 * Phase 20 D-14 throw-on-failure contract) now live in `./handlers.ts`
 * (Phase 34.2 Plan 13, closes WR-09) — both this Electron registration and
 * `sidecar/enrichmentFlowRegistration.ts`'s Tauri registration import the
 * same bodies, so an edit to the error contract cannot silently diverge
 * between the two builds.
 */

addHandler('searchStores', async (_event, query) => handleSearchStores(query))

addHandler('getStoreSearchDeals', async (_event, gameId) =>
  handleGetStoreSearchDeals(gameId)
)

addHandler('getStoreSearchStoreMap', async () =>
  handleGetStoreSearchStoreMap()
)
