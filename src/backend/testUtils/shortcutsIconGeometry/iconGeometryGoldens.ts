/**
 * The macOS `.icns` icon geometry oracle, kept as a scheduled survivor (94-24, D-23, D-25).
 *
 * Phase 94 deleted the TypeScript shortcuts service and its oracle harness once the Rust crate
 * `gamelib-shortcuts` replayed every golden. One family could not be recorded on the Windows host that
 * ran 94-07: `golden/icon_geometry/`, four goldens of what the shipped `/usr/bin/sips` chain keeps
 * when a PNG is resized and cropped to 512x512. They need a Mac, so the oracle that records them stays,
 * cut down to the pieces it needs: the golden writer and comparer, a PNG codec and the four inputs.
 * The Rust replay (`icon_geometry_goldens_replay`, `gamelib-shortcuts/tests/icns.rs`) is `#[ignore]`d
 * until they exist; the todo `2026-11-24-record-macos-icon-geometry-goldens-on-a-mac` carries the steps.
 *
 * Delete this directory in the same commit that commits the goldens, or in Phase 99 at the latest (the
 * `humbleShortcutsShimSchedule` row names the phase). It drives nothing else: the other golden families
 * were recorded by the deleted oracle and are never re-recorded from a deleted file.
 *
 * Modes:
 *   GAMELIB_WRITE_SHORTCUTS_GOLDEN=1   write the goldens (and MANIFEST.json) from the shipped chain
 *   (default)                          recompute and compare, offline
 *
 * Fixture layout: `<crate>/tests/fixtures/golden/icon_geometry/<case>.json` and `MANIFEST.json`
 * (`{ count, floor }`). No expected value is typed by hand.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { dirname, join } from 'path'
import { crc32, deflateSync, inflateSync } from 'zlib'
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'

export type GoldenMode = 'write' | 'compare'

/** The one golden family this oracle owns. */
const ICON_GEOMETRY_SLICE = 'icon_geometry'

let goldenRootOverride: string | null = null

/**
 * Test-only: points every golden path at `dir` (a temp directory) so the self-tests can write and
 * compare goldens without touching the committed crate. Returns the restore function.
 */
export function overrideGoldenRoot(dir: string): () => void {
  goldenRootOverride = dir
  return () => {
    goldenRootOverride = null
  }
}

/** `<repo>/src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden`, or the override. */
function goldenRoot(): string {
  return (
    goldenRootOverride ??
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'src-tauri',
      'crates',
      'gamelib-shortcuts',
      'tests',
      'fixtures',
      'golden'
    )
  )
}

export const iconGeometryDir = (): string =>
  join(goldenRoot(), ICON_GEOMETRY_SLICE)

/** `GAMELIB_WRITE_SHORTCUTS_GOLDEN=1` writes the goldens, anything else compares. */
function goldenMode(): GoldenMode {
  return process.env.GAMELIB_WRITE_SHORTCUTS_GOLDEN === '1'
    ? 'write'
    : 'compare'
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

/** A golden file name must be one plain segment; a case id is built from ASCII ids and `-`. */
function assertCaseId(caseId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(caseId)) {
    throw new Error(
      `golden case id ${JSON.stringify(caseId)} is not a plain name`
    )
  }
}

/**
 * Write mode: writes `icon_geometry/<caseId>.json` from `value`. Compare mode: asserts the committed
 * file holds exactly the same text, so a hand edit of a golden fails.
 */
export function writeOrCompareIconGeometryGolden(
  caseId: string,
  value: unknown,
  mode: GoldenMode = goldenMode()
): void {
  assertCaseId(caseId)
  const file = join(iconGeometryDir(), `${caseId}.json`)
  const text = json(value)
  if (mode === 'write') {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
    return
  }
  if (!existsSync(file)) {
    throw new Error(
      `${ICON_GEOMETRY_SLICE}/${caseId}: golden is missing, record it with GAMELIB_WRITE_SHORTCUTS_GOLDEN=1`
    )
  }
  expect(text).toBe(readFileSync(file, 'utf8'))
}

interface Manifest {
  count: number
  floor: number
}

function readManifest(): Manifest | null {
  const file = join(iconGeometryDir(), 'MANIFEST.json')
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8')) as Manifest
}

/** The golden case ids on disk, sorted (MANIFEST excluded). */
function committedCaseIds(): string[] {
  const dir = iconGeometryDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name !== 'MANIFEST.json')
    .map((name) => name.slice(0, -'.json'.length))
    .sort()
}

