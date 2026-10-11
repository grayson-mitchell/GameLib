/**
 * D-21 token gate for the Winetricks tab's stylesheets.
 *
 * Every one of Phase 44's nine live-gate contrast defects traced to a colour
 * token consumed on a surface that gave it no contrast guarantee (`--navbar-*`
 * and `--text-hover` among them) or to an undefined custom property with no
 * fallback, which drops the ENTIRE declaration at computed-value time in
 * whichever theme lacks it. Neither class is visible to the type checker, the
 * linter or a unit test of the markup, so this census reads every `.scss` under
 * the tab and fails on:
 *
 *  - a banned token: `--navbar-*`, `--text-hover`, raw `--status-*`,
 *    `--border-color`;
 *  - a `var(--name)` with no fallback.
 *
 * The checker is a pure function over file text; a sabotaged sample proves it
 * can fail, and the directory walk asserts it found real input, so a green run
 * cannot be vacuous.
 *
 * This file also pins the Settings dialog width release (quick 261011-hh5).
 * `.InstallModal__dialog`'s `min-width: fit-content` (InstallModal/index.scss)
 * beats any `max-width` in the chain, and only a top-level
 * `.InstallModal__dialog:has(.WinetricksSettings) { min-width: 0; }` rule in
 * this tab's own stylesheet stops the tab's content from widening the dialog
 * past the window while it is mounted.
 *
 * It also pins quick 261011-jj1: the release of the GamesSettings 500px
 * section floor for the tab's three `<section>` groups (by computed
 * specificity, not assumed stylesheet order), and the cached badge shrinking
 * with an ellipsis instead of staying rigid.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import * as sass from 'sass'

const TAB_DIR = join(__dirname, '..')

const BANNED_TOKEN =
  /--navbar-[\w-]+|--text-hover\b|--status-[\w-]+|--border-color\b/

interface Violation {
  line: number
  reason: string
}

// Replaces comments with spaces so line numbers survive. Handles `//` (not
// inside a url) and block comments.
function stripComments(text: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, ' ')
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(
      /(^|[^:])\/\/[^\n]*/g,
      (m, lead: string) => lead + blank(m.slice(lead.length))
    )
}

// Finds each `var(` and returns its inner text up to the matching paren.
function varCalls(text: string): { inner: string; index: number }[] {
  const calls: { inner: string; index: number }[] = []
  let from = 0
  for (;;) {
    const start = text.indexOf('var(', from)
    if (start === -1) return calls
    let depth = 1
    let i = start + 4
    while (i < text.length && depth > 0) {
      if (text[i] === '(') depth++
      else if (text[i] === ')') depth--
      i++
    }
    calls.push({ inner: text.slice(start + 4, i - 1), index: start })
    from = start + 4
  }
}

function hasTopLevelComma(inner: string): boolean {
  let depth = 0
  for (const ch of inner) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) return true
  }
  return false
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
}

function checkStylesheet(source: string): Violation[] {
  const text = stripComments(source)
  const violations: Violation[] = []

  const banned = new RegExp(BANNED_TOKEN.source, 'g')
  for (const match of text.matchAll(banned)) {
    violations.push({
      line: lineOf(text, match.index ?? 0),
      reason: `banned token ${match[0]}`
    })
  }

  for (const call of varCalls(text)) {
    if (!hasTopLevelComma(call.inner)) {
      violations.push({
        line: lineOf(text, call.index),
        reason: `var(${call.inner}) has no fallback`
      })
    }
  }
  return violations
}

