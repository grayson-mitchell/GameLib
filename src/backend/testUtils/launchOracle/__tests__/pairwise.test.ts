/**
 * Self-tests for the in-repo pairwise generator (88-04, D-14). The generator is only worth having
 * if it cannot claim coverage it does not have, so the proof function is tested against a row set
 * with a pair deliberately planted missing.
 */
import { allPairs, uncoveredPairs, type Axes, type Row } from '../pairwise'

const THREE: Axes = { a: [1, 2], b: ['x', 'y'], c: [true, false] }

/** Every value pair across `axes`, in the `uncoveredPairs` spelling. */
function everyPair(axes: Axes): string[] {
  const entries = Object.entries(axes)
  const out: string[] = []
  for (const [i, [nameA, valuesA]] of entries.entries()) {
    for (const [nameB, valuesB] of entries.slice(i + 1)) {
      for (const v of valuesA) {
        for (const w of valuesB) {
          out.push(`${nameA}=${String(v)}|${nameB}=${String(w)}`)
        }
      }
    }
  }
  return out
}

function pairsOf(rows: readonly Row[], axes: Axes): Set<string> {
  const names = Object.keys(axes)
  const seen = new Set<string>()
  for (const row of rows) {
    for (const [i, nameA] of names.entries()) {
      for (const nameB of names.slice(i + 1)) {
        seen.add(
          `${nameA}=${String(row[nameA])}|${nameB}=${String(row[nameB])}`
        )
      }
    }
  }
  return seen
}

describe('allPairs', () => {
  it('covers all 12 value pairs of three two-valued axes', () => {
    const rows = allPairs(THREE)
    expect(everyPair(THREE)).toHaveLength(12)
    const seen = pairsOf(rows, THREE)
    for (const pair of everyPair(THREE)) expect(seen.has(pair)).toBe(true)
    expect(rows.length).toBeGreaterThanOrEqual(4)
    expect(rows.length).toBeLessThan(8)
  })

  it('is deterministic: two calls return identical rows in identical order', () => {
    expect(allPairs(THREE)).toEqual(allPairs(THREE))
    expect(allPairs(THREE).length).toBeGreaterThan(0)
  })

  it('uses fewer rows than the full product once there are enough axes', () => {
    const wide: Axes = {
      os: ['mac', 'linux', 'windows'],
      engine: ['crossover', 'wine', 'native'],
      arch: ['arm64', 'x64', 'x86'],
      overlay: ['on', 'off', 'auto']
    }
    const rows = allPairs(wide)
    expect(rows.length).toBeGreaterThanOrEqual(9)
    expect(rows.length).toBeLessThan(81)
    expect(uncoveredPairs(wide, rows)).toEqual([])
  })

  it('excludes illegal rows and does not demand pairs that only occur in them', () => {
    const axes: Axes = {
      os: ['mac', 'linux'],
      engine: ['crossover', 'native'],
      overlay: ['on', 'off']
    }
    const feasible = (row: Row): boolean =>
      !(row.os === 'linux' && row.engine === 'crossover')
    const rows = allPairs(axes, feasible)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(feasible(row)).toBe(true)
    const seen = pairsOf(rows, axes)
    expect(seen.has('os=linux|engine=crossover')).toBe(false)
    expect(seen.has('os=mac|engine=crossover')).toBe(true)
    expect(seen.has('os=linux|engine=native')).toBe(true)
    expect(uncoveredPairs(axes, rows, feasible)).toEqual([])
  })

  it('throws on empty axes or an axis with no values', () => {
    expect(() => allPairs({})).toThrow(/axes/)
    expect(() => allPairs({ a: [1, 2], b: [] })).toThrow(/b/)
  })
})

describe('uncoveredPairs', () => {
  it('returns [] for the generator output', () => {
    expect(uncoveredPairs(THREE, allPairs(THREE))).toEqual([])
    expect(allPairs(THREE).length).toBeGreaterThan(0)
  })

  it('reports exactly the pair a planted gap removed (self-test)', () => {
    const axes: Axes = { a: [1, 2], b: ['x', 'y'] }
    const full: Row[] = [
      { a: 1, b: 'x' },
      { a: 1, b: 'y' },
      { a: 2, b: 'x' },
      { a: 2, b: 'y' }
    ]
    expect(uncoveredPairs(axes, full)).toEqual([])
    const planted = full.filter((row) => !(row.a === 2 && row.b === 'y'))
    expect(uncoveredPairs(axes, planted)).toEqual(['a=2|b=y'])
  })

  it('reports at least one pair when a row is dropped from the generator output', () => {
    const rows = allPairs(THREE)
    expect(rows.length).toBeGreaterThan(0)
    expect(uncoveredPairs(THREE, rows.slice(1)).length).toBeGreaterThan(0)
  })

  it('does not demand a pair that no feasible row can contain', () => {
    const axes: Axes = { a: [1, 2], b: ['x', 'y'] }
    const feasible = (row: Row): boolean => !(row.a === 2 && row.b === 'y')
    const rows: Row[] = [
      { a: 1, b: 'x' },
      { a: 1, b: 'y' },
      { a: 2, b: 'x' }
    ]
    expect(uncoveredPairs(axes, rows, feasible)).toEqual([])
  })

  it('throws on empty axes', () => {
    expect(() => uncoveredPairs({}, [])).toThrow(/axes/)
  })
})
