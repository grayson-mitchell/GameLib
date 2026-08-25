// Phase 21 (21-01): Unit tests for the lifted depot primitive layers
// (crypto, decompress, select). Proves byte-fidelity, SHA1-verify-then-trust,
// and 64-bit-GID-as-string invariants asserted by tests, not just prose.

import { createCipheriv, randomBytes } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import * as zlibNs from 'node:zlib'
import * as lzma from 'lzma'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

import { logInfo, logWarning } from 'backend/logger'

import { steamDecrypt, decryptFilename } from '../depot/crypto'
import {
  decompressChunk,
  sha1,
  fetchChunk,
  isDecodeStageError,
  CHUNK_FETCH_TIMEOUT_MS,
  CHUNK_FETCH_HEADERS
} from '../depot/decompress'
import { HostHealthTracker } from '../depot/hostHealth'
import {
  CdnAuthTokenCache,
  CDN_AUTH_TOKEN_FETCH_TIMEOUT_MS,
  type CDNAuthTokenClient
} from '../depot/cdnAuth'
import { selectAllDepots, selectDepots, type OwnedSets } from '../depot/select'
import {
  CContentServerDirectory_GetCDNAuthToken_Request,
  CContentServerDirectory_GetCDNAuthToken_Response as CdnAuthTokenResponse
} from 'steam-user/protobufs/generated/_load.js'

/** Debug/steam-install-slow-start cycle 11 ("DECISION 2026-07-19: OPTION B"):
 *  cdnAuth.ts's manual `_send` bypass expects a REAL, encoded response
 *  `Buffer` handed back through the callback (steam-user's own auto-decode
 *  is skipped for this RPC) — every hand-rolled fake client below encodes
 *  one via the real compiled protobuf class rather than passing a plain
 *  object, matching production exactly. */
function encodeCdnAuthTokenResponse(v: {
  token?: string
  expiration_time?: number
}): Buffer {
  return CdnAuthTokenResponse.encode({
    token: v.token,
    expiration_time: v.expiration_time
  }).finish()
}

// ── Test helpers ─────────────────────────────────────────────────────────

/** Steam's symmetric encrypt (inverse of steamDecrypt) — for round-trip fixtures. */
function steamEncrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(16)
  const ivEnc = createCipheriv('aes-256-ecb', key, null)
  ivEnc.setAutoPadding(false)
  const encryptedIv = Buffer.concat([ivEnc.update(iv), ivEnc.final()])

  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])

  return Buffer.concat([encryptedIv, encrypted])
}

function compressAsync(data: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    lzma.compress(data, 1, (result, err) =>
      err ? reject(err) : resolve(Buffer.from(result))
    )
  )
}

/** Build a VZ-container chunk from raw data + its LZMA-compressed representation. */
function buildVZChunk(data: Buffer, compressed: Buffer): Buffer {
  const props = compressed.subarray(0, 5)
  const payload = compressed.subarray(13) // skip props(5) + alone-format size(8)

  const header = Buffer.concat([
    Buffer.from('VZa', 'latin1'),
    Buffer.alloc(4),
    props
  ])
  const footer = Buffer.alloc(10)
  footer.writeUInt32LE(0, 0) // crc — unused/unchecked by decompressChunk
  footer.writeUInt32LE(data.length, 4) // outSize — read at buf.length-6
  footer.write('zv', 8, 'latin1')

  return Buffer.concat([header, payload, footer])
}

/** Build a PK/zlib-container chunk (local-file-header + raw deflate body).
 *  Debug/steam-depot-decode-z-data: explicitly stamps compression method 8
 *  (Deflated) at offset 8 -- previously left at 0 (Stored) via Buffer.alloc's
 *  zero-fill, which meant this fixture never actually exercised the method
 *  field decompressChunk now reads. */
function buildPKChunk(data: Buffer): Buffer {
  const deflated = deflateRawSync(data)
  const nameLen = 4
  const extraLen = 0
  const filename = Buffer.from('test')
  const buf = Buffer.alloc(30 + nameLen + extraLen + deflated.length)
  buf.write('PK', 0, 'latin1')
  buf.writeUInt16LE(8, 8) // compression method = 8 (Deflated)
  buf.writeUInt16LE(nameLen, 26)
  buf.writeUInt16LE(extraLen, 28)
  filename.copy(buf, 30)
  deflated.copy(buf, 30 + nameLen + extraLen)
  return buf
}

/** Debug/steam-depot-decode-z-data: build a PK/zip-container chunk stored
 *  with compression method 0 (Stored/uncompressed) -- the ROOT CAUSE shape
 *  for the Z_DATA_ERROR defect. Valve's depot chunks can legitimately use
 *  Stored for small chunks where Deflate has no benefit (SteamKit2's own
 *  ZipUtil.cs supports both methods via .NET's ZipArchive). Before the fix,
 *  decompressChunk unconditionally called zlib.inflateRawSync() on this
 *  body and threw Z_DATA_ERROR; after the fix it must return `data`
 *  byte-for-byte unchanged. */
function buildStoredPKChunk(data: Buffer): Buffer {
  const nameLen = 4
  const extraLen = 0
  const filename = Buffer.from('test')
  const buf = Buffer.alloc(30 + nameLen + extraLen + data.length)
  buf.write('PK', 0, 'latin1')
  buf.writeUInt16LE(0, 8) // compression method = 0 (Stored)
  // Debug/steam-depot-decode-z-data (cycle 2): stamp compressedSize/
  // uncompressedSize (offset 18/22) -- the truncation fix now reads these
  // to bound the Stored payload instead of trusting the buffer's end.
  // Previously left at Buffer.alloc's zero-fill, which was harmless while
  // decompressChunk ignored them but became load-bearing (and wrongly
  // zero) once it started reading them.
  buf.writeUInt32LE(data.length, 18)
  buf.writeUInt32LE(data.length, 22)
  buf.writeUInt16LE(nameLen, 26)
  buf.writeUInt16LE(extraLen, 28)
  filename.copy(buf, 30)
  data.copy(buf, 30 + nameLen + extraLen)
  return buf
}

/** Debug/steam-depot-decode-z-data (cycle 2): build a REALISTIC Stored PK
 *  chunk that includes what `buildStoredPKChunk` above never did -- a
 *  trailing ZIP central directory file header (46 bytes + name + extra) and
 *  an end-of-central-directory record (22 bytes) after the payload, the way
 *  every real ZIP container (and every real Steam CDN chunk) is laid out.
 *  `buildStoredPKChunk`'s payload-only container (exactly
 *  `30 + nameLen + extraLen + data.length` bytes, nothing more) cannot exist
 *  in the wild -- it is why a truncation-free Stored fix
 *  (`buf.subarray(30 + nameLen + extraLen)`, running to the buffer's end)
 *  passed against that fixture while still failing on real hardware (depot
 *  259132/259134's 128-byte chunk): the buffer's real trailing bytes are ZIP
 *  metadata, not payload, and trusting "everything after the local header"
 *  silently swallows them into the returned data, breaking the SHA1 gate.
 *  Also stamps compressedSize/uncompressedSize into the local header
 *  (offset 18/22) -- the field the truncation fix reads -- which the
 *  original `buildStoredPKChunk` left at `Buffer.alloc`'s zero-fill
 *  (harmless before the fix, which never read them; load-bearing after). */
function buildRealisticStoredPKChunk(data: Buffer): Buffer {
  const nameLen = 4
  const extraLen = 0
  const filename = Buffer.from('test')

  const localHeaderLen = 30 + nameLen + extraLen
  const local = Buffer.alloc(localHeaderLen)
  local.write('PK', 0, 'latin1')
  local.writeUInt8(0x03, 2)
  local.writeUInt8(0x04, 3)
  local.writeUInt16LE(0, 8) // compression method = 0 (Stored)
  local.writeUInt32LE(data.length, 18) // compressed size
  local.writeUInt32LE(data.length, 22) // uncompressed size
  local.writeUInt16LE(nameLen, 26)
  local.writeUInt16LE(extraLen, 28)
  filename.copy(local, 30)

  const centralLen = 46 + nameLen + extraLen
  const central = Buffer.alloc(centralLen)
  central.write('PK', 0, 'latin1')
  central.writeUInt8(0x01, 2)
  central.writeUInt8(0x02, 3)
  central.writeUInt16LE(0, 10) // compression method
  central.writeUInt32LE(data.length, 20) // compressed size
  central.writeUInt32LE(data.length, 24) // uncompressed size
  central.writeUInt16LE(nameLen, 28)
  central.writeUInt16LE(extraLen, 30)
  filename.copy(central, 46)

  const eocd = Buffer.alloc(22)
  eocd.write('PK', 0, 'latin1')
  eocd.writeUInt8(0x05, 2)
  eocd.writeUInt8(0x06, 3)
  eocd.writeUInt16LE(1, 8) // entries on this disk
  eocd.writeUInt16LE(1, 10) // total entries
  eocd.writeUInt32LE(centralLen, 12) // size of central directory
  eocd.writeUInt32LE(localHeaderLen + data.length, 16) // central dir offset

  return Buffer.concat([local, data, central, eocd])
}

/** Same realistic-container shape, but with general-purpose bit 3 set and
 *  the local header's size fields left at zero -- the shape ZIP writers use
 *  when an entry's size isn't known up front (true sizes then live in a
 *  12-byte data descriptor written AFTER the payload). decompressChunk
 *  cannot recover the payload length from the local header alone in this
 *  case and must fall back to the trusted, manifest-derived cbOriginal. */
function buildStoredPKChunkWithDataDescriptor(data: Buffer): Buffer {
  const nameLen = 4
  const extraLen = 0
  const filename = Buffer.from('test')

  const localHeaderLen = 30 + nameLen + extraLen
  const local = Buffer.alloc(localHeaderLen)
  local.write('PK', 0, 'latin1')
  local.writeUInt8(0x03, 2)
  local.writeUInt8(0x04, 3)
  local.writeUInt16LE(0x08, 6) // general-purpose bit 3 set
  local.writeUInt16LE(0, 8) // compression method = 0 (Stored)
  // compressed/uncompressed size fields intentionally left at 0 -- per the
  // ZIP spec, the real sizes live in the trailing data descriptor when bit
  // 3 is set.
  local.writeUInt16LE(nameLen, 26)
  local.writeUInt16LE(extraLen, 28)
  filename.copy(local, 30)

  const dataDescriptor = Buffer.alloc(12)
  dataDescriptor.writeUInt32LE(0, 0) // crc32 -- unused/unchecked
  dataDescriptor.writeUInt32LE(data.length, 4) // compressed size
  dataDescriptor.writeUInt32LE(data.length, 8) // uncompressed size

  const centralLen = 46 + nameLen + extraLen
  const central = Buffer.alloc(centralLen)
  central.write('PK', 0, 'latin1')
  central.writeUInt8(0x01, 2)
  central.writeUInt8(0x02, 3)
  central.writeUInt16LE(0x08, 8) // general-purpose bit flag
  central.writeUInt16LE(0, 10) // compression method
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(nameLen, 28)
  central.writeUInt16LE(extraLen, 30)
  filename.copy(central, 46)

  const eocd = Buffer.alloc(22)
  eocd.write('PK', 0, 'latin1')
  eocd.writeUInt8(0x05, 2)
  eocd.writeUInt8(0x06, 3)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(centralLen, 12)
  eocd.writeUInt32LE(localHeaderLen + data.length + dataDescriptor.length, 16)

  return Buffer.concat([local, data, dataDescriptor, central, eocd])
}

