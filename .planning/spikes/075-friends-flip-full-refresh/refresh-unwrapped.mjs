// Spike 075: replay GameLib's cold Refresh sequence on steam-user 5.3.0, UNWRAPPED (Mac Steam
// stays online), one stage at a time, and mirror Mac Steam's connection_log into the run log.
// Mirrors: user.ts connect (options, logOn({refreshToken})), ensureAuthenticatedSession canary,
// library/refresh.ts syncOwnedLibrary (getUserOwnedApps includePlayedFreeGames), licensedDemos.ts
// (package info with tokens from client.licenses, then app batches of APP_BATCH_SIZE), the held-
// session platform-capture pass, then AUTH_SESSION_IDLE_GRACE_MS (60 s) before logOff.
// usage: node refresh-unwrapped.mjs <vault.json> <runName> [stopAfter=all|logon|canary|owned|demos]
import SteamUser from 'steam-user'
import { readFileSync, appendFileSync, statSync, openSync, readSync, closeSync, mkdirSync } from 'fs'
import { homedir } from 'os'
const [vault, runName = 'run', stopAfter = 'all'] = process.argv.slice(2)
const token = JSON.parse(readFileSync(vault, 'utf8'))['steam-refresh-token']
const logFile = new URL(`./runs/${runName}.log`, import.meta.url).pathname
mkdirSync(new URL('./runs/', import.meta.url).pathname, { recursive: true })
const t0 = Date.now()
const log = (...a) => {
  const line = `[${((Date.now() - t0) / 1000).toFixed(2)}s ${new Date().toISOString()}] ${a.join(' ')}`
  console.error(line); appendFileSync(logFile, line + '\n')
}
// Mirror new Mac Steam connection_log lines (the 046b/074 oracle).
const CL = `${homedir()}/Library/Application Support/Steam/logs/connection_log.txt`
let clPos = statSync(CL).size
const clTimer = setInterval(() => {
  const size = statSync(CL).size
  if (size <= clPos) return
  const fd = openSync(CL, 'r'); const buf = Buffer.alloc(size - clPos)
  readSync(fd, buf, 0, buf.length, clPos); closeSync(fd); clPos = size
  for (const l of buf.toString().split('\n').filter(Boolean)) log('MACSTEAM', l)
}, 250)
const ms = (p) => p.then((v) => v)
const stage = async (name, fn) => {
  const s = Date.now(); log(`stage ${name}: start`)
  try { const r = await fn(); log(`stage ${name}: ok ${Date.now() - s}ms ${r ?? ''}`) }
  catch (e) { log(`stage ${name}: FAIL ${Date.now() - s}ms ${e.message}`) }
  if (stopAfter === name) { log(`stopAfter=${name}: skipping later stages`); throw 'stop' }
}
const c = new SteamUser({ enablePicsCache: false, autoRelogin: false })
c.on('error', (e) => log('client error', e.message, 'eresult', e.eresult))
c.on('disconnected', (r, m) => log('disconnected', r, m))
c.on('webSession', () => log('event webSession (steam-user auto webLogOn)'))
c.on('loggedOff', (r) => log('event loggedOff eresult', r))
log(`run ${runName} stopAfter=${stopAfter} steam-user 5.3.0 unwrapped; Mac Steam stays ONLINE`)
const licenses = new Promise((res) => c.once('licenses', (l) => res(l)))
const loggedOn = new Promise((res) => c.once('loggedOn', res))
c.logOn({ refreshToken: token })
try {
  await stage('logon', async () => { await loggedOn; return `steamID=${String(c.steamID).slice(0, 7)}…` })
  await stage('licenses', async () => `${(await licenses).length} licenses`)
  await stage('canary', async () => { await c.getProductInfo([7], [], true); return 'appid 7' })
  let owned = []
  await stage('owned', async () => {
    owned = (await c.getUserOwnedApps(c.steamID, { includePlayedFreeGames: true })).apps.map((a) => a.appid)
    return `${owned.length} owned`
  })
  await stage('demos', async () => {
    const pkgIds = [...new Set(c.licenses.map((l) => l.package_id))]
    const pk = await c.getProductInfo([], pkgIds, true)
    const ownedSet = new Set(owned); const rem = new Set()
    for (const p of Object.values(pk.packages ?? {})) for (const a of p?.packageinfo?.appids ? Object.values(p.packageinfo.appids) : []) if (!ownedSet.has(Number(a))) rem.add(Number(a))
    const ids = [...rem]; let n = 0
    for (let i = 0; i < ids.length; i += 100) { const r = await c.getProductInfo(ids.slice(i, i + 100), [], true); n += Object.keys(r.apps ?? {}).length }
    return `${pkgIds.length} packages, ${ids.length} licensed-not-owned, ${n} appinfo`
  })
  await stage('capture', async () => {
    let n = 0
    for (let i = 0; i < owned.length; i += 100) { const r = await c.getProductInfo(owned.slice(i, i + 100), [], true); n += Object.keys(r.apps ?? {}).length }
    return `${n} owned appinfo (held-session platform pass, worst case: all apps)`
  })
} catch (e) { if (e !== 'stop') log('harness error', e?.message ?? e) }
log('holding 60 s (AUTH_SESSION_IDLE_GRACE_MS); operator: watch Friends now')
for (let i = 1; i <= 3; i++) {
  await new Promise((r) => setTimeout(r, 20000))
  try { await c.getProductInfo([7], [], true); log(`alive ${i}/3`) } catch (e) { log(`alive ${i}/3 FAIL ${e.message}`) }
}
log('logOff; operator: check Friends signed in + change status, then report')
c.logOff(); await new Promise((r) => setTimeout(r, 2000)); clearInterval(clTimer); process.exit(0)
