/**
 * Sidecar `nativeImage` shim (Phase 34.5 gap cycle 6, plan 34.5-45 — F-34.5-G6-07).
 *
 * A real, macOS `sips`-backed replacement for Electron's `nativeImage` module, structurally
 * modelled on `pathShim.ts` (this sidecar's own precedent for a genuine, minimal Electron-surface
 * shim rather than a no-op recorder): implemented members do real work, and the one thing this
 * shim genuinely cannot do (convert on a non-macOS platform) throws loudly — named, greppable —
 * rather than silently returning garbage.
 *
 * Implements `createFromBuffer` / `createFromPath` / `createFromDataURL` / `createEmpty`, each
 * returning the SAME internal chainable image type. `resize`/`crop` are LAZY — they record a
 * pending op and return the receiver, performing no I/O — so the `shortcuts.ts:259-263` chain
 * (`createFromBuffer(buf).resize({width:512}).crop({x:0,y:0,width:512,height:512}).toPNG()`)
 * works unmodified. Only `toPNG()`/`toJPEG()` execute, and each does so with exactly ONE
 * converter invocation, regardless of how many ops were chained before it.
 *
 * Execution uses `/usr/bin/sips` — an ABSOLUTE path, never a bare `sips` resolved through `PATH`
 * — invoked via `execFileSync` with an argv ARRAY, never a shell string (T-34.5-C6-19). Source
 * bytes are written to a fresh per-call `mkdtempSync` directory, mode `0o600`, removed in a
 * `finally` (T-34.5-C6-18/21) — nothing here ever derives a temp path segment from a game title,
 * an appName or an icon URL, so there is no symlink/TOCTOU target to pre-place. An input buffer
 * over 32 MiB is rejected before it is ever written to disk, and the child process itself is
 * bounded by a 15s timeout and a 32 MiB output cap (T-34.5-C6-20) — 15s sits well inside
 * `main.rs`'s 60s `INVOKE_TIMEOUT`, so a stuck conversion surfaces as a named shim error rather
 * than an opaque transport timeout.
 *
 * Two production call sites this shim exists to un-stub, both cited here so a future reader can
 * find them without re-deriving the trace:
 *   - `shortcuts.ts:259` `nativeImage.createFromBuffer(iconBuffer)` — the macOS `.app` shortcut's
 *     `convertPngToICNS` chain, previously dead for EVERY macOS game (F-34.5-G6-07).
 *   - `steamhelper.ts:121` `nativeImage.createFromDataURL(imgUrl).toJPEG(90)` — reached from
 *     `prepareImagesForSteam` on the `addToSteam` path, for any non-`http` image URL. A second,
 *     independent instance of the exact same defect class (Standing Rule 5: a gotcha at one call
 *     site is a debt marker for every sibling until something sweeps them all).
 *
 * `sips` crops CENTERED; Electron's real `nativeImage.crop({x, y, width, height})` takes a
 * top-left origin. `--cropOffset` was measured at planning time to be a NO-OP: run against an
 * asymmetric fixture (a 256px icon padded to 512x1024 with a solid colour), the offset crop and
 * the default (centered) crop produced BYTE-IDENTICAL output (same md5). This shim therefore
 * NEVER emits `--cropOffset`, and a non-zero `x`/`y` passed to `crop()` is silently NOT honoured
 * — only `width`/`height` affect the sips invocation. `convertPngToICNS` always passes
 * `{x: 0, y: 0}`, so this divergence is unobservable for the one production caller today; a
 * future caller passing a non-zero origin needs to find this comment before relying on it.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** T-34.5-C6-18/20: reject an oversized input before it is ever written to disk. */
const MAX_INPUT_BYTES = 32 * 1024 * 1024

/** T-34.5-C6-20: bounds the `sips` child process well inside `main.rs`'s 60s `INVOKE_TIMEOUT`. */
const SIPS_TIMEOUT_MS = 15_000
const SIPS_MAX_BUFFER = 32 * 1024 * 1024

