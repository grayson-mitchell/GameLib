#!/usr/bin/env node
// Spike 023, task 2(e): a plain-`node` (NOT SEA) harness that spawns a worker
// via `new Worker(source, { eval: true })` where `source` is an in-memory
// string -- exactly mirroring decompressPool.ts's packaged-SEA spawn mode
// (resolveWorkerSpec/spawnWorker: `{ kind: 'source', value: <string> }` ->
// `new Worker(source, { eval: true })`).
//
// Inside that eval'd worker: decode fixtures/real-vz-chunk.bin first with
// `lzma-native` (createStream('aloneDecoder'), per RESEARCH.md's verified
// example) and then with the repo's pure-JS `lzma`, asserting the two
// outputs are byte-identical via Buffer.compare(...) === 0, and timing each
// over a median of at least 5 runs.
//
// This isolates the `{ eval: true }` + native-addon variable from the SEA
// variable -- task 3's SEA harness builds on top of this once this passes.

import { Worker } from 'node:worker_threads'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..')
const RUN_LOG_PATH = join(__dirname, 'run.log')

const require = createRequire(import.meta.url)

function log(line) {
  console.log(line)
  appendFileSync(RUN_LOG_PATH, line + '\n')
}

function logHeader(title) {
  const stamp = new Date().toISOString()
  log(`\n===== ${stamp} :: ${title} =====`)
}

// ---------------------------------------------------------------------------
// Locate the two decoder packages this worker will require() BY ABSOLUTE
// PATH (not by bare specifier) -- an eval'd worker has no __filename of its
// own, so bare-specifier require() resolution inside it is not something to
// rely on; resolving on the main thread and injecting absolute paths via
// workerData sidesteps that ambiguity entirely.
// ---------------------------------------------------------------------------
const lzmaNativePath = require.resolve('lzma-native')
const lzmaPurePath = join(REPO_ROOT, 'node_modules', 'lzma', 'index.js')
if (!existsSync(lzmaPurePath)) {
  throw new Error(`Cannot find this repo's pinned lzma package at ${lzmaPurePath}`)
}

const fixturePath = join(__dirname, 'fixtures', 'real-vz-chunk.bin')
const fixtureMetaPath = join(__dirname, 'fixtures', 'real-vz-chunk.meta.json')
if (!existsSync(fixturePath) || !existsSync(fixtureMetaPath)) {
  throw new Error(
    `Missing fixture at ${fixturePath} -- run make-chunk.mjs first (task 2d).`
  )
}
const fixtureMeta = JSON.parse(readFileSync(fixtureMetaPath, 'utf8'))
const vzChunkBuffer = readFileSync(fixturePath)

// ---------------------------------------------------------------------------
// The eval'd worker's SOURCE, as an in-memory string -- the production
// shape (decompressPool.ts's SEA-path worker spawn), reproduced here without
// any SEA packaging involved. Runs as CommonJS (an eval'd Worker source has
// no file extension to infer ESM from, matching decompressWorker.ts's own
// esbuild --format=cjs output).
// ---------------------------------------------------------------------------
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads')
const { createHash } = require('node:crypto')

const lzmaNative = require(workerData.lzmaNativePath)
const lzmaPure = require(workerData.lzmaPurePath)

/** Mirrors decompress.ts's decompressChunk() VZ-branch header reconstruction
 *  exactly: props(5) + uncompressed-size(8, LE) + payload, an lzma_alone
 *  stream, handed to whichever decoder backend is under test. */
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

function decodePureJs(vzBuf) {
  const stream = parseVZContainer(vzBuf)
  return new Promise((resolve, reject) => {
    lzmaPure.decompress(stream, (result, err) => {
      if (err) return reject(err)
      resolve(Buffer.from(result))
    })
  })
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

async function timeMedian(fn, buf, runs) {
  const times = []
  let lastOut = null
  for (let i = 0; i < runs; i++) {
    const t0 = process.hrtime.bigint()
    lastOut = await fn(buf)
    const t1 = process.hrtime.bigint()
    times.push(Number(t1 - t0) / 1e6)
  }
  return { medianMs: median(times), allMs: times, lastOut }
}

;(async () => {
  const vzBuf = Buffer.from(workerData.vzChunkBuffer)

  const nativeOut = await decodeNative(vzBuf)
  const pureOut = await decodePureJs(vzBuf)
  const byteIdentical = Buffer.compare(nativeOut, pureOut) === 0
  const sha1Native = createHash('sha1').update(nativeOut).digest('hex')
  const sha1Match = sha1Native === workerData.expectedSha1

  const RUNS = 5
  const nativeTiming = await timeMedian(decodeNative, vzBuf, RUNS)
  const pureTiming = await timeMedian(decodePureJs, vzBuf, RUNS)

  parentPort.postMessage({
    byteIdentical,
    sha1Match,
    sha1Native,
    expectedSha1: workerData.expectedSha1,
    nativeMs: nativeTiming.medianMs,
    pureJsMs: pureTiming.medianMs,
    nativeAllMs: nativeTiming.allMs,
    pureJsAllMs: pureTiming.allMs,
    speedup: pureTiming.medianMs / nativeTiming.medianMs,
    runs: RUNS,
    uncompressedSize: nativeOut.length
  })
})().catch((err) => {
  parentPort.postMessage({ error: err.message, stack: err.stack })
})
`

async function main() {
  logHeader('bench-eval-worker.mjs invocation')
  log(`[bench] fixture: ${fixturePath}`)
  log(`[bench] fixture meta: ${JSON.stringify(fixtureMeta)}`)
  log(`[bench] lzma-native resolved at: ${lzmaNativePath}`)
  log(`[bench] pure-JS lzma resolved at: ${lzmaPurePath}`)
  log(`[bench] worker spawn mode: new Worker(source, { eval: true }) -- production packaged-SEA shape`)

  const result = await new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        vzChunkBuffer,
        lzmaNativePath,
        lzmaPurePath,
        expectedSha1: fixtureMeta.sha1Uncompressed
      }
    })
    worker.on('message', (msg) => resolve(msg))
    worker.on('error', reject)
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`worker stopped with exit code ${code}`))
    })
  })

  if (result.error) {
    log(`[bench] WORKER ERROR: ${result.error}`)
    log(result.stack || '')
    process.exit(1)
  }

  log(`[bench] result: ${JSON.stringify(result)}`)

  const verdict = {
    task: 'bench-eval-worker',
    byteIdentical: result.byteIdentical,
    sha1Match: result.sha1Match,
    pureJsMs: result.pureJsMs,
    nativeMs: result.nativeMs,
    speedup: result.speedup,
    runs: result.runs,
    uncompressedSize: result.uncompressedSize
  }
  log(`[bench] JSON_VERDICT: ${JSON.stringify(verdict)}`)

  if (!result.byteIdentical || !result.sha1Match) {
    log('[bench] FAILED -- native and pure-JS outputs are NOT byte-identical, or sha1 mismatch')
    process.exit(1)
  }

  log('[bench] PASSED')
  process.exit(0)
}

main().catch((err) => {
  log(`[bench] FATAL: ${err.stack || err.message}`)
  process.exit(1)
})
