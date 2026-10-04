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
