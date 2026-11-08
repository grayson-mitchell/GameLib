// Compare every bridge-bottle ACF (buildid + InstalledDepots GIDs) with the public branch in
// anonymous PICS, and record the ACF mtime against its LastUpdated. Read-only.
import { createRequire } from 'node:module'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
const require = createRequire(process.cwd() + '/package.json')
const SteamUser = require('steam-user')
const { parse } = require('@node-steam/vdf')

const bottles = join(process.env.HOME, 'Library/Application Support/CrossOver/Bottles')
const rows = []
for (const b of readdirSync(bottles).filter((n) => n.startsWith('GameLibSteamBridge-'))) {
  const sa = join(bottles, b, 'drive_c/Program Files (x86)/Steam/steamapps')
  if (!existsSync(sa)) continue
  for (const f of readdirSync(sa).filter((n) => /^appmanifest_\d+\.acf$/.test(n))) {
    const p = join(sa, f)
    const s = parse(readFileSync(p, 'utf8')).AppState
    // Manifest GIDs are 64-bit: @node-steam/vdf turns them into lossy JS numbers, so
    // read them from the raw text instead.
    const text = readFileSync(p, 'utf8')
    const block = text.slice(text.indexOf('"InstalledDepots"'))
    const depots = {}
    for (const m of block.matchAll(/"(\d+)"\s*\{\s*"manifest"\s*"(\d+)"/g)) depots[m[1]] = m[2]
    rows.push({
      bottle: b,
      appid: Number(s.appid),
      name: s.name,
      buildid: Number(s.buildid),
      lastUpdated: Number(s.LastUpdated),
      acfMtime: Math.floor(statSync(p).mtimeMs / 1000),
      installdir: s.installdir,
      depots
    })
  }
}

const c = new SteamUser({ enablePicsCache: false, autoRelogin: false })
c.logOn({ anonymous: true })
c.on('loggedOn', async () => {
  const ids = [...new Set(rows.map((r) => r.appid))]
  const { apps } = await c.getProductInfo(ids, [], true)
  for (const r of rows) {
    const d = apps[r.appid]?.appinfo?.depots || {}
    const pub = d.branches?.public || {}
    const pubGids = {}
    for (const dep of Object.keys(r.depots)) {
      const m = d[dep]?.manifests?.public
      pubGids[dep] = m ? String(typeof m === 'object' ? m.gid : m) : null
    }
    r.publicBuildid = Number(pub.buildid)
    r.publicTimeUpdated = Number(pub.timeupdated)
    r.publicGids = pubGids
    r.stale = r.publicBuildid !== r.buildid
    r.gidsDiffer = Object.keys(r.depots).filter((k) => pubGids[k] && pubGids[k] !== r.depots[k])
    r.publicUpdatedAfterInstall = r.publicTimeUpdated > r.lastUpdated
    console.log(JSON.stringify(r))
  }
  c.logOff()
  setTimeout(() => process.exit(0), 500).unref()
})
c.on('error', (e) => { console.error(e.message); process.exit(1) })
