/**
 * Dump the RAW PICS depot object for specific depots, so we can see every
 * attribute rather than the ones we guessed mattered.
 *
 * Usage: node raw-depot.mjs <appId> <depotId> [depotId...]
 */

import { connectAuthenticated } from './auth.mjs'

const [appIdArg, ...depotIds] = process.argv.slice(2)
const APP_ID = Number(appIdArg)

const { client } = await connectAuthenticated()
const info = await client.getProductInfo([APP_ID], [], true)
const appinfo = info.apps[APP_ID].appinfo

console.log(`\n=== ${appinfo.common?.name} (${APP_ID}) ===\n`)
console.log('app-level config keys:', Object.keys(appinfo.config ?? {}).join(', '))
if (appinfo.config?.optionaldlc) {
  console.log('config.optionaldlc:', JSON.stringify(appinfo.config.optionaldlc))
}
if (appinfo.extended?.optionaldlc) {
  console.log('extended.optionaldlc:', JSON.stringify(appinfo.extended.optionaldlc))
}
console.log('depots-level non-numeric keys:',
  Object.keys(appinfo.depots ?? {}).filter((k) => !/^\d+$/.test(k)).join(', '))
console.log()

for (const id of depotIds) {
  const d = appinfo.depots?.[id]
  console.log(`--- depot ${id} ---`)
  console.log(JSON.stringify(d, null, 2))
  console.log()
}

client.logOff()
process.exit(0)
