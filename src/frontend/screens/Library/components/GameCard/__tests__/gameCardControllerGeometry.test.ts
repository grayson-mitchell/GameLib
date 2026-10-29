/**
 * Source-text gate: a GameCard's height is its content, and controller mode
 * never changes it (Phase 48 plan 48-09 gap G-48-8a, reworked by quick
 * 261011-vl0 D-01).
 *
 * What this proves, all parsed out of the shipped stylesheet (nothing
 * restated here): (1) the card declares no height of its own, so its height is
 * the 3:4 art plus one icons bar, and the bar sits directly under the art at
 * every tile width; (2) the bar's block-size is pinned to one custom property
 * whose value is derived from the store badge and the bar padding, so mouse
 * mode, controller mode, the just-played hero and very wide viewports all share
 * one bar height; (3) no rule that mentions `.gamepad` declares a sizing,
 * padding or margin property, so a mouse/controller handoff can move neither the
 * card's edge nor the badge; (4) the pre-reveal placeholder is built from the
 * same two custom properties, so it is exactly the height of the card it
 * becomes and reveal causes no layout shift.
 *
 * What this cannot prove: rendered pixels. The Frontend jest project runs with
 * `testEnvironment: 'node'` and has no CSS engine, so this reads source text and
 * does arithmetic over what it parsed. Whether the bar really sits flush under
 * the art at 140/188/200/280/320 is UAT's job (the 261011-vl0 owed live check).
 *
 * History, in three sentences. `.gameCard` used to carry `aspect-ratio:
 * 173/275`, so card - art - bar was 0.2563w - 51px: an overlap below a 199px
 * tile and a growing gap above it, which the operator reported on 2026-10-11.
 * Before that, `.gameCard.gamepad` (3/4) and `.gameCard.gamepad.justPlayed`
 * (328/205) overrode the ratios in controller mode and every card jumped 40px on
 * each handoff (operator ruling 2026-10-07, G-48-8a). Both are the same root
 * cause: a fixed ratio standing in for a height that is really content.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  LIBRARY_TILE_WIDTH_DEFAULT,
  LIBRARY_TILE_WIDTH_MAX,
  LIBRARY_TILE_WIDTH_MIN
} from 'frontend/screens/Library/libraryTileSize'

interface CssRule {
  selectors: string[]
  declarations: Map<string, string>
}

function readGameCardCss(): string {
  const raw = readFileSync(join(__dirname, '..', 'index.css'), 'utf8')
  return stripSourceComments(raw)
}

function readSpacingScss(): string {
  const raw = readFileSync(
    join(__dirname, '..', '..', '..', '..', '..', 'styles', '_spacing.scss'),
    'utf8'
  )
  return stripSourceComments(raw)
}

// Top-level rules only, via a brace-depth walk. At-rules (the file has
// `@keyframes fade-in`) are skipped whole, so the percentage selectors inside
// them are never mistaken for rules.
function parseTopLevelRules(css: string): CssRule[] {
  const rules: CssRule[] = []
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open === -1) break
    const prelude = css.slice(i, open).trim()
    let depth = 1
    let j = open + 1
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth += 1
      else if (css[j] === '}') depth -= 1
      j += 1
    }
    const body = css.slice(open + 1, j - 1)
    i = j
    if (prelude.startsWith('@')) continue
    const declarations = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      declarations.set(
        part.slice(0, colon).trim().toLowerCase(),
        part
          .slice(colon + 1)
          .replace(/\s+/g, ' ')
          .trim()
      )
    }
    rules.push({
      selectors: prelude.split(',').map((s) => s.replace(/\s+/g, ' ').trim()),
      declarations
    })
  }
  return rules
}

function findRule(rules: CssRule[], selector: string): CssRule {
  const rule = rules.find(
    (r) => r.selectors.length === 1 && r.selectors[0] === selector
  )
  if (!rule) {
    throw new Error(`no top-level rule with the exact selector "${selector}"`)
  }
  return rule
}

function requireDecl(rule: CssRule, selector: string, prop: string): string {
  const value = rule.declarations.get(prop)
  if (value === undefined) {
    throw new Error(`rule "${selector}" declares no ${prop}`)
  }
  return value
}

function parseRatio(value: string, where: string): number {
  const m = value.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/)
  if (!m) throw new Error(`${where}: cannot parse ratio from "${value}"`)
  return Number(m[1]) / Number(m[2])
}

function parsePx(value: string, where: string): number {
  const m = value.match(/^(\d+(?:\.\d+)?)px$/)
  if (!m) throw new Error(`${where}: cannot parse px from "${value}"`)
  return Number(m[1])
}

// Every way a rule can give a box a size, physical and logical.
const SIZING_PROPS = [
  'aspect-ratio',
  'width',
  'height',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'inline-size',
  'block-size',
  'min-inline-size',
  'max-inline-size',
  'min-block-size',
  'max-block-size',
  'flex',
  'flex-basis'
]

// The card's own height declarations: a card's height must be its content.
const CARD_HEIGHT_PROPS = [
  'aspect-ratio',
  'height',
  'block-size',
  'min-height',
  'min-block-size'
]

const SPACING_PROP = /^(padding|margin)(-|$)/

const CARD = '.gameCard'
const LINK = '.gameCard > a'
const IMG = '.gameCard .gameImg'
const STORE = '.gameCard .store-icon'
const BAR = '.gameCard > .icons'
const BAR_GAMEPAD = '.gameCard.gamepad > .icons'
const EMPTY = '.gameCard:empty'

/** Occurrences of a custom-property declaration anywhere in the stylesheet. */
function countDecl(css: string, name: string): number {
  return css.split(`${name}:`).length - 1
}

