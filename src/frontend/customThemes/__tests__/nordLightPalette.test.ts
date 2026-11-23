/**
 * Quick 261122-qwk. Two properties, both guarded here.
 *
 * 1. `nord-light` is a faithful Nord theme: everywhere it is scoped, it declares
 *    only the 16 official Nord colours (or alpha forms of them). Scoped means the
 *    `body.nord-light` block in themes.scss, every `body.nord-light`-scoped rule in
 *    any other frontend stylesheet, the thumbnail base-override literal, and the
 *    resolved token seed.
 * 2. `gamelib-light` is GameLib's own light theme (quick 261123-pnl): light
 *    chrome, one #4c6f99 accent with white labels on every action fill, green
 *    only as status text, and neutral greys for secondary surfaces. It began as
 *    the pre-change Nord Light; the verbatim pin was replaced by a pin of the
 *    new palette, its contrast pairs and its re-paired rules.
 *
 * The guard checks declared literals and resolved tokens. It does NOT check
 * colours computed at render time by `color-mix()` between two palette colours.
 */
import { readFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { cssBlock, customProps } from 'frontend/testUtils/scssTokenSource'
import { contrastRatio, parseColour } from '../colour'
import { BUILTIN_TOKENS } from '../builtinTokens'
import { BASE_PREVIEW_OVERRIDES, thumbnailPalette } from '../thumbnailPalette'
import preChange from './fixtures/nordLightPreChange.json'

// __dirname is src/frontend/customThemes/__tests__
const FRONTEND_ROOT = join(__dirname, '../..')
const REPO_ROOT = join(FRONTEND_ROOT, '../..')
const THEMES_SCSS = join(FRONTEND_ROOT, 'themes.scss')

// The 16 official Nord colours (https://www.nordtheme.com/docs/colors-and-palettes).
const NORD_PALETTE = [
  '#2e3440', // nord0  Polar Night
  '#3b4252', // nord1
  '#434c5e', // nord2
  '#4c566a', // nord3
  '#d8dee9', // nord4  Snow Storm
  '#e5e9f0', // nord5
  '#eceff4', // nord6
  '#8fbcbb', // nord7  Frost
  '#88c0d0', // nord8
  '#81a1c1', // nord9
  '#5e81ac', // nord10
  '#bf616a', // nord11 Aurora
  '#d08770', // nord12
  '#ebcb8b', // nord13
  '#a3be8c', // nord14
  '#b48ead' // nord15
]

// themeTokens.test.ts's census "no theme block redeclares --neutral-04 or
// --neutral-05" forbids any theme block from declaring these two global
// constants, so nord-light cannot give them a palette value.
const EXEMPT = new Set(['--neutral-04', '--neutral-05'])

const PALETTE_RGB = new Set(
  NORD_PALETTE.map((hex) => {
    const c = parseColour(hex)
    return c ? `${c.r},${c.g},${c.b}` : 'invalid'
  })
)

/**
 * Every colour literal in `text` that is not a Nord palette colour. Custom
 * property names are removed first: otherwise the `black` in
 * `--eighty-percent-black` would count as a named colour.
 */
const offPalette = (text: string): string[] => {
  const bare = text.replace(/--[\w-]+/g, ' ')
  const literals = [
    ...(bare.match(/#[0-9a-fA-F]{3,8}(?![\w-])/g) ?? []),
    ...(bare.match(/rgba?\([^)]*\)/gi) ?? []),
    ...(bare.match(/(?<![\w-])(?:white|black|gray|grey)(?![\w-])/gi) ?? [])
  ]
  return literals.filter((literal) => {
    const c = parseColour(literal)
    return c === null || !PALETTE_RGB.has(`${c.r},${c.g},${c.b}`)
  })
}

const offPaletteTokens = (
  seed: Readonly<Record<string, string>>
): Array<[string, string]> =>
  Object.entries(seed).filter(
    ([name, value]) => !EXEMPT.has(name) && offPalette(value).length > 0
  )

const readStripped = (file: string): string =>
  stripSourceComments(readFileSync(file, 'utf8'))

const stylesheetsUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '__tests__' || entry.name === 'node_modules') return []
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return stylesheetsUnder(full)
    return /\.(scss|css)$/.test(entry.name) ? [full] : []
  })

/** Body of the brace-matched block that opens at the first `{` from `from`. */
const blockAfter = (source: string, from: number): string => {
  const open = source.indexOf('{', from)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) {
      return source.slice(open + 1, i)
    }
  }
  throw new Error('unterminated block')
}

