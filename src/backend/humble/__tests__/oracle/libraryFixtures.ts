/**
 * The synthetic Humble library the 94-08 flow oracles share: items with visibly fake gamekeys
 * (`fake-gamekey-NNNN`), key values that are the literal `REDACTED`, and the wire answers a sync,
 * a reveal and the Steam app-id pass need. See `flight.ts` for why a key value is never anything else.
 */
import type { SyntheticResponse } from 'backend/testUtils/humbleOracle/wireRecorder'
import { ownedSteamLibrary } from '../fixtures/steamGames'
import {
  FAKE_KEY_VALUE,
  LIBRARY_ACTION_ID,
  LIBRARY_PATH,
  discoveryResponses,
  fullLibraryResponses,
  getAnswer,
  libraryPageResponses,
  redeemAnswer,
  redeemDiscoveryResponses,
  redeemFlight,
  type FlightItem
} from './flight'
import type { FlowSteam } from './flowHarness'

const REVEALED_AT = '2026-11-01T00:00:00.000Z'

export const PORTAL_ID = 'fake-gamekey-0001'
export const CACTUS_ID = 'fake-gamekey-0002'
export const OTHER_ID = 'fake-gamekey-0003'
export const GOG_ID = 'fake-gamekey-0004'
export const REVEALED_ID = 'fake-gamekey-0005'
export const EXPIRING_ID = 'fake-gamekey-0006'
export const EXPIRED_ID = 'fake-gamekey-0007'
export const FRAMED_ID = 'fake-gamekey-0008'

/** Unrevealed; Steam's exact tier finds it through the resolver (`Portal 2` is app 620). */
export const PORTAL: FlightItem = {
  id: PORTAL_ID,
  title: 'Fake Bundle Portal',
  keys: [{ id: 'portal2_steam', title: 'Portal 2' }]
}
/** The same key revealed on the website: the exact owned match auto-settles it. */
export const PORTAL_REVEALED: FlightItem = {
  id: PORTAL_ID,
  title: 'Fake Bundle Portal',
  keys: [
    {
      id: 'portal2_steam',
      title: 'Portal 2',
      gameKey: null,
      redeemedAt: REVEALED_AT,
      keyFormatted: FAKE_KEY_VALUE
    }
  ]
}
/** Unrevealed; matches the owned `Assault Android Cactus` only fuzzily. */
export const CACTUS: FlightItem = {
  id: CACTUS_ID,
  title: 'Fake Bundle Cactus',
  keys: [{ id: 'cactus_steam', title: 'Assault Android Cactus+' }]
}
export const OTHER: FlightItem = {
  id: OTHER_ID,
  title: 'Fake Bundle Other',
  keys: [{ id: 'other_steam', title: 'Fake Unowned Game' }]
}
export const GOG: FlightItem = {
  id: GOG_ID,
  title: 'Fake Bundle GOG',
  keys: [{ id: 'fake_gog', title: 'Fake GOG Game', keyIntegrationId: 'gog' }]
}
export const REVEALED_OTHER: FlightItem = {
  id: REVEALED_ID,
  title: 'Fake Bundle Revealed',
  keys: [
    {
      id: 'revealed_steam',
      title: 'Fake Revealed Game',
      gameKey: null,
      redeemedAt: REVEALED_AT,
      keyFormatted: FAKE_KEY_VALUE
    }
  ]
}
export const EXPIRING: FlightItem = {
  id: EXPIRING_ID,
  title: 'Fake Bundle Expiring',
  keys: [
    {
      id: 'expiring_steam',
      title: 'Fake Expiring Game',
      keyIntegrationId: 'gog',
      redemptionExpiryDate: '$D2027-03-04T00:00:00.000Z'
    }
  ]
}
export const EXPIRED: FlightItem = {
  id: EXPIRED_ID,
  title: 'Fake Bundle Expired',
  keys: [
    {
      id: 'expired_gog',
      title: 'Fake Expired Game',
      keyIntegrationId: 'gog',
      expired: true
    }
  ]
}
/** Revealed and fuzzily owned (`Framed Collection`): owned elsewhere but never auto-settled. */
export const FRAMED_REVEALED: FlightItem = {
  id: FRAMED_ID,
  title: 'Fake Bundle Framed',
  keys: [
    {
      id: 'framed_steam',
      title: 'FRAMED Collection',
      gameKey: null,
      redeemedAt: REVEALED_AT,
      keyFormatted: FAKE_KEY_VALUE
    }
  ]
}

