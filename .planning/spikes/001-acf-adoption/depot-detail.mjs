/**
 * Spike 001 — depot-selection forensics. READ-ONLY.
 *
 * The naive PICS filter reproduced Steam's depot set for WazHack (1 depot) but
 * failed for every multi-depot game. This isolates WHY: for each depot PICS
 * knows about, show its attributes side-by-side with whether Steam actually
 * installed it.
 *
 * Usage: node depot-detail.mjs <appId>
 */

import SteamUser from 'steam-user'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { parseVdfStrings } from './vdf-strings.mjs'

const APP_ID = Number(process.argv[2] ?? 35720)
const STEAM_ROOT = `${homedir()}/Library/Application Support/Steam`

const appinfo = await new Promise((resolve, reject) => {
  const c = new SteamUser()
  c.on('error', reject)
  c.on('loggedOn', async () => {
    const r = await c.getProductInfo([APP_ID], [], true)
    c.logOff()
    resolve(r.apps[APP_ID]?.appinfo)
  })
  c.logOn({ anonymous: true })
})

const real = parseVdfStrings(
  readFileSync(`${STEAM_ROOT}/steamapps/appmanifest_${APP_ID}.acf`, 'utf8')
).AppState
const installed = real.InstalledDepots ?? {}
const shared = real.SharedDepots ?? {}

console.log(`\n${appinfo.common?.name} (${APP_ID})`)
console.log(`Steam InstalledDepots: [${Object.keys(installed).join(', ')}]`)
console.log(`Steam SharedDepots:    [${Object.keys(shared).join(', ') || '(none)'}]`)
console.log(`Steam SizeOnDisk:      ${real.SizeOnDisk}\n`)

const hdr = ['depot', 'inst?', 'oslist', 'osarch', 'dlcappid', 'depotfromapp', 'sharedinstall', 'optional', 'lang', 'size']
console.log(hdr.map((h, i) => h.padEnd([9, 6, 18, 7, 9, 13, 14, 9, 10, 12][i])).join(''))
console.log('─'.repeat(112))

let derivedSize = 0
for (const [id, d] of Object.entries(appinfo.depots ?? {})) {
  if (!/^\d+$/.test(id)) continue
  const cfg = d.config ?? {}
  const m = d.manifests?.public
  const size = typeof m === 'object' ? Number(m.size ?? 0) : 0
  const isInstalled = id in installed
  if (isInstalled) derivedSize += size
  const row = [
    id,
    isInstalled ? 'YES' : '·',
    cfg.oslist ?? '·',
    cfg.osarch ?? '·',
    d.dlcappid ?? '·',
    d.depotfromapp ?? '·',
    d.sharedinstall ?? '·',
    d.optional ?? '·',
    cfg.language ?? '·',
    String(size)
  ]
  console.log(row.map((c, i) => String(c).padEnd([9, 6, 18, 7, 9, 13, 14, 9, 10, 12][i])).join(''))
}

console.log('─'.repeat(112))
console.log(`Sum of sizes of the depots Steam installed: ${derivedSize}`)
console.log(`Steam's SizeOnDisk:                        ${real.SizeOnDisk}`)
console.log(
  `SizeOnDisk == sum(installed depot sizes)?  ${String(derivedSize) === real.SizeOnDisk ? 'YES' : 'NO'}\n`
)

// What does Steam record INSIDE each InstalledDepots entry?
console.log('Steam InstalledDepots entry shape:')
for (const [id, e] of Object.entries(installed)) {
  console.log(`  ${id}: ${JSON.stringify(e)}`)
}
console.log('')
