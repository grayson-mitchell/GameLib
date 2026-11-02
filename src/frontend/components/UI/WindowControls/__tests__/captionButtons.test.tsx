/**
 * Gates for quick 261102-p8r: GameLib's in-app WindowControls (Windows/Linux,
 * frameless mode) must look like the native Windows 11 caption buttons.
 *
 * There is no jsdom and no stylesheet transform in the `Frontend` jest
 * project (`testEnvironment: node`, no `.scss` moduleNameMapper), so
 * `WindowControls/index.tsx` -- which imports `./index.scss` -- cannot be
 * imported here. It is read as source text instead. The glyph module has no
 * stylesheet import, so it IS imported, and each glyph is called as a plain
 * function; the returned React element's `type` and `props` are inspected
 * directly (the pattern `CachedImage/__tests__/index.test.tsx` uses).
 *
 * Every assertion that could pass vacuously is paired with an anti-vacuity
 * check that proves the matcher fails against the known-bad pre-fix input.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { ReactElement } from 'react'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  MinimizeGlyph,
  MaximizeGlyph,
  RestoreGlyph,
  CloseGlyph
} from '../CaptionGlyphs'

const WINDOW_CONTROLS_DIR = join(__dirname, '..')

function readStripped(path: string): string {
  return stripSourceComments(readFileSync(path, 'utf8'))
}

/**
 * Parses a single absolute `M x y H x2` segment and returns true only when
 * it is a horizontal line spanning at least 80% of `box` and sitting within
 * 5% of the vertical centre.
 */
function centredHorizontalLine(d: string, box: number): boolean {
  const m = d
    .trim()
    .match(
      /^M\s*(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)\s*H\s*(-?\d+(?:\.\d+)?)$/
    )
  if (!m) return false
  const x = Number(m[1])
  const y = Number(m[2])
  const x2 = Number(m[3])
  return Math.abs(x2 - x) >= 0.8 * box && Math.abs(y - box / 2) <= 0.05 * box
}

type SvgProps = Record<string, unknown> & {
  children?: ReactElement | ReactElement[]
}

describe('caption glyphs (261102-p8r)', () => {
  const glyphs: Array<[string, () => ReactElement]> = [
    ['MinimizeGlyph', MinimizeGlyph],
    ['MaximizeGlyph', MaximizeGlyph],
    ['RestoreGlyph', RestoreGlyph],
    ['CloseGlyph', CloseGlyph]
  ]

  it.each(glyphs)(
    'G1 shared box: %s is a 10x10 currentColor-stroked decorative svg',
    (_name, Glyph) => {
      const el = Glyph()
      const props = el.props as SvgProps
      expect(el.type).toBe('svg')
      expect(String(props.width)).toBe('10')
      expect(String(props.height)).toBe('10')
      expect(props.viewBox).toBe('0 0 10 10')
      expect(props.fill).toBe('none')
      expect(props.stroke).toBe('currentColor')
      expect(props['aria-hidden']).toBeTruthy()
    }
  )

  it('G2 centred dash: MinimizeGlyph is a single full-width line through the vertical middle', () => {
    const props = MinimizeGlyph().props as SvgProps
    const child = props.children as ReactElement
    expect(Array.isArray(child)).toBe(false)
    expect(child.type).toBe('path')
    expect(centredHorizontalLine((child.props as { d: string }).d, 10)).toBe(
      true
    )
  })

  it('G2 sanity: the helper rejects the old bottom-justified Material bar and non-horizontal paths', () => {
    // The Material `Minimize` bar: centre line y=20 of a 24 box (y 19..21).
    expect(centredHorizontalLine('M6 20H18', 24)).toBe(false)
    expect(centredHorizontalLine('M0 0L10 10', 10)).toBe(false)
    // ...and accepts a known-good centred dash, so it is not unmatchable.
    expect(centredHorizontalLine('M0 5.5H10', 10)).toBe(true)
  })

  describe('G3 render path', () => {
    const MUI_IMPORT = /from\s+['"]@mui\/icons-material['"]/
    const source = readStripped(join(WINDOW_CONTROLS_DIR, 'index.tsx'))

    it('imports no Material icons and takes the glyphs from ./CaptionGlyphs', () => {
      expect(source).not.toMatch(MUI_IMPORT)
      expect(source).toMatch(
        /import\s*\{[^}]*\bMinimizeGlyph\b[^}]*\bMaximizeGlyph\b[^}]*\}\s*from\s*['"]\.\/CaptionGlyphs['"]/
      )
      for (const name of [
        'MinimizeGlyph',
        'MaximizeGlyph',
        'RestoreGlyph',
        'CloseGlyph'
      ]) {
        expect(source).toMatch(
          new RegExp(
            `import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]\\./CaptionGlyphs['"]`
          )
        )
      }
    })

    it('renders each glyph inside its button', () => {
      expect(source).toMatch(/className="minimize"[\s\S]*?<MinimizeGlyph\s*\/>/)
      expect(source).toMatch(
        /className="maximize"[\s\S]*?maximized\s*\?\s*<RestoreGlyph\s*\/>\s*:\s*<MaximizeGlyph\s*\/>/
      )
      expect(source).toMatch(/className="close"[\s\S]*?<CloseGlyph\s*\/>/)
    })

    it('G3 sanity: the import regex DOES match the pre-fix import line', () => {
      const preFix = "} from '@mui/icons-material'"
      expect(MUI_IMPORT.test(preFix)).toBe(true)
    })
  })
})
