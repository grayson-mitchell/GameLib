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
import { GRID_CARD_MIN_WIDTH } from '../focusRowOverflow'

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

describe('FocusRowStrip/index.css -- chevron stacking contract (G-48-4b, G-48-9)', () => {
  // The track is its own stacking context, so every card-internal z-index
  // (hover 2, focus 3, title 3, icons bar 4, badges 5) stays inside it. The
  // positioned controls then paint above the track's z-index 0 layer, whatever
  // state any card is in.
  const css = read(FOCUS_ROW_CSS_PATH)
  const track = cssBlock(css, '.focusRowTrack')
  const control = cssBlock(css, '.focusRowStrip__control')

  it('Test 1: .focusRowTrack declares isolation: isolate', () => {
    expect(track).toMatch(/isolation:\s*isolate/)
  })

  it('Test 2: .focusRowTrack declares no z-index -- a positive value could lift the whole track above the controls', () => {
    expect(track).not.toMatch(/z-index/)
  })

  it('Test 3: .focusRowStrip__control is position: absolute with an integer z-index of at least 1', () => {
    expect(control).toMatch(/position:\s*absolute/)
    const z = control.match(/z-index:\s*(-?\d+)\s*;/)
    expect(z).not.toBeNull()
    expect(Number(z?.[1])).toBeGreaterThanOrEqual(1)
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

const GAME_CARD_CSS_PATH =
  'src/frontend/screens/Library/components/GameCard/index.css'
const THEMES_SCSS_PATH = 'src/frontend/themes.scss'
const TYPOGRAPHY_SCSS_PATH = 'src/frontend/styles/_typography.scss'

/** Every top-level block whose selector text matches `selector` (whitespace
 * tolerant), brace-counted. */
function cssBlocks(source: string, selectorPattern: RegExp): string[] {
  const out: string[] = []
  const re = new RegExp(selectorPattern.source + '\\s*{', 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    const open = match.index + match[0].length - 1
    let depth = 0
    for (let i = open; i < source.length; i++) {
      if (source[i] === '{') depth++
      if (source[i] === '}') {
        depth--
        if (depth === 0) {
          out.push(source.slice(open + 1, i))
          break
        }
      }
    }
  }
  return out
}

/** A parsed number, or a throw naming the file and pattern -- never a literal
 * fallback, so a renamed declaration cannot leave a gate passing on nothing. */
function parsed(
  source: string,
  pattern: RegExp,
  file: string,
  what: string
): number {
  const m = source.match(pattern)
  const n = Number(m?.[1])
  if (!m || !Number.isFinite(n)) {
    throw new Error(`${file}: no match for ${what} (${String(pattern)})`)
  }
  return n
}

describe('FocusRowStrip/index.css -- strip-end clearance (G-48-8a / G-48-8b / G-48-8c)', () => {
  // The first card at scrollLeft 0 and the last at the end of travel need room
  // for a scaled card's ring. G-48-8c widened the cards to the grid's column
  // width: the 9.15px reach at 156px becomes 13.65px horizontally and 18.60px
  // vertically at the 336px supremum (one column, just before a second fits).
  // So the list pads 15px inline: that covers 13.65 with 1.35px to spare, stays
  // under the strip's 16px gutter (Test H), and stays a px value so Tests F-H
  // keep parsing px and keep bleed = padding. The vertical room scales with the
  // card instead (Test V): a fixed 19px would add 3px above and below the strip
  // at every width for a band only single-column windows reach. The viewport
  // bleeds out by the list padding so cards keep their x-position over the grid.
  // Every number below is parsed from the shipped stylesheets, never restated.
  const css = read(FOCUS_ROW_CSS_PATH)
  const list = cssBlock(css, '.focusRowTrack .gameList')
  const viewport = cssBlock(css, '.focusRowStrip__viewport')
  const strip = cssBlock(css, '.focusRowStrip')

  const inlinePadding = Number(
    list.match(/padding-inline:\s*(\d+(?:\.\d+)?)px\s*;/)?.[1]
  )
  const bleed = Number(
    viewport.match(/margin-inline:\s*-(\d+(?:\.\d+)?)px\s*;/)?.[1]
  )

  const gridBlock = cssBlock(read(LIBRARY_CSS_PATH), '.gameList')
  const gameCard = read(GAME_CARD_CSS_PATH)
  const themes = read(THEMES_SCSS_PATH)
  const typography = read(TYPOGRAPHY_SCSS_PATH)

  const minWidth = parsed(
    gridBlock,
    /minmax\(\s*(\d+(?:\.\d+)?)px,\s*1fr\s*\)/,
    LIBRARY_CSS_PATH,
    'the .gameList minmax() floor'
  )
  const rootPx = parsed(
    typography,
    /font-size:\s*(\d+(?:\.\d+)?)px\s*;/,
    TYPOGRAPHY_SCSS_PATH,
    'the root px font-size'
  )
  const gapPx =
    parsed(
      gridBlock,
      /grid-gap:\s*(\d+(?:\.\d+)?)rem\s*;/,
      LIBRARY_CSS_PATH,
      'the .gameList grid-gap in rem'
    ) * rootPx
  // One column, just before a second fits: the column is at most C and
  // C < 2 x min + gap, so a grid card is never wider than this.
  const supremumWidth = 2 * minWidth + gapPx

  const ringDecls = themes.match(/--focus-ring-width:\s*(\d+(?:\.\d+)?)px/g)
  if (ringDecls?.length !== 1) {
    throw new Error(
      `${THEMES_SCSS_PATH}: expected exactly one --focus-ring-width declaration, found ${ringDecls?.length ?? 0}`
    )
  }
  const ringWidth = parsed(
    themes,
    /--focus-ring-width:\s*(\d+(?:\.\d+)?)px/,
    THEMES_SCSS_PATH,
    '--focus-ring-width'
  )
  const grouped = cssBlocks(
    gameCard,
    /\.gameCard:hover,\s*\.gameCard:focus-within/
  )
  const ringOffset = parsed(
    grouped.find((b) => /outline-offset/.test(b)) ?? '',
    /outline-offset:\s*(\d+(?:\.\d+)?)px/,
    GAME_CARD_CSS_PATH,
    'the grouped hover/focus outline-offset'
  )
  const scale = parsed(
    grouped.find((b) => /transform:/.test(b)) ?? '',
    /transform:\s*scale\(\s*(\d+(?:\.\d+)?)\s*\)/,
    GAME_CARD_CSS_PATH,
    'the grouped hover/focus transform: scale()'
  )
  const ratioMatch = cssBlock(gameCard, '.gameCard').match(
    /aspect-ratio:\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*;/
  )
  if (!ratioMatch) {
    throw new Error(`${GAME_CARD_CSS_PATH}: no .gameCard aspect-ratio`)
  }
  const cardRatio = Number(ratioMatch[1]) / Number(ratioMatch[2])

  // How far past an unscaled edge the ring reaches when a length `side` (the
  // card's width or height) is scaled about its centre.
  const reach = (side: number) =>
    (side / 2 + ringWidth + ringOffset) * scale - side / 2

  it('non-vacuity: the parsed geometry is the shipped one (336px supremum, 13.65 and 18.60 reach)', () => {
    expect(minWidth).toBe(156)
    expect(gapPx).toBe(24)
    expect(supremumWidth).toBe(336)
    expect(ringWidth).toBe(3)
    expect(ringOffset).toBe(2)
    expect(scale).toBe(1.05)
    expect(reach(supremumWidth)).toBeCloseTo(13.65, 2)
    expect(reach(supremumWidth / cardRatio)).toBeCloseTo(18.6, 1)
  })

  it('Test F: the list declares width: max-content, padding-block: 0 and padding-inline covering the ring reach at the widest grid card', () => {
    expect(list).toMatch(/width:\s*max-content\s*;/)
    expect(list).toMatch(/padding-block:\s*0\s*;/)
    expect(Number.isFinite(inlinePadding)).toBe(true)
    expect(inlinePadding).toBeGreaterThanOrEqual(reach(supremumWidth))
  })

  it('Test V: the list block margin scales with the card and covers the vertical reach at the floor and the supremum', () => {
    const m = list.match(
      /margin-block:\s*max\(\s*var\(--space-md\)\s*,\s*calc\(\s*var\(--focus-row-card-width,\s*(\d+(?:\.\d+)?)px\)\s*\*\s*(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)px\s*\)\s*\)\s*;/
    )
    if (!m) {
      throw new Error(
        `${FOCUS_ROW_CSS_PATH}: .focusRowTrack .gameList declares no margin-block: max(var(--space-md), calc(var(--focus-row-card-width, Npx) * K + Bpx))`
      )
    }
    const [fallback, k, b] = [Number(m[1]), Number(m[2]), Number(m[3])]
    expect(fallback).toBe(minWidth)
    for (const w of [minWidth, supremumWidth]) {
      expect(k * w + b).toBeGreaterThanOrEqual(reach(w / cardRatio))
    }
    // The slope dominates the reach's slope, so the claim holds at every
    // width between and beyond, not only at the two probed.
    expect(k).toBeGreaterThanOrEqual((scale - 1) / 2 / cardRatio)
  })

  it('Test F: the list has no padding shorthand that could zero the inline value', () => {
    expect(list).not.toMatch(/(^|[\s;])padding:/)
  })

  it('Test G: the viewport bleeds out by exactly the list padding, so cards stay aligned with the grid', () => {
    expect(Number.isFinite(bleed)).toBe(true)
    expect(bleed).toBe(inlinePadding)
  })

  it('Test H: the strip keeps its 16px gutter, and the bleed stays inside it', () => {
    expect(strip).toMatch(
      /padding:\s*0\s+var\(--space-md-fixed\)\s+var\(--space-md-fixed\)\s*;/
    )
    expect(bleed).toBeLessThan(16)
  })
})

describe('FocusRowStrip/index.css -- .focusRowTrack .gameList > * (G-48-8c)', () => {
  // The 2026-10-07 ruling "match the grid" amends D-01: the card width is no
  // longer a constant. It is the grid's column width, written as
  // --focus-row-card-width by createStripCardWidthSync; 156px is the grid's
  // floor and the pre-measurement fallback.
  const css = read(FOCUS_ROW_CSS_PATH)
  const block = cssBlock(css, '.focusRowTrack .gameList > *')
  const gridBlock = cssBlock(read(LIBRARY_CSS_PATH), '.gameList')

  const fallback = Number(
    block.match(
      /flex:\s*0\s+0\s+var\(--focus-row-card-width,\s*(\d+(?:\.\d+)?)px\)\s*;/
    )?.[1]
  )
  const gridMin = Number(
    gridBlock.match(/minmax\(\s*(\d+(?:\.\d+)?)px,\s*1fr\s*\)/)?.[1]
  )

  it('sizes the card from the derived custom property: flex: 0 0 var(--focus-row-card-width, Npx)', () => {
    expect(Number.isFinite(fallback)).toBe(true)
  })

  it('the fallback N equals the grid minmax() floor parsed from Library/index.css and the exported GRID_CARD_MIN_WIDTH', () => {
    expect(Number.isFinite(gridMin)).toBe(true)
    expect(fallback).toBe(gridMin)
    expect(GRID_CARD_MIN_WIDTH).toBe(gridMin)
  })

  it('never uses minmax( or 1fr -- flex-grow and flex-shrink stay 0, so the derived width is exact', () => {
    expect(block).not.toMatch(/minmax\(/)
    expect(block).not.toMatch(/1fr/)
  })
})

describe('FocusRowStrip/index.css -- strip/grid parity (G-48-8c)', () => {
  // The strip derives the grid's column from the same inputs, so the inputs
  // must be the same: gap and inline gutter are compared against the grid
  // stylesheet, never restated.
  const strip = read(FOCUS_ROW_CSS_PATH)
  const grid = cssBlock(read(LIBRARY_CSS_PATH), '.gameList')
  const stripList = cssBlock(strip, '.focusRowTrack .gameList')
  const stripOuter = cssBlock(strip, '.focusRowStrip')

  it('the strip list gap text equals the grid grid-gap text', () => {
    const stripGap = stripList.match(/(?:^|[\s;])gap:\s*([^;]+);/)?.[1]
    const gridGap = grid.match(/grid-gap:\s*([^;]+);/)?.[1]
    expect(gridGap).toBeDefined()
    expect(stripGap?.trim()).toBe(gridGap?.trim())
  })

  it('the grid inline padding token equals the strip inline padding token', () => {
    const token = (block: string) =>
      block.match(/padding:\s*0\s+(var\(--[\w-]+\))/)?.[1]
    expect(token(grid)).toBeDefined()
    expect(token(stripOuter)).toBe(token(grid))
  })
})

describe('FocusRowStrip -- width sync wiring (G-48-8c)', () => {
  const tsx = read(FOCUS_ROW_TSX_PATH)
  const overflow = read(
    'src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts'
  )

  it('index.tsx imports createStripCardWidthSync from ./focusRowOverflow and useLayoutEffect from react', () => {
    expect(tsx).toMatch(
      /import\s*{[^}]*\bcreateStripCardWidthSync\b[^}]*}\s*from\s*'\.\/focusRowOverflow'/
    )
    expect(tsx).toMatch(
      /import\s+React,\s*{[^}]*\buseLayoutEffect\b[^}]*}\s*from\s*'react'/
    )
  })

  it('syncs inside a useLayoutEffect, so the first painted frame is already matched', () => {
    expect(tsx).toMatch(
      /useLayoutEffect\(\s*\(\)\s*=>\s*{[^}]*syncCardWidth\(trackRef\.current\)/
    )
  })

  it('the ResizeObserver callback syncs the width, not bare readMeasurement', () => {
    expect(tsx).toMatch(
      /new ResizeObserver\(\s*\(\)\s*=>\s*{[^}]*syncCardWidth\(track\)/
    )
    expect(tsx).not.toMatch(/new ResizeObserver\(readMeasurement\)/)
  })

  it("focusRowOverflow.ts writes the property by string literal at the call site (cssTokenSweep's detector needs it)", () => {
    expect(overflow).toMatch(/setProperty\('--focus-row-card-width'/)
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

  it('paints one opaque var(--body-background) disc -- no translucency token (G-48-4a)', () => {
    // A flat alpha over artwork cannot bound the glyph contrast (UAT item 4:
    // 12 of 40 combinations under 3:1, minimum 1.005). One opaque paint makes
    // the ratio a property of the theme; themeTokens.test.ts holds the census.
    const paints = control.match(/(?:^|[;\s])background(?:-color)?\s*:[^;]+/g)
    expect(paints).toHaveLength(1)
    expect((paints ?? [''])[0]).toMatch(
      /background\s*:\s*var\(--body-background\)\s*$/
    )
    expect(control).not.toMatch(
      /color-mix\(|rgba?\(|hsla?\(|transparent|gradient/i
    )
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
