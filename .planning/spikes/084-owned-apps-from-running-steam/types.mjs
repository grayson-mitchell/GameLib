// Spike 084: PICS common.type/name for every app id in the given files, over an ANONYMOUS
// steam-user logon (no account, no Friends impact). Production options (067a convention).
//   node types.mjs out/types.json out/steam-sub.txt out/cm-license.txt
import { createRequire } from 'node:module'
import fs from 'node:fs'
const require = createRequire(new URL('../../../package.json', import.meta.url))
const SteamUser = require('steam-user')
const [outFile, ...inputs] = process.argv.slice(2)
const ids = [...new Set(inputs.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(Number)))]
const c = new SteamUser({ enablePicsCache: false, autoRelogin: false })
c.logOn({ anonymous: true })
await new Promise((r, j) => { c.once('loggedOn', r); c.once('error', j) })
const out = {}
for (let i = 0; i < ids.length; i += 200) {
  const chunk = ids.slice(i, i + 200)
  const { apps, unknownApps } = await c.getProductInfo(chunk, [], true)
  for (const [id, a] of Object.entries(apps)) {
    const common = a.appinfo?.common ?? {}
    out[id] = { type: String(common.type ?? '(none)').toLowerCase(), name: common.name ?? null, missingToken: !!a.missingToken }
  }
  for (const id of unknownApps ?? []) out[id] = { type: '(unknown)', name: null }
}
fs.writeFileSync(outFile, JSON.stringify(out, null, 1))
console.log(`types for ${Object.keys(out).length}/${ids.length} apps`)
c.logOff(); setTimeout(() => process.exit(0), 500)
