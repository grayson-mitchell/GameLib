import type { WinetricksComponent } from 'common/types'

// Phase 44 plan 01 introduced the curated shortcut and its resolver; Phase 45
// plan 05 extends this module with the novice-first taxonomy the three-tier tab
// renders: task groups (D-05/D-07), family descriptions (D-08), the suggestion
// resolver (D-06) and a display-title cleanup. Pure and dependency-free: no
// React, no i18n, no I/O -- unit-testable from both the Common and Backend jest
// projects. Mirrors `src/common/humble/viewFilters.ts`'s shape.
//
// The hand-written list of verbs that cannot install unattended was retired
// here (D-17): the set is now derived from the script's own download-by-hand
// call sites (`metadata.ts`) and arrives on each catalog entry as `needsGui`.

// D-01 / "decision #3": exactly 8 verbs, HAND-MAINTAINED, in this exact
// order. Deliberately NOT derived from `cached` or `installed` state -- a
// state-derived group is empty on a fresh bottle, which is exactly when a
// curated shortcut is most needed. The UI-SPEC's provisional 12 also
// included the older `vcrun2005`/`vcrun2008`/`vcrun2012` and `dotnet6`;
// those four were deliberately DROPPED here because 12 rows turns the
// open-by-default curated group into a scroll region of its own. Do not
// re-add them without revisiting that decision.
export const CURATED_WINETRICKS_VERBS = [
  'vcrun2019',
  'vcrun2013',
  'vcrun2010',
  'dotnet48',
  'd3dx9',
  'xact',
  'corefonts',
  'physx'
] as const

// D-05: the task groups the tab leads with, in render order. These are NOT
// upstream's raw categories (dlls/fonts/settings) -- a group is a hand-picked
// shortcut a novice recognises by purpose.
export const TASK_GROUP_IDS = [
  'runtimes',
  'directx',
  'fonts',
  'media',
  'wineSettings'
] as const

export type WinetricksTaskGroupId = (typeof TASK_GROUP_IDS)[number]

// D-07: HAND-MAINTAINED membership, in render order. Deliberately NOT derived
// from `category` or from cached/installed state. Every member must exist in
// the pinned script, be visible, not be a needs-GUI verb, and carry a family
// of the same group; `__tests__/verbs.test.ts` pins all four against the
// committed script excerpt, so a renamed or dropped upstream verb turns that
// test red instead of silently shrinking a group. A group is a shortcut VIEW:
// its members also stay in the catalog the "Everything else" tier renders.
export const TASK_GROUP_MEMBERS: Readonly<
  Record<WinetricksTaskGroupId, readonly string[]>
> = {
  runtimes: [
    'vcrun2022',
    'vcrun2019',
    'vcrun2013',
    'vcrun2012',
    'vcrun2010',
    'vcrun2008',
    'dotnet48',
    'dotnet40',
    'vb6run'
  ],
  directx: [
    'd3dx9',
    'd3dx10',
    'd3dx11_43',
    'd3dcompiler_43',
    'd3dcompiler_47',
    'dxvk',
    'physx',
    'xact',
    'xinput'
  ],
  fonts: ['corefonts', 'tahoma', 'arial', 'times', 'cjkfonts'],
  media: ['wmp9', 'wmp10', 'wmp11', 'quartz', 'mf'],
  wineSettings: [
    'fontsmooth=rgb',
    'fontsmooth=gray',
    'fontsmooth=disable',
    'csmt=on',
    'csmt=off',
    'videomemorysize=default',
    'videomemorysize=2048',
    'vd=1024x768',
    'vd=off'
  ]
}

// D-08: the 13 verb families whose description the row shows in place of the
// raw upstream title.
export const FAMILY_KEYS = [
  'vcrun',
  'dotnet',
  'vbrun',
  'd3dx',
  'dxvk',
  'physx',
  'xactXinput',
  'fonts',
  'media',
  'fontsmooth',
  'videomemorysize',
  'csmt',
  'vd'
] as const