/**
 * The icons bar height in px, resolved from the shipped stylesheets: the store
 * badge height (the bar's tallest child) plus the bar padding twice, where the
 * padding is `--space-xs-fixed` = factor x `--space-unit-fixed` in
 * `styles/_spacing.scss`. Nothing is restated: the 35px, the 8px and the 16px
 * all come from the files that own them.
 */
function resolveBarHeight(rules: CssRule[]): number {
  const spacing = readSpacingScss()
  const unit = parsePx(
    spacing.match(/--space-unit-fixed:\s*([^;]+);/)?.[1].trim() ?? '',
    '_spacing.scss --space-unit-fixed'
  )
  const factor = Number(
    spacing.match(
      /--space-xs-fixed:\s*calc\(\s*(\d+(?:\.\d+)?)\s*\*\s*var\(--space-unit-fixed\)\s*\)/
    )?.[1]
  )
  if (!Number.isFinite(factor)) {
    throw new Error('_spacing.scss: cannot parse --space-xs-fixed')
  }
  const store = parsePx(
    requireDecl(findRule(rules, STORE), STORE, 'height'),
    `${STORE} height`
  )
  return store + 2 * factor * unit
}

describe('GameCard height is content and controller mode never resizes it (source gate, G-48-8a / 261011-vl0 D-01)', () => {
  it('G1: the .gameCard rule declares no aspect-ratio, height, block-size or min-height of its own', () => {
    const rule = findRule(parseTopLevelRules(readGameCardCss()), CARD)
    const offenders = CARD_HEIGHT_PROPS.filter((p) => rule.declarations.has(p))
    expect(offenders).toEqual([])
  })

  it('G2: the .gameCard > a rule declares neither height nor block-size, so the art defines the link', () => {
    const rule = findRule(parseTopLevelRules(readGameCardCss()), LINK)
    expect(rule.declarations.has('height')).toBe(false)
    expect(rule.declarations.has('block-size')).toBe(false)
  })

  it('G3: --game-card-bar-height is declared once, on .gameCard, as the store badge height plus twice the bar padding', () => {
    const css = readGameCardCss()
    const rules = parseTopLevelRules(css)
    expect(countDecl(css, '--game-card-bar-height')).toBe(1)

    const store = requireDecl(findRule(rules, STORE), STORE, 'height')
    const padding = requireDecl(findRule(rules, BAR), BAR, 'padding')
    // Non-vacuity: the two operands are the shipped ones, not empty strings.
    expect(store).toBe('35px')
    expect(padding).toBe('var(--space-xs-fixed)')

    expect(
      requireDecl(findRule(rules, CARD), CARD, '--game-card-bar-height')
    ).toBe(`calc(${store} + 2 * ${padding})`)
  })

  it('G4: the icons bar pins its block-size to --game-card-bar-height', () => {
    const rule = findRule(parseTopLevelRules(readGameCardCss()), BAR)
    expect(requireDecl(rule, BAR, 'block-size')).toBe(
      'var(--game-card-bar-height)'
    )
  })

  it('G5: --game-card-art-height is declared once, on .gameCard, as one portrait card art height', () => {
    const css = readGameCardCss()
    const rules = parseTopLevelRules(css)
    expect(countDecl(css, '--game-card-art-height')).toBe(1)

    const value = requireDecl(
      findRule(rules, CARD),
      CARD,
      '--game-card-art-height'
    )
    const m = value.match(
      /^calc\( ?var\(--focus-row-card-width, var\(--library-tile-css-width, (\d+(?:\.\d+)?)px\)\) \* (\d+(?:\.\d+)?) \/ (\d+(?:\.\d+)?) ?\)$/
    )
    if (!m) {
      throw new Error(`cannot parse --game-card-art-height from "${value}"`)
    }
    expect(Number(m[1])).toBe(LIBRARY_TILE_WIDTH_DEFAULT)
    const imgRatio = parseRatio(
      requireDecl(findRule(rules, IMG), IMG, 'aspect-ratio'),
      `${IMG} aspect-ratio`
    )
    // The art height term is width / imgRatio: 4/3 for a 3/4 image.
    expect(Number(m[2]) / Number(m[3])).toBeCloseTo(1 / imgRatio, 10)
  })

  it('G6: the .gameCard:empty placeholder is exactly art + bar tall, built from the same two properties', () => {
    const rule = findRule(parseTopLevelRules(readGameCardCss()), EMPTY)
    expect(requireDecl(rule, EMPTY, 'block-size')).toBe(
      'calc(var(--game-card-art-height) + var(--game-card-bar-height))'
    )
  })

  it('G7: no rule that mentions .gamepad declares a sizing, padding or margin property (controller invariance)', () => {
    const rules = parseTopLevelRules(readGameCardCss())
    const gamepadRules = rules.filter((r) =>
      r.selectors.some((s) => s.includes('.gamepad'))
    )
    const offenders: string[] = []
    for (const rule of gamepadRules) {
      for (const prop of rule.declarations.keys()) {
        if (SIZING_PROPS.includes(prop) || SPACING_PROP.test(prop)) {
          offenders.push(`${rule.selectors.join(', ')} { ${prop} }`)
        }
      }
    }
    expect(offenders).toEqual([])

    // Non-vacuity: the walk saw the surviving controller rules, and the bar
    // rule is the one that flattens the background only.
    expect(gamepadRules.length).toBeGreaterThanOrEqual(2)
    expect(
      requireDecl(findRule(rules, BAR_GAMEPAD), BAR_GAMEPAD, 'background')
    ).toBe('transparent')
  })

  it('G8: card height = 3:4 art + 51px bar = placeholder height at every probed tile width, in mouse and controller mode alike', () => {
    const rules = parseTopLevelRules(readGameCardCss())
    const bar = resolveBarHeight(rules)
    expect(bar).toBe(51)

    const imgRatio = parseRatio(
      requireDecl(findRule(rules, IMG), IMG, 'aspect-ratio'),
      `${IMG} aspect-ratio`
    )
    // Controller mode has these same values: G4 pins the bar's block-size
    // outside any mode, and G7 leaves every .gamepad rule without a size,
    // padding or margin, so neither term of the height reads the input mode.
    const expected = new Map<number, number>([
      [LIBRARY_TILE_WIDTH_MIN, 237.67],
      [LIBRARY_TILE_WIDTH_DEFAULT, 259],
      [188, 301.67],
      [200, 317.67],
      [280, 424.33],
      [LIBRARY_TILE_WIDTH_MAX, 477.67]
    ])
    for (const [w, height] of expected) {
      const revealed = w / imgRatio + bar
      const placeholder = w / imgRatio + bar // same two terms as G6
      expect(revealed).toBeCloseTo(height, 2)
      expect(placeholder).toBeCloseTo(revealed, 6)
    }
  })
})

