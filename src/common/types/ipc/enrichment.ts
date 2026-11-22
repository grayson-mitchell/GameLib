import { z } from 'zod'

import type { GamelibFixStatus, KnowFixesInfo, WikiInfo } from '../../types'
import type { CatalogProduct } from '../discounts'
import type { RunsForMeState } from '../../runsForMe'
import type { StoreSearchDeal } from '../storeSearch'
import {
  nonEmptyString,
  optionalArg,
  runnerArg,
  type InvokeFns
} from './schemaTypes'

const noArgs = z.tuple([])

// Search terms and ids drive outbound network requests (T-67-51), so every string is bounded.
const appName = nonEmptyString(256)
// Lenient on purpose: the handler maps anything that is not /^[A-Z]{2}$/ to US (RESEARCH D3).
const countryArg = optionalArg(z.string().max(16))

// Renderer-constructed, so strict. Quick 261029-mkz: per-game "Runs for me" override.
const runsForMePayload = z.strictObject({
  appName,
  runner: runnerArg(),
  on: z.boolean()
})

const localeSettings = z.strictObject({
  countryCode: z.string().max(16),
  locale: z.string().max(64),
  currencyCode: z.string().max(16)
})

export const enrichmentAsyncArgs = {
  getKnownFixes: z.tuple([appName, runnerArg()]),
  getGamelibFixStatus: z.tuple([appName, runnerArg()]),
  getRunsForMeMap: noArgs,
  setRunsForMe: z.tuple([runsForMePayload]),
  // Phase 19 (Plan 06): bulk CrossOver-rating resolver (D-11/D-16).
  getCrossoverIndex: noArgs,
  getWikiGameInfo: z.tuple([
    z.string().max(1024),
    appName,
    runnerArg(),
    optionalArg(z.boolean())
  ]),
  getGogDiscounts: z.tuple([
    localeSettings,
    optionalArg(z.boolean()),
    optionalArg(z.boolean())
  ]),
  // ITAD game id shape; blocks dots and path separators before the cache layer (T-47-25).
  getStoreSearchDeals: z.tuple([
    z.string().regex(/^[0-9a-fA-F-]{1,64}$/),
    countryArg
  ]),
  // Keyless Steam appid -> ITAD gid lookup; digits-only and bounded (T-47-26).
  getItadSteamGids: z.tuple([
    z.array(z.string().regex(/^\d{1,10}$/)).max(5000)
  ]),
  // Phase 47 D-05: the optional ITAD user key. Status is booleans only; the key is bounded.
  'itad.getKeyStatus': noArgs,
  'itad.setApiKey': z.tuple([z.string().max(256)])
  // Phase 86 (86-15, D-17): the five `steamgriddb.*` channels are native `info` channels
  // (`nativeChannels.json`); their bounds live in the Rust decode. So is `searchStores` (86-16).
}

interface EnrichmentAsyncReturns {
  getKnownFixes: KnowFixesInfo | null
  getGamelibFixStatus: Promise<GamelibFixStatus | null>
  getRunsForMeMap: Promise<Record<string, RunsForMeState>>
  setRunsForMe: Promise<Record<string, RunsForMeState>>
  // `number` = matched rating, `null` = eligible & consulted with no record, key-absent =
  // never looked up (ineligible under the D-02 gate).
  getCrossoverIndex: Promise<Record<string, number | null>>
  getWikiGameInfo: Promise<WikiInfo | null>
  getGogDiscounts: Promise<CatalogProduct[]>
  getStoreSearchDeals: Promise<StoreSearchDeal[]>
  getItadSteamGids: Promise<Record<string, string>>
  'itad.getKeyStatus': Promise<{ hasKey: boolean; rejected: boolean }>
  'itad.setApiKey': Promise<void>
}

export type EnrichmentAsync = InvokeFns<
  typeof enrichmentAsyncArgs,
  EnrichmentAsyncReturns
>
