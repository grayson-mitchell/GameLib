/**
 * Tour-disabled source gate (34.10-09 Task 2, REQ-34.10-11/13/15, D-13).
 *
 * These are SOURCE-TEXT gates, not render tests -- this jest project is
 * `testEnvironment: 'node'` with no jsdom (see `src/frontend/jest.config.js`
 * docstring), following the idiom established by
 * `screens/Login/__tests__/index.test.tsx` (lines 34-90).
 *
 * The tour has TWO entry points in the retired left navigation: the
 * `SidebarTour` mount itself (`Sidebar/index.tsx`) and the second, easy-to-
 * miss one -- the help button `HeroicVersion` used to render
 * (`Sidebar/components/HeroicVersion/index.tsx`), which plan 34.10-07 already
 * removed when it relocated `HeroicVersion` under `NavShell/`. Proving the
 * tour is off therefore means proving BOTH: no shell file references the
 * tour component/id/button, AND nothing outside `SidebarTour.tsx` imports it.
 * A mount-absence assertion on a single component would only cover the
 * first entry point.
 *
 * Scope note on the two checks below: the first check reads only NavShell's
 * own SOURCE files (`components/**\/*.tsx`, `index.tsx`) -- excluding
 * `__tests__/` is deliberate and necessary, not an oversight. A test that
 * asserts "no file contains the string SidebarTour" cannot include itself
 * (or `NavShell.test.tsx`, which names the token in its own already-shipped
 * absence-check) in its own target set without being unsatisfiable by
 * construction -- the check's own source must contain the forbidden tokens
 * in order to search for them. The second check's target set is repo-wide
 * (real reachability), but excludes the retired `Sidebar/` tree: those files
 * are dead code already unreachable from any live render path (plan 34.10-08
 * replaced `<Sidebar />` with `<NavShell />` in `App.tsx`), and 34.10-09
 * Task 3 deletes that whole tree in this same plan -- checking a file this
 * plan is about to delete would make Task 2's own verification depend on
 * Task 3 having already run, an ordering contradiction, not a real gap.
 */
import { readFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')
const NAVSHELL_DIR = join(REPO_ROOT, 'src/frontend/components/UI/NavShell')
const FRONTEND_DIR = join(REPO_ROOT, 'src/frontend')
const SIDEBAR_TOUR_PATH = join(
  REPO_ROOT,
  'src/frontend/components/UI/Sidebar/components/SidebarTour.tsx'
)
const RETIRED_SIDEBAR_DIR = join(
  REPO_ROOT,
  'src/frontend/components/UI/Sidebar'
)

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

describe('NavShell source files never reference the disabled tour', () => {
  const navShellSourceFiles = walk(NAVSHELL_DIR, ['.tsx']).filter(
    (path) => !path.includes(`${join('NavShell', '__tests__')}${'/'}`)
  )

  it('scans at least one NavShell source file (sanity check the walk found something)', () => {
    expect(navShellSourceFiles.length).toBeGreaterThan(0)
  })

  it.each(navShellSourceFiles.map((path) => [relative(REPO_ROOT, path), path]))(
    '%s contains no SidebarTour, SIDEBAR_TOUR_ID, TourButton or data-tour reference',
    (_label, path) => {
      const source = readStripped(path)
      expect(source).not.toMatch(/SidebarTour/)
      expect(source).not.toMatch(/SIDEBAR_TOUR_ID/)
      expect(source).not.toMatch(/TourButton/)
      expect(source).not.toMatch(/data-tour/)
    }
  )
})

describe('SidebarTour.tsx has no live importer', () => {
  it('no file under src/frontend outside SidebarTour.tsx itself and the retired Sidebar tree imports it -- what actually proves the tour cannot start', () => {
    const candidateFiles = walk(FRONTEND_DIR, ['.ts', '.tsx']).filter(
      (path) =>
        path !== SIDEBAR_TOUR_PATH && !path.startsWith(RETIRED_SIDEBAR_DIR)
    )

    const importPattern =
      /(?:from\s+['"][^'"]*SidebarTour['"]|require\(\s*['"][^'"]*SidebarTour['"]\s*\))/

    const importers = candidateFiles.filter((path) =>
      importPattern.test(readStripped(path))
    )

    expect(importers).toEqual([])
  })
})
