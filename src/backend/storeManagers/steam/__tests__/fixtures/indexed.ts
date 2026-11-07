/**
 * Narrows an indexed-access test value, throwing loudly instead of letting a
 * missing element pass vacuously under `?.` (noUncheckedIndexedAccess).
 */
export function at<T>(xs: ArrayLike<T>, i: number, what = 'element'): T {
  const value = xs[i]
  if (value === undefined) {
    throw new Error(`expected ${what} at index ${i} (length ${xs.length})`)
  }
  return value
}

export function defined<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`expected ${what} to be defined`)
  }
  return value
}
