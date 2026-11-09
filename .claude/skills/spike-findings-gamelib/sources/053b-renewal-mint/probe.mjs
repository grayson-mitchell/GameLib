// Spike 053b: does GenerateAccessTokenForApp succeed for GameLib's SteamClient refresh token when
// renewal is ALLOWED (053 showed it is refused with renewal None)? If so, fetch the library over
// HTTPS with the minted access token, with NO authenticated CM logon and no go-offline wrap.
//
// Safety:
//   - The current refresh token is backed up to ~/.gamelib-spike053b-refresh-token.bak (0600)
//     BEFORE any renewal call. Restore with:
//       security add-generic-password -U -s com.gamelib.launcher -a steam-refresh-token -w "$(cat ~/.gamelib-spike053b-refresh-token.bak)"
//   - If Steam returns a new refresh token, it is written to the Keychain entry GameLib reads
//     (service com.gamelib.launcher, account steam-refresh-token) so GameLib keeps a valid token.
//   - Tokens are logged only as a 3-char prefix plus length.
// Oracles (unchanged from 053): A Web API GetOwnedGames, B store dynamicstore/userdata,
// C account/licenses, anonymous PICS typing of B-minus-A, and the Mac Steam connection_log tail.
// Usage: node probe.mjs [subjectAppId=3205720]
import { execFileSync } from 'node:child_process'
import { appendFileSync, openSync, readSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { LoginSession, EAuthTokenPlatformType } = require('steam-session')
const SteamUser = require('steam-user')

const HERE = dirname(fileURLToPath(import.meta.url))
const STEAM_LOG = join(homedir(), 'Library/Application Support/Steam/logs/connection_log.txt')
const RUN_LOG = join(HERE, 'run.log')
const RESULT = join(HERE, 'result.json')
const SUBJECT = Number(process.argv[2] ?? 3205720)
const CONTROLS = { 219: 'Half-Life 2: Demo', 410: 'Portal: First Slice', 570: 'Dota 2 (unplayed F2P)', 440: 'TF2 (unplayed F2P)' }
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

const steamLogLines = []
const steamLog = tail(STEAM_LOG)
const drainSteamLog = () => {
  for (const l of steamLog()) {
    steamLogLines.push(l.trim())
    ev('steam-log', l.trim().slice(0, 220))
  }
}

async function get(url, cookie) {
  const res = await fetch(url, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' })
  const text = await res.text()
  return { status: res.status, location: res.headers.get('location'), text }
}

writeFileSync(RUN_LOG, '')
const steamPidBefore = execFileSync('/bin/sh', ['-c', 'pgrep -x steam_osx || true']).toString().trim()
ev('snapshot', 'steam_osx', { pid: steamPidBefore || null })

let refreshToken
try {
  refreshToken = execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'com.gamelib.launcher', '-a', 'steam-refresh-token', '-w']).toString().trim()
} catch {
  ev('verdict', 'ABORT: could not read the GameLib refresh token from the Keychain.')
  process.exit(2)
}
ev('token', 'refresh token read from Keychain', { prefix: refreshToken.slice(0, 3), length: refreshToken.length })
drainSteamLog()

