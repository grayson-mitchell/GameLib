/**
 * An in-repo all-pairs generator for the Phase 88 launch matrix (88-04, D-14).
 *
 * D-14 asks for three kinds of coverage: every value of every axis, every legal pair of values
 * across two axes, and the named incident scenarios (see `census.ts`). This file is the middle
 * one. RESEARCH rejected an npm package for it, so it is a short greedy generator with no
 * randomness: the same axes always give the same rows in the same order.
 *
 * A pair is LEGAL when some feasible full row contains it. A pair that only occurs in rows the
 * `feasible` predicate rejects (for example `os=linux` with `engine=crossover`) is not demanded.
 * `uncoveredPairs` is the proof: it lists the legal pairs a row set misses, so a generator, or a
 * hand-edited row list, cannot claim coverage it does not have. The self-test plants a row set
 * with one pair removed and sees that pair reported.
 *
 * Pair spelling: `"<axisA>=<v>|<axisB>=<w>"`, axisA before axisB in axis-key order. Values are
 * printed with `String()`, so `1` and `'1'` on one axis would collide; keep an axis to one type. A single axis has no pairs, so it yields no rows; the
 * per-axis coverage of D-14 is the caller's own case list.
 */

type AxisValue = string | number | boolean
export type Axes = Record<string, readonly AxisValue[]>
export type Row = Record<string, AxisValue>

/** The axes as ordered `[name, values]` entries, after the empty checks. */
function checkAxes(axes: Axes): [string, readonly AxisValue[]][] {
  const entries = Object.entries(axes)
  if (entries.length === 0) {
    throw new Error('pairwise: axes is empty; there is nothing to cover')
  }
  for (const [name, values] of entries) {
    if (values.length === 0) {
      throw new Error(`pairwise: axis "${name}" has no values`)
    }
  }
  return entries
}

/** The pair keys a row (its values, in axis order) contains. */
function rowPairs(
  names: readonly string[],
  values: readonly AxisValue[]
): string[] {
  const out: string[] = []
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      out.push(
        `${String(names[i])}=${String(values[i])}|${String(names[j])}=${String(values[j])}`
      )
    }
  }
  return out
}

const toRow = (names: readonly string[], values: readonly AxisValue[]): Row =>
  Object.fromEntries(names.map((name, i) => [name, values[i] as AxisValue]))

/** Every full row (its values in axis order) the predicate accepts, first axis varying slowest. */
function feasibleRows(
  entries: readonly (readonly [string, readonly AxisValue[]])[],
  feasible: ((row: Row) => boolean) | undefined
): AxisValue[][] {
  const names = entries.map(([name]) => name)
  const rows: AxisValue[][] = []
  const walk = (index: number, partial: AxisValue[]): void => {
    const entry = entries[index]
    if (entry === undefined) {
      if (!feasible || feasible(toRow(names, partial))) rows.push(partial)
      return
    }
    for (const value of entry[1]) walk(index + 1, [...partial, value])
  }
  walk(0, [])
  return rows
}

/**
 * A deterministic row set covering every legal value pair across `axes`. Each new row is the
 * candidate (in axis and value order) that covers the most still-uncovered legal pairs; the
 * first such candidate wins a tie.
 */
export function allPairs(axes: Axes, feasible?: (row: Row) => boolean): Row[] {
  const entries = checkAxes(axes)
  const names = entries.map(([name]) => name)
  const candidates = feasibleRows(entries, feasible)
  const candidatePairs = candidates.map((values) => rowPairs(names, values))
  const uncovered = new Set<string>(candidatePairs.flat())
  const chosen: Row[] = []
  while (uncovered.size > 0) {
    let best = -1
    let bestGain = 0
    for (const [index, pairs] of candidatePairs.entries()) {
      let gain = 0
      for (const pair of pairs) if (uncovered.has(pair)) gain++
      if (gain > bestGain) {
        best = index
        bestGain = gain
      }
    }
    // Every uncovered pair came from some candidate, so a gain of at least one always exists.
    const pairs = candidatePairs[best] ?? []
    for (const pair of pairs) uncovered.delete(pair)
    chosen.push(toRow(names, candidates[best] ?? []))
  }
  return chosen
}

/**
 * The legal pairs `rows` does not contain, in the order a feasible row first holds them. `[]`
 * means every legal pair is covered.
 */
export function uncoveredPairs(
  axes: Axes,
  rows: readonly Row[],
  feasible?: (row: Row) => boolean
): string[] {
  const entries = checkAxes(axes)
  const names = entries.map(([name]) => name)
  const legal = new Set<string>(
    feasibleRows(entries, feasible).flatMap((values) => rowPairs(names, values))
  )
  const seen = new Set<string>(
    rows.flatMap((row) =>
      rowPairs(
        names,
        names.map((name) => row[name] as AxisValue)
      )
    )
  )
  return [...legal].filter((pair) => !seen.has(pair))
}
