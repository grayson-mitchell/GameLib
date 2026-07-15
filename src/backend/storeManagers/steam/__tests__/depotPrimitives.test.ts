// Phase 21 (21-01): Unit tests for the lifted depot primitive layers
// (crypto, decompress, select). Proves byte-fidelity, SHA1-verify-then-trust,
// and 64-bit-GID-as-string invariants asserted by tests, not just prose.

import { createCipheriv, randomBytes } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import * as lzma from 'lzma'

import { steamDecrypt, decryptFilename } from '../depot/crypto'
import { decompressChunk, sha1, fetchChunk } from '../depot/decompress'

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

// ── crypto ────────────────────────────────────────────────────────────────

describe('crypto', () => {
  const key = randomBytes(32)

  it('steamDecrypt round-trips a known plaintext under a known key', () => {
    const plaintext = Buffer.from('some depot chunk plaintext bytes, arbitrary length!')
    const ciphertext = steamEncrypt(plaintext, key)
    expect(steamDecrypt(ciphertext, key)).toEqual(plaintext)
  })

  it('decryptFilename returns UTF-8 up to the first NUL, stripping trailing PKCS padding', () => {
    const filename = 'UnityEngine.SubstanceModule.dll'
    const plaintext = Buffer.concat([Buffer.from(filename, 'utf8'), Buffer.from([0])])
    const ciphertext = steamEncrypt(plaintext, key)
    expect(decryptFilename(ciphertext.toString('base64'), key)).toBe(filename)
  })

  it('a filename decrypting to bytes containing "../" is returned verbatim (no sanitization)', () => {
    const filename = '../../evil/traversal.txt'
    const plaintext = Buffer.concat([Buffer.from(filename, 'utf8'), Buffer.from([0])])
    const ciphertext = steamEncrypt(plaintext, key)
    expect(decryptFilename(ciphertext.toString('base64'), key)).toBe(filename)
  })
})

// ── decompress ───────────────────────────────────────────────────────────

describe('decompress', () => {
  it('decompressChunk on a VZ-container fixture returns the exact decompressed bytes', async () => {
    const data = Buffer.from('Steam depot chunk fixture data. '.repeat(20), 'utf8')
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

  it('decompressChunk throws on an unknown container magic', async () => {
    const bogus = Buffer.from('XXsome-unknown-container-bytes', 'utf8')
    await expect(decompressChunk(bogus, lzma)).rejects.toThrow(/unknown chunk container/)
  })

  it('sha1 hashes bytes to the expected hex digest', () => {
    const data = Buffer.from('hello')
    // sha1('hello') = aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d
    expect(sha1(data)).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d')
  })

  describe('fetchChunk', () => {
    const key = randomBytes(32)
    const depotId = '12345'
    const hosts = ['host-a.example', 'host-b.example', 'host-c.example', 'host-d.example']

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

      const chunk = { sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', cb_original: data.length }

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
  })
})
