/** RED stub: replaced by the real generator in the GREEN commit. */
export type Axes = Record<string, readonly (string | number | boolean)[]>
export type Row = Record<string, string | number | boolean>

export function allPairs(
  _axes: Axes,
  _feasible?: (row: Row) => boolean
): Row[] {
  return []
}

export function uncoveredPairs(
  _axes: Axes,
  _rows: readonly Row[],
  _feasible?: (row: Row) => boolean
): string[] {
  return []
}
