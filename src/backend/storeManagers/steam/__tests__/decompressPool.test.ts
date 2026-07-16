// Phase 21 gap closure (21-15, D-UAT-03): moves LZMA/zlib depot-chunk
// decompression off the Electron main thread onto a worker_threads pool.
//
// Task 1 covers decodeChunk (the extracted CPU section of fetchChunk) and the
// worker's message-handling logic (handleDecodeMessage). Task 2 extends this
// suite with DecompressPool integration behavior (round-trip, concurrency,
// throw-isolation, timeout-recover, fallback).

import { randomBytes, createCipheriv } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import * as lzma from 'lzma'

import { decodeChunk, sha1, type LzmaModule } from '../depot/decompress'
import { handleDecodeMessage } from '../depot/decompressWorker'

// ── fixtures (mirrors depotPrimitives.test.ts's VZ/PK builders) ───────────

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
    lzma.compress(data, 1, (result, err) => (err ? reject(err) : resolve(Buffer.from(result))))
  )
}

/** Build a VZ-container chunk from raw data + its LZMA-compressed representation. */
function buildVZChunk(data: Buffer, compressed: Buffer): Buffer {
  const props = compressed.subarray(0, 5)
  const payload = compressed.subarray(13) // skip props(5) + alone-format size(8)

  const header = Buffer.concat([Buffer.from('VZa', 'latin1'), Buffer.alloc(4), props])
  const footer = Buffer.alloc(10)
  footer.writeUInt32LE(0, 0) // crc — unused/unchecked by decompressChunk
  footer.writeUInt32LE(data.length, 4) // outSize — read at buf.length-6
  footer.write('zv', 8, 'latin1')

  return Buffer.concat([header, payload, footer])
}

/** Build a PK/zlib-container chunk (local-file-header + raw deflate body). */
function buildPKChunk(data: Buffer): Buffer {
  const deflated = deflateRawSync(data)
  const nameLen = 4
  const extraLen = 0
  const filename = Buffer.from('test')
  const buf = Buffer.alloc(30 + nameLen + extraLen + deflated.length)
  buf.write('PK', 0, 'latin1')
  buf.writeUInt16LE(nameLen, 26)
  buf.writeUInt16LE(extraLen, 28)
  filename.copy(buf, 30)
  deflated.copy(buf, 30 + nameLen + extraLen)
  return buf
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

const asLzmaModule = lzma as unknown as LzmaModule

// ── decodeChunk ──────────────────────────────────────────────────────────

describe('decodeChunk', () => {
  const key = randomBytes(32)

  it('decodeChunk round-trips a VZ (LZMA) chunk to its expected decompressed bytes', async () => {
    const data = Buffer.from('decodeChunk VZ fixture data. '.repeat(20), 'utf8')
    const compressed = await compressAsync(data)
    const vzChunk = buildVZChunk(data, compressed)
    const encrypted = steamEncrypt(vzChunk, key)
    const expectedSha = sha1(data)

    const out = await decodeChunk(encrypted, key, expectedSha, data.length, asLzmaModule)
    expect(out.equals(data)).toBe(true)
  })

  it('decodeChunk round-trips a PK (zlib) chunk to its expected decompressed bytes', async () => {
    const data = Buffer.from('decodeChunk PK fixture data', 'utf8')
    const pkChunk = buildPKChunk(data)
    const encrypted = steamEncrypt(pkChunk, key)
    const expectedSha = sha1(data)

    const out = await decodeChunk(encrypted, key, expectedSha, data.length, asLzmaModule)
    expect(out.equals(data)).toBe(true)
  })

  it('decodeChunk throws on a sha1 mismatch (integrity gate) — never returns unverified bytes', async () => {
    const data = Buffer.from('decodeChunk sha mismatch fixture', 'utf8')
    const pkChunk = buildPKChunk(data)
    const encrypted = steamEncrypt(pkChunk, key)

    await expect(
      decodeChunk(
        encrypted,
        key,
        'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        data.length,
        asLzmaModule
      )
    ).rejects.toThrow(/sha1 mismatch/)
  })

  it('decodeChunk throws on a decompressed-size mismatch', async () => {
    const data = Buffer.from('decodeChunk size mismatch fixture', 'utf8')
    const pkChunk = buildPKChunk(data)
    const encrypted = steamEncrypt(pkChunk, key)
    const expectedSha = sha1(data)

    await expect(
      decodeChunk(encrypted, key, expectedSha, data.length + 1, asLzmaModule)
    ).rejects.toThrow(/size mismatch/)
  })

  it('decodeChunk throws on a malformed/garbage buffer (bad container magic) rather than hanging', async () => {
    const bogus = Buffer.from('XXsome-unknown-container-bytes', 'utf8')
    const encrypted = steamEncrypt(bogus, key)

    await expect(
      decodeChunk(encrypted, key, 'irrelevant', 0, asLzmaModule)
    ).rejects.toThrow(/unknown chunk container/)
  })
})

// ── decompressWorker message handling ───────────────────────────────────

describe('decompressWorker handleDecodeMessage', () => {
  const key = randomBytes(32)

  it('posts back the decompressed ArrayBuffer on success', async () => {
    const data = Buffer.from('worker message success fixture', 'utf8')
    const pkChunk = buildPKChunk(data)
    const encrypted = steamEncrypt(pkChunk, key)
    const expectedSha = sha1(data)

    const response = await handleDecodeMessage({
      id: 1,
      encrypted: toArrayBuffer(encrypted),
      key: toArrayBuffer(key),
      expectedSha,
      cbOriginal: data.length
    })

    expect(response.ok).toBe(true)
    if (response.ok) {
      expect(Buffer.from(response.data).equals(data)).toBe(true)
    }
  })

  it('posts an {error} message on any throw (never crashes/hangs the worker)', async () => {
    const bogus = Buffer.from('XXbad-container-bytes', 'utf8')
    const encrypted = steamEncrypt(bogus, key)

    const response = await handleDecodeMessage({
      id: 2,
      encrypted: toArrayBuffer(encrypted),
      key: toArrayBuffer(key),
      expectedSha: 'irrelevant',
      cbOriginal: 0
    })

    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error).toMatch(/unknown chunk container/)
    }
  })
})
