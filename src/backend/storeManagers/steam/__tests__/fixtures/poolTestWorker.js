// Phase 21 gap closure (21-15): plain-CommonJS test-only worker fixture for
// decompressPool.test.ts.
//
// A real worker_threads.Worker loads its own separate V8 isolate via Node's
// NATIVE module loader — it cannot parse the project's `decompressWorker.ts`
// (ts-jest only transforms code running INSIDE the jest process). This
// fixture mirrors decompressWorker.ts's wire protocol and decodeChunk's
// decrypt -> decompress -> verify logic in plain JS so decompressPool.test.ts
// can exercise DecompressPool's real worker-dispatch mechanics (concurrency,
// throw-isolation, timeout-recover) against a REAL OS thread. NOT shipped in
// the production build; production wiring (build/main/decompressWorker.js)
// is verified separately in Task 3 against the actual electron-vite output.
//
// Test-only hang trigger: a message whose `expectedSha` is exactly
// '__TEST_HANG__' is intentionally never responded to, so the pool's
// per-task timeout + terminate + replace path can be exercised
// deterministically without relying on real LZMA ever actually stalling.

const { parentPort } = require('node:worker_threads')
const { createDecipheriv, createHash } = require('node:crypto')
const zlib = require('node:zlib')
const lzma = require('lzma')

function steamDecrypt(ciphertext, key) {
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

function decompressChunk(buf) {
  const magic = buf.subarray(0, 2).toString('latin1')

  if (magic === 'VZ') {
    if (buf.subarray(-2).toString('latin1') !== 'zv') {
      throw new Error('VZ chunk: bad footer magic')
    }
    const props = buf.subarray(7, 12)
    const payload = buf.subarray(12, buf.length - 10)
    const outSize = buf.readUInt32LE(buf.length - 6)
    const size = Buffer.alloc(8)
    size.writeUInt32LE(outSize, 0)
    const stream = Buffer.concat([props, size, payload])
    return new Promise((resolve, reject) =>
      lzma.decompress(stream, (result, err) => (err ? reject(err) : resolve(Buffer.from(result))))
    )
  }

  if (magic === 'PK') {
    const nameLen = buf.readUInt16LE(26)
    const extraLen = buf.readUInt16LE(28)
    return Promise.resolve(zlib.inflateRawSync(buf.subarray(30 + nameLen + extraLen)))
  }

  return Promise.reject(new Error(`unknown chunk container: ${JSON.stringify(magic)}`))
}

const sha1 = (buf) => createHash('sha1').update(buf).digest('hex')

async function decodeChunk(encrypted, key, expectedSha, cbOriginal) {
  const decrypted = steamDecrypt(encrypted, key)
  const data = await decompressChunk(decrypted)
  const got = sha1(data)
  if (got !== expectedSha) throw new Error(`chunk sha1 mismatch: ${got} != ${expectedSha}`)
  if (data.length !== Number(cbOriginal)) {
    throw new Error(`chunk size mismatch: ${data.length} != ${cbOriginal}`)
  }
  return data
}

parentPort.on('message', async (msg) => {
  // Ignore our own ready handshake if it ever loops back (defensive only —
  // parentPort is a one-way port to the pool, this never actually happens).
  if (msg && msg.type === 'ready') return
  if (msg.expectedSha === '__TEST_HANG__') {
    return // test-only: simulate a stuck decode, never responds
  }
  try {
    const result = await decodeChunk(
      Buffer.from(msg.encrypted),
      Buffer.from(msg.key),
      msg.expectedSha,
      msg.cbOriginal
    )
    const data = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength)
    parentPort.postMessage({ id: msg.id, ok: true, data }, [data])
  } catch (err) {
    parentPort.postMessage({
      id: msg.id,
      ok: false,
      error: String(err && err.message ? err.message : err)
    })
  }
})

// Explicit ready handshake — mirrors decompressWorker.ts's real contract so
// DecompressPool's spawnWorker() (which keys off this message, not the
// generic 'online' event — see decompressPool.ts's spawnWorker doc comment)
// behaves identically against this fixture and the real worker.
parentPort.postMessage({ type: 'ready' })
