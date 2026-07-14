/**
 * Spike 002 — isolate the download failures.
 *
 * Symptoms: filenames appear truncated ("...UnityEngine.Substan") and downloads
 * fail with "Illegal starting byte: 152" / "Illegal range: Truncated data".
 *
 * Two candidate causes:
 *   A. The manifest's filenames really ARE truncated (bad filename decryption).
 *   B. Chunk DECOMPRESSION is failing — i.e. the pure-JS LZMA fallback is broken
 *      and lzma-native is effectively mandatory.
 *
 * This distinguishes them: dump raw manifest filenames, then try a single chunk.
 */

import { connectAuthenticated } from '../001-acf-adoption/auth.mjs'

const APP_ID = 264160
const DEPOT = 264162

const { client } = await connectAuthenticated()
const info = await client.getProductInfo([APP_ID], [], true)
const gid = info.apps[APP_ID].appinfo.depots[DEPOT].manifests.public.gid

const manifest = await new Promise((res, rej) =>
  client.getManifest(APP_ID, DEPOT, gid, 'public', (e, m) => (e ? rej(e) : res(m)))
)

const files = manifest.files
console.log(`\nmanifest: ${files.length} entries\n`)

console.log('=== A. are filenames truncated? (raw, with lengths) ===\n')
for (const f of files.slice(0, 8)) {
  const isDir = !!(f.flags & 64)
  console.log(`  len=${String(f.filename.length).padStart(3)} dir=${isDir ? 'Y' : 'n'} chunks=${String(f.chunks?.length ?? 0).padStart(3)} size=${String(f.size).padStart(10)}  ${JSON.stringify(f.filename)}`)
}

// A real Unity mac app has predictable long paths. If EVERY filename is <= some
// bound, they are being cut.
const lens = files.map((f) => f.filename.length)
console.log(`\n  filename length: min=${Math.min(...lens)} max=${Math.max(...lens)}`)
console.log(`  → if max is a suspiciously round bound, decryption is truncating.\n`)

console.log('=== B. can we fetch and decompress ONE chunk? ===\n')
const target = files.find((f) => !(f.flags & 64) && f.chunks?.length === 1 && Number(f.size) > 0)
console.log(`  file : ${JSON.stringify(target.filename)}`)
console.log(`  size : ${target.size}`)
const chunk = target.chunks[0]
console.log(`  chunk: sha=${Buffer.isBuffer(chunk.sha) ? chunk.sha.toString('hex') : chunk.sha}`)
console.log(`         cb_original=${chunk.cb_original} cb_compressed=${chunk.cb_compressed}\n`)

try {
  const data = await new Promise((res, rej) =>
    client.downloadChunk(APP_ID, DEPOT, chunk.sha, (e, d) => (e ? rej(e) : res(d)))
  )
  console.log(`  ✓ downloadChunk OK — ${data.length} bytes decompressed`)
  console.log(`    expected cb_original: ${chunk.cb_original}`)
  console.log(`    match: ${data.length === Number(chunk.cb_original) ? 'YES' : 'NO'}`)
} catch (err) {
  console.log(`  ✗ downloadChunk FAILED: ${err.message}`)
  console.log(`\n  → decompression is the problem, not the filenames.`)
}

client.logOff()
process.exit(0)