// Checks that a top-level `.InstallModal__dialog:has(.WinetricksSettings)`
// rule declares `min-width: 0`. "Top-level" means brace depth 0 at the match,
// which rejects the selector when it is merely nested inside another rule
// (where it would compile to a never-matching descendant selector). The rule
// body is read up to the next `}`; a nested `{` inside that span means the
// match was not a flat, single-declaration rule.
function releasesDialogWidthFloor(source: string): boolean {
  const text = stripComments(source)
  const selector = /\.InstallModal__dialog:has\(\.WinetricksSettings\)\s*\{/g

  for (const match of text.matchAll(selector)) {
    const index = match.index ?? 0
    const before = text.slice(0, index)
    const depth =
      (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length
    if (depth !== 0) continue

    const bodyStart = index + match[0].length
    const bodyEnd = text.indexOf('}', bodyStart)
    if (bodyEnd === -1) continue
    const body = text.slice(bodyStart, bodyEnd)
    if (body.includes('{')) continue

    if (/min-width\s*:\s*0\b/.test(body)) return true
  }
  return false
}

// --- 261011-jj1: specificity + rule-parsing helpers -------------------------

// Splits `text` at top-level occurrences of `sep` only -- a `(` raises depth,
// a `)` lowers it, and a separator inside parens is never a split point.
// With `' '` any whitespace run is one split point. Parts are trimmed and
// empty parts are dropped.
function splitTopLevel(text: string, sep: ',' | ' '): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '(') depth++
    else if (ch === ')') depth--

    const isSplitPoint =
      depth === 0 && (sep === ',' ? ch === ',' : /\s/.test(ch))

    if (isSplitPoint) {
      if (sep === ',' || current.trim() !== '') parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  parts.push(current)
  return parts.map((p) => p.trim()).filter((p) => p.length > 0)
}

// Scores ONE complex selector's specificity as `[idCount, classCount,
// elementCount]`, walking it left to right. Throws on selector text this
// checker cannot score, rather than silently mis-scoring it: `#id`,
// `[attr]`, `::pseudo-element`, `*`, `:where(` and `:has(`.
function specificity(selector: string): [number, number, number] {
  const s = selector.trim()
  let a = 0
  let b = 0
  let c = 0
  let i = 0

  const fail = (): never => {
    throw new Error(`specificity: unsupported selector text "${s.slice(i)}"`)
  }

  while (i < s.length) {
    const ch = s[i]

    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === '>' || ch === '+' || ch === '~') {
      i++
      continue
    }
    if (ch === '#' || ch === '[' || ch === '*') fail()
    if (s.startsWith('::', i)) fail()

    if (ch === '.') {
      let j = i + 1
      while (j < s.length && /[\w-]/.test(s[j])) j++
      b++
      i = j
      continue
    }

    if (ch === ':') {
      let j = i + 1
      while (j < s.length && /[\w-]/.test(s[j])) j++
      const name = s.slice(i + 1, j)
      if (name === 'where' || name === 'has') fail()

      if (j < s.length && s[j] === '(') {
        let depth = 1
        let k = j + 1
        while (k < s.length && depth > 0) {
          if (s[k] === '(') depth++
          else if (s[k] === ')') depth--
          k++
        }
        const inner = s.slice(j + 1, k - 1)
        if (name === 'is' || name === 'not') {
          let best: [number, number, number] = [0, 0, 0]
          for (const arg of splitTopLevel(inner, ',')) {
            const scored = specificity(arg)
            if (compareSpecificity(scored, best) > 0) best = scored
          }
          a += best[0]
          b += best[1]
          c += best[2]
        } else {
          b++
        }
        i = k
        continue
      }

      b++
      i = j
      continue
    }

    let j = i
    while (j < s.length && /[\w-]/.test(s[j])) j++
    if (j === i) fail()
    c++
    i = j
  }

  return [a, b, c]
}

// Column-by-column comparison, CSS-cascade style: positive means `x` beats
// `y`, zero means a tie (resolved only by stylesheet order), negative means
// `x` loses.
function compareSpecificity(
  x: [number, number, number],
  y: [number, number, number]
): number {
  for (let k = 0; k < 3; k++) {
    if (x[k] !== y[k]) return x[k] - y[k]
  }
  return 0
}

