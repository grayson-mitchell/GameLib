/**
 * The macOS icon geometry oracle (94-07, kept by 94-24; D-25): the crop the `.icns` conversion applies.
 *
 * PNG inputs with distinct colour bands go through the shipped `createNativeImage` shim chain over the real
 * `/usr/bin/sips`, and the golden holds the output size and the colour at fixed sample points, which show
 * which band the centred crop kept. The Rust `.icns` writer replays the goldens on every OS
 * (`gamelib-shortcuts/tests/icns.rs`, `icon_geometry_goldens_replay`, `#[ignore]`d until they exist).
 *
 * The geometry describe runs only on darwin (it needs `/usr/bin/sips`), so this file is green on every other
 * host without recording anything. To record the goldens, on a Mac:
 *
 *   GAMELIB_WRITE_SHORTCUTS_GOLDEN=1 pnpm exec jest --runTestsByPath \
 *     src/backend/testUtils/shortcutsIconGeometry/__tests__/iconGeometry.oracle.test.ts
 *
 * then follow `.planning/todos/pending/2026-11-24-record-macos-icon-geometry-goldens-on-a-mac.md`, and delete
 * `src/backend/testUtils/shortcutsIconGeometry/` in the commit that records them. See `iconGeometryGoldens.ts`.
 *
 * Everything outside the geometry describe (the PNG codec and the golden writer) runs on every host.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createNativeImage } from 'backend/sidecar/nativeImageShim'
import { createRealRunner } from 'backend/testUtils/realRunner'
import {
  assertIconGeometryManifest,
  bandedPng,
  BLUE,
  decodePng,
  encodePng,
  expectEmptyIconGeometryCasesToFail,
  GEOMETRY_CASES,
  iconGeometryDir,
  overrideGoldenRoot,
  RED,
  samplePoints,
  syncIconGeometryManifest,
  writeOrCompareIconGeometryGolden
} from '../iconGeometryGoldens'

/** The case count the committed manifest must hold; a later edit may raise it, never lower it. */
const GEOMETRY_FLOOR = 4

describe('the PNG codec the geometry cases use (every host)', () => {
  const colourAt = (x: number, y: number): readonly number[] => [
    (x * 7 + y * 3) & 0xff,
    (x * 5 + y * 11) & 0xff,
    (x * 13 + y * 2) & 0xff,
    (x + y) & 0xff
  ]

  it.each([0, 1, 2, 3, 4])(
    'decodes what it encodes with scanline filter %i (RGB and RGBA)',
    (filter) => {
      for (const channels of [3, 4] as const) {
        const png = encodePng(13, 9, channels, colourAt, () => filter)
        const decoded = decodePng(png)
        expect([decoded.width, decoded.height]).toEqual([13, 9])
        for (let y = 0; y < 9; y++) {
          for (let x = 0; x < 13; x++) {
            const [r, g, b, a] = colourAt(x, y)
            expect(decoded.at(x, y)).toEqual([
              r,
              g,
              b,
              channels === 4 ? a : 255
            ])
          }
        }
      }
    }
  )

  it('mixes filters across the scanlines of one image', () => {
    const png = encodePng(20, 10, 4, colourAt, (y) => y % 5)
    const decoded = decodePng(png)
    expect(decoded.at(19, 9)).toEqual(colourAt(19, 9))
  })

  it('rejects an interlaced or unsupported PNG by name', () => {
    const png = encodePng(2, 2, 3, () => [1, 2, 3])
    png[28] = 1
    expect(() => decodePng(png)).toThrow(/unsupported PNG/)
  })

  it('the banded inputs have the dimensions and bands the cases name', () => {
    for (const c of GEOMETRY_CASES) {
      const decoded = decodePng(bandedPng(c))
      expect([decoded.width, decoded.height]).toEqual([c.width, c.height])
      expect(decoded.at(0, 0).slice(0, 3)).toEqual([...RED])
      expect(decoded.at(c.width - 1, c.height - 1).slice(0, 3)).toEqual([
        ...BLUE
      ])
    }
  })

  it('every sample point lies inside its output', () => {
    for (const [w, h] of [
      [512, 512],
      [1, 1],
      [3, 700]
    ] as const) {
      for (const p of samplePoints(w, h)) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThan(w)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThan(h)
      }
    }
  })
})

