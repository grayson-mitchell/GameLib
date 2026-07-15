// Phase 21 (21-01): Steam depot decompress + verified-fetch primitives.
//
// Lifted near-verbatim from `.planning/spikes/002-steam-user-depot-download/steam-depot.mjs`
// (decompressChunk L70-104, sha1 L104, fetchChunk L116-145).
//
// SECURITY (T-21-03, mitigated): `fetchChunk` gates every chunk on
// `sha1(data) === chunk.sha` before returning it. A chunk that fails verification is
// retried against a DIFFERENT content server and is NEVER returned to the caller.

import { createHash } from 'node:crypto'
import { steamDecrypt } from './crypto'

/** Minimal surface of the `lzma` npm package this module depends on. */
export interface LzmaModule {
  decompress(
    input: Buffer,
    callback: (result: number[] | Buffer | string, error?: Error) => void
  ): void
}

export interface DepotChunk {
  sha: string | Buffer
  cb_original: number | string
  /** Rotation seed for fetchChunk's host-per-attempt selection (defaults to 0). */
  attemptSeed?: number
}

/**
 * Decompress a Steam chunk container: "VZ" (LZMA) or "PK" (zlib deflate).
 *
 * VZ layout (SteamKit VZipUtil):
 *   header : 'VZ'(2) | version 'a'(1) | timestamp(4) | lzma props(5)   = 12 B
 *   body   : raw LZMA stream
 *   footer : outputCrc(4) | outputSize(4) | 'zv'(2)                    = 10 B
 *
 * outputSize sits at len-6, not len-4 — the trailing 'zv' magic is 2 bytes.
 */
export async function decompressChunk(buf: Buffer, lzma: LzmaModule): Promise<Buffer> {
  const magic = buf.subarray(0, 2).toString('latin1')

  if (magic === 'VZ') {
    if (buf.subarray(-2).toString('latin1') !== 'zv') {
      throw new Error('VZ chunk: bad footer magic')
    }
    const props = buf.subarray(7, 12)
    const payload = buf.subarray(12, buf.length - 10)
    const outSize = buf.readUInt32LE(buf.length - 6)

    // Rebuild an lzma_alone header: props(5) + uncompressed size(8, LE).
    const size = Buffer.alloc(8)
    size.writeUInt32LE(outSize, 0)
    const stream = Buffer.concat([props, size, payload])

    return await new Promise<Buffer>((resolve, reject) =>
      lzma.decompress(stream, (result, err) =>
        err ? reject(err) : resolve(Buffer.from(result as number[] | Buffer))
      )
    )
  }

  if (magic === 'PK') {
    const zlib = await import('node:zlib')
    // Local file header is 30 bytes + filename + extra; inflate the raw deflate body.
    const nameLen = buf.readUInt16LE(26)
    const extraLen = buf.readUInt16LE(28)
    return zlib.inflateRawSync(buf.subarray(30 + nameLen + extraLen))
  }

  throw new Error(`unknown chunk container: ${JSON.stringify(magic)}`)
}

export const sha1 = (buf: Buffer): string => createHash('sha1').update(buf).digest('hex')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Fetch one chunk: download -> decrypt -> decompress -> verify.
 *
 * Retries across DIFFERENT content servers. Steam's CDN edges drop connections
 * under concurrency ("fetch failed" / ECONNRESET) — this is normal and expected,
 * not a protocol error. Without retry, ~16% of chunks failed at concurrency 8.
 * Rotating hosts on each attempt is what makes the download reliable.
 *
 * The `sha1(data) === chunk.sha` gate is a security control (T-21-03): a chunk
 * that never verifies is never returned — it throws after `attempts`.
 */
export async function fetchChunk(
  hosts: string[],
  depotId: string,
  chunk: DepotChunk,
  key: Buffer,
  lzma: LzmaModule,
  attempts = 4
): Promise<Buffer> {
  const sha = Buffer.isBuffer(chunk.sha) ? chunk.sha.toString('hex') : String(chunk.sha)
  let lastErr: Error | undefined

  for (let i = 0; i < attempts; i++) {
    const host = hosts[((chunk.attemptSeed ?? 0) + i) % hosts.length]
    try {
      const res = await fetch(`https://${host}/depot/${depotId}/chunk/${sha}`)
      if (!res.ok) throw new Error(`CDN ${res.status}`)

      const encrypted = Buffer.from(await res.arrayBuffer())
      const decrypted = steamDecrypt(encrypted, key)
      const data = await decompressChunk(decrypted, lzma)

      // The chunk's SHA1 is the hash of its DECOMPRESSED bytes — free integrity check.
      const got = sha1(data)
      if (got !== sha) throw new Error(`chunk sha1 mismatch: ${got} != ${sha}`)
      if (data.length !== Number(chunk.cb_original)) {
        throw new Error(`chunk size mismatch: ${data.length} != ${chunk.cb_original}`)
      }
      return data
    } catch (err) {
      lastErr = err as Error
      if (i < attempts - 1) await sleep(200 * 2 ** i) // 200ms, 400ms, 800ms
    }
  }
  throw new Error(`chunk ${sha} failed after ${attempts} attempts: ${lastErr?.message}`)
}
