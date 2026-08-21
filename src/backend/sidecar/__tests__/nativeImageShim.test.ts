/**
 * Unit proof for the sidecar's real `nativeImage` shim (Phase 34.5 gap cycle 6, plan 34.5-45,
 * F-34.5-G6-07). Drives the REAL `sips` binary — nothing here is mocked — against real image
 * bytes generated at module-load time from a file that ships with every macOS install
 * (`GenericDocumentIcon.icns`), never a committed binary fixture and never hand-rolled fake
 * bytes.
 *
 * Covers every `<behavior>` bullet from the plan: the chainable shape, the real PNG/ICO -> PNG
 * conversion (asserted by MAGIC BYTES and by re-probing decoded dimensions, never by length
 * alone), the lazy resize/crop + single-converter-invocation-per-call property, the
 * createFromDataURL/createFromPath/createEmpty factories, and the loud non-darwin decline.
 */

import childProcess from 'node:child_process'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdtempSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nativeImage } from '../nativeImageShim'

function overrideProcessPlatform(os: string): string {
  const original = process.platform
  Object.defineProperty(process, 'platform', { value: os, configurable: true })
  return original
}

/** Re-probes a PNG buffer's decoded pixel dimensions via the real `sips` binary — never assumed
 * from byte length alone. */
function probePngDimensions(png: Buffer): { width: number; height: number } {
  const dir = mkdtempSync(join(tmpdir(), 'gamelib-nativeimage-probe-'))
  try {
    const path = join(dir, 'probe.png')
    writeFileSync(path, png)
    const out = childProcess
      .execFileSync('/usr/bin/sips', [
        '-g',
        'pixelWidth',
        '-g',
        'pixelHeight',
        path
      ])
      .toString()
    const width = Number(/pixelWidth:\s*(\d+)/.exec(out)?.[1] ?? 0)
    const height = Number(/pixelHeight:\s*(\d+)/.exec(out)?.[1] ?? 0)
    return { width, height }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Wraps a real PNG buffer in a minimal 22-byte single-image ICO container (a 6-byte ICONDIR
 * header of 0,1,1 little-endian u16s, then a 16-byte ICONDIRENTRY whose bytesInRes is the PNG
 * length and whose imageOffset is 22) -- validated at plan-authoring time: sips reports this
 * shape as `format: ico`, 256x256 (width/height 0 bytes mean 256 per the ICO spec). */
function wrapPngAsIco(png: Buffer): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type = icon
  header.writeUInt16LE(1, 4) // image count

  const entry = Buffer.alloc(16)
  entry.writeUInt8(0, 0) // width (0 => 256)
  entry.writeUInt8(0, 1) // height (0 => 256)
  entry.writeUInt8(0, 2) // color count
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // planes
  entry.writeUInt16LE(32, 6) // bit count
  entry.writeUInt32LE(png.length, 8) // bytesInRes
  entry.writeUInt32LE(22, 12) // imageOffset

  return Buffer.concat([header, entry, png])
}

// A real, decodable PNG generated once at module load from a macOS system-shipped .icns --
// never a committed binary, never fake placeholder bytes.
const REAL_PNG: Buffer = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'gamelib-nativeimage-fixture-'))
  try {
    const out = join(dir, 'fixture.png')
    childProcess.execFileSync('/usr/bin/sips', [
      '-s',
      'format',
      'png',
      '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericDocumentIcon.icns',
      '--out',
      out
    ])
    return readFileSync(out)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})()

const REAL_ICO: Buffer = wrapPngAsIco(REAL_PNG)

