// Spike 076 stage 1: for each stale bridge install (070's six), get request codes for the
// INSTALLED and the PUBLIC manifest GID, fetch both raw manifests from the CDN, and hand them to
// the Rust diff (production parser) with the depot key on stdin. Keys/codes never printed or saved.
// usage (macOS, inside the wrap): ../071a-cm-crate-steamroom/run-authed.sh node stage1.mjs <vault>
import SteamUser from 'steam-user'
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs'
import { spawnSync } from 'child_process'
import { homedir } from 'os'
const here = (p) => new URL(p, import.meta.url).pathname
const token = JSON.parse(readFileSync(process.argv[2], 'utf8'))['steam-refresh-token']
const only = process.argv[3]
const rows = readFileSync(here('../070-bridge-games-stay-stale/compare.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter((r) => r.stale && (!only || String(r.appid) === only))
const LOG = here('runs/stage1.log'); const RES = here('runs/stage1.jsonl')
const t0 = Date.now()
const log = (...a) => { const l = `[${((Date.now() - t0) / 1000).toFixed(1)}s] ${a.join(' ')}`; console.error(l); appendFileSync(LOG, l + '\n') }
const c = new SteamUser({ enablePicsCache: false, autoRelogin: false })
c.on('error', (e) => { log('client error', e.message); process.exit(1) })
const licenses = new Promise((r) => c.once('licenses', r))
c.logOn({ refreshToken: token })
await new Promise((r) => c.once('loggedOn', r)); await licenses
log(`logged on; ${rows.length} stale installs`)
const bottles = `${homedir()}/Library/Application Support/CrossOver/Bottles`
async function fetchRaw(appid, depot, gid, servers) {
  let rc
  try { rc = (await c.getManifestRequestCode(appid, depot, gid, 'public')).requestCode }
  catch (e) { return { ok: false, stage: 'requestCode', err: e.message, eresult: e.eresult } }
  if (!rc || rc === '0') return { ok: false, stage: 'requestCode', err: `empty code (${rc})` }
  for (const s of servers.slice(0, 4)) {
    const url = `${s.https_support === 'mandatory' ? 'https' : 'http'}://${s.Host}/depot/${depot}/manifest/${gid}/5/${rc}`
    try {
      const res = await fetch(url, { headers: { Host: s.vhost || s.Host } })
      if (!res.ok) { log(`  ${gid} via ${s.Host}: HTTP ${res.status}`); continue }
      const buf = Buffer.from(await res.arrayBuffer())
      const path = here(`out/${depot}_${gid}.raw`); writeFileSync(path, buf)
      return { ok: true, path, bytes: buf.length, host: s.Host }
    } catch (e) { log(`  ${gid} via ${s.Host}: ${e.message}`) }
  }
  return { ok: false, stage: 'cdn', err: 'all hosts failed' }
}
for (const r of rows) {
  const depot = Object.keys(r.depots)[0]; const oldGid = r.depots[depot]; const newGid = r.publicGids[depot]
  log(`${r.appid} ${r.name}: depot ${depot} ${oldGid} -> ${newGid}`)
  const { key } = await c.getDepotDecryptionKey(r.appid, Number(depot))
  const { servers } = await c.getContentServers(r.appid)
  const o = await fetchRaw(r.appid, Number(depot), oldGid, servers)
  const n = await fetchRaw(r.appid, Number(depot), newGid, servers)
  log(`  old: ${o.ok ? `ok ${o.bytes} B` : `FAIL ${o.stage} ${o.err} eresult=${o.eresult}`}; new: ${n.ok ? `ok ${n.bytes} B` : `FAIL ${n.stage} ${n.err}`}`)
  const row = { appid: r.appid, name: r.name, depot, oldGid, newGid, oldFetch: { ...o, path: undefined }, newFetch: { ...n, path: undefined } }
  if (o.ok && n.ok) {
    const installDir = `${bottles}/GameLibSteamBridge-${r.appid}/drive_c/Program Files (x86)/Steam/steamapps/common/${r.installdir}`
    if (!existsSync(installDir)) log('  install dir missing!')
    const s = Date.now()
    const p = spawnSync(here('target/release/spike-076-delta'), { input: JSON.stringify({ keyHex: key.toString('hex'), old: o.path, new: n.path, installDir }), maxBuffer: 1 << 26 })
    if (p.status !== 0) log('  diff failed', p.stderr.toString().slice(0, 400))
    else { row.diff = JSON.parse(p.stdout.toString()); const b = row.diff.bytes, f = row.diff.files
      log(`  diff ${Date.now() - s}ms: files ${f.unchanged}= ${f.changed}~ ${f.added}+ ${f.removed}-; full ${(b.fullDownloadCompressed / 2 ** 20).toFixed(1)} MiB, file-level ${(b.fileLevelDeltaCompressed / 2 ** 20).toFixed(1)} MiB, chunk-level ${(b.chunkLevelDeltaCompressed / 2 ** 20).toFixed(1)} MiB; local mismatch ${row.diff.local.mismatch.length}, missing ${row.diff.local.missing}, unowned ${row.diff.local.unownedCount}`) }
  }
  appendFileSync(RES, JSON.stringify(row) + '\n')
}
c.logOff(); setTimeout(() => process.exit(0), 1000)
