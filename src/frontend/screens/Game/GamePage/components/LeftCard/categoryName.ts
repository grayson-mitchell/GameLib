/**
 * Phase 100 (D-08, D-09): the pure rules behind the left card's "New
 * category…" field, kept import-free so they are tested without mocks.
 *
 * `addCategory` (libraryState.setCustomCategory) REPLACES the named category's
 * game list with [], so calling it with an existing name wipes that category's
 * games. `validateNewCategoryName` is the guard that makes that unreachable:
 * the same trim-then-exact-match rule CategorySettings' submit button uses.
 */

export type NewCategoryResult =
  | { ok: true; name: string }
  | { ok: false; reason: 'empty' | 'exists' }

export function validateNewCategoryName(
  raw: string,
  existing: string[]
): NewCategoryResult {
  const name = raw.trim()
  if (name.length === 0) return { ok: false, reason: 'empty' }
  if (existing.includes(name)) return { ok: false, reason: 'exists' }
  return { ok: true, name }
}

/** The `${appName}_${runner}` key the custom-category lists are keyed by. */
export function categoryKeyFor(appName: string, runner: string): string {
  return `${appName}_${runner}`
}

/** The category names, in the given order, whose game list includes `key`. */
export function assignedCategories(
  list: Record<string, string[] | undefined>,
  names: string[],
  key: string
): string[] {
  return names.filter((name) => list[name]?.includes(key))
}
