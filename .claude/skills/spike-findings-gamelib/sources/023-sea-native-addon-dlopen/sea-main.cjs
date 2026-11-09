// Spike 023, task 3: the SEA main entry. Reads the bundled worker source
// back out with require('node:sea').getAsset('worker.js', 'utf8'), spawns it
// with new Worker(source, { eval: true, workerData: {...} }) -- the
// production shape (decompressPool.ts's packaged-SEA spawn mode), NOT
// new Worker(path) -- awaits the result, prints a single-line JSON verdict
// on stdout, and process.exit(0) on success / non-zero on any failure.
//
// Also prints sea.isSea() and the Node version so the log proves it really
// ran inside a SEA binary.
//
// Supports two CONTROL modes (argv[2]), used only if the primary ('eval')
// mode's dlopen fails, per the plan's "name the responsible variable"
// requirement:
//   'main-thread' -- dlopen the SAME embedded lzma_native.node asset
//                    directly on the SEA main thread, no worker at all.
//   'file-worker' -- write the bundled worker.js source to a real temp
//                    file and spawn it via new Worker(path), NOT eval'd.
// Both controls hold the SEA + native-addon variables fixed and change only
// the one variable named in the mode, isolating which of {SEA, eval'd
// worker, native addon} is responsible for a failure.

const sea = require('node:sea')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Worker } = require('node:worker_threads')
const { createHash } = require('node:crypto')

const { vzChunkBase64, expectedSha1 } = require('./fixture-embedded.generated.cjs')

const mode = process.argv[2] || 'eval'

function runEvalWorker() {
  const source = sea.getAsset('worker.js', 'utf8')
  return new Promise((resolve, reject) => {
    const worker = new Worker(source, {
      eval: true,
      workerData: {
        vzChunkBuffer: Buffer.from(vzChunkBase64, 'base64'),
        expectedSha1
      }
    })
    worker.on('message', resolve)
    worker.on('error', reject)
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`eval worker stopped with exit code ${code}`))
    })
  })
}

function runFileWorker() {
  const source = sea.getAsset('worker.js', 'utf8')
  const tmpWorkerPath = path.join(
    os.tmpdir(),
    `spike023-file-worker-${process.pid}-${Date.now()}.js`
  )
  fs.writeFileSync(tmpWorkerPath, source)
  return new Promise((resolve, reject) => {
    const worker = new Worker(tmpWorkerPath, {
      workerData: {
        vzChunkBuffer: Buffer.from(vzChunkBase64, 'base64'),
        expectedSha1
      }
    })
    worker.on('message', (msg) => {
      fs.rmSync(tmpWorkerPath, { force: true })
      resolve(msg)
    })
    worker.on('error', (err) => {
      fs.rmSync(tmpWorkerPath, { force: true })
      reject(err)
    })
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`file worker stopped with exit code ${code}`))
    })
  })
}

/** Control (i): dlopen the embedded native addon directly on the SEA MAIN
 *  thread -- no worker_threads involved at all. Uses the identical
 *  getRawAsset()+dlopen() mechanism binding-shim.cjs uses, inlined here
 *  since the main thread never goes through the node-gyp-build alias. */
function runMainThread() {
  return new Promise((resolve) => {
    try {
      const raw = sea.getRawAsset('lzma_native.node')
      const addonPath = path.join(
        os.tmpdir(),
        `spike023-mainthread-${process.pid}-${Date.now()}.node`
      )
      fs.writeFileSync(addonPath, Buffer.from(raw))
      const m = { exports: {} }
      process.dlopen(m, addonPath)
      const lzmaNative = m.exports

      const vzBuf = Buffer.from(vzChunkBase64, 'base64')
      const props = vzBuf.subarray(7, 12)
      const payload = vzBuf.subarray(12, vzBuf.length - 10)
      const outSize = vzBuf.readUInt32LE(vzBuf.length - 6)
      const size = Buffer.alloc(8)
      size.writeUInt32LE(outSize, 0)
      const stream = Buffer.concat([props, size, payload])

      const decoder = lzmaNative.createStream('aloneDecoder')
      const chunks = []
      const t0 = process.hrtime.bigint()
      decoder.on('data', (d) => chunks.push(d))
      decoder.on('end', () => {
        const t1 = process.hrtime.bigint()
        const decoded = Buffer.concat(chunks)
        const sha1 = createHash('sha1').update(decoded).digest('hex')
        resolve({
          dlopenFromEvalWorker: true, // main-thread dlopen succeeded (field name kept for report symmetry)
          sha1,
          expectedSha1,
          sha1Match: sha1 === expectedSha1,
          decodeMs: Number(t1 - t0) / 1e6,
          decodedLength: decoded.length
        })
      })
      decoder.on('error', (err) =>
        resolve({ dlopenFromEvalWorker: false, error: err.message, stage: 'decode' })
      )
      decoder.end(stream)
    } catch (err) {
      resolve({ dlopenFromEvalWorker: false, error: err.message, stack: err.stack, stage: 'dlopen' })
    }
  })
}

async function main() {
  const isSea = sea.isSea()
  console.log(
    JSON.stringify({
      task: 'sea-main-startup',
      isSea,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      mode
    })
  )

  let result
  let runError = null
  try {
    if (mode === 'main-thread') {
      result = await runMainThread()
    } else if (mode === 'file-worker') {
      result = await runFileWorker()
    } else {
      result = await runEvalWorker()
    }
  } catch (err) {
    runError = err
    result = { dlopenFromEvalWorker: false, error: err.message, stack: err.stack, stage: 'spawn' }
  }

  const verdict = {
    task: 'sea-main-verdict',
    mode,
    isSea,
    nodeVersion: process.version,
    dlopenFromEvalWorker: result.dlopenFromEvalWorker === true,
    sha1Match: result.sha1Match === true,
    decodeMs: typeof result.decodeMs === 'number' ? result.decodeMs : null,
    error: result.error || null,
    stage: result.stage || null
  }
  console.log(JSON.stringify(verdict))

  if (runError || !verdict.dlopenFromEvalWorker || !verdict.sha1Match) {
    process.exit(1)
  }
  process.exit(0)
}

main()
