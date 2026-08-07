/**
 * Source-text gate for the Games tier-2 portal (34.10-06, REQ-34.10-07,
 * REQ-34.10-09).
 *
 * Why a source gate and not a render test: `Library` is a ~900-line
 * component wired to dozens of hooks and `Frontend` jest project runs with
 * `testEnvironment: 'node'` (see src/frontend/jest.config.js) -- there is no
 * jsdom, so mounting `Library` (or anything that imports `./index.css`) is
 * not possible in this project. These assertions instead inspect the raw
 * source text, following the idiom established by
 * `src/frontend/screens/Login/__tests__/index.test.tsx`.
 *
 * What this gate actually protects against (see Tier2PortalContext.tsx's
 * own in-source rationale comment): `LibraryContext`'s `initialContext`
 * supplies silent no-op setters for every filter/search/layout handler. If
 * `<Header />` were ever rendered as a direct child instead of moved through
 * `createPortal` from *inside* `LibraryContext.Provider`, the controls would
 * render, respond to clicks, throw no errors, and fail no existing test --
 * while doing nothing. The first `describe` block below is the regression
 * gate for exactly that failure mode.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')

const read = (relPath: string) =>
  stripSourceComments(readFileSync(join(REPO_ROOT, relPath), 'utf8'))

const LIBRARY_TSX = 'src/frontend/screens/Library/index.tsx'
const LIBRARY_CSS = 'src/frontend/screens/Library/index.css'
const HEADER_TSX = 'src/frontend/components/UI/Header/index.tsx'
const HEADER_CSS = 'src/frontend/components/UI/Header/index.css'

/**
 * Returns the declaration body of the FIRST top-level rule whose selector
 * matches exactly, e.g. `.Header`. Brace-counted rather than
 * regex-terminated so a nested block cannot end the match early. Copied
 * verbatim from the Login source-gate idiom (index.test.tsx) rather than
 * factored into a shared util, matching that file's own precedent.
 */
function cssBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  if (start === -1) {
    throw new Error(`selector ${selector} not found`)
  }
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) {
        return source.slice(source.indexOf('{', start) + 1, i)
      }
    }
  }
  throw new Error(`unterminated block for ${selector}`)
}

/**
 * Every `<Header />` occurrence in `source` must be immediately preceded
 * (ignoring whitespace/newlines) by `createPortal(`. This is the structural
 * proof that `<Header />` is never rendered as a direct child.
 */
function everyHeaderUsageIsPortalled(source: string): boolean {
  const needle = '<Header />'
  let fromIndex = 0
  let sawAny = false
  for (;;) {
    const idx = source.indexOf(needle, fromIndex)
    if (idx === -1) break
    sawAny = true
    const before = source.slice(0, idx)
    const trimmed = before.replace(/\s+$/, '')
    if (!trimmed.endsWith('createPortal(')) {
      return false
    }
    fromIndex = idx + needle.length
  }
  // At least one usage must exist -- an empty match set would vacuously pass.
  return sawAny
}

describe('Header vertical stack (Task 1, REQ-34.10-07)', () => {
  const headerCss = read(HEADER_CSS)

  it('drops the frameless overlay-controls padding hack entirely', () => {
    expect(headerCss).not.toMatch(/frameless/)
  })

  it('is no longer position: sticky', () => {
    expect(headerCss).not.toMatch(/position:\s*sticky/)
  })

  it('is no longer a space-between horizontal bar', () => {
    expect(headerCss).not.toMatch(/space-between/)
  })

  it('.Header is a vertical flex stack', () => {
    const block = cssBlock(headerCss, '.Header')
    expect(block).toMatch(/flex-direction:\s*column/)
  })

  it('retains the unrelated iconsWrapper/refreshIcon styling that lives in this file', () => {
    expect(headerCss).toMatch(/@keyframes refreshing/)
  })

  it('still renders LibrarySearchBar, CategoryFilter and LibraryFilters, in that order, and imports them unchanged', () => {
    const tsx = read(HEADER_TSX)
    expect(tsx).toMatch(
      /LibrarySearchBar[\s\S]*CategoryFilter[\s\S]*LibraryFilters/
    )
    expect(tsx).toMatch(/import LibrarySearchBar from '..\/LibrarySearchBar'/)
    expect(tsx).toMatch(/import CategoryFilter from '..\/CategoryFilter'/)
    expect(tsx).toMatch(/import LibraryFilters from '..\/LibraryFilters'/)
  })
})

