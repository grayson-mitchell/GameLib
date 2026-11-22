/**
 * Phase 47 Wave 0 (D-12): operator-run IsThereAnyDeal coverage sweep.
 *
 * Run with the operator's key in the environment (never pass it any other way):
 *   export GAMELIB_ITAD_API_KEY='<key>'
 *   node meta/runTs.cjs --bundle --platform=node --target=node22 meta/measureItadCoverage.ts
 *
 * HTTP only: this script spawns no child process. It reads the key exactly once,
 * never prints it, and refuses to write any output that contains it.
 * Output: 47-ITAD-COVERAGE.json (summary) plus response fixtures under
 * src-tauri/crates/gamelib-info/tests/fixtures/state/storeSearch/itad-samples/.
 */

import axios from 'axios'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE = 'https://api.isthereanydeal.com'
const PHASE_DIR =
  '.planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean'
const FIXTURE_DIR =
  'src-tauri/crates/gamelib-info/tests/fixtures/state/storeSearch/itad-samples'

// Hand-copied countryCode values of REGION_OPTIONS in
// src/frontend/screens/Discounts/helpers.ts (not imported: frontend module).
const REGION_OPTION_COUNTRIES = [
  'US',
  'AU',
  'BR',
  'CA',
  'CN',
  'CZ',
  'DK',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IL',
  'IT',
  'JP',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'RU',
  'KR',
  'ES',
  'SE',
  'CH',
  'TW',
  'TR',
  'UA',
  'GB'
]
const EXTRA_COUNTRIES = [
  'AR',
  'MD',
  'NZ',
  'IE',
  'AT',
  'BE',
  'MX',
  'IN',
  'ZA',
  'SG',
  'HK',
  'SA',
  'AE'
]

export const SWEEP_COUNTRIES: readonly string[] = Array.from(
  new Set([...REGION_OPTION_COUNTRIES, ...EXTRA_COUNTRIES])
)

export function assertNoSecret(text: string, secret: string): string {
  if (secret && text.includes(secret)) {
    throw new Error('refusing to write: output contains the API key')
  }
  return text
}

export function amountAgrees(
  price: { amount: number; amountInt: number },
  currency: string
): boolean {
  const d = new Intl.NumberFormat('en', {
    style: 'currency',
    currency
  }).resolvedOptions().maximumFractionDigits!
  return Math.round(price.amount * 10 ** d) === price.amountInt
}

