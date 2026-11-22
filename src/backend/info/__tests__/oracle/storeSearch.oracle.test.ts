/**
 * The TS oracle for IsThereAnyDeal store search (86-07, D-09, D-10 and SC1). It drives the three
 * handlers the sidecar registers (`handleSearchStores`, `handleGetStoreSearchDeals`,
 * `handleGetItadSteamGids`) over real `CacheStore` cache files, a per-case key set, a per-case
 * 429 gate and a pinned clock.
 *
 * Two kinds of case, both in `golden/storeSearch/cases.json`:
 *   - synthetic (`synthetic-...`): the responses are written into the case, taken from the real
 *     ITAD shapes in `storeSearch/__tests__/fixtures/itad`, or composed to pin one decision
 *     (key precedence, stale-serve, the deal order). They need no key and run in CI as they are.
 *   - live (`live-...`, `"live": true`): recorded once from the real service by the operator, who
 *     holds the key. In compare and write modes a live case with no recording FAILS with
 *     "live case not recorded: <id>"; it is never skipped.
 *
 * The recorder redacts the `key` query value, so a recording cannot say which key was sent. The
 * oracle therefore labels every request with the key source it carried (`user`, `env`, `baked`,
 * or `null` for the keyless lookup route) through a request interceptor, and the golden records
 * that list beside the recorded requests. Synthetic keys are placeholder literals, never secrets.
 *
 * A `CacheStore` stamps each entry with `Date()`, a string in the process's local zone. The
 * captured cache files are normalised to the UTC rendering (what `TZ=UTC` produces and what the
 * Rust store writes), so the goldens are the same on every machine.
 *
 * Record (live):       GAMELIB_INFO_ITAD_KEY=... GAMELIB_INFO_ORACLE=record pnpm exec jest --runTestsByPath <this file> -t live
 * Record (synthetic):  GAMELIB_INFO_ORACLE=record pnpm exec jest --runTestsByPath <this file> -t synthetic
 * Write goldens:       GAMELIB_WRITE_INFO_GOLDEN=1 pnpm exec jest --runTestsByPath <this file>
 * Compare:             pnpm exec jest --runTestsByPath <this file>
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import axios from 'axios'
import {
  assertLiveRecorded,
  assertManifest,
  expectEmptyCasesToFail,
  loadCases,
  pinClock,
  snapshotFiles,
  stateDir,
  syncManifest,
  withOracleProfile,
  writeOrCompareGolden
} from './harness'
import {
  installAdapter,
  installRecorder,
  oracleMode,
  type SyntheticResponse
} from './recorder'

const SLICE = 'storeSearch'
/** The floor this test carries; the committed MANIFEST must be at or above it. */
const FLOOR = 19

/** The instant every case runs at; cache state fixtures are dated relative to it. */
const ORACLE_NOW = Date.UTC(2026, 10, 22, 12, 0, 0)

const ITAD_FIXTURES = join(
  __dirname,
  '..',
  '..',
  '..',
  'storeSearch',
  '__tests__',
  'fixtures',
  'itad'
)

interface SyntheticSpec {
  method: string
  path: string
  status?: number
  headers?: Record<string, string>
  /** The body is the real fixture `fixtures/itad/<name>.json`. */
  bodyFixture?: string
  /** The body is this JSON value. */
  bodyJson?: unknown
  /** `fixtures/itad/<name>.json` holds `{status, body}`: the body is its `body`. */
  errorFixture?: string
  networkError?: boolean
}

type Op =
  | { op: 'search'; query: string; country?: string }
  | { op: 'deals'; gameId: string; country?: string }
  | {
      op: 'gids'
      appIds?: string[]
      appIdRange?: { from: number; count: number }
    }

interface StoreSearchCase {
  id: string
  note?: string
  live?: boolean
  /** Which keys exist for the case. Absent keys do not exist (no user key, no env key). */
  keys: { user?: boolean; env?: boolean; baked?: boolean }
  /** The user key was already rejected earlier in the session. */
  rejected?: boolean
  /** The case starts from `state/storeSearch/<id>`. */
  state?: boolean
  synthetic?: SyntheticSpec[]
  ops: Op[]
}

