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
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

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