const NORD_LIGHT_SELECTOR = /body\.nord-light(?![\w-])/g

/** Every rule body whose selector names `body.nord-light`, per file. */
const nordLightRules = (): Array<{ file: string; body: string }> =>
  stylesheetsUnder(FRONTEND_ROOT).flatMap((file) => {
    const source = readStripped(file)
    return [...source.matchAll(NORD_LIGHT_SELECTOR)].map((m) => ({
      file: relative(REPO_ROOT, file),
      body: blockAfter(source, m.index ?? 0)
    }))
  })

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim()

describe('Nord Light uses only the official Nord palette', () => {
  const rules = nordLightRules()

  it('every body.nord-light-scoped rule in any frontend stylesheet declares palette colours only', () => {
    const offenders = rules.flatMap(({ file, body }) =>
      offPalette(body).map((literal) => `${file}: ${literal}`)
    )
    expect(offenders).toEqual([])
  })

  it('non-vacuity: the scan reaches the stylesheets that scope nord-light', () => {
    const files = new Set(rules.map((r) => r.file))
    for (const expected of [
      'src/frontend/themes.scss',
      'src/frontend/styles/_buttons.scss',
      'src/frontend/components/UI/NavShell/components/NavTabs/index.scss',
      'src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss',
      'src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss',
      'src/frontend/screens/Library/components/LibrarySignInNotice/index.scss'
    ]) {
      expect(files).toContain(expected)
    }
  })

  it('the thumbnail base override for nord-light has a literal, and it is palette', () => {
    const literals = Object.values(BASE_PREVIEW_OVERRIDES['nord-light'] ?? {})
      .flatMap((override) =>
        override && 'literal' in override ? [override.literal] : []
      )
      .filter((literal) => literal.length > 0)
    expect(literals.length).toBeGreaterThan(0)
    expect(literals.flatMap(offPalette)).toEqual([])
  })

  it('every token in the resolved nord-light seed is palette, bar the two exempt globals', () => {
    const seed = BUILTIN_TOKENS['nord-light'] ?? {}
    expect(Object.keys(seed).length).toBeGreaterThanOrEqual(90)
    expect(offPaletteTokens(seed)).toEqual([])
    const declared = customProps(
      cssBlock(readStripped(THEMES_SCSS), 'body.nord-light')
    )
    for (const name of EXEMPT) expect(declared.has(name)).toBe(false)
  })

  it('checker can fail, in memory only', () => {
    const flagged = offPaletteTokens(preChange).map(([name]) => name)
    expect(flagged).toContain('--fav')
    expect(offPalette('color: #ffffff;')).toEqual(['#ffffff'])
    // a custom-property NAME is not a colour; a declared literal is
    expect(offPalette('--eighty-percent-black: var(--x);')).toEqual([])
    expect(offPalette('background: rgba(0, 0, 0, 0.5);')).toHaveLength(1)
    // alpha forms of a palette colour pass
    expect(offPalette('background: rgba(46, 52, 64, 0.8);')).toEqual([])
    expect(offPalette('background: #e5e9f0cc;')).toEqual([])
  })
})

