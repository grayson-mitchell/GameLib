import { logError, LogPrefix } from '../logger'
import { searchGames, getGameDeals, getStoreMap } from './cheapshark'
import type {
  StoreSearchResult,
  StoreSearchDeal,
  StoreSearchStore
} from 'common/types/storeSearch'

/**
 * Shared storeSearch handler bodies (Phase 34.2 Plan 13, closes code-review
 * finding WR-09).
 *
 * Before this extraction, the Phase 20 D-14 rethrow-don't-swallow error
 * contract for these three channels existed in TWO hand-copied places —
 * `storeSearch/index.ts` (Electron, via `addHandler`) and
 * `sidecar/enrichmentFlowRegistration.ts` (Tauri, via `ipcMain.handle`) —
 * with nothing pinning them equal. An Electron-side edit to the log message,
 * the wrapping, or the rethrow could silently diverge on Tauri. The frontend
 * container is exclusively responsible for turning a rejected promise into
 * the "provider failed" state (Phase 20 D-14); a swallowed error here is
 * indistinguishable from "no results". This module holds the one
 * implementation both registration sites import, so the two builds cannot
 * drift apart.
 *
 * The rethrow in each of the three functions below is DELIBERATE and
 * LOAD-BEARING — do not add a fallback return, do not swallow the error, do
 * not widen the return type.
 *
 * This module imports only `./cheapshark` and the logger — it does NOT
 * directly import the `addHandler`-registering sibling module, the
 * curated-IPC layer, or the `electron` package. It DOES reach the `electron`
 * package TRANSITIVELY, through a top-of-file import inside `cheapshark.ts`
 * itself — that hop is already accounted for in `electronReachLedger.test.ts`'s
 * committed baseline (plan 34.2-11) and is rescued at sidecar runtime by
 * `electronStub`'s `Module._load` interception. This module does NOT claim
 * transitive electron-freedom — only the absence of a DIRECT import of the
 * curated-IPC layer, the `electron` package, or the registration sibling.
 */

export async function handleSearchStores(
  query: string
): Promise<StoreSearchResult[]> {
  try {
    return await searchGames(query)
  } catch (err) {
    logError(`searchStores handler failed: ${String(err)}`, LogPrefix.Backend)
    throw err
  }
}

export async function handleGetStoreSearchDeals(
  gameId: string
): Promise<StoreSearchDeal[]> {
  try {
    return await getGameDeals(gameId)
  } catch (err) {
    logError(
      `getStoreSearchDeals handler failed: ${String(err)}`,
      LogPrefix.Backend
    )
    throw err
  }
}

export async function handleGetStoreSearchStoreMap(): Promise<
  Record<string, StoreSearchStore>
> {
  try {
    return await getStoreMap()
  } catch (err) {
    logError(
      `getStoreSearchStoreMap handler failed: ${String(err)}`,
      LogPrefix.Backend
    )
    throw err
  }
}