const PNG_MAGIC_HEX = '89504e47'
const JPEG_MAGIC_HEX = 'ffd8ff'

type ResizeOp = { kind: 'resize'; width?: number; height?: number }
type CropOp = { kind: 'crop'; width: number; height: number }
type PendingOp = ResizeOp | CropOp

interface ShimNativeImage {
  resize(options: { width?: number; height?: number }): ShimNativeImage
  crop(rect: { x: number; y: number; width: number; height: number }): ShimNativeImage
  toPNG(): Buffer
  toJPEG(quality?: number): Buffer
  isEmpty(): boolean
  getSize(): { width: number; height: number }
}

function magicMatches(buffer: Buffer, magicHex: string): boolean {
  const magicLen = magicHex.length / 2
  if (buffer.length < magicLen) return false
  return buffer.subarray(0, magicLen).toString('hex') === magicHex
}

/** Loud, named, greppable validation — never lets a malformed dimension reach sips argv. */
function validateDimension(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0 || value > 16384) {
    throw new Error(
      `[electronStub] nativeImage: invalid ${label} dimension: ${String(value)}`
    )
  }
  return value
}

function opsToSipsArgs(ops: readonly PendingOp[]): string[] {
  const args: string[] = []
  for (const op of ops) {
    if (op.kind === 'resize') {
      if (op.width !== undefined && op.height !== undefined) {
        args.push(
          '-z',
          String(validateDimension(op.height, 'resize height')),
          String(validateDimension(op.width, 'resize width'))
        )
      } else if (op.width !== undefined) {
        args.push('--resampleWidth', String(validateDimension(op.width, 'resize width')))
      } else if (op.height !== undefined) {
        args.push('--resampleHeight', String(validateDimension(op.height, 'resize height')))
      }
    } else {
      // crop — sips crops CENTERED (see module header); --cropOffset is a measured no-op and is
      // deliberately never emitted. Only width/height reach argv; x/y are not honoured.
      args.push(
        '-c',
        String(validateDimension(op.height, 'crop height')),
        String(validateDimension(op.width, 'crop width'))
      )
    }
  }
  return args
}

/**
 * Runs the real `sips` converter over `sourceBuffer` with `ops` applied, in order, and returns
 * the resulting bytes in `outputFormat`. The single choke point for every non-fast-path
 * conversion — exactly one `execFileSync` call per invocation.
 */
