/**
 * Narrows an indexed-access test value, throwing loudly instead of letting a
 * missing element pass vacuously under `?.` (noUncheckedIndexedAccess).
 */
export function defined<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`expected ${what} to be defined`)
  }
  return value
}
