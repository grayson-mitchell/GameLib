// Spike 023, task 3: the worker's SOURCE entry. Gets esbuild-bundled (with
// --bundle --platform=node --format=cjs --target=node22
// --alias:node-gyp-build=./binding-shim.cjs) into a single self-contained JS
// file, exactly as buildSidecarSea.ts's bundleWorkerForSea() does for the
// production decompressWorker.js bundle.
//
// require('lzma-native') at module top level triggers
// `require('node-gyp-build')(__dirname)` inside lzma-native's own index.js
// -- aliased to binding-shim.cjs's resolveNativeBinding -- so the dlopen()
// attempt happens as soon as this module loads, before workerData is even
// read. That is deliberate: it is the earliest, most direct test of whether
// dlopen() succeeds inside an eval'd worker.

const { parentPort, workerData } = require('node:worker_threads')
const { createHash } = require('node:crypto')

let lzmaNative
let requireError = null
try {
  lzmaNative = require('lzma-native')
} catch (err) {
  requireError = { message: err.message, stack: err.stack }
}

/** Mirrors decompress.ts's decompressChunk() VZ-branch header reconstruction
 *  (props(5) + uncompressed-size(8, LE) + payload) -- identical to
 *  bench-eval-worker.mjs's task 2 parseVZContainer(). */
function parseVZContainer(buf) {
  if (buf.subarray(0, 2).toString('latin1') !== 'VZ') {
    throw new Error('fixture is not a VZ container (bad magic)')
  }
  if (buf.subarray(-2).toString('latin1') !== 'zv') {
    throw new Error('fixture is not a VZ container (bad footer magic)')
  }
  const props = buf.subarray(7, 12)
  const payload = buf.subarray(12, buf.length - 10)
  const outSize = buf.readUInt32LE(buf.length - 6)
  const size = Buffer.alloc(8)
  size.writeUInt32LE(outSize, 0)
  return Buffer.concat([props, size, payload])
}

function decodeNative(vzBuf) {
  const stream = parseVZContainer(vzBuf)
  return new Promise((resolve, reject) => {
    const decoder = lzmaNative.createStream('aloneDecoder')
    const chunks = []
    decoder.on('data', (d) => chunks.push(d))
    decoder.on('end', () => resolve(Buffer.concat(chunks)))
    decoder.on('error', reject)
    decoder.end(stream)
  })
}

;(async () => {
  if (requireError) {
    parentPort.postMessage({
      dlopenFromEvalWorker: false,
      error: requireError.message,
      stack: requireError.stack,
      stage: 'require(lzma-native)'
    })
    return
  }

  try {
    const vzBuf = Buffer.from(workerData.vzChunkBuffer)
    const t0 = process.hrtime.bigint()
    const decoded = await decodeNative(vzBuf)
    const t1 = process.hrtime.bigint()
    const decodeMs = Number(t1 - t0) / 1e6

    const sha1 = createHash('sha1').update(decoded).digest('hex')
    const sha1Match = sha1 === workerData.expectedSha1

    parentPort.postMessage({
      dlopenFromEvalWorker: true,
      sha1,
      expectedSha1: workerData.expectedSha1,
      sha1Match,
      decodeMs,
      decodedLength: decoded.length
    })
  } catch (err) {
    parentPort.postMessage({
      dlopenFromEvalWorker: false,
      error: err.message,
      stack: err.stack,
      stage: 'decode'
    })
  }
})()
