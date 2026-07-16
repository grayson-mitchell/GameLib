// Phase 21 gap closure (21-15, D-UAT-03): moves LZMA/zlib depot-chunk
// decompression off the Electron main thread onto a worker_threads pool.
//
// Task 1 covers decodeChunk (the extracted CPU section of fetchChunk) and the
// worker's message-handling logic (handleDecodeMessage). Task 2 extends this
// suite with DecompressPool integration behavior (round-trip, concurrency,
// throw-isolation, timeout-recover, fallback).

import { randomBytes, createCipheriv } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import * as path from 'node:path'
import * as lzma from 'lzma'

import { decodeChunk, sha1, type LzmaModule } from '../depot/decompress'
import { handleDecodeMessage } from '../depot/decompressWorker'
import { DecompressPool } from '../depot/decompressPool'

// decompressPool.ts logs replaceWorker failures (WR-02) via backend/logger,
// whose heroicLogWriter is not initialized in the jest environment — factory
// mock so the log call is an inert no-op (mirrors library.test.ts).
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

/** Real worker_threads fixture (plain CommonJS — see the file's own header
 *  comment for why the pool tests below cannot spawn the project's own
 *  .ts decompressWorker.ts directly). */
const POOL_TEST_WORKER_PATH = path.join(__dirname, 'fixtures', 'poolTestWorker.js')

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

// ── DecompressPool ──────────────────────────────────────────────────────

