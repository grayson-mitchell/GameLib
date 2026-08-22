/**
 * Phase 34.1 gap closure (G3 / D-11): dependency-free PNG decode/encode, the
 * macOS AppKit **template image**, and the Windows/Linux dark/light pair.
 *
 * ORIGINAL DEFECT (now fixed on all three platforms): `public/icon-dark.png`
 * and `public/icon-light.png` shipped byte-identical -- see
 * `.planning/todos/pending/tray-dark-light-icons-are-identical.md`. The
 * `changeTrayColor` -> `tray_set_icon` chain ran correctly end to end; it
 * installed a pixel-identical image, so `darkTrayIcon` was a switch wired to
 * nothing. All four rasters this module now emits are generated from the one
 * master artwork (`icon-tray-source.png`), and `runCli` refuses to write a
 * dark/light pair that is byte-identical at ANY scale, so that defect cannot
 * silently return.
 *
 * REJECTED APPROACH, recorded so it is not re-attempted: this module
 * originally regenerated `icon-light*.png` as a straight RGB inversion of
 * `icon-dark*.png` (`invertRgbPreservingAlpha`), gated on a mean-opaque-
 * luminance delta of >= 40. That gate was non-vacuous and correctly computed
 * -- and it guarded nothing that mattered. The artwork is a full-colour
 * magenta gamer-cat over an orange starburst; inverting RGB turns it into a
 * full-colour GREEN cat over a cyan starburst. At 22x22 in a menu bar that
 * reads as a coloured smudge in either tone -- green is no more legible
 * against a light menu bar than magenta was. Luminance delta measures mean
 * brightness, not menu-bar legibility; a metric can be correctly computed
 * and still be the wrong property. See commit `49e891f58` (reverted) and
 * `34.1-13-SUMMARY.md` for the full account.
 *
 * CURRENT APPROACH: a macOS AppKit template image
 * (https://developer.apple.com/documentation/appkit/nsimage/1520017-template).
 * A template image is a monochrome silhouette carried in the ALPHA channel
 * (solid black RGB; the shape is where alpha is high) -- macOS renders it
 * black on a light menu bar and white on a dark one automatically, which is
 * the actual property "legible against both menu-bar appearances" depends
 * on, not mean luminance of a full-colour asset.
 *
 * The existing artwork's alpha channel contains BOTH the cat and the
 * starburst behind it, flattened together; naively using the whole alpha
 * channel as a template silhouette produces an unreadable blob (measured:
 * see 34.1-13-SUMMARY.md's "flattened silhouette" comparison). The cat and
 * the starburst are, however, cleanly separable by HUE: a histogram of
 * `public/icon-tray-source@3x.png`'s opaque, saturated pixels shows the starburst
 * confined to 0-50deg (orange/gold) and the cat confined to 200-360deg
 * (magenta, plus its purple shadow gradient), with an EMPTY gap from
 * 50-200deg (only 1-3 stray anti-aliased pixels per 10deg bucket in that
 * range, against hundreds per bucket in the two real clusters). `HUE_SPLIT`
 * below sits in the middle of that empirically-measured gap. This constant
 * is tied to THIS specific artwork's colour separation, not a general
 * algorithm -- if the source art changes, it must be re-derived from a fresh
 * hue histogram, not assumed to still apply.
 *
 * SCALES, and why they differ per output. `icon-tray-template.png` is emitted
 * at 1x ONLY, because `src-tauri/src/main.rs` embeds a single raster via
 * `include_bytes!` and no `@2x`/`@3x` `include_bytes!` calls exist there --
 * additional template scales would be dead committed assets. The Windows/Linux
 * pair IS emitted at all three scales, because its other consumer is Electron's
 * `nativeImage.createFromPath` (`src/backend/tray_icon/tray_icon.ts`), which
 * silently auto-adopts `@2x`/`@3x` siblings for retina. Emitting only 1x there
 * would leave a monochrome base paired with whatever retina rasters happened to
 * be on disk.
 *
 * TOOLING CONSTRAINT: no third-party PNG dependency exists in `package.json`
 * (`upng-js`/`pako` are transitive only and must not be imported by
 * committed project code). This module uses only `node:fs`, `node:path` and
 * `node:zlib` -- PNG IDAT is zlib DEFLATE, and every asset here is 8-bit
 * RGBA (colour type 6), non-interlaced, so a minimal decoder/encoder (IHDR
 * parse, IDAT inflate, the five PNG scanline filters, re-filter with type 0,
 * deflate, hand-rolled CRC32 per chunk) is all that is needed.
 *
 * Run with `pnpm gen-tray-icon-variants`. Importing this module (e.g. from
 * `src/backend/__tests__/trayIconAssets.test.ts`, which imports the
 * production functions directly rather than reimplementing PNG decoding)
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
 * all current tray assets are 8-bit RGBA non-interlaced, so a throw here
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
// Hue segmentation + template construction
// ---------------------------------------------------------------------------

/**
 * Hue split, in degrees, between the starburst cluster (0-50deg measured)
 * and the cat cluster (200-360deg measured) -- see the module docstring.
 * Sits in the middle of an empirically-empty 50-200deg gap in the source
 * artwork's hue histogram. Pixels with hue >= this value are classified as
 * the cat glyph; pixels below it are the starburst background and are
 * excluded from the template.
 */
