// Spike 052: are demos (free-on-demand licenses) missing from getUserOwnedApps, and would a
// licenses-based path surface them? Read-only against the signed-in account.
//
// Oracles:
//   A. getUserOwnedApps, four option variants (GameLib's current call first).
//   B. client.licenses -> PICS package info -> appids (the licenses path).
//   C. PICS app info for the subject (type, parent) and for every licensed-but-not-owned app.
//
// The authenticated logon runs inside the 046b go-offline wrap so Mac Steam's Friends list stays
// signed in. The refresh token is read from the macOS Keychain entry GameLib's shell uses
// (service com.gamelib.launcher, account steam-refresh-token) and never logged.
//
// Preconditions: GameLib fully quit (no second session on the token), Mac Steam running and
// signed in with no game running.
// Usage: node probe.mjs [subjectAppId=3205720]
import { execFileSync } from 'node:child_process'
import { appendFileSync, openSync, readSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const SteamUser = require('steam-user')

const HERE = dirname(fileURLToPath(import.meta.url))
const STEAM_LOG = join(homedir(), 'Library/Application Support/Steam/logs/connection_log.txt')
const RUN_LOG = join(HERE, 'run.log')
const RESULT = join(HERE, 'result.json')
const SUBJECT = Number(process.argv[2] ?? 3205720)
const t0 = Date.now()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function ev(cat, msg, data = {}) {
  const ts = new Date().toISOString()
  const line = `${ts} +${String(Date.now() - t0).padStart(7)}ms [${cat}] ${msg}${Object.keys(data).length ? ' ' + JSON.stringify(data) : ''}`
  console.error(line)
  appendFileSync(RUN_LOG, line + '\n')
}

function tail(path) {
  let offset = statSync(path).size
  return () => {
    const size = statSync(path).size
    if (size < offset) offset = 0
    if (size === offset) return []
    const buf = Buffer.alloc(size - offset)
    const fd = openSync(path, 'r')
    readSync(fd, buf, 0, buf.length, offset)
    offset = size
    return buf.toString('utf8').split('\n').filter(Boolean)
  }
}

async function until(read, re, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    for (const l of read()) if (re.test(l)) return { ok: true, ms: Date.now() - start }
    await sleep(250)
  }
  return { ok: false, ms: Date.now() - start }
}

function goOnline(steam) {
  ev('fire', 'open -g steam://open/goonline')
  execFileSync('/usr/bin/open', ['-g', 'steam://open/goonline'])
  return until(steam, /RecvMsgClientLogOnResponse\(\) : processing complete/, 45000)
}

writeFileSync(RUN_LOG, '')

if (execFileSync('/bin/sh', ['-c', "pgrep -f 'gamelib-shell|build/main/sidecar' || true"]).toString().trim()) {
  ev('verdict', 'ABORT: GameLib is running. Quit it first so the probe is the only session on the token.')
  process.exit(2)
}

let token
try {
  token = execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'com.gamelib.launcher', '-a', 'steam-refresh-token', '-w']).toString().trim()
} catch {
  ev('verdict', 'ABORT: could not read the GameLib refresh token from the Keychain.')
  process.exit(2)
}
ev('token', 'read from Keychain', { prefix: token.slice(0, 3), length: token.length })

const steam = tail(STEAM_LOG)
ev('fire', 'open -g steam://open/gooffline')
execFileSync('/usr/bin/open', ['-g', 'steam://open/gooffline'])
const off = await until(steam, /LogOff\(\)|not auto reconnecting due to user initiated logoff/, 20000)
if (!off.ok) {
  ev('verdict', 'ABORT: Mac Steam did not log off (game running? Steam signed out?). Logon is NOT safe.')
  process.exit(2)
}
ev('state', `Mac Steam offline after ${off.ms} ms`)

const client = new SteamUser({ autoRelogin: false, enablePicsCache: false })
const licensesSeen = new Promise((r) => client.once('licenses', r))
const loggedOn = new Promise((resolve, reject) => {
  client.once('loggedOn', resolve)
  client.once('error', reject)
})
client.logOn({ refreshToken: token })
try {
  await loggedOn
} catch (err) {
  ev('error', 'logon failed', { eresult: err.eresult, message: err.message })
  await goOnline(steam)
  process.exit(1)
}
ev('hit', 'loggedOn', { steamID: String(client.steamID).slice(0, 7) + '…' })
await sleep(2000)
const on = await goOnline(steam)
ev(on.ok ? 'hit' : 'timeout', on.ok ? `Mac Steam back online ${on.ms} ms after goonline` : 'Mac Steam did not complete logon')

