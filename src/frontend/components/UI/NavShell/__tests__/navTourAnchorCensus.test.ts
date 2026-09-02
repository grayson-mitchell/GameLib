/**
 * Layer B of the phase 34.12 Positive Gate Contract (see VALIDATION.md
 * "Positive Gate Contract") -- a repo-wide UNIQUENESS census over every
 * `data-tour` id the two rebuilt tours (`NavShellTour`, `LibraryTour`) use,
 * plus D-01's non-step launcher anchor.
 *
 * What this layer measures, and what it does NOT: Layer A (the
 * per-component assertions distributed across `NavItem.test.tsx`,
 * `SettingsPanel.test.tsx`, `NavTabsComponent.test.tsx`,
 * `DownloadsRing.test.tsx`, `libraryTourAnchors.test.tsx` and friends)
 * invokes each parent component directly and asserts a specific `nav-*` /
 * `library-*` string lands on a specific NAMED child, located by
 * `element.type` identity, not by string search. That is CORRECTNESS: it
 * proves the right value is on the right row. It cannot prove UNIQUENESS --
 * a Layer A suite for `nav-wine` has no way to know whether some unrelated
 * file elsewhere in the tree also carries `data-tour="nav-wine"` on a
 * completely different element, because it never looks outside the one
 * component it renders.
 *
 * This census is the other half. It proves UNIQUENESS -- for each id,
 * exactly one source file defines an element carrying that value -- but it
 * is source-text search, so it cannot tell whether that one occurrence
 * landed on the correct row. It would pass just as happily if all twelve
 * ids were individually correct, or if all twelve were individually wrong
 * but still each unique. Neither layer is redundant; the historical defect
 * this whole gate exists to prevent -- two different elements sharing one
 * `sidebar-downloads` selector -- is a Layer B failure Layer A alone could
 * not have caught, because Layer A never looked past the one component
 * under test.
 *
 * Element-definition files vs. tour-manifest files -- why two file lists,
 * not one: `NavShellTour/index.tsx` and `LibraryTour.tsx` each contain a
 * step list whose `element` field is a CSS selector STRING, e.g.
 * `'[data-tour="nav-wine"]'`. That string literal contains the exact
 * substring `data-tour="nav-wine"` -- textually indistinguishable, to a
 * source-text search, from the JSX attribute on `SettingsPanel`'s Wine
 * Manager row that the selector is written to find. A census that did not
 * account for this would report two occurrences for every id that has a
 * tour step (the JSX definition plus the manifest's own selector
 * reference) and could never observe "exactly 1" for any of them -- not
 * because of a duplicate anchor, but because the search cannot distinguish
 * "defines an element" from "references an element". `ELEMENT_DEFINITION_FILES`
 * below excludes exactly the two known manifest files from the uniqueness
 * count, so the count reflects definitions only. The manifest files
 * themselves remain in scope for the dead-id-absence and
 * sidebar-prefix-absence checks (assertions 4 and 5), since a `sidebar-*`
 * or dead id appearing even inside a manifest's own selector string would
 * still be a real defect -- a tour step pointing at nothing.
 *
 * `__tests__` directories are excluded from every count in this file, for
 * the same reason `tourDisabled.test.ts` excluded its own directory: test
 * fixtures and expectation strings (e.g. `expect(...).toBe('nav-wine')` or
 * a hand-built JSX fixture asserting the right prop landed) legitimately
 * contain these substrings without being a second element definition.
 * Verified empirically before writing this file: `SettingsPanel.test.tsx`
 * and `NavShellTour.test.tsx` both contain the literal string
 * `data-tour="nav-wine"` in fixture/expectation code, which is why the
 * naive whole-tree count for every step id was 4, not 1, until both the
 * `__tests__` and manifest exclusions were applied.
 *
 * Uses the comment-stripped source (`stripSourceComments`), same as
 * `tourDisabled.test.ts`, so a `data-tour` value merely NAMED in a
 * docstring is not counted as an occurrence. This matters concretely here:
 * `SettingsPanel/index.tsx`'s own docstring names `nav-launcher` in prose
 * (see its file header) -- if that were counted, the "exactly 1" assertion
 * for `nav-launcher` would see 2 even after excluding `__tests__`.
 *
 * The id lists below are LITERAL arrays, not derived from `NavShellTour`,
 * `LibraryTour`, or any exported manifest. Deriving them would make this
 * gate self-sealing: dropping a step from the tour component would shrink
 * the expected-id list along with the actual source, and the census would
 * stay green while a real anchor silently disappeared from the tour.
 * Assertion 6 additionally pins the step-id array's length so a future
 * edit cannot quietly shrink it either.
 *
 * Replaces (subsumes) `src/frontend/components/UI/NavShell/__tests__/tourDisabled.test.ts`,
 * deleted by this same commit. Assertion-by-assertion mapping, recorded
 * here and in 34.12-06-SUMMARY.md:
 *   - `TourButton` ban (its describe block's core check) -> subsumed by
 *     `NavItem.test.tsx`'s existing proof (34.12-04/05) that D-01's
 *     launcher row is a real `NavItem`, not a `TourButton`. No successor
 *     assertion needed here; `TourButton.tsx` has no live importer, which
 *     `NavItem.test.tsx` and `SettingsPanel.test.tsx` already establish
 *     indirectly by construction (they render `SettingsPanel` and find a
 *     `NavItem`, not a `TourButton`, at that row).
 *   - `data-tour="sidebar-` ban, scoped to NavShell source only ->
 *     assertion 5 below, same substring check, now repo-wide under
 *     `src/frontend` instead of just `NavShell/`. Strictly stronger: it
 *     could catch a stray `sidebar-*` value reintroduced anywhere, not
 *     just inside `NavShell/`.
 *   - Non-empty-walk sanity check -> assertion 7 below, same shape,
 *     `src/frontend`-wide instead of `NavShell/`-only.
 *   - `SidebarTour` / `SIDEBAR_TOUR_ID` text ban and the "SidebarTour.tsx
 *     has no live importer" block -> already removed by 34.12-04 Task 1
 *     (both would have passed vacuously once the retired identifiers and
 *     file no longer exist anywhere; see that commit's SUMMARY). No
 *     successor needed; carrying one forward would itself be vacuous.
 */
