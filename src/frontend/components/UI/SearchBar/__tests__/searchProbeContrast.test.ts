// SEARCHPROBE-REMOVE-ME: pins the pure colour-arithmetic half of the default-OFF
// live instrument in ./searchProbe.ts. See that file's own header for what this
// harness is for and its removal recipe. This suite is `.ts`, not `.tsx` --
// deliberately, since the project's `no-explicit-any`/`no-unsafe-*` test override
// in eslint.config.mjs only matches `**/__tests__/**/*.ts`, not `.tsx`.
import { contrastRatio, parseRgb, relativeLuminance } from '../searchProbe'

describe('searchProbe: parseRgb', () => {
  it('parses a plain rgb() string', () => {
    expect(parseRgb('rgb(48, 68, 74)')).toEqual({ r: 48, g: 68, b: 74, a: 1 })
  })

  it('parses an rgba() string, keeping the alpha channel', () => {
    expect(parseRgb('rgba(224, 171, 64, 0.5)')).toEqual({
      r: 224,
      g: 171,
      b: 64,
      a: 0.5
    })
  })

  it('parses a fully transparent colour as a', () => {
    // Transparency is itself a finding for this harness (a transparent hover
    // background would explain the symptom) -- it must parse, not be treated
    // as invalid input.
    const parsed = parseRgb('rgba(0, 0, 0, 0)')
    expect(parsed).toEqual({ r: 0, g: 0, b: 0, a: 0 })
  })

  it('returns null for an empty string, never throwing', () => {
    expect(parseRgb('')).toBeNull()
  })

  it('returns null for modern color() syntax and other unrecognised input', () => {
    expect(parseRgb('color(display-p3 0.1 0.2 0.3)')).toBeNull()
    expect(parseRgb('not-a-colour')).toBeNull()
    expect(parseRgb('#30444a')).toBeNull()
  })
})

describe('searchProbe: relativeLuminance', () => {
  it('computes 0 for pure black and 1 for pure white', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0, a: 1 })).toBeCloseTo(0, 6)
    expect(relativeLuminance({ r: 255, g: 255, b: 255, a: 1 })).toBeCloseTo(1, 6)
  })
})

describe('searchProbe: contrastRatio', () => {
  it('computes exactly 21 for black against white (the WCAG maximum)', () => {
    const ratio = contrastRatio('rgb(0, 0, 0)', 'rgb(255, 255, 255)')
    expect(ratio).not.toBeNull()
    expect(ratio).toBeCloseTo(21, 6)
  })

  it('computes exactly 1 for a colour against itself (the WCAG minimum)', () => {
    const ratio = contrastRatio('rgb(48, 68, 74)', 'rgb(48, 68, 74)')
    expect(ratio).not.toBeNull()
    expect(ratio).toBeCloseTo(1, 6)
  })

  it('returns null, never throws, when either side fails to parse', () => {
    expect(contrastRatio('nonsense', 'rgb(0, 0, 0)')).toBeNull()
    expect(contrastRatio('rgb(0, 0, 0)', '')).toBeNull()
    expect(contrastRatio('nonsense', 'also nonsense')).toBeNull()
  })

  it('is non-vacuous: the two anchor cases actually disagree', () => {
    // Guards against a contrast helper that silently always returns the same
    // number regardless of input -- a green suite proving nothing.
    const maxRatio = contrastRatio('rgb(0, 0, 0)', 'rgb(255, 255, 255)')
    const minRatio = contrastRatio('rgb(48, 68, 74)', 'rgb(48, 68, 74)')
    expect(maxRatio).not.toEqual(minRatio)
  })

  it('discriminates the F-4 hypothesis colours: --accent #30444a over --input-background-like dark surfaces is low-contrast', () => {
    // rgb(48, 68, 74) === #30444a, the dark-slate --accent value named in the
    // 2026-08-26 todo's F-4 hypothesis. This is a fixture-level sanity check,
    // not a diagnosis: it establishes the helper CAN distinguish a genuinely
    // low-contrast pairing from the WCAG max, so a live drive's number can be
    // trusted to mean something.
    const ratio = contrastRatio('rgb(48, 68, 74)', 'rgb(26, 32, 34)')
    expect(ratio).not.toBeNull()
    expect(ratio as number).toBeLessThan(2)
  })
})
