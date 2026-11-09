/**
 * Spike 045 — how much of the owned Windows library is Steam CEG?
 *
 * For every owned game with a Windows depot, fetch the depot's public manifest
 * (metadata only — no chunks are downloaded) and count files carrying
 * EDepotFileFlag.CustomExecutable (128), the flag Steam uses to mark a file it
 * must run through CEG at install. Validate against XCOM (200510), the one title
 * spike 035–037 proved is CEG.
 *
 * Usage:
 *   node census.mjs [--only <appid,...>] [--concurrency N]
 *
 * Results cache to .cache.json (gitignored) so a re-run resumes; the summary
 * goes to results.json and stdout. Auth reuses spike 001's QR login (its
 * .token.json is gitignored there).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { connectAuthenticated, ownedIds } from '../001-acf-adoption/auth.mjs'
import { decryptFilename } from '../002-steam-user-depot-download/steam-depot.mjs'

const FLAG_DIRECTORY = 64
const FLAG_CUSTOM_EXECUTABLE = 128
const CACHE = new URL('./.cache.json', import.meta.url).pathname
const RESULTS = new URL('./results.json', import.meta.url).pathname

const argv = process.argv.slice(2)
const argOf = (name) => {
  const i = argv.indexOf(name)
  return i === -1 ? null : argv[i + 1]
}
const ONLY = argOf('--only')?.split(',').map(Number) ?? null
const CONCURRENCY = Number(argOf('--concurrency') ?? 4)

const log = (...a) => console.log(...a)
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {}
const saveCache = () => writeFileSync(CACHE, JSON.stringify(cache, null, 1))

const cb = (fn) => new Promise((res, rej) => fn((e, v) => (e ? rej(e) : res(v))))

const { client, licenses } = await connectAuthenticated()
log(`✓ logged on; ${licenses.length} licenses`)
const { apps, depots: ownedDepots } = await ownedIds(client, licenses)

const appIds = ONLY ?? [...apps]
const appinfo = {}
for (let i = 0; i < appIds.length; i += 250) {
  const info = await client.getProductInfo(appIds.slice(i, i + 250), [], true)
  for (const [id, a] of Object.entries(info.apps ?? {})) appinfo[id] = a.appinfo
}

const osList = (d) =>
  String(d?.config?.oslist ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

/** Owned Windows depots that ship base content: no DLC, English or no language. */
function windowsDepots(id, info) {
  const out = []
  for (const [depotId, d] of Object.entries(info?.depots ?? {})) {
    if (!/^\d+$/.test(depotId)) continue
    const os = osList(d)
    if (os.length && !os.includes('windows')) continue
    if (d.dlcappid) continue
    const lang = String(d?.config?.language ?? '').toLowerCase()
    if (lang && lang !== 'english') continue
    const m = d.manifests?.public
    const gid = typeof m === 'object' ? m?.gid : m
    if (!gid) continue
    // Shared redistributable depots (228980 etc.) are owned via their own package
    if (!ownedDepots.has(Number(depotId)) && !d.depotfromapp) continue
    out.push({ depotId: Number(depotId), gid: String(gid), os })
  }
  return out
}

const ContentManifest = await import('steam-user/components/content_manifest.js')
const parseManifest = (ContentManifest.default ?? ContentManifest).parse

async function scanDepot(appId, { depotId, gid }) {
  const key = `${depotId}:${gid}`
  // Failures are cached for the summary but retried on every run
  if (cache[key]?.ok) return cache[key]
  let result
  try {
    const depotKey = await cb((done) => client.getDepotDecryptionKey(appId, depotId, done))
    const raw = await cb((done) => client.getRawManifest(appId, depotId, gid, 'public', done))
    const manifest = parseManifest(raw)
    const files = manifest.files.filter((f) => !(f.flags & FLAG_DIRECTORY))
    const ceg = []
    for (const f of files) {
      if (!(f.flags & FLAG_CUSTOM_EXECUTABLE)) continue
      let name = f.filename
      try {
        name = decryptFilename(f.filename, depotKey.key ?? depotKey)
      } catch {}
      ceg.push(name)
    }
    const exes = files.filter((f) => {
      let n = f.filename
      try {
        n = decryptFilename(f.filename, depotKey.key ?? depotKey)
      } catch {}
      return /\.exe$/i.test(n)
    }).length
    result = { ok: true, files: files.length, exes, ceg }
  } catch (err) {
    result = { ok: false, error: String(err?.message ?? err) }
  }
  cache[key] = result
  saveCache()
  return result
}

const rows = []
const queue = []
for (const id of appIds) {
  const info = appinfo[id]
  const type = String(info?.common?.type ?? '').toLowerCase()
  if (!ONLY && type !== 'game') continue
  const name = info?.common?.name ?? '(unknown)'
  const macNative = Object.values(info?.depots ?? {}).some((d) => osList(d).includes('macos'))
  const depots = windowsDepots(id, info)
  const row = { appId: Number(id), name, macNative, depots: [] }
  rows.push(row)
  for (const d of depots) queue.push({ row, d })
}
log(`✓ ${rows.length} owned games; ${queue.length} Windows depot manifests to read`)

let done = 0
async function worker() {
  while (queue.length) {
    const { row, d } = queue.shift()
    const r = await scanDepot(row.appId, d)
    row.depots.push({ depotId: d.depotId, ...r })
    if (++done % 25 === 0) log(`  … ${done} manifests`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

for (const row of rows) {
  row.ceg = row.depots.flatMap((d) => (d.ok ? d.ceg : []))
  row.unread = row.depots.filter((d) => !d.ok).length
  row.status = !row.depots.length
    ? 'no-windows-depot'
    : row.ceg.length
      ? 'ceg'
      : row.unread === row.depots.length
        ? 'unread'
        : 'clean'
}

const count = (s) => rows.filter((r) => r.status === s).length
const summary = {
  generated: new Date().toISOString(),
  games: rows.length,
  ceg: count('ceg'),
  clean: count('clean'),
  unread: count('unread'),
  noWindowsDepot: count('no-windows-depot'),
  cegTitles: rows
    .filter((r) => r.status === 'ceg')
    .map((r) => ({ appId: r.appId, name: r.name, macNative: r.macNative, files: r.ceg })),
  unreadErrors: [...new Set(rows.flatMap((r) => r.depots.filter((d) => !d.ok).map((d) => d.error)))]
}
writeFileSync(RESULTS, JSON.stringify({ summary, rows }, null, 1))
log(JSON.stringify(summary, null, 2))
client.logOff()