import { readFileSync, readdirSync } from 'fs'
import { join, sep } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')
const FRONTEND_DIR = join(REPO_ROOT, 'src/frontend')

const TOUR_MANIFEST_FILES = [
  join(
    FRONTEND_DIR,
    'components',
    'UI',
    'NavShell',
    'components',
    'NavShellTour',
    'index.tsx'
  ),
  join(FRONTEND_DIR, 'screens', 'Library', 'components', 'LibraryTour.tsx')
]

function walk(dir: string, extensions: string[]): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => extensions.some((ext) => entry.name.endsWith(ext)))
    .map((entry) =>
      join((entry as unknown as { parentPath: string }).parentPath, entry.name)
    )
}

function readStripped(path: string): string {
  return stripSourceComments(readFileSync(path, 'utf8'))
}

function filesContaining(files: string[], needle: string): string[] {
  return files.filter((path) => readStripped(path).includes(needle))
}

// The twelve NavShellTour step ids (12 `element: '[data-tour="..."]'`
// entries in `NavShellTour/index.tsx` at the time this census was
// written -- cross-checked by hand against that file, not derived from it).
const NAV_TOUR_STEP_IDS = [
  'nav-menu',
  'nav-library',
  'nav-stores',
  'nav-settings',
  'nav-downloads',
  'nav-wine',
  'nav-manage-accounts',
  'nav-accessibility',
  'nav-docs',
  'nav-community',
  'nav-quit',
  'nav-version'
]

