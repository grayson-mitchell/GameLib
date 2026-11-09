// Spike 077: hold a steam-user session on GameLib's refresh token with GameLib's production
// options (autoRelogin false, enablePicsCache false) and an explicit logonID
// (obfuscated_private_ip; production passes none, which is 0).
//   node su-hold.mjs <vault.json> <label> <hold_s> <logonID>
// Lines: "<ISO ms> <label> <cat> <msg>" on stderr and out/<label>.log. No secrets printed.
import SteamUser from 'steam-user'
import { readFileSync, appendFileSync, mkdirSync, writeFileSync } from 'fs'
const [vault, label, holdS, logonIdArg] = process.argv.slice(2)
const hold = Number(holdS) * 1000
const anon = logonIdArg === 'anon'
const logonID = anon ? 0 : Number(logonIdArg ?? 0)
mkdirSync('out', { recursive: true })
writeFileSync(`out/${label}.log`, '')
const log = (cat, msg) => {
  const l = `${new Date().toISOString()} ${label.padEnd(10)} ${cat.padEnd(7)} ${msg}`
  console.error(l)
  appendFileSync(`out/${label}.log`, l + '\n')
}
const token = JSON.parse(readFileSync(vault, 'utf8'))['steam-refresh-token']
const c = new SteamUser({ autoRelogin: false, enablePicsCache: false })
let alive = false, answered = 0, done = false
const finish = (code) => {
  if (done) return
  done = true
  log('end', `alive_at_end=${alive} answered=${answered}`)
  try { if (alive) c.logOff() } catch {}
  setTimeout(() => process.exit(code), 800)
}
log('start', `steam-user 5.3.0, ${anon ? 'ANONYMOUS ' : ''}logonID=${logonID}, hold ${holdS}s`)
c.logOn(anon ? {} : logonID ? { refreshToken: token, logonID } : { refreshToken: token })
c.on('loggedOn', () => {
  alive = true
  log('logon', `logged on as ${c.steamID?.steam3()}`)
  const ping = async () => {
    if (!alive || done) return
    try {
      await Promise.race([c.getProductAccessToken([480], []), new Promise((_, r) => setTimeout(() => r(new Error('timeout 8s')), 8000))])
      answered++
      log('alive', `PICS access token answered (#${answered})`)
    } catch (e) {
      log('DEAD', `call failed: ${e.message}`)
      alive = false
      return finish(1)
    }
    setTimeout(ping, 10000)
  }
  setTimeout(ping, 2000)
  setTimeout(() => finish(0), hold)
})
c.on('error', (e) => { log('KICKED', `error eresult ${e.eresult} (${e.message})`); alive = false; finish(1) })
c.on('disconnected', (eresult, msg) => { log('DISCON', `disconnected eresult ${eresult} (${msg})`); if (!done) { alive = false; finish(1) } })
