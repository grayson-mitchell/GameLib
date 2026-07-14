/**
 * A working Steam depot downloader, in pure TypeScript-shaped JS.
 *
 * WHY THIS EXISTS — spike 002's central finding:
 *
 * steam-user gives us everything hard (CM auth, PICS, depot keys, manifest
 * fetch, content-server list) but its two CONVENIENCE helpers are broken against
 * current Steam:
 *
 *   1. `getManifest()` filename decryption — content_manifest.js:92 does
 *      `plain.slice(0, plain.indexOf(0))`. The plaintext is
 *      `filename + NUL + PKCS#7 padding`, and steam-crypto's symmetricDecrypt
 *      hands back a buffer where indexOf(0) is -1, so `slice(0, -1)` silently
 *      chops a byte and every filename comes back truncated to a block boundary
 *      ("UnityEngine.SubstanceModule.dll" → "UnityEngine.Substan").
 *
 *   2. `downloadChunk()` / `downloadFile()` — blow up with
 *      "Illegal starting byte" before producing any data.
 *
 * Neither is a protocol problem. Decrypting by hand recovers perfect plaintext
 * and a valid "VZ" LZMA container that decompresses to a SHA1-exact chunk. The
 * data was always there; only steam-user's handling of it is wrong.
 *
 * So: use steam-user for the hard parts, implement these two ourselves.
 */

import { createDecipheriv, createHash } from 'node:crypto'

/**
 * Steam's symmetric decrypt.
 * First 16 bytes of ciphertext = IV, itself AES-256-ECB encrypted under the key.
 * Remainder = AES-256-CBC under that IV, PKCS#7 padded.
 */
export function steamDecrypt(ciphertext, key) {
  const ivDec = createDecipheriv('aes-256-ecb', key, null)
  ivDec.setAutoPadding(false)
  const iv = Buffer.concat([ivDec.update(ciphertext.subarray(0, 16)), ivDec.final()])

  const dec = createDecipheriv('aes-256-cbc', key, iv)
  dec.setAutoPadding(false)
  const plain = Buffer.concat([dec.update(ciphertext.subarray(16)), dec.final()])

  const pad = plain[plain.length - 1]
  const padOk =
    pad >= 1 && pad <= 16 && plain.subarray(plain.length - pad).every((b) => b === pad)
  return padOk ? plain.subarray(0, plain.length - pad) : plain
}

/**
 * Decrypt a manifest filename correctly.
 * Plaintext is `filename + NUL + padding`; strip padding, then cut at the NUL.
 * (steam-user gets this wrong — see the header comment.)
 */
export function decryptFilename(b64, key) {
  const plain = steamDecrypt(Buffer.from(b64, 'base64'), key)
  const nul = plain.indexOf(0)
  return (nul === -1 ? plain : plain.subarray(0, nul)).toString('utf8')
}

/**
 * Decompress a Steam "VZ" LZMA chunk.
 *
 * Layout (SteamKit VZipUtil):
 *   header : 'VZ'(2) | version 'a'(1) | timestamp(4) | lzma props(5)   = 12 B
 *   body   : raw LZMA stream
 *   footer : outputCrc(4) | outputSize(4) | 'zv'(2)                    = 10 B
 *
 * outputSize sits at len-6, not len-4 — the trailing 'zv' magic is 2 bytes.
 */
export async function decompressChunk(buf, lzma) {
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

    return await new Promise((resolve, reject) =>
      lzma.decompress(stream, (result, err) =>
        err ? reject(err) : resolve(Buffer.from(result))
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

export const sha1 = (buf) => createHash('sha1').update(buf).digest('hex')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Fetch one chunk: download → decrypt → decompress → verify.
 *
 * Retries across DIFFERENT content servers. Steam's CDN edges drop connections
 * under concurrency ("fetch failed" / ECONNRESET) — this is normal and expected,
 * not a protocol error. Without retry, ~16% of chunks failed at concurrency 8.
 * Rotating hosts on each attempt is what makes the download reliable.
 */
export async function fetchChunk(hosts, depotId, chunk, key, lzma, attempts = 4) {
  const sha = Buffer.isBuffer(chunk.sha) ? chunk.sha.toString('hex') : String(chunk.sha)
  let lastErr

  for (let i = 0; i < attempts; i++) {
    const host = hosts[(chunk.attemptSeed ?? 0) + i >= hosts.length
      ? ((chunk.attemptSeed ?? 0) + i) % hosts.length
      : (chunk.attemptSeed ?? 0) + i]
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
      lastErr = err
      if (i < attempts - 1) await sleep(200 * 2 ** i) // 200ms, 400ms, 800ms
    }
  }
  throw new Error(`chunk ${sha} failed after ${attempts} attempts: ${lastErr.message}`)
}