export const itemN = (n: number): FlightItem => ({
  id: `fake-gamekey-${String(n + 100).padStart(4, '0')}`,
  title: `Fake Bundle ${n}`,
  keys: [
    {
      id: `fake_game_${n}_gog`,
      title: `Fake Game ${n}`,
      keyIntegrationId: 'gog'
    }
  ]
})

export const OWNED: FlowSteam = {
  loggedIn: true,
  games: ownedSteamLibrary
}
export const SIGNED_OUT: FlowSteam = {
  loggedIn: false,
  games: ownedSteamLibrary
}
export const SIGNED_IN_EMPTY: FlowSteam = { loggedIn: true, games: [] }

/** axios's query encoding: a space is `+`, the rest of `encodeURIComponent`. */
export const axiosEncode = (value: string): string =>
  encodeURIComponent(value)
    .replace(/%3A/gi, ':')
    .replace(/%24/g, '$')
    .replace(/%2C/gi, ',')
    .replace(/%20/g, '+')
    .replace(/%5B/gi, '[')
    .replace(/%5D/gi, ']')

export const storeSearch = (
  term: string,
  items: { type: string; name: string; id: number }[]
): SyntheticResponse =>
  getAnswer(
    `/api/storesearch/?term=${axiosEncode(term)}&l=english&cc=US`,
    200,
    JSON.stringify({ total: items.length, items }),
    'application/json'
  )

/** Unrevealed, and fuzzily owned like `FRAMED_REVEALED`: the gift-link key. */
export const FRAMED: FlightItem = {
  id: FRAMED_ID,
  title: 'Fake Bundle Framed',
  keys: [{ id: 'framed_steam', title: 'FRAMED Collection' }]
}
/** An expiring key whose expiry the legacy-backfill case moves. */
export const LEGACY: FlightItem = {
  id: 'fake-gamekey-0009',
  title: 'Fake Bundle Legacy',
  keys: [
    {
      id: 'legacy_gog',
      title: 'Fake Legacy Game',
      keyIntegrationId: 'gog',
      redemptionExpiryDate: '$D2027-05-06T00:00:00.000Z'
    }
  ]
}

export const PORTAL_HIT = storeSearch('Portal 2', [
  { type: 'app', name: 'Portal 2', id: 620 }
])
export const CACTUS_MISS = storeSearch('Assault Android Cactus+', [])
export const OTHER_MISS = storeSearch('Fake Unowned Game', [])
export const REVEALED_OTHER_MISS = storeSearch('Fake Revealed Game', [])
export const FRAMED_MISS = storeSearch('FRAMED Collection', [])

export const libraryDiscovery = (): SyntheticResponse[] =>
  discoveryResponses({
    pagePath: LIBRARY_PATH,
    actionId: LIBRARY_ACTION_ID,
    actionName: 'filterUserLibrary'
  })

export const syncAnswers = (
  items: readonly FlightItem[]
): SyntheticResponse[] => fullLibraryResponses(items)
/** A later sync of the same boot: the action id is cached, so only the pages are asked. */
export const resyncAnswers = (
  items: readonly FlightItem[]
): SyntheticResponse[] => libraryPageResponses(items)

export const revealOk = (gamekey: string): SyntheticResponse[] => [
  ...redeemDiscoveryResponses(gamekey),
  redeemAnswer(
    gamekey,
    200,
    redeemFlight({
      success: true,
      key: FAKE_KEY_VALUE,
      orderStatus: 'complete'
    })
  )
]
export const revealStatus = (
  gamekey: string,
  status: number,
  body = '',
  contentType = 'text/x-component'
): SyntheticResponse[] => [
  ...redeemDiscoveryResponses(gamekey),
  redeemAnswer(gamekey, status, body, contentType)
]