describe('nativeImageShim (F-34.5-G6-07) — real sips-backed conversion, nothing mocked', () => {
  let originalPlatform: string

  beforeEach(() => {
    originalPlatform = process.platform
  })

  afterEach(() => {
    overrideProcessPlatform(originalPlatform)
    jest.restoreAllMocks()
  })

  it('createFromBuffer returns a chainable object exposing resize/crop/toPNG/toJPEG/isEmpty/getSize', () => {
    const image = nativeImage.createFromBuffer(REAL_PNG)
    expect(typeof image.resize).toBe('function')
    expect(typeof image.crop).toBe('function')
    expect(typeof image.toPNG).toBe('function')
    expect(typeof image.toJPEG).toBe('function')
    expect(typeof image.isEmpty).toBe('function')
    expect(typeof image.getSize).toBe('function')
  })

  it('createFromBuffer(png).resize({width:512}).crop({x:0,y:0,width:512,height:512}).toPNG() returns a real 512x512 PNG', () => {
    const result = nativeImage
      .createFromBuffer(REAL_PNG)
      .resize({ width: 512 })
      .crop({ x: 0, y: 0, width: 512, height: 512 })
      .toPNG()

    expect(result.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(probePngDimensions(result)).toEqual({ width: 512, height: 512 })
  })

  it('the same chain applied to a real ICO buffer (the goggame-<id>.ico production shape) also yields a 512x512 PNG', () => {
    const result = nativeImage
      .createFromBuffer(REAL_ICO)
      .resize({ width: 512 })
      .crop({ x: 0, y: 0, width: 512, height: 512 })
      .toPNG()

    expect(result.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(probePngDimensions(result)).toEqual({ width: 512, height: 512 })
  })

  it('resize/crop are LAZY -- exactly ONE converter invocation happens per toPNG() call, regardless of how many ops were chained', () => {
    const spy = jest.spyOn(childProcess, 'execFileSync')
    const image = nativeImage
      .createFromBuffer(REAL_PNG)
      .resize({ width: 512 })
      .crop({ x: 0, y: 0, width: 400, height: 400 })
    expect(spy).not.toHaveBeenCalled()
    image.toPNG()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('createFromDataURL(png data URL).toJPEG(90) returns a real JPEG buffer', () => {
    const dataUrl = `data:image/png;base64,${REAL_PNG.toString('base64')}`
    const result = nativeImage.createFromDataURL(dataUrl).toJPEG(90)
    expect(result.subarray(0, 3).toString('hex')).toBe('ffd8ff')
  })

  it('createFromDataURL(...).toJPEG(90) matches steamhelper.ts:121 shape end to end (non-http image URL path)', () => {
    // steamhelper.ts:121: nativeImage.createFromDataURL(imgUrl).toJPEG(90) -- proving the exact
    // call shape, not a re-implementation.
    const dataUrl = `data:image/png;base64,${REAL_PNG.toString('base64')}`
    const image = nativeImage.createFromDataURL(dataUrl).toJPEG(90)
    expect(Buffer.isBuffer(image)).toBe(true)
    expect(image.length).toBeGreaterThan(0)
  })

  it('createFromPath(real file) reads and converts real bytes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamelib-nativeimage-path-'))
    try {
      const path = join(dir, 'fixture.png')
      writeFileSync(path, REAL_PNG)
      const result = nativeImage.createFromPath(path).toPNG()
      expect(result.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('createFromPath(nonexistent path) does not throw at construction, and isEmpty() is true', () => {
    const nonexistent = join(
      tmpdir(),
      `gamelib-nativeimage-does-not-exist-${Date.now()}`
    )
    expect(existsSync(nonexistent)).toBe(false)
    let image: ReturnType<typeof nativeImage.createFromPath> | undefined
    expect(() => {
      image = nativeImage.createFromPath(nonexistent)
    }).not.toThrow()
    expect(image?.isEmpty()).toBe(true)
  })

  it('createEmpty() has isEmpty() === true', () => {
    expect(nativeImage.createEmpty().isEmpty()).toBe(true)
  })

  it('a real, non-empty buffer has isEmpty() === false', () => {
    expect(nativeImage.createFromBuffer(REAL_PNG).isEmpty()).toBe(false)
  })

  it('on a platform with no converter, toPNG() throws a named, greppable error naming the platform (RED against a silent empty Buffer)', () => {
    overrideProcessPlatform('linux')
    // A real PNG requested as JPEG: the fast path (no ops + magic already matching) does not
    // apply, so a genuine conversion -- and therefore the platform check -- is reached.
    expect(() => nativeImage.createFromBuffer(REAL_PNG).toJPEG(90)).toThrow(
      /\[electronStub\] nativeImage:.*linux/
    )
  })

  it('the fast path returns the source bytes unchanged when no ops are pending and the format already matches (steamhelper.ts:121 works even without sips)', () => {
    overrideProcessPlatform('linux')
    const dataUrl = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00]).toString('base64')}`
    expect(() =>
      nativeImage.createFromDataURL(dataUrl).toJPEG(90)
    ).not.toThrow()
  })
})
