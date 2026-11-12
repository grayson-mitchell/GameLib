/**
 * Zero-tolerance module-state census (66.4, D-66.4-02, D-13, D-16). This used to be a shrink-only
 * ceiling in meta/backendDiCeilings; it is now a test: no non-test src/backend file may hold a
 * top-level mutable binding (the D-06 census) except the sanctioned sites below. Zero jest.mock.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The cjs is a node script; there is no ESM form to import.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ceilings = require('../../../meta/backendDiCeilings.cjs') as {
  census: (root?: string) => {
    moduleState: Record<string, number>
    backendFiles: number
  }
  listModuleStateSites: (root?: string) => {
    file: string
    line: number
    symbol: string
    kind: string
  }[]
  containerCallResidual: () => string[]
}

/**
 * Exact per-file counts. Editing this object is a reviewed decision (D-66.4-02); the list itself
 * was fixed by D-66.4-01: the runner holds none, the logger keeps its writer and sink state, the
 * boot entry keeps its one-shot latch. Growth in a listed file fails the same as a new file.
 */
const SANCTIONED: Readonly<Record<string, number>> = Object.freeze({
  'src/backend/process/runner.ts': 0,
  'src/backend/logger/index.ts': 2,
  'src/backend/sidecar/bootstrap.ts': 1
})

/** Pure: every way `found` (file -> site count) departs from `sanctioned`. */
function violations(
  found: Record<string, number>,
  sanctioned: Readonly<Record<string, number>>
): string[] {
  const out: string[] = []
  for (const file of Object.keys(found).sort()) {
    const n = found[file] ?? 0
    const allowed = sanctioned[file]
    if (allowed === undefined)
      out.push(`${file}: ${n} site(s), not a sanctioned file`)
    else if (n > allowed)
      out.push(`${file}: ${n} sites > sanctioned ${allowed}`)
  }
  for (const file of Object.keys(sanctioned).sort()) {
    const want = sanctioned[file] ?? 0
    if (want > 0 && (found[file] ?? 0) < want)
      out.push(
        `${file}: ${found[file] ?? 0} sites < sanctioned ${want} (lower SANCTIONED in this commit)`
      )
  }
  return out
}

describe('module-state census is zero outside the sanctioned list (D-66.4-02)', () => {
  const current = ceilings.census()

  it('scans a rooted backend tree (floor)', () => {
    expect(current.backendFiles).toBeGreaterThanOrEqual(445)
  })

  it('has no site outside SANCTIONED and exactly the sanctioned counts', () => {
    const bad = violations(current.moduleState, SANCTIONED)
    if (bad.length > 0) {
      const rows = ceilings
        .listModuleStateSites()
        .filter((r) => bad.some((b) => b.startsWith(`${r.file}:`)))
        .map((r) => `${r.file}:${r.line} ${r.symbol} ${r.kind}`)
      throw new Error(`${bad.join('\n')}\nsites:\n${rows.join('\n')}`)
    }
    expect(current.moduleState).toEqual({
      'src/backend/logger/index.ts': 2,
      'src/backend/sidecar/bootstrap.ts': 1
    })
  })

  it('has no top-level container-returning call residual', () => {
    expect(ceilings.containerCallResidual()).toEqual([])
  })

  it('violations() fires on a stray file and on growth in a sanctioned file', () => {
    expect(
      violations(
        { 'src/backend/x.ts': 1, 'src/backend/logger/index.ts': 3 },
        SANCTIONED
      )
    ).toEqual([
      expect.stringContaining(
        'src/backend/logger/index.ts: 3 sites > sanctioned 2'
      ),
      expect.stringContaining(
        'src/backend/x.ts: 1 site(s), not a sanctioned file'
      ),
      expect.stringContaining(
        'src/backend/sidecar/bootstrap.ts: 0 sites < sanctioned 1'
      )
    ])
    expect(
      violations(
        {
          'src/backend/logger/index.ts': 2,
          'src/backend/sidecar/bootstrap.ts': 1
        },
        SANCTIONED
      )
    ).toEqual([])
  })

  it('the census itself finds a seeded fixture site (the gate is not vacuous)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ms-census-'))
    try {
      mkdirSync(join(dir, 'src', 'backend'), { recursive: true })
      writeFileSync(
        join(dir, 'src', 'backend', 'seeded.ts'),
        'let counter = 0\nexport const bump = () => ++counter\n'
      )
      const seeded = ceilings.census(dir)
      expect(seeded.moduleState).toEqual({ 'src/backend/seeded.ts': 1 })
      expect(violations(seeded.moduleState, SANCTIONED)).toContainEqual(
        expect.stringContaining('src/backend/seeded.ts: 1 site(s)')
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
