/**
 * Spike 045 follow-up — for each CEG title, is its Mac build 32-bit?
 *
 * A CEG title only reaches the Windows/CEG path when GameLib installs its Windows
 * build. Every CEG title in census.mjs's results has a macOS depot, so what
 * matters is whether that Mac build runs on Apple silicon at all (i386 doesn't).
 *
 * For each title: read its Mac depot manifest, pick the largest file under
 * `*.app/Contents/MacOS/`, fetch only that file's first chunk, and read the
 * Mach-O header (thin i386 / x86_64 / arm64, or a fat binary's arch list).
 *
 * Usage: node macarch.mjs [appid,...]   (default: the CEG titles in results.json)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { connectAuthenticated } from '../001-acf-adoption/auth.mjs'
import { decryptFilename, fetchChunk } from '../002-steam-user-depot-download/steam-depot.mjs'

const lzma = (await import('lzma')).default ?? (await import('lzma'))
const ContentManifest = await import('steam-user/components/content_manifest.js')
const parseManifest = (ContentManifest.default ?? ContentManifest).parse
const cb = (fn) => new Promise((res, rej) => fn((e, v) => (e ? rej(e) : res(v))))

const results = JSON.parse(readFileSync(new URL('./results.json', import.meta.url), 'utf8'))
const appIds = process.argv[2]
  ? process.argv[2].split(',').map(Number)
  : results.summary.cegTitles.map((t) => t.appId)

const CPU = { 7: 'i386', 0x01000007: 'x86_64', 0x0100000c: 'arm64', 18: 'ppc', 0x01000012: 'ppc64' }
function machoArchs(buf) {
  const le = buf.readUInt32LE(0)
  const be = buf.readUInt32BE(0)
  if (le === 0xfeedface || le === 0xfeedfacf) return [CPU[buf.readInt32LE(4) >>> 0] ?? `cpu ${buf.readInt32LE(4)}`]
  if (be === 0xcafebabe || be === 0xcafebabf) {
    const n = buf.readUInt32BE(4)
    const step = be === 0xcafebabe ? 20 : 32
    return Array.from({ length: n }, (_, i) => CPU[buf.readUInt32BE(8 + i * step)] ?? 'cpu?')
  }
  return [`not Mach-O (magic ${be.toString(16)})`]
}

const osList = (d) => String(d?.config?.oslist ?? '').toLowerCase().split(',').map((s) => s.trim())

const { client } = await connectAuthenticated()
const servers = await cb((done) => client.getContentServers(done))
const hosts = servers.map((s) => s.Host ?? s.vhost)
const info = await client.getProductInfo(appIds, [], true)

const out = []
for (const appId of appIds) {
  const appinfo = info.apps[appId]?.appinfo
  const row = { appId, name: appinfo?.common?.name, depots: [] }
  for (const [depotId, d] of Object.entries(appinfo?.depots ?? {})) {
    if (!/^\d+$/.test(depotId) || !osList(d).includes('macos') || d.dlcappid) continue
    const lang = String(d?.config?.language ?? '').toLowerCase()
    if (lang && lang !== 'english') continue
    const m = d.manifests?.public
    const gid = typeof m === 'object' ? m?.gid : m
    if (!gid) continue
    try {
      const key = await cb((done) => client.getDepotDecryptionKey(appId, Number(depotId), done))
      const raw = await cb((done) => client.getRawManifest(appId, Number(depotId), gid, 'public', done))
      const manifest = parseManifest(raw)
      for (const f of manifest.files) {
        try {
          f.filename = decryptFilename(f.filename, key)
        } catch {}
      }
      const bins = manifest.files
        .filter((f) => !(f.flags & 64) && /\.app[\\/]Contents[\\/]MacOS[\\/][^\\/]+$/.test(f.filename))
        .sort((a, b) => Number(b.size) - Number(a.size))
      if (!bins.length) {
        row.depots.push({ depotId, note: 'no .app/Contents/MacOS binary in this depot' })
        continue
      }
      const bin = bins[0]
      const first = [...bin.chunks].sort((a, b) => Number(a.offset) - Number(b.offset))[0]
      const data = await fetchChunk(hosts, Number(depotId), first, key, lzma)
      row.depots.push({ depotId, binary: bin.filename, archs: machoArchs(data) })
    } catch (err) {
      row.depots.push({ depotId, error: String(err?.message ?? err) })
    }
  }
  out.push(row)
  console.log(JSON.stringify(row))
}
writeFileSync(new URL('./macarch.json', import.meta.url), JSON.stringify(out, null, 1))
client.logOff()