/** Debug/steam-install-slow-start (cycle 17): build a zstd/"VSZa"-container
 *  chunk exactly matching steam-user's OWN bundled encoder-side layout
 *  (`node_modules/steam-user/components/cdn_compression.js`'s
 *  `decompressZstd`, read in reverse) — the same reference this cycle's
 *  `decompressChunk` fix's `magic === 'VS'` branch was built against:
 *    header : 'VSZa'(4) | crc32(4, ignored by our decoder)
 *    body   : raw zstd-compressed stream
 *    footer : decompressedCrc32(4, ignored) | decompressedSize(4) |
 *             zero-padding(4) | 'zsv'(3)                            = 15 B
 */
function buildZstdChunk(data: Buffer, compressed: Buffer): Buffer {
  const header = Buffer.concat([Buffer.from('VSZa', 'latin1'), Buffer.alloc(4)])
  const footer = Buffer.alloc(15)
  footer.writeUInt32LE(0, 0) // decompressedCrc — unused/unchecked by our decoder
  footer.writeUInt32LE(data.length, 4) // decompressedSize — read at buf.length-11
  footer.write('zsv', 12, 'latin1')
  return Buffer.concat([header, compressed, footer])
}

/** Debug/steam-install-slow-start (cycle 17): Node's native zstd codec
 *  (`zlib.zstdCompressSync`) landed after this project's `engines.node`
 *  floor (">=22") — feature-detected so the zstd round-trip test below
 *  degrades to a documented skip rather than a hard failure on a Node build
 *  that predates it, without weakening coverage on any environment (like
 *  this one) that has it. `zstddec` (the DECODER `decompressChunk` actually
 *  ships with, matching steam-user's own dependency) has no encoder side —
 *  a real compressor is required to produce a fixture ZSTDDecoder can
 *  genuinely decode, not just a hand-rolled byte layout. */
const zstdCompressSync = (
  zlibNs as { zstdCompressSync?: (data: Buffer) => Buffer }
).zstdCompressSync

// ── crypto ────────────────────────────────────────────────────────────────

describe('crypto', () => {
  const key = randomBytes(32)

  it('steamDecrypt round-trips a known plaintext under a known key', () => {
    const plaintext = Buffer.from(
      'some depot chunk plaintext bytes, arbitrary length!'
    )
    const ciphertext = steamEncrypt(plaintext, key)
    expect(steamDecrypt(ciphertext, key)).toEqual(plaintext)
  })

  it('decryptFilename returns UTF-8 up to the first NUL, stripping trailing PKCS padding', () => {
    const filename = 'UnityEngine.SubstanceModule.dll'
    const plaintext = Buffer.concat([
      Buffer.from(filename, 'utf8'),
      Buffer.from([0])
    ])
    const ciphertext = steamEncrypt(plaintext, key)
    expect(decryptFilename(ciphertext.toString('base64'), key)).toBe(filename)
  })

  it('a filename decrypting to bytes containing "../" is returned verbatim (no sanitization)', () => {
    const filename = '../../evil/traversal.txt'
    const plaintext = Buffer.concat([
      Buffer.from(filename, 'utf8'),
      Buffer.from([0])
    ])
    const ciphertext = steamEncrypt(plaintext, key)
    expect(decryptFilename(ciphertext.toString('base64'), key)).toBe(filename)
  })
})

// ── decompress ───────────────────────────────────────────────────────────

