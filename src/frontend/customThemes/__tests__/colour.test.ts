import {
  contrastRatio,
  formatRatio,
  normaliseColour,
  parseColour,
  safeColour,
  tryContrast
} from '../colour'

const MALFORMED = [
  '',
  ' ',
  '#',
  '#1',
  '#12',
  '#12345',
  '#1234567',
  '#123456789',
  '#ggg',
  '#GGGGGG',
  '#12 456',
  '##abc',
  'abc',
  'red',
  'transparentish',
  'var(--x)',
  'var(--x, #fff)',
  'color-mix(in srgb, #fff 50%, #000)',
  'linear-gradient(red, blue)',
  'currentColor',
  'inherit',
  'rgb()',
  'rgb(1,2)',
  'rgb(1,2,3,4,5)',
  'rgb(a,b,c)',
  'rgb(256,0,0)',
  'rgb(-1,0,0)',
  'rgba(0,0,0,2)',
  'rgba(0,0,0,101%)',
  'rgba(0,0,0,-0.5)',
  'rgba(0,0,0',
  'rgb(1 2 3)',
  'hsl(0, 0%, 0%)',
  'url(x.png)',
  '\u0000',
  '\n',
  '💥',
  '#ff00ff;',
  '#ff00ff !important',
  'NaN',
  'Infinity',
  'null',
  'undefined',
  '[object Object]',
  '()',
  ')))',
  '((((',
  'rgba(',
  'rgba(,,,)',
  'rgba(1e9,0,0,1)',
  'rgb(1.5.5,0,0)',
  '#' + 'f'.repeat(5000),
  'x'.repeat(10000)
]

describe('parseColour', () => {
  it('reads #rgb, #rgba, #rrggbb and #rrggbbaa', () => {
    expect(parseColour('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 })
    expect(parseColour('#aabbcc')).toEqual({ r: 170, g: 187, b: 204, a: 1 })
    expect(parseColour('#abcd')).toEqual({
      r: 170,
      g: 187,
      b: 204,
      a: 221 / 255
    })
    expect(parseColour('#aabbcc80')).toEqual({
      r: 170,
      g: 187,
      b: 204,
      a: 128 / 255
    })
  })

  it('reads rgb() and rgba() with a fractional or percentage alpha', () => {
    expect(parseColour('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 })
    expect(parseColour('rgba(1, 2, 3, 0.5)')).toEqual({
      r: 1,
      g: 2,
      b: 3,
      a: 0.5
    })
    expect(parseColour('rgba(1, 2, 3, 50%)')).toEqual({
      r: 1,
      g: 2,
      b: 3,
      a: 0.5
    })
    expect(parseColour('rgba(1,2,3,.25)')).toEqual({
      r: 1,
      g: 2,
      b: 3,
      a: 0.25
    })
  })

  it('rejects a channel above 255 and an alpha above 1', () => {
    expect(parseColour('rgb(256, 0, 0)')).toBeNull()
    expect(parseColour('rgba(0, 0, 0, 1.5)')).toBeNull()
    expect(parseColour('rgba(0, 0, 0, 150%)')).toBeNull()
  })

  it('reads the five named colours, case-insensitively and trimmed', () => {
    expect(parseColour('gray')).toEqual({ r: 128, g: 128, b: 128, a: 1 })
    expect(parseColour('GREY')).toEqual({ r: 128, g: 128, b: 128, a: 1 })
    expect(parseColour(' white ')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseColour('black')).toEqual({ r: 0, g: 0, b: 0, a: 1 })
    expect(parseColour('Transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 })
  })

  it('returns null for empty, var(), short, non-hex and unlisted-name text', () => {
    for (const text of ['', 'var(--x)', '#12', '#ggg', 'red']) {
      expect(parseColour(text)).toBeNull()
    }
    expect(parseColour('linear-gradient(red, blue)')).toBeNull()
  })

  it('never throws on malformed input (T-64-01)', () => {
    expect(MALFORMED.length).toBeGreaterThanOrEqual(50)
    for (const text of MALFORMED) {
      expect(() => parseColour(text)).not.toThrow()
      expect(() => normaliseColour(text)).not.toThrow()
      expect(() => tryContrast(text, '#000000')).not.toThrow()
      expect(() => tryContrast('#ffffff', text)).not.toThrow()
      expect(() => safeColour(text, '#123456')).not.toThrow()
    }
  })
})

describe('normaliseColour', () => {
  it('lowercases hex and expands short forms', () => {
    expect(normaliseColour('#ABC')).toBe('#aabbcc')
    expect(normaliseColour('#AABBCC')).toBe('#aabbcc')
  })

  it('appends an alpha byte only when alpha is below 1', () => {
    expect(normaliseColour('rgba(255, 0, 0, 0.5)')).toBe('#ff000080')
    expect(normaliseColour('rgb(255, 0, 0)')).toBe('#ff0000')
    expect(normaliseColour('#ff0000ff')).toBe('#ff0000')
    expect(normaliseColour('transparent')).toBe('#00000000')
  })

  it('returns null for unparseable text', () => {
    expect(normaliseColour('')).toBeNull()
    expect(normaliseColour('var(--x)')).toBeNull()
    expect(normaliseColour('#ggg')).toBeNull()
  })
})

describe('tryContrast', () => {
  it('equals the legacy contrastRatio for opaque colours', () => {
    expect(tryContrast('#808080', '#000000')).toBe(
      contrastRatio('#808080', '#000000')
    )
    expect(tryContrast('white', '#222222')).toBe(
      contrastRatio('white', '#222222')
    )
  })

  it('composites a translucent foreground over the background first', () => {
    // 50% white over black is #808080 (127.5 rounds to 128 per channel).
    const composited = tryContrast('rgba(255, 255, 255, 0.5)', '#000000')
    expect(composited).not.toBeNull()
    expect(composited as number).toBeCloseTo(
      contrastRatio('#808080', '#000000'),
      1
    )
  })

  it('is null when either side is unparseable or missing', () => {
    expect(tryContrast('#12', '#000000')).toBeNull()
    expect(tryContrast('#ffffff', 'var(--x)')).toBeNull()
    expect(tryContrast(undefined, '#000000')).toBeNull()
    expect(tryContrast('#ffffff', undefined)).toBeNull()
  })

  it('is null when either side is fully transparent', () => {
    expect(tryContrast('#ffffff', 'transparent')).toBeNull()
    expect(tryContrast('transparent', '#000000')).toBeNull()
    expect(tryContrast('#ffffff00', '#000000')).toBeNull()
  })

  it('measures a partly transparent background as opaque (legacy toRgb behaviour)', () => {
    expect(tryContrast('#ffffff', '#00000080')).toBe(
      contrastRatio('#ffffff', '#000000')
    )
  })
})

describe('formatRatio', () => {
  it('truncates to one decimal, never rounds up', () => {
    expect(formatRatio(2.96)).toBe('2.9')
    expect(formatRatio(3)).toBe('3.0')
    expect(formatRatio(14.649)).toBe('14.6')
  })
})

describe('safeColour', () => {
  it('falls back for unparseable or missing values', () => {
    expect(safeColour('#12', '#000000')).toBe('#000000')
    expect(safeColour(undefined, '#123456')).toBe('#123456')
    expect(safeColour('', '#123456')).toBe('#123456')
  })

  it('canonicalises a parseable value', () => {
    expect(safeColour('#ABCDEF', '#000000')).toBe('#abcdef')
  })
})