const result = { subject: SUBJECT, ownedVariants: {}, licenses: {}, subjectInfo: null, diff: {} }

// ── A. getUserOwnedApps variants ──────────────────────────────────────────
const variants = {
  current_gamelib: { includePlayedFreeGames: true },
  plus_free_sub: { includePlayedFreeGames: true, includeFreeSub: true },
  plus_unvetted: { includePlayedFreeGames: true, skipUnvettedApps: false },
  all_flags: { includePlayedFreeGames: true, includeFreeSub: true, skipUnvettedApps: false }
}
let ownedCurrent = new Set()
for (const [name, opts] of Object.entries(variants)) {
  try {
    const r = await client.getUserOwnedApps(client.steamID, opts)
    const ids = new Set(r.apps.map((a) => a.appid))
    const subj = r.apps.find((a) => a.appid === SUBJECT)
    result.ownedVariants[name] = { count: ids.size, hasSubject: ids.has(SUBJECT), subjectPlaytime: subj?.playtime_forever ?? null }
    if (name === 'current_gamelib') ownedCurrent = ids
    ev('owned', name, result.ownedVariants[name])
  } catch (err) {
    result.ownedVariants[name] = { error: err.message }
    ev('error', `owned ${name}`, { message: err.message })
  }
}

// ── B. licenses -> packages -> appids ─────────────────────────────────────
await Promise.race([licensesSeen, sleep(10000)])
const licenses = client.licenses ?? []
const packageIds = [...new Set(licenses.map((l) => l.package_id))]
ev('licenses', 'license list', { licenses: licenses.length, packages: packageIds.length })
const pkgInfo = (await client.getProductInfo([], packageIds, true)).packages
const appToPackages = new Map()
let subjectLicense = null
for (const lic of licenses) {
  const info = pkgInfo[lic.package_id]?.packageinfo
  for (const appid of info?.appids ?? []) {
    if (!appToPackages.has(appid)) appToPackages.set(appid, [])
    appToPackages.get(appid).push(lic.package_id)
    if (appid === SUBJECT) {
      subjectLicense = {
        package_id: lic.package_id,
        license_type: lic.license_type,
        payment_method: lic.payment_method,
        flags: lic.flags,
        time_created: lic.time_created,
        billingtype: info.billingtype,
        licensetype: info.licensetype
      }
    }
  }
}
result.licenses = { licenses: licenses.length, packages: packageIds.length, apps: appToPackages.size, subjectLicensed: appToPackages.has(SUBJECT), subjectLicense }
ev('licenses', 'apps via licenses', result.licenses)

// ── C. app info: subject, plus every licensed app missing from the owned list ──
const missing = [...appToPackages.keys()].filter((id) => !ownedCurrent.has(id))
const appIds = [...new Set([SUBJECT, ...missing])]
const apps = {}
for (let i = 0; i < appIds.length; i += 200) {
  Object.assign(apps, (await client.getProductInfo(appIds.slice(i, i + 200), [], true)).apps)
}
const common = (id) => apps[id]?.appinfo?.common ?? {}
const s = common(SUBJECT)
result.subjectInfo = { name: s.name, type: s.type, parent: s.parent ?? null, oslist: s.oslist, releasestate: s.releasestate, freetodownload: s.freetodownload ?? null }
ev('subject', 'app info', result.subjectInfo)

const byType = {}
for (const id of missing) {
  const t = String(common(id).type ?? 'unknown').toLowerCase()
  ;(byType[t] ??= []).push({ appid: id, name: common(id).name ?? null })
}
result.diff = {
  licensedNotOwned: missing.length,
  byTypeCounts: Object.fromEntries(Object.entries(byType).map(([t, l]) => [t, l.length])),
  demos: byType.demo ?? [],
  games: (byType.game ?? []).slice(0, 50)
}
ev('diff', 'licensed but not in current owned list', { total: missing.length, byType: result.diff.byTypeCounts })

writeFileSync(RESULT, JSON.stringify(result, null, 2) + '\n')
const verdict = !result.ownedVariants.current_gamelib?.hasSubject && result.licenses.subjectLicensed ? 'SUBJECT_LICENSED_NOT_OWNED' : result.ownedVariants.current_gamelib?.hasSubject ? 'SUBJECT_IN_OWNED' : 'SUBJECT_NOT_LICENSED'
ev('verdict', verdict, { result: 'result.json' })
client.logOff()
await sleep(500)
process.exit(0)
