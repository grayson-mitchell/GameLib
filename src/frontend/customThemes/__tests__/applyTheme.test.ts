/**
 * @jest-environment jsdom
 */
import type { CustomTheme } from '../../../common/types/customTheme'
import { defaultThemes } from '../../components/UI/ThemeSelector/themeLabels'
import { applyTheme } from '../applyTheme'
import {
  customThemeKey,
  DEFAULT_THEME_KEY,
  resolveThemeKey
} from '../customTheme'

const FALLBACK = DEFAULT_THEME_KEY
const builtinKeys = Object.keys(defaultThemes)

const dracula: CustomTheme = {
  id: '0123456789abcdef',
  name: 'My Dracula',
  base: 'dracula',
  tokens: { '--accent': '#112233', '--background': '#000000' }
}
const nordCopy: CustomTheme = {
  id: 'fedcba9876543210',
  name: 'Nord mine',
  base: 'nord-light',
  tokens: { '--accent': '#445566' }
}
const customs = [dracula, nordCopy]

const themeClassesOn = (body: HTMLElement) =>
  builtinKeys.filter((k) => body.classList.contains(k))

describe('applyTheme', () => {
  let body: HTMLElement

  beforeEach(() => {
    body = document.createElement('body')
    // clear the module-level applied-property list left by an earlier case
    applyTheme(body, FALLBACK, [], FALLBACK)
    body = document.createElement('body')
  })

  it('sets the class of a built-in theme and no inline properties', () => {
    const r = applyTheme(body, 'nord-dark', customs, FALLBACK)
    expect(r).toEqual({ kind: 'builtin', key: 'nord-dark' })
    expect(body.classList.contains('nord-dark')).toBe(true)
    expect(body.style.length).toBe(0)
  })

  it('puts the base class and every token inline for a custom theme', () => {
    applyTheme(body, customThemeKey(dracula.id), customs, FALLBACK)
    expect(themeClassesOn(body)).toEqual(['dracula'])
    expect(body.style.getPropertyValue('--accent')).toBe('#112233')
    expect(body.style.getPropertyValue('--background')).toBe('#000000')
  })

  it('removes the inline properties when switching to a built-in theme', () => {
    applyTheme(body, customThemeKey(dracula.id), customs, FALLBACK)
    applyTheme(body, 'marine', customs, FALLBACK)
    expect(body.style.getPropertyValue('--accent')).toBe('')
    expect(body.style.getPropertyValue('--background')).toBe('')
    expect(themeClassesOn(body)).toEqual(['marine'])
  })

  it('swaps one custom theme for another without leaking the first one tokens', () => {
    applyTheme(body, customThemeKey(dracula.id), customs, FALLBACK)
    applyTheme(body, customThemeKey(nordCopy.id), customs, FALLBACK)
    expect(body.style.getPropertyValue('--accent')).toBe('#445566')
    expect(body.style.getPropertyValue('--background')).toBe('')
    expect(themeClassesOn(body)).toEqual(['nord-light'])
  })

  it.each(['custom:ffffffffffffffff', 'old-custom-file', '', 'constructor'])(
    'falls back for the unknown or deleted key %p',
    (key) => {
      const r = applyTheme(body, key, customs, FALLBACK)
      expect(r.kind).toBe('unknown')
      expect(themeClassesOn(body)).toEqual([FALLBACK])
      expect(body.style.length).toBe(0)
    }
  )

  it('keeps isRTL, keyboardNav and controllerLayout across theme switches', () => {
    body.classList.add('isRTL', 'keyboardNav', 'controllerLayout')
    applyTheme(body, 'dracula', customs, FALLBACK)
    applyTheme(body, customThemeKey(nordCopy.id), customs, FALLBACK)
    applyTheme(body, 'custom:gone', customs, FALLBACK)
    for (const c of ['isRTL', 'keyboardNav', 'controllerLayout']) {
      expect(body.classList.contains(c)).toBe(true)
    }
  })

  describe('assumption-delta invariant: every gallery key round-trips to one built-in class', () => {
    const galleryKeys = [
      ...builtinKeys,
      ...customs.map((c) => customThemeKey(c.id))
    ]

    it.each(galleryKeys)('%s', (key) => {
      const resolved = resolveThemeKey(key, customs)
      expect(resolved.kind).toBe(
        key.startsWith('custom:') ? 'custom' : 'builtin'
      )
      applyTheme(body, key, customs, FALLBACK)
      expect(themeClassesOn(body)).toHaveLength(1)
    })

    it('covers all 10 built-ins', () => {
      expect(builtinKeys).toHaveLength(10)
    })
  })
})