/**
 * Write mode: records `{ count, floor }` and removes goldens no case produces any more. The floor is
 * the one already committed (never lowered by a rewrite) or, for a first recording, `defaultFloor`.
 * Compare mode does nothing.
 */
export function syncIconGeometryManifest(
  caseIds: readonly string[],
  defaultFloor: number,
  mode: GoldenMode = goldenMode()
): void {
  if (mode !== 'write') return
  const existing = readManifest()
  const manifest: Manifest = {
    count: caseIds.length,
    floor: Math.max(existing?.floor ?? 0, defaultFloor)
  }
  mkdirSync(iconGeometryDir(), { recursive: true })
  writeFileSync(join(iconGeometryDir(), 'MANIFEST.json'), json(manifest))
  const keep = new Set(caseIds)
  for (const id of committedCaseIds()) {
    if (!keep.has(id)) rmSync(join(iconGeometryDir(), `${id}.json`))
  }
}

/**
 * The vacuous-pass guard (82 D-05): the case list is at or above the floor the test itself carries,
 * the committed MANIFEST agrees with it, and the folder holds exactly one golden per case. Compare
 * mode only for the on-disk checks.
 */
export function assertIconGeometryManifest(
  caseIds: readonly string[],
  minFloor: number,
  mode: GoldenMode = goldenMode()
): void {
  assertAtOrAboveFloor(
    `${ICON_GEOMETRY_SLICE} oracle cases`,
    caseIds.length,
    minFloor
  )
  if (mode !== 'compare') return
  const manifest = readManifest()
  if (!manifest)
    throw new Error(`${ICON_GEOMETRY_SLICE}: MANIFEST.json is missing`)
  assertAtOrAboveFloor(
    `${ICON_GEOMETRY_SLICE} oracle manifest floor`,
    manifest.floor,
    minFloor
  )
  expect(manifest.count).toBe(caseIds.length)
  expect(new Set(caseIds).size).toBe(caseIds.length)
  expect(committedCaseIds()).toEqual([...caseIds].sort())
}

/** Test-only: an empty case list must fail the floor guard. */
export function expectEmptyIconGeometryCasesToFail(minFloor: number): void {
  expect(() => assertIconGeometryManifest([], minFloor, 'compare')).toThrow(
    /below the floor/
  )
}

// ------------------------------------------------------------------ inputs

/** One RGB triple. */
export type Rgb = readonly [number, number, number]

export const RED: Rgb = [220, 30, 30]
const GREEN: Rgb = [30, 200, 30]
export const BLUE: Rgb = [30, 30, 220]

export interface GeometryCase {
  id: string
  width: number
  height: number
  /** `horizontal`: bands stack top to bottom. `vertical`: bands run left to right. */
  orientation: 'horizontal' | 'vertical'
  bands: readonly Rgb[]
}

export const GEOMETRY_CASES: readonly GeometryCase[] = [
  {
    id: 'tall-600x900-three-horizontal-bands',
    width: 600,
    height: 900,
    orientation: 'horizontal',
    bands: [RED, GREEN, BLUE]
  },
  {
    id: 'wide-900x400-three-vertical-bands',
    width: 900,
    height: 400,
    orientation: 'vertical',
    bands: [RED, GREEN, BLUE]
  },
  {
    id: 'square-512x512-three-vertical-bands',
    width: 512,
    height: 512,
    orientation: 'vertical',
    bands: [RED, GREEN, BLUE]
  },
  {
    id: 'small-100x300-three-horizontal-bands',
    width: 100,
    height: 300,
    orientation: 'horizontal',
    bands: [RED, GREEN, BLUE]
  }
]

// --------------------------------------------------------------- PNG codec

/** Applies PNG filter `type` to one scanline of `bpp`-byte pixels (`prior` is the line above). */
function filterLine(
  type: number,
  line: Buffer,
  prior: Buffer,
  bpp: number
): Buffer {
  const out = Buffer.alloc(line.length)
  for (let i = 0; i < line.length; i++) {
    const a = i >= bpp ? (line[i - bpp] ?? 0) : 0
    const b = prior[i] ?? 0
    const c = i >= bpp ? (prior[i - bpp] ?? 0) : 0
    const x = line[i] ?? 0
    let predicted = 0
    if (type === 1) predicted = a
    else if (type === 2) predicted = b
    else if (type === 3) predicted = Math.floor((a + b) / 2)
    else if (type === 4) predicted = paeth(a, b, c)
    out[i] = (x - predicted) & 0xff
  }
  return out
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const check = Buffer.alloc(4)
  check.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, check])
}

