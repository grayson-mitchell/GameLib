/**
 * TRANSITIONAL source gate, owned by phase 34.12
 * (originally 34.10-09 Task 2, REQ-34.10-11/13/15, D-13; narrowed by
 * 34.12-01 Task 2, D-06; narrowed again by 34.12-04 Task 1).
 *
 * This is a SOURCE-TEXT gate, not a render test -- this jest project is
 * `testEnvironment: 'node'` with no jsdom (see `src/frontend/jest.config.js`
 * docstring), following the idiom established by
 * `screens/Login/__tests__/index.test.tsx` (lines 34-90).
 *
 * What the check now measures: phase 34.12 rebuilds the onboarding tour
 * against this shell, so `data-tour` tokens are expected to appear in
 * NavShell source (34.12-01 Task 1 added the first one, on `NavItem`;
 * 34.12-03 added eight `nav-*` anchors; 34.12-04 mounts a running tour).
 * The old blanket ban on any `data-tour` token is retired -- it stopped
 * holding the moment 34.12 started re-adding anchors. What the gate DOES
 * still guard is D-06's rename: no `sidebar-*`-prefixed `data-tour` value
 * may survive anywhere in NavShell source, and `TourButton` stays banned
 * outright -- D-01's launcher row is a `NavItem`, not the retired
 * `TourButton`.
 *
 * Removed by 34.12-04 Task 1, once the rename it guarded landed:
 *   - The `SidebarTour` / `SIDEBAR_TOUR_ID` text assertions in the first
 *     describe block. The component that used to live under `Sidebar/`
 *     is renamed to `NavShellTour` (`NAV_TOUR_ID`) and now lives INSIDE
 *     `NAVSHELL_DIR` itself -- so a ban on those two identifiers appearing
 *     in NavShell source can never fail again once the old names no
 *     longer exist anywhere in the codebase. Keeping it would be a gate
 *     that always passes for the wrong reason.
 *   - The entire second describe block, `SidebarTour.tsx has no live
 *     importer`. Its target file (`Sidebar/components/SidebarTour.tsx`)
 *     is deleted by the same commit, so its `importers` array is empty by
 *     construction and it would pass vacuously -- exactly the failure
 *     mode this project has been bitten by before (see
 *     `empty-human-verification-makes-audit-scrape-prose` and siblings
 *     in project memory).
 *
 * Kept: the `TourButton` assertion (still meaningful -- D-01's launcher
 * must not reintroduce it) and the `data-tour="sidebar-` assertion (the
 * property that survives to plan 34.12-06, which is the one that proves
 * it is not vacuous now that the renamed component lives inside
 * `NAVSHELL_DIR` and could in principle reintroduce a `sidebar-*`
 * selector).
 *
 * This gate is still TRANSITIONAL: plan 34.12-06 deletes it once
 * `navTourAnchorCensus.test.ts` lands, which subsumes it with a strictly
 * stronger per-id check (every anchor id individually enumerated, not
 * just a shared prefix banned).
 *
 * Scope note: the check reads only NavShell's own SOURCE files
 * (`components/**\/*.tsx`, `index.tsx`) -- excluding `__tests__/` is
 * deliberate and necessary, not an oversight. A test that asserts "no
 * file contains the string TourButton" cannot include itself (or
 * `NavShell.test.tsx`, which names the token in its own already-shipped
 * absence-check) in its own target set without being unsatisfiable by
 * construction -- the check's own source must contain the forbidden
 * tokens in order to search for them.
 */
import { readFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')
const NAVSHELL_DIR = join(REPO_ROOT, 'src/frontend/components/UI/NavShell')

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

describe('NavShell source files never reference the retired tour entry points', () => {
  const navShellSourceFiles = walk(NAVSHELL_DIR, ['.tsx']).filter(
    (path) => !path.includes(`${join('NavShell', '__tests__')}${'/'}`)
  )

  it('scans at least one NavShell source file (sanity check the walk found something)', () => {
    expect(navShellSourceFiles.length).toBeGreaterThan(0)
  })

  it.each(navShellSourceFiles.map((path) => [relative(REPO_ROOT, path), path]))(
    '%s contains no TourButton or sidebar-* data-tour reference',
    (_label, path) => {
      const source = readStripped(path)
      expect(source).not.toMatch(/TourButton/)
      expect(source).not.toMatch(/data-tour="sidebar-/)
    }
  )
})
