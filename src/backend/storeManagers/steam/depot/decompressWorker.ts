// Phase 21 gap closure (21-15): worker_threads entry for depot chunk
// decode (decrypt -> decompress -> sha1/size verify), spawned by
// DecompressPool so the pure-JS LZMA decompressor (~5 MB/s single-threaded)
// runs off the Electron main thread instead of blocking the event loop.
//
// SECURITY (T-21-15-02, mitigated): the depot decryption key and any
// decrypted/decompressed bytes are NEVER logged/console'd here. Only
// decodeChunk's verified output crosses back to the main thread, transferred
// (not copied) as an ArrayBuffer. The key is never posted back.
//
// Debug/dev-mode-decompress-worker-electron-hook: this worker's import chain
// (./decompress -> backend/logger -> ... -> constants/paths.ts) reaches a
// module-scope `app.getPath('appData')` call, so `require('electron')` must
// resolve to a headless stub inside THIS worker's own isolate -- a
// worker_threads.Worker gets a fresh V8 isolate/module registry and does not
// inherit the `Module._load` runtime hook `bootstrap.ts` installs for the
// sidecar's main thread. A first-import runtime-hook approach (mirroring
// bootstrap.ts) does NOT work here: electron-vite/Rollup's CJS output for a
// multi-entry build hoists ALL requires -- including a shared chunk this
// entry's code shares with `main.js` -- to the TOP of the generated file,
// executing them before ANY of this module's own body statements (a
// first-line hook-install included) ever run. Confirmed empirically: adding
// such an import here still reproduced the crash when the built file was
// spawned as a real worker_threads.Worker. The actual fix lives at BUILD
// TIME instead (`meta/buildDecompressWorkerDev.ts`, `pnpm
// build:decompress-worker-dev`), which esbuild-aliases `electron` directly
// to `electronStub.ts` -- mirroring the packaged SEA worker bundle's own
// `--alias:electron` fix (quick-260817-pkx) -- so there is no runtime
// require('electron') left to intercept, in either bundler's chunking
// behavior.

import { parentPort } from 'node:worker_threads'
import { decodeChunk, type LzmaModule } from './decompress'
import {
  loadLzmaModule,
  lzmaDecoderKind,
  type LzmaDecoderKind
} from './lzmaLoader'

export interface DecompressWorkerRequest {
  id: number
  encrypted: ArrayBuffer
  key: ArrayBuffer
  expectedSha: string
  cbOriginal: number | string
}

export type DecompressWorkerResponse =
  | { id: number; ok: true; data: ArrayBuffer }
  | { id: number; ok: false; error: string; code?: string }

/** Explicit ready handshake DecompressPool's spawnWorker() waits for before
 *  treating a worker as successfully spawned. `worker_threads`' own 'online'
 *  event only confirms the worker's JS environment started — a bad/missing
 *  entry path still fires 'online' BEFORE the module-not-found error
 *  surfaces (Node worker_threads pitfall), so 'online' alone is not a safe
 *  success signal. Sending this message only after the module's own require
 *  graph has resolved makes success detection deterministic.
 *
 *  Phase 23.1 plan 04: `lzmaKind` is OPTIONAL so an in-flight worker bundle
 *  built BEFORE this change still satisfies this type and
 *  `isReadyMessage()` (decompressPool.ts) keeps matching on
 *  `type === 'ready'` alone. Reports which decoder THIS worker's own
 *  `loadLzmaModule()` call resolved (lzmaLoader.ts) so
 *  `DecompressPool.stats().nativeWorkers` can answer "is native decode
 *  actually engaged" from a running install's own state, without another
 *  forensic round-trip (see decompressPool.ts's own doc comment on that
 *  field). */
export interface DecompressWorkerReady {
  type: 'ready'
  lzmaKind?: LzmaDecoderKind
}

/** Phase 23.1 plan 04: delegates to lzmaLoader.ts's `loadLzmaModule()` --
 *  the codec is now native-first (`lzma-native`) with a pure-JS fallback,
 *  memoized and logged in exactly ONE place shared with
 *  `decompressPool.ts`'s own `inlineDecode()`, so neither consumer can
 *  silently diverge on which decoder it's actually using. This function's
 *  own dedicated `import('lzma')` memoization (pre-plan-04) is gone -- the
 *  loader owns that now. */
function getLzma(): Promise<LzmaModule> {
  return loadLzmaModule()
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
    // Debug/steam-install-slow-start (cycle 13): a plain `error: string`
    // message is all this response type carried before this cycle --
    // DecompressPool's message handler reconstructed a BARE `new
    // Error(message)` from it, discarding any `.code` the original error
    // had (e.g. `decodeChunk`'s new `ChunkDecodeError.code`, or a Node
    // crypto/zlib error's own native `.code`) even when one existed. This
    // is the worker_threads-boundary half of the fix for a hardware run's
    // generic `err=N{Error:N}` breakdown -- threading `.code` across
    // `postMessage` (a plain string, structured-clone-safe) lets the main
    // thread rebuild an error that still carries it (see decompressPool.ts).
    // Never the message/stack of anything more sensitive than the existing
    // `error` string already logged; no key/token/URL crosses this boundary.
    const e = err as { code?: unknown; message?: unknown } | undefined
    return {
      id: msg.id,
      ok: false,
      error: String(e?.message ?? err),
      code: typeof e?.code === 'string' ? e.code : undefined
    }
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
  // Phase 23.1 plan 04: the decoder is resolved EAGERLY here, right after
  // the 'message' listener above is registered, rather than lazily on the
  // first decode — so `dlopen()` (if the native path engages) happens ONCE
  // at spawn, and a native-load problem surfaces at pool init instead of
  // mid-download. `loadLzmaModule()` NEVER rejects (lzmaLoader.ts's own
  // contract), so this `.then()` always fires and 'ready' is always sent —
  // a native-load FAILURE must still be treated as a successfully spawned,
  // merely slower, worker: treating it as a failed worker would collapse
  // the whole pool to inline decode (DecompressPool.init()'s own fallback),
  // making this phase's own regression worse than the baseline it exists to
  // fix. See DecompressWorkerReady's doc comment for why this replaces
  // 'online' as the pool's spawn-success signal.
  void getLzma().then(() => {
    const ready: DecompressWorkerReady = {
      type: 'ready',
      lzmaKind: lzmaDecoderKind()
    }
    port.postMessage(ready)
  })
}