export function pickResultsParam(
  counts: { results: number; limit: number },
  wanted: number
): 'results' | 'limit' | null {
  if (counts.results === wanted && counts.limit !== wanted) return 'results'
  if (counts.limit === wanted && counts.results !== wanted) return 'limit'
  return null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Resp = { status: number; data: unknown; headers: Record<string, unknown> }

async function main(): Promise<void> {
  const key = process.env.GAMELIB_ITAD_API_KEY
  if (!key) {
    process.stderr.write(
      'GAMELIB_ITAD_API_KEY is not set; export it and re-run\n'
    )
    process.exit(2)
  }

  mkdirSync(FIXTURE_DIR, { recursive: true })
  const write = (path: string, value: unknown) =>
    writeFileSync(
      path,
      assertNoSecret(JSON.stringify(value, null, 2) + '\n', key)
    )
  const fixture = (name: string, value: unknown) =>
    write(join(FIXTURE_DIR, name), value)

  const http = axios.create({
    baseURL: BASE,
    validateStatus: () => true,
    timeout: 15000,
    headers: { 'User-Agent': 'GameLib-measure' }
  })
  const call = async (
    method: 'get' | 'post',
    url: string,
    params?: Record<string, unknown>,
    body?: unknown
  ): Promise<Resp> => {
    await sleep(500)
    const r = await http.request({ method, url, params, data: body })
    return {
      status: r.status,
      data: r.data,
      headers: r.headers as Record<string, unknown>
    }
  }
  const rateHeaders = (h: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(h).filter(
        ([k]) => k === 'retry-after' || k.startsWith('x-ratelimit')
      )
    )

  // (a) shops
  const shopsResp = await call('get', '/service/shops/v1')
  fixture('shops.json', shopsResp.data)
  const shopList = (
    Array.isArray(shopsResp.data) ? shopsResp.data : []
  ) as Array<{ id: number; title: string }>
  const findShop = (re: RegExp) =>
    shopList.find((s) => re.test(s.title.toLowerCase()))
  const shops = {
    steam: findShop(/^steam$/) ?? null,
    gog: findShop(/^gog/) ?? null,
    epic: findShop(/epic/) ?? null
  }

  // (b) lookup + batch ceiling
  const lookup = await call('post', '/lookup/id/shop/61/v1', undefined, [
    'app/220',
    'app/400',
    'app/292030'
  ])
  fixture('lookup-steam.json', lookup.data)
  const gids = Object.values(
    (lookup.data && typeof lookup.data === 'object'
      ? lookup.data
      : {}) as Record<string, string | null>
  ).filter((g): g is string => typeof g === 'string')
  let lookupBatchCeiling = 3
  for (const n of [50, 200, 500, 1000]) {
    const body = Array.from({ length: n }, (_, i) => `app/${10 * (i + 1)}`)
    const r = await call('post', '/lookup/id/shop/61/v1', undefined, body)
    if (r.status === 200) lookupBatchCeiling = n
  }

  // (c) search results param
  const countOf = (d: unknown) => (Array.isArray(d) ? d.length : -1)
  const byResults = await call('get', '/games/search/v1', {
    title: 'portal',
    results: 20,
    key
  })
  const byLimit = await call('get', '/games/search/v1', {
    title: 'portal',
    limit: 20,
    key
  })
  const searchCounts = {
    results: countOf(byResults.data),
    limit: countOf(byLimit.data)
  }
  const resultsParam = pickResultsParam(searchCounts, 20)
  fixture(
    'search-portal.json',
    resultsParam === 'limit' ? byLimit.data : byResults.data
  )
  const authStyle = byResults.status === 200 ? 'query:key' : 'unknown'

  // (d) per-country prices
  const countries: Record<string, unknown> = {}
  let usBody = ''
  let wroteNonUsd = false
  let wroteZeroDecimal = false
  let allAgree = true
  const pricedCountries: string[] = []
  const fallbackCountries: string[] = []
  let stoppedOn429: string | null = null
  for (const country of SWEEP_COUNTRIES) {
    const r = await call('post', '/games/prices/v3', { country, key }, gids)
    if (r.status === 429) {
      stoppedOn429 = country
      countries[country] = { status: 429, headers: rateHeaders(r.headers) }
      break
    }
    const text = JSON.stringify(r.data)
    if (country === 'US' && r.status === 200) {
      usBody = text
      fixture('prices-US.json', r.data)
    }
    const currencies = new Set<string>()
    let shopsWithDeals = 0
    const agreement: Record<string, boolean> = {}
    const games = (Array.isArray(r.data) ? r.data : []) as Array<{
      deals?: Array<{
        price: { amount: number; amountInt: number; currency: string }
      }>
    }>
    for (const g of games) {
      for (const d of g.deals ?? []) {
        shopsWithDeals++
        currencies.add(d.price.currency)
        const ok = amountAgrees(d.price, d.price.currency)
        agreement[d.price.currency] =
          (agreement[d.price.currency] ?? true) && ok
        if (!ok) allAgree = false
      }
    }
    const identicalToUS = country !== 'US' && usBody !== '' && text === usBody
    const nonUsd = [...currencies].some((c) => c !== 'USD')
    if (r.status === 200 && !wroteNonUsd && country !== 'US' && nonUsd) {
      wroteNonUsd = true
      fixture('prices-nonUSD.json', r.data)
    }
    if (
      r.status === 200 &&
      !wroteZeroDecimal &&
      (currencies.has('JPY') || currencies.has('KRW'))
    ) {
      wroteZeroDecimal = true
      fixture('prices-zeroDecimal.json', r.data)
    }
    countries[country] = {
      status: r.status,
      currencies: [...currencies],
      identicalToUS,
      shopsWithDeals,
      amountAgrees: agreement,
      headers: rateHeaders(r.headers)
    }
    const priced =
      r.status === 200 && (country === 'US' || (!identicalToUS && nonUsd))
    ;(priced ? pricedCountries : fallbackCountries).push(country)
  }

  // (e) error shapes
  const noKey = await call('get', '/games/search/v1', { title: 'portal' })
  const badKey = await call('get', '/games/search/v1', {
    title: 'portal',
    key: 'invalid-key-for-measurement'
  })
  fixture('error-nokey.json', { status: noKey.status, body: noKey.data })
  fixture('error-badkey.json', { status: badKey.status, body: badKey.data })

  write(join(PHASE_DIR, '47-ITAD-COVERAGE.json'), {
    measuredAt: new Date().toISOString(),
    authStyle,
    resultsParam,
    searchCounts,
    lookupBatchCeiling,
    shops,
    countries,
    pricedCountries,
    fallbackCountries,
    stoppedOn429,
    amountSource: allAgree ? 'amount' : 'amountInt',
    errorShapes: {
      noKey: { status: noKey.status, body: noKey.data },
      badKey: { status: badKey.status, body: badKey.data }
    }
  })
  process.stdout.write(
    assertNoSecret(
      `sweep done: ${pricedCountries.length} priced, ${fallbackCountries.length} fallback` +
        (stoppedOn429 ? `; STOPPED on 429 at ${stoppedOn429}` : '') +
        '\n',
      key
    )
  )
}

if (!process.env.JEST_WORKER_ID) {
  void main().catch((err: unknown) => {
    if (axios.isAxiosError(err)) {
      console.error({ endpoint: err.config?.url, status: err.response?.status })
    } else {
      console.error(String((err as Error).message))
    }
    process.exit(1)
  })
}