/** An 8-bit PNG (`channels` 3 = RGB, 4 = RGBA) whose scanline `y` uses `filterOf(y)`. */
export function encodePng(
  width: number,
  height: number,
  channels: 3 | 4,
  pixel: (x: number, y: number) => readonly number[],
  filterOf: (y: number) => number = () => 0
): Buffer {
  const bpp = channels
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = channels === 3 ? 2 : 6
  const rows: Buffer[] = []
  let prior: Buffer = Buffer.alloc(width * bpp)
  for (let y = 0; y < height; y++) {
    const line = Buffer.alloc(width * bpp)
    for (let x = 0; x < width; x++) {
      const px = pixel(x, y)
      for (let k = 0; k < bpp; k++) line[x * bpp + k] = px[k] ?? 255
    }
    const type = filterOf(y)
    rows.push(
      Buffer.concat([Buffer.from([type]), filterLine(type, line, prior, bpp)])
    )
    prior = line
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0))
  ])
}

export interface Decoded {
  width: number
  height: number
  /** RGBA, 8 bit per channel, row major. */
  at(x: number, y: number): [number, number, number, number]
}

/** Decodes a non-interlaced PNG of colour type 0, 2, 4 or 6 at bit depth 8 or 16. */
export function decodePng(png: Buffer): Decoded {
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('not a PNG')
  }
  let pos = 8
  let width = 0
  let height = 0
  let depth = 0
  let colour = 0
  let interlace = 0
  const idat: Buffer[] = []
  while (pos < png.length) {
    const length = png.readUInt32BE(pos)
    const type = png.subarray(pos + 4, pos + 8).toString('ascii')
    const data = png.subarray(pos + 8, pos + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      depth = data[8] ?? 0
      colour = data[9] ?? 0
      interlace = data[12] ?? 0
    } else if (type === 'IDAT') idat.push(data)
    pos += 12 + length
  }
  const channelsOf: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 }
  const channels = channelsOf[colour]
  if (channels === undefined || (depth !== 8 && depth !== 16) || interlace) {
    throw new Error(
      `unsupported PNG (colour type ${colour}, depth ${depth}, interlace ${interlace})`
    )
  }
  const bytesPerPixel = (channels * depth) / 8
  const stride = width * bytesPerPixel
  const raw = inflateSync(Buffer.concat(idat))
  const pixels = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)] ?? 0
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a =
        i >= bytesPerPixel ? (pixels[y * stride + i - bytesPerPixel] ?? 0) : 0
      const b = y > 0 ? (pixels[(y - 1) * stride + i] ?? 0) : 0
      const c =
        y > 0 && i >= bytesPerPixel
          ? (pixels[(y - 1) * stride + i - bytesPerPixel] ?? 0)
          : 0
      let predicted = 0
      if (type === 1) predicted = a
      else if (type === 2) predicted = b
      else if (type === 3) predicted = Math.floor((a + b) / 2)
      else if (type === 4) predicted = paeth(a, b, c)
      pixels[y * stride + i] = ((src[i] ?? 0) + predicted) & 0xff
    }
  }
  return {
    width,
    height,
    at(x, y) {
      const base = y * stride + x * bytesPerPixel
      const sample = (channel: number): number =>
        pixels[base + channel * (depth / 8)] ?? 0
      if (colour === 0) return [sample(0), sample(0), sample(0), 255]
      if (colour === 4) return [sample(0), sample(0), sample(0), sample(1)]
      return [sample(0), sample(1), sample(2), colour === 6 ? sample(3) : 255]
    }
  }
}

/** The input a geometry case feeds the shim: bands across the whole image, no gradient. */
export function bandedPng(c: GeometryCase): Buffer {
  const colourAt = (x: number, y: number): Rgb => {
    const along = c.orientation === 'horizontal' ? y / c.height : x / c.width
    const index = Math.min(
      c.bands.length - 1,
      Math.floor(along * c.bands.length)
    )
    return c.bands[index] ?? RED
  }
  return encodePng(c.width, c.height, 3, colourAt)
}

/** Sample points as fractions of the output size, along the two centre lines. */
const FRACTIONS = [0.03, 0.12, 0.5, 0.88, 0.97] as const

export function samplePoints(
  width: number,
  height: number
): { x: number; y: number }[] {
  const at = (fraction: number, size: number): number =>
    Math.min(size - 1, Math.floor(fraction * size))
  return [
    ...FRACTIONS.map((f) => ({ x: at(0.5, width), y: at(f, height) })),
    ...FRACTIONS.map((f) => ({ x: at(f, width), y: at(0.5, height) }))
  ]
}
