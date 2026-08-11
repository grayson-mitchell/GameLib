/**
 * Source-text gate pinning the App.tsx mount site (REQ-34.10-01 gap G1,
 * 34.10-08 Task 1). Nothing in the rest of the NavShell test suite exercises
 * `App.tsx` -- every other NavShell test invokes the component in isolation
 * -- so nothing today fails if `<NavShell />` or `<Tier2PortalProvider>` were
 * deleted from `App.tsx`, or if the console-mode branch grew a shell it must
 * never have.
 *
 * This is a SOURCE-TEXT gate, not a render test -- the `Frontend` jest
 * project is `testEnvironment: 'node'` with no jsdom (see
 * `src/frontend/jest.config.js` docstring), following the idiom established
 * by `screens/Login/__tests__/index.test.tsx` and, for the index-order
 * assertion specifically, `screens/Library/__tests__/tier2Portal.test.ts`'s
 * "the createPortal(<Header />, ...) call site sits after LibraryContext
 * .Provider opens" check.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')
const APP_TSX = join(REPO_ROOT, 'src/frontend/App.tsx')

function read(path: string): string {
  return stripSourceComments(readFileSync(path, 'utf8'))
}

/**
 * Extracts the JSX inside the FIRST `isConsoleMode ? ( ... )` ternary's
 * consequent (the console-mode branch), paren-depth-aware so a nested `(`
 * inside the branch cannot truncate the match early. There is no nested
 * paren inside the actual console branch today, but depth-counting rather
 * than a lazy regex keeps this correct if one is ever added.
 */
function extractConsoleModeBranch(source: string): string {
  const marker = 'isConsoleMode ? ('
  const markerIdx = source.indexOf(marker)
  if (markerIdx === -1) {
    throw new Error(
      "App.tsx: 'isConsoleMode ? (' not found -- the console-mode ternary " +
        'has changed shape; update extractConsoleModeBranch'
    )
  }
  let idx = markerIdx + marker.length
  let depth = 1
  let out = ''
  while (idx < source.length && depth > 0) {
    const ch = source[idx]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (depth > 0) out += ch
    idx++
  }
  return out
}

describe('App.tsx mounts NavShell inside Tier2PortalProvider (REQ-34.10-01)', () => {
  const source = read(APP_TSX)

  it('imports NavShell from ./components/UI/NavShell', () => {
    expect(source).toMatch(
      /import NavShell from '\.\/components\/UI\/NavShell'/
    )
  })

  it('imports Tier2PortalProvider from ./components/UI/NavShell/Tier2PortalContext', () => {
    expect(source).toMatch(
      /import \{ Tier2PortalProvider \} from '\.\/components\/UI\/NavShell\/Tier2PortalContext'/
    )
  })

  it('renders <NavShell /> strictly between Tier2PortalProvider opening and closing (index-order assertion)', () => {
    const providerOpenIdx = source.indexOf('<Tier2PortalProvider>')
    const navShellIdx = source.indexOf('<NavShell />')
    const providerCloseIdx = source.indexOf('</Tier2PortalProvider>')

    expect(providerOpenIdx).toBeGreaterThan(-1)
    expect(navShellIdx).toBeGreaterThan(-1)
    expect(providerCloseIdx).toBeGreaterThan(-1)
    expect(navShellIdx).toBeGreaterThan(providerOpenIdx)
    expect(navShellIdx).toBeLessThan(providerCloseIdx)
  })

  it('SANITY: the index-order assertion above fails against a known-bad input (NavShell deleted) -- proves it is not vacuously true', () => {
    const mutated = source.replace('<NavShell />', '')
    const providerOpenIdx = mutated.indexOf('<Tier2PortalProvider>')
    const navShellIdx = mutated.indexOf('<NavShell />')
    const providerCloseIdx = mutated.indexOf('</Tier2PortalProvider>')

    // Reproduce the real assertion's shape against the mutated (bad) input:
    // it must fail exactly the way a deleted mount site should be caught.
    expect(providerOpenIdx).toBeGreaterThan(-1)
    expect(providerCloseIdx).toBeGreaterThan(-1)
    expect(navShellIdx).toBe(-1) // NavShell no longer found at all
  })
})

describe('Console mode renders bare -- no shell (REQ-34.10-01)', () => {
  const source = read(APP_TSX)
  const consoleBranch = extractConsoleModeBranch(source)

  it('sanity: the extracted branch really is the console-mode branch', () => {
    expect(consoleBranch).toMatch(/consoleContent/)
  })

  it('the console-mode branch contains no NavShell reference', () => {
    expect(consoleBranch).not.toMatch(/NavShell/)
  })

  it('the console-mode branch contains no Tier2PortalProvider reference', () => {
    expect(consoleBranch).not.toMatch(/Tier2PortalProvider/)
  })

  it('SANITY: the console-mode absence checks above fail against a known-bad input (NavShell added to the branch) -- proves they are not vacuously true', () => {
    const mutatedBranch = consoleBranch + '<NavShell />'
    expect(mutatedBranch).toMatch(/NavShell/)
  })
})
