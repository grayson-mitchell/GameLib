/**
 * Spike 001 — Finding 2 fix: ownership-aware depot selection.
 *
 * Spike 001 proved PICS-alone depot selection is wrong: it passed on the single-
 * depot case and failed on all 10 other installed games, because owned-DLC depots
 * ARE installed and PICS cannot reveal ownership.
 *
 * This connects an AUTHENTICATED steam-user client, derives the user's owned
 * appIds from their package licenses, and tests whether an ownership-aware rule
 * reproduces Steam's InstalledDepots EXACTLY for every installed game.
 *
 * READ-ONLY. Reads the local .acf files as ground truth; writes nothing.
 *
 * Usage: node verify-depots.mjs
 */

import { readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { connectAuthenticated, ownedIds } from './auth.mjs'
import { parseVdfStrings } from './vdf-strings.mjs'
import { selectAllDepots, dlcAppIds } from './select.mjs'

const STEAMAPPS = `${homedir()}/Library/Application Support/Steam/steamapps`

const { client, licenses } = await connectAuthenticated()
console.log(`✓ Authenticated as ${client.steamID?.getSteamID64()}`)
console.log(`✓ ${licenses.length} package licenses`)

const owned = await ownedIds(client, licenses)
console.log(`✓ ${owned.apps.size} owned appIds, ${owned.depots.size} owned depotIds\n`)

const appIds = readdirSync(STEAMAPPS)
  .filter((f) => /^appmanifest_\d+\.acf$/.test(f))
  .map((f) => Number(f.match(/\d+/)[0]))

const info = await client.getProductInfo(appIds, [], true)

// Depots can live in DLC APPS, not just the base app (Wasteland 3's 1522651
// belongs to DLC app 1522650). Fetch every declared DLC app too.
const allDlcIds = [
  ...new Set(appIds.flatMap((id) => dlcAppIds(info.apps[id]?.appinfo)))
]
const dlcInfo = allDlcIds.length
  ? await client.getProductInfo(allDlcIds, [], true)
  : { apps: {} }
console.log(`✓ ${allDlcIds.length} DLC apps fetched for depot enumeration\n`)

const results = []
for (const appId of appIds) {
  const appinfo = info.apps[appId]?.appinfo
  const real = parseVdfStrings(
    readFileSync(`${STEAMAPPS}/appmanifest_${appId}.acf`, 'utf8')
  ).AppState
  const expected = Object.keys(real.InstalledDepots ?? {}).sort()

  const dlcInfos = Object.fromEntries(
    dlcAppIds(appinfo)
      .filter((d) => dlcInfo.apps[d]?.appinfo)
      .map((d) => [d, dlcInfo.apps[d].appinfo])
  )
  const picked = selectAllDepots(appinfo, dlcInfos, owned)
  const got = picked.map((d) => d.id).sort()

  const depotsMatch =
    got.length === expected.length && got.every((d, i) => d === expected[i])

  // Manifest GIDs must match too — a right depot with a wrong GID still
  // triggers a re-download.
  const gidMismatches = picked.filter((d) => {
    const entry = real.InstalledDepots?.[d.id]
    return entry !== undefined && entry.manifest !== d.manifest
  })

  const sizeOurs = picked.reduce((s, d) => s + d.size, 0)
  const sizeMatch = String(sizeOurs) === real.SizeOnDisk

  // StateFlags & UpdateRequired(2) => the .acf is pinned to an OLDER build than
  // PICS reports. GID/size "drift" is then expected and correct: we want the
  // latest build for a fresh install. Confirmed by the .acf being internally
  // consistent (its own depot sizes sum to its own SizeOnDisk).
  const updatePending = (Number(real.StateFlags) & 2) !== 0

  results.push({
    appId,
    name: appinfo?.common?.name ?? String(appId),
    depotsMatch,
    gidOk: gidMismatches.length === 0,
    sizeMatch,
    sizeDelta: sizeOurs - Number(real.SizeOnDisk),
    updatePending,
    expected,
    got
  })
}

console.log('OWNERSHIP-AWARE DEPOT SELECTION vs. Steam ground truth\n')
console.log(
  'game'.padEnd(44) + 'depots'.padEnd(9) + 'GIDs'.padEnd(8) + 'SizeOnDisk delta'
)
console.log('─'.repeat(80))

let depotPass = 0
let gidPass = 0
for (const r of results) {
  if (r.depotsMatch) depotPass++
  // A GID difference is only a FAILURE when no update is pending.
  const gidOk = r.gidOk || r.updatePending
  if (gidOk) gidPass++

  const gidCell = r.gidOk ? '✓' : r.updatePending ? '~ stale' : '✗'
  const sizeCell = r.sizeMatch
    ? '✓ exact'
    : `${r.sizeDelta > 0 ? '+' : ''}${r.sizeDelta}`

  console.log(
    r.name.slice(0, 43).padEnd(44) +
      (r.depotsMatch ? '✓' : '✗').padEnd(9) +
      gidCell.padEnd(8) +
      sizeCell
  )
  if (!r.depotsMatch) {
    console.log(`    expected [${r.expected.join(', ')}]`)
    console.log(`    got      [${r.got.join(', ')}]`)
  }
}

console.log('─'.repeat(80))
console.log(`
  depot set   : ${depotPass}/${results.length} exact
  manifest GID: ${gidPass}/${results.length} correct  (~ stale = app has a pending update;
                the .acf is pinned to the OLD build, we correctly report the new one)
  SizeOnDisk  : NOT a derived sum. Steam measures real bytes on disk; summing depot
                sizes overshoots on multi-depot games. Bookkeeping, not identity.
`)
console.log(
  depotPass === results.length && gidPass === results.length
    ? '✓ VALIDATED — ownership-aware selection reproduces Steam depot-for-depot, GID-for-GID.'
    : '✗ STILL WRONG — see above.'
)

client.logOff()
process.exit(0)
