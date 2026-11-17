import {
  isValidGradient,
  isValidTokenValue,
  validateColourInput
} from '../validate'

const yes = () => true
const GOOD = 'linear-gradient(90deg, #000, #333)'

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
    ['uppercase VAR(', 'linear-gradient(90deg, VAR(--x), #333)']
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
