// Spike 081: steam-user session on GameLib's refresh token, production options
// (autoRelogin false, enablePicsCache false) and a NON-ZERO logonID (077's fix), doing a
// Refresh-shaped cycle every <period_s>: getUserOwnedApps + package PICS for 50 licences +
// app PICS for 50 owned apps (licensedDemos.ts shape).
//   node su-work.mjs <vault.json> <label> <hold_s> <logonID> [period_s=20]
// Lines: "<ISO ms> <label> <cat> <msg>" on stderr and out/<label>.log. No secrets printed.
import { createRequire } from 'node:module'
import { readFileSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
const require = createRequire(new URL('../../../package.json', import.meta.url))
const SteamUser = require('steam-user')
const [vault, label, holdS, logonIdArg, periodArg] = process.argv.slice(2)
const hold = Number(holdS) * 1000, period = Number(periodArg ?? 20) * 1000, logonID = Number(logonIdArg)
mkdirSync('out', { recursive: true }); writeFileSync(`out/${label}.log`, '')
const log = (cat, msg) => { const l = `${new Date().toISOString()} ${label.padEnd(8)} ${cat.padEnd(7)} ${msg}`; console.error(l); appendFileSync(`out/${label}.log`, l + '\n') }
const token = JSON.parse(readFileSync(vault, 'utf8'))['steam-refresh-token']
const c = new SteamUser({ autoRelogin: false, enablePicsCache: false })
let alive = false, cycles = 0, done = false, licences = []
const finish = (code) => { if (done) return; done = true; log('end', `alive_at_end=${alive} cycles=${cycles}`); try { if (alive) c.logOff() } catch {}; setTimeout(() => process.exit(code), 800) }
const to = (p, s) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(`timeout ${s}s`)), s * 1000))])
log('start', `steam-user, logonID=${logonID}, hold ${holdS}s, cycle every ${period / 1000}s`)
c.on('licenses', (l) => { licences = l; log('license', `${l.length} licences`) })
c.logOn({ refreshToken: token, logonID })
c.on('loggedOn', () => {
  alive = true; log('logon', 'logged on')
  const cycle = async () => {
    if (!alive || done) return
    const t = Date.now()
    try {
      const owned = await to(c.getUserOwnedApps(c.steamID, { includePlayedFreeGames: true, includeFreeSub: true }), 30)
      const pkgs = licences.slice(cycles * 50 % Math.max(1, licences.length)).slice(0, 50).map((l) => l.package_id)
      const pr = await to(c.getProductInfo([], pkgs, true), 30)
      const apps = owned.apps.slice((cycles * 50) % owned.apps.length).slice(0, 50).map((a) => a.appid)
      const ar = await to(c.getProductInfo(apps, [], true), 30)
      cycles++
      log('cycle', `#${cycles} owned=${owned.app_count} pkgPICS=${Object.keys(pr.packages).length} appPICS=${Object.keys(ar.apps).length} ${Date.now() - t}ms`)
    } catch (e) { log('DEAD', `cycle failed: ${e.message}`); alive = false; return finish(1) }
    setTimeout(cycle, period)
  }
  setTimeout(cycle, 2000); setTimeout(() => finish(0), hold)
})
c.on('error', (e) => { log('KICKED', `error eresult ${e.eresult} (${e.message})`); alive = false; finish(1) })
c.on('disconnected', (er, msg) => { log('DISCON', `disconnected eresult ${er} (${msg})`); if (!done) { alive = false; finish(1) } })
