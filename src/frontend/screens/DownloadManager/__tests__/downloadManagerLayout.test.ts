/**
 * Source-text layout gates for the Steam-style Download Manager page (quick
 * 261012-dhs, D-04). This jest project has no jsdom and no CSS engine, so the
 * visual result is a live-gate item; these gates prove the source says what it
 * must. Every source is comment-stripped first so prose that mentions a
 * forbidden token cannot trip (or hide) a gate.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

// Hoisted so each prohibition and its SANITY counter-test consume the exact
// same detector.
const H4_PATTERN = /<h4\b/
const LEGACY_BOXED_PATTERN =
  /dmItemList|downloadManagerCurrentSectionTitle|DownloadManagerHeader/
const SECOND_BAR_PATTERN = /LinearProgress|downloadBar/
const DIVIDER_TOKEN_PATTERN = /var\(--divider/
const CSS_URL_ART_PATTERN = /backgroundImage|url\(/

const SCREEN = join(__dirname, '..')

function read(...parts: string[]): string {
  return stripSourceComments(readFileSync(join(SCREEN, ...parts), 'utf8'))
}

/** Brace-counting block extractor (mirrors themeTokens.test.ts's cssBlock). */
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

describe('Download Manager page -- Steam-style structure', () => {
  const page = read('index.tsx')

  it('renders the hero and both section headers', () => {
    expect(page).toContain('<DownloadHero')
    expect(page).toContain('gamelib:downloadManager.upNext')
    expect(page).toContain('queue.label.finished')
    expect(page).toContain('dmSection__header')
  })

  it('has no h4 page title', () => {
    expect(page).not.toMatch(H4_PATTERN)
  })

  it('SANITY: the h4 prohibition fires against a known-bad input', () => {
    expect('<h4 style={{}}>Downloads</h4>').toMatch(H4_PATTERN)
  })

  it('carries none of the legacy boxed-section classes or the column-header row', () => {
    expect(page).not.toMatch(LEGACY_BOXED_PATTERN)
  })

  it('SANITY: the legacy-class prohibition fires against known-bad inputs', () => {
    expect('<div className="dmItemList">').toMatch(LEGACY_BOXED_PATTERN)
    expect('<DownloadManagerHeader time="queued" />').toMatch(
      LEGACY_BOXED_PATTERN
    )
    expect('className="downloadManagerCurrentSectionTitle"').toMatch(
      LEGACY_BOXED_PATTERN
    )
  })
})

describe('exactly one progress bar on the page', () => {
  it('ProgressHeader renders no LinearProgress and no downloadBar block', () => {
    expect(read('components', 'ProgressHeader', 'index.tsx')).not.toMatch(
      SECOND_BAR_PATTERN
    )
    expect(read('components', 'ProgressHeader', 'index.css')).not.toMatch(
      SECOND_BAR_PATTERN
    )
  })

  it('SANITY: the second-bar prohibition fires against known-bad inputs', () => {
    expect('<LinearProgress variant="determinate" />').toMatch(
      SECOND_BAR_PATTERN
    )
    expect('<div className="downloadBar">').toMatch(SECOND_BAR_PATTERN)
  })
})

describe('Setup section (quick 261027-tot)', () => {
  const page = read('index.tsx')
  const SETUP_ITEM_IN_SECTION =
    /<section className="dmSection">(?:(?!<\/section>)[\s\S])*<SetupDownloadItem\b/

  it('the page renders <SetupDownloadItem inside a dmSection', () => {
    expect(page).toMatch(SETUP_ITEM_IN_SECTION)
    expect(page).toContain('gamelib:downloadManager.setup.title')
  })

  it('SANITY: the in-section detector rejects an item outside any section', () => {
    expect(
      '<section className="dmSection"></section><SetupDownloadItem row={r} />'
    ).not.toMatch(SETUP_ITEM_IN_SECTION)
    expect(
      '<section className="dmSection"><div><SetupDownloadItem row={r} /></div></section>'
    ).toMatch(SETUP_ITEM_IN_SECTION)
  })

  it('SetupDownloadItem adds no second bar block and no --divider token', () => {
    const item = read('components', 'SetupDownloadItem', 'index.tsx')
    const css = read('components', 'SetupDownloadItem', 'index.css')
    expect(item).not.toMatch(SECOND_BAR_PATTERN)
    expect(css).not.toMatch(SECOND_BAR_PATTERN)
    expect(css).not.toMatch(DIVIDER_TOKEN_PATTERN)
    expect(css).not.toMatch(CSS_URL_ART_PATTERN)
  })

  it('SetupDownloadItem uses literal translation keys for both labels', () => {
    const item = read('components', 'SetupDownloadItem', 'index.tsx')
    expect(item).toContain('gamelib:downloadManager.setup.steamClient')
    expect(item).toContain('gamelib:downloadManager.setup.steamBottle')
  })
})

describe('DownloadHero stylesheet', () => {
  const css = read('components', 'DownloadHero', 'index.css')

  it('the bar is full width with no margin of any kind (edge-to-edge)', () => {
    const bar = cssBlock(css, '.downloadHero__bar')
    expect(bar).toMatch(/width:\s*100%/)
    expect(bar).not.toMatch(/margin/)
  })

  it('SANITY: cssBlock refuses a selector that is absent (not vacuously empty)', () => {
    expect(() => cssBlock(css, '.noSuchSelector')).toThrow()
  })

  it('the bar fill is painted with the accent token', () => {
    expect(cssBlock(css, '.downloadHero__barFill')).toMatch(/var\(--accent\)/)
  })
})

describe('separators are theme-safe', () => {
  it('neither new stylesheet uses var(--divider) -- it is declared in only 2 of 10 themes', () => {
    expect(read('index.css')).not.toMatch(DIVIDER_TOKEN_PATTERN)
    expect(read('components', 'DownloadHero', 'index.css')).not.toMatch(
      DIVIDER_TOKEN_PATTERN
    )
  })

  it('SANITY: the --divider prohibition fires against a known-bad input', () => {
    expect('border-bottom: 1px solid var(--divider);').toMatch(
      DIVIDER_TOKEN_PATTERN
    )
  })

  it('the section header carries a 1px solid bottom border drawn from --text-secondary', () => {
    const header = cssBlock(read('index.css'), '.dmSection__header')
    expect(header).toMatch(/border-bottom:\s*1px solid/)
    expect(header).toMatch(/var\(--text-secondary\)/)
  })
})

describe('hero art is an <img>, never a CSS url() (T-261012-dhs-01)', () => {
  const hero = read('components', 'DownloadHero', 'index.tsx')

  it('uses CachedImage fed by heroArtSources', () => {
    expect(hero).toContain('CachedImage')
    expect(hero).toContain('heroArtSources(')
  })

  it('never builds a background-image or url() from store-supplied text', () => {
    expect(hero).not.toMatch(CSS_URL_ART_PATTERN)
    expect(read('components', 'DownloadHero', 'index.css')).not.toMatch(
      CSS_URL_ART_PATTERN
    )
  })

  it('SANITY: the css-url prohibition fires against known-bad inputs', () => {
    expect('style={{ backgroundImage: `url(${art})` }}').toMatch(
      CSS_URL_ART_PATTERN
    )
    expect('background: url(x.png)').toMatch(CSS_URL_ART_PATTERN)
  })
})