export const HUE_SPLIT_DEGREES = 125

function rgbToHueDegrees(r: number, g: number, b: number): number {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  if (d === 0) return 0
  let h: number
  if (max === rn) h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  h *= 60
  if (h < 0) h += 360
  return h
}

/**
 * Build a macOS AppKit template silhouette from a full-colour source raster:
 * solid black RGB, alpha = the source alpha ONLY where the pixel's hue is
 * classified as the glyph (`>= hueSplitDegrees`) rather than the background
 * cluster. Alpha is otherwise 0 (fully transparent) -- this both removes the
 * background AND preserves the glyph's original anti-aliasing where it is
 * kept, rather than hard-thresholding to a binary mask.
 */
export function buildHueSegmentedTemplateAlpha(
  width: number,
  height: number,
  pixels: Buffer,
  hueSplitDegrees: number = HUE_SPLIT_DEGREES,
  fill: number = 0
): Buffer {
  const out = Buffer.alloc(width * height * 4)
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3]
    const isGlyph =
      a > 16 &&
      rgbToHueDegrees(pixels[i], pixels[i + 1], pixels[i + 2]) >=
        hueSplitDegrees
    out[i] = fill
    out[i + 1] = fill
    out[i + 2] = fill
    out[i + 3] = isGlyph ? a : 0
  }
  return out
}

/**
 * True iff every pixel with non-zero alpha has RGB exactly (`fill`,`fill`,`fill`).
 *
 * The generalisation of `isMonochromeTemplate` to the Windows/Linux pair, which
 * needs the same structural guarantee at a WHITE fill. Kept separate from a
 * brightness measure on purpose: the rejected mean-luminance-delta gate was
 * non-vacuous and correctly computed and still guarded nothing (see the module
 * docstring). This asserts the actual structural property instead.
 */
export function isUniformFill(pixels: Buffer, fill: number): boolean {
  for (let i = 0; i < pixels.length; i += 4) {
    if (
      pixels[i + 3] > 0 &&
      (pixels[i] !== fill || pixels[i + 1] !== fill || pixels[i + 2] !== fill)
    ) {
      return false
    }
  }
  return true
}

/**
 * True iff every pixel with non-zero alpha has RGB exactly (0,0,0) -- the
 * defining property of an AppKit template image (the shape lives entirely
 * in the alpha channel). This is the property that actually matters for
 * "does this render correctly on both a light and a dark menu bar", unlike
 * the rejected mean-luminance-delta metric (see module docstring).
 */
export function isMonochromeTemplate(pixels: Buffer): boolean {
  return isUniformFill(pixels, 0)
}

/** Fraction of pixels with alpha > 16 -- a sanity bound against degenerate output (empty or near-total), NOT a legibility measurement. See `isMonochromeTemplate`'s docstring for why legibility itself cannot be reduced to a single arithmetic gate. */
export function opaqueFraction(
  width: number,
  height: number,
  pixels: Buffer
): number {
  let opaque = 0
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] > 16) opaque++
  }
  return opaque / (width * height)
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
// NOT __dirname -- this script is run via `node meta/runTs.cjs` (see
// meta/cleanDist.ts for the same trap documented at length). `pnpm
// gen-tray-icon-variants` always runs from the repo root, so cwd-relative
// `public/...` paths are correct here.
// ---------------------------------------------------------------------------

const SOURCE_PATH = join('public', 'icon-tray-source.png')
const TEMPLATE_PATH = join('public', 'icon-tray-template.png')

/**
 * The Windows/Linux pair, generated at every scale Electron may ask for.
 *
 * macOS does NOT use these -- it uses the AppKit template above and lets the OS
 * do the tinting. Windows and Linux have no equivalent auto-invert, which is why
 * they need two real files and a user setting (`darkTrayIcon`) to choose between
 * them. That setting was a visual no-op for as long as the two files it selects
 * between were byte-identical.
 *
 * Polarity, stated explicitly because it is trivial to ship inverted: "dark tray
 * icon" means a DARK-COLOURED GLYPH, which is what you want on a LIGHT taskbar.
 * So `dark` fills black and `light` fills white -- `getIcon()` picks `dark` when
 * `settings.darkTrayIcon` is true.
 *
 * All three scales are emitted, unlike the single-scale template: Electron's
 * `nativeImage.createFromPath` silently auto-adopts `@2x`/`@3x` siblings for
 * retina, so generating only 1x would pair a monochrome base with the leftover
 * full-colour retina rasters. Tauri `include_bytes!`s the 1x only.
 */
const VARIANT_SCALES = ['', '@2x', '@3x'] as const

const DARK_FILL = 0
const LIGHT_FILL = 255

