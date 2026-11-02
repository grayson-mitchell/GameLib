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

const WINDOW_CONTROLS_SCSS = join(WINDOW_CONTROLS_DIR, 'index.scss')
const INDEX_SCSS = join(WINDOW_CONTROLS_DIR, '..', '..', '..', 'index.scss')

/**
 * Body of the FIRST rule whose selector+opening-brace matches `openPattern`,
 * tracking brace depth so nested rules do not truncate it. Copied from
 * `windowControlsPlacement.test.ts` rather than imported from a test file.
 */
function extractBlock(source: string, openPattern: RegExp): string | null {
  const match = openPattern.exec(source)
  if (!match) return null

  let idx = match.index + match[0].length
  let depth = 1
  let out = ''
  while (idx < source.length && depth > 0) {
    const ch = source[idx]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    if (depth > 0) out += ch
    idx++
  }
  return out
}

/** Keeps only the depth-0 characters of a block, so nested `&:hover {...}` drop out. */
function restingDeclarations(block: string): string {
  let depth = 0
  let out = ''
  for (const ch of block) {
    if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
    } else if (depth === 0) {
      out += ch
    }
  }
  return out
}

function mustExtract(source: string, pattern: RegExp): string {
  const block = extractBlock(source, pattern)
  if (block === null) throw new Error(`no block matching ${pattern} found`)
  return block
}

describe('caption button chrome (261102-p8r)', () => {
  const controlsScss = readStripped(WINDOW_CONTROLS_SCSS)
  const indexScss = readStripped(INDEX_SCSS)
  const controlsBlock = mustExtract(controlsScss, /^\.windowControls\s*\{/m)
  const buttonBlock = mustExtract(controlsBlock, /^\s*button\s*\{/m)
  const bodyBlock = mustExtract(indexScss, /^body\s*\{/m)

  it('C1 transparent at rest: the button background is transparent and --titlebar-color is not painted', () => {
    expect(restingDeclarations(buttonBlock)).toMatch(
      /background-color:\s*transparent\s*;/
    )
    expect(controlsScss).not.toContain('--titlebar-color')
  })

  it('C1 sanity: the resting-background regex does not match the pre-fix declaration', () => {
    expect('background-color: var(--titlebar-color);').not.toMatch(
      /background-color:\s*transparent\s*;/
    )
  })

  it('C2 hover tints kept', () => {
    const hover = mustExtract(buttonBlock, /&:hover\s*\{/)
    expect(hover).toMatch(/background-color:\s*var\(--secondary-hover\)/)
    const closeHover = mustExtract(buttonBlock, /&\.close:hover\s*\{/)
    expect(closeHover).toMatch(
      /background-color:\s*var\(--status-danger-hover\)/
    )
  })

  it('C3 sizes: 46px wide token, 32px tall token fallback', () => {
    const resting = restingDeclarations(buttonBlock)
    expect(resting).toMatch(
      /width:\s*var\(--window-controls-button-width\)\s*;/
    )
    expect(resting).toMatch(/height:\s*var\(--overlay-controls-height\)\s*;/)
    expect(bodyBlock).toMatch(/--window-controls-button-width:\s*46px\s*;/)
    expect(bodyBlock).toMatch(
      /--overlay-controls-height:\s*env\(titlebar-area-height,\s*32px\)\s*;/
    )
  })

  it('C4 cluster: .windowControls is a flex row, so no line-box strut sits under the buttons', () => {
    expect(restingDeclarations(controlsBlock)).toMatch(/display:\s*flex\s*;/)
  })

  describe('C5 reserve', () => {
    const OFF_MAC_SELECTOR =
      /^\.App:not\(\.macOverlayTitlebar\)\.frameless\s*\{/m

    it('is widened to 3 x the button width off macOS, with body left at 120px', () => {
      const block = mustExtract(indexScss, OFF_MAC_SELECTOR)
      const decl = block.match(/--overlay-controls-width:\s*([^;]+);/)
      expect(decl).not.toBeNull()
      expect(decl?.[1]).toMatch(
        /3\s*\*\s*var\(--window-controls-button-width\)/
      )
      const bodyDecl = bodyBlock.match(/--overlay-controls-width:\s*([^;]+);/)
      expect(bodyDecl).not.toBeNull()
      expect(bodyDecl?.[1]).toContain('120px')
    })

    it('C5 sanity: the selector regex does not match a rule with no macOS exclusion', () => {
      expect('.App.frameless {').not.toMatch(OFF_MAC_SELECTOR)
    })
  })
})
