/**
 * The TS oracle for GOG discounts (86-06 Task 1, D-09, D-10 and SC1). It drives `getGogDiscounts`,
 * the real fetch, paging, dedupe and fallback code, through the shared recorder. The catalog needs
 * no key, so the live cases were recorded from the real service by `GAMELIB_INFO_ORACLE=record`.
 *
 * Two kinds of case, both in `golden/discounts/cases.json`:
 *   - live (`"live": true`): recorded once from catalog.gog.com. The US catalog spans 132 pages, so
 *     the TS fetches the MAX_PAGES cap of 30 and every one of those pages is kept byte-exact.
 *   - synthetic (`"synthetic": [...]`): an error path or a credentialled branch the live service
 *     cannot show on demand (a 500 on page 2, an empty locale, the GOG bearer token). The body is
 *     cloned from the first live page (`from`), cut down with `take`/`drop`, and marked
 *     `synthetic: true` in the recording. The token is the literal `REDACTED`; the oracle never
 *     spawns gogdl and never reads a real token (T-86-12).
 *
 * `getCredentials` is answered by a deps stub whose credential cache holds the case's token or
 * nothing, so `GOGUser` runs for real and no process is spawned. The golden's `credentialLookups`
 * says whether the code asked for credentials at all.
 *
 * A live result is large, so its golden holds `count`, the ordered `ids` and `sha256`, the digest
 * of the products as canonical JSON (keys sorted at every level, compact). A result of 20 products
 * or fewer also carries the products whole.
 *
 * Record:  GAMELIB_INFO_ORACLE=record pnpm exec jest --runTestsByPath <this file> -t live
 *          then the same with -t synthetic (the synthetic bodies are cloned from the live recording)
 * Write:   GAMELIB_WRITE_INFO_GOLDEN=1 pnpm exec jest --runTestsByPath <this file>
 * Compare: pnpm exec jest --runTestsByPath <this file>
 */
import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  assertLiveRecorded,
  assertManifest,
  expectEmptyCasesToFail,
  loadCases,
  pinClock,
  syncManifest,
  writeOrCompareGolden
} from './harness'
import {
  installAdapter,
  installRecorder,
  oracleMode,
  recordedCaseDir,
  type SyntheticResponse
} from './recorder'

const SLICE = 'discounts'
/** The floor this test carries; the committed MANIFEST must be at or above it. */
const FLOOR = 9

const ORACLE_NOW = Date.UTC(2026, 10, 22, 12, 0, 0)
const APP_VERSION = '0.11.0'
const FULL_RESULT_LIMIT = 20

interface Locale {
  countryCode: string
  locale: string
  currencyCode: string
}

interface SyntheticSpec {
  status?: number
  /** Response body text, used as is (an error body). */
  text?: string
  /** Clone the first page of this live case. */
  from?: string
  /** The clone's `pages`. */
  pages?: number
  /** Drop this many leading products from the clone, then keep `take`. */
  drop?: number
  take?: number
  networkError?: boolean
}

interface DiscountsCase {
  id: string
  note?: string
  locale: Locale
  hideOwned?: boolean
  wishlistOnly?: boolean
  /** Whether the GOG credential cache holds a token. */
  credentials?: boolean
  live?: boolean
  synthetic?: SyntheticSpec[]
}

const cases = loadCases<DiscountsCase>(SLICE)

