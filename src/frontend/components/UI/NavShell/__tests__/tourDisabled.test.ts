/**
 * TRANSITIONAL source gate, owned by phase 34.12
 * (originally 34.10-09 Task 2, REQ-34.10-11/13/15, D-13; narrowed by
 * 34.12-01 Task 2, D-06).
 *
 * These are SOURCE-TEXT gates, not render tests -- this jest project is
 * `testEnvironment: 'node'` with no jsdom (see `src/frontend/jest.config.js`
 * docstring), following the idiom established by
 * `screens/Login/__tests__/index.test.tsx` (lines 34-90).
 *
 * What the first check now measures: phase 34.12 rebuilds the onboarding
 * tour against this shell, so `data-tour` tokens are expected to start
 * appearing in NavShell source (34.12-01 Task 1 added the first one, on
 * `NavItem`). The old blanket ban on any `data-tour` token is retired --
 * it stopped holding the moment 34.12 started re-adding anchors, and plan
 * 34.12-04 goes further and mounts a running tour. What the gate DOES
 * still guard is D-06's rename: no `sidebar-*`-prefixed `data-tour` value
 * may survive anywhere in NavShell source. `SidebarTour`, `SIDEBAR_TOUR_ID`
 * and `TourButton` stay banned outright -- plan 34.12-04 renames the
 * component to `NavShellTour` and the id constant to `NAV_TOUR_ID`, and
 * D-01's launcher row is a `NavItem`, not the retired `TourButton` -- so all
 * three remain satisfiable for the rest of the phase without weakening.
 *
 * This gate is TRANSITIONAL: plan 34.12-06 deletes it once
 * `navTourAnchorCensus.test.ts` lands, which subsumes it with a strictly
 * stronger per-id check (every anchor id individually enumerated, not just
 * a shared prefix banned).
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
 * Task 3 already deleted that whole tree -- this second describe block is
 * untouched by 34.12-01; plan 34.12-04 is the one that makes it vacuous.
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
    '%s contains no SidebarTour, SIDEBAR_TOUR_ID, TourButton or sidebar-* data-tour reference',
    (_label, path) => {
      const source = readStripped(path)
      expect(source).not.toMatch(/SidebarTour/)
      expect(source).not.toMatch(/SIDEBAR_TOUR_ID/)
      expect(source).not.toMatch(/TourButton/)
      expect(source).not.toMatch(/data-tour="sidebar-/)
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
