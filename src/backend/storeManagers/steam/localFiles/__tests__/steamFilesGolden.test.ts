import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { captureAcfUpdate } from './oracle/acfUpdateOracle'
import { captureAdoption } from './oracle/adoptionOracle'
import { captureBridge } from './oracle/bridgeOracle'
import { captureInstalldir } from './oracle/installdirOracle'
import { captureLibrary } from './oracle/libraryOracle'
import { captureRaw } from './oracle/rawOracle'
import { captureShortcuts } from './oracle/shortcutsOracle'

const EXPECTED = join(
  resolve(__dirname, '../../../../../..'),
  'src-tauri/crates/gamelib-steamfiles/tests/fixtures/expected.json'
)
const WRITE = process.env.GAMELIB_WRITE_STEAMFILES_GOLDENS === '1'
const AREAS = [
  'raw',
  'library',
  'installdir',
  'acfUpdate',
  'adoption',
  'bridge',
  'shortcuts'
]

type Golden = {
  generator: string
  note: string
  cases: Record<string, { oracle: unknown; [k: string]: unknown }>
}

describe('steamfiles TS oracle golden (Tier 1)', () => {
  const saved = {
    text: process.env.GAMELIB_STEAMFILES_TEXT,
    shortcuts: process.env.GAMELIB_STEAMFILES_SHORTCUTS
  }
  beforeAll(() => {
    // Later plans add D-08 flags and flip their defaults; the oracle must
    // keep exercising the TS branch.
    process.env.GAMELIB_STEAMFILES_TEXT = 'ts'
    process.env.GAMELIB_STEAMFILES_SHORTCUTS = 'ts'
  })
  afterAll(() => {
    for (const [k, v] of [
      ['GAMELIB_STEAMFILES_TEXT', saved.text],
      ['GAMELIB_STEAMFILES_SHORTCUTS', saved.shortcuts]
    ] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  test('TS readers equal the committed goldens', async () => {
    const captured: Record<string, unknown> = {
      ...(await captureRaw()),
      ...(await captureLibrary()),
      ...(await captureInstalldir()),
      ...(await captureAcfUpdate()),
      ...(await captureAdoption()),
      ...(await captureBridge()),
      ...(await captureShortcuts())
    }
    // Round-trip through JSON so the comparison sees what the file stores.
    const fresh = JSON.parse(JSON.stringify(captured)) as Record<
      string,
      unknown
    >

    if (WRITE) {
      const prior: Golden | undefined = existsSync(EXPECTED)
        ? (JSON.parse(readFileSync(EXPECTED, 'utf-8')) as Golden)
        : undefined
      const cases: Golden['cases'] = {}
      for (const key of Object.keys(fresh).sort()) {
        const { oracle: _old, ...kept } = prior?.cases[key] ?? { oracle: null }
        cases[key] = { oracle: fresh[key], ...kept }
      }
      const out: Golden = {
        generator:
          'src/backend/storeManagers/steam/localFiles/__tests__/steamFilesGolden.test.ts (TS oracle; captured before any reader changed)',
        note: 'oracle values are never edited; a Rust divergence is a per-case rustOverride with a mandatory divergenceNote (D-07)',
        cases
      }
      writeFileSync(EXPECTED, `${JSON.stringify(out, null, 2)}\n`)
    }

    const golden = JSON.parse(readFileSync(EXPECTED, 'utf-8')) as Golden
    expect(Object.keys(fresh).sort()).toEqual(Object.keys(golden.cases).sort())
    for (const key of Object.keys(fresh)) {
      expect({ key, oracle: fresh[key] }).toEqual({
        key,
        oracle: golden.cases[key]?.oracle
      })
    }

    const keys = Object.keys(fresh)
    expect(keys.length).toBeGreaterThanOrEqual(80)
    for (const area of AREAS) {
      expect(keys.some((k) => k.startsWith(`${area}/`))).toBe(true)
    }
  })
})
