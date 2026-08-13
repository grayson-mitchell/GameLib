/**
 * Phase 34.1 gap closure (G3 / D-11): dependency-free PNG decode, luminance
 * measurement and alpha-preserving RGB inversion for the tray icon dark/light
 * assets, plus a CLI that regenerates `public/icon-light*.png`.
 *
 * `public/icon-dark.png` and `public/icon-light.png` (and their `@2x`/`@3x`
 * siblings) are byte-identical as of this writing -- see
 * `.planning/todos/pending/tray-dark-light-icons-are-identical.md`. The
 * `changeTrayColor` -> `tray_set_icon` chain runs correctly end to end; it
 * installs a pixel-identical image, so the setting is a visual no-op.
 *
 * DECLARED DEVIATION from the gap's own text: the gap said "regenerate
 * icon-dark". Measurement says otherwise -- `getIcon()`
 * (`src/backend/tray_icon/tray_icon.ts:91`) returns
 * `darkTrayIcon ? iconDark : iconLight`, so `icon-light.png` is the DEFAULT
 * asset (setting off). A tray glyph for a DARK menu bar needs LIGHT ink; the
 * shared artwork measures ~94.6 mean opaque luminance at 1x -- dark ink -- so
 * the artwork already in both slots is the correct `icon-dark` content, and
 * it is `icon-light.png` that holds the wrong variant. This module therefore
 * treats `icon-dark*.png` as the SOURCE of truth and regenerates
 * `icon-light*.png` as its inversion. See 34.1-13-PLAN.md's
 * `<declared_deviation_from_the_gap_text>` for the full reasoning and the
 * Task 2 human checkpoint that can swap this mapping.
 *
 * TOOLING CONSTRAINT: no third-party PNG dependency exists in `package.json`
 * (`upng-js`/`pako` are transitive only and must not be imported by
 * committed project code). This module uses only `node:fs`, `node:path` and
 * `node:zlib` -- PNG IDAT is zlib DEFLATE, and every asset here is 8-bit
 * RGBA (colour type 6), non-interlaced, at 22/44/66px, so a minimal decoder/
 * encoder (IHDR parse, IDAT inflate, the five PNG scanline filters, re-filter
 * with type 0, deflate, hand-rolled CRC32 per chunk) is all that is needed
 * for a one-time asset transform.
 *
 * Run with `pnpm gen-tray-icon-variants`. Importing this module (e.g. from
 * `src/backend/__tests__/trayIconAssets.test.ts`, which imports
 * `meanOpaqueLuminance` directly rather than reimplementing PNG decoding)
 * never triggers the CLI -- see the `JEST_WORKER_ID` guard at the bottom,
 * which mirrors `meta/i18nCatalogChurnGuard.ts` and
 * `meta/buildCrossoverIndex.ts`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
])

export interface DecodedPng {
  width: number
  height: number
  /** width * height * 4 bytes, RGBA, un-filtered. */
  pixels: Buffer
}

interface PngChunk {
  type: string
  data: Buffer
}

// ---------------------------------------------------------------------------
// CRC32 -- hand-rolled (standard PNG/zlib polynomial 0xEDB88320) because
// node:zlib does not expose a CRC32 primitive; every PNG chunk requires one
// over its type+data bytes.
// ---------------------------------------------------------------------------

let crcTable: Uint32Array | null = null

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  crcTable = table
  return table
}

