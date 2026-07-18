/**
 * Hypothesis: packages grant DEPOTS, not just apps.
 *
 * Dead Island depot 201741 and Trine 2 depot 35724 are IDENTICAL in PICS
 * (optional=1, systemdefined=1, no oslist, no dlcappid) — yet Steam installed
 * one and not the other. Nothing in the app metadata can tell them apart.
 *
 * If package licenses carry a `depotids` list, then depot ownership is granted
 * at the PACKAGE level and that is the real discriminator.
 *
 * READ-ONLY.
 */

import { connectAuthenticated } from './auth.mjs'

const { client, licenses } = await connectAuthenticated()
const packageIds = licenses.map((l) => l.package_id)
const info = await client.getProductInfo([], packageIds, true)

const pkgs = Object.values(info.packages ?? {})
console.log(`\n${pkgs.length} owned packages\n`)

// What keys does a packageinfo actually carry?
const sample = pkgs.find((p) => (p.packageinfo?.depotids ?? []).length > 0)
console.log('packageinfo keys:', Object.keys(sample?.packageinfo ?? {}).join(', '))

const ownedApps = new Set()
const ownedDepots = new Set()
for (const p of pkgs) {
  for (const a of p.packageinfo?.appids ?? []) ownedApps.add(Number(a))
  for (const d of p.packageinfo?.depotids ?? []) ownedDepots.add(Number(d))
}

console.log(`\nowned appIds  : ${ownedApps.size}`)
console.log(`owned depotIds: ${ownedDepots.size}\n`)

console.log('THE DISCRIMINATOR TEST — two depots identical in PICS:\n')
for (const [label, depot] of [
  ['Dead Island 201741 (Steam INSTALLED it)', 201741],
  ['Dead Island 91347  (Steam INSTALLED it)', 91347],
  ['Trine 2     35724  (Steam did NOT install it)', 35724]
]) {
  console.log(`  ${label.padEnd(48)} owned-depot? ${ownedDepots.has(depot) ? 'YES' : 'NO'}`)
}
console.log('')

client.logOff()
process.exit(0)
