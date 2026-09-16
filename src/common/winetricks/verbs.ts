import type { WinetricksComponent } from 'common/types'

// Phase 44, plan 01. Pure, dependency-free constants + resolver backing the
// Winetricks Browse UI's "Curated" shortcut group and its Needs-GUI routing.
// Mirrors `src/common/humble/viewFilters.ts`'s shape: no React, no i18n, no
// I/O -- unit-testable from both the Common and Backend jest projects.

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

// ROADMAP Phase 44 scope fence 3 / UI-SPEC `C-4`: these 8 verbs are the
// complete set winetricks cannot install unattended under `-q` -- they pop a
// zenity GUI and hang (or fail silently) instead of completing. Every row
// for one of these verbs must never show an Install button in any state; it
// is routed to the GUI launch affordance instead. See
// `deriveRowState.ts`'s unconditional first-precedence branch.
const NEEDS_GUI_VERBS_LIST = [
  '3dmark03',
  '3dmark06',
  'fontxplorer',
  'foobar2000',
  'stalker_pripyat_bench',
  'ubisoftconnect',
  'unigine_heaven',
  'utorrent'
] as const

export const NEEDS_GUI_WINETRICKS_VERBS: ReadonlySet<string> = new Set(
  NEEDS_GUI_VERBS_LIST
)

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
  const resolved: WinetricksComponent[] = []
  for (const verb of CURATED_WINETRICKS_VERBS) {
    const match = all.find((component) => component.verb === verb)
    if (match) {
      resolved.push(match)
    }
  }
  return resolved
}