describe('GameLib Light is a light-chrome, one-accent theme (261123-pnl)', () => {
  const seed = BUILTIN_TOKENS['gamelib-light'] ?? {}
  const token = (name: string): string => seed[name] ?? ''
  const rawBlock = (): string =>
    cssBlock(readStripped(THEMES_SCSS), 'body.gamelib-light')
  const noticeSource = (): string =>
    readStripped(
      join(
        FRONTEND_ROOT,
        'screens/Library/components/LibrarySignInNotice/index.scss'
      )
    )

  it('D-01: the chrome is light, with legible labels and a seam under the top bar', () => {
    expect({
      bar: token('--navbar-background'),
      activeRow: token('--navbar-active-background'),
      inactive: token('--navbar-inactive'),
      active: token('--navbar-active'),
      accent: token('--navbar-accent'),
      brandText: token('--brand-text-01'),
      statusDefaultHover: token('--status-default-hover')
    }).toEqual({
      bar: '#e5e9f0',
      activeRow: '#d8dee9',
      inactive: '#4c566a',
      active: '#2e3440',
      accent: '#2e3440',
      brandText: '#2e3440',
      statusDefaultHover: '#2e3440'
    })
    const bar = token('--navbar-background')
    for (const name of [
      '--navbar-inactive',
      '--navbar-accent',
      '--brand-text-01'
    ]) {
      expect(contrastRatio(token(name), bar)).toBeGreaterThanOrEqual(4.5)
    }
    expect(
      contrastRatio(
        token('--navbar-active'),
        token('--navbar-active-background')
      )
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      contrastRatio(token('--status-default-hover'), bar)
    ).toBeGreaterThanOrEqual(3)
    expect(collapse(rawBlock())).toMatch(
      /\.NavShell__navbar \{ border-bottom-color: var\(--neutral-04\); \}/
    )
  })

  it('D-02: one accent family drives every action fill', () => {
    expect(token('--primary')).toBe('#4c6f99')
    expect(token('--primary-hover')).toBe('#3f5f86')
    for (const name of [
      '--accent',
      '--install-button',
      '--secondary-button',
      '--success-button',
      '--brand-primary'
    ]) {
      expect([name, token(name)]).toEqual([name, token('--primary')])
    }
    for (const name of [
      '--accent-overlay',
      '--brand-primary-hover',
      '--status-success-hover',
      '--text-hover'
    ]) {
      expect([name, token(name)]).toEqual([name, token('--primary-hover')])
    }
    expect(token('--text-tertiary')).toBe('#ffffff')
    expect(
      contrastRatio(token('--text-tertiary'), token('--primary'))
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      contrastRatio(token('--text-tertiary'), token('--primary-hover'))
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      contrastRatio(token('--accent'), token('--body-background'))
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('D-03: green is status text only and no Play control is green', () => {
    expect(token('--success')).toBe('#2f6b4b')
    for (const surface of [
      '--body-background',
      '--navbar-background',
      '--input-background'
    ]) {
      expect(
        contrastRatio(token('--success'), token(surface))
      ).toBeGreaterThanOrEqual(4.5)
    }
    expect(
      contrastRatio(token('--success-hover'), token('--body-background'))
    ).toBeGreaterThanOrEqual(4.5)
    const raw = rawBlock()
    const flat = collapse(raw)
    expect(flat).toContain(
      '.playIcon { --success: var(--accent); --success-hover: var(--primary-hover); }'
    )
    expect(flat).toContain(
      '.gameConfigContainer .MuiLinearProgress-root { --success: var(--accent); }'
    )
    expect(raw).not.toMatch(/^\s*button\.is-primary \{/m)
    expect(raw).not.toMatch(/^\s*\.button\.is-success \{/m)
  })

  it('D-04: secondary surfaces are neutral greys with dark text', () => {
    expect({
      tertiary: token('--tertiary-button'),
      tertiaryOverlay: token('--tertiary-button-overlay'),
      icons: token('--icons-background'),
      neutral03: token('--neutral-03')
    }).toEqual({
      tertiary: '#d8dee9',
      tertiaryOverlay: '#c8d0dc',
      icons: '#d8dee9',
      neutral03: '#b8c2d1'
    })
    expect(token('--text-log')).toBe(token('--text-default'))
    expect(
      contrastRatio(token('--text-default'), token('--tertiary-button-overlay'))
    ).toBeGreaterThanOrEqual(4.5)
    const flat = collapse(rawBlock())
    for (const rule of [
      '.genre { background: #e5e9f0 !important; color: #2e3440 !important; }',
      '.runnerIcon { background: var(--input-background); }',
      '.button.is-tertiary:not(:disabled) { color: var(--text-default); }'
    ]) {
      expect(flat).toContain(rule)
    }
  })

  it('D-01: block rules that assumed dark chrome are re-paired', () => {
    const raw = rawBlock()
    const flat = collapse(raw)
    const declared = customProps(raw)
    expect(flat).toContain(
      '.gameCard > .gameCardStatus { color: #d0ddff; --success: var(--status-success); }'
    )
    expect(flat).toContain(
      '.heroicVersion:hover { color: var(--primary-hover); }'
    )
    expect(flat).toContain('background-color: #c8d0dc;')
    expect(flat).toContain(
      '.introjs-nextbutton { color: var(--text-tertiary); }'
    )
    expect(declared.get('--osk-button-border')).toBe('var(--navbar-inactive)')
    expect(raw).not.toMatch(/^\s*\.button\.is-link \{/m)
    expect(raw).not.toMatch(/^\s*\.currentDownload \{/m)
  })

  it('D-05: the shared stylesheets scope nothing to gamelib-light beyond the sign-in triangle, tabs and facet row', () => {
    const buttons = readStripped(join(FRONTEND_ROOT, 'styles/_buttons.scss'))
    expect(buttons).not.toContain('gamelib-light')

    const notice = noticeSource()
    expect(collapse(cssBlock(notice, 'body.gamelib-light &'))).toBe(
      'color: var(--danger);'
    )
    expect(
      contrastRatio(token('--danger'), token('--navbar-background'))
    ).toBeGreaterThanOrEqual(3)

    const navTabs = readStripped(
      join(
        FRONTEND_ROOT,
        'components/UI/NavShell/components/NavTabs/index.scss'
      )
    )
    expect(collapse(cssBlock(navTabs, 'body.gamelib-light &'))).toBe(
      'color: var(--accent);'
    )

    const filterFocusRow = readStripped(
      join(
        FRONTEND_ROOT,
        'components/UI/NavShell/components/FilterFocusRow/index.scss'
      )
    )
    expect(filterFocusRow).toMatch(
      /body\.dracula &,\s*body\.nord-light &,\s*body\.gamelib-light & \{/
    )
  })
})

describe('Nord Light is Frost-forward (261122-rz8)', () => {
  const seed = BUILTIN_TOKENS['nord-light'] ?? {}
  const token = (name: string): string => seed[name] ?? ''
  const themesBlock = (): string =>
    cssBlock(readStripped(THEMES_SCSS), 'body.nord-light')

  it('Frost navbar: nord9 bar, nord8 active row, nord0 labels', () => {
    expect({
      bar: token('--navbar-background'),
      activeRow: token('--navbar-active-background'),
      inactive: token('--navbar-inactive'),
      active: token('--navbar-active'),
      accent: token('--navbar-accent')
    }).toEqual({
      bar: '#81a1c1',
      activeRow: '#88c0d0',
      inactive: '#2e3440',
      active: '#2e3440',
      accent: '#2e3440'
    })
    const bar = token('--navbar-background')
    expect(
      contrastRatio(token('--navbar-inactive'), bar)
    ).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(token('--navbar-accent'), bar)).toBeGreaterThanOrEqual(
      4.5
    )
    expect(
      contrastRatio(
        token('--navbar-active'),
        token('--navbar-active-background')
      )
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('the thumbnail draws the Frost navbar', () => {
    const palette = thumbnailPalette(seed, 'nord-light')
    expect({
      tabBar: palette.tabBar,
      sidebar: palette.sidebar,
      activeRow: palette.activeRow,
      inactiveLabel: palette.inactiveLabel,
      activeLabel: palette.activeLabel
    }).toEqual({
      tabBar: '#81a1c1',
      sidebar: '#81a1c1',
      activeRow: '#88c0d0',
      inactiveLabel: '#2e3440',
      activeLabel: '#2e3440'
    })
  })

  it('dark-bar assumptions in themes.scss and the sign-in notice are re-paired', () => {
    const block = themesBlock()
    const flat = collapse(block)
    const declared = customProps(block)
    const notice = readStripped(
      join(
        FRONTEND_ROOT,
        'screens/Library/components/LibrarySignInNotice/index.scss'
      )
    )
    const checks: Record<string, boolean> = {
      gameCardStatus: /\.gameCard > \.gameCardStatus \{ color: #88c0d0;/.test(
        flat
      ),
      heroicVersion: /\.heroicVersion \{ color: var\(--navbar-inactive\);/.test(
        flat
      ),
      heroicNewReleases:
        /\.heroicNewReleases > a \{[^}]*color: var\(--navbar-inactive\)/.test(
          flat
        ),
      menuItemHover:
        /\.MuiMenuItem-root:hover \{ background-color: var\(--brand-primary\);/.test(
          flat
        ),
      oskButtonBorder: declared.get('--osk-button-border') === '#4c566a',
      statusDefaultHover: declared.get('--status-default-hover') === '#2e3440',
      expiredIcon:
        collapse(cssBlock(notice, 'body.nord-light &')) ===
        'color: var(--navbar-inactive);'
    }
    expect(
      Object.entries(checks)
        .filter(([, ok]) => !ok)
        .map(([name]) => name)
    ).toEqual([])
  })

  it('tier-2 and tab chrome on the Frost bar are re-paired', () => {
    const navShell = join(FRONTEND_ROOT, 'components/UI/NavShell/components')
    const navTabs = collapse(readStripped(join(navShell, 'NavTabs/index.scss')))
    const facets = collapse(
      readStripped(join(navShell, 'FilterFacetGroup/index.scss'))
    )
    const checks: Record<string, boolean> = {
      tabHover:
        /&:hover \{[^}]*body\.nord-light & \{ color: var\(--navbar-inactive\); \}/.test(
          navTabs
        ),
      tabFocusRing:
        /&:focus-visible \{[^}]*body\.nord-light & \{ outline-color: var\(--navbar-inactive\); \}/.test(
          navTabs
        ),
      facetBox:
        /\.FilterFacetRow__box \{[^}]*body\.nord-light & \{ border-color: var\(--navbar-inactive, var\(--navbar-accent\)\); \}/.test(
          facets
        ),
      facetCount:
        /\.FilterFacetRow__count \{[^}]*body\.nord-light & \{ color: var\(--navbar-inactive, var\(--navbar-accent\)\); \}/.test(
          facets
        )
    }
    expect(
      Object.entries(checks)
        .filter(([, ok]) => !ok)
        .map(([name]) => name)
    ).toEqual([])
  })

  it('Frost primary: nord8 fill, nord0 label', () => {
    expect({
      primary: token('--primary'),
      installButton: token('--install-button'),
      primaryHover: token('--primary-hover'),
      textTertiary: token('--text-tertiary')
    }).toEqual({
      primary: '#88c0d0',
      installButton: '#88c0d0',
      primaryHover: '#81a1c1',
      // still nord6: it labels the dark accent and success badges
      textTertiary: '#eceff4'
    })
    const label = token('--text-default')
    expect(contrastRatio(label, token('--primary'))).toBeGreaterThanOrEqual(4.5)
    expect(
      contrastRatio(label, token('--primary-hover'))
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('Snow Storm layering: nord6 page, nord5 raised surfaces, nord4 controls', () => {
    expect({
      body: token('--body-background'),
      background: token('--background'),
      modal: token('--modal-background'),
      input: token('--input-background'),
      modalBorder: token('--modal-border'),
      osk: token('--osk-background')
    }).toEqual({
      body: '#eceff4',
      background: '#e5e9f0',
      modal: '#e5e9f0',
      input: '#d8dee9',
      modalBorder: '#d8dee9',
      osk: '#e5e9f0'
    })
    const modal = token('--modal-background')
    expect(
      contrastRatio(token('--text-default'), modal)
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      contrastRatio(token('--text-secondary'), modal)
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      contrastRatio(token('--border-color'), modal)
    ).toBeGreaterThanOrEqual(3)
  })

  it('the thumbnail draws the Frost primary and the nord5 tile', () => {
    const palette = thumbnailPalette(seed, 'nord-light')
    expect({
      primary: palette.primary,
      primaryLabel: palette.primaryLabel,
      tile: palette.tile
    }).toEqual({
      primary: '#88c0d0',
      primaryLabel: '#2e3440',
      tile: '#e5e9f0'
    })
  })

  it('the plain .button label rule is specificity-neutral and skips danger', () => {
    const buttons = readStripped(join(FRONTEND_ROOT, 'styles/_buttons.scss'))
    const flat = collapse(themesBlock())
    const checks: Record<string, boolean> = {
      whereSelectorCount:
        buttons.split(':where(body.nord-light)').length - 1 === 1,
      whereRuleInBaseButton:
        /:where\(body\.nord-light\) &:where\(:not\(\.is-danger\)\) \{ color: var\(--text-default\); \}/.test(
          collapse(cssBlock(buttons, '.button'))
        ),
      alphabetActive:
        /\.alphabet-filter-button--active \{ color: var\(--text-default\); \}/.test(
          flat
        ),
      diskLabelAndDlcAction:
        /\.diskLabel, \.dlcItem \.action \{ color: var\(--accent\); \}/.test(
          flat
        ),
      dialogPaper:
        /\.MuiDialog-paper \{ background-color: var\(--modal-background\);/.test(
          flat
        ),
      logAndErrorBoxes:
        /\.errorDialog\.error-box \{ background-color: #d8dee9; \}/.test(flat)
    }
    expect(
      Object.entries(checks)
        .filter(([, ok]) => !ok)
        .map(([name]) => name)
    ).toEqual([])
  })
})