export type WinetricksFamilyKey = (typeof FAMILY_KEYS)[number]

// HAND-MAINTAINED family -> task group assignment (pinned by the D-07 test).
const FAMILY_GROUP: Readonly<
  Record<WinetricksFamilyKey, WinetricksTaskGroupId>
> = {
  vcrun: 'runtimes',
  dotnet: 'runtimes',
  vbrun: 'runtimes',
  d3dx: 'directx',
  dxvk: 'directx',
  physx: 'directx',
  xactXinput: 'directx',
  fonts: 'fonts',
  media: 'media',
  fontsmooth: 'wineSettings',
  videomemorysize: 'wineSettings',
  csmt: 'wineSettings',
  vd: 'wineSettings'
}

// HAND-MAINTAINED verb-prefix table for every family except `fonts`, which is
// keyed on the `fonts` category instead. First match wins. `dxvk` is anchored
// so it does NOT swallow the separate `dxvk_nvapi*` verbs; `mf` is anchored so
// it does not swallow `mfc42` and friends.
const FAMILY_PATTERNS: ReadonlyArray<
  readonly [Exclude<WinetricksFamilyKey, 'fonts'>, RegExp]
> = [
  ['vcrun', /^vcrun/],
  ['dotnet', /^dotnet\d/],
  ['vbrun', /^vb\d+run$/],
  ['d3dx', /^(d3dx|d3dcompiler_)/],
  ['dxvk', /^dxvk\d*$/],
  ['physx', /^physx$/],
  ['xactXinput', /^(xact|xinput)/],
  ['media', /^(wmp\d+$|quartz|mf$)/],
  ['fontsmooth', /^fontsmooth=/],
  ['videomemorysize', /^videomemorysize=/],
  ['csmt', /^csmt=/],
  ['vd', /^vd=/]
]

/**
 * D-08's classifier. Maps a component to one of the 13 family keys by verb
 * prefix (or the `fonts` category) plus the task group that family belongs
 * to. Returns null for a verb outside every family, whose row falls back to
 * the cleaned upstream title.
 */
export function familyFor(c: {
  verb: string
  category: string
}): { family: WinetricksFamilyKey; group: WinetricksTaskGroupId } | null {
  if (c.category === 'fonts') {
    return { family: 'fonts', group: FAMILY_GROUP.fonts }
  }
  for (const [family, pattern] of FAMILY_PATTERNS) {
    if (pattern.test(c.verb)) {
      return { family, group: FAMILY_GROUP[family] }
    }
  }
  return null
}

// D-06: PCGamingWiki reports the Direct3D major versions a game uses; these
// are the runtime verbs each one calls for.
const DIRECT3D_VERBS: Readonly<Record<string, readonly string[]>> = {
  '9': ['d3dx9'],
  '10': ['d3dx10', 'd3dcompiler_43'],
  '11': ['d3dx11_43', 'd3dcompiler_47']
}

/**
 * Reads the leading integer of each version string (PCGamingWiki values look
 * like `9`, `9.0c`, `11`) and returns the verbs for 9/10/11, de-duplicated in
 * first-seen order. Any other version maps to nothing.
 */
export function verbsForDirect3DVersions(
  versions: readonly string[]
): string[] {
  const verbs: string[] = []
  for (const version of versions) {
    const major = /^\s*(\d+)/.exec(version)?.[1]
    for (const verb of (major && DIRECT3D_VERBS[major]) || []) {
      if (!verbs.includes(verb)) {
        verbs.push(verb)
      }
    }
  }
  return verbs
}

function resolveVerbs(
  catalog: readonly WinetricksComponent[],
  verbs: readonly string[]
): WinetricksComponent[] {
  const resolved: WinetricksComponent[] = []
  for (const verb of verbs) {
    const match = catalog.find((component) => component.verb === verb)
    if (match) {
      resolved.push(match)
    }
  }
  return resolved
}

