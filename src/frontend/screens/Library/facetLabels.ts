/**
 * The single declaration site for the Games tier-2 filter panel's store
 * brand names and runnability tier labels (34.11 Plan 04).
 *
 * Two later plans need the same text: plan 07's `FilterStoreFacet` /
 * `FilterRunnabilityFacet` render these as facet rows in the panel, and
 * plan 08's `chipLabels.ts` renders the same values as chips above the
 * grid. Adding a second copy of either map anywhere else is the defect
 * this module exists to prevent -- two copies would eventually print a
 * chip that disagrees with the panel row it mirrors.
 *
 * Purity constraint: no `react`, no `react-i18next`, no `.scss`/`.css`
 * import, no `useContext`. Consumers call `t()`/`tGamelib()` on the
 * strings/tuples exported here themselves.
 */

import type { RunnabilityTier } from 'frontend/types'

// Copied verbatim from `components/UI/LibraryFilters/index.tsx` (including
// the explanatory comment) rather than re-exported: plan 09 deletes that
// whole component, so a re-export would break the build one plan later.
// 'sideload' deliberately has no entry here -- its label is handled by the
// gamelib:library.storeOther special-case, before this map is ever
// consulted, so no dead 'Other' string literal remains for the i18n gate to
// (correctly) flag on this object.
export const RunnerToStore: Record<string, string> = {
  legendary: 'Epic Games',
  gog: 'GOG',
  nile: 'Amazon Games',
  zoom: 'ZOOM Platform',
  steam: 'Steam'
}

// These four keys are MINTED by plan 07, which is the plan that runs the
// localisation gate for them -- this module only declares the tuples.
export const RUNNABILITY_LABELS: Record<RunnabilityTier, [string, string]> = {
  native: ['gamelib:library.filterPanel.runsNatively', 'Runs natively'],
  bottle: ['gamelib:library.filterPanel.runsViaBottle', 'Runs via bottle'],
  wontRun: ['gamelib:library.filterPanel.wontRun', "Won't run"],
  notChecked: ['gamelib:library.filterPanel.notYetChecked', 'Not yet checked']
}
