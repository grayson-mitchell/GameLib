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
