/**
 * Deterministic ustar+gzip writer and strict reader for known-fix overlay
 * archives (quick 261027-n77).
 *
 * Pure: node:zlib and Buffer only, no filesystem and no child process (the
 * installer extracts in Node precisely so there is no `tar` spawn). The writer
 * emits regular files only, sorted, with every volatile header field zeroed,
 * so the same inputs give the same bytes under the same Node zlib. The reader
 * accepts nothing but regular files whose paths are exactly the expected set.
 */

import { gzipSync, gunzip } from 'zlib'
import { promisify } from 'util'

const gunzipAsync = promisify(gunzip)
const BLOCK = 512
const RECORD = 10240
const MAX_NAME_BYTES = 99

interface OverlayArchiveFile {
  path: string
  data: Buffer
}

function checkPath(path: string): string | null {
  if (path === '') return 'empty path'
  if (path.startsWith('/')) return 'absolute path'
  if (path.includes('\\')) return 'backslash in path'
  if (!/^[\x20-\x7e]+$/.test(path)) return 'non-ASCII path'
  if (Buffer.byteLength(path) > MAX_NAME_BYTES) return 'path too long'
  for (const seg of path.split('/')) {
    if (seg === '') return 'empty path segment'
    if (seg === '.') return '"." path segment'
    if (seg === '..') return '".." path segment'
  }
  return null
}

function octal(value: number, digits: number): string {
  return value.toString(8).padStart(digits, '0')
}

function headerChecksum(header: Buffer): number {
  let sum = 0
  for (let i = 0; i < BLOCK; i++) {
    sum += i >= 148 && i < 156 ? 0x20 : header[i]
  }
  return sum
}

function buildHeader(path: string, size: number): Buffer {
  const h = Buffer.alloc(BLOCK)
  h.write(path, 0, 'ascii')
  h.write('0000644\0', 100, 'ascii')
  h.write('0000000\0', 108, 'ascii')
  h.write('0000000\0', 116, 'ascii')
  h.write(octal(size, 11) + '\0', 124, 'ascii')
  h.write('00000000000\0', 136, 'ascii')
  h.write('        ', 148, 'ascii')
  h.write('0', 156, 'ascii')
  h.write('ustar\0', 257, 'ascii')
  h.write('00', 263, 'ascii')
  h.write(octal(headerChecksum(h), 6) + '\0 ', 148, 'ascii')
  return h
}

export function buildOverlayTarGz(
  files: ReadonlyArray<OverlayArchiveFile>
): Buffer {
  const seen = new Set<string>()
  for (const f of files) {
    const bad = checkPath(f.path)
    if (bad) throw new Error(`overlay archive: ${bad}: ${f.path}`)
    if (seen.has(f.path)) {
      throw new Error(`overlay archive: duplicate path: ${f.path}`)
    }
    seen.add(f.path)
  }
  const sorted = [...files].sort((a, b) =>
    Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))
  )
  const parts: Buffer[] = []
  for (const f of sorted) {
    parts.push(buildHeader(f.path, f.data.length), f.data)
    const pad = (BLOCK - (f.data.length % BLOCK)) % BLOCK
    if (pad) parts.push(Buffer.alloc(pad))
  }
  parts.push(Buffer.alloc(BLOCK * 2))
  const body = Buffer.concat(parts)
  const padded = Buffer.concat([
    body,
    Buffer.alloc((RECORD - (body.length % RECORD)) % RECORD)
  ])
  const gz = gzipSync(padded, { level: 9 })
  // Node's zlib writes a per-platform OS byte (and zero mtime); pin both so the
  // archive does not depend on the build host.
  if (gz.readUInt32LE(4) !== 0) {
    throw new Error('overlay archive: gzip mtime is not zero')
  }
  gz[9] = 0x03
  return gz
}

function readCString(buf: Buffer, start: number, len: number): string {
  const slice = buf.subarray(start, start + len)
  const nul = slice.indexOf(0)
  return slice.subarray(0, nul === -1 ? len : nul).toString('latin1')
}

function readOctal(buf: Buffer, start: number, len: number): number | null {
  const text = readCString(buf, start, len).trim()
  if (!/^[0-7]+$/.test(text)) return null
  return parseInt(text, 8)
}

export async function readOverlayTarGz(
  archive: Buffer,
  expected: ReadonlyMap<string, number>,
  maxUncompressedBytes: number
): Promise<Map<string, Buffer>> {
  let tar: Buffer
  try {
    tar = await gunzipAsync(archive, { maxOutputLength: maxUncompressedBytes })
  } catch (err) {
    throw new Error(
      `overlay archive: gunzip failed or exceeded ${maxUncompressedBytes} bytes (${
        err instanceof Error ? err.message : String(err)
      })`
    )
  }
  const out = new Map<string, Buffer>()
  let pos = 0
  while (pos + BLOCK <= tar.length) {
    const header = tar.subarray(pos, pos + BLOCK)
    if (header.every((b) => b === 0)) break

    const stored = readOctal(header, 148, 8)
    if (stored === null || stored !== headerChecksum(header)) {
      throw new Error('overlay archive: bad header checksum')
    }
    const magic = header.subarray(257, 263).toString('latin1')
    const version = header.subarray(263, 265).toString('latin1')
    if (magic !== 'ustar\0' || version !== '00') {
      throw new Error('overlay archive: not a POSIX ustar entry')
    }
    const typeflag = String.fromCharCode(header[156])
    if (typeflag !== '0') {
      throw new Error(`overlay archive: unsupported entry type '${typeflag}'`)
    }
    if (readCString(header, 345, 155) !== '') {
      throw new Error('overlay archive: ustar prefix field is not allowed')
    }
    const name = readCString(header, 0, 100)
    const bad = checkPath(name)
    if (bad) throw new Error(`overlay archive: ${bad}: ${name}`)
    const size = readOctal(header, 124, 12)
    if (size === null) throw new Error('overlay archive: bad size field')

    const want = expected.get(name)
    if (want === undefined) {
      throw new Error(`overlay archive: unexpected path: ${name}`)
    }
    if (out.has(name)) {
      throw new Error(`overlay archive: duplicate path: ${name}`)
    }
    if (size > want) {
      throw new Error(`overlay archive: entry larger than expected: ${name}`)
    }
    const dataStart = pos + BLOCK
    if (dataStart + size > tar.length) {
      throw new Error(`overlay archive: truncated data for ${name}`)
    }
    out.set(name, Buffer.from(tar.subarray(dataStart, dataStart + size)))
    pos = dataStart + Math.ceil(size / BLOCK) * BLOCK
  }
  for (const path of expected.keys()) {
    if (!out.has(path)) {
      throw new Error(`overlay archive: missing expected path: ${path}`)
    }
  }
  return out
}