const cases = loadCases<StoreSearchCase>(SLICE)

const fixtureJson = (name: string): unknown =>
  JSON.parse(readFileSync(join(ITAD_FIXTURES, `${name}.json`), 'utf8'))

function toSynthetic(spec: SyntheticSpec): SyntheticResponse {
  let body: unknown = ''
  let status = spec.status ?? 200
  if (spec.errorFixture) {
    const fixture = fixtureJson(spec.errorFixture) as {
      status: number
      body: unknown
    }
    status = fixture.status
    body = fixture.body
  } else if (spec.bodyFixture) {
    body = fixtureJson(spec.bodyFixture)
  } else if (spec.bodyJson !== undefined) {
    body = spec.bodyJson
  }
  return {
    method: spec.method,
    path: spec.path,
    status,
    headers: spec.headers ?? { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...(spec.networkError ? { networkError: true } : {})
  }
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]
const pad = (n: number): string => String(n).padStart(2, '0')

/** `Date()` as `TZ=UTC` prints it: `Sun Nov 22 2026 12:00:00 GMT+0000 (Coordinated Universal Time)`. */
function utcDateString(ms: number): string {
  const d = new Date(ms)
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCDate())} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`
}

/** Rewrites every local-zone `Date()` string in a captured file to its UTC rendering. */
function normaliseDates(bytes: Buffer): Buffer {
  const text = bytes.toString('utf8')
  const pattern =
    /[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4} \([^)]*\)/g
  const out = text.replace(pattern, (stamp) => utcDateString(Date.parse(stamp)))
  return out === text ? bytes : Buffer.from(out, 'utf8')
}

type Handlers = typeof import('backend/storeSearch/handlers')
type StoresModule = typeof import('backend/storeSearch/stores')
type CacheModule = typeof import('backend/storeSearch/itadCache')
let handlers: Handlers
let storesModule: StoresModule
let cacheModule: CacheModule

/** The label function of the case being run, read by the request interceptor. */
let labelOf: (key: string) => string = () => 'unknown'
let keyLabels: (string | null)[] = []
let interceptor: number

let restoreClock: () => void
beforeAll(async () => {
  restoreClock = pinClock(ORACLE_NOW)
  installAdapter()
  interceptor = axios.interceptors.request.use((config) => {
    const params = config.params as { key?: unknown } | undefined
    keyLabels.push(typeof params?.key === 'string' ? labelOf(params.key) : null)
    return config
  })
  handlers = await import('backend/storeSearch/handlers')
  storesModule = await import('backend/storeSearch/stores')
  cacheModule = await import('backend/storeSearch/itadCache')
})
afterAll(() => {
  axios.interceptors.request.eject(interceptor)
  restoreClock()
  syncManifest(SLICE, cases, FLOOR)
})

const KEY_USER = 'ORACLE-PLACEHOLDER-USER'
const KEY_ENV = 'ORACLE-PLACEHOLDER-ENV'
const KEY_BAKED = 'ORACLE-PLACEHOLDER-BAKED'

/** The env key a case is handed: the operator's in record mode for a live case, else a placeholder. */
function envKeyFor(c: StoreSearchCase): string {
  if (!c.live) return KEY_ENV
  if (oracleMode() !== 'record') return 'REDACTED'
  const key = process.env.GAMELIB_INFO_ITAD_KEY
  if (!key) {
    throw new Error(
      'GAMELIB_INFO_ITAD_KEY is not set in this terminal: live cases are recorded with the real key'
    )
  }
  return key
}

const describeError = (error: unknown): unknown => {
  const e = error as { name?: string; code?: string; message?: string }
  return {
    error: {
      name: e.name ?? 'Error',
      ...(e.code ? { code: e.code } : {}),
      message: e.message ?? String(error)
    }
  }
}

describe('storeSearch oracle', () => {
  it('has at least the floor of cases, and the manifest agrees', () => {
    assertManifest(SLICE, cases, FLOOR)
  })

  it('an empty case list fails the manifest guard', () => {
    expectEmptyCasesToFail(SLICE, FLOOR)
  })

  it('synthetic guard: an unrecorded live case fails by name, never skips', () => {
    expect(() =>
      assertLiveRecorded(
        SLICE,
        { id: 'live-never-recorded', live: true },
        'compare'
      )
    ).toThrow(/live case not recorded: live-never-recorded/)
    expect(() =>
      assertLiveRecorded(SLICE, { id: 'synthetic-anything' }, 'compare')
    ).not.toThrow()
  })

  it('synthetic guard: the cases carry at least 14 synthetic and 5 live cases', () => {
    expect(cases.filter((c) => !c.live).length).toBeGreaterThanOrEqual(14)
    expect(cases.filter((c) => c.live).length).toBeGreaterThanOrEqual(5)
  })

  it('synthetic guard: a state folder exists exactly for the cases that start with cache files', () => {
    const withState = cases.filter((c) =>
      existsSync(join(stateDir(SLICE, c.id), 'store_cache'))
    )
    expect(withState.map((c) => c.id).sort()).toEqual(
      cases
        .filter((c) => c.state)
        .map((c) => c.id)
        .sort()
    )
  })

  it.each(cases.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    assertLiveRecorded(SLICE, c)
    const userKey = c.keys.user ? KEY_USER : undefined
    const envKey = c.keys.env ? envKeyFor(c) : undefined
    const bakedKey = c.keys.baked ? KEY_BAKED : undefined
    labelOf = (key) =>
      key === userKey
        ? 'user'
        : key === envKey
          ? 'env'
          : key === bakedKey
            ? 'baked'
            : 'unknown'
    keyLabels = []
    const recorder = installRecorder({
      slice: SLICE,
      caseId: c.id,
      synthetic: (c.synthetic ?? []).map(toSynthetic)
    })
    const globals = globalThis as { __ITAD_API_KEY__?: string }
    if (bakedKey) globals.__ITAD_API_KEY__ = bakedKey
    try {
      const outcome = await withOracleProfile(
        async ({ userData, root }) => {
          let rejected = c.rejected === true
          let marked = 0
          const gate = cacheModule.createItadGate()
          const deps = {
            appInfo: { version: '0.11.0' },
            stores: {
              storeSearch: storesModule.createStoreSearchStores({ root })
            },
            miscRuntime: { itadGate: gate },
            now: () => ORACLE_NOW,
            env: envKey ? { GAMELIB_ITAD_API_KEY: envKey } : {},
            itadSecrets: {
              getApiKey: () => Promise.resolve(userKey),
              isRejected: () => rejected,
              markRejected: () => {
                rejected = true
                marked += 1
              }
            }
          }
          const results: unknown[] = []
          for (const op of c.ops) {
            try {
              if (op.op === 'search') {
                results.push({
                  ok: await handlers.handleSearchStores(
                    deps,
                    op.query,
                    op.country
                  )
                })
              } else if (op.op === 'deals') {
                results.push({
                  ok: await handlers.handleGetStoreSearchDeals(
                    deps,
                    op.gameId,
                    op.country
                  )
                })
              } else {
                const appIds =
                  op.appIds ??
                  Array.from({ length: op.appIdRange?.count ?? 0 }, (_, i) =>
                    String((op.appIdRange?.from ?? 0) + i)
                  )
                results.push({
                  ok: await handlers.handleGetItadSteamGids(deps, appIds)
                })
              }
            } catch (error) {
              results.push(describeError(error))
            }
          }
          const until = gate.blockedUntil()
          const files: Record<string, Buffer> = {}
          for (const [rel, bytes] of Object.entries(snapshotFiles(userData))) {
            files[rel] = normaliseDates(bytes)
          }
          return {
            results,
            blockedForMs: until === 0 ? null : until - ORACLE_NOW,
            userKeyMarkedRejected: marked,
            files
          }
        },
        stateDir(SLICE, c.id)
      )

      await recorder.finish()
      writeOrCompareGolden(SLICE, c.id, {
        result: {
          ops: outcome.results,
          requests: recorder.requested,
          keyPerRequest: keyLabels,
          userKeyMarkedRejected: outcome.userKeyMarkedRejected,
          gateBlockedForMs: outcome.blockedForMs
        },
        files: outcome.files
      })
    } finally {
      delete globals.__ITAD_API_KEY__
    }
  })
})
