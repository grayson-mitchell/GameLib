// Phase 45, plan 04. Pure, dependency-free D-09 visibility predicate.
// No React, no electron, no fs, no logger, no process spawning -- this
// module only ever receives plain catalog data (verb/category/needsGui).

// The `apps` and `benchmarks` categories exist only on winetricks' screen 1
// (install-an-application / install-a-benchmark), never on the per-game
// settings/dlls/fonts menus this tab builds -- hide both wholesale (D-09).
export const HIDDEN_CATEGORIES: ReadonlySet<string> = new Set([
  'apps',
  'benchmarks'
])

// The interactive launcher verbs upstream seats as peers on its own
// 13-row screen-2 `--radiolist` (ROADMAP.md Phase 45: `dlls fonts settings
// winecfg regedit taskmgr explorer uninstaller winecmd wine_misc_exe shell
// folder annihilate`), minus the three category names themselves. A
// bottle-wiper (`annihilate`) one search away from a novice is the exact
// failure mode D-09 exists to prevent (D-09).
export const HIDDEN_VERBS: ReadonlySet<string> = new Set([
  'annihilate',
  'winecfg',
  'regedit',
  'taskmgr',
  'explorer',
  'uninstaller',
  'winecmd',
  'wine_misc_exe',
  'shell',
  'folder'
])

/**
 * D-09's visibility rule: hide `HIDDEN_CATEGORIES`, `HIDDEN_VERBS`, and any
 * verb the D-17 needs-GUI derivation flagged (`needsGui: true`). Everything
 * else -- including install-shaped settings verbs (`fontsmooth=*`,
 * `csmt=*`, `vd=*`, ...) and the `bad`/`good` settings test verbs, neither
 * of which D-09 names -- stays visible.
 */
export function isVisibleVerb(catalogEntry: {
  verb: string
  category: string
  needsGui?: boolean
}): boolean {
  if (HIDDEN_CATEGORIES.has(catalogEntry.category)) {
    return false
  }
  if (HIDDEN_VERBS.has(catalogEntry.verb)) {
    return false
  }
  if (catalogEntry.needsGui === true) {
    return false
  }
  return true
}

/**
 * Order-preserving filter over `catalog`. Returns the same element objects
 * (never copies or mutates them) for every entry `isVisibleVerb` keeps.
 */
export function filterVisibleCatalog<
  T extends { verb: string; category: string; needsGui?: boolean }
>(catalog: readonly T[]): T[] {
  return catalog.filter((entry) => isVisibleVerb(entry))
}