describe('Library portals Header into the tier-2 target (Task 2, REQ-34.10-09)', () => {
  const libraryTsx = read(LIBRARY_TSX)

  it('imports createPortal from react-dom', () => {
    expect(libraryTsx).toMatch(/import\s*\{\s*createPortal\s*\}\s*from\s*'react-dom'/)
  })

  it('references Tier2PortalContext', () => {
    expect(libraryTsx).toMatch(/Tier2PortalContext/)
  })

  it('REGRESSION GATE -- every <Header /> usage is wrapped in createPortal(, never rendered as a direct child', () => {
    expect(everyHeaderUsageIsPortalled(libraryTsx)).toBe(true)
  })

  it('the createPortal(<Header />, ...) call site sits after LibraryContext.Provider opens, not before it', () => {
    const providerIdx = libraryTsx.indexOf('LibraryContext.Provider')
    const portalIdx = libraryTsx.indexOf('createPortal(\n        <Header />')
    const portalIdxAlt = libraryTsx.indexOf('createPortal(<Header />')
    const resolvedPortalIdx = portalIdx !== -1 ? portalIdx : portalIdxAlt
    expect(providerIdx).toBeGreaterThan(-1)
    expect(resolvedPortalIdx).toBeGreaterThan(-1)
    expect(resolvedPortalIdx).toBeGreaterThan(providerIdx)
  })

  it('calls the portal-filled setter (setFilled from Tier2PortalContext, aliased on destructure) on mount/unmount', () => {
    // The context value is destructured as `setFilled: <localAlias>` (see
    // Tier2PortalContext.tsx's `Tier2PortalValue` shape) -- assert the
    // property name is read from the context AND that the resulting local
    // is actually invoked, not just bound.
    expect(libraryTsx).toMatch(/setFilled:\s*(\w+)/)
    const [, alias] = libraryTsx.match(/setFilled:\s*(\w+)/) ?? []
    expect(alias).toBeTruthy()
    const callPattern = new RegExp(`${alias}\\(true\\)`)
    const cleanupPattern = new RegExp(`${alias}\\(false\\)`)
    expect(libraryTsx).toMatch(callPattern)
    expect(libraryTsx).toMatch(cleanupPattern)
  })

  it('no longer contains the retired setHeaderHightCSS sticky-offset measurement', () => {
    expect(libraryTsx).not.toMatch(/setHeaderHightCSS/)
  })

  it('no longer references --header-height in the component source', () => {
    expect(libraryTsx).not.toMatch(/--header-height/)
  })

  it('LibraryHeader and the alphabet strip stay unmoved in the render tree (import + JSX usage still present)', () => {
    expect(libraryTsx.match(/LibraryHeader/g)?.length).toBeGreaterThanOrEqual(
      2
    )
    expect(libraryTsx).toMatch(/AlphabetFilter/)
  })
})

describe('Library/index.css .libraryHeader retires its sticky offset (Task 2)', () => {
  const libraryCss = read(LIBRARY_CSS)

  it('.libraryHeader no longer references --header-height', () => {
    const block = cssBlock(libraryCss, '.libraryHeader')
    expect(block).not.toMatch(/--header-height/)
  })

  it('.libraryHeader now anchors at top: 0', () => {
    const block = cssBlock(libraryCss, '.libraryHeader')
    expect(block).toMatch(/top:\s*0;/)
  })
})
