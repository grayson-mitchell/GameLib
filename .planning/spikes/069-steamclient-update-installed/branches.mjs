// Anonymous PICS: list branches (buildid, pwd, per-depot macOS manifest GIDs) for installed apps.
import { createRequire } from 'node:module'
const require = createRequire(process.cwd() + '/package.json')
const SteamUser = require('steam-user')
const apps = process.argv.slice(2).map(Number)
const c = new SteamUser({ enablePicsCache: false, autoRelogin: false })
c.logOn({ anonymous: true })
c.on('loggedOn', async () => {
  const { apps: info } = await c.getProductInfo(apps, [], true)
  for (const id of apps) {
    const a = info[id]?.appinfo
    if (!a) { console.log(JSON.stringify({ id, missing: true })); continue }
    const d = a.depots || {}
    const branches = d.branches || {}
    const out = {}
    for (const [b, v] of Object.entries(branches)) {
      const gids = {}
      for (const [k, dep] of Object.entries(d)) {
        if (!/^\d+$/.test(k) || !dep.manifests) continue
        const m = dep.manifests[b]
        if (m) gids[k] = typeof m === 'object' ? m.gid : m
      }
      out[b] = { buildid: v.buildid, pwd: v.pwdrequired, timeupdated: v.timeupdated, gids }
    }
    console.log(JSON.stringify({ id, name: a.common?.name, branches: out }))
  }
  c.logOff(); setTimeout(() => process.exit(0), 500).unref()
})
c.on('error', (e) => { console.error(e.message); process.exit(1) })
