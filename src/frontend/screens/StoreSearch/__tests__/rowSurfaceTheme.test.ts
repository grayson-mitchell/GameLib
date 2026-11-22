/**
 * G-47-12c: in a light theme the Store Search rows were dark grey bands under near-black text.
 *
 * `.storeSearchRow` (and `.discountFilters`) painted `var(--gradient-gamecard)` with the
 * `background` shorthand. That gradient's first stop is a hardcoded 42% black no theme can
 * override, so it must never be a surface. (Deals cards and Library tiles escape only because
 * they declare it as `background-color`, which is invalid at computed-value time and paints
 * nothing.)
 *
 * The surface is the Library tile title-plate token `--gamecard-title-color` instead: it is
 * themeable, the theme editor exposes it, and every built-in theme sets it (light in Nord
 * Light). The token half of this suite measures it in all eleven built-ins, over each theme's body,
 * against the text colours that sit on it (sketch-findings multi-theme survival rule).
 *
 * Source-text only, like storeSearchThumbBox.test.ts: it proves the stylesheets and the tokens
 * agree, not that WebKit paints a light bar -- that last step is a live check in the real themes.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { BUILTIN_TOKENS } from 'frontend/customThemes/builtinTokens'
import { parseColour, tryContrast } from 'frontend/customThemes/colour'

// __dirname is src/frontend/screens/StoreSearch/__tests__; screens/ is two levels up.
const SCREENS = join(__dirname, '..', '..')

const STORE_SEARCH_CSS = join(SCREENS, 'StoreSearch', 'index.css')
const DISCOUNT_FILTERS_CSS = join(
  SCREENS,
  'Discounts',
  'components',
  'DiscountFilters',
  'index.css'
)

const STYLESHEETS = [STORE_SEARCH_CSS, DISCOUNT_FILTERS_CSS]

const TEXT_TINT =
  /^color-mix\(in srgb, var\(--text-default\) \d+%, transparent\)$/

const WHITE_ALPHA = /^rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/i

type Declaration = { selector: string; property: string; value: string }

function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Every `property: value` pair, with its rule's selector (whitespace collapsed). */
function declarationsOf(path: string): Declaration[] {
  const stripped = stripCssComments(readFileSync(path, 'utf-8'))
  const out: Declaration[] = []
  for (const rule of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (rule[1] ?? '').replace(/\s+/g, ' ').trim()
    for (const decl of (rule[2] ?? '').split(';')) {
      const colon = decl.indexOf(':')
      if (colon === -1) continue
      out.push({
        selector,
        property: decl.slice(0, colon).trim().toLowerCase(),
        value: decl
          .slice(colon + 1)
          .replace(/\s+/g, ' ')
          .trim()
      })
    }
  }
  return out
}

const backgroundsOf = (path: string): Declaration[] =>
  declarationsOf(path).filter(
    (d) => d.property === 'background' || d.property === 'background-color'
  )

/** The `background` value of the rule whose selector is exactly `selector`. */
function backgroundOfRule(path: string, selector: string): string | undefined {
  return backgroundsOf(path).find((d) => d.selector === selector)?.value
}

describe('stylesheet surfaces are theme-safe (G-47-12c)', () => {
  describe.each(STYLESHEETS)('%s', (path) => {
    it('never paints the card-art overlay gradient as a background', () => {
      const offenders = backgroundsOf(path).filter((d) =>
        d.value.includes('gradient-gamecard')
      )
      expect(offenders).toEqual([])
    })

    it('has no white-alpha background literal that vanishes on a light surface', () => {
      const offenders = backgroundsOf(path).filter((d) =>
        WHITE_ALPHA.test(d.value)
      )
      expect(offenders).toEqual([])
    })
  })

  it('.storeSearchRow is the theme title-plate surface', () => {
    expect(backgroundOfRule(STORE_SEARCH_CSS, '.storeSearchRow')).toBe(
      'var(--gamecard-title-color)'
    )
  })

  it('the breakdown item hover tint derives from the theme text colour', () => {
    expect(
      backgroundOfRule(
        STORE_SEARCH_CSS,
        '.storeSearchRow__breakdownItem:hover, .storeSearchRow__breakdownItem:focus-visible'
      )
    ).toMatch(TEXT_TINT)
  })

  it('.discountFilters is the same theme title-plate surface', () => {
    expect(backgroundOfRule(DISCOUNT_FILTERS_CSS, '.discountFilters')).toBe(
      'var(--gamecard-title-color)'
    )
  })

  it.each([
    '.discountFilters__toggle:hover',
    '.discountFilters__segment:hover:not(.discountFilters__segment--active)',
    '.discountFilters__labelMeta'
  ])('%s tint derives from the theme text colour', (selector) => {
    expect(backgroundOfRule(DISCOUNT_FILTERS_CSS, selector)).toMatch(TEXT_TINT)
  })
})

/** The plate composited over the body, as an opaque rgb() string. */
function plateOverBody(tokens: Readonly<Record<string, string>>): string {
  const plate = parseColour(tokens['--gamecard-title-color'] ?? '')
  const body = parseColour(tokens['--body-background'] ?? '')
  if (!plate || !body) throw new Error('plate or body token is not a colour')
  const mix = (top: number, under: number) =>
    Math.round(top * plate.a + under * (1 - plate.a))
  return `rgb(${mix(plate.r, body.r)}, ${mix(plate.g, body.g)}, ${mix(plate.b, body.b)})`
}

const isLight = (colour: string): boolean =>
  (tryContrast('#000000', colour) ?? 0) > (tryContrast('#ffffff', colour) ?? 0)

describe('--gamecard-title-color is a legible row surface in every built-in theme (G-47-12c)', () => {
  const themes = Object.entries(BUILTIN_TOKENS)

  it('covers all eleven built-in themes', () => {
    expect(themes).toHaveLength(11)
  })

  describe.each(themes)('%s', (_name, tokens) => {
    it('keeps --text-default at 4.5:1 or better on the plate', () => {
      const ratio = tryContrast(tokens['--text-default'], plateOverBody(tokens))
      expect(ratio).not.toBeNull()
      expect(ratio ?? 0).toBeGreaterThanOrEqual(4.5)
    })

    it('keeps --text-secondary at 4.5:1 or better on the plate', () => {
      const ratio = tryContrast(
        tokens['--text-secondary'],
        plateOverBody(tokens)
      )
      expect(ratio).not.toBeNull()
      expect(ratio ?? 0).toBeGreaterThanOrEqual(4.5)
    })

    it('gives a light body a light plate', () => {
      if (!isLight(tokens['--body-background'] ?? '')) return
      expect(isLight(plateOverBody(tokens))).toBe(true)
    })
  })

  it('has at least one light-bodied theme, so the light-plate check is not vacuous', () => {
    const light = themes.filter(([, tokens]) =>
      isLight(tokens['--body-background'] ?? '')
    )
    expect(light.map(([name]) => name)).toEqual(
      expect.arrayContaining(['nord-light', 'gamelib-light'])
    )
  })
})
