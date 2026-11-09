// Reference run with steam-user on the same refresh token: depot key fingerprint, request code,
// CDN auth token, getUserOwnedApps (GameLib's options) and client.licenses. Secrets never printed.
import SteamUser from 'steam-user'
import { createHash } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
const [vault, app, depot] = process.argv.slice(2)
const token = JSON.parse(readFileSync(vault, 'utf8'))['steam-refresh-token']
const c = new SteamUser({ autoRelogin: false, enablePicsCache: false })
const t0 = Date.now()
const log = (...a) => console.error(`[${((Date.now() - t0) / 1000).toFixed(3)}s]`, ...a)
c.logOn({ refreshToken: token })
c.once('loggedOn', async () => {
  log('logon ok')
  const out = { client: 'steam-user@5.3.0' }
  await new Promise((r) => (c.licenses ? r() : c.once('licenses', r)))
  out.licenses = c.licenses.length
  const owned = await c.getUserOwnedApps(c.steamID, { includePlayedFreeGames: true, includeFreeSub: true, skipUnvettedApps: false })
  out.getUserOwnedApps = owned.app_count
  writeFileSync('out/owned-getUserOwnedApps.json', JSON.stringify(owned.apps.map((a) => a.appid).sort((x, y) => x - y)))
  const { key } = await c.getDepotDecryptionKey(+app, +depot)
  out.depot_key_sha1 = createHash('sha1').update(key).digest('hex')
  const { servers } = await c.getContentServers(+app)
  out.cdn_servers = servers.length
  const host = servers.find((s) => s.https_support === 'mandatory') ?? servers[0]
  try {
    const t = await c.getCDNAuthToken(+app, +depot, host.vhost)
    out.cdn_auth_token = t.token ? 'issued' : 'not issued'
  } catch (e) { out.cdn_auth_token = `failed: ${e.message}` }
  log(JSON.stringify(out))
  writeFileSync('out/authed-steam-user.json', JSON.stringify(out, null, 2))
  c.logOff(); setTimeout(() => process.exit(0), 300)
})
c.on('error', (e) => { log('error', e.message); process.exit(1) })
