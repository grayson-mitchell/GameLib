// Micro-benchmark: pure-JS `lzma` (LZMA-JS v2.3.2) decompress throughput vs native zlib.
// Simulates a ~1MB decompressed Steam depot chunk.
import { createRequire } from 'node:module'
import zlib from 'node:zlib'

const require = createRequire('/Users/graysonmitchell/Projects/GameLib/package.json')
const lzmaPkg = require('lzma')
const lzma = lzmaPkg.default ?? lzmaPkg

// Build ~1MB of semi-realistic, moderately-compressible data (game assets ~2:1).
const SIZE = 1024 * 1024
const src = Buffer.alloc(SIZE)
for (let i = 0; i < SIZE; i++) {
  // mix of repetition (compressible) and noise
  src[i] = i % 64 < 40 ? (i % 40) : Math.floor(Math.random() * 256)
}

const compress = (buf) =>
  new Promise((res, rej) => lzma.compress(buf, 6, (r, e) => (e ? rej(e) : res(Buffer.from(r)))))
const decompress = (buf) =>
  new Promise((res, rej) => lzma.decompress(buf, (r, e) => (e ? rej(e) : res(Buffer.from(r)))))

console.log(`payload: ${(SIZE / 1024 / 1024).toFixed(2)} MB decompressed/chunk`)

console.log('compressing sample (one-time)...')
const comp = await compress(src)
console.log(`compressed to ${(comp.length / 1024).toFixed(0)} KB (ratio ${(SIZE / comp.length).toFixed(2)}:1)`)

// --- LZMA-JS decompress throughput (single-threaded, main thread) ---
const N = 30
let t0 = performance.now()
for (let i = 0; i < N; i++) await decompress(comp)
let secs = (performance.now() - t0) / 1000
const lzmaMBs = (N * SIZE) / 1024 / 1024 / secs
console.log(`\nLZMA-JS decompress: ${N} x 1MB in ${secs.toFixed(2)}s => ${lzmaMBs.toFixed(1)} MB/s (single thread)`)

// --- native zlib inflate throughput (reference) ---
const zcomp = zlib.deflateRawSync(src)
t0 = performance.now()
for (let i = 0; i < N; i++) zlib.inflateRawSync(zcomp)
secs = (performance.now() - t0) / 1000
const zMBs = (N * SIZE) / 1024 / 1024 / secs
console.log(`native zlib inflate: ${N} x 1MB in ${secs.toFixed(2)}s => ${zMBs.toFixed(1)} MB/s`)

// --- projections ---
const cores = (await import('node:os')).cpus().length
console.log(`\n--- projection for a 15 GB game (all-LZMA worst case) ---`)
console.log(`single-thread LZMA-JS:        ${(15 * 1024 / lzmaMBs / 60).toFixed(1)} min of pure decompress`)
console.log(`${cores}-worker pool (ideal):        ${(15 * 1024 / (lzmaMBs * cores) / 60).toFixed(1)} min`)
console.log(`native-LZMA equiv (~zlib-ish): ~${(15 * 1024 / zMBs / 60).toFixed(1)} min (if we swapped to a native codec)`)
