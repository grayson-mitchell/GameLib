import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { connectAuthenticated, ownedIds } from './auth.mjs'
import { parseVdfStrings } from './vdf-strings.mjs'
import { selectAllDepots, dlcAppIds } from './select.mjs'

const SA = `${homedir()}/Library/Application Support/Steam/steamapps`
const { client, licenses } = await connectAuthenticated()
const owned = await ownedIds(client, licenses)

for (const appId of [291650, 719040, 91310, 1295660, 251570]) {
  const info = await client.getProductInfo([appId], [], true)
  const a = info.apps[appId].appinfo
  const dlcIds = dlcAppIds(a)
  const di = dlcIds.length ? await client.getProductInfo(dlcIds, [], true) : { apps: {} }
  const dlcInfos = Object.fromEntries(dlcIds.filter(d => di.apps[d]?.appinfo).map(d => [d, di.apps[d].appinfo]))
  const picked = selectAllDepots(a, dlcInfos, owned)
  const real = parseVdfStrings(readFileSync(`${SA}/appmanifest_${appId}.acf`, 'utf8')).AppState

  const acfSum = Object.values(real.InstalledDepots).reduce((s, e) => s + Number(e.size ?? 0), 0)
  const picsSum = picked.reduce((s, d) => s + d.size, 0)

  console.log(`\n${a.common?.name}  (StateFlags ${real.StateFlags})`)
  console.log(`  SizeOnDisk (.acf)      : ${real.SizeOnDisk}`)
  console.log(`  sum of .acf depot sizes: ${acfSum}  ${String(acfSum) === real.SizeOnDisk ? '✓ MATCHES' : '✗'}`)
  console.log(`  sum of PICS depot sizes: ${picsSum}  ${String(picsSum) === real.SizeOnDisk ? '✓' : '✗ differs'}`)
  const zero = picked.filter(d => d.size === 0).map(d => d.id)
  if (zero.length) console.log(`  depots with size 0 in PICS: [${zero.join(', ')}]`)
}
client.logOff(); process.exit(0)
