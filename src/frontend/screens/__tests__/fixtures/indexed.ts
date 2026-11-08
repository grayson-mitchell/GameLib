/**
 * Throwing narrowing helpers for component tests under
 * noUncheckedIndexedAccess. A missing element fails the test loudly instead
 * of being asserted away with `!` or a widening cast.
 */
export function defined<T>(value: T | undefined, what = 'value'): T {
  if (value === undefined) throw new Error(`${what} is undefined`)
  return value
}

export function at<T>(xs: readonly T[], index: number): T {
  const i = index < 0 ? xs.length + index : index
  if (i < 0 || i >= xs.length) {
    throw new Error(`index ${index} out of range (length ${xs.length})`)
  }
  return defined(xs[i], `element ${index}`)
}