// Parses already-compiled, comment-free CSS into flat `{ selectors, decls }`
// rules. The regex's selector and body halves both exclude braces, so an
// at-rule wrapper (`@media (...) { .a { ... } }`) never matches as a whole --
// only its nested, brace-free rule does, which is exactly what this census
// needs from Sass's flat compiled output.
function parseRules(
  css: string
): { selectors: string[]; decls: Record<string, string> }[] {
  const text = stripComments(css)
  const rules: { selectors: string[]; decls: Record<string, string> }[] = []
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g
  let match: RegExpExecArray | null
  while ((match = ruleRe.exec(text)) !== null) {
    const selectors = splitTopLevel(match[1], ',').map((sel) =>
      sel.replace(/\s+/g, ' ').trim()
    )
    const decls: Record<string, string> = {}
    for (const part of match[2].split(';')) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const colon = trimmed.indexOf(':')
      if (colon === -1) continue
      decls[trimmed.slice(0, colon).trim()] = trimmed.slice(colon + 1).trim()
    }
    rules.push({ selectors, decls })
  }
  return rules
}

// Merges, in order, the decls of every rule whose selector list contains
// `selector` exactly. Later rules win -- the normal CSS cascade-order rule
// for two rules tied on specificity.
function effectiveDecls(
  rules: { selectors: string[]; decls: Record<string, string> }[],
  selector: string
): Record<string, string> {
  let merged: Record<string, string> = {}
  for (const rule of rules) {
    if (rule.selectors.includes(selector)) merged = { ...merged, ...rule.decls }
  }
  return merged
}

// True iff some parsed rule in `css` declares `min-width: 0` (exactly --
// an `!important` suffix makes the value not exactly `0`) on a selector
// whose last top-level (space-split) compound names `group` as a whole
// class token, and whose specificity beats `floor`.
function beatsSectionFloor(
  css: string,
  group: string,
  floor: [number, number, number]
): boolean {
  for (const rule of parseRules(css)) {
    if (rule.decls['min-width'] !== '0') continue
    for (const selector of rule.selectors) {
      const compounds = splitTopLevel(selector, ' ')
      const last = compounds[compounds.length - 1]
      if (!last) continue
      const token = `.${group}`
      const idx = last.indexOf(token)
      if (idx === -1) continue
      const after = last[idx + token.length]
      if (after !== undefined && /[\w-]/.test(after)) continue
      if (compareSpecificity(specificity(selector), floor) > 0) return true
    }
  }
  return false
}

// True iff `.WinetricksSettings .WinetricksRow__cached`'s effective decls
// shrink the badge with an ellipsis instead of staying rigid (261011-jj1).
function cachedBadgeYields(css: string): boolean {
  const decls = effectiveDecls(
    parseRules(css),
    '.WinetricksSettings .WinetricksRow__cached'
  )
  return (
    decls['flex'] === '0 1 auto' &&
    decls['min-width'] === '0' &&
    decls['overflow'] === 'hidden' &&
    decls['text-overflow'] === 'ellipsis' &&
    decls['white-space'] === 'nowrap'
  )
}

function scssFiles(dir: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      found.push(...scssFiles(full))
    } else if (name.endsWith('.scss')) {
      found.push(full)
    }
  }
  return found
}

describe('checkStylesheet (the checker can fail)', () => {
  it('flags a banned navbar token and a bare var() as separate lines', () => {
    const sample = [
      '.a {',
      '  color: var(--navbar-active);',
      '  color: var(--accent);',
      '}'
    ].join('\n')
    const lines = new Set(checkStylesheet(sample).map((v) => v.line))
    expect(lines).toEqual(new Set([2, 3]))
  })

  it('flags each banned token on its own', () => {
    for (const token of [
      '--text-hover',
      '--status-danger',
      '--border-color',
      '--navbar-inactive'
    ]) {
      const violations = checkStylesheet(`.a { color: var(${token}, #fff); }`)
      expect(violations.map((v) => v.reason)).toEqual([`banned token ${token}`])
    }
  })

  it('flags a bare var() nested in a fallback', () => {
    const violations = checkStylesheet('.a { color: var(--a, var(--b)); }')
    expect(violations).toHaveLength(1)
    expect(violations[0].reason).toBe('var(--b) has no fallback')
  })

  it('accepts a var() whose fallback contains commas of its own', () => {
    expect(checkStylesheet('.a { color: var(--a, rgb(1, 2, 3)); }')).toEqual([])
  })

  it('ignores banned names in comments', () => {
    const sample = [
      '// do not use --navbar-active or var(--accent) here',
      '/* --text-hover var(--x) */',
      '.a { color: var(--accent, #0080ff); }'
    ].join('\n')
    expect(checkStylesheet(sample)).toEqual([])
  })
})

