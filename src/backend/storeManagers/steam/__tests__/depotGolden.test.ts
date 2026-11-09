/**
 * TS == golden: the TS depot pipeline over the plan-07 synthetic fixtures must
 * equal the committed expected.json (phase 73, plan 08, D-14/D-15).
 * Regenerate with `pnpm gen:depot-goldens` (GAMELIB_WRITE_DEPOT_GOLDENS=1).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  oracleVolumeIsCaseSensitive,
  runTsOracle,
  type OracleCaseResult
} from './depotGoldenOracle'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('../user')
jest.mock('backend/utils', () => ({
  getFileSize: jest.fn(),
  sendProgressUpdate: jest.fn()
}))
jest.mock('../../../ipc', () => ({ sendFrontendMessage: jest.fn() }))
jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: (_key: string, fallback = '') => fallback }
}))
// Inline decode: no worker_threads in the oracle.
jest.mock('../depot/decompressPool', () => {
  const actual = jest.requireActual('../depot/decompressPool')
  const { decodeChunk } = jest.requireActual('../depot/chunkDecode')
  const lzmaModule = jest.requireActual('lzma')
  const lzma = lzmaModule.default ?? lzmaModule
  class InlinePool {
    init = () => Promise.resolve()
    shutdown = () => Promise.resolve()
    stats = () => ({
      size: 0,
      busy: 0,
      idle: 0,
      queued: 0,
      inlineFallback: true,
      nativeWorkers: 0
    })
    decode = (
      encrypted: Buffer,
      key: Buffer,
      expectedSha: string,
      cbOriginal: number | string
    ) => decodeChunk(encrypted, key, expectedSha, cbOriginal, lzma)
  }
  return { ...actual, DecompressPool: InlinePool }
})

const FIXTURES = resolve(
  __dirname,
  '../../../../../src-tauri/crates/gamelib-depot/tests/fixtures'
)
const EXPECTED = join(FIXTURES, 'expected.json')

type CaseGolden =
  | { result: OracleCaseResult }
  | {
      variants: {
        caseInsensitive: OracleCaseResult
        caseSensitive: OracleCaseResult
      }
    }

async function computeAll(
  caseSensitiveVolume: boolean
): Promise<Record<string, CaseGolden>> {
  const names = readdirSync(join(FIXTURES, 'cases')).sort()
  const cases: Record<string, CaseGolden> = {}
  for (const name of names) {
    const dir = join(FIXTURES, 'cases', name)
    if (name === 'multi-depot-collision') {
      // The caseSensitive variant is only meaningful on a case-sensitive
      // volume (a case-insensitive one turns Data/ and data/ into one
      // directory and the run records real write failures instead).
      const variants = {
        caseInsensitive: await runTsOracle(dir, { caseInsensitive: true })
      } as {
        caseInsensitive: OracleCaseResult
        caseSensitive: OracleCaseResult
      }
      if (caseSensitiveVolume) {
        variants.caseSensitive = await runTsOracle(dir, {
          caseInsensitive: false
        })
      }
      cases[name] = { variants }
    } else {
      cases[name] = { result: await runTsOracle(dir) }
    }
  }
  return cases
}

describe('depot TS oracle goldens', () => {
  it('TS pipeline equals expected.json', async () => {
    const caseSensitiveVolume = await oracleVolumeIsCaseSensitive()
    const writing = process.env.GAMELIB_WRITE_DEPOT_GOLDENS === '1'
    if (writing && !caseSensitiveVolume) {
      throw new Error(
        'Regenerating goldens needs a case-sensitive volume for the collision ' +
          'caseSensitive variant: set GAMELIB_DEPOT_ORACLE_TMP to a directory on one ' +
          '(macOS: hdiutil create -size 20m -fs "Case-sensitive APFS" -type SPARSE).'
      )
    }
    const cases = await computeAll(caseSensitiveVolume)
    expect(Object.keys(cases).length).toBeGreaterThanOrEqual(7)

    if (writing) {
      const doc = {
        generator:
          'src/backend/storeManagers/steam/__tests__/depotGolden.test.ts (TS oracle, deleted after parity)',
        note: 'Modes recorded on macOS (st_mode & 0o7777, files only); Windows compares the ReadOnly attribute instead of modes. Paths are relative to a temp root and /-joined. The ACF LastUpdated value is normalised.',
        cases
      }
      writeFileSync(EXPECTED, JSON.stringify(doc, null, 2) + '\n')
      return
    }

    const committed = JSON.parse(readFileSync(EXPECTED, 'utf8')) as {
      cases: Record<string, CaseGolden>
    }
    // On a case-insensitive host the caseSensitive variant is not computable;
    // everything else is compared in full.
    const expected = JSON.parse(JSON.stringify(committed.cases)) as Record<
      string,
      CaseGolden
    >
    if (!caseSensitiveVolume) {
      const v = expected['multi-depot-collision']
      if (v && 'variants' in v) {
        expect(Object.keys(v.variants)).toContain('caseSensitive')
        delete (v.variants as Partial<typeof v.variants>).caseSensitive
      }
    }
    expect(cases).toEqual(expected)
  }, 120_000)
})
