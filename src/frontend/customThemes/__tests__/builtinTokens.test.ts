import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { defaultThemes } from 'frontend/components/UI/ThemeSelector/themeLabels'
import {
  BUILTIN_TOKENS,
  builtinSeed,
  isBuiltInThemeKey
} from '../builtinTokens'
import { flattenBuiltinTheme } from '../flatten'
import {
  CORE_TOKEN_GROUPS,
  CORE_TOKENS,
  LIVE_DERIVED_TOKENS,
  NON_COLOUR_TOKENS
} from '../tokens'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const read = (relPath: string) =>
  stripSourceComments(readFileSync(join(REPO_ROOT, relPath), 'utf8'))

const themesScss = read('src/frontend/themes.scss')
const colorsScss = read('src/frontend/styles/_colors.scss')

describe('BUILTIN_TOKENS drift gate (T-64-03)', () => {
  it('holds one seed per defaultThemes key, in defaultThemes order', () => {
    expect(Object.keys(BUILTIN_TOKENS)).toEqual(Object.keys(defaultThemes))
  })

  it.each(Object.keys(defaultThemes))(
    '%s equals a fresh flatten of themes.scss and _colors.scss',
    (key) => {
      const fresh = flattenBuiltinTheme({ themesScss, colorsScss, key })
      // Failure message: names the regeneration command.
      if (JSON.stringify(fresh) !== JSON.stringify(BUILTIN_TOKENS[key])) {
        throw new Error(
          `builtinTokens.generated.json is stale for ${key}: run pnpm gen:theme-tokens`
        )
      }
      expect(BUILTIN_TOKENS[key]).toEqual(fresh)
    }
  )

  it('stores no var() reference anywhere (D-11)', () => {
    for (const [key, seed] of Object.entries(BUILTIN_TOKENS))
      for (const [token, value] of Object.entries(seed))
        expect({ key, token, hasVar: value.includes('var(') }).toEqual({
          key,
          token,
          hasVar: false
        })
  })
})

describe('builtinTokens accessors', () => {
  it('isBuiltInThemeKey accepts the ten built-ins and nothing inherited', () => {
    for (const key of Object.keys(defaultThemes))
      expect(isBuiltInThemeKey(key)).toBe(true)
    expect(isBuiltInThemeKey('constructor')).toBe(false)
    expect(isBuiltInThemeKey('__proto__')).toBe(false)
    expect(isBuiltInThemeKey('my-theme')).toBe(false)
  })

  it('builtinSeed returns the map for a built-in and undefined otherwise', () => {
    expect(builtinSeed('dracula')).toBe(BUILTIN_TOKENS['dracula'])
    expect(builtinSeed('constructor')).toBeUndefined()
    expect(builtinSeed('nope')).toBeUndefined()
  })
})

describe('core token census (D-12)', () => {
  it('has exactly 27 unique core tokens grouped 6/5/4/6/3/3 in UI-SPEC order', () => {
    expect(new Set(CORE_TOKENS).size).toBe(27)
    expect(CORE_TOKENS).toHaveLength(27)
    expect(CORE_TOKEN_GROUPS.map((g) => [g.id, g.tokens.length])).toEqual([
      ['surfaces', 6],
      ['navigation', 5],
      ['text', 4],
      ['buttons', 6],
      ['accent', 3],
      ['status', 3]
    ])
    expect(CORE_TOKEN_GROUPS.flatMap((g) => [...g.tokens])).toEqual([
      ...CORE_TOKENS
    ])
  })

  it.each(Object.keys(defaultThemes))(
    '%s seed carries all 27 core tokens',
    (key) => {
      expect(CORE_TOKENS.length).toBeGreaterThan(0)
      const seed = BUILTIN_TOKENS[key] ?? {}
      const missing = CORE_TOKENS.filter((t) => !(t in seed))
      expect({ key, missing }).toEqual({ key, missing: [] })
    }
  )

  it('seeds an undeclared core token from its real consumer fallback chain', () => {
    const tok = (theme: string, name: string) => BUILTIN_TOKENS[theme]?.[name]
    expect(tok('dracula', '--success-button')).toBeDefined()
    expect(tok('dracula', '--success-button')).toBe(
      tok('dracula', '--status-success')
    )
    expect(tok('zombie', '--primary')).toBe('#00000000')
    expect(tok('marine', '--danger')).toBe('#cc3333')
    expect(tok('nord-dark', '--navbar-inactive')).toBeDefined()
    expect(tok('nord-dark', '--navbar-inactive')).toBe(
      tok('nord-dark', '--navbar-accent')
    )
  })

  it('never stores a live-derived or non-colour token (OD-1)', () => {
    const banned = new Set([
      ...Object.keys(LIVE_DERIVED_TOKENS),
      ...NON_COLOUR_TOKENS
    ])
    for (const [key, seed] of Object.entries(BUILTIN_TOKENS))
      expect({
        key,
        found: Object.keys(seed).filter((t) => banned.has(t))
      }).toEqual({ key, found: [] })
    expect(BUILTIN_TOKENS['midnightMirage']).not.toHaveProperty(
      '--gradient-body-background'
    )
  })

  it('stores every non-gradient value as canonical hex and no gradient with var()', () => {
    const hex = /^#[0-9a-f]{6}([0-9a-f]{2})?$/
    for (const [key, seed] of Object.entries(BUILTIN_TOKENS))
      for (const [token, value] of Object.entries(seed)) {
        if (/gradient\(/.test(value))
          expect({ key, token, ok: !value.includes('var(') }).toEqual({
            key,
            token,
            ok: true
          })
        else
          expect({ key, token, ok: hex.test(value) }).toEqual({
            key,
            token,
            ok: true
          })
      }
  })

  it('paints dracula navbar and body as different colours (thumbnail truth)', () => {
    const d = BUILTIN_TOKENS['dracula'] ?? {}
    expect(d['--navbar-background']).toBeDefined()
    expect(d['--navbar-background']).not.toBe(d['--body-background'])
  })
})