describe('Winetricks tab stylesheets (D-21)', () => {
  const files = scssFiles(TAB_DIR)

  it('non-vacuity: the walk found stylesheets and at least 10 var() uses', () => {
    expect(files.length).toBeGreaterThanOrEqual(1)
    const uses = files.reduce(
      (total, file) =>
        total + varCalls(stripComments(readFileSync(file, 'utf8'))).length,
      0
    )
    expect(uses).toBeGreaterThanOrEqual(10)
  })

  it('finds the row stylesheet, so the heights test below is not vacuous', () => {
    expect(files.some((f) => /Row[\\/]index\.scss$/.test(f))).toBe(true)
  })

  it.each(files.map((file) => [file.slice(TAB_DIR.length + 1), file]))(
    '%s has no banned token and no var() without a fallback',
    (_name, file) => {
      expect(checkStylesheet(readFileSync(file, 'utf8'))).toEqual([])
    }
  )

  it('Row/index.scss declares height: 56px for the two-line modifier and 44px for the one-line modifier', () => {
    const row = readFileSync(join(TAB_DIR, 'Row', 'index.scss'), 'utf8')
    expect(row).toMatch(/&--twoLine\s*\{[^}]*height:\s*56px/)
    expect(row).toMatch(/&--oneLine\s*\{[^}]*height:\s*44px/)
  })
})

describe('Settings dialog width floor (261011-hh5)', () => {
  it('accepts a top-level release rule', () => {
    const sample = [
      '.InstallModal__dialog:has(.WinetricksSettings) {',
      '  min-width: 0;',
      '}'
    ].join('\n')
    expect(releasesDialogWidthFloor(sample)).toBe(true)
  })

  it('rejects the same rule declaring max-width instead of min-width', () => {
    const sample = [
      '.InstallModal__dialog:has(.WinetricksSettings) {',
      '  max-width: 100vw;',
      '}'
    ].join('\n')
    expect(releasesDialogWidthFloor(sample)).toBe(false)
  })

  it('rejects the rule when it appears only in comments', () => {
    const sample = [
      '// .InstallModal__dialog:has(.WinetricksSettings) { min-width: 0; }',
      '/* .InstallModal__dialog:has(.WinetricksSettings) { min-width: 0; } */',
      '.WinetricksSettings { min-width: 0; }'
    ].join('\n')
    expect(releasesDialogWidthFloor(sample)).toBe(false)
  })

  it('rejects the rule nested inside .WinetricksSettings, a never-matching descendant selector', () => {
    const sample = [
      '.WinetricksSettings {',
      '  .InstallModal__dialog:has(.WinetricksSettings) {',
      '    min-width: 0;',
      '  }',
      '}'
    ].join('\n')
    expect(releasesDialogWidthFloor(sample)).toBe(false)
  })

  it('rejects a stylesheet whose only min-width: 0 sits on the .WinetricksSettings root (the pre-fix shape)', () => {
    const sample = ['.WinetricksSettings {', '  min-width: 0;', '}'].join('\n')
    expect(releasesDialogWidthFloor(sample)).toBe(false)
  })

  it("index.scss releases the Settings dialog paper's min-width floor while the tab is mounted", () => {
    const source = readFileSync(join(TAB_DIR, 'index.scss'), 'utf8')
    expect(releasesDialogWidthFloor(source)).toBe(true)
  })
})

