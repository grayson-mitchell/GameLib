/**
 * Spike 002 — download a complete game in-process and prove it byte-for-byte.
 *
 * Uses steam-user for the hard parts (CM auth, PICS, depot key, raw manifest,
 * content servers) and our own primitives for the two things steam-user gets
 * wrong (filename decryption, chunk decrypt+decompress). See steam-depot.mjs.
 *
 * GROUND TRUTH: WazHack is already installed by the real Steam client, so we can
 * diff our download against Steam's own bytes. Output goes to a SCRATCH dir —
 * nothing touches steamapps/.
 *
 * Usage: node download.mjs [--pure-js]
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { connectAuthenticated } from '../001-acf-adoption/auth.mjs'
import { decryptFilename, fetchChunk, sha1 } from './steam-depot.mjs'

const APP_ID = 264160
const DEPOT = 264162
const PURE_JS = process.argv.includes('--pure-js')
const CONCURRENCY = 8

const OUT = join(tmpdir(), 'gamelib-spike-002', String(APP_ID))
const STEAM_DIR = `${homedir()}/Library/Application Support/Steam/steamapps/common/WazHack`

const log = (...a) => console.log(...a)
const hr = () => log('─'.repeat(78))
const mb = (n) => (n / 1048576).toFixed(1)

// LZMA backend under test. lzma-native is a NATIVE module and cuts against the
// project's deliberate pure-JS constraint, so we measure both.
const lzma = PURE_JS
  ? (await import('lzma')).default ?? (await import('lzma'))
  : (await import('lzma-native')).default ?? (await import('lzma-native'))
log(`\nLZMA backend: ${PURE_JS ? 'lzma (pure JS)' : 'lzma-native (native module)'}\n`)

const { client } = await connectAuthenticated()
log(`✓ authenticated as ${client.steamID?.getSteamID64()}`)

const info = await client.getProductInfo([APP_ID], [], true)
const appinfo = info.apps[APP_ID].appinfo
const gid = appinfo.depots[DEPOT].manifests.public.gid

const key = await new Promise((res, rej) =>
  client.getDepotDecryptionKey(APP_ID, DEPOT, (e, k) => (e ? rej(e) : res(k)))
)
log(`✓ depot key for ${DEPOT}`)

const ContentManifest = await import('steam-user/components/content_manifest.js')
const raw = await new Promise((res, rej) =>
  client.getRawManifest(APP_ID, DEPOT, gid, 'public', (e, m) => (e ? rej(e) : res(m)))
)
const manifest = (ContentManifest.default ?? ContentManifest).parse(raw)

// Decrypt filenames OURSELVES — steam-user truncates them.
for (const f of manifest.files) f.filename = decryptFilename(f.filename, key)

const files = manifest.files.filter((f) => !(f.flags & 64))
const totalBytes = files.reduce((s, f) => s + Number(f.size), 0)
const totalChunks = files.reduce((s, f) => s + (f.chunks?.length ?? 0), 0)

log(`✓ manifest: ${files.length} files, ${totalChunks} chunks, ${mb(totalBytes)} MB`)
log(`  longest filename: ${Math.max(...files.map((f) => f.filename.length))} chars (steam-user capped these at block boundaries)\n`)

const servers = await new Promise((res, rej) =>
  client.getContentServers((e, s) => (e ? rej(e) : res(s)))
)
const hosts = servers.map((s) => s.Host ?? s.vhost)
log(`✓ ${hosts.length} content servers\n`)

hr()
log(`DOWNLOADING — ${files.length} files, concurrency ${CONCURRENCY}\n`)

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

let doneBytes = 0
let doneFiles = 0
let lastPct = -1
const failures = []
const tStart = Date.now()

async function downloadFile(file, i) {
  const rel = file.filename.replace(/\\/g, '/')
  const dest = join(OUT, rel)
  mkdirSync(dirname(dest), { recursive: true })

  if (!file.chunks?.length || Number(file.size) === 0) {
    writeFileSync(dest, Buffer.alloc(0))
    return
  }

  // Reassemble the file from its chunks, each placed at its declared offset.
  const buf = Buffer.alloc(Number(file.size))
  for (const chunk of file.chunks) {
    chunk.attemptSeed = i % hosts.length // spread initial load across servers
    const data = await fetchChunk(hosts, DEPOT, chunk, key, lzma)
    data.copy(buf, Number(chunk.offset))
  }

  // Whole-file integrity, independent of the per-chunk checks.
  const expect = Buffer.isBuffer(file.sha_content)
    ? file.sha_content.toString('hex')
    : String(file.sha_content)
  const got = sha1(buf)
  if (got !== expect) throw new Error(`file sha1 mismatch: ${got} != ${expect}`)

  writeFileSync(dest, buf)

  doneBytes += buf.length
  doneFiles++
  const pct = Math.floor((doneBytes / totalBytes) * 100)
  if (pct >= lastPct + 20) {
    const secs = (Date.now() - tStart) / 1000
    log(
      `  ${String(pct).padStart(3)}%  ${String(doneFiles).padStart(3)}/${files.length} files  ` +
        `${mb(doneBytes).padStart(6)} MB  ${(doneBytes / 1048576 / secs).toFixed(1)} MB/s`
    )
    lastPct = pct
  }
}

const queue = files.map((f, i) => [f, i])
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const [f, i] = queue.shift()
      try {
        await downloadFile(f, i)
      } catch (err) {
        failures.push({ file: f.filename, error: err.message })
      }
    }
  })
)

const elapsed = (Date.now() - tStart) / 1000
log(`\n  ${doneFiles}/${files.length} files in ${elapsed.toFixed(1)}s`)
log(`  throughput: ${(totalBytes / 1048576 / elapsed).toFixed(1)} MB/s  (${PURE_JS ? 'pure-JS LZMA' : 'native LZMA'})`)
if (failures.length) {
  log(`\n  ✗ ${failures.length} failures:`)
  for (const f of failures.slice(0, 5)) log(`      ${f.file}: ${f.error}`)
}

hr()
log('VERIFY — diff every file against the bytes Steam itself downloaded\n')

let identical = 0
let missingOnSteamSide = 0
const differs = []
for (const f of files) {
  const rel = f.filename.replace(/\\/g, '/')
  const ours = join(OUT, rel)
  const theirs = join(STEAM_DIR, rel)
  if (!existsSync(theirs)) {
    missingOnSteamSide++
    continue
  }
  if (!existsSync(ours)) {
    differs.push({ file: rel, why: 'we failed to download it' })
    continue
  }
  if (sha1(readFileSync(ours)) === sha1(readFileSync(theirs))) identical++
  else differs.push({ file: rel, why: 'CONTENT DIFFERS' })
}

log(`  ${identical}/${files.length - missingOnSteamSide} files BYTE-IDENTICAL to Steam's own install`)
if (missingOnSteamSide) log(`  (${missingOnSteamSide} not present on the Steam side — skipped)`)
for (const d of differs.slice(0, 5)) log(`    ✗ ${d.file}: ${d.why}`)

hr()
const pass = failures.length === 0 && differs.length === 0 && identical > 0
log(
  pass
    ? `\n✓ VALIDATED — steam-user downloaded a complete game IN-PROCESS.\n` +
        `  Every file SHA1-verified and byte-identical to Steam's own download.\n` +
        `  No .NET, no DepotDownloader, no second auth stack.\n`
    : '\n✗ FAILED — see errors above.\n'
)
log(`  output: ${OUT}`)
log(`  clean:  rm -rf ${OUT}\n`)

client.logOff()
process.exit(pass ? 0 : 1)
