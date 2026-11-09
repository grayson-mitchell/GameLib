// Reference: GameLib's exact steam-user calls on the same token.
//   library/refresh.ts  getUserOwnedApps(steamID, { includePlayedFreeGames: true })
//   licensedDemos.ts    getProductInfo([], packageIds, true) -> packageinfo.appids
import SteamUser from 'steam-user'
import { readFileSync, writeFileSync } from 'fs'
const token = JSON.parse(readFileSync(process.argv[2], 'utf8'))['steam-refresh-token']
const c = new SteamUser({ autoRelogin: false, enablePicsCache: false })
const t0 = Date.now()
const log = (...a) => console.error(`[${((Date.now() - t0) / 1000).toFixed(3)}s]`, ...a)
c.logOn({ refreshToken: token })
c.once('loggedOn', async () => {
  await new Promise((r) => (c.licenses ? r() : c.once('licenses', r)))
  const owned = await c.getUserOwnedApps(c.steamID, { includePlayedFreeGames: true })
  log(`getUserOwnedApps: ${owned.app_count}`)
  writeFileSync('out/node-owned.json', JSON.stringify({ game_count: owned.app_count,
    games: owned.apps.map((a) => ({ appid: a.appid, name: a.name, playtime_forever: a.playtime_forever, rtime_last_played: a.rtime_last_played })) }, null, 2))
  const packageIds = [...new Set(c.licenses.map((l) => l.package_id))]
  const t = Date.now()
  const res = await c.getProductInfo([], packageIds, true)
  const appids = new Set()
  for (const p of Object.values(res.packages)) for (const a of Object.values(p.packageinfo?.appids ?? {})) appids.add(Number(a))
  log(`${packageIds.length} packages -> ${appids.size} appids in ${Date.now() - t} ms`)
  writeFileSync('out/node-license-appids.json', JSON.stringify([...appids].sort((a, b) => a - b)))
  c.logOff(); setTimeout(() => process.exit(0), 300)
})
c.on('error', (e) => { log('error', e.message); process.exit(1) })