// D-01's launcher row. Deliberately NOT a member of NAV_TOUR_STEP_IDS:
// it is a launch affordance for starting the tour, not a step the running
// tour visits, so folding it into the twelve-id array would make
// assertion 6's length pin (a manifest-integrity guard on the STEP
// manifest specifically) assert the wrong number.
const NAV_LAUNCHER_ID = 'nav-launcher'

// The two LibraryTour anchors landed by plan 34.12-02.
const LIBRARY_TOUR_ANCHOR_IDS = ['library-views-collections', 'library-facets']

// Ids that must be entirely absent from the frontend after this plan's
// Task 1 removed their three JSX occurrences (`library-header` appeared
// twice, `humble-keys` once). `library-categories` / `library-filters`
// are carried forward from the retired `tourDisabled.test.ts` era for
// completeness -- their owning components (`CategoryFilter`,
// `LibraryFilters`) were deleted outright by phase 34.11, so these two
// have had zero occurrences since before this phase started.
const DEAD_TOUR_IDS = [
  'library-header',
  'humble-keys',
  'library-categories',
  'library-filters'
]

const allFrontendTsxFiles = walk(FRONTEND_DIR, ['.tsx']).filter(
  (path) => !path.includes(`${sep}__tests__${sep}`)
)

const elementDefinitionFiles = allFrontendTsxFiles.filter(
  (path) => !TOUR_MANIFEST_FILES.includes(path)
)

describe('nav/library tour anchor census (Layer B: uniqueness, not correctness)', () => {
  it('scans a non-trivial number of frontend .tsx files (sanity check the walk is not vacuous)', () => {
    // Every "exactly 0" assertion below would pass vacuously against an
    // empty walk. This is the check that stops a broken walk root from
    // turning the whole census green for the wrong reason. The repo has
    // 300+ .tsx files under src/frontend at the time of writing; 100 is a
    // conservative floor with headroom for growth.
    expect(walk(FRONTEND_DIR, ['.tsx']).length).toBeGreaterThan(100)
  })

  it('the NavShellTour step-id manifest has not silently shrunk', () => {
    expect(NAV_TOUR_STEP_IDS).toHaveLength(12)
  })

  it.each(NAV_TOUR_STEP_IDS)(
    'nav tour step id %s is defined on exactly one element in src/frontend',
    (id) => {
      const matches = filesContaining(elementDefinitionFiles, `data-tour="${id}"`)
      expect(matches).toHaveLength(1)
    }
  )

  it(`launcher id ${NAV_LAUNCHER_ID} is defined on exactly one element in src/frontend`, () => {
    const matches = filesContaining(
      elementDefinitionFiles,
      `data-tour="${NAV_LAUNCHER_ID}"`
    )
    expect(matches).toHaveLength(1)
  })

  it.each(LIBRARY_TOUR_ANCHOR_IDS)(
    'library tour anchor id %s is defined on exactly one element in src/frontend',
    (id) => {
      const matches = filesContaining(elementDefinitionFiles, `data-tour="${id}"`)
      expect(matches).toHaveLength(1)
    }
  )

  it.each(DEAD_TOUR_IDS)(
    'dead tour id %s is defined on zero elements anywhere in src/frontend',
    (id) => {
      const matches = filesContaining(allFrontendTsxFiles, `data-tour="${id}"`)
      expect(matches).toHaveLength(0)
    }
  )

  it('no data-tour value anywhere under src/frontend uses the retired sidebar-* prefix', () => {
    // Repo-wide successor to tourDisabled.test.ts's NavShell-scoped check
    // of the same property -- strictly stronger, since it can catch a
    // stray sidebar-* value reintroduced anywhere, not just inside
    // NavShell/.
    const matches = allFrontendTsxFiles.filter((path) =>
      readStripped(path).includes('data-tour="sidebar-')
    )
    expect(matches).toHaveLength(0)
  })
})
