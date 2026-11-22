/**
 * The TS oracle for SteamGridDB (86-07, D-09, D-10 and SC1). The three API functions in
 * `steamgrid/utils.ts` plus the `steamgriddb.*` handler mapping (no key answers `[]`; the results
 * are mapped to `{id, name}` and `{id, url, thumb}`; a failure is logged and rethrown) are driven
 * through the registered handlers, behind a recording ipc stub.
 *
 * Two kinds of case, both in `golden/steamgrid/cases.json`:
 *   - synthetic: the responses are written into the case (an error path no live service produces
 *     on demand, or a shape that pins the mapping). They need no key and run in CI as they are.
 *   - live (`"live": true`): recorded once from the real service by the operator, who holds the
 *     key. In compare and write modes a live case with no recording FAILS with "live case not
 *     recorded: <id>"; it is never skipped.
 *
 * The key is `process.env.GAMELIB_INFO_SGDB_KEY` in record mode and the string `REDACTED`
 * otherwise, so a replayed request matches its redacted recording. The recorder redacts the
 * `Authorization: Bearer` value before anything is written.
 *
 * Record (live cases):  GAMELIB_INFO_SGDB_KEY=... GAMELIB_INFO_ORACLE=record pnpm exec jest --runTestsByPath <this file> -t live
 * Record (synthetic):   GAMELIB_INFO_ORACLE=record pnpm exec jest --runTestsByPath <this file> -t synthetic
 * Write goldens:        GAMELIB_WRITE_INFO_GOLDEN=1 pnpm exec jest --runTestsByPath <this file>
 * Compare:              pnpm exec jest --runTestsByPath <this file>
 */
import {
  assertLiveRecorded,
  assertManifest,
  expectEmptyCasesToFail,
  loadCases,
  syncManifest,
  writeOrCompareGolden
} from './harness'
import {
  installAdapter,
  installRecorder,
  oracleMode,
  type SyntheticResponse
} from './recorder'

const SLICE = 'steamgrid'
/** The floor this test carries; the committed MANIFEST must be at or above it. */
const FLOOR = 6

type Op =
  | { op: 'search'; query: string }
  | {
      op: 'grids' | 'heroes'
      gameId?: number
      /** Use the id of the first result of the previous `search` op. */
      gameIdFromSearch?: boolean
      styles?: string[]
      dimensions?: string[]
    }

interface SteamGridCase {
  id: string
  note?: string
  live?: boolean
  key: 'none' | 'set'
  synthetic?: SyntheticResponse[]
  ops: Op[]
}

const cases = loadCases<SteamGridCase>(SLICE)

/** Pinned so the recorded `User-Agent` (which carries the version) is the same on every machine. */
const APP_VERSION = '0.11.0'

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let handlers: Record<string, Handler>
let currentKey: string | undefined

beforeAll(async () => {
  installAdapter()
  const registration =
    await import('backend/sidecar/enrichmentFlowRegistration')
  handlers = {}
  registration.registerEnrichmentFlows({
    ipc: {
      handle: (channel: string, handler: Handler) => {
        handlers[channel] = handler
      }
    },
    appInfo: { version: APP_VERSION },
    steamGridSecrets: {
      getApiKey: () => Promise.resolve(currentKey),
      setApiKey: () => Promise.resolve(),
      hasApiKey: () => Promise.resolve(currentKey !== undefined)
    }
  } as unknown as Parameters<typeof registration.registerEnrichmentFlows>[0])
})
afterAll(() => {
  syncManifest(SLICE, cases, FLOOR)
})

/** The key the TS is handed: the operator's in record mode, a placeholder everywhere else. */
function keyFor(c: SteamGridCase): string | undefined {
  if (c.key === 'none') return undefined
  if (oracleMode() !== 'record' || !c.live) return 'REDACTED'
  const key = process.env.GAMELIB_INFO_SGDB_KEY
  if (!key) {
    throw new Error(
      'GAMELIB_INFO_SGDB_KEY is not set in this terminal: live cases are recorded with the real key'
    )
  }
  return key
}

describe('steamgrid oracle', () => {
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
    // A synthetic case needs no recording to pass the guard.
    expect(() =>
      assertLiveRecorded(SLICE, { id: 'synthetic-anything' }, 'compare')
    ).not.toThrow()
  })

  it('synthetic guard: the cases carry at least two synthetic and four live cases', () => {
    expect(cases.filter((c) => !c.live).length).toBeGreaterThanOrEqual(2)
    expect(cases.filter((c) => c.live).length).toBeGreaterThanOrEqual(4)
  })

  it.each(cases.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    assertLiveRecorded(SLICE, c)
    currentKey = keyFor(c)
    const recorder = installRecorder({
      slice: SLICE,
      caseId: c.id,
      synthetic: c.synthetic
    })
    const results: unknown[] = []
    let firstSearchId: number | undefined
    for (const op of c.ops) {
      try {
        let value: unknown
        if (op.op === 'search') {
          value = await handlers['steamgriddb.searchGame']?.({}, op.query)
          const list = value as { id: number }[]
          firstSearchId = list[0]?.id
        } else {
          const gameId = op.gameIdFromSearch ? firstSearchId : op.gameId
          value = await handlers[
            op.op === 'grids' ? 'steamgriddb.getGrids' : 'steamgriddb.getHeroes'
          ]?.(
            {},
            {
              gameId,
              ...(op.styles ? { styles: op.styles } : {}),
              ...(op.dimensions ? { dimensions: op.dimensions } : {})
            }
          )
        }
        results.push({ ok: value })
      } catch (error) {
        results.push({
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
    await recorder.finish()
    writeOrCompareGolden(SLICE, c.id, {
      result: { ops: results, requests: recorder.requested }
    })
  })
})
