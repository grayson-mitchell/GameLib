/**
 * Source-text gate: controller mode never resizes a GameCard (Phase 48 plan
 * 48-09, gap G-48-8a).
 *
 * What this proves: (1) no stylesheet rule whose selector mentions
 * `.gamepad` declares a sizing property, so switching between mouse and
 * controller input cannot change a card's box; (2) as arithmetic over values
 * PARSED OUT of the shipped stylesheet (nothing restated here), a regular
 * 156px card in controller mode is tall enough to hold its cover art above the
 * flattened 35px store-badge bar.
 *
 * What this cannot prove: rendered pixels. The Frontend jest project runs with
 * `testEnvironment: 'node'` and has no CSS engine, so this reads source text.
 * Whether the art is really uncropped is UAT's job (the plan's human-check).
 *
 * Root cause, in two sentences. `.gameCard.gamepad` (3/4) and
 * `.gameCard.gamepad.justPlayed` (328/205) overrode the base ratios whenever
 * `activeController` was set, shortening a 156px card from 248 to 208px; the
 * store badge kept in the controller-mode icons bar (commit 16560dbdd) then
 * cropped 35px of art from that art-sized card, and because the `gamepad`
 * class flips on every mouse/controller handoff every card visibly jumped.
 * Operator ruling 2026-10-07: removed globally (strip and grid), not only in
 * the focus-row strip.
 *
 * Baseline note, so nobody adds an assertion the pre-phase baseline already
 * fails. This gate is a CONTROLLER-MODE claim only. No mouse-mode art
 * assertion is made for the regular card: the 51px action bar leaves 197px
 * for 208px of art (about 11px cropped). No just-played (landscape) card
 * assertion is made either: its 16/10 art is cropped by the icons bar in mouse
 * mode too (116 - 51 = 65 against 97.5), and after this fix controller mode
 * crops it less than mouse mode (116 - 35 = 81). Both predate this phase.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

interface CssRule {
  selectors: string[]
  declarations: Map<string, string>
}

function readGameCardCss(): string {
  const raw = readFileSync(join(__dirname, '..', 'index.css'), 'utf8')
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
  if (value === '0') return 0
  const m = value.match(/^(\d+(?:\.\d+)?)px$/)
  if (!m) throw new Error(`${where}: cannot parse px from "${value}"`)
  return Number(m[1])
}

const SIZING_PROPS = [
  'aspect-ratio',
  'width',
  'height',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'flex',
  'flex-basis'
]

// G-48-8c (operator ruling 2026-10-07 "match the grid", amending D-01): the
// focus-row strip no longer pins cards at 156px, it tracks the grid's column
// width. So the grid's own `minmax()` floor is the narrowest card in either
// row, and the binding case. Parsed from Library/index.css, not restated.
function readGridFloor(): number {
  // __tests__ -> GameCard -> components -> Library
  const grid = readFileSync(
    join(__dirname, '..', '..', '..', 'index.css'),
    'utf8'
  )
  const floor = stripSourceComments(grid).match(
    /minmax\(\s*(\d+(?:\.\d+)?)px,\s*1fr\s*\)/
  )?.[1]
  if (floor === undefined) {
    throw new Error('Library/index.css: no minmax(Npx, 1fr) grid floor found')
  }
  return Number(floor)
}

const CARD_WIDTH = readGridFloor()

describe('GameCard controller mode never resizes a card (source gate, G-48-8a)', () => {
  it('no rule whose selector mentions .gamepad declares a sizing property', () => {
    const rules = parseTopLevelRules(readGameCardCss())
    const offenders: string[] = []
    for (const rule of rules) {
      if (!rule.selectors.some((s) => s.includes('.gamepad'))) continue
      for (const prop of SIZING_PROPS) {
        if (rule.declarations.has(prop)) {
          offenders.push(`${rule.selectors.join(', ')} { ${prop} }`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('non-vacuity: the walk saw the surviving .gamepad icons rules and the base ratios', () => {
    const rules = parseTopLevelRules(readGameCardCss())
    const gamepadRules = rules.filter((r) =>
      r.selectors.some((s) => s.includes('.gamepad'))
    )

    expect(gamepadRules.length).toBeGreaterThanOrEqual(2)
    expect(
      requireDecl(findRule(rules, '.gameCard'), '.gameCard', 'aspect-ratio')
    ).toBe('173/275')
    expect(
      requireDecl(
        findRule(rules, '.gameCard.justPlayed'),
        '.gameCard.justPlayed',
        'aspect-ratio'
      )
    ).toBe('275/205')
  })

  // Ratios and the badge bar, parsed from the shipped stylesheet.
  function readControllerGeometry() {
    const rules = parseTopLevelRules(readGameCardCss())

    // Ratio a `.gameCard.gamepad` card gets, the way the cascade resolves it
    // for these two rules: an exact `.gameCard.gamepad` override if one
    // exists, else the `.gameCard` ratio.
    const override = rules.find(
      (r) => r.selectors.length === 1 && r.selectors[0] === '.gameCard.gamepad'
    )
    const cardRatio = parseRatio(
      override?.declarations.get('aspect-ratio') ??
        requireDecl(findRule(rules, '.gameCard'), '.gameCard', 'aspect-ratio'),
      'card aspect-ratio'
    )

    const storeSel = '.gameCard .store-icon'
    const storeHeight = parsePx(
      requireDecl(findRule(rules, storeSel), storeSel, 'height'),
      `${storeSel} height`
    )
    const barSel = '.gameCard.gamepad > .icons'
    const barPadding = parsePx(
      requireDecl(findRule(rules, barSel), barSel, 'padding'),
      `${barSel} padding`
    )
    const barHeight = storeHeight + 2 * barPadding

    const imgSel = '.gameCard .gameImg'
    const imgRatio = parseRatio(
      requireDecl(findRule(rules, imgSel), imgSel, 'aspect-ratio'),
      `${imgSel} aspect-ratio`
    )
    return { cardRatio, barHeight, imgRatio }
  }

  it('a grid-floor controller-mode card is tall enough for its art above the 35px badge bar', () => {
    const { cardRatio, barHeight, imgRatio } = readControllerGeometry()
    const cardHeight = CARD_WIDTH / cardRatio
    const artHeight = CARD_WIDTH / imgRatio

    expect(cardHeight - barHeight).toBeGreaterThanOrEqual(artHeight)
  })

  it('every card wider than the grid floor fits its art too: the margin grows with width (G-48-8c)', () => {
    // Card height and art height are both linear in width, so the margin
    // (cardHeight - barHeight - artHeight) is w x (1/cardRatio - 1/imgRatio)
    // - barHeight. A positive slope means the floor is the binding case, and the
    // strip's wider matched cards cannot crop art the floor does not.
    const { cardRatio, imgRatio } = readControllerGeometry()
    expect(1 / cardRatio - 1 / imgRatio).toBeGreaterThan(0)
  })
})