/**
 * D-03's resolver. For each verb in `CURATED_WINETRICKS_VERBS`, in curated
 * order (D-14 forbids re-sorting), finds the first component in `all` whose
 * `verb` matches exactly. A curated verb absent from `all` (e.g. it isn't
 * installed on this system's winetricks version) is skipped SILENTLY -- no
 * placeholder row, no disabled row, no throw. A committed backend fixture
 * (`winetricksListParse.test.ts`) asserts all 8 resolve today so drift is
 * caught by CI rather than surfacing as a silently-shrinking curated group
 * in the running app.
 *
 * Two invariants a caller relies on:
 * - Returns the SAME component objects present in `all` (no cloning), so
 *   identity-based React keys stay stable between the curated section and
 *   the verb's own category section.
 * - Does NOT filter matched verbs out of `all` / mutate `all` in any way --
 *   D-02 requires a curated verb to also appear in its own category, so the
 *   caller renders both from the same untouched source array.
 */
export function resolveCuratedComponents(
  all: readonly WinetricksComponent[]
): WinetricksComponent[] {
  return resolveVerbs(all, CURATED_WINETRICKS_VERBS)
}

/**
 * D-06's resolver for the "Suggested for this game" group. Game-specific rows
 * come first: the known-fixes verbs, then the verbs implied by the game's
 * Direct3D versions, de-duplicated. They resolve ONLY against `catalog` (the
 * visible catalog the backend returns), so a hidden or unknown verb named by
 * either source is skipped silently (T-45-14). The curated 8 follow, minus any
 * verb already shown game-specifically. With no per-game signal `gameSpecific`
 * is empty and `curated` is the full curated set, so the group is never empty
 * while the curated verbs resolve. Returns the same component objects present
 * in `catalog`.
 */
export function resolveSuggestedComponents(input: {
  catalog: readonly WinetricksComponent[]
  knownFixVerbs: readonly string[]
  direct3DVersions: readonly string[]
}): { gameSpecific: WinetricksComponent[]; curated: WinetricksComponent[] } {
  const { catalog, knownFixVerbs, direct3DVersions } = input
  const gameSpecific: WinetricksComponent[] = []
  for (const component of resolveVerbs(catalog, [
    ...knownFixVerbs,
    ...verbsForDirect3DVersions(direct3DVersions)
  ])) {
    if (!gameSpecific.includes(component)) {
      gameSpecific.push(component)
    }
  }
  const curated = resolveCuratedComponents(catalog).filter(
    (component) => !gameSpecific.includes(component)
  )
  return { gameSpecific, curated }
}

/**
 * Resolves a task group's members against `catalog`, in `TASK_GROUP_MEMBERS`
 * order, skipping silently any member the catalog lacks. Returns the SAME
 * component objects and never removes anything from `catalog` (D-07: a group
 * is a shortcut view, not a partition).
 */
export function resolveTaskGroup(
  catalog: readonly WinetricksComponent[],
  id: WinetricksTaskGroupId
): WinetricksComponent[] {
  return resolveVerbs(catalog, TASK_GROUP_MEMBERS[id])
}

// A trailing parenthesised group, closed (`(Adobe, 2019)`) or truncated by the
// upstream list output (`(concrt140.dll,mfc140.dll`). Anchored to the end and
// free of nested quantifiers.
const TRAILING_GROUP_RE = /\s*\([^()]*\)?\s*$/

/**
 * Strips ONE trailing parenthesised group from an upstream title (they carry
 * DLL lists and publisher/year). A title that is nothing but a group is kept
 * whole so the result is never empty. The caller keeps the full upstream
 * title for the native `title` tooltip.
 */
export function displayTitle(title: string): string {
  const stripped = title.replace(TRAILING_GROUP_RE, '').trim()
  return stripped === '' ? title.trim() : stripped
}
