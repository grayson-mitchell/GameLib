// Quick task 260817-pkx (debug/humankind-depot-full-stall.md): a synthetic
// VZ/LZMA decode round trip that proves DecompressPool's worker_threads
// pool is actually live -- reachable inside a compiled SEA sidecar via the
// `GAMELIB_SIDECAR_SELFTEST=decompress-pool` env guard (src/sidecar/index.ts)
// without needing a real game install. A VZ chunk is used deliberately (not
// PK/zlib) -- it forces the real pure-JS LZMA decoder to run inside the
// worker isolate, the exact code path that never engaged before this fix
// (resolveWorkerPath()'s __dirname-relative resolution never resolved
// inside a packaged SEA binary, so init() always fell back to inline decode
// there).
//
// `steamEncrypt()`, `compressAsync()` and `buildVZChunk()` below are lifted
// verbatim from decompressPool.test.ts's own fixture builders (L43-79) --
// deliberately duplicated rather than imported, since this module ships
// inside the production SEA bundle and must not pull in test-only code.
//
// SECURITY (T-21-15-02 discipline, same as decompressWorker.ts): stdout
// here is the only observable surface of a packaged binary's self-test run.
// Only byte LENGTHS, a boolean sha/bytes match, and error codes/messages
// are ever printed -- never the encryption key, the ciphertext, or the
// decoded bytes themselves.

import { randomBytes, createCipheriv } from 'node:crypto'
import * as lzma from 'lzma'
import { sha1 } from './decompress'
import { DecompressPool } from './decompressPool'

/** Steam's symmetric encrypt (inverse of steamDecrypt) -- lifted verbatim
 *  from decompressPool.test.ts's own fixture builder. */
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

/** Build a VZ-container chunk from raw data + its LZMA-compressed
 *  representation -- lifted verbatim from decompressPool.test.ts's own
 *  fixture builder. */
function buildVZChunk(data: Buffer, compressed: Buffer): Buffer {
  const props = compressed.subarray(0, 5)
  const payload = compressed.subarray(13) // skip props(5) + alone-format size(8)

  const header = Buffer.concat([
    Buffer.from('VZa', 'latin1'),
    Buffer.alloc(4),
    props
  ])
  const footer = Buffer.alloc(10)
  footer.writeUInt32LE(0, 0) // crc -- unused/unchecked by decompressChunk
  footer.writeUInt32LE(data.length, 4) // outSize -- read at buf.length-6
  footer.write('zv', 8, 'latin1')

  return Buffer.concat([header, payload, footer])
}

const SELFTEST_POOL_SIZE = 2

/**
 * Runs the synthetic VZ/LZMA round trip and returns a process exit code:
 * `0` only when the pool actually used live worker threads (never the
 * inline fallback) AND the round trip decoded correctly. `1` otherwise.
 * Never throws -- every failure path is caught and reported via stdout so
 * the caller (`src/sidecar/index.ts`) can always exit deterministically.
 */
export async function runDecompressPoolSelfTest(): Promise<number> {
  const pool = new DecompressPool({
    size: SELFTEST_POOL_SIZE,
    taskTimeoutMs: 15_000
  })
  let exitCode = 1
  try {
    await pool.init()
    const initialStats = pool.stats()
    console.log(`SELFTEST pool=${JSON.stringify(initialStats)}`)

    const filler = Buffer.alloc(64 * 1024)
    for (let i = 0; i < filler.length; i++) filler[i] = i % 251
    const compressed = await compressAsync(filler)
    const vzChunk = buildVZChunk(filler, compressed)
    const key = randomBytes(32)
    const encrypted = steamEncrypt(vzChunk, key)
    const expectedSha = sha1(filler)

    let decodeOk = false
    let match = false
    try {
      const out = await pool.decode(encrypted, key, expectedSha, filler.length)
      match = out.equals(filler)
      decodeOk = true
      console.log(`SELFTEST decode=ok bytes=${out.length} match=${match}`)
    } catch (err) {
      const e = err as { code?: unknown; message?: unknown } | undefined
      console.log(
        `SELFTEST decode=fail code=${
          typeof e?.code === 'string' ? e.code : 'unknown'
        } message=${String(e?.message ?? err)}`
      )
    }

    if (
      initialStats.inlineFallback === false &&
      initialStats.size === SELFTEST_POOL_SIZE &&
      initialStats.idle === SELFTEST_POOL_SIZE &&
      decodeOk &&
      match
    ) {
      exitCode = 0
    }
  } finally {
    await pool.shutdown()
  }
  return exitCode
}