function runSips(
  sourceBuffer: Buffer,
  ops: readonly PendingOp[],
  outputFormat: 'png' | 'jpeg',
  quality?: number
): Buffer {
  if (process.platform !== 'darwin') {
    throw new Error(
      `[electronStub] nativeImage: no image converter available on platform '${process.platform}' (sips is macOS-only)`
    )
  }

  if (sourceBuffer.length > MAX_INPUT_BYTES) {
    throw new Error(
      `[electronStub] nativeImage: input buffer (${String(sourceBuffer.length)} bytes) exceeds the 32 MiB cap`
    )
  }

  const dir = mkdtempSync(join(tmpdir(), 'gamelib-nativeimage-'))
  try {
    const inputPath = join(dir, 'in')
    const outputPath = join(dir, 'out')
    writeFileSync(inputPath, sourceBuffer, { mode: 0o600 })

    const argv = [
      ...opsToSipsArgs(ops),
      '-s',
      'format',
      outputFormat,
      ...(outputFormat === 'jpeg' && quality !== undefined
        ? ['-s', 'formatOptions', String(Math.max(1, Math.min(100, Math.round(quality))))]
        : []),
      inputPath,
      '--out',
      outputPath
    ]

    execFileSync('/usr/bin/sips', argv, {
      timeout: SIPS_TIMEOUT_MS,
      maxBuffer: SIPS_MAX_BUFFER,
      stdio: ['ignore', 'ignore', 'pipe']
    })

    return readFileSync(outputPath)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Builds the shared chainable image object every `createFrom*`/`createEmpty` factory below
 * returns. `getBytes` is called lazily (and at most once, memoized) so `createFromPath` of a
 * non-existent path can construct without throwing — the failure only surfaces (as `isEmpty()
 * === true`, never a throw) once the bytes are actually needed.
 */
function makeImage(getBytes: () => Buffer): ShimNativeImage {
  const ops: PendingOp[] = []
  let cachedBytes: Buffer | null = null

  function sourceBytes(): Buffer {
    if (cachedBytes === null) {
      cachedBytes = getBytes()
    }
    return cachedBytes
  }

  function convert(format: 'png' | 'jpeg', quality?: number): Buffer {
    const src = sourceBytes()

    // createEmpty() / an unreadable createFromPath() — Electron's own createEmpty().toPNG()
    // returns an empty buffer rather than throwing; mirrored here.
    if (src.length === 0) {
      return Buffer.alloc(0)
    }

    // Fast path (no converter needed): no ops pending AND the source bytes already carry the
    // requested output format's magic. This is what makes steamhelper.ts:121's
    // createFromDataURL(...).toJPEG(90) work even where sips is unavailable, for the common case
    // where the data URL already holds JPEG bytes.
    const magic = format === 'png' ? PNG_MAGIC_HEX : JPEG_MAGIC_HEX
    if (ops.length === 0 && magicMatches(src, magic)) {
      return src
    }

    return runSips(src, ops, format, quality)
  }

  const image: ShimNativeImage = {
    resize(options) {
      ops.push({ kind: 'resize', width: options.width, height: options.height })
      return image
    },
    crop(rect) {
      ops.push({ kind: 'crop', width: rect.width, height: rect.height })
      return image
    },
    toPNG() {
      return convert('png')
    },
    toJPEG(quality) {
      return convert('jpeg', quality)
    },
    isEmpty() {
      return sourceBytes().length === 0
    },
    getSize() {
      const src = sourceBytes()
      if (src.length === 0 || process.platform !== 'darwin') {
        return { width: 0, height: 0 }
      }
      const dir = mkdtempSync(join(tmpdir(), 'gamelib-nativeimage-size-'))
      try {
        const inputPath = join(dir, 'in')
        writeFileSync(inputPath, src, { mode: 0o600 })
        const out = execFileSync(
          '/usr/bin/sips',
          ['-g', 'pixelWidth', '-g', 'pixelHeight', inputPath],
          { timeout: SIPS_TIMEOUT_MS, maxBuffer: SIPS_MAX_BUFFER }
        ).toString()
        const width = Number(out.match(/pixelWidth:\s*(\d+)/)?.[1] ?? 0)
        const height = Number(out.match(/pixelHeight:\s*(\d+)/)?.[1] ?? 0)
        return { width, height }
      } catch {
        return { width: 0, height: 0 }
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  }
  return image
}

function createFromBuffer(buffer: Buffer): ShimNativeImage {
  return makeImage(() => buffer)
}

function createFromPath(path: string): ShimNativeImage {
  return makeImage(() => {
    try {
      return readFileSync(path)
    } catch {
      return Buffer.alloc(0)
    }
  })
}

function createFromDataURL(dataUrl: string): ShimNativeImage {
  return makeImage(() => {
    const match = dataUrl.match(/^data:[^;]+;base64,([\s\S]*)$/)
    if (!match) return Buffer.alloc(0)
    try {
      return Buffer.from(match[1], 'base64')
    } catch {
      return Buffer.alloc(0)
    }
  })
}

function createEmpty(): ShimNativeImage {
  return makeImage(() => Buffer.alloc(0))
}

export const nativeImage = {
  createFromBuffer,
  createFromPath,
  createFromDataURL,
  createEmpty
}
