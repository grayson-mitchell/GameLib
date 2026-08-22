/**
 * Phase 34.1 gap closure (G3 / D-11), REDIRECTED 2026-08-13: asserts the macOS tray icon
 * TEMPLATE asset is real -- byte-distinct from its full-colour source, and (the property that
 * actually matters) a valid AppKit template image.
 *
 * ORIGINAL FRAMING (superseded, kept here for the record): this suite used to assert
 * `icon-dark.png` and `icon-light.png` were byte-distinct, gated behind `it.failing` because
 * they were (and, on Windows/Linux, still ARE -- see below) byte-identical. A fix attempt that
 * regenerated `icon-light*.png` as a straight RGB inversion of the branded artwork was written,
 * gated on a mean-opaque-luminance delta, and REJECTED: the artwork is a full-colour magenta
 * gamer-cat over an orange starburst, and inverting RGB produced a full-colour GREEN cat --
 * still an unreadable smudge at 22px, still no more legible against a light menu bar than the
 * original. The luminance-delta gate was non-vacuous and correctly computed, and it guarded
 * NOTHING that mattered, because mean brightness is not the property "legible on a real menu
 * bar" depends on. See `meta/trayIconVariants.ts`'s module docstring for the full account and
 * commit `49e891f58` (reverted) for the rejected code.
 *
 * CURRENT FIX: a macOS AppKit template image (`public/icon-tray-template.png`), hue-segmented
 * from `public/icon-tray-source.png` by `meta/trayIconVariants.ts`, embedded via
 * `src-tauri/src/main.rs`'s `TRAY_ICON_TEMPLATE` and marked with `icon_as_template`/
 * `set_icon_with_as_template` (see `tauriShellSource.test.ts`'s
 * "REQ-34.1-07 macOS tray template wiring" block for the Rust-side coverage). The property that
 * actually matters for a template image is structural, not a brightness proxy: solid black RGB
 * wherever alpha is non-zero, shape carried entirely in alpha. `isMonochromeTemplate` below
 * tests exactly that, imported from the production generator rather than reimplemented here.
 *
 * darkTrayIcon IS VESTIGIAL ON MACOS BY DESIGN as of this fix (see main.rs's `tray_image` doc
 * comment) -- `getIcon()`'s dark/light selector still exists and still round-trips through the
 * sidecar, it simply has zero visible effect on macOS because the template ignores it.
 *
 * WINDOWS/LINUX ARE UNCHANGED AND STILL CARRY THE ORIGINAL DEFECT: `icon-tray-source.png`
 * (the master artwork, named `icon-dark.png` before the rename) and `icon-light.png` remain
 * byte-identical (this redirect's scope was the macOS template path
 * only -- see 34.1-13-SUMMARY.md's "Redirected scope" section). That gate is kept below as
 * `it.failing`, unchanged from before, so it still gates the day someone fixes the Windows/Linux
 * pair without silently going stale.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  decodeRgba,
  isMonochromeTemplate,
  opaqueFraction
} from '../../../meta/trayIconVariants'

const PUBLIC_DIR = join(__dirname, '..', '..', '..', 'public')

function loadAsset(filename: string): Buffer {
  return readFileSync(join(PUBLIC_DIR, filename))
}

describe('macOS tray icon TEMPLATE asset (REQ-34.1-07, GAP-G3 redirect, 34.1-13)', () => {
  test('icon-tray-template.png exists and is byte-distinct from its icon-tray-source.png source', () => {
    const templatePath = join(PUBLIC_DIR, 'icon-tray-template.png')
    expect(existsSync(templatePath)).toBe(true)
    const template = loadAsset('icon-tray-template.png')
    const source = loadAsset('icon-tray-source.png')
    expect(template.equals(source)).toBe(false)
  })

  test('icon-tray-template.png is a valid template image: solid black RGB wherever alpha is non-zero', () => {
    // This is the property that actually matters -- not a brightness proxy like the rejected
    // luminance-delta gate. A template image with any non-black opaque pixel would render
    // wrong colours mixed into macOS's own black/white auto-tinting.
    const { pixels } = decodeRgba(join(PUBLIC_DIR, 'icon-tray-template.png'))
    expect(isMonochromeTemplate(pixels)).toBe(true)
  })

  test('icon-tray-template.png dimensions match its icon-tray-source.png source (22x22)', () => {
    const template = decodeRgba(join(PUBLIC_DIR, 'icon-tray-template.png'))
    const source = decodeRgba(join(PUBLIC_DIR, 'icon-tray-source.png'))
    expect(template.width).toBe(source.width)
    expect(template.height).toBe(source.height)
    expect(template.width).toBe(22)
  })

  test('icon-tray-template.png is a non-degenerate shape -- neither empty nor a near-total blob', () => {
    // Sanity bound, NOT a legibility measurement: legibility (does this read as a recognisable
    // glyph against both a light and dark menu bar) cannot be reduced to a single arithmetic
    // gate and was confirmed by direct visual inspection at generation time (see
    // 34.1-13-SUMMARY.md). This only catches the two mechanical failure modes: segmentation
    // that excluded almost everything, or segmentation that excluded almost nothing (i.e. did
    // not actually separate the glyph from its background -- the exact failure the rejected
    // "flattened silhouette" baseline exhibited).
    const { width, height, pixels } = decodeRgba(
      join(PUBLIC_DIR, 'icon-tray-template.png')
    )
    const fraction = opaqueFraction(width, height, pixels)
    expect(fraction).toBeGreaterThan(0.05)
    expect(fraction).toBeLessThan(0.7)
  })
})

describe('Windows/Linux tray icon dark/light asset distinctness (REQ-34.1-07, GAP-G3, OUT OF SCOPE for the macOS template redirect)', () => {
  // STILL KNOWN FAILING as of 2026-08-13 -- the macOS template redirect (34.1-13) deliberately
  // did not touch these files; see the module docstring above and
  // .planning/todos/pending/tray-dark-light-icons-are-identical.md, which plan 34.1-15 owns.
  // Windows/Linux keep selecting between these two (still byte-identical) files unchanged.
  it.failing(
    'icon-tray-source.png and icon-light.png are NOT byte-identical',
    () => {
      const dark = loadAsset('icon-tray-source.png')
      const light = loadAsset('icon-light.png')
      expect(dark.equals(light)).toBe(false)
    }
  )

  it.failing(
    'icon-tray-source@2x.png and icon-light@2x.png are NOT byte-identical',
    () => {
      const darkPath = join(PUBLIC_DIR, 'icon-tray-source@2x.png')
      const lightPath = join(PUBLIC_DIR, 'icon-light@2x.png')
      expect(existsSync(darkPath)).toBe(true)
      expect(existsSync(lightPath)).toBe(true)
      const dark = readFileSync(darkPath)
      const light = readFileSync(lightPath)
      expect(dark.equals(light)).toBe(false)
    }
  )

  it.failing(
    'icon-tray-source@3x.png and icon-light@3x.png are NOT byte-identical',
    () => {
      const darkPath = join(PUBLIC_DIR, 'icon-tray-source@3x.png')
      const lightPath = join(PUBLIC_DIR, 'icon-light@3x.png')
      expect(existsSync(darkPath)).toBe(true)
      expect(existsSync(lightPath)).toBe(true)
      const dark = readFileSync(darkPath)
      const light = readFileSync(lightPath)
      expect(dark.equals(light)).toBe(false)
    }
  )
})