// ── 1. access token with renewal ALLOWED ──────────────────────────────────
const BACKUP = join(homedir(), '.gamelib-spike053b-refresh-token.bak')
writeFileSync(BACKUP, refreshToken + '\n', { mode: 0o600 })
ev('backup', 'old refresh token backed up', { path: BACKUP })
const steamid = JSON.parse(Buffer.from(refreshToken.split('.')[1], 'base64url')).sub
const attempts = {}
let accessToken = null
let newRefreshToken = null
try {
  const session = new LoginSession(EAuthTokenPlatformType.SteamClient)
  session.refreshToken = refreshToken
  const renewed = await session.renewRefreshToken()
  accessToken = session.accessToken
  if (renewed && session.refreshToken !== refreshToken) newRefreshToken = session.refreshToken
  attempts.cmWebsocketRenew = `ok (renewed=${renewed})`
} catch (err) {
  attempts.cmWebsocketRenew = `${err.message} (eresult ${err.eresult})`
}
if (!accessToken) {
  const res = await fetch('https://api.steampowered.com/IAuthenticationService/GenerateAccessTokenForApp/v1/', {
    method: 'POST',
    body: new URLSearchParams({ refresh_token: refreshToken, steamid, renewal_type: '1' })
  })
  const body = await res.text()
  let parsed = null
  try {
    parsed = JSON.parse(body)
  } catch {}
  accessToken = parsed?.response?.access_token ?? null
  if (parsed?.response?.refresh_token) newRefreshToken = parsed.response.refresh_token
  attempts.webApiFormRenew = accessToken ? 'ok' : `status ${res.status} x-eresult ${res.headers.get('x-eresult')} body ${body.slice(0, 120)}`
}
attempts.newRefreshTokenIssued = Boolean(newRefreshToken)
if (newRefreshToken) {
  const claims = JSON.parse(Buffer.from(newRefreshToken.split('.')[1], 'base64url'))
  attempts.newRefreshToken = { prefix: newRefreshToken.slice(0, 3), length: newRefreshToken.length, aud: claims.aud, exp: new Date(claims.exp * 1000).toISOString() }
  execFileSync('/usr/bin/security', ['add-generic-password', '-U', '-s', 'com.gamelib.launcher', '-a', 'steam-refresh-token', '-w', newRefreshToken])
  const check = execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'com.gamelib.launcher', '-a', 'steam-refresh-token', '-w']).toString().trim()
  attempts.keychainUpdated = check === newRefreshToken
}
if (accessToken) {
  const c = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url'))
  attempts.accessToken = { aud: c.aud, exp: new Date(c.exp * 1000).toISOString() }
}
ev('token', 'access-token mint attempts', attempts)
if (!accessToken) {
  writeFileSync(RESULT, JSON.stringify({ subject: SUBJECT, mint: attempts }, null, 2) + '\n')
  drainSteamLog()
  ev('verdict', 'MINT_FAILED: no access token even with renewal allowed. >>> OPERATOR: is Friends still signed in?')
  process.exit(1)
}
const cookie = `steamLoginSecure=${encodeURIComponent(`${steamid}||${accessToken}`)}`
ev('token', 'access token minted', { prefix: accessToken.slice(0, 3), length: accessToken.length })
await sleep(1500)
drainSteamLog()

const result = { mint: attempts, subject: SUBJECT, controls: CONTROLS, A: {}, B: {}, C: {}, diff: {}, steamLog: [] }
const mark = (ids) => Object.fromEntries([SUBJECT, ...Object.keys(CONTROLS).map(Number)].map((id) => [id, ids.has(id)]))

