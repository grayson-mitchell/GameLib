/**
 * Spike 001 — diagnose the 5 remaining depot-selection failures.
 * READ-ONLY. Shows every attribute of the depots we got wrong.
 *
 * Usage: node diagnose.mjs <appId>
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { connectAuthenticated, ownedIds } from './auth.mjs'
import { parseVdfStrings } from './vdf-strings.mjs'
import { selectDepots } from './select.mjs'

const APP_ID = Number(process.argv[2])
const STEAMAPPS = `${homedir()}/Library/Application Support/Steam/steamapps`

const { client, licenses } = await connectAuthenticated()
const owned = await ownedIds(client, licenses)
const info = await client.getProductInfo([APP_ID], [], true)
const appinfo = info.apps[APP_ID].appinfo

const real = parseVdfStrings(
  readFileSync(`${STEAMAPPS}/appmanifest_${APP_ID}.acf`, 'utf8')
).AppState
const installed = new Set(Object.keys(real.InstalledDepots ?? {}))
const got = new Set(selectDepots(appinfo, owned).map((d) => d.id))

console.log(`\n${appinfo.common?.name} (${APP_ID})`)
console.log(`StateFlags: ${real.StateFlags}   buildid(.acf): ${real.buildid}   buildid(PICS): ${appinfo.depots?.branches?.public?.buildid}`)
console.log(`UserConfig: ${JSON.stringify(real.UserConfig)}`)
console.log(`MountedConfig: ${JSON.stringify(real.MountedConfig)}\n`)

const cols = [
  ['depot', 9], ['steam', 7], ['ours', 6], ['verdict', 18],
  ['oslist', 16], ['language', 12], ['dlcappid', 10], ['own?', 6], ['optional', 9], ['size', 13]
]
console.log(cols.map(([h, w]) => h.padEnd(w)).join(''))
console.log('─'.repeat(cols.reduce((s, [, w]) => s + w, 0)))

for (const [id, d] of Object.entries(appinfo.depots ?? {})) {
  if (!/^\d+$/.test(id)) continue
  const inSteam = installed.has(id)
  const inOurs = got.has(id)
  if (inSteam === inOurs) continue // only show the disagreements

  const cfg = d.config ?? {}
  const m = d.manifests?.public
  const row = [
    id,
    inSteam ? 'YES' : '·',
    inOurs ? 'YES' : '·',
    inSteam ? 'WE MISSED IT' : 'WE ADDED IT',
    cfg.oslist ?? '·',
    cfg.language ?? '·',
    d.dlcappid ?? '·',
    d.dlcappid ? (owned.apps.has(Number(d.dlcappid)) ? 'yes' : 'NO') : '·',
    d.optional ?? '·',
    String(typeof m === 'object' ? (m.size ?? 0) : 0)
  ]
  console.log(row.map((c, i) => String(c).padEnd(cols[i][1])).join(''))
}

// GID drift: is the .acf pinned to an older build than PICS 'public'?
console.log('\nGID comparison for depots Steam has installed:')
for (const [id, e] of Object.entries(real.InstalledDepots ?? {})) {
  const m = appinfo.depots?.[id]?.manifests?.public
  const picsGid = typeof m === 'string' ? m : m?.gid
  const same = String(picsGid) === e.manifest
  console.log(
    `  ${id.padEnd(9)} acf=${e.manifest.padEnd(21)} pics=${String(picsGid ?? '(none)').padEnd(21)} ${same ? '✓' : '✗ DRIFT'}`
  )
}

client.logOff()
process.exit(0)
