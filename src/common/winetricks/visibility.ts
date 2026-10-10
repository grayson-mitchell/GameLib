// Phase 45, plan 04. STUB -- intentionally inert pending RED evidence.
// Pure, dependency-free D-09 visibility predicate.

export const HIDDEN_CATEGORIES: ReadonlySet<string> = new Set()

export const HIDDEN_VERBS: ReadonlySet<string> = new Set()

export function isVisibleVerb(_catalogEntry: {
  verb: string
  category: string
  needsGui?: boolean
}): boolean {
  return true
}

export function filterVisibleCatalog<
  T extends { verb: string; category: string; needsGui?: boolean }
>(catalog: readonly T[]): T[] {
  return [...catalog]
}
