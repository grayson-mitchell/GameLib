import {
  isValidGradient,
  isValidTokenValue,
  validateColourInput
} from '../validate'
import { BUILTIN_TOKENS } from '../builtinTokens'

const yes = () => true
const GOOD = 'linear-gradient(90deg, #000, #333)'
// CR-01 (64-REVIEW): a second comma-separated layer is grammatical, so WKWebView's
// CSS.supports answered true for this. attacker.example is a reserved name.
const LAYERED_IMAGE_SET =
  'linear-gradient(red, blue), image-set("https://attacker.example/p.png" 1x)'

describe('validateColourInput', () => {
  it('re-stores a colour canonically', () => {
    expect(validateColourInput('rgba(255, 0, 0, 0.5)')).toEqual({
      ok: true,
      value: '#ff000080'
    })
    expect(validateColourInput('#ABC')).toEqual({ ok: true, value: '#aabbcc' })
  })

  it.each(['', '   ', 'var(--x)', 'not a colour', 'url(x)', 'red;'])(
    'rejects %p',
    (text) => {
      expect(validateColourInput(text)).toEqual({ ok: false })
    }
  )
})

describe('isValidGradient', () => {
  it('accepts a plain gradient only when supports says so', () => {
    expect(isValidGradient(GOOD, yes)).toBe(true)
    expect(isValidGradient(GOOD, () => false)).toBe(false)
  })

  it('asks supports about background-image', () => {
    const supports = jest.fn(() => true)
    isValidGradient(GOOD, supports)
    expect(supports).toHaveBeenCalledWith('background-image', GOOD)
  })

  it.each([
    ['var(', 'linear-gradient(90deg, var(--x), #333)'],
    ['url(', 'linear-gradient(90deg, url(https://e.example/x.png), #333)'],
    [';', 'linear-gradient(90deg, #000, #333);color:red'],
    ['{', 'linear-gradient(90deg, #000, #333){'],
    ['}', 'linear-gradient(90deg, #000, #333)}'],
    ['@', 'linear-gradient(90deg, #000, #333)@import'],
    ['!important', 'linear-gradient(90deg, #000, #333) !important'],
    ['backslash', 'linear-gradient(90deg, \\75rl(x), #333)'],
    ['uppercase VAR(', 'linear-gradient(90deg, VAR(--x), #333)'],
    ['image-set(', 'linear-gradient(90deg, image-set(x 1x), #333)'],
    [
      '-webkit-image-set(',
      'linear-gradient(90deg, -webkit-image-set(x 1x), #333)'
    ],
    ['cross-fade(', 'linear-gradient(90deg, cross-fade(red, blue), #333)'],
    ['element(', 'linear-gradient(90deg, element(#x), #333)'],
    ['src(', 'linear-gradient(90deg, src(x), #333)'],
    ['a double quote', 'linear-gradient(90deg, "red", #333)'],
    ['a single quote', "linear-gradient(90deg, 'red', #333)"],
    [
      'a comment (masks a second layer from a paren walk)',
      'linear-gradient(red, blue /*(*/), linear-gradient(green, black /*)*/)'
    ]
  ])('rejects text containing %s before calling supports', (_n, text) => {
    const supports = jest.fn(() => true)
    expect(isValidGradient(text, supports)).toBe(false)
    expect(supports).not.toHaveBeenCalled()
  })

  it('requires a gradient function at the start', () => {
    const supports = jest.fn(() => true)
    expect(isValidGradient('red', supports)).toBe(false)
    expect(isValidGradient('foo linear-gradient(#000, #111)', supports)).toBe(
      false
    )
    expect(supports).not.toHaveBeenCalled()
  })

  it.each([
    'linear-gradient(#000, #111)',
    'radial-gradient(circle, #000, #111)',
    'conic-gradient(#000, #111)',
    'repeating-linear-gradient(#000, #111 10%)',
    'repeating-radial-gradient(#000, #111 10%)',
    'repeating-conic-gradient(#000, #111 10%)'
  ])('accepts %s when supported', (text) => {
    expect(isValidGradient(text, yes)).toBe(true)
  })

  it('fails closed with the default supports when window.CSS is undefined', () => {
    // jest node env and jsdom 20 both have no global CSS
    expect(typeof (globalThis as { CSS?: unknown }).CSS).toBe('undefined')
    expect(isValidGradient(GOOD)).toBe(false)
  })
})