/** Keys sorted at every level, compact: the form the digest is taken over. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
    )
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function firstLivePage(caseId: string): {
  pages: number
  productCount: number
  products: unknown[]
} {
  const dir = recordedCaseDir(SLICE, caseId)
  const exchanges = JSON.parse(
    readFileSync(join(dir, 'exchanges.json'), 'utf8')
  ) as { request: { url: string }; response: { bodyFile?: string } }[]
  const first = exchanges.find((e) => /[?&]page=1(&|$)/.test(e.request.url))
  if (!first?.response.bodyFile) {
    throw new Error(`live case ${caseId} has no recorded first page`)
  }
  return JSON.parse(
    readFileSync(join(dir, first.response.bodyFile), 'utf8')
  ) as { pages: number; productCount: number; products: unknown[] }
}

/** Builds the recorder's synthetic list. Only record mode needs the bodies. */
function syntheticResponses(c: DiscountsCase): SyntheticResponse[] {
  if (oracleMode() !== 'record') return []
  return (c.synthetic ?? []).map((spec) => {
    const base = {
      method: 'GET',
      path: '/v1/catalog',
      status: spec.status ?? 200,
      headers: { 'content-type': 'application/json' }
    }
    if (spec.networkError) return { ...base, body: '', networkError: true }
    if (spec.text !== undefined) return { ...base, body: spec.text }
    if (!spec.from) throw new Error(`${c.id}: a synthetic needs from or text`)
    const page = firstLivePage(spec.from)
    const products = page.products.slice(
      spec.drop ?? 0,
      (spec.drop ?? 0) + (spec.take ?? page.products.length)
    )
    return {
      ...base,
      body: JSON.stringify({
        ...page,
        pages: spec.pages ?? 1,
        productCount: products.length,
        products
      })
    }
  })
}

type FetchModule = typeof import('backend/discounts/fetchDiscounts')
let discounts: FetchModule

let restoreClock: () => void
beforeAll(async () => {
  restoreClock = pinClock(ORACLE_NOW)
  installAdapter()
  discounts = await import('backend/discounts/fetchDiscounts')
})
afterAll(() => {
  restoreClock()
  syncManifest(SLICE, cases, FLOOR)
})

describe('discounts oracle', () => {
  it('has at least the floor of cases, and the manifest agrees', () => {
    assertManifest(SLICE, cases, FLOOR)
  })

  it('an empty case list fails the manifest guard', () => {
    expectEmptyCasesToFail(SLICE, FLOOR)
  })

  it('every live case names a recording in compare and write modes', () => {
    for (const c of cases) assertLiveRecorded(SLICE, c)
  })

  it.each(cases.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    const recorder = installRecorder({
      slice: SLICE,
      caseId: c.id,
      synthetic: syntheticResponses(c)
    })

    let credentialLookups = 0
    const credentials = {
      access_token: 'REDACTED',
      refresh_token: 'REDACTED',
      user_id: '1',
      expires_in: 3600,
      token_type: 'bearer',
      scope: '',
      session_id: '',
      loginType: 0
    }
    const deps = {
      appInfo: { version: APP_VERSION },
      onlineMonitor: { isOnline: () => true },
      gogRuntime: {
        credentials: {
          getFresh: () => {
            credentialLookups += 1
            return c.credentials ? credentials : undefined
          },
          singleFlight: () =>
            Promise.resolve({ credentials: undefined, verdict: 'unknown' })
        }
      }
    } as unknown as Parameters<FetchModule['getGogDiscounts']>[0]

    let outcome: Record<string, unknown>
    try {
      const products = (await discounts.getGogDiscounts(
        deps,
        c.locale,
        c.hideOwned,
        c.wishlistOnly
      )) as { id: string | number }[]
      outcome = {
        ok: true,
        count: products.length,
        ids: products.map((p) => p.id),
        sha256: createHash('sha256').update(canonical(products)).digest('hex'),
        ...(products.length <= FULL_RESULT_LIMIT ? { products } : {})
      }
    } catch (error) {
      outcome = {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }

    await recorder.finish()
    writeOrCompareGolden(SLICE, c.id, {
      result: {
        ...outcome,
        credentialLookups,
        requests: recorder.requested
      }
    })
  })

  it('a live case has a recording folder and a synthetic case needs none of its own bodies', () => {
    if (oracleMode() === 'record') return
    for (const c of cases) {
      expect(
        existsSync(join(recordedCaseDir(SLICE, c.id), 'exchanges.json'))
      ).toBe(true)
    }
  })
})
