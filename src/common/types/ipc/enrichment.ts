import { z } from 'zod'

import type { GamelibFixStatus, KnowFixesInfo, WikiInfo } from '../../types'
import type { CatalogProduct } from '../discounts'
import type { RunsForMeState } from '../../runsForMe'
import {
  nonEmptyString,
  optionalArg,
  runnerArg,
  type InvokeFns
} from './schemaTypes'

const noArgs = z.tuple([])

// Search terms and ids drive outbound network requests (T-67-51), so every string is bounded.
const appName = nonEmptyString(256)

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
  ])
  // Phase 86 (86-15, D-17): the five `steamgriddb.*` channels are native `info` channels
  // (`nativeChannels.json`); their bounds live in the Rust decode. So are the five ITAD channels (86-16): `searchStores`, `getStoreSearchDeals`, `getItadSteamGids`,
  // `itad.getKeyStatus` and `itad.setApiKey`.
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
}

export type EnrichmentAsync = InvokeFns<
  typeof enrichmentAsyncArgs,
  EnrichmentAsyncReturns
>