describe('isValidTokenValue', () => {
  it('validates a colour value', () => {
    expect(isValidTokenValue('--accent', '#112233')).toBe(true)
    expect(isValidTokenValue('--accent', 'var(--x)')).toBe(false)
  })

  it('routes a gradient-looking value to gradient validation', () => {
    expect(isValidTokenValue('--gradient-01', GOOD, yes)).toBe(true)
    expect(isValidTokenValue('--gradient-01', GOOD, () => false)).toBe(false)
    expect(
      isValidTokenValue(
        '--gradient-01',
        'linear-gradient(#000, url(x))' + '',
        yes
      )
    ).toBe(false)
  })
})

describe('CR-01: one gradient layer only (T-64-12)', () => {
  it('refuses the layered image-set payload before asking supports', () => {
    const supports = jest.fn(() => true)
    expect(isValidGradient(LAYERED_IMAGE_SET, supports)).toBe(false)
    expect(supports).not.toHaveBeenCalled()
    expect(
      isValidTokenValue('--gradient-01', LAYERED_IMAGE_SET, supports)
    ).toBe(false)
    expect(supports).not.toHaveBeenCalled()
  })

  it('refuses a second gradient layer even though each layer is valid', () => {
    const supports = jest.fn(() => true)
    expect(
      isValidGradient(
        'linear-gradient(red, blue), linear-gradient(green, black)',
        supports
      )
    ).toBe(false)
    expect(supports).not.toHaveBeenCalled()
  })

  it.each([
    ['a doubled final paren', 'linear-gradient(red, blue))'],
    ['a doubled opening paren', 'linear-gradient((red, blue)'],
    [
      'two space-joined gradients',
      'linear-gradient(red, blue) linear-gradient(green, black)'
    ]
  ])('refuses a gradient with %s', (_n, text) => {
    const supports = jest.fn(() => true)
    expect(isValidGradient(text, supports)).toBe(false)
    expect(supports).not.toHaveBeenCalled()
  })
})

describe('CR-01: -webkit-image-set carrying a URL (T-64-12)', () => {
  const webkit = '-webkit-image-set("https://attacker.example/p.png" 1x)'

  it('refuses it on its own', () => {
    const supports = jest.fn(() => true)
    expect(isValidGradient(webkit, supports)).toBe(false)
    expect(supports).not.toHaveBeenCalled()
  })

  it('refuses it as a second layer after a gradient', () => {
    const supports = jest.fn(() => true)
    expect(
      isValidGradient(`linear-gradient(red, blue), ${webkit}`, supports)
    ).toBe(false)
    expect(supports).not.toHaveBeenCalled()
  })
})

describe('one-layer gradients that must keep validating', () => {
  const gamecard = BUILTIN_TOKENS.midnightMirage?.['--gradient-gamecard'] ?? ''

  it.each([
    'linear-gradient(90deg, rgba(0, 0, 0, 0.5) 10%, #000 90%)',
    'radial-gradient(circle at 50% 50%, rgb(0 0 0 / 50%), transparent)',
    'conic-gradient(from 90deg, hsl(0 100% 50%), #fff)',
    'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.1) 0 10px, transparent 10px 20px)',
    'linear-gradient(90deg, color-mix(in srgb, #000 50%, #fff), #333)',
    gamecard
  ])('accepts %s and asks supports once with the trimmed text', (text) => {
    expect(text).toMatch(/gradient\(/)
    const supports = jest.fn(() => true)
    expect(isValidGradient(`  ${text}  `, supports)).toBe(true)
    expect(supports).toHaveBeenCalledTimes(1)
    expect(supports).toHaveBeenCalledWith('background-image', text.trim())
  })
})

describe('IN-03: gradients only for gradient tokens', () => {
  it.each(['--accent', '--body-background'])(
    'refuses a valid gradient on the colour token %s',
    (name) => {
      expect(isValidTokenValue(name, GOOD, yes)).toBe(false)
    }
  )

  it.each([
    '--gradient-01',
    '--gradient-02',
    '--gradient-gamecard',
    '--gradient-body-background'
  ])('accepts a valid gradient on %s', (name) => {
    expect(isValidTokenValue(name, GOOD, yes)).toBe(true)
  })

  it('leaves colour validation unchanged', () => {
    expect(isValidTokenValue('--accent', '#112233', yes)).toBe(true)
    expect(isValidTokenValue('--accent', 'var(--x)', yes)).toBe(false)
  })
})