describe('selector specificity (261011-jj1)', () => {
  it('scores the floor, a group, a tie shape and the chosen override exactly', () => {
    expect(
      specificity('.settingsDialogContent section:not(:nth-of-type(0))')
    ).toEqual([0, 2, 1])
    expect(specificity('.WinetricksSettings .WinetricksSuggested')).toEqual([
      0, 2, 0
    ])
    expect(
      specificity(
        '.WinetricksSettings section:is(.WinetricksSuggested, .WinetricksTaskGroup)'
      )
    ).toEqual([0, 2, 1])
    expect(
      specificity(
        ':is(.settingsDialogContent, .settingsWrapper) .WinetricksSettings :is(.WinetricksSuggested, .WinetricksTaskGroup, .WinetricksEverythingElse)'
      )
    ).toEqual([0, 3, 0])
  })

  it('throws on selector text it cannot score, instead of mis-scoring it', () => {
    for (const selector of [
      '#a',
      '.a[b]',
      '.a::before',
      '*',
      ':where(.a)',
      ':has(.a)'
    ]) {
      expect(() => specificity(selector)).toThrow()
    }
  })
})

describe("GamesSettings section floor vs the tab's groups (261011-jj1)", () => {
  const GAMES_SCSS = join(TAB_DIR, '..', 'GamesSettings', 'index.scss')
  const gamesCss = sass.compile(GAMES_SCSS).css
  const floorRules = parseRules(gamesCss).filter(
    (rule) => rule.decls['min-width'] === '500px'
  )
  const floor = floorRules.reduce<[number, number, number]>(
    (max, rule) =>
      rule.selectors.reduce(
        (innerMax, selector) =>
          compareSpecificity(specificity(selector), innerMax) > 0
            ? specificity(selector)
            : innerMax,
        max
      ),
    [0, 0, 0]
  )

  it('the floor rule is unchanged: one rule, both selectors, both decls, specificity 0,2,1', () => {
    expect(floorRules).toHaveLength(1)
    expect(floorRules[0].selectors).toEqual([
      '.settingsDialogContent section:not(:nth-of-type(0))',
      '.settingsWrapper section:not(:nth-of-type(0))'
    ])
    expect(floorRules[0].decls).toEqual({
      'padding-top': 'var(--space-xl)',
      'min-width': '500px'
    })
    expect(floor).toEqual([0, 2, 1])
  })

  it('accepts the chosen override shape', () => {
    const sample = [
      ':is(.settingsDialogContent, .settingsWrapper) .WinetricksSettings :is(.WinetricksSuggested, .WinetricksTaskGroup, .WinetricksEverythingElse) {',
      '  min-width: 0;',
      '}'
    ].join('\n')
    expect(beatsSectionFloor(sample, 'WinetricksSuggested', floor)).toBe(true)
  })

  it('rejects the pre-fix shape (0,2,0 loses to the floor)', () => {
    const sample = [
      '.WinetricksSettings .WinetricksSuggested {',
      '  min-width: 0;',
      '}'
    ].join('\n')
    expect(beatsSectionFloor(sample, 'WinetricksSuggested', floor)).toBe(false)
  })

  it('rejects the tie shape: a 0,2,1 tie wins only by stylesheet order', () => {
    const sample = [
      '.WinetricksSettings section:is(.WinetricksSuggested, .WinetricksTaskGroup, .WinetricksEverythingElse) {',
      '  min-width: 0;',
      '}'
    ].join('\n')
    expect(beatsSectionFloor(sample, 'WinetricksSuggested', floor)).toBe(false)
  })

  it('rejects an important-flagged min-width: 0', () => {
    const sample = [
      '.WinetricksSettings .WinetricksSuggested {',
      '  min-width: 0 !important;',
      '}'
    ].join('\n')
    expect(beatsSectionFloor(sample, 'WinetricksSuggested', floor)).toBe(false)
  })

  it.each([
    'WinetricksSuggested',
    'WinetricksTaskGroup',
    'WinetricksEverythingElse'
  ])('the real index.scss beats the floor for %s', (group) => {
    const css = sass.compile(join(TAB_DIR, 'index.scss')).css
    expect(beatsSectionFloor(css, group, floor)).toBe(true)
  })

  it('the override declares min-width only, leaving padding-top to the floor', () => {
    const css = sass.compile(join(TAB_DIR, 'index.scss')).css
    const groups = [
      'WinetricksSuggested',
      'WinetricksTaskGroup',
      'WinetricksEverythingElse'
    ]
    const matches = parseRules(css).filter((rule) =>
      rule.selectors.some((selector) => {
        const compounds = splitTopLevel(selector, ' ')
        const last = compounds[compounds.length - 1]
        if (!last) return false
        const namesAGroup = groups.some((group) => {
          const token = `.${group}`
          const idx = last.indexOf(token)
          if (idx === -1) return false
          const after = last[idx + token.length]
          return after === undefined || !/[\w-]/.test(after)
        })
        if (!namesAGroup) return false
        return compareSpecificity(specificity(selector), floor) > 0
      })
    )
    expect(matches.length).toBeGreaterThanOrEqual(1)
    for (const rule of matches) {
      expect(rule.decls).toEqual({ 'min-width': '0' })
    }
  })
})