describe('the golden writer (every host)', () => {
  let scratch = ''
  let restore: () => void = () => undefined
  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'gamelib-icon-geometry-golden-'))
    restore = overrideGoldenRoot(scratch)
  })
  afterEach(() => {
    restore()
    rmSync(scratch, { recursive: true, force: true })
  })

  it('writes a golden and a manifest, and the compare mode accepts exactly that text', () => {
    const ids = ['a-case', 'b-case']
    syncIconGeometryManifest(ids, 2, 'write')
    for (const id of ids) {
      writeOrCompareIconGeometryGolden(id, { id }, 'write')
    }
    for (const id of ids) {
      writeOrCompareIconGeometryGolden(id, { id }, 'compare')
    }
    assertIconGeometryManifest(ids, 2, 'compare')
    expect(
      JSON.parse(readFileSync(join(iconGeometryDir(), 'MANIFEST.json'), 'utf8'))
    ).toEqual({
      count: 2,
      floor: 2
    })
  })

  it('a hand-edited golden, a missing golden and a case id that is not a plain name all fail', () => {
    writeOrCompareIconGeometryGolden('edited', { a: 1 }, 'write')
    writeFileSync(join(iconGeometryDir(), 'edited.json'), '{"a":2}\n')
    expect(() =>
      writeOrCompareIconGeometryGolden('edited', { a: 1 }, 'compare')
    ).toThrow()
    expect(() =>
      writeOrCompareIconGeometryGolden('absent', { a: 1 }, 'compare')
    ).toThrow(/golden is missing/)
    expect(() =>
      writeOrCompareIconGeometryGolden('../escape', { a: 1 }, 'write')
    ).toThrow(/not a plain name/)
  })

  it('a manifest that disagrees with the case list, or one missing, fails; a rewrite never lowers the floor', () => {
    mkdirSync(iconGeometryDir(), { recursive: true })
    expect(() => assertIconGeometryManifest(['x'], 1, 'compare')).toThrow(
      /MANIFEST.json is missing/
    )
    syncIconGeometryManifest(['x', 'y'], 2, 'write')
    writeOrCompareIconGeometryGolden('x', 1, 'write')
    writeOrCompareIconGeometryGolden('y', 1, 'write')
    expect(() => assertIconGeometryManifest(['x'], 1, 'compare')).toThrow()
    syncIconGeometryManifest(['x', 'y'], 1, 'write')
    expect(
      JSON.parse(readFileSync(join(iconGeometryDir(), 'MANIFEST.json'), 'utf8'))
    ).toEqual({ count: 2, floor: 2 })
  })

  it('an empty case list fails the floor', () => {
    expectEmptyIconGeometryCasesToFail(GEOMETRY_FLOOR)
  })
})

// `/usr/bin/sips` exists only on macOS; the committed goldens are what Rust replays elsewhere.
const HOST_IS_DARWIN = process.platform === 'darwin'
const geometryDescribe = HOST_IS_DARWIN ? describe : describe.skip

geometryDescribe('icon_geometry (darwin only: /usr/bin/sips)', () => {
  const real = HOST_IS_DARWIN ? createRealRunner() : null
  afterAll(() => real?.dispose())
  const ids = GEOMETRY_CASES.map((c) => c.id)

  it('the case list is at or above the floor and agrees with the committed manifest', () => {
    syncIconGeometryManifest(ids, GEOMETRY_FLOOR)
    assertIconGeometryManifest(ids, GEOMETRY_FLOOR)
  })

  it.each(GEOMETRY_CASES.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    if (!real) throw new Error('no real runner')
    const image = createNativeImage({
      runSync: (cmd, argv, opts) => real.runner.runSync(cmd, argv, opts)
    })
    // The exact chain `convertPngToICNS` ran (the deleted shortcuts.ts).
    let output: unknown
    try {
      const png = image
        .createFromBuffer(bandedPng(c))
        .resize({ width: 512 })
        .crop({ x: 0, y: 0, width: 512, height: 512 })
        .toPNG()
      const decoded = decodePng(png)
      output = {
        width: decoded.width,
        height: decoded.height,
        samples: samplePoints(decoded.width, decoded.height).map((p) => ({
          ...p,
          rgba: decoded.at(p.x, p.y)
        }))
      }
    } catch (error) {
      output = {
        threw: true,
        message: (error instanceof Error ? error.message : String(error))
          .replace(/\/[^\s]*gamelib-nativeimage-[^\s]*/g, '<TMP>')
          .slice(0, 200)
      }
    }
    writeOrCompareIconGeometryGolden(c.id, {
      input: {
        width: c.width,
        height: c.height,
        orientation: c.orientation,
        bands: c.bands
      },
      chain:
        'createFromBuffer(png).resize({ width: 512 }).crop({ x: 0, y: 0, width: 512, height: 512 }).toPNG()',
      output
    })
  })
})
