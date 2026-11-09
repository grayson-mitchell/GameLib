// 074 A/B: steam-user logon with Mac Steam online and NO wrap, held for 60 s, with GameLib's
// production options. Optional argv[3] = clientOS override (e.g. 203, steam-vent's value).
import SteamUser from 'steam-user'
import { readFileSync } from 'fs'
const token = JSON.parse(readFileSync(process.argv[2], 'utf8'))['steam-refresh-token']
const clientOS = process.argv[3] !== undefined ? Number(process.argv[3]) : undefined
const c = new SteamUser({ autoRelogin: false, enablePicsCache: false })
const t0 = Date.now()
const log = (...a) => console.error(`[${((Date.now() - t0) / 1000).toFixed(2)}s unix ${Math.floor(Date.now() / 1000)}]`, ...a)
log(`start steam-user 5.3.0 unwrapped, clientOS ${clientOS ?? 'default (' + c.constructor.name + ' host OS)'}`)
c.logOn(clientOS === undefined ? { refreshToken: token } : { refreshToken: token, clientOS })
c.once('loggedOn', () => {
  log('logged on; holding 60 s')
  setTimeout(() => { log('hold over; logging off. Now check Friends.'); c.logOff(); setTimeout(() => process.exit(0), 500) }, 60000)
})
c.on('error', (e) => { log('error', e.message); process.exit(1) })
