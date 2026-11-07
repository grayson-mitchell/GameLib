/**
 * Throwing narrowers for indexed reads under `noUncheckedIndexedAccess`.
 * A missing element fails the test loudly instead of being read as `undefined`.
 */

export function defined<T>(value: T | null | undefined, label: string): T {
  if (value === undefined || value === null) {
    throw new Error(`expected ${label} to be defined`)
  }
  return value
}

export function at<T>(arr: ArrayLike<T>, i: number, label = 'element'): T {
  return defined(arr[i], `${label}[${i}] (length ${arr.length})`)
}

/** Capture group `n` of a regex match; a null match or unmatched group fails loudly. */
export function group(
  match: RegExpMatchArray | null,
  n: number,
  label = 'match'
): string {
  return at(defined(match, `${label} (no regex match)`), n, `${label} group`)
}