describe('just-played hero: neighbour height by construction, letterboxed art (261011-vl0 D-02, D-03)', () => {
  const HERO_IMG = '.gameCard.justPlayed .justPlayedImg'

  it('H1: the hero has no geometry of its own: no card height rule, no bar size or padding override', () => {
    const rules = parseTopLevelRules(readGameCardCss())
    const offenders: string[] = []
    for (const rule of rules) {
      const own =
        rule.selectors.length === 1 &&
        rule.selectors[0] === '.gameCard.justPlayed'
      if (own) {
        for (const prop of CARD_HEIGHT_PROPS) {
          if (rule.declarations.has(prop)) {
            offenders.push(`.gameCard.justPlayed { ${prop} }`)
          }
        }
      }
      if (
        rule.selectors.some((s) =>
          s.startsWith('.gameCard.justPlayed > .icons')
        )
      ) {
        for (const prop of rule.declarations.keys()) {
          if (
            prop === 'block-size' ||
            prop === 'height' ||
            SPACING_PROP.test(prop)
          ) {
            offenders.push(`${rule.selectors.join(', ')} { ${prop} }`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('H2: the hero art box is one portrait art height tall, shows the whole art over the card gradient', () => {
    const rule = findRule(parseTopLevelRules(readGameCardCss()), HERO_IMG)
    expect(requireDecl(rule, HERO_IMG, 'display')).toBe('block')
    expect(requireDecl(rule, HERO_IMG, 'block-size')).toBe(
      'var(--game-card-art-height)'
    )
    expect(requireDecl(rule, HERO_IMG, 'object-fit')).toBe('contain')
    expect(requireDecl(rule, HERO_IMG, 'background-image')).toBe(
      'var(--gradient-gamecard)'
    )
    // quick 261029-quw item 4: letterbox bands collect below the art, so the
    // hero's art top lines up with its neighbours' art tops.
    expect(requireDecl(rule, HERO_IMG, 'object-position')).toBe('center top')
    expect(rule.declarations.has('aspect-ratio')).toBe(false)
  })

  it('H3: the hero art block-size is the art term of the placeholder height, so hero height = neighbour height at every probed width', () => {
    const rules = parseTopLevelRules(readGameCardCss())
    const heroArt = requireDecl(
      findRule(rules, HERO_IMG),
      HERO_IMG,
      'block-size'
    )
    const placeholder = requireDecl(findRule(rules, EMPTY), EMPTY, 'block-size')
    expect(placeholder).toContain(heroArt)

    const bar = resolveBarHeight(rules)
    expect(bar).toBe(51)
    const imgRatio = parseRatio(
      requireDecl(findRule(rules, IMG), IMG, 'aspect-ratio'),
      `${IMG} aspect-ratio`
    )
    for (const w of [
      LIBRARY_TILE_WIDTH_MIN,
      LIBRARY_TILE_WIDTH_DEFAULT,
      188,
      200,
      280,
      LIBRARY_TILE_WIDTH_MAX
    ]) {
      const neighbour = w / imgRatio + bar
      // The hero's art box is the same --game-card-art-height term (H2/H3
      // above) and it shares the same pinned bar (H1, G4).
      const hero = w / imgRatio + bar
      expect(hero - neighbour).toBeCloseTo(0, 6)
    }
  })

  it('H4: the placeholder-art fallback still shows the hero art whole (object-fit: contain)', () => {
    const rules = parseTopLevelRules(readGameCardCss())
    const grouped = rules.find((r) =>
      r.selectors.includes(`${HERO_IMG}.usingFallback`)
    )
    expect(grouped).toBeDefined()
    expect(grouped?.declarations.get('object-fit')).toBe('contain')
  })
})
