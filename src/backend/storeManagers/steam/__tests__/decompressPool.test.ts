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
const POOL_TEST_WORKER_PATH = path.join(
  __dirname,
  'fixtures',
  'poolTestWorker.js'
)

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
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength
  ) as ArrayBuffer
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

    const out = await decodeChunk(
      encrypted,
      key,
      expectedSha,
      data.length,
      asLzmaModule
    )
    expect(out.equals(data)).toBe(true)
  })

  it('decodeChunk round-trips a PK (zlib) chunk to its expected decompressed bytes', async () => {
    const data = Buffer.from('decodeChunk PK fixture data', 'utf8')
    const pkChunk = buildPKChunk(data)
    const encrypted = steamEncrypt(pkChunk, key)
    const expectedSha = sha1(data)

    const out = await decodeChunk(
      encrypted,
      key,
      expectedSha,
      data.length,
      asLzmaModule
    )
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

  // Debug/steam-install-slow-start (cycle 13): the `code` field is new this
  // cycle -- previously `DecompressWorkerResponse`'s `ok:false` variant
  // carried ONLY a message string, and DecompressPool's message handler
  // reconstructed a bare `new Error(message)` from it on the main thread,
  // discarding any `.code` the original decodeChunk failure had (e.g.
  // `ChunkDecodeError.code`). This is the worker_threads-boundary half of
  // the fix for a hardware run's generic `err=N{Error:N}` chunk-stream
  // breakdown.
  it("posts the decode error's `.code` alongside the message (cycle 13)", async () => {
    const bogus = Buffer.from('XXbad-container-bytes', 'utf8')
    const encrypted = steamEncrypt(bogus, key)

    const response = await handleDecodeMessage({
      id: 3,
      encrypted: toArrayBuffer(encrypted),
      key: toArrayBuffer(key),
      expectedSha: 'irrelevant',
      cbOriginal: 0
    })

    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.code).toBe('unknown_container')
    }
  })
})

// ── DecompressPool ──────────────────────────────────────────────────────