// ── A. Web API GetOwnedGames ──────────────────────────────────────────────
const ownedVariants = {
  current_gamelib: 'include_played_free_games=1',
  all_flags: 'include_played_free_games=1&include_free_sub=1&skip_unvetted_apps=0'
}
let ownedA = new Set()
for (const [name, q] of Object.entries(ownedVariants)) {
  const r = await get(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?access_token=${accessToken}&steamid=${steamid}&include_appinfo=1&${q}`)
  if (r.status !== 200) {
    result.A[name] = { status: r.status, body: r.text.slice(0, 200) }
    ev('error', `A ${name}`, result.A[name])
    continue
  }
  const games = JSON.parse(r.text).response?.games ?? []
  const ids = new Set(games.map((g) => g.appid))
  const withPlaytime = games.filter((g) => g.playtime_forever > 0).length
  const withLastPlayed = games.filter((g) => g.rtime_last_played > 0).length
  result.A[name] = { status: 200, count: ids.size, withPlaytime, withLastPlayed, sampleKeys: Object.keys(games[0] ?? {}), has: mark(ids) }
  if (name === 'current_gamelib') ownedA = ids
  ev('A', name, result.A[name])
}
drainSteamLog()

// ── B. store dynamicstore/userdata ────────────────────────────────────────
let ownedB = new Set()
{
  const r = await get(`https://store.steampowered.com/dynamicstore/userdata/?t=${Date.now()}`, cookie)
  let body = null
  try {
    body = JSON.parse(r.text)
  } catch {}
  ownedB = new Set(body?.rgOwnedApps ?? [])
  result.B = {
    status: r.status,
    signedIn: (body?.rgOwnedPackages?.length ?? 0) > 0,
    ownedApps: ownedB.size,
    ownedPackages: body?.rgOwnedPackages?.length ?? 0,
    keys: body ? Object.keys(body) : null,
    has: mark(ownedB),
    subjectPackage1136752: (body?.rgOwnedPackages ?? []).includes(1136752)
  }
  ev('B', 'dynamicstore/userdata', result.B)
}
drainSteamLog()

// ── C. account/licenses HTML ──────────────────────────────────────────────
{
  const r = await get('https://store.steampowered.com/account/licenses/', cookie)
  const rows = r.text.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []
  const names = rows.map((row) => (row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) ?? [])[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean)
  result.C = {
    status: r.status,
    redirect: r.location,
    licenseRows: names.length,
    subjectRow: names.find((n) => /Schedule I/i.test(n)) ?? null,
    hasAppIds: /data-appid|\/app\/\d+/.test(r.text)
  }
  ev('C', 'account/licenses', result.C)
}
drainSteamLog()

// ── PICS types for what B adds over A (anonymous CM) ──────────────────────
const extra = [...ownedB].filter((id) => !ownedA.has(id))
if (extra.length) {
  const anon = new SteamUser({ autoRelogin: false, enablePicsCache: false })
  await new Promise((resolve, reject) => {
    anon.once('loggedOn', resolve)
    anon.once('error', reject)
    anon.logOn({ anonymous: true })
  })
  const apps = {}
  for (let i = 0; i < extra.length; i += 200) Object.assign(apps, (await anon.getProductInfo(extra.slice(i, i + 200), [], true)).apps)
  anon.logOff()
  const byType = {}
  for (const id of extra) {
    const c = apps[id]?.appinfo?.common ?? {}
    ;(byType[String(c.type ?? 'unknown').toLowerCase()] ??= []).push({ appid: id, name: c.name ?? null })
  }
  result.diff = {
    inBnotA: extra.length,
    inAnotB: [...ownedA].filter((id) => !ownedB.has(id)).length,
    byTypeCounts: Object.fromEntries(Object.entries(byType).map(([t, l]) => [t, l.length])),
    demos: byType.demo ?? [],
    games: byType.game ?? []
  }
  ev('diff', 'store userdata vs GetOwnedGames', { inBnotA: result.diff.inBnotA, inAnotB: result.diff.inAnotB, byType: result.diff.byTypeCounts })
}

await sleep(3000)
drainSteamLog()
const steamPidAfter = execFileSync('/bin/sh', ['-c', 'pgrep -x steam_osx || true']).toString().trim()
const disturbing = steamLogLines.filter((l) => /LogOff|LoggedInElsewhere|LogonSessionReplaced|RecvMsgClientLogOnResponse|Disconnect/i.test(l))
result.steamLog = { linesDuringRun: steamLogLines.length, disturbing, samePid: steamPidAfter === steamPidBefore }
ev('friends-oracle', 'Mac Steam connection_log during run', result.steamLog)

writeFileSync(RESULT, JSON.stringify(result, null, 2) + '\n')
const verdict = [
  disturbing.length ? 'STEAM_DISTURBED' : 'STEAM_UNDISTURBED',
  result.A.current_gamelib?.count ? 'WEBAPI_OWNED_OK' : 'WEBAPI_OWNED_FAIL',
  result.B.has?.[SUBJECT] ? 'USERDATA_HAS_DEMO' : 'USERDATA_NO_DEMO'
].join(' ')
ev('verdict', `${verdict}. >>> OPERATOR: is Mac Steam Friends still signed in, and can you change your status?`)
process.exit(0)