describe('decompress', () => {
  it('decompressChunk on a VZ-container fixture returns the exact decompressed bytes', async () => {
    const data = Buffer.from(
      'Steam depot chunk fixture data. '.repeat(20),
      'utf8'
    )
    const compressed = await compressAsync(data)
    const vzChunk = buildVZChunk(data, compressed)
    const out = await decompressChunk(vzChunk, lzma)
    expect(out.equals(data)).toBe(true)
  })

  it('decompressChunk on a PK fixture uses the zlib inflateRaw path', async () => {
    const data = Buffer.from('pk deflate fixture data', 'utf8')
    const pkChunk = buildPKChunk(data)
    const out = await decompressChunk(pkChunk, lzma)
    expect(out.equals(data)).toBe(true)
  })

  // Debug/steam-depot-decode-z-data: ROOT CAUSE fix for the deterministic
  // Z_DATA_ERROR that hit depots 259132/259134 on every one of 6 CDN hosts.
  // decompressChunk's PK branch never read the ZIP local-file-header's
  // compression-method field and unconditionally ran inflateRawSync,
  // assuming Deflate (method 8). Valve's depot chunks can ALSO be Stored
  // (method 0, uncompressed) -- SteamKit2's own reference client supports
  // both via .NET's ZipArchive. Before the fix, this exact fixture shape
  // (a genuinely-Stored PK chunk) threw Z_DATA_ERROR; the fix must instead
  // return the original bytes unchanged.
  it('decompressChunk on a Stored (method 0) PK fixture returns the body unchanged, without inflating', async () => {
    const data = Buffer.from('pk stored fixture data, not compressed', 'utf8')
    const storedChunk = buildStoredPKChunk(data)
    const out = await decompressChunk(storedChunk, lzma)
    expect(out.equals(data)).toBe(true)
  })

  it('confirms the pre-fix failure mode: feeding a Stored PK body straight into inflateRawSync throws Z_DATA_ERROR', () => {
    // Regression anchor, not a decompressChunk call: proves the fixture
    // above genuinely reproduces the field defect's mechanism (Z_DATA_ERROR
    // from zlib) rather than some other failure shape.
    const data = Buffer.from('pk stored fixture data, not compressed', 'utf8')
    const storedChunk = buildStoredPKChunk(data)
    const nameLen = storedChunk.readUInt16LE(26)
    const extraLen = storedChunk.readUInt16LE(28)
    const body = storedChunk.subarray(30 + nameLen + extraLen)
    expect(() => zlibNs.inflateRawSync(body)).toThrow(
      expect.objectContaining({ code: 'Z_DATA_ERROR' })
    )
  })

  // Debug/steam-depot-decode-z-data (cycle 2): SECOND, NARROWER root cause
  // found on the live gate AFTER the cycle-1 Stored fix above eliminated
  // every Z_DATA_ERROR: a single depot chunk (rawSha1
  // 060a1f2e1610ecbd8cf158beb92e7f0198ad8e22, 128 bytes) still failed, now
  // with `sha1_mismatch`. The cycle-1 fix's `body = buf.subarray(30 +
  // nameLen + extraLen)` runs to the END of the buffer -- correct against
  // `buildStoredPKChunk`'s payload-only fixture, but a real ZIP container
  // (this fixture) has a central directory file header + EOCD record AFTER
  // the payload, which the cycle-1 fix silently included as if it were
  // data. decompressChunk must instead trust the local header's declared
  // Stored length (compressedSize at offset 18) and truncate to it.
  it('decompressChunk on a Stored PK chunk followed by a real ZIP central directory + EOCD trims the payload to its declared length', async () => {
    const data = Buffer.from(
      'pk stored realistic fixture data, not compressed',
      'utf8'
    )
    const chunk = buildRealisticStoredPKChunk(data)
    const out = await decompressChunk(chunk, lzma, data.length)
    expect(out.equals(data)).toBe(true)
  })

  it('confirms this fixture reproduces the over-read: the bytes from the local header to the buffer end are LONGER than the declared payload and are not equal to it', () => {
    // Regression anchor: proves buildRealisticStoredPKChunk's trailing
    // central directory + EOCD genuinely extend past the declared payload
    // length -- i.e. this fixture, unlike the payload-only
    // buildStoredPKChunk, actually reproduces the shape the truncation fix
    // guards against. (A fixture that can't demonstrate the over-read can't
    // prove the fix addresses it.)
    const data = Buffer.from(
      'pk stored realistic fixture data, not compressed',
      'utf8'
    )
    const chunk = buildRealisticStoredPKChunk(data)
    const nameLen = chunk.readUInt16LE(26)
    const extraLen = chunk.readUInt16LE(28)
    const bodyRunningToBufferEnd = chunk.subarray(30 + nameLen + extraLen)
    expect(bodyRunningToBufferEnd.length).toBeGreaterThan(data.length)
    expect(bodyRunningToBufferEnd.equals(data)).toBe(false)
  })

  it('decompressChunk on a Stored PK chunk with a trailing data descriptor (bit 3 set, zeroed header size fields) falls back to cbOriginal to determine the payload length', async () => {
    const data = Buffer.from(
      'pk stored bit3/data-descriptor fixture data',
      'utf8'
    )
    const chunk = buildStoredPKChunkWithDataDescriptor(data)
    const out = await decompressChunk(chunk, lzma, data.length)
    expect(out.equals(data)).toBe(true)
  })

  // Debug/steam-install-slow-start (cycle 17): ROOT CAUSE fix for the
  // deterministic, per-chunk `unknown_container` decode failure -- Valve's
  // depot chunks can ALSO be zstd-compressed (magic "VSZa"/footer "zsv"),
  // a THIRD container type `decompressChunk` never handled before this
  // cycle. Confirmed via steam-user@5.3.0's own bundled zstd decoder
  // (node_modules/steam-user/components/cdn_compression.js) and SteamKit2's
  // "Add support for zstd compressed depot chunks" (issue #1503) -- see
  // decompressChunk's own doc comment for the full provenance.
  ;(zstdCompressSync ? it : it.skip)(
    'decompressChunk on a VSZa/zstd-container fixture returns the exact decompressed bytes',
    async () => {
      const data = Buffer.from(
        'zstd depot chunk fixture data. '.repeat(20),
        'utf8'
      )
      const compressed = zstdCompressSync!(data)
      const zstdChunk = buildZstdChunk(data, compressed)
      // No cbOriginal passed here (undefined) -- proves the new pre-decode
      // size guard (below) is a no-op when the caller has nothing to check
      // against, so this pre-existing regression assertion is unaffected.
      const out = await decompressChunk(zstdChunk, lzma)
      expect(out.equals(data)).toBe(true)
    }
  )
  ;(zstdCompressSync ? it : it.skip)(
    'decompressChunk on a VSZa/zstd-container fixture still succeeds when a MATCHING cbOriginal is supplied',
    async () => {
      const data = Buffer.from(
        'zstd depot chunk fixture data with a matching cbOriginal. '.repeat(10),
        'utf8'
      )
      const compressed = zstdCompressSync!(data)
      const zstdChunk = buildZstdChunk(data, compressed)
      const out = await decompressChunk(zstdChunk, lzma, data.length)
      expect(out.equals(data)).toBe(true)
    }
  )

  // Debug/steam-install-slow-start (INBOUND CRASH REPORT follow-up): before
  // this cycle, the zstd branch's untrusted footer `decompressedSize` was
  // passed DIRECTLY into the WASM ZSTDDecoder's own malloc with zero
  // validation -- a plausible mechanism for the flagged trace-less "hard
  // quit-to-desktop crash" against this exact worker path (an unbounded
  // native allocation attempt, unlike a catchable JS RangeError). This test
  // proves a chunk whose footer size disagrees with the TRUSTED,
  // manifest-derived cbOriginal is rejected via the existing size_mismatch
  // classification BEFORE the WASM decoder is ever invoked -- no real zstd
  // compression is needed to prove this, since the rejection happens before
  // any decode is attempted (the "compressed" body is deliberately garbage).
  it('decompressChunk rejects a zstd chunk whose footer decompressedSize disagrees with cbOriginal BEFORE ever invoking the WASM decoder', async () => {
    const data = Buffer.from(
      'a chunk whose footer size lies about the real decompressed size',
      'utf8'
    )
    const zstdChunk = buildZstdChunk(
      data,
      Buffer.from('irrelevant-garbage-never-decoded')
    )
    await expect(
      decompressChunk(zstdChunk, lzma, data.length + 1)
    ).rejects.toMatchObject({
      code: 'size_mismatch'
    })
  })

  it('decompressChunk throws unknown_container (with a .code and a decryptedPreview of the post-decrypt bytes) on a truly unrecognized magic', async () => {
    const bogus = Buffer.from('XXsome-unknown-container-bytes', 'utf8')
    await expect(decompressChunk(bogus, lzma)).rejects.toThrow(
      /unknown chunk container/
    )
    try {
      await decompressChunk(bogus, lzma)
      throw new Error('expected decompressChunk to throw')
    } catch (err) {
      expect((err as { code?: string }).code).toBe('unknown_container')
      // Debug/steam-install-slow-start (cycle 17, post-decrypt diagnostic):
      // decompressChunk receives the POST-DECRYPT plaintext as `buf` -- its
      // own first bytes are exactly what the next hardware capture needs to
      // split "decrypt is wrong" (garbage) from "decoder still incomplete"
      // (a consistent-but-unhandled magic).
      const preview = (err as { decryptedPreview?: Buffer }).decryptedPreview
      expect(preview?.equals(bogus.subarray(0, 16))).toBe(true)
    }
  })

  it('sha1 hashes bytes to the expected hex digest', () => {
    const data = Buffer.from('hello')
    // sha1('hello') = aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d
    expect(sha1(data)).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d')
  })

  // Debug/steam-install-slow-start (cycle 17, retry-storm resilience):
  // isDecodeStageError is the single check downloadFileChunks (depot.ts)
  // uses to decide "deterministic, never re-queue" vs "transient, keep
  // rotating hosts as today" -- every one of decodeChunk's five ChunkDecodeError
  // codes must be recognized, and every network/HTTP-shaped error (the
  // existing, UNCHANGED requeue path) must NOT be.
  describe('isDecodeStageError', () => {
    it.each([
      'bad_footer_magic',
      'unknown_container',
      'sha1_mismatch',
      'size_mismatch',
      'decode_failed'
    ])('recognizes ChunkDecodeError code %s as decode-stage', (code) => {
      expect(isDecodeStageError({ code })).toBe(true)
    })

    it('does not treat a network error code as decode-stage', () => {
      expect(isDecodeStageError({ code: 'ECONNRESET' })).toBe(false)
    })

    it('does not treat an HTTP-status error (ChunkHttpError-shaped) as decode-stage', () => {
      expect(isDecodeStageError({ status: 503 })).toBe(false)
    })

    it('does not throw on undefined/null/non-object input', () => {
      expect(isDecodeStageError(undefined)).toBe(false)
      expect(isDecodeStageError(null)).toBe(false)
      expect(isDecodeStageError('plain string error')).toBe(false)
    })
  })

  describe('fetchChunk', () => {
    const key = randomBytes(32)
    const depotId = '12345'
    const hosts = [
      'host-a.example',
      'host-b.example',
      'host-c.example',
      'host-d.example'
    ]

    async function buildEncryptedChunkResponse(data: Buffer) {
      const compressed = await compressAsync(data)
      const vzChunk = buildVZChunk(data, compressed)
      return steamEncrypt(vzChunk, key)
    }

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('retries on a SHA1 mismatch and rotates to a different host each attempt; throws after `attempts` and never returns unverified bytes', async () => {
      const data = Buffer.from('never verifies', 'utf8')
      const encrypted = await buildEncryptedChunkResponse(data)
      const requestedHosts: string[] = []

      global.fetch = jest.fn((url: unknown) => {
        const urlStr = String(url)
        const host = urlStr.split('/')[2]
        requestedHosts.push(host)
        return Promise.resolve({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(
              encrypted.buffer.slice(
                encrypted.byteOffset,
                encrypted.byteOffset + encrypted.byteLength
              )
            )
        } as Response)
      }) as unknown as typeof fetch

      const chunk = {
        sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        cb_original: data.length
      }

      await expect(
        fetchChunk(hosts, depotId, chunk, key, lzma, 4)
      ).rejects.toThrow(/failed after 4 attempts/)

      expect(requestedHosts).toHaveLength(4)
      // Hosts rotate — every attempt hits a distinct host (4 attempts, 4 distinct hosts).
      expect(new Set(requestedHosts).size).toBe(4)
    }, 15000)

    it('returns verified bytes when the SHA1 matches', async () => {
      const data = Buffer.from('verifies correctly', 'utf8')
      const encrypted = await buildEncryptedChunkResponse(data)
      const expectedSha = sha1(data)

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(
              encrypted.buffer.slice(
                encrypted.byteOffset,
                encrypted.byteOffset + encrypted.byteLength
              )
            )
        } as Response)
      ) as unknown as typeof fetch

      const chunk = { sha: expectedSha, cb_original: data.length }
      const out = await fetchChunk(hosts, depotId, chunk, key, lzma, 4)
      expect(out.equals(data)).toBe(true)
    })

    // Debug/steam-install-slow-start (cycle 14): a cleartext pcap of the REAL
    // Steam client proved its chunk-fetch GET carries a Steam-specific
    // User-Agent (and static Accept/Accept-Charset headers) -- and that the
    // CDN edges are otherwise unauthenticated. This codebase's pre-cycle-14
    // fetch() sent undici's default UA, not Steam's, which is the suspected
    // reason the type=CDN hosts (akamai/fastly/alibaba) rejected virtually
    // every request. Asserts the outgoing request now carries the real
    // client's headers on every host, not just CDN ones.
    it('sends the real Steam client User-Agent and Accept headers on every chunk request (cycle 14 pcap fix)', async () => {
      const data = Buffer.from(
        'verifies correctly, with the right headers',
        'utf8'
      )
      const encrypted = await buildEncryptedChunkResponse(data)
      const expectedSha = sha1(data)

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(
              encrypted.buffer.slice(
                encrypted.byteOffset,
                encrypted.byteOffset + encrypted.byteLength
              )
            )
        } as Response)
      ) as unknown as typeof fetch

      const chunk = { sha: expectedSha, cb_original: data.length }
      await fetchChunk(hosts, depotId, chunk, key, lzma, 4)

      expect(global.fetch).toHaveBeenCalledTimes(1)
      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
        string,
        RequestInit
      ]
      expect(init.headers).toEqual(CHUNK_FETCH_HEADERS)
      expect(init.headers).toMatchObject({
        'User-Agent': 'Valve/Steam HTTP Client 1.0',
        Accept: 'text/html,*/*;q=0.9',
        'Accept-Charset': 'ISO-8859-1,utf-8,*;q=0.7'
      })
    })

    // Debug/steam-install-slow-start (cycle 3): host-scoring / health-aware
    // selection. Omitting `hostHealth` (the two tests above, and every caller
    // that predates this cycle) leaves fetchChunk's plain round-robin
    // completely unchanged — these tests target the NEW behavior only
    // reachable when a HostHealthTracker is explicitly supplied.
    describe('with a HostHealthTracker (cycle 3)', () => {
      it('a persistently-failing host is skipped in favor of a healthy one, and the chunk succeeds instead of exhausting attempts', async () => {
        const data = Buffer.from(
          'verifies correctly, from the good host',
          'utf8'
        )
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)
        const badHost = hosts[0]
        const goodHost = hosts[1]

        global.fetch = jest.fn((url: unknown) => {
          const urlStr = String(url)
          const host = urlStr.split('/')[2]
          if (host === badHost) {
            return Promise.reject(new Error('ECONNRESET'))
          }
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        const hostHealth = new HostHealthTracker()
        // Pre-poison badHost with a consecutive-failure streak, exactly as a
        // real multi-chunk stream would accumulate it over many prior chunks
        // against the same host — this is the scenario the definitive
        // diagnosis captured (a 0%-success host still receiving an equal
        // share of attempts under plain round-robin).
        for (let i = 0; i < 5; i++) hostHealth.record(badHost, 'error', 50)

        const chunk = {
          sha: expectedSha,
          cb_original: data.length,
          attemptSeed: 0
        }
        const out = await fetchChunk(
          hosts,
          depotId,
          chunk,
          key,
          lzma,
          4,
          undefined,
          undefined,
          undefined,
          hostHealth
        )

        expect(out.equals(data)).toBe(true)
        // badHost (seed=0 would normally be attempt 0's pick) must have been
        // skipped entirely in favor of the healthy goodHost.
        expect(global.fetch).toHaveBeenCalledTimes(1)
        const calledUrl = String((global.fetch as jest.Mock).mock.calls[0][0])
        expect(calledUrl).toContain(goodHost)
        expect(calledUrl).not.toContain(badHost)
      })

      it('records a success/error outcome for every attempt via hostHealth.record, matching what the tracker itself would report', async () => {
        const data = Buffer.from('never verifies, tracked attempts', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)

        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        ) as unknown as typeof fetch

        const hostHealth = new HostHealthTracker()
        const chunk = {
          sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          cb_original: data.length,
          attemptSeed: 0
        }

        await expect(
          fetchChunk(
            hosts,
            depotId,
            chunk,
            key,
            lzma,
            4,
            undefined,
            undefined,
            undefined,
            hostHealth
          )
        ).rejects.toThrow(/failed after 4 attempts/)

        // Every one of the 4 attempts (SHA1 never matches -> always 'error')
        // must have been recorded against SOME host in the pool, attempts
        // summing to 4 across the tracker.
        const totalRecorded = hosts.reduce(
          (sum, host) => sum + hostHealth.snapshot(host).attempts,
          0
        )
        expect(totalRecorded).toBe(4)
      })

      // Phase 25 (multi-host fan-out, MHOST-02/03): proves the depot.ts
      // wiring this plan lands actually reaches pickHost -- concurrently-
      // running chunk workers, each supplying its own distinct workerSlot
      // (mirroring depot.ts's `fileWorkerSlot * CHUNK_CONCURRENCY +
      // chunkWorkerSlot` combination), spread their attempt-0 requests
      // across MORE THAN ONE healthy host instead of every worker
      // converging on the single top-scored one (`ordered[0]`, the
      // pre-Phase-25 behavior still exercised by the
      // "skipped in favor of a healthy one" test above, which never varies
      // workerSlot from its default 0).
      it('concurrent chunk workers fan attempt-0 requests across more than one healthy host (Phase 25 top-N fan-out)', async () => {
        const data = Buffer.from('fanned across hosts', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)
        const attempt0Hosts: string[] = []

        global.fetch = jest.fn((url: unknown) => {
          const urlStr = String(url)
          const host = urlStr.split('/')[2]
          attempt0Hosts.push(host)
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        // Fresh tracker, no prior record() history -- every host in `hosts`
        // (4 distinct hosts) is healthy at cold start, so TOP_N_FANOUT=3 of
        // them are eligible for attempt-0 fan-out.
        const hostHealth = new HostHealthTracker()
        const chunk = {
          sha: expectedSha,
          cb_original: data.length,
          attemptSeed: 0
        }

        // Three concurrent "chunk workers" (mirrors depot.ts's
        // downloadFileChunks pool), each supplying its own distinct
        // workerSlot. Every worker's pickHost call happens synchronously
        // BEFORE its first `await fetch(...)`, so all three attempt-0
        // selections race against the SAME pre-record() tracker state --
        // exactly the concurrency this plan's fan-out targets.
        await Promise.all(
          [0, 1, 2].map((workerSlot) =>
            fetchChunk(
              hosts,
              depotId,
              chunk,
              key,
              lzma,
              4,
              undefined,
              undefined,
              undefined,
              hostHealth,
              undefined,
              undefined,
              undefined,
              workerSlot
            )
          )
        )

        expect(attempt0Hosts).toHaveLength(3)
        expect(new Set(attempt0Hosts).size).toBeGreaterThan(1)
      })
    })

    // Debug/steam-install-slow-start (diagnostic re-open, cycle 9): each
    // failed onAttempt event now carries a short `reason` label -- an HTTP
    // status for a non-ok response, or the thrown error's code/name for a
    // network failure. Purely additive/observational: never changes retry,
    // backoff, host-rotation, or selection -- these tests assert only the
    // NEW `reason` field's value, everything else (host rotation, attempt
    // count, thrown message) is unchanged from the pre-cycle-9 assertions
    // above.
    describe('onAttempt reason reporting (diagnostic re-open, cycle 9)', () => {
      it('reports the numeric HTTP status as `reason` for a non-ok response', async () => {
        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: false,
            status: 429,
            statusText: 'Too Many Requests'
          } as Response)
        ) as unknown as typeof fetch

        const chunk = {
          sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          cb_original: 1,
          attemptSeed: 0
        }
        const events: Array<{
          outcome: string
          reason?: string
          message?: string
        }> = []

        await expect(
          fetchChunk(
            hosts,
            depotId,
            chunk,
            key,
            lzma,
            1,
            undefined,
            undefined,
            (ev) =>
              events.push({
                outcome: ev.outcome,
                reason: ev.reason,
                message: ev.message
              })
          )
        ).rejects.toThrow(/failed after 1 attempts/)

        expect(events).toHaveLength(1)
        expect(events[0].outcome).toBe('error')
        expect(events[0].reason).toBe('429')
        // Cheap statusText is folded into the message (still matches
        // classifyDepotError's `/CDN \d/i` pattern -- see depotErrors.ts).
        expect(events[0].message).toBe('CDN 429 Too Many Requests')
      })

      it("reports the thrown error's `code` as `reason` for a network failure (e.g. ECONNRESET)", async () => {
        global.fetch = jest.fn(() => {
          const err = new Error('read ECONNRESET') as Error & { code?: string }
          err.code = 'ECONNRESET'
          return Promise.reject(err)
        }) as unknown as typeof fetch

        const chunk = {
          sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          cb_original: 1,
          attemptSeed: 0
        }
        const events: Array<{ outcome: string; reason?: string }> = []

        await expect(
          fetchChunk(
            hosts,
            depotId,
            chunk,
            key,
            lzma,
            1,
            undefined,
            undefined,
            (ev) => events.push({ outcome: ev.outcome, reason: ev.reason })
          )
        ).rejects.toThrow(/failed after 1 attempts/)

        expect(events).toHaveLength(1)
        expect(events[0].outcome).toBe('error')
        expect(events[0].reason).toBe('ECONNRESET')
      })

      it('reports "AbortError" as `reason` when the bounded per-attempt timeout fires', async () => {
        jest.useFakeTimers()
        global.fetch = jest.fn(
          (_url: unknown, opts?: { signal?: AbortSignal }) =>
            new Promise((_resolve, reject) => {
              opts?.signal?.addEventListener('abort', () => {
                const err = new Error('This operation was aborted')
                err.name = 'AbortError'
                reject(err)
              })
            })
        ) as unknown as typeof fetch

        const chunk = {
          sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          cb_original: 1,
          attemptSeed: 0
        }
        const events: Array<{ outcome: string; reason?: string }> = []

        const pending = fetchChunk(
          hosts,
          depotId,
          chunk,
          key,
          lzma,
          1,
          undefined,
          undefined,
          (ev) => events.push({ outcome: ev.outcome, reason: ev.reason })
        )
        // Attach a handler synchronously so advancing the fake timer below
        // (which settles `pending` as a rejection) never surfaces as an
        // unhandled-rejection warning/failure before the real assertion runs.
        pending.catch(() => {})
        await jest.advanceTimersByTimeAsync(CHUNK_FETCH_TIMEOUT_MS)
        await expect(pending).rejects.toThrow(/failed after 1 attempts/)

        expect(events).toHaveLength(1)
        expect(events[0].outcome).toBe('timeout')
        expect(events[0].reason).toBe('AbortError')
        jest.useRealTimers()
      })

      it("CDN-auth implementation cycle, PART 4 (hardened): reports the numeric status for ANY thrown value carrying a `status` field -- duck-typed, not dependent on `instanceof ChunkHttpError` -- distinct from a thrown-network error's `code` and a bounded timeout's `AbortError`", async () => {
        // A plain object (deliberately NOT a ChunkHttpError instance, and not
        // even an Error) thrown from deep inside the fetch/decode path --
        // proves reason-extraction keys off the `status` field itself, not
        // off class identity, which would otherwise be lost across any
        // module/bundle boundary the real ChunkHttpError instance might not
        // survive (the exact failure mode that produced a hardware run's
        // generic `err=N{Error:N}` breakdown instead of the real HTTP status).
        const duckTypedError = new Error(
          'some other error shape entirely'
        ) as Error & {
          status: number
        }
        duckTypedError.name = 'SomeOtherErrorShape'
        duckTypedError.status = 403
        global.fetch = jest.fn(() =>
          Promise.reject(duckTypedError)
        ) as unknown as typeof fetch

        const chunk = {
          sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          cb_original: 1,
          attemptSeed: 0
        }
        const events: Array<{ outcome: string; reason?: string }> = []

        await expect(
          fetchChunk(
            hosts,
            depotId,
            chunk,
            key,
            lzma,
            1,
            undefined,
            undefined,
            (ev) => events.push({ outcome: ev.outcome, reason: ev.reason })
          )
        ).rejects.toThrow(/failed after 1 attempts/)

        expect(events).toHaveLength(1)
        expect(events[0].outcome).toBe('error')
        // Must be the numeric status ('403'), NOT the fallback `name`
        // ('SomeOtherErrorShape') -- proves the `status` check runs first
        // and wins, regardless of class identity.
        expect(events[0].reason).toBe('403')
      })

      // Debug/steam-install-slow-start (cycle 13): decode-stage failures
      // (the response arrives, `res.ok` is true, but the body isn't a valid
      // chunk -- exactly what a token-less request to a type=CDN host would
      // produce if the edge answers with a small HTTP-200 denial/
      // interstitial page instead of a proper 401/403) previously threw a
      // PLAIN `Error` with no `.status`/`.code` at all, so `reason` fell all
      // the way to the literal, uninformative string `'Error'` -- identical
      // to what a genuinely-unknown failure would show. `ChunkDecodeError`
      // (decompress.ts) now tags every decode-stage throw site with a
      // distinct, aggregatable code.
      it('cycle 13: reports "sha1_mismatch" as `reason` for a chunk that downloads fine but never verifies', async () => {
        const data = Buffer.from(
          'never verifies (cycle 13 reason test)',
          'utf8'
        )
        const encrypted = await buildEncryptedChunkResponse(data)

        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        ) as unknown as typeof fetch

        const chunk = {
          sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          cb_original: data.length
        }
        const events: Array<{ outcome: string; reason?: string }> = []

        await expect(
          fetchChunk(
            hosts,
            depotId,
            chunk,
            key,
            lzma,
            1,
            undefined,
            undefined,
            (ev) => events.push({ outcome: ev.outcome, reason: ev.reason })
          )
        ).rejects.toThrow(/failed after 1 attempts/)

        expect(events).toHaveLength(1)
        expect(events[0].outcome).toBe('error')
        expect(events[0].reason).toBe('sha1_mismatch')
      })

      it('cycle 13: reports "unknown_container" as `reason` for a response body that is not a valid chunk container at all', async () => {
        // Encrypts plain garbage bytes (no VZ/PK magic) -- the exact shape a
        // small HTTP-200 denial/interstitial page would take once decrypted:
        // downloads fast (tiny body) and fails at the container-magic check,
        // never reaching sha1.
        const garbage = steamEncrypt(
          Buffer.from('not-a-real-chunk-body', 'utf8'),
          key
        )

        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                garbage.buffer.slice(
                  garbage.byteOffset,
                  garbage.byteOffset + garbage.byteLength
                )
              )
          } as Response)
        ) as unknown as typeof fetch

        const chunk = {
          sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          cb_original: 1
        }
        const events: Array<{ outcome: string; reason?: string }> = []

        await expect(
          fetchChunk(
            hosts,
            depotId,
            chunk,
            key,
            lzma,
            1,
            undefined,
            undefined,
            (ev) => events.push({ outcome: ev.outcome, reason: ev.reason })
          )
        ).rejects.toThrow(/failed after 1 attempts/)

        expect(events).toHaveLength(1)
        expect(events[0].outcome).toBe('error')
        expect(events[0].reason).toBe('unknown_container')
      })

      // Debug/steam-install-slow-start (cycle 15): cycle 14's hardware
      // validation applied the User-Agent/Accept header fix but did NOT
      // unlock the type=CDN hosts -- instead it revealed (via cycle 13's own
      // reason-extraction fix) that MOST failing hosts fail with
      // `unknown_container`: the fetch succeeds (res.ok is true) but the
      // fetched body AES-decrypts to non-container garbage. This test proves
      // the new raw-response-metadata diagnostic actually fires on exactly
      // this failure class and carries the fields (status/content-type/
      // content-encoding/content-length/raw-body preview) the next hardware
      // run needs to attribute the garbage to a specific layer (HTML error
      // page vs gzip artifact vs binary-but-wrong).
      it('cycle 15: logs raw (pre-decrypt) response metadata on an unknown_container decode failure', async () => {
        const garbage = steamEncrypt(
          Buffer.from('not-a-real-chunk-body', 'utf8'),
          key
        )
        ;(logWarning as jest.Mock).mockClear()

        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: (name: string) => {
                const table: Record<string, string> = {
                  'content-type': 'text/html',
                  'content-length': String(garbage.length)
                }
                return table[name.toLowerCase()] ?? null
              }
            },
            arrayBuffer: () =>
              Promise.resolve(
                garbage.buffer.slice(
                  garbage.byteOffset,
                  garbage.byteOffset + garbage.byteLength
                )
              )
          } as unknown as Response)
        ) as unknown as typeof fetch

        const chunk = {
          sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          cb_original: 1
        }

        await expect(
          fetchChunk(hosts, depotId, chunk, key, lzma, 1)
        ).rejects.toThrow(/failed after 1 attempts/)

        expect(logWarning).toHaveBeenCalledTimes(1)
        const [messageArgs] = (logWarning as jest.Mock).mock.calls[0] as [
          string[]
        ]
        const message = messageArgs[0]
        expect(message).toContain('decode-stage failure')
        expect(message).toContain('reason=unknown_container')
        expect(message).toContain('httpStatus=200')
        expect(message).toContain('contentType=text/html')
        expect(message).toContain('contentEncoding=absent')
        expect(message).toContain(`contentLength=${garbage.length}`)
        expect(message).toContain(`rawBodyBytes=${garbage.length}`)
        expect(message).toMatch(/rawPreviewHex=[0-9a-f]{32}/)
        // Debug/steam-install-slow-start (cycle 16): `scheme` (http vs
        // https) and `rawSha1` (the raw CIPHERTEXT's own sha1, independent
        // of the depot-chunk sha1 which only covers decompressed bytes) let
        // the next hardware capture directly test whether a failing host
        // and the known-working host return byte-identical or
        // byte-different ciphertext for the identical depot+sha request —
        // see decompress.ts's cycle-16 doc comment for the full reasoning.
        // No hostMeta is supplied to fetchChunk in this test, so scheme
        // falls back to the pre-cycle-7 default (https://), matching
        // fetchChunk's own `!meta ... ? 'https://' : ...` fallback exactly.
        expect(message).toContain('scheme=https://')
        expect(message).toMatch(/rawSha1=[0-9a-f]{40}/)
        // Debug/steam-install-slow-start (cycle 17, post-decrypt
        // diagnostic): the DECRYPTED plaintext's own first bytes, alongside
        // the pre-decrypt ciphertext preview above -- the single fact the
        // next hardware capture needs to split "decrypt produced garbage"
        // from "decoder still incomplete" for whatever chunk still fails
        // unknown_container after this cycle's zstd fix.
        expect(message).toMatch(/decryptedPreviewHex=[0-9a-f]{32}/)
        expect(message).toContain('decryptedPreviewLatin1=')
      })

      // Debug/steam-install-slow-start (cycle 17, retry-storm resilience):
      // the OUTER caller (downloadFileChunks, depot.ts) needs fetchChunk's
      // FINAL exhausted-attempts error to still carry the last attempt's
      // ChunkDecodeError `.code` -- this is what isDecodeStageError checks
      // to stop re-queuing a deterministic decode failure forever. Before
      // this cycle the final throw was a bare `Error` with no `.code` at
      // all, discarding the exact signal the caller needs.
      it("cycle 17: the final exhausted-attempts error carries the last decode-stage failure's `.code`", async () => {
        const garbage = steamEncrypt(
          Buffer.from('not-a-real-chunk-body', 'utf8'),
          key
        )
        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                garbage.buffer.slice(
                  garbage.byteOffset,
                  garbage.byteOffset + garbage.byteLength
                )
              )
          } as Response)
        ) as unknown as typeof fetch

        const chunk = {
          sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          cb_original: 1
        }

        await expect(
          fetchChunk(hosts, depotId, chunk, key, lzma, 2)
        ).rejects.toMatchObject({
          code: 'unknown_container'
        })
      })

      // Negative case: a failure that never reaches the decode stage at all
      // (the fetch itself rejects, so `encrypted` is never assigned) must
      // NOT trigger the raw-response-metadata diagnostic -- there is no
      // fetched body to describe, and this proves the gate is keyed on
      // "did decode actually run", not merely "did this attempt fail".
      it('cycle 15: does NOT log raw response metadata for a network-level failure that never reaches decode', async () => {
        ;(logWarning as jest.Mock).mockClear()
        global.fetch = jest.fn(() =>
          Promise.reject(new Error('ECONNRESET'))
        ) as unknown as typeof fetch

        const chunk = {
          sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          cb_original: 1
        }

        await expect(
          fetchChunk(hosts, depotId, chunk, key, lzma, 1)
        ).rejects.toThrow(/failed after 1 attempts/)

        expect(logWarning).not.toHaveBeenCalled()
      })

      it('cycle 13: reports the deeper undici cause code ("ECONNRESET") when the immediate `.cause` has no `.code` but `.cause.cause` does', async () => {
        global.fetch = jest.fn(() => {
          const innermost = new Error('connect ECONNRESET') as Error & {
            code?: string
          }
          innermost.code = 'ECONNRESET'
          const middle = new Error('wrapped once') as Error & { cause?: Error }
          middle.cause = innermost
          const outer = new TypeError('fetch failed') as TypeError & {
            cause?: Error
          }
          outer.cause = middle
          return Promise.reject(outer)
        }) as unknown as typeof fetch

        const chunk = {
          sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          cb_original: 1,
          attemptSeed: 0
        }
        const events: Array<{ outcome: string; reason?: string }> = []

        await expect(
          fetchChunk(
            hosts,
            depotId,
            chunk,
            key,
            lzma,
            1,
            undefined,
            undefined,
            (ev) => events.push({ outcome: ev.outcome, reason: ev.reason })
          )
        ).rejects.toThrow(/failed after 1 attempts/)

        expect(events).toHaveLength(1)
        expect(events[0].reason).toBe('ECONNRESET')
      })

      it('cycle 13: reports the first AggregateError-nested code ("ENOTFOUND") when undici throws a multi-address connect failure with no top-level `.code`', async () => {
        global.fetch = jest.fn(() => {
          const attempt1 = new Error(
            'getaddrinfo ENOTFOUND host (v6)'
          ) as Error & {
            code?: string
          }
          attempt1.code = 'ENOTFOUND'
          const attempt2 = new Error(
            'getaddrinfo ENOTFOUND host (v4)'
          ) as Error & {
            code?: string
          }
          attempt2.code = 'ENOTFOUND'
          const agg = new AggregateError(
            [attempt1, attempt2],
            'connect failed'
          ) as Error & {
            errors?: unknown[]
          }
          const outer = new TypeError('fetch failed') as TypeError & {
            cause?: Error
          }
          outer.cause = agg
          return Promise.reject(outer)
        }) as unknown as typeof fetch

        const chunk = {
          sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          cb_original: 1,
          attemptSeed: 0
        }
        const events: Array<{ outcome: string; reason?: string }> = []

        await expect(
          fetchChunk(
            hosts,
            depotId,
            chunk,
            key,
            lzma,
            1,
            undefined,
            undefined,
            (ev) => events.push({ outcome: ev.outcome, reason: ev.reason })
          )
        ).rejects.toThrow(/failed after 1 attempts/)

        expect(events).toHaveLength(1)
        expect(events[0].reason).toBe('ENOTFOUND')
      })
    })

    // Debug/steam-install-slow-start (cycle 6, gating REVERTED+FIXED cycle
    // 7): cycle 6 fetched a token whenever `cdnAuth` was merely supplied —
    // DISPROVEN by the cycle-6 hardware run (steam-user's own downloadChunk
    // only requests a token `if usetokenauth == 1`; every real host observed
    // never sets it, so the unconditional fetch blocked every chunk behind a
    // 10s CM timeout). Cycle 7: a token is fetched ONLY when a `hostMeta`
    // entry for that exact host explicitly marks `usetokenauth: true`.
    // Omitting `cdnAuth`/`hostMeta` entirely (every test above, and every
    // caller that predates cycle 6) leaves the request URL byte-for-byte
    // unchanged.
    describe('with a CdnAuthTokenCache (cycle 6, usetokenauth-gated — cycle 7)', () => {
      function makeFakeCdnClient(token = '?real-cdn-token'): {
        client: CDNAuthTokenClient
        calls: Array<{ depotId: number; hostname: string }>
      } {
        const calls: Array<{ depotId: number; hostname: string }> = []
        const client: CDNAuthTokenClient = {
          _send: jest.fn((_header, body, callback) => {
            const decoded =
              CContentServerDirectory_GetCDNAuthToken_Request.decode(body)
            calls.push({
              depotId: decoded.depot_id ?? 0,
              hostname: decoded.host_name ?? ''
            })
            callback(
              encodeCdnAuthTokenResponse({
                token,
                expiration_time: Math.floor(Date.now() / 1000) + 3600
              }),
              { proto: { eresult: 1 } }
            )
          })
        }
        return { client, calls }
      }

      it('appends the acquired token VERBATIM to the chunk URL when hostMeta marks that host usetokenauth:true', async () => {
        const data = Buffer.from('token-gated chunk', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)
        const { client } = makeFakeCdnClient('?token=abc123&expires=999')
        const cdnAuth = new CdnAuthTokenCache(client, 1091500)
        const hostMeta = new Map([
          [hosts[0], { httpsSupport: 'mandatory', usetokenauth: true }]
        ])

        let requestedUrl = ''
        global.fetch = jest.fn((url: unknown) => {
          requestedUrl = String(url)
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        const chunk = { sha: expectedSha, cb_original: data.length }
        const out = await fetchChunk(
          hosts,
          depotId,
          chunk,
          key,
          lzma,
          4,
          undefined,
          undefined,
          undefined,
          undefined,
          cdnAuth,
          hostMeta
        )

        expect(out.equals(data)).toBe(true)
        expect(requestedUrl).toBe(
          `https://${hosts[0]}/depot/${depotId}/chunk/${expectedSha}?token=abc123&expires=999`
        )
      })

      it("debug/steam-install-slow-start (cycle 7, PART 1 REVERT REGRESSION GUARD): supplying cdnAuth ALONE, with NO hostMeta at all, never calls getCDNAuthToken and never appends a token — cycle 6's unconditional fetch must stay reverted", async () => {
        const data = Buffer.from('no hostMeta at all', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)
        const { client, calls } = makeFakeCdnClient()
        const cdnAuth = new CdnAuthTokenCache(client, 1091500)

        let requestedUrl = ''
        global.fetch = jest.fn((url: unknown) => {
          requestedUrl = String(url)
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        const chunk = { sha: expectedSha, cb_original: data.length }
        // cdnAuth supplied, hostMeta OMITTED entirely.
        await fetchChunk(
          hosts,
          depotId,
          chunk,
          key,
          lzma,
          4,
          undefined,
          undefined,
          undefined,
          undefined,
          cdnAuth
        )

        expect(calls).toHaveLength(0)
        expect(requestedUrl).toBe(
          `https://${hosts[0]}/depot/${depotId}/chunk/${expectedSha}`
        )
      })

      it('debug/steam-install-slow-start (cycle 7, PART 1 REVERT REGRESSION GUARD): a hostMeta entry present but usetokenauth false/absent never calls getCDNAuthToken either', async () => {
        const data = Buffer.from(
          'hostMeta present but not usetokenauth',
          'utf8'
        )
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)
        const { client, calls } = makeFakeCdnClient()
        const cdnAuth = new CdnAuthTokenCache(client, 1091500)
        // Real-world shape: every SteamCache host reduceContentServers has
        // ever observed has a hostMeta entry (httpsSupport known) but
        // usetokenauth is absent/false.
        const hostMeta = new Map([[hosts[0], { httpsSupport: 'mandatory' }]])

        let requestedUrl = ''
        global.fetch = jest.fn((url: unknown) => {
          requestedUrl = String(url)
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        const chunk = { sha: expectedSha, cb_original: data.length }
        await fetchChunk(
          hosts,
          depotId,
          chunk,
          key,
          lzma,
          4,
          undefined,
          undefined,
          undefined,
          undefined,
          cdnAuth,
          hostMeta
        )

        expect(calls).toHaveLength(0)
        expect(requestedUrl).toBe(
          `https://${hosts[0]}/depot/${depotId}/chunk/${expectedSha}`
        )
      })

      it('fetches the token at most once per depot+host across multiple chunks — never once per chunk', async () => {
        const data1 = Buffer.from('chunk one', 'utf8')
        const data2 = Buffer.from('chunk two, a different one', 'utf8')
        const encrypted1 = await buildEncryptedChunkResponse(data1)
        const encrypted2 = await buildEncryptedChunkResponse(data2)
        const { client, calls } = makeFakeCdnClient()
        const cdnAuth = new CdnAuthTokenCache(client, 1091500)
        const hostMeta = new Map([[hosts[0], { usetokenauth: true }]])

        global.fetch = jest.fn((url: unknown) => {
          const urlStr = String(url)
          const encrypted = urlStr.includes(sha1(data1))
            ? encrypted1
            : encrypted2
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        // Both chunks share attemptSeed=0 -> both attempt hosts[0] first.
        await fetchChunk(
          hosts,
          depotId,
          { sha: sha1(data1), cb_original: data1.length, attemptSeed: 0 },
          key,
          lzma,
          4,
          undefined,
          undefined,
          undefined,
          undefined,
          cdnAuth,
          hostMeta
        )
        await fetchChunk(
          hosts,
          depotId,
          { sha: sha1(data2), cb_original: data2.length, attemptSeed: 0 },
          key,
          lzma,
          4,
          undefined,
          undefined,
          undefined,
          undefined,
          cdnAuth,
          hostMeta
        )

        // Same depotId + same first-attempt host across both chunks -> ONE
        // token fetch, reused for the second chunk's request.
        expect(calls).toHaveLength(1)
      })

      it('omitting cdnAuth leaves the URL with no token appended, exactly as every pre-cycle-6 call', async () => {
        const data = Buffer.from('no token here', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)

        let requestedUrl = ''
        global.fetch = jest.fn((url: unknown) => {
          requestedUrl = String(url)
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        const chunk = { sha: expectedSha, cb_original: data.length }
        await fetchChunk(hosts, depotId, chunk, key, lzma, 4)

        expect(requestedUrl).toBe(
          `https://${hosts[0]}/depot/${depotId}/chunk/${expectedSha}`
        )
      })

      it('a 401 response invalidates the cached token for that depot+host, so the retry re-fetches a fresh one instead of repeating the rejected token', async () => {
        const data = Buffer.from('recovers after a 401', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)
        let tokenCall = 0
        const client: CDNAuthTokenClient = {
          _send: jest.fn((_header, _body, callback) => {
            tokenCall++
            callback(
              encodeCdnAuthTokenResponse({
                token: `?token-${tokenCall}`,
                expiration_time: Math.floor(Date.now() / 1000) + 3600
              }),
              { proto: { eresult: 1 } }
            )
          })
        }
        const cdnAuth = new CdnAuthTokenCache(client, 1091500)
        const badHost = hosts[0]
        const hostMeta = new Map([[badHost, { usetokenauth: true }]])
        const requestedUrls: string[] = []

        global.fetch = jest.fn((url: unknown) => {
          const urlStr = String(url)
          requestedUrls.push(urlStr)
          const host = urlStr.split('/')[2]
          if (host === badHost) {
            // The FIRST request against badHost (carrying token-1) is
            // rejected with 401; any LATER request against badHost (carrying
            // the re-fetched token-2) succeeds — proves invalidate()
            // actually triggered a re-fetch rather than the retry repeating
            // the same rejected token forever.
            if (urlStr.includes('token-1')) {
              return Promise.resolve({ ok: false, status: 401 } as Response)
            }
            return Promise.resolve({
              ok: true,
              arrayBuffer: () =>
                Promise.resolve(
                  encrypted.buffer.slice(
                    encrypted.byteOffset,
                    encrypted.byteOffset + encrypted.byteLength
                  )
                )
            } as Response)
          }
          // Every OTHER host always fails (plain network error, no token
          // involved) — forces the round-robin to wrap back around to
          // badHost within the attempt budget, so this test actually
          // exercises a SECOND visit to badHost rather than succeeding on
          // some other host first.
          return Promise.reject(new Error('CDN 500'))
        }) as unknown as typeof fetch

        // attemptSeed=0, 4 hosts, attempts=hosts.length+1=5: attempt 0 hits
        // hosts[0] (badHost, token-1, rejected+invalidated), attempts 1-3
        // hit hosts[1..3] (always fail), attempt 4 wraps back to hosts[0]
        // (badHost) — this time with a freshly-fetched token-2, which
        // succeeds.
        const chunk = {
          sha: expectedSha,
          cb_original: data.length,
          attemptSeed: 0
        }
        const out = await fetchChunk(
          hosts,
          depotId,
          chunk,
          key,
          lzma,
          hosts.length + 1,
          undefined,
          undefined,
          undefined,
          undefined,
          cdnAuth,
          hostMeta
        )

        expect(out.equals(data)).toBe(true)
        // tokenCall is a single counter shared across every depot+host key
        // this test fetches (badHost twice, plus one each for hosts[1..3]),
        // so the badHost's SECOND token is not literally "token-2" — assert
        // on the property that actually matters: invalidate() forced a
        // DIFFERENT, freshly-fetched token for badHost's second visit,
        // rather than repeating the rejected token-1.
        const badHostRequests = requestedUrls.filter((u) => u.includes(badHost))
        expect(badHostRequests).toHaveLength(2)
        expect(badHostRequests[0]).toContain('token-1')
        expect(badHostRequests[1]).not.toContain('token-1')
        expect(badHostRequests[1]).not.toBe(badHostRequests[0])
      }, 15000)

      it('a token-fetch failure (for a usetokenauth host) degrades to a token-less request for that attempt, rather than aborting the chunk fetch', async () => {
        const data = Buffer.from('degrades gracefully', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)
        const client: CDNAuthTokenClient = {
          _send: jest.fn((_header, _body, callback) => {
            callback(encodeCdnAuthTokenResponse({}), {
              proto: { eresult: 5 /* AccessDenied, transient */ }
            })
          })
        }
        const cdnAuth = new CdnAuthTokenCache(client, 1091500)
        const hostMeta = new Map([
          [hosts[0], { httpsSupport: 'mandatory', usetokenauth: true }]
        ])

        let requestedUrl = ''
        global.fetch = jest.fn((url: unknown) => {
          requestedUrl = String(url)
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        const chunk = { sha: expectedSha, cb_original: data.length }
        const out = await fetchChunk(
          hosts,
          depotId,
          chunk,
          key,
          lzma,
          4,
          undefined,
          undefined,
          undefined,
          undefined,
          cdnAuth,
          hostMeta
        )

        expect(out.equals(data)).toBe(true)
        expect(client._send).toHaveBeenCalled()
        // No token appended — the fetch still succeeded because this fixture
        // host doesn't actually require one, exactly like a real SteamCache
        // local edge would.
        expect(requestedUrl).toBe(
          `https://${hosts[0]}/depot/${depotId}/chunk/${expectedSha}`
        )
      })

      it('debug/steam-install-slow-start (CDN-auth implementation cycle, PART 2 -- gate widened): a hostMeta entry with type=CDN (usetokenauth false/absent) STILL fetches and appends a token', async () => {
        const data = Buffer.from('type=CDN gate widening', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)
        const { client, calls } = makeFakeCdnClient('?token=cdn-type-gate')
        const cdnAuth = new CdnAuthTokenCache(client, 1091500)
        // Real-world shape (RESEARCH SPIKE): usetokenauth is absent/false on
        // every real directory response, including type=CDN hosts -- the
        // widened gate must fire off `type` alone.
        const hostMeta = new Map([
          [hosts[0], { httpsSupport: 'mandatory', type: 'CDN' }]
        ])

        let requestedUrl = ''
        global.fetch = jest.fn((url: unknown) => {
          requestedUrl = String(url)
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        const chunk = { sha: expectedSha, cb_original: data.length }
        const out = await fetchChunk(
          hosts,
          depotId,
          chunk,
          key,
          lzma,
          4,
          undefined,
          undefined,
          undefined,
          undefined,
          cdnAuth,
          hostMeta
        )

        expect(out.equals(data)).toBe(true)
        expect(calls).toHaveLength(1)
        expect(requestedUrl).toBe(
          `https://${hosts[0]}/depot/${depotId}/chunk/${expectedSha}?token=cdn-type-gate`
        )
      })

      it('debug/steam-install-slow-start (CDN-auth implementation cycle, PART 2): a type=SteamCache host is NEVER gated on by type alone -- stays token-less exactly like the real client', async () => {
        const data = Buffer.from('type=SteamCache stays token-less', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)
        const { client, calls } = makeFakeCdnClient()
        const cdnAuth = new CdnAuthTokenCache(client, 1091500)
        const hostMeta = new Map([
          [hosts[0], { httpsSupport: 'mandatory', type: 'SteamCache' }]
        ])

        let requestedUrl = ''
        global.fetch = jest.fn((url: unknown) => {
          requestedUrl = String(url)
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        const chunk = { sha: expectedSha, cb_original: data.length }
        await fetchChunk(
          hosts,
          depotId,
          chunk,
          key,
          lzma,
          4,
          undefined,
          undefined,
          undefined,
          undefined,
          cdnAuth,
          hostMeta
        )

        expect(calls).toHaveLength(0)
        expect(requestedUrl).toBe(
          `https://${hosts[0]}/depot/${depotId}/chunk/${expectedSha}`
        )
      })

      it('debug/steam-install-slow-start (CDN-auth implementation cycle, PART 3 -- regression guard): a hanging token fetch degrades to token-less and the chunk still completes once the BOUNDED token timeout fires -- never left hanging indefinitely (the exact cycle-6 regression)', async () => {
        jest.useFakeTimers()
        try {
          const data = Buffer.from(
            'token fetch hangs but chunk still completes',
            'utf8'
          )
          const encrypted = await buildEncryptedChunkResponse(data)
          const expectedSha = sha1(data)
          // This client's _send NEVER calls back -- simulates the exact
          // cycle-6 regression mechanism (a token round-trip that never
          // resolves). CdnAuthTokenCache's own bounded timeout
          // (CDN_AUTH_TOKEN_FETCH_TIMEOUT_MS, a few seconds) must degrade
          // this to '' well before CHUNK_FETCH_TIMEOUT_MS (15s) could ever
          // fire and rotate hosts -- proving the token round-trip is bounded
          // independently of, and far tighter than, the chunk-fetch
          // timeout, and never blocks/serializes the chunk pipeline.
          const client: CDNAuthTokenClient = {
            _send: jest.fn(() => {
              /* never calls back */
            })
          }
          const cdnAuth = new CdnAuthTokenCache(client, 1091500)
          const hostMeta = new Map([
            [hosts[0], { httpsSupport: 'mandatory', type: 'CDN' }]
          ])

          global.fetch = jest.fn(() =>
            Promise.resolve({
              ok: true,
              arrayBuffer: () =>
                Promise.resolve(
                  encrypted.buffer.slice(
                    encrypted.byteOffset,
                    encrypted.byteOffset + encrypted.byteLength
                  )
                )
            } as Response)
          ) as unknown as typeof fetch

          const chunk = { sha: expectedSha, cb_original: data.length }
          const promise = fetchChunk(
            hosts,
            depotId,
            chunk,
            key,
            lzma,
            4,
            undefined,
            undefined,
            undefined,
            undefined,
            cdnAuth,
            hostMeta
          )

          let settled = false
          void promise.then(() => {
            settled = true
          })

          // Just short of the bounded token timeout -- still waiting on the
          // token, not stuck past it.
          await jest.advanceTimersByTimeAsync(
            CDN_AUTH_TOKEN_FETCH_TIMEOUT_MS - 1
          )
          expect(settled).toBe(false)

          // Crossing the bound resolves the token to '' and the chunk fetch
          // (using the instantly-resolving fetch mock) completes right
          // after -- well under CHUNK_FETCH_TIMEOUT_MS (15s), proving the
          // hanging token round-trip never serialized this chunk past its
          // own tight bound.
          await jest.advanceTimersByTimeAsync(10)
          const out = await promise
          expect(out.equals(data)).toBe(true)
        } finally {
          jest.useRealTimers()
        }
      })
    })

    // Debug/steam-install-slow-start (cycle 7): EXACT steam-user URL-scheme
    // parity (node_modules/steam-user/components/cdn.js's own downloadChunk)
    // -- only https_support === 'mandatory' selects https; everything else
    // (including 'unavailable', the real cycle-5 hardware diagnosis's
    // alibaba.cdn.steampipe.steamcontent.com) selects http. Omitting
    // hostMeta (every pre-cycle-7 caller/test above) keeps the original
    // hardcoded https://.
    describe('URL scheme parity via hostMeta (cycle 7)', () => {
      async function fetchOneChunkAndCaptureUrl(
        hostMeta?: ReadonlyMap<
          string,
          { httpsSupport?: string; usetokenauth?: boolean }
        >
      ): Promise<string> {
        const data = Buffer.from('scheme-parity chunk', 'utf8')
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)

        let requestedUrl = ''
        global.fetch = jest.fn((url: unknown) => {
          requestedUrl = String(url)
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        }) as unknown as typeof fetch

        const chunk = { sha: expectedSha, cb_original: data.length }
        await fetchChunk(
          hosts,
          depotId,
          chunk,
          key,
          lzma,
          4,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          hostMeta
        )
        return requestedUrl
      }

      it('https_support: "mandatory" selects https://', async () => {
        const hostMeta = new Map([[hosts[0], { httpsSupport: 'mandatory' }]])
        const url = await fetchOneChunkAndCaptureUrl(hostMeta)
        expect(url).toMatch(/^https:\/\//)
      })

      it('https_support: "unavailable" (the real alibaba.cdn.steampipe.steamcontent.com value) selects http:// — unlocking an HTTP-only content server the pre-cycle-7 hardcoded https:// call could never reach', async () => {
        const hostMeta = new Map([[hosts[0], { httpsSupport: 'unavailable' }]])
        const url = await fetchOneChunkAndCaptureUrl(hostMeta)
        expect(url).toMatch(/^http:\/\//)
      })

      it('a host with NO hostMeta entry at all (present in `hosts` but missing from the map) falls back to https:// — never silently downgrades transport for a host this cycle has no data for', async () => {
        const hostMeta = new Map([
          ['some-other-host.example', { httpsSupport: 'unavailable' }]
        ])
        const url = await fetchOneChunkAndCaptureUrl(hostMeta)
        expect(url).toMatch(/^https:\/\//)
      })

      it('omitting hostMeta entirely (every pre-cycle-7 caller/test) keeps the original hardcoded https:// — no regression', async () => {
        const url = await fetchOneChunkAndCaptureUrl(undefined)
        expect(url).toMatch(/^https:\/\//)
      })
    })

    // debug/steam-cancel-abort-thread-a: the external cancellation `signal`
    // fetchChunk now accepts as its 13th (last) positional parameter — see
    // its own doc comment for the full root-cause writeup. Before this fix,
    // fetchChunk had NO way to observe a caller's cancel at all —
    // downloadFileChunks (depot.ts) only checked `signal?.aborted`
    // BEFORE/AFTER calling fetchChunk, never DURING it, so a cancel issued
    // mid-retry had to wait for the whole call to naturally exhaust or
    // succeed first (the hardware-observed ~62s hang).
    describe('external cancel signal (debug/steam-cancel-abort-thread-a)', () => {
      const abortedChunk = {
        sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        cb_original: 1,
        attemptSeed: 0
      }

      it('a signal already aborted BEFORE the call starts never touches fetch() at all, and rejects immediately', async () => {
        global.fetch = jest.fn() as unknown as typeof fetch
        const controller = new AbortController()
        controller.abort()

        await expect(
          fetchChunk(
            hosts,
            depotId,
            abortedChunk,
            key,
            lzma,
            4,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            controller.signal
          )
        ).rejects.toMatchObject({
          name: 'ChunkFetchAbortedError',
          code: 'aborted'
        })

        expect(global.fetch).not.toHaveBeenCalled()
      })

      it('a signal that fires WHILE the fetch is in flight aborts the underlying request immediately — never waits for CHUNK_FETCH_TIMEOUT_MS, never retries', async () => {
        const controller = new AbortController()
        let sawAbortSignalOnFetch = false

        global.fetch = jest.fn(
          (_url: unknown, opts?: { signal?: AbortSignal }) =>
            new Promise((_resolve, reject) => {
              opts?.signal?.addEventListener('abort', () => {
                sawAbortSignalOnFetch = true
                const err = new Error('This operation was aborted')
                err.name = 'AbortError'
                reject(err)
              })
            })
        ) as unknown as typeof fetch

        const pending = fetchChunk(
          hosts,
          depotId,
          abortedChunk,
          key,
          lzma,
          4,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          controller.signal
        )
        pending.catch(() => {})

        // Fire the EXTERNAL cancel mid-attempt — fetchChunk's own internal
        // per-attempt AbortController (previously deaf to anything but its
        // own CHUNK_FETCH_TIMEOUT_MS) must forward this into the in-flight
        // fetch() call immediately (onExternalAbort listener).
        controller.abort()

        await expect(pending).rejects.toMatchObject({
          name: 'ChunkFetchAbortedError',
          code: 'aborted'
        })
        expect(sawAbortSignalOnFetch).toBe(true)
        // Only ONE attempt — never retried/rotated to another host after an
        // external cancel (contrast with the ECONNRESET regression test below,
        // which DOES retry across all 4 attempts when signal is never aborted).
        expect(global.fetch).toHaveBeenCalledTimes(1)
      })

      it('an external cancel is NEVER recorded via hostHealth.record or onAttempt — a user cancel is not evidence a host is unhealthy (D-UAT-05)', async () => {
        const controller = new AbortController()
        global.fetch = jest.fn(
          (_url: unknown, opts?: { signal?: AbortSignal }) =>
            new Promise((_resolve, reject) => {
              opts?.signal?.addEventListener('abort', () => {
                const err = new Error('This operation was aborted')
                err.name = 'AbortError'
                reject(err)
              })
            })
        ) as unknown as typeof fetch

        const hostHealth = new HostHealthTracker()
        const recordSpy = jest.spyOn(hostHealth, 'record')
        const events: Array<{ outcome: string }> = []

        const pending = fetchChunk(
          hosts,
          depotId,
          abortedChunk,
          key,
          lzma,
          4,
          undefined,
          undefined,
          (ev) => events.push({ outcome: ev.outcome }),
          hostHealth,
          undefined,
          undefined,
          controller.signal
        )
        pending.catch(() => {})
        controller.abort()

        await expect(pending).rejects.toMatchObject({ code: 'aborted' })
        expect(recordSpy).not.toHaveBeenCalled()
        expect(events).toHaveLength(0)
      })

      it('a genuine network failure with NO external signal firing is completely unaffected — still retried across all attempts exactly as before (D-UAT-06 regression protection: a network drop is never reported as a user cancel)', async () => {
        const controller = new AbortController() // constructed, but never .abort()'d
        let calls = 0
        global.fetch = jest.fn(() => {
          calls++
          const err = new Error('read ECONNRESET') as Error & { code?: string }
          err.code = 'ECONNRESET'
          return Promise.reject(err)
        }) as unknown as typeof fetch

        await expect(
          fetchChunk(
            hosts,
            depotId,
            abortedChunk,
            key,
            lzma,
            4,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            controller.signal
          )
        ).rejects.toThrow(/failed after 4 attempts/)

        expect(calls).toBe(4)
      }, 15000)

      it('omitting `signal` entirely (every pre-existing caller/test) preserves the exact previous behavior — retries run to completion, chunk still verifies', async () => {
        const data = Buffer.from(
          'verifies correctly, no signal supplied',
          'utf8'
        )
        const encrypted = await buildEncryptedChunkResponse(data)
        const expectedSha = sha1(data)

        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                encrypted.buffer.slice(
                  encrypted.byteOffset,
                  encrypted.byteOffset + encrypted.byteLength
                )
              )
          } as Response)
        ) as unknown as typeof fetch

        const chunk = { sha: expectedSha, cb_original: data.length }
        const out = await fetchChunk(hosts, depotId, chunk, key, lzma, 4)
        expect(out.equals(data)).toBe(true)
      })
    })
  })
})

// ── select ───────────────────────────────────────────────────────────────

describe('select', () => {
  function makeOwned(apps: number[], depots: number[]): OwnedSets {
    return { apps: new Set(apps), depots: new Set(depots) }
  }

  beforeEach(() => {
    ;(logInfo as jest.Mock).mockClear()
  })

  it('a depot appearing only in an owned package depotids is selected', () => {
    const appinfo = {
      depots: {
        '100': {
          manifests: { public: { gid: '111111111111111111', size: 1000 } },
          config: {}
        }
      }
    }
    const owned = makeOwned([], [100])
    const result = selectDepots(appinfo, owned, { os: 'windows' }, '12345')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('100')
  })

  it('D-UAT-08: stamps the caller-supplied ownerAppId onto every emitted descriptor', () => {
    const appinfo = {
      depots: {
        '100': {
          manifests: { public: { gid: '111111111111111111', size: 1000 } },
          config: {}
        }
      }
    }
    const owned = makeOwned([], [100])
    const result = selectDepots(appinfo, owned, { os: 'windows' }, '99999')
    expect(result).toHaveLength(1)
    expect(result[0].ownerAppId).toBe('99999')
  })

  it('a depot carrying an owned dlcappid is selected; an unowned dlcappid excludes it (two channels, neither alone sufficient)', () => {
    const appinfoOwnedDlc = {
      depots: {
        '200': {
          manifests: { public: { gid: '222222222222222222', size: 500 } },
          config: {},
          dlcappid: 999
        }
      }
    }
    const ownedApp999 = makeOwned([999], [])
    const selected = selectDepots(
      appinfoOwnedDlc,
      ownedApp999,
      { os: 'windows' },
      '12345'
    )
    expect(selected).toHaveLength(1)
    expect(selected[0].id).toBe('200')

    const appinfoUnownedDlc = {
      depots: {
        '201': {
          manifests: { public: { gid: '333333333333333333', size: 500 } },
          config: {},
          dlcappid: 555 // not owned, and depot not directly owned either
        }
      }
    }
    const ownedNothing = makeOwned([], [])
    const excluded = selectDepots(
      appinfoUnownedDlc,
      ownedNothing,
      { os: 'windows' },
      '12345'
    )
    expect(excluded).toHaveLength(0)
  })

  it('every returned depot manifest field is a string; a 19-digit GID survives with exact digits (never rounded)', () => {
    const nineteenDigitGid = '1234567890123456789' // > Number.MAX_SAFE_INTEGER
    const appinfo = {
      depots: {
        '300': {
          manifests: { public: { gid: nineteenDigitGid, size: 42 } },
          config: {}
        }
      }
    }
    const owned = makeOwned([], [300])
    const result = selectDepots(appinfo, owned, { os: 'windows' }, '12345')
    expect(result).toHaveLength(1)
    expect(typeof result[0].manifest).toBe('string')
    expect(result[0].manifest).toBe(nineteenDigitGid)
  })

  it('os is honoured as a parameter — { os: "windows" } vs { os: "linux" } filter os-specific depots accordingly', () => {
    const appinfo = {
      depots: {
        '400': {
          manifests: { public: { gid: '444444444444444444', size: 10 } },
          config: { oslist: 'windows' }
        }
      }
    }
    const owned = makeOwned([], [400])
    expect(
      selectDepots(appinfo, owned, { os: 'windows' }, '12345')
    ).toHaveLength(1)
    expect(selectDepots(appinfo, owned, { os: 'linux' }, '12345')).toHaveLength(
      0
    )
  })

  it('selectAllDepots merges depots declared inside DLC app entries not present on the base app', () => {
    const baseAppinfo = {
      depots: {
        '500': {
          manifests: { public: { gid: '555555555555555555', size: 10 } },
          config: {}
        }
      },
      extended: { listofdlc: '600' }
    }
    const dlcInfos = {
      '600': {
        depots: {
          '601': {
            manifests: { public: { gid: '666666666666666666', size: 20 } },
            config: {}
          }
        }
      }
    }
    const owned = makeOwned([600], [500, 601])
    const result = selectAllDepots(
      baseAppinfo,
      dlcInfos,
      owned,
      { os: 'windows' },
      '12345'
    )
    const ids = result.map((d) => d.id).sort()
    expect(ids).toEqual(['500', '601'])
  })

  it('D-UAT-08: a base-app depot is stamped with the BASE appId; a DLC-enumerated depot is stamped with the DLC/sub-app appId, not the base appId', () => {
    const baseAppinfo = {
      depots: {
        '500': {
          manifests: { public: { gid: '555555555555555555', size: 10 } },
          config: {}
        }
      },
      extended: { listofdlc: '600' }
    }
    const dlcInfos = {
      '600': {
        depots: {
          '601': {
            manifests: { public: { gid: '666666666666666666', size: 20 } },
            config: {}
          }
        }
      }
    }
    const owned = makeOwned([600], [500, 601])
    const result = selectAllDepots(
      baseAppinfo,
      dlcInfos,
      owned,
      { os: 'windows' },
      '12345'
    )

    const baseDepot = result.find((d) => d.id === '500')
    const dlcDepot = result.find((d) => d.id === '601')
    expect(baseDepot?.ownerAppId).toBe('12345')
    // D-UAT-08 root cause: the DLC-enumerated depot must carry the DLC's OWN
    // appId (600), never the base game's appId (12345) — Cyberpunk 2077's
    // macOS depots were requested with the base appId and rejected with
    // FileNotFound because they belong to a sub-app.
    expect(dlcDepot?.ownerAppId).toBe('600')
  })

  it('D-UAT-08: a base-app depot gated by dlcappid (ownership via the DLC channel) is still stamped with the BASE appId — it was enumerated from the base appinfo, not the DLC appinfo', () => {
    const appinfoOwnedDlc = {
      depots: {
        '200': {
          manifests: { public: { gid: '222222222222222222', size: 500 } },
          config: {},
          dlcappid: 999
        }
      }
    }
    const ownedApp999 = makeOwned([999], [])
    const selected = selectDepots(
      appinfoOwnedDlc,
      ownedApp999,
      { os: 'windows' },
      '12345'
    )
    expect(selected).toHaveLength(1)
    expect(selected[0].ownerAppId).toBe('12345')
  })

  it('logs the chosen depot ids + os/arch/language decision, with no secrets in any logInfo argument (T-21-16-01)', () => {
    const appinfo = {
      depots: {
        '700': {
          manifests: { public: { gid: '777777777777777777', size: 999 } },
          config: {}
        }
      }
    }
    const owned = makeOwned([], [700])
    const result = selectDepots(
      appinfo,
      owned,
      { os: 'macos', arch: '64', language: 'english' },
      '12345'
    )

    // Regression guard: logging must not alter the returned descriptors.
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('700')

    expect(logInfo).toHaveBeenCalled()
    const calls = (logInfo as jest.Mock).mock.calls
    const selectionLog = calls.find(([msg]) =>
      String(msg).includes('700(gid=777777777777777777,size=999)')
    )
    expect(selectionLog).toBeDefined()
    expect(String(selectionLog![0])).toContain('os=macos')
    expect(String(selectionLog![0])).toContain('arch=64')
    expect(String(selectionLog![0])).toContain('language=english')

    for (const [message] of calls) {
      const text = String(message)
      expect(text).not.toMatch(/key|token|steamid|lastowner/i)
    }
  })

  it('logs a per-depot skip reason when a candidate is filtered out by oslist (T-21-16-01)', () => {
    const appinfo = {
      depots: {
        '800': {
          manifests: { public: { gid: '888888888888888888', size: 5 } },
          config: { oslist: 'windows' }
        }
      }
    }
    const owned = makeOwned([], [800])
    const result = selectDepots(appinfo, owned, { os: 'linux' }, '12345')

    expect(result).toHaveLength(0)

    const calls = (logInfo as jest.Mock).mock.calls
    const skipLog = calls.find(([msg]) =>
      String(msg).includes('skipped depot 800')
    )
    expect(skipLog).toBeDefined()
    expect(String(skipLog![0])).toContain('oslist=windows')
  })

  it('selectAllDepots logs the final union count', () => {
    const baseAppinfo = {
      depots: {
        '900': {
          manifests: { public: { gid: '999999999999999999', size: 1 } },
          config: {}
        }
      }
    }
    const owned = makeOwned([], [900])
    selectAllDepots(baseAppinfo, undefined, owned, { os: 'windows' }, '12345')

    const calls = (logInfo as jest.Mock).mock.calls
    const unionLog = calls.find(([msg]) =>
      String(msg).includes('selectAllDepots union')
    )
    expect(unionLog).toBeDefined()
    expect(String(unionLog![0])).toContain('1 depot(s)')
  })
})
