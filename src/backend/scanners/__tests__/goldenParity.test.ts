/**
 * Phase 63-03 (D-12) tier 1: the TS oracle must equal the committed goldens.
 * `scan_steam_api_imports` replays the captured Apple-objdump output, so this
 * runs on the ubuntu Jest lane with no objdump and no Rust toolchain.
 * `scan_contained_real` is a filesystem property, covered by tempfile tests.
 */
import { readFileSync } from 'fs'
import { join, relative } from 'path'

import { normalizeScanResult } from '../scanNormalize'
import { runLegacyOp } from '../legacyTsScanners'
import { SCAN_OPS, type ScanOp } from '../scanTypes'

const FIXTURES = join(
  __dirname,
  '../../../../src-tauri/crates/gamelib-scan/tests/fixtures'
)

type Golden = {
  name: string
  file?: string
  bundle?: string
  ops: Record<string, unknown>
  objdumpCaptures?: Record<string, { code: number | null; stdout: string }>
  rustOverride?: unknown
  divergenceNote?: string
}

const expected = JSON.parse(
  readFileSync(join(FIXTURES, 'expected.json'), 'utf8')
) as { version: number; cases: Golden[] }

function argsFor(op: ScanOp, c: Golden): unknown {
  if (c.bundle !== undefined) {
    return { wineBundlePath: join(FIXTURES, c.bundle) }
  }
  const exePath = join(FIXTURES, c.file as string)
  return op === 'scan_steam_api_imports'
    ? { exePath, appId: '480' }
    : { exePath }
}

describe('TS oracle equals the committed goldens (D-12 tier 1)', () => {
  const rows = expected.cases.flatMap((c) =>
    Object.keys(c.ops).map((op) => [c.name, op, c] as const)
  )

  it.each(rows)('%s / %s', async (_name, op, c) => {
    const captures = c.objdumpCaptures ?? {}
    const r = await runLegacyOp(
      op as ScanOp,
      argsFor(op as ScanOp, c) as never,
      {
        runObjdump: async (p) => {
          const key = relative(FIXTURES, p).split('\\').join('/')
          const hit = captures[key]
          if (!hit) throw new Error(`no recorded objdump output for ${key}`)
          return {
            code: hit.code,
            stdout: hit.stdout.split('${FIXTURES}').join(FIXTURES)
          }
        }
      }
    )
    expect(normalizeScanResult(op as ScanOp, r, FIXTURES)).toEqual(c.ops[op])
  })

  it('is not vacuous', () => {
    expect(expected.cases.length).toBeGreaterThanOrEqual(40)
    const closures = expected.cases.filter(
      (c) =>
        c.name.startsWith('closure-') &&
        Object.keys(c.objdumpCaptures ?? {}).length >= 2
    )
    expect(closures.length).toBeGreaterThanOrEqual(4)
    const seen = new Set(expected.cases.flatMap((c) => Object.keys(c.ops)))
    for (const op of SCAN_OPS.filter((o) => o !== 'scan_contained_real')) {
      expect(seen.has(op)).toBe(true)
    }
  })

  it('records any Rust divergence only as an explicit override with a note', () => {
    for (const c of expected.cases) {
      if (c.rustOverride !== undefined) {
        expect(typeof c.divergenceNote).toBe('string')
      }
    }
  })
})