describe('DecompressPool', () => {
  const key = randomBytes(32)

  async function buildEncrypted(
    data: Buffer
  ): Promise<{ encrypted: Buffer; expectedSha: string }> {
    const compressed = await compressAsync(data)
    const vzChunk = buildVZChunk(data, compressed)
    return { encrypted: steamEncrypt(vzChunk, key), expectedSha: sha1(data) }
  }

  it('pool.decode round-trips a VZ chunk to the same bytes as inline decodeChunk', async () => {
    const data = Buffer.from('pool VZ round-trip fixture. '.repeat(10), 'utf8')
    const { encrypted, expectedSha } = await buildEncrypted(data)

    const pool = new DecompressPool({
      size: 2,
      workerPath: POOL_TEST_WORKER_PATH
    })
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

    const pool = new DecompressPool({
      size: 2,
      workerPath: POOL_TEST_WORKER_PATH
    })
    await pool.init()
    try {
      const out = await pool.decode(encrypted, key, expectedSha, data.length)
      expect(out.equals(data)).toBe(true)
    } finally {
      await pool.shutdown()
    }
  })

  it('20 concurrent pool.decode calls across a 4-worker pool all resolve correctly and independently', async () => {
    const pool = new DecompressPool({
      size: 4,
      workerPath: POOL_TEST_WORKER_PATH
    })
    await pool.init()
    try {
      const fixtures = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          buildEncrypted(
            Buffer.from(`concurrent chunk #${i} distinct payload bytes`, 'utf8')
          ).then(({ encrypted, expectedSha }) => ({
            encrypted,
            expectedSha,
            data: Buffer.from(
              `concurrent chunk #${i} distinct payload bytes`,
              'utf8'
            )
          }))
        )
      )

      const results = await Promise.all(
        fixtures.map((f) =>
          pool.decode(f.encrypted, key, f.expectedSha, f.data.length)
        )
      )

      results.forEach((out, i) => {
        expect(out.equals(fixtures[i].data)).toBe(true)
      })
    } finally {
      await pool.shutdown()
    }
  })

  it('a worker that throws (malformed buffer) rejects only that task; the pool keeps serving subsequent tasks', async () => {
    const pool = new DecompressPool({
      size: 2,
      workerPath: POOL_TEST_WORKER_PATH
    })
    await pool.init()
    try {
      const bogus = Buffer.from('XXmalformed-container', 'utf8')
      const bogusEncrypted = steamEncrypt(bogus, key)

      let caught: (Error & { code?: string }) | undefined
      await pool.decode(bogusEncrypted, key, 'irrelevant', 0).catch((err) => {
        caught = err
      })
      expect(caught?.message).toMatch(/unknown chunk container/)
      // Debug/steam-install-slow-start (cycle 13): the reconstructed error
      // carries the SAME `.code` the worker fixture attached, proving the
      // code survives the REAL worker_threads message-passing boundary
      // (poolTestWorker.js -> decompressPool.ts's `wireWorker` handler),
      // not just the in-process handleDecodeMessage unit test above.
      expect(caught?.code).toBe('unknown_container')

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
      let caught: (Error & { code?: string }) | undefined
      await pool
        .decode(Buffer.from('irrelevant'), key, '__TEST_HANG__', 0)
        .catch((err) => {
          caught = err
        })
      expect(caught?.message).toMatch(/timed out/)
      // Debug/steam-install-slow-start (cycle 13): a pool-level timeout is
      // just as distinguishable as a decode-stage or network-stage failure
      // now — 'decompress_pool_timeout' instead of the generic `'Error'`
      // attemptFailureReason would otherwise report.
      expect(caught?.code).toBe('decompress_pool_timeout')

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
    const data = Buffer.from(
      'queued task must not orphan when the pool collapses',
      'utf8'
    )
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
      const hang = pool.decode(
        Buffer.from('irrelevant'),
        key,
        '__TEST_HANG__',
        0
      )
      // Enqueue a real task while the sole worker is busy — it lands in the
      // queue (no idle worker to dispatch to).
      const queued = pool.decode(encrypted, key, expectedSha, data.length)

      // Force worker REPLACEMENT to fail: once the timeout terminates the
      // only worker, replaceWorker() respawns from this bad path and
      // rejects. With zero workers left and a non-empty queue, the pool
      // must drain the queue inline instead of leaving `queued` pending
      // forever.
      ;(pool as unknown as { workerPathOverride: string }).workerPathOverride =
        path.join(__dirname, 'fixtures', 'this-file-does-not-exist.js')

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
      workerPath: path.join(
        __dirname,
        'fixtures',
        'this-file-does-not-exist.js'
      )
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

// ── GAMELIB_DECOMPRESS_POOL_SIZE override (debug/humankind-depot-full-stall,
// P/E-core saturation hypothesis continuation) ── constructor-only, no
// worker spawn needed: `stats().size` reflects the resolved `this.size`
// the moment the pool is constructed.

describe('DecompressPool GAMELIB_DECOMPRESS_POOL_SIZE override', () => {
  const ENV_KEY = 'GAMELIB_DECOMPRESS_POOL_SIZE'
  const original = process.env[ENV_KEY]

  afterEach(() => {
    if (original === undefined) {
      delete process.env[ENV_KEY]
    } else {
      process.env[ENV_KEY] = original
    }
  })

  it('uses the env override when set to a valid positive integer and no explicit size is given', () => {
    process.env[ENV_KEY] = '4'
    const pool = new DecompressPool({ workerPath: POOL_TEST_WORKER_PATH })
    expect(pool.stats().size).toBe(4)
  })

  it('falls through to the unchanged default when the env var is unset', () => {
    delete process.env[ENV_KEY]
    const defaultPool = new DecompressPool({ workerPath: POOL_TEST_WORKER_PATH })
    const expectedDefault = defaultPool.stats().size
    expect(expectedDefault).toBeGreaterThan(0)
  })

  it.each(['0', '-1', 'abc', '3.5', ''])(
    'ignores an invalid env value (%p) and falls through to the unchanged default',
    (invalid) => {
      delete process.env[ENV_KEY]
      const before = new DecompressPool({
        workerPath: POOL_TEST_WORKER_PATH
      }).stats().size

      if (invalid === '') {
        delete process.env[ENV_KEY]
      } else {
        process.env[ENV_KEY] = invalid
      }
      const after = new DecompressPool({
        workerPath: POOL_TEST_WORKER_PATH
      }).stats().size

      expect(after).toBe(before)
    }
  )

  it('an explicit opts.size still wins over the env override', () => {
    process.env[ENV_KEY] = '4'
    const pool = new DecompressPool({
      size: 2,
      workerPath: POOL_TEST_WORKER_PATH
    })
    expect(pool.stats().size).toBe(2)
  })
})

// ── resolveWorkerSpec (quick task 260817-pkx, debug/humankind-depot-full-stall) ──

type WorkerSpecPeek = { resolveWorkerSpec: () => { kind: string; value: string } }

describe('DecompressPool resolveWorkerSpec (SEA-asset worker resolution)', () => {
  afterEach(() => {
    jest.resetModules()
    jest.dontMock('node:sea')
  })

  it('resolves a source-kind spec from node:sea.getAsset() when isSea() is true and no workerPath override is given', () => {
    jest.doMock('node:sea', () => ({
      isSea: () => true,
      getAsset: () => 'module.exports = {}'
    }))
    // Re-require after the mock so decompressPool.ts's own `require('node:sea')`
    // (evaluated lazily inside resolveWorkerSpec(), not at module load) picks it up.
    jest.isolateModules(() => {
      const {
        DecompressPool: MockedPool
        // eslint-disable-next-line @typescript-eslint/no-require-imports
      } = require('../depot/decompressPool') as {
        DecompressPool: new (opts?: { size?: number }) => WorkerSpecPeek
      }
      const pool = new MockedPool({ size: 1 })
      const spec = (pool as unknown as WorkerSpecPeek).resolveWorkerSpec()
      expect(spec.kind).toBe('source')
    })
  })

  it('resolves a path-kind spec ending in decompressWorker.js when isSea() is false', () => {
    jest.doMock('node:sea', () => ({
      isSea: () => false,
      getAsset: () => {
        throw new Error('should not be called when isSea() is false')
      }
    }))
    jest.isolateModules(() => {
      const {
        DecompressPool: MockedPool
        // eslint-disable-next-line @typescript-eslint/no-require-imports
      } = require('../depot/decompressPool') as {
        DecompressPool: new (opts?: { size?: number }) => WorkerSpecPeek
      }
      const pool = new MockedPool({ size: 1 })
      const spec = (pool as unknown as WorkerSpecPeek).resolveWorkerSpec()
      expect(spec.kind).toBe('path')
      expect(spec.value.endsWith('decompressWorker.js')).toBe(true)
    })
  })

  it('an explicit workerPath override still wins over an isSea()=true mock (regression guard for every other test in this file)', () => {
    jest.doMock('node:sea', () => ({
      isSea: () => true,
      getAsset: () => 'module.exports = {}'
    }))
    jest.isolateModules(() => {
      const {
        DecompressPool: MockedPool
        // eslint-disable-next-line @typescript-eslint/no-require-imports
      } = require('../depot/decompressPool') as {
        DecompressPool: new (opts?: {
          size?: number
          workerPath?: string
        }) => WorkerSpecPeek
      }
      const pool = new MockedPool({
        size: 1,
        workerPath: POOL_TEST_WORKER_PATH
      })
      const spec = (pool as unknown as WorkerSpecPeek).resolveWorkerSpec()
      expect(spec.kind).toBe('path')
      expect(spec.value).toBe(POOL_TEST_WORKER_PATH)
    })
  })

  it('requests the exact asset key "decompressWorker.js" (same literal buildSidecarSea.ts exports as SEA_WORKER_ASSET_KEY)', () => {
    const getAsset = jest.fn(() => 'module.exports = {}')
    jest.doMock('node:sea', () => ({
      isSea: () => true,
      getAsset
    }))
    jest.isolateModules(() => {
      const {
        DecompressPool: MockedPool
        // eslint-disable-next-line @typescript-eslint/no-require-imports
      } = require('../depot/decompressPool') as {
        DecompressPool: new (opts?: { size?: number }) => WorkerSpecPeek
      }
      const pool = new MockedPool({ size: 1 })
      ;(pool as unknown as WorkerSpecPeek).resolveWorkerSpec()
    })
    expect(getAsset).toHaveBeenCalledWith('decompressWorker.js', 'utf8')
  })
})
