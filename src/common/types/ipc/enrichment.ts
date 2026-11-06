import type {
  AntiCheatInfo,
  GamelibFixStatus,
  KnowFixesInfo,
  Runner,
  WikiInfo
} from '../../types'
import type { CatalogLocaleSettings, CatalogProduct } from '../discounts'
import type { RunsForMeState } from '../../runsForMe'
import type {
  StoreSearchDeal,
  StoreSearchResult,
  StoreSearchStore
} from '../storeSearch'

export interface EnrichmentAsync {
  getAnticheatInfo: (appNamespace: string) => Promise<AntiCheatInfo | null>
  getKnownFixes: (appName: string, runner: Runner) => KnowFixesInfo | null
  getGamelibFixStatus: (
    appName: string,
    runner: Runner
  ) => Promise<GamelibFixStatus | null>
  // Quick 261029-mkz: per-game "Runs for me" override map.
  getRunsForMeMap: () => Promise<Record<string, RunsForMeState>>
  setRunsForMe: (args: {
    appName: string
    runner: Runner
    on: boolean
  }) => Promise<Record<string, RunsForMeState>>
  // Phase 19 (Plan 06): bulk CrossOver-rating resolver (D-11/D-16). Keyed by
  // `app_name`; `number` = matched rating, `null` = eligible & consulted with
  // no record, key-absent = never looked up (ineligible under the D-02 gate).
  getCrossoverIndex: () => Promise<Record<string, number | null>>
  removeRecent: (appName: string) => Promise<void>
  getWikiGameInfo: (
    title: string,
    appName: string,
    runner: Runner,
    forceRefresh?: boolean
  ) => Promise<WikiInfo | null>
  getGogDiscounts: (
    locale: CatalogLocaleSettings,
    hideOwned?: boolean,
    wishlistOnly?: boolean
  ) => Promise<CatalogProduct[]>
  searchStores: (query: string) => Promise<StoreSearchResult[]>
  getStoreSearchDeals: (gameId: string) => Promise<StoreSearchDeal[]>
  getStoreSearchStoreMap: () => Promise<Record<string, StoreSearchStore>>
  'steamgriddb.hasApiKey': () => Promise<boolean>
  'steamgriddb.setApiKey': (key: string) => Promise<void>
  'steamgriddb.searchGame': (
    query: string
  ) => Promise<Array<{ id: number; name: string }>>
  'steamgriddb.getGrids': (args: {
    gameId: number
    styles?: string[]
    dimensions?: string[]
  }) => Promise<Array<{ id: number; url: string; thumb: string }>>
  'steamgriddb.getHeroes': (args: {
    gameId: number
    styles?: string[]
    dimensions?: string[]
  }) => Promise<Array<{ id: number; url: string; thumb: string }>>
}
