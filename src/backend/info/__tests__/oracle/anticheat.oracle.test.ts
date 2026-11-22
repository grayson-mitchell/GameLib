/**
 * The TS oracle for anticheat (86-04, SC3 and D-11). `anticheat/utils.ts` has no test of its own.
 * Lookup cases read a synthetic `areweanticheatyet.json`; download cases run against the two real
 * public data URLs, recorded once from the live services (`GAMELIB_INFO_ORACLE=record`, no key
 * needed) so CI replays them offline. The golden records what each call returned, the requests the
 * TS made, whether the online monitor's `runOnceWhenOnline` was registered (the D-07 / D-28
 * check-then-wait order: a matching hash registers nothing) and the bytes the data file holds
 * afterwards.
 *
 * Record:  GAMELIB_INFO_ORACLE=record pnpm exec jest --runTestsByPath <this file>
 * Write:   GAMELIB_WRITE_INFO_GOLDEN=1 pnpm exec jest --runTestsByPath <this file>
 * Compare: pnpm exec jest --runTestsByPath <this file>
 */
import { existsSync } from 'fs'
import { join } from 'path'
import {
  assertManifest,
  expectEmptyCasesToFail,
  loadCases,
  mockPlatform,
  pinClock,
  snapshotFiles,
  stateDir,
  syncManifest,
  withOracleProfile,
  writeOrCompareGolden,
  type OraclePlatform
} from './harness'
import {
  installAdapter,
  installRecorder,
  type SyntheticResponse
} from './recorder'

const SLICE = 'anticheat'
/** The floor this test carries; the committed MANIFEST must be at or above it. */
const FLOOR = 11

type Op =
  | { op: 'lookup'; namespace?: string }
  | { op: 'download'; latestFileHash?: string }

interface AnticheatCase {
  id: string
  note?: string
  platform: OraclePlatform
  synthetic?: SyntheticResponse[]
  ops: Op[]
}

const cases = loadCases<AnticheatCase>(SLICE)

/** `undefined` cannot be written as JSON: the golden carries this marker for it. */
const encode = (value: unknown): unknown =>
  value === undefined ? { undefined: true } : value

type AnticheatModule = typeof import('backend/anticheat/utils')
let anticheat: AnticheatModule

let restoreClock: () => void
beforeAll(async () => {
  restoreClock = pinClock(Date.UTC(2026, 10, 22, 12, 0, 0))
  // The shared axiosClient copies the default adapter when it is created, so the adapter goes in
  // before the slice (and `backend/utils`) is first imported.
  installAdapter()
  anticheat = await import('backend/anticheat/utils')
})
afterAll(() => {
  restoreClock()
  syncManifest(SLICE, cases, FLOOR)
})

describe('anticheat oracle', () => {
  it('has at least the floor of cases, and the manifest agrees', () => {
    assertManifest(SLICE, cases, FLOOR)
  })

  it('an empty case list fails the manifest guard', () => {
    expectEmptyCasesToFail(SLICE, FLOOR)
  })

  it.each(cases.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    const downloads = c.ops.some((op) => op.op === 'download')
    const recorder = downloads
      ? installRecorder({
          slice: SLICE,
          caseId: c.id,
          synthetic: c.synthetic
        })
      : undefined
    const restorePlatform = mockPlatform(c.platform)
    try {
      const outcome = await withOracleProfile(
        async ({ userData }) => {
          const paths = { appFolder: userData }
          const results: unknown[] = []
          let registered = 0
          const pending: Promise<unknown>[] = []
          const onlineMonitor = {
            // The stand-in for the online monitor runs its callback at once.
            runOnceWhenOnline: (callback: () => unknown) => {
              registered += 1
              pending.push(Promise.resolve(callback()))
            }
          }
          for (const op of c.ops) {
            if (op.op === 'lookup') {
              results.push(
                encode(
                  await anticheat.gameAnticheatInfo({ paths }, op.namespace)
                )
              )
            } else {
              results.push(
                encode(
                  await anticheat.downloadAntiCheatData(
                    { onlineMonitor, paths },
                    op.latestFileHash
                  )
                )
              )
              await Promise.all(pending)
            }
          }
          return { results, registered, files: snapshotFiles(userData) }
        },
        stateDir(SLICE, c.id)
      )

      if (recorder) await recorder.finish()
      writeOrCompareGolden(SLICE, c.id, {
        result: {
          ops: outcome.results,
          onlineCallbacksRegistered: outcome.registered,
          requests: recorder?.requested ?? []
        },
        files: outcome.files
      })
    } finally {
      restorePlatform()
    }
  })

  it('a state folder exists only where the case starts with a data file', () => {
    // The cases that start with no data file have no state folder: that is the case.
    const missing = cases.filter(
      (c) => !existsSync(join(stateDir(SLICE, c.id), 'areweanticheatyet.json'))
    )
    expect(missing.map((c) => c.id).sort()).toEqual([
      'download-no-local-file-linux',
      'download-no-local-file-mac',
      'lookup-data-file-missing'
    ])
  })
})
