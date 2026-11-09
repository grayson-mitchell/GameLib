// Parity reference: the same anonymous PICS reads via steam-user (the client GameLib ships).
import SteamUser from 'steam-user'
import { writeFileSync } from 'fs'
const apps = process.argv.slice(2).map(Number)
const c = new SteamUser({ autoRelogin: false })
c.logOn({ anonymous: true })
c.once('loggedOn', async () => {
  const { apps: info } = await c.getProductInfo(apps, [], true)
  const out = {}
  for (const a of apps) {
    const ai = info[a].appinfo
    const m = {}
    for (const [id, d] of Object.entries(ai.depots ?? {})) {
      if (!/^\d+$/.test(id)) continue
      const p = d?.manifests?.public
      const gid = typeof p === 'object' ? p?.gid : p
      if (gid) m[id] = String(gid)
    }
    out[a] = { name: ai.common?.name, buildid: ai.depots?.branches?.public?.buildid, manifests: m }
  }
  writeFileSync('out/anon-steam-user.json', JSON.stringify({ client: 'steam-user', apps: out }, null, 2))
  c.logOff(); setTimeout(() => process.exit(0), 300)
})
c.on('error', (e) => { console.error('error', e.message); process.exit(1) })
