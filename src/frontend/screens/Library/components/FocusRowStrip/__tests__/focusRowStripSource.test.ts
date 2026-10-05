/**
 * Source-text gate for the `FocusRowStrip` horizontal track and the lane
 * replacement in `Library/index.tsx` (Phase 48 Plan 02, Task 3).
 *
 * Why a source gate and not a render test: `src/frontend/jest.config.js` sets
 * `testEnvironment: 'node'` -- there is no jsdom in this project, so mounting
 * `FocusRowStrip` or anything that imports `Library/index.tsx`'s colocated
 * CSS is not possible. This follows `tier2Portal.test.ts`'s comment-stripped
 * `cssBlock` idiom verbatim rather than inventing a second shape.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..', '..')

const read = (relPath: string) =>
  stripSourceComments(readFileSync(join(REPO_ROOT, relPath), 'utf8'))

const FOCUS_ROW_CSS_PATH =
  'src/frontend/screens/Library/components/FocusRowStrip/index.css'
const FOCUS_ROW_TSX_PATH =
  'src/frontend/screens/Library/components/FocusRowStrip/index.tsx'
const LIBRARY_CSS_PATH = 'src/frontend/screens/Library/index.css'
const LIBRARY_TSX_PATH = 'src/frontend/screens/Library/index.tsx'

/**
 * Returns the declaration body of the FIRST top-level rule whose selector
 * matches exactly, e.g. `.focusRowTrack`. Brace-counted rather than
 * regex-terminated so a nested block cannot end the match early. Copied
 * verbatim from `tier2Portal.test.ts`'s idiom, which itself copied it from
 * the Login source-gate.
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

describe('FocusRowStrip/index.css -- .focusRowTrack', () => {
  const css = read(FOCUS_ROW_CSS_PATH)
  const block = cssBlock(css, '.focusRowTrack')

  it('declares overflow-x: auto, scroll-behavior: smooth and scrollbar-width: none', () => {
    expect(block).toMatch(/overflow-x:\s*auto/)
    expect(block).toMatch(/scroll-behavior:\s*smooth/)
    expect(block).toMatch(/scrollbar-width:\s*none/)
  })

  it('does not declare scrollbar-gutter', () => {
    expect(block).not.toMatch(/scrollbar-gutter/)
  })
})

describe('FocusRowStrip/index.css -- .focusRowTrack .gameList', () => {
  const css = read(FOCUS_ROW_CSS_PATH)
  const block = cssBlock(css, '.focusRowTrack .gameList')

  it('declares display: flex, flex-wrap: nowrap and gap: 1.5rem', () => {
    expect(block).toMatch(/display:\s*flex/)
    expect(block).toMatch(/flex-wrap:\s*nowrap/)
    expect(block).toMatch(/gap:\s*1\.5rem/)
  })
})

describe('FocusRowStrip/index.css -- .focusRowTrack .gameList > *', () => {
  const css = read(FOCUS_ROW_CSS_PATH)
  const block = cssBlock(css, '.focusRowTrack .gameList > *')

  it('declares a fixed flex: 0 0 156px', () => {
    expect(block).toMatch(/flex:\s*0\s*0\s*156px/)
  })

  it('never uses minmax( or 1fr -- the strip card width is never a fraction of the container', () => {
    expect(block).not.toMatch(/minmax\(/)
    expect(block).not.toMatch(/1fr/)
  })
})

describe('Library/index.css -- the grid stylesheet is untouched', () => {
  it('still declares .gameList with the unfractioned auto-fill grid', () => {
    const css = read(LIBRARY_CSS_PATH)
    expect(css).toMatch(
      /\.gameList\s*{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(156px,\s*1fr\)\)/
    )
  })
})

describe('Library/index.tsx -- the lane replacement', () => {
  const source = read(LIBRARY_TSX_PATH)

  it('mounts FocusRowStrip exactly once', () => {
    expect(source.split('<FocusRowStrip').length - 1).toBe(1)
  })

  it('no longer mounts RecentlyPlayed', () => {
    expect(source.split('<RecentlyPlayed').length - 1).toBe(0)
  })

  it('mounts GamesList exactly once -- the grid, proving both lane branches collapsed', () => {
    expect(source.split('<GamesList').length - 1).toBe(1)
  })
})

describe('FocusRowStrip/index.tsx -- purity', () => {
  const source = read(FOCUS_ROW_TSX_PATH)

  it('never uses dangerouslySetInnerHTML', () => {
    expect(source).not.toMatch(/dangerouslySetInnerHTML/)
  })

  it('never touches customCategories -- it only ever reads data computed upstream', () => {
    expect(source).not.toMatch(/customCategories/)
  })
})

describe('FocusRowStrip/index.tsx -- overflow controls (Plan 48-04)', () => {
  const source = read(FOCUS_ROW_TSX_PATH)

  it('imports canScrollForward and canScrollBack from ./focusRowOverflow', () => {
    expect(source).toMatch(
      /import\s*{[^}]*\bcanScrollForward\b[^}]*}\s*from\s*'\.\/focusRowOverflow'/
    )
    expect(source).toMatch(
      /import\s*{[^}]*\bcanScrollBack\b[^}]*}\s*from\s*'\.\/focusRowOverflow'/
    )
  })

  it('renders the controls inside a condition on canScroll* -- a mount decision, not a style', () => {
    expect(source).toMatch(/forwardEnabled\s*=\s*canScrollForward\(/)
    expect(source).toMatch(/backEnabled\s*=\s*canScrollBack\(/)
    expect(source).toMatch(
      /showControls\s*=\s*forwardEnabled\s*\|\|\s*backEnabled/
    )
    expect(source.split('{showControls &&').length - 1).toBe(2)
  })

  it('renders exactly two type="button" controls', () => {
    expect(source.split('<button').length - 1).toBe(2)
    expect(source.split('type="button"').length - 1).toBe(2)
  })

  it('labels each control from a literal tGamelib call', () => {
    expect(source).toMatch(
      /tGamelib\(\s*'gamelib:library\.filterPanel\.focusRowNext',\s*'Show more games'\s*\)/
    )
    expect(source).toMatch(
      /tGamelib\(\s*'gamelib:library\.filterPanel\.focusRowPrevious',\s*'Show previous games'\s*\)/
    )
  })

  it('gives each control an aria-label', () => {
    expect(source.split('aria-label=').length - 1).toBe(2)
  })

  it('imports faChevronLeft and faChevronRight from @fortawesome/free-solid-svg-icons', () => {
    expect(source).toMatch(
      /import\s*{[^}]*\bfaChevronLeft\b[^}]*}\s*from\s*'@fortawesome\/free-solid-svg-icons'/
    )
    expect(source).toMatch(
      /import\s*{[^}]*\bfaChevronRight\b[^}]*}\s*from\s*'@fortawesome\/free-solid-svg-icons'/
    )
  })

  it('has no text child in either control -- only a FontAwesomeIcon', () => {
    const buttons = source.match(/<button[\s\S]*?<\/button>/g) ?? []
    expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      // Nothing but whitespace between the opening tag's closing `>` and the
      // icon, and nothing between the icon and the closing tag.
      expect(button).toMatch(/>\s*<FontAwesomeIcon[^>]*\/>\s*<\/button>$/)
    }
  })

  it('binds a disabled attribute on each control', () => {
    expect(source.split('disabled={').length - 1).toBe(2)
  })

  it('has no onWheel handler -- native overflow-x scrolling is not re-implemented', () => {
    expect(source).not.toMatch(/onWheel/)
  })

  it('attaches the horizontal scroll-into-view as a capture-phase focus listener gated on activeController', () => {
    expect(source).toMatch(/activeController/)
    expect(source).toMatch(
      /addEventListener\(\s*'focus',\s*scrollFocusedCardIntoViewHorizontally,\s*{\s*capture:\s*true\s*}/
    )
    expect(source).toMatch(
      /removeEventListener\(\s*'focus',\s*scrollFocusedCardIntoViewHorizontally,\s*{\s*capture:\s*true\s*}/
    )
  })

  it('observes the track with a ResizeObserver and disconnects it', () => {
    expect(source).toMatch(/new ResizeObserver\(/)
    expect(source).toMatch(/\.disconnect\(\)/)
  })

  it('pages with scrollBy over pageScrollDelta, smooth', () => {
    expect(source).toMatch(/pageScrollDelta\(/)
    expect(source).toMatch(/scrollBy\(/)
    expect(source).toMatch(/behavior:\s*'smooth'/)
  })
})

describe('FocusRowStrip/index.tsx -- loads its own stylesheet', () => {
  it("imports './index.css' -- nothing else in the tree does, so without it every FocusRowStrip rule is dead", () => {
    expect(read(FOCUS_ROW_TSX_PATH)).toMatch(/import\s+'\.\/index\.css'/)
  })
})

describe('FocusRowStrip/index.css -- overflow controls (Plan 48-04)', () => {
  const css = read(FOCUS_ROW_CSS_PATH)
  const control = cssBlock(css, '.focusRowStrip__control')

  it('is a 36px circular overlay centred on the track', () => {
    expect(control).toMatch(/position:\s*absolute/)
    expect(control).toMatch(/top:\s*50%/)
    expect(control).toMatch(/translateY\(-50%\)/)
    expect(control).toMatch(/width:\s*36px/)
    expect(control).toMatch(/height:\s*36px/)
    expect(control).toMatch(/border-radius:\s*50%/)
  })

  it('places the edges with logical properties, not left/right', () => {
    expect(cssBlock(css, '.focusRowStrip__control--back')).toMatch(
      /inset-inline-start:\s*0/
    )
    expect(cssBlock(css, '.focusRowStrip__control--forward')).toMatch(
      /inset-inline-end:\s*0/
    )
    expect(cssBlock(css, '.focusRowStrip__control--back')).not.toMatch(
      /\bleft:/
    )
    expect(cssBlock(css, '.focusRowStrip__control--forward')).not.toMatch(
      /\bright:/
    )
  })

  it('declares the rgba fallback BEFORE the color-mix scrim', () => {
    const fallback = control.indexOf('rgba(0, 0, 0, 0.55)')
    const mixed = control.indexOf('color-mix(')
    expect(fallback).toBeGreaterThan(-1)
    expect(mixed).toBeGreaterThan(fallback)
  })

  it('colours the icon with --accent, never --border-color or --navbar-active', () => {
    expect(control).toMatch(/color:\s*var\(--accent\)/)
    expect(css).not.toMatch(/--border-color/)
    expect(css).not.toMatch(/--navbar-active(?!-background)/)
  })

  it('carries both focus arms with a positive outset outline-offset', () => {
    const block = cssBlock(
      css,
      '.focusRowStrip__control:focus-visible,\n.focusRowStrip__control:focus:is(body.controllerLayout *)'
    )
    expect(block).toMatch(/outline-offset:\s*2px/)
    expect(block).not.toMatch(/outline-offset:\s*-|calc\(-1/)
  })

  it('dims the disabled control at the existing 0.38 and nowhere else', () => {
    expect(cssBlock(css, '.focusRowStrip__control:disabled')).toMatch(
      /opacity:\s*0\.38/
    )
    expect(css.match(/opacity:/g)).toHaveLength(1)
  })

  it('never hides the controls by style -- absence is a mount decision', () => {
    expect(css).not.toMatch(/visibility:\s*hidden/)
  })

  it('does not reintroduce scrollbar-gutter anywhere in the stylesheet', () => {
    expect(css).not.toMatch(/scrollbar-gutter/)
  })
})
