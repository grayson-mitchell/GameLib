/**
 * Spike 067b, Node side: decrypt + decompress 067a's chunk corpus with
 * production's own functions, single-threaded, and report CPU-seconds per
 * GiB of output. Every output is checked against the chunk's SHA1.
 *
 * First run also writes state/enc/ (each chunk re-encrypted the Steam way
 * with a random throwaway key) so the Rust side decrypts identical bytes.
 */
import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { steamDecrypt } from '../../../src/backend/storeManagers/steam/depot/crypto'
import { decompressChunk, type LzmaModule } from '../../../src/backend/storeManagers/steam/depot/decompress'
import { loadLzmaModule } from '../../../src/backend/storeManagers/steam/depot/lzmaLoader'
import { initHeadless } from '../../../src/backend/logger'

const SPIKE = resolve(__dirname, '..', '..')
const CORPUS = resolve(SPIKE, '..', '067a-node-pipeline-stage-profile', 'state', 'corpus')
const ENC = join(SPIKE, 'state', 'enc')
const PASSES = Number(process.env.PASSES ?? 3)

interface Chunk { name: string; kind: string; sha: string; cb: number; enc: Buffer }

function steamEncrypt(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(16)
  const ivEnc = createCipheriv('aes-256-ecb', key, null)
  ivEnc.setAutoPadding(false)
  const head = Buffer.concat([ivEnc.update(iv), ivEnc.final()])
  const body = createCipheriv('aes-256-cbc', key, iv) // PKCS7 padding on
  return Buffer.concat([head, body.update(plain), body.final()])
}

function prepare(): { key: Buffer; chunks: Chunk[] } {
  mkdirSync(ENC, { recursive: true })
  const keyPath = join(ENC, 'throwaway.key')
  const key = existsSync(keyPath) ? readFileSync(keyPath) : randomBytes(32)
  if (!existsSync(keyPath)) writeFileSync(keyPath, key)
  const chunks: Chunk[] = []
  for (const f of readdirSync(CORPUS).filter((n) => n.endsWith('.json')).sort()) {
    const meta = JSON.parse(readFileSync(join(CORPUS, f), 'utf8'))
    const name = f.replace(/\.json$/, '')
    const encPath = join(ENC, `${name}.enc`)
    let enc: Buffer
    if (existsSync(encPath)) enc = readFileSync(encPath)
    else {
      enc = steamEncrypt(readFileSync(join(CORPUS, `${name}.bin`)), key)
      writeFileSync(encPath, enc)
      writeFileSync(join(ENC, `${name}.json`), JSON.stringify(meta))
    }
    chunks.push({ name, kind: meta.kind, sha: meta.expectedSha, cb: meta.cbOriginal, enc })
  }
  return { key, chunks }
}

async function bench(label: string, chunks: Chunk[], key: Buffer, lzma: LzmaModule, stage: 'decrypt' | 'full') {
  let outBytes = 0
  let bad = 0
  const cpu0 = process.cpuUsage()
  const t0 = performance.now()
  for (let p = 0; p < PASSES; p++) {
    for (const c of chunks) {
      const dec = steamDecrypt(c.enc, key)
      if (stage === 'decrypt') {
        outBytes += dec.length
        continue
      }
      const out = await decompressChunk(dec, lzma, c.cb)
      outBytes += out.length
      if (p === 0 && createHash('sha1').update(out).digest('hex') !== c.sha) bad++
    }
  }
  const cpu = process.cpuUsage(cpu0)
  const cpuS = (cpu.user + cpu.system) / 1e6
  const wallS = (performance.now() - t0) / 1000
  const gib = outBytes / 2 ** 30
  return { label, stage, chunks: chunks.length, passes: PASSES, outMiB: Math.round(outBytes / 2 ** 20), wallS: +wallS.toFixed(2), cpuS: +cpuS.toFixed(2), MiBperS: +(outBytes / 2 ** 20 / wallS).toFixed(1), cpuSecPerGiB: +(cpuS / gib).toFixed(2), sha1Mismatches: bad }
}

async function main() {
  initHeadless(true)
  const { key, chunks } = prepare()
  const native = await loadLzmaModule()
  const pureMod = (await import('lzma')) as unknown as { default?: LzmaModule } & LzmaModule
  const pure = (pureMod.default ?? pureMod) as LzmaModule
  const byKind = (k: string) => chunks.filter((c) => c.kind === k)
  const rows = [
    await bench('aes only (all)', chunks, key, native, 'decrypt'),
    await bench('zip  (production)', byKind('zip'), key, native, 'full'),
    await bench('lzma (lzma-native, production)', byKind('lzma'), key, native, 'full'),
    await bench('lzma (pure-JS lzma, inline fallback)', byKind('lzma'), key, pure, 'full'),
    await bench('all  (production)', chunks, key, native, 'full')
  ]
  const kindOfNative = (native as unknown as { kind?: string }).kind ?? 'unknown'
  const out = { runtime: `node ${process.version}`, lzmaLoaderKind: kindOfNative, rows }
  writeFileSync(join(SPIKE, 'results-node.json'), JSON.stringify(out, null, 2))
  console.table(rows)
}

main().then(
  () => setTimeout(() => process.exit(0), 500),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