describe('cached badge yields instead of overflowing (261011-jj1)', () => {
  const rowCss = sass.compile(join(TAB_DIR, 'Row', 'index.scss')).css

  it('rejects the pre-fix shared rule (flex: 0 0 auto)', () => {
    const sample = [
      '.WinetricksSettings .WinetricksRow__cached, .WinetricksSettings .WinetricksRow__category {',
      '  flex: 0 0 auto;',
      '  white-space: nowrap;',
      '}'
    ].join('\n')
    expect(cachedBadgeYields(sample)).toBe(false)
  })

  it('rejects a shrinkable badge with no text-overflow: ellipsis (clips with no truncation cue)', () => {
    const sample = [
      '.WinetricksSettings .WinetricksRow__cached {',
      '  flex: 0 1 auto;',
      '  min-width: 0;',
      '  overflow: hidden;',
      '  white-space: nowrap;',
      '}'
    ].join('\n')
    expect(cachedBadgeYields(sample)).toBe(false)
  })

  it('accepts the full shape', () => {
    const sample = [
      '.WinetricksSettings .WinetricksRow__cached {',
      '  flex: 0 1 auto;',
      '  min-width: 0;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '  white-space: nowrap;',
      '}'
    ].join('\n')
    expect(cachedBadgeYields(sample)).toBe(true)
  })

  it('the real Row/index.scss yields instead of overflowing', () => {
    expect(cachedBadgeYields(rowCss)).toBe(true)
  })

  it('parity: the badge and the title share the same effective flex, 0 1 auto', () => {
    const rules = parseRules(rowCss)
    const cachedFlex = effectiveDecls(
      rules,
      '.WinetricksSettings .WinetricksRow__cached'
    )['flex']
    const titleFlex = effectiveDecls(
      rules,
      '.WinetricksSettings .WinetricksRow__title'
    )['flex']
    expect(cachedFlex).toBe('0 1 auto')
    expect(titleFlex).toBe('0 1 auto')
    expect(cachedFlex).toBe(titleFlex)
  })

  it('the category tag stays rigid (E7-long-text): no overflow or text-overflow key', () => {
    const decls = effectiveDecls(
      parseRules(rowCss),
      '.WinetricksSettings .WinetricksRow__category'
    )
    expect(decls['flex']).toBe('0 0 auto')
    expect(decls['white-space']).toBe('nowrap')
    expect('overflow' in decls).toBe(false)
    expect('text-overflow' in decls).toBe(false)
  })

  it('the status slot is unchanged: flex 0 0 auto, width 12rem', () => {
    const decls = effectiveDecls(
      parseRules(rowCss),
      '.WinetricksSettings .WinetricksRow__status'
    )
    expect(decls['flex']).toBe('0 0 auto')
    expect(decls['width']).toBe('12rem')
  })
})