function variantPaths(scale: string): {
  source: string
  dark: string
  light: string
} {
  return {
    source: join('public', `icon-tray-source${scale}.png`),
    dark: join('public', `icon-tray-dark${scale}.png`),
    light: join('public', `icon-tray-light${scale}.png`)
  }
}

// Sanity bounds on the fraction of opaque pixels in the produced template --
// wide enough not to be flaky, narrow enough to catch the two degenerate
// failure modes (near-empty: segmentation excluded almost everything;
// near-total: segmentation excluded almost nothing, i.e. didn't actually
// separate the glyph from its background). Measured value at generation
// time for the 22x22 source: ~33%.
const MIN_OPAQUE_FRACTION = 0.05
const MAX_OPAQUE_FRACTION = 0.7

function runCli(): void {
  try {
    const source = decodeRgba(SOURCE_PATH)
    const template = buildHueSegmentedTemplateAlpha(
      source.width,
      source.height,
      source.pixels
    )

    const fraction = opaqueFraction(source.width, source.height, template)

    // HARD GATE 1: non-degenerate shape.
    if (fraction < MIN_OPAQUE_FRACTION || fraction > MAX_OPAQUE_FRACTION) {
      throw new Error(
        `${TEMPLATE_PATH} opaque-pixel fraction ${(fraction * 100).toFixed(1)}% is outside the ` +
          `expected [${MIN_OPAQUE_FRACTION * 100}%, ${MAX_OPAQUE_FRACTION * 100}%] band -- hue ` +
          `segmentation likely excluded almost everything or almost nothing, which means it did ` +
          'not separate the glyph from its background. Re-derive HUE_SPLIT_DEGREES from a fresh ' +
          'hue histogram of the source before re-running.'
      )
    }

    // HARD GATE 2: the defining property of a template image.
    if (!isMonochromeTemplate(template)) {
      throw new Error(
        `${TEMPLATE_PATH} is not monochrome -- some opaque pixel has non-zero RGB`
      )
    }

    const templateBytes = encodeRgba(source.width, source.height, template)

    // HARD GATE 3: must not be byte-identical to its full-colour source.
    const sourceBytes = readFileSync(SOURCE_PATH)
    if (templateBytes.equals(sourceBytes)) {
      throw new Error(
        `${TEMPLATE_PATH} would be byte-identical to ${SOURCE_PATH}`
      )
    }

    writeFileSync(TEMPLATE_PATH, templateBytes)

    console.log(
      `[gen-tray-icon-variants] ${SOURCE_PATH} -> ${TEMPLATE_PATH} (${source.width}x${source.height}) ` +
        `hue-split=${HUE_SPLIT_DEGREES}deg opaque-fraction=${(fraction * 100).toFixed(1)}%`
    )

    // ---- Windows/Linux pair, every scale -----------------------------------
    for (const scale of VARIANT_SCALES) {
      const paths = variantPaths(scale)
      const src = decodeRgba(paths.source)

      const variants = [
        { path: paths.dark, fill: DARK_FILL, label: 'dark' },
        { path: paths.light, fill: LIGHT_FILL, label: 'light' }
      ]

      const written: Buffer[] = []

      for (const { path, fill, label } of variants) {
        const mask = buildHueSegmentedTemplateAlpha(
          src.width,
          src.height,
          src.pixels,
          HUE_SPLIT_DEGREES,
          fill
        )

        const frac = opaqueFraction(src.width, src.height, mask)
        if (frac < MIN_OPAQUE_FRACTION || frac > MAX_OPAQUE_FRACTION) {
          throw new Error(
            `${path} opaque-pixel fraction ${(frac * 100).toFixed(1)}% is outside the expected ` +
              `[${MIN_OPAQUE_FRACTION * 100}%, ${MAX_OPAQUE_FRACTION * 100}%] band`
          )
        }

        if (!isUniformFill(mask, fill)) {
          throw new Error(
            `${path} has an opaque pixel whose RGB is not the ${label} fill (${fill})`
          )
        }

        const bytes = encodeRgba(src.width, src.height, mask)
        writeFileSync(path, bytes)
        written.push(bytes)

        console.log(
          `[gen-tray-icon-variants] ${paths.source} -> ${path} (${src.width}x${src.height}) ` +
            `fill=${fill} opaque-fraction=${(frac * 100).toFixed(1)}%`
        )
      }

      // THE GATE THIS WHOLE EXERCISE EXISTS FOR. `icon-dark.png`/`icon-light.png`
      // shipped byte-identical for the project's entire history, which made
      // `darkTrayIcon` a switch wired to nothing. Asserting it here means the
      // generator itself can never reintroduce that, at any scale.
      if (written[0].equals(written[1])) {
        throw new Error(
          `${paths.dark} and ${paths.light} are byte-identical -- the darkTrayIcon ` +
            'setting would be a visual no-op again'
        )
      }
    }

    console.log(
      'gen-tray-icon-variants: macOS template and the Windows/Linux pair regenerated and gated successfully.'
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