describe('DecompressPool', () => {
  const key = randomBytes(32)

  async function buildEncrypted(data: Buffer): Promise<{ encrypted: Buffer; expectedSha: string }> {
    const compressed = await compressAsync(data)
    const vzChunk = buildVZChunk(data, compressed)
    return { encrypted: steamEncrypt(vzChunk, key), expectedSha: sha1(data) }
  }

  it('pool.decode round-trips a VZ chunk to the same bytes as inline decodeChunk', async () => {
    const data = Buffer.from('pool VZ round-trip fixture. '.repeat(10), 'utf8')
    const { encrypted, expectedSha } = await buildEncrypted(data)

    const pool = new DecompressPool({ size: 2, workerPath: POOL_TEST_WORKER_PATH })
    await pool.init()
    try {
      const out = await pool.decode(encrypted, key, expectedSha, data.length)
      expect(out.equals(data)).toBe(true)
    } finally {
      await pool.shutdown()
    }
  })

  it('pool.decode round-trips a PK chunk to the same bytes as inline decodeChunk', async () => {
    const data = Buffer.from('pool PK round-trip fixture', 'utf8')
    const pkChunk = buildPKChunk(data)
    const encrypted = steamEncrypt(pkChunk, key)
    const expectedSha = sha1(data)

    const pool = new DecompressPool({ size: 2, workerPath: POOL_TEST_WORKER_PATH })
    await pool.init()
    try {
      const out = await pool.decode(encrypted, key, expectedSha, data.length)
      expect(out.equals(data)).toBe(true)
    } finally {
      await pool.shutdown()
    }
  })

  it('20 concurrent pool.decode calls across a 4-worker pool all resolve correctly and independently', async () => {
    const pool = new DecompressPool({ size: 4, workerPath: POOL_TEST_WORKER_PATH })
    await pool.init()
    try {
      const fixtures = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          buildEncrypted(Buffer.from(`concurrent chunk #${i} distinct payload bytes`, 'utf8')).then(
            ({ encrypted, expectedSha }) => ({
              encrypted,
              expectedSha,
              data: Buffer.from(`concurrent chunk #${i} distinct payload bytes`, 'utf8')
            })
          )
        )
      )

      const results = await Promise.all(
        fixtures.map((f) => pool.decode(f.encrypted, key, f.expectedSha, f.data.length))
      )

      results.forEach((out, i) => {
        expect(out.equals(fixtures[i].data)).toBe(true)
      })
    } finally {
      await pool.shutdown()
    }
  })

  it('a worker that throws (malformed buffer) rejects only that task; the pool keeps serving subsequent tasks', async () => {
    const pool = new DecompressPool({ size: 2, workerPath: POOL_TEST_WORKER_PATH })
    await pool.init()
    try {
      const bogus = Buffer.from('XXmalformed-container', 'utf8')
      const bogusEncrypted = steamEncrypt(bogus, key)

      await expect(pool.decode(bogusEncrypted, key, 'irrelevant', 0)).rejects.toThrow(
        /unknown chunk container/
      )

      const data = Buffer.from('still works after a throw', 'utf8')
      const { encrypted, expectedSha } = await buildEncrypted(data)
      const out = await pool.decode(encrypted, key, expectedSha, data.length)
      expect(out.equals(data)).toBe(true)
    } finally {
      await pool.shutdown()
    }
  })

  it('a worker that hangs past the per-task timeout is terminated + replaced; the task rejects and later tasks succeed on the replacement', async () => {
    const pool = new DecompressPool({
      size: 1,
      taskTimeoutMs: 150,
      workerPath: POOL_TEST_WORKER_PATH
    })
    await pool.init()
    try {
      await expect(
        pool.decode(Buffer.from('irrelevant'), key, '__TEST_HANG__', 0)
      ).rejects.toThrow(/timed out/)

      const data = Buffer.from('succeeds on the replacement worker', 'utf8')
      const { encrypted, expectedSha } = await buildEncrypted(data)
      const out = await pool.decode(encrypted, key, expectedSha, data.length)
      expect(out.equals(data)).toBe(true)
    } finally {
      await pool.shutdown()
    }
  }, 15000)

  it('a task queued while all workers are busy still settles (inline) when the pool drains to zero workers and replacement keeps failing — never a permanent hang (WR-01)', async () => {
    // Real, decodable payload built up front so the queued task has valid
    // bytes to decode inline once the pool collapses.
    const data = Buffer.from('queued task must not orphan when the pool collapses', 'utf8')
    const { encrypted, expectedSha } = await buildEncrypted(data)

    // Single-worker pool: one busy worker + a short task timeout so the
    // collapse path is reached deterministically.
    const pool = new DecompressPool({
      size: 1,
      taskTimeoutMs: 300,
      workerPath: POOL_TEST_WORKER_PATH
    })
    await pool.init()
    try {
      // Occupy the only worker with a task that never responds.
      const hang = pool.decode(Buffer.from('irrelevant'), key, '__TEST_HANG__', 0)
      // Enqueue a real task while the sole worker is busy — it lands in the
      // queue (no idle worker to dispatch to).
      const queued = pool.decode(encrypted, key, expectedSha, data.length)

      // Force worker REPLACEMENT to fail: once the timeout terminates the
      // only worker, replaceWorker() respawns from this bad path and
      // rejects. With zero workers left and a non-empty queue, the pool
      // must drain the queue inline instead of leaving `queued` pending
      // forever.
      ;(pool as unknown as { workerPathOverride: string }).workerPathOverride = path.join(
        __dirname,
        'fixtures',
        'this-file-does-not-exist.js'
      )

      await expect(hang).rejects.toThrow(/timed out/)

      // Load-bearing assertion: the queued task settles (inline) with the
      // correct bytes rather than hanging.
      const out = await queued
      expect(out.equals(data)).toBe(true)
    } finally {
      await pool.shutdown()
    }
  }, 15000)

  it('when init() is forced to fail (bad worker path), decode() falls back to inline decodeChunk and still returns correct bytes', async () => {
    const data = Buffer.from('inline fallback fixture', 'utf8')
    const { encrypted, expectedSha } = await buildEncrypted(data)

    const pool = new DecompressPool({
      size: 2,
      workerPath: path.join(__dirname, 'fixtures', 'this-file-does-not-exist.js')
    })
    await pool.init()
    try {
      const out = await pool.decode(encrypted, key, expectedSha, data.length)
      expect(out.equals(data)).toBe(true)
    } finally {
      await pool.shutdown()
    }
  })
})
