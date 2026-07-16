// Phase 21 gap closure (21-15): worker_threads entry for depot chunk
// decode (decrypt -> decompress -> sha1/size verify), spawned by
// DecompressPool so the pure-JS LZMA decompressor (~5 MB/s single-threaded)
// runs off the Electron main thread instead of blocking the event loop.
//
// SECURITY (T-21-15-02, mitigated): the depot decryption key and any
// decrypted/decompressed bytes are NEVER logged/console'd here. Only
// decodeChunk's verified output crosses back to the main thread, transferred
// (not copied) as an ArrayBuffer. The key is never posted back.

import { parentPort } from 'node:worker_threads'
import { decodeChunk, type LzmaModule } from './decompress'

export interface DecompressWorkerRequest {
  id: number
  encrypted: ArrayBuffer
  key: ArrayBuffer
  expectedSha: string
  cbOriginal: number | string
}

export type DecompressWorkerResponse =
  | { id: number; ok: true; data: ArrayBuffer }
  | { id: number; ok: false; error: string }

let lzmaPromise: Promise<LzmaModule> | undefined

/** Lazily loads the pure-JS `lzma` codec once per worker (module-load-scoped
 *  cache), mirroring downloadDepotFiles' own once-per-install load pattern. */
function getLzma(): Promise<LzmaModule> {
  if (!lzmaPromise) {
    lzmaPromise = import('lzma').then(
      (mod) => ((mod as { default?: LzmaModule }).default ?? mod) as unknown as LzmaModule
    )
  }
  return lzmaPromise
}

/**
 * Core message handler, exported separately from the parentPort listener
 * below so it is directly unit-testable (jest) without needing a real
 * worker_threads isolate. Runs decodeChunk and returns either the
 * decompressed ArrayBuffer or a stringified error — never throws.
 */
export async function handleDecodeMessage(
  msg: DecompressWorkerRequest
): Promise<DecompressWorkerResponse> {
  try {
    const lzma = await getLzma()
    const result = await decodeChunk(
      Buffer.from(msg.encrypted),
      Buffer.from(msg.key),
      msg.expectedSha,
      msg.cbOriginal,
      lzma
    )
    // Slice to a fresh ArrayBuffer bounded to the result's own bytes (a
    // Buffer's underlying .buffer can be a larger pooled allocation) so the
    // transfer list below only detaches exactly what we're sending.
    const data = result.buffer.slice(
      result.byteOffset,
      result.byteOffset + result.byteLength
    ) as ArrayBuffer
    return { id: msg.id, ok: true, data }
  } catch (err) {
    return { id: msg.id, ok: false, error: String((err as Error)?.message ?? err) }
  }
}

// Only registers the real worker_threads listener when actually running
// inside a Worker (parentPort is null on the main thread) — this lets the
// module be imported directly by tests (handleDecodeMessage above) without
// side effects.
if (parentPort) {
  const port = parentPort
  port.on('message', async (msg: DecompressWorkerRequest) => {
    const response = await handleDecodeMessage(msg)
    if (response.ok) {
      port.postMessage(response, [response.data])
    } else {
      port.postMessage(response)
    }
  })
}