function crc32(buf: Buffer): number {
  const table = getCrcTable()
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = (table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0
  }
  return (crc ^ 0xffffffff) >>> 0
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

function readChunks(data: Buffer, path: string): PngChunk[] {
  const chunks: PngChunk[] = []
  let offset = 8
  while (offset < data.length) {
    if (offset + 8 > data.length) {
      throw new Error(
        `${path}: truncated PNG, chunk header runs past end of file`
      )
    }
    const length = data.readUInt32BE(offset)
    const type = data.toString('ascii', offset + 4, offset + 8)
    const chunkData = data.subarray(offset + 8, offset + 8 + length)
    chunks.push({ type, data: chunkData })
    offset += 8 + length + 4 // length + type + data + crc (crc unverified -- read-side only)
  }
  return chunks
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/**
 * Decode an 8-bit RGBA (colour type 6), non-interlaced PNG into raw
 * un-filtered pixel bytes. Throws a descriptive error naming the actual
 * bit depth / colour type / interlace value if the input does not match --
 * all six current tray assets are 8-bit RGBA non-interlaced, so a throw here
 * means the input's shape changed and must be looked at, not silently
 * coerced.
 */
export function decodeRgba(path: string): DecodedPng {
  const data = readFileSync(path)
  if (data.length < 8 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${path}: not a PNG file (bad 8-byte signature)`)
  }

  const chunks = readChunks(data, path)
  const ihdr = chunks.find((c) => c.type === 'IHDR')
  if (!ihdr || ihdr.data.length < 13) {
    throw new Error(`${path}: missing or malformed IHDR chunk`)
  }

  const width = ihdr.data.readUInt32BE(0)
  const height = ihdr.data.readUInt32BE(4)
  const bitDepth = ihdr.data.readUInt8(8)
  const colorType = ihdr.data.readUInt8(9)
  const interlace = ihdr.data.readUInt8(12)

  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(
      `${path}: expected 8-bit RGBA (bit depth 8, colour type 6), got bit ` +
        `depth ${bitDepth}, colour type ${colorType}`
    )
  }
  if (interlace !== 0) {
    throw new Error(
      `${path}: interlaced PNGs (Adam7) are not supported, got interlace method ${interlace}`
    )
  }

  const idatData = chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)
  if (idatData.length === 0) {
    throw new Error(`${path}: no IDAT chunk found`)
  }
  const raw = inflateSync(Buffer.concat(idatData))

  const bytesPerPixel = 4
  const stride = width * bytesPerPixel
  const expectedRawLength = (stride + 1) * height
  if (raw.length !== expectedRawLength) {
    throw new Error(
      `${path}: inflated IDAT length ${raw.length} does not match expected ${expectedRawLength} for ${width}x${height} RGBA`
    )
  }

  const pixels = Buffer.alloc(height * stride)
  let rawOffset = 0
  let prevLineStart = -1
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset]
    rawOffset += 1
    const lineStart = y * stride
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rawOffset + x]
      const a = x >= bytesPerPixel ? pixels[lineStart + x - bytesPerPixel] : 0
      const b = prevLineStart >= 0 ? pixels[prevLineStart + x] : 0
      const c =
        prevLineStart >= 0 && x >= bytesPerPixel
          ? pixels[prevLineStart + x - bytesPerPixel]
          : 0
      let value: number
      switch (filterType) {
        case 0:
          value = rawByte
          break
        case 1:
          value = (rawByte + a) & 0xff
          break
        case 2:
          value = (rawByte + b) & 0xff
          break
        case 3:
          value = (rawByte + Math.floor((a + b) / 2)) & 0xff
          break
        case 4:
          value = (rawByte + paethPredictor(a, b, c)) & 0xff
          break
        default:
          throw new Error(
            `${path}: unknown PNG filter type ${filterType} on scanline ${y}`
          )
      }
      pixels[lineStart + x] = value
    }
    rawOffset += stride
    prevLineStart = lineStart
  }

  return { width, height, pixels }
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

function computeMeanOpaqueLuminance(pixels: Buffer, path: string): number {
  let sum = 0
  let count = 0
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3]
    if (alpha > 16) {
      const r = pixels[i]
      const g = pixels[i + 1]
      const b = pixels[i + 2]
      sum += 0.299 * r + 0.587 * g + 0.114 * b
      count += 1
    }
  }
  if (count === 0) {
    throw new Error(
      `${path}: zero opaque pixels (alpha > 16) -- cannot measure luminance`
    )
  }
  return sum / count
}

/**
 * Mean of `0.299R + 0.587G + 0.114B` over pixels whose alpha is greater than
 * 16 (i.e. the glyph's opaque ink, ignoring fully/near-transparent
 * background). Throws if there are zero such pixels.
 */
export function meanOpaqueLuminance(path: string): number {
  const { pixels } = decodeRgba(path)
  return computeMeanOpaqueLuminance(pixels, path)
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

/**
 * `255 - v` on R, G and B. The alpha byte is copied unchanged -- preserving
 * alpha is load-bearing: the glyph's silhouette and anti-aliasing must not
 * move, only its ink.
 */
export function invertRgbPreservingAlpha(pixels: Buffer): Buffer {
  const out = Buffer.alloc(pixels.length)
  for (let i = 0; i < pixels.length; i += 4) {
    out[i] = 255 - pixels[i]
    out[i + 1] = 255 - pixels[i + 1]
    out[i + 2] = 255 - pixels[i + 2]
    out[i + 3] = pixels[i + 3]
  }
  return out
}

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

function makeChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([length, typeBuf, data, crc])
}

/**
 * Re-emit a valid PNG from raw RGBA pixel bytes: 8-byte signature, IHDR
 * (bit depth 8, colour type 6, compression 0, filter 0, interlace 0), a
 * single IDAT holding `zlib.deflateSync` of the scanlines each prefixed with
 * filter byte 0 (None -- simplest correct choice; this is a one-time
 * generator, not a size-optimising encoder), then IEND. No ancillary
 * chunks are emitted (no EXIF/authorship/path metadata).
 */
export function encodeRgba(
  width: number,
  height: number,
  pixels: Buffer
): Buffer {
  const bytesPerPixel = 4
  const stride = width * bytesPerPixel
  if (pixels.length !== stride * height) {
    throw new Error(
      `encodeRgba: pixels length ${pixels.length} does not match ${width}x${height}x4 (${stride * height})`
    )
  }

  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const rawLineStart = y * (stride + 1)
    raw[rawLineStart] = 0 // filter type None
    pixels.copy(raw, rawLineStart + 1, y * stride, (y + 1) * stride)
  }
  const compressed = deflateSync(raw)

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData.writeUInt8(8, 8) // bit depth
  ihdrData.writeUInt8(6, 9) // colour type: RGBA
  ihdrData.writeUInt8(0, 10) // compression method
  ihdrData.writeUInt8(0, 11) // filter method
  ihdrData.writeUInt8(0, 12) // interlace method: none

  return Buffer.concat([
    PNG_SIGNATURE,
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ])
}

// ---------------------------------------------------------------------------
// CLI entrypoint -- guarded so importing this module (from the jest test
// suite) never writes files or calls process.exit. `JEST_WORKER_ID` is set
// by Jest for every worker (including --runInBand); this mirrors
// meta/i18nCatalogChurnGuard.ts's and meta/buildCrossoverIndex.ts's
// identical guard.
//
// NOT __dirname -- this script is bundled by esbuild to
// node_modules/.cache/gen-tray-icon-variants.cjs and run as
// `node node_modules/.cache/gen-tray-icon-variants.cjs` (see
// meta/cleanDistMac.ts for the same trap documented at length). `pnpm
// gen-tray-icon-variants` always runs from the repo root, so cwd-relative
// `public/...` paths are correct here.
// ---------------------------------------------------------------------------

const SCALES = ['', '@2x', '@3x']
const MIN_LUMINANCE_DELTA = 40

interface ScaleResult {
  suffix: string
  sourcePath: string
  destPath: string
  width: number
  height: number
  sourceLuminance: number
  destLuminance: number
  delta: number
}

function regenerateScale(suffix: string): ScaleResult {
  const sourcePath = join('public', `icon-dark${suffix}.png`)
  const destPath = join('public', `icon-light${suffix}.png`)

  const source = decodeRgba(sourcePath)
  const sourceLuminance = computeMeanOpaqueLuminance(source.pixels, sourcePath)

  const destPixels = invertRgbPreservingAlpha(source.pixels)
  const destLuminance = computeMeanOpaqueLuminance(destPixels, destPath)
  const delta = destLuminance - sourceLuminance

  // HARD GATE 1: the transform must actually separate the two variants.
  if (delta < MIN_LUMINANCE_DELTA) {
    throw new Error(
      `${destPath} mean-opaque-luminance delta over ${sourcePath} is ` +
        `${delta.toFixed(1)}, below the required minimum of ${MIN_LUMINANCE_DELTA}. ` +
        'The source artwork sits too close to mid-grey for inversion to be a ' +
        'usable transform -- take this to the Task 2 checkpoint for hand-drawn ' +
        'artwork; do not lower this threshold.'
    )
  }

  // HARD GATE 2: dimensions must match (trivially true here since the dest
  // buffer reuses source.width/source.height -- asserted explicitly rather
  // than trusted).
  if (destPixels.length !== source.pixels.length) {
    throw new Error(
      `${destPath} pixel buffer length diverged from ${sourcePath} -- dimension mismatch`
    )
  }

  // HARD GATE 3: alpha channel must be byte-identical (trivially true since
  // invertRgbPreservingAlpha copies alpha unchanged -- asserted explicitly).
  for (let i = 3; i < source.pixels.length; i += 4) {
    if (source.pixels[i] !== destPixels[i]) {
      throw new Error(
        `${destPath} alpha channel diverged from ${sourcePath} at byte offset ${i}`
      )
    }
  }

  const destBytes = encodeRgba(source.width, source.height, destPixels)

  // HARD GATE 4: the produced file must not be byte-identical to the source
  // file (the exact defect this plan fixes).
  const sourceBytes = readFileSync(sourcePath)
  if (destBytes.equals(sourceBytes)) {
    throw new Error(
      `${destPath} would be byte-identical to ${sourcePath} -- inversion produced no change`
    )
  }

  writeFileSync(destPath, destBytes)

  return {
    suffix: suffix === '' ? '1x' : suffix.replace('@', ''),
    sourcePath,
    destPath,
    width: source.width,
    height: source.height,
    sourceLuminance,
    destLuminance,
    delta
  }
}

function runCli(): void {
  try {
    const results = SCALES.map(regenerateScale)
    for (const r of results) {
      console.log(
        `[gen-tray-icon-variants] ${r.suffix} (${r.width}x${r.height}): ` +
          `${r.sourcePath} -> ${r.destPath} | source-luminance=${r.sourceLuminance.toFixed(1)} ` +
          `dest-luminance=${r.destLuminance.toFixed(1)} delta=${r.delta.toFixed(1)}`
      )
    }
    console.log(
      'gen-tray-icon-variants: all three scales regenerated and gated successfully.'
    )
  } catch (error) {
    console.error(
      `::error::gen-tray-icon-variants failed: ${error instanceof Error ? error.message : String(error)}`
    )
    process.exit(1)
  }
}

if (!process.env.JEST_WORKER_ID) {
  runCli()
}
