// Spike 076 stage 2: chunk-level delta on an APFS clone of a stale bridge install.
// Reuses stage 1's raw manifests in out/. usage: node stage2.mjs <vault> <appid>
import SteamUser from 'steam-user'
import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { spawnSync, execFileSync } from 'child_process'
import { homedir } from 'os'
const here = (p) => new URL(p, import.meta.url).pathname
const [vault, appid] = process.argv.slice(2)
const r = readFileSync(here('runs/stage1.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).find((x) => String(x.appid) === appid)
const meta = readFileSync(here('../070-bridge-games-stay-stale/compare.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).find((x) => String(x.appid) === appid)
const LOG = here('runs/stage2.log'); const t0 = Date.now()
const log = (...a) => { const l = `[${appid} ${((Date.now() - t0) / 1000).toFixed(1)}s] ${a.join(' ')}`; console.error(l); appendFileSync(LOG, l + '\n') }
const src = `${homedir()}/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-${appid}/drive_c/Program Files (x86)/Steam/steamapps/common/${meta.installdir}`
const clone = here(`out/clone-${appid}`); const chunkDir = here(`out/chunks-${appid}`)
rmSync(clone, { recursive: true, force: true }); mkdirSync(chunkDir, { recursive: true })
execFileSync('cp', ['-cR', src, clone]); log(`cloned (APFS) ${meta.name} -> out/clone-${appid}`)
// Edge test: CORRUPT="<relpath>@<off>,<off>.." flips bytes in a clone file so a local source chunk fails its SHA1
if (process.env.CORRUPT) { const [rel, offs] = process.env.CORRUPT.split('@'); const { openSync, writeSync, closeSync } = await import('fs'); const fd = openSync(`${clone}/${rel}`, 'r+'); for (const o of offs.split(',')) writeSync(fd, Buffer.from([0xa5, 0x5a, 0xa5, 0x5a]), 0, 4, Number(o)); closeSync(fd); log(`CORRUPT ${rel} at ${offs}`) }
const c = new SteamUser({ enablePicsCache: false, autoRelogin: false })
c.logOn({ refreshToken: JSON.parse(readFileSync(vault, 'utf8'))['steam-refresh-token'] })
await new Promise((res) => c.once('loggedOn', res))
const { key } = await c.getDepotDecryptionKey(Number(appid), Number(r.depot))
const { servers } = await c.getContentServers(Number(appid))
const rust = (mode) => {
  const p = spawnSync(here('target/release/apply'), { input: JSON.stringify({ mode, keyHex: key.toString('hex'), old: here(`out/${r.depot}_${r.oldGid}.raw`), new: here(`out/${r.depot}_${r.newGid}.raw`), root: clone, chunkDir }), maxBuffer: 1 << 28 })
  if (p.stderr.length) log('rust stderr:', p.stderr.toString().slice(0, 600))
  return JSON.parse(p.stdout.toString())
}
const plan = rust('plan')
log(`plan ${plan.ms}ms: ${plan.workFiles} files, local reuse ${(plan.localReuseBytes / 2 ** 20).toFixed(1)} MiB, rejected-by-sha ${plan.localCandidatesRejectedBySha}, CDN ${plan.cdnChunks} chunks / ${(plan.cdnCompressedBytes / 2 ** 20).toFixed(1)} MiB`)
const hosts = servers.filter((s) => s.type === 'CDN' || s.type === 'SteamCache').slice(0, 6)
let i = 0, got = 0, fetched = 0; const ft = Date.now()
async function worker(w) {
  while (i < plan.cdn.length) {
    const sha = plan.cdn[i++]; if (existsSync(`${chunkDir}/${sha}`)) { got++; continue }
    for (let a = 0; a < 6; a++) {
      const s = hosts[(w + a) % hosts.length]
      try {
        const res = await fetch(`${s.https_support === 'mandatory' ? 'https' : 'http'}://${s.Host}/depot/${r.depot}/chunk/${sha}`, { headers: { Host: s.vhost || s.Host } })
        if (!res.ok) continue
        const b = Buffer.from(await res.arrayBuffer()); writeFileSync(`${chunkDir}/${sha}`, b); fetched += b.length; got++; break
      } catch {}
    }
  }
}
await Promise.all(Array.from({ length: 16 }, (_, w) => worker(w)))
log(`fetched ${got}/${plan.cdn.length} chunks, ${(fetched / 2 ** 20).toFixed(1)} MiB in ${((Date.now() - ft) / 1000).toFixed(1)} s`)
c.logOff()
const ap = rust('apply')
log(`apply: ${JSON.stringify({ ...ap, verify: ap.verify && { ok: ap.verify.ok, of: ap.verify.of, bad: ap.verify.bad } })}`)
appendFileSync(here('runs/stage2.jsonl'), JSON.stringify({ appid, name: meta.name, plan: { ...plan, cdn: undefined }, fetchedBytes: fetched, apply: ap }) + '\n')
setTimeout(() => process.exit(0), 500)
