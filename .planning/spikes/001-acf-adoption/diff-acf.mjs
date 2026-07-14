/**
 * Spike 001 — Step 0: READ-ONLY.
 *
 * Generates an appmanifest_{appId}.acf purely from PICS data (anonymous CM
 * connection — no login, no credentials) and diffs it field-by-field against
 * the manifest the real Steam client wrote for the same game.
 *
 * NOTHING IS WRITTEN TO THE STEAM INSTALL. This script only reads.
 * Its output tells us, before we ever touch Steam, which fields we can derive
 * correctly and which we cannot.
 *
 * Usage: node diff-acf.mjs [appId]
 */

import SteamUser from 'steam-user'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import {
  buildManifest,
  selectDepots,
  readSteamId64,
  renderManifest,
  STATE_FLAGS_PENDING_VERIFY
} from './acf.mjs'
import { parseVdfStrings } from './vdf-strings.mjs'
import { parse as brokenVdfParse } from '@node-steam/vdf'

const APP_ID = Number(process.argv[2] ?? 264160) // WazHack — small, real, already installed
const STEAM_ROOT = `${homedir()}/Library/Application Support/Steam`
const REAL_ACF = `${STEAM_ROOT}/steamapps/appmanifest_${APP_ID}.acf`

const log = (...a) => console.log(...a)
const hr = () => log('─'.repeat(78))

if (!existsSync(REAL_ACF)) {
  console.error(`No installed manifest at ${REAL_ACF} — pick an installed appId.`)
  process.exit(1)
}

/** Fetch PICS product info over an ANONYMOUS connection. No user login. */
async function fetchAppInfo(appId) {
  const client = new SteamUser()
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.logOff()
      reject(new Error('Timed out connecting to Steam CM (30s)'))
    }, 30000)

    client.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    client.on('loggedOn', async () => {
      try {
        const res = await client.getProductInfo([appId], [], true)
        clearTimeout(timeout)
        client.logOff()
        resolve(res.apps[appId]?.appinfo)
      } catch (err) {
        clearTimeout(timeout)
        client.logOff()
        reject(err)
      }
    })

    client.logOn({ anonymous: true })
  })
}

/** Flatten nested VDF to dotted paths so we can diff leaf-by-leaf. */
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') flatten(v, path, out)
    else out[path] = String(v)
  }
  return out
}

const main = async () => {
  log(`\nSpike 001 — .acf generation vs. Steam ground truth (appId ${APP_ID})`)
  log('READ-ONLY. Nothing in your Steam install is modified.\n')

  log('◆ Connecting to Steam CM anonymously (no login)...')
  const appinfo = await fetchAppInfo(APP_ID)
  if (!appinfo) throw new Error(`PICS returned no appinfo for ${APP_ID}`)
  log(`✓ PICS: "${appinfo.common?.name}" buildid=${appinfo.depots?.branches?.public?.buildid}`)

  const steamId64 = readSteamId64(STEAM_ROOT)
  log(`✓ SteamID64 from loginusers.vdf: ${steamId64}`)

  // Ground truth — what Steam itself wrote. Parsed with the STRING-PRESERVING
  // parser. Using @node-steam/vdf here silently rounds the 64-bit manifest GID
  // and produces a phantom mismatch (see the precision check below).
  const rawAcf = readFileSync(REAL_ACF, 'utf8')
  const real = parseVdfStrings(rawAcf)
  const realState = real.AppState

  // Prove the precision hazard rather than asserting it.
  hr()
  log('64-BIT PRECISION CHECK — @node-steam/vdf vs. raw file\n')
  const brokenState = brokenVdfParse(rawAcf).AppState
  const depotId = Object.keys(realState.InstalledDepots)[0]
  const checks = [
    ['InstalledDepots.' + depotId + '.manifest',
      realState.InstalledDepots[depotId].manifest,
      brokenState.InstalledDepots[depotId].manifest],
    ['LastOwner', realState.LastOwner, brokenState.LastOwner]
  ]
  for (const [field, truth, viaLib] of checks) {
    const ok = String(truth) === String(viaLib)
    log(`  ${field}`)
    log(`    raw file            : ${truth}`)
    log(`    @node-steam/vdf     : ${viaLib}  ${ok ? '✓' : '✗ CORRUPTED'}`)
  }
  log(`\n  Number.MAX_SAFE_INTEGER: ${Number.MAX_SAFE_INTEGER}`)
  log('  → 64-bit IDs must be handled as STRINGS end to end.\n')

  // Which OS did Steam actually install? Infer from the real manifest's depots
  // so we compare like with like rather than guessing.
  const realDepotIds = Object.keys(realState.InstalledDepots ?? {})

  hr()
  log('DEPOT SELECTION — can we pick the same depots Steam did?\n')
  for (const os of ['macos', 'windows', 'linux']) {
    const picked = selectDepots(appinfo, { os }).map((d) => d.id)
    const match = picked.length === realDepotIds.length && picked.every((d) => realDepotIds.includes(d))
    log(`  os=${os.padEnd(8)} → [${picked.join(', ') || '(none)'}] ${match ? '✓ MATCHES STEAM' : ''}`)
  }
  log(`  Steam installed: [${realDepotIds.join(', ')}]`)

  // Use whichever OS reproduces Steam's depot set.
  let os = 'macos'
  for (const candidate of ['macos', 'windows', 'linux']) {
    const picked = selectDepots(appinfo, { os: candidate }).map((d) => d.id)
    if (picked.length === realDepotIds.length && picked.every((d) => realDepotIds.includes(d))) {
      os = candidate
      break
    }
  }

  const depots = selectDepots(appinfo, { os })
  const ours = buildManifest({
    appId: APP_ID,
    appinfo,
    steamId64,
    depots,
    stateFlags: STATE_FLAGS_PENDING_VERIFY
  })

  hr()
  log('FIELD DIFF — ours (derived from PICS) vs. Steam ground truth\n')

  const flatOurs = flatten(ours.AppState)
  const flatReal = flatten(realState)
  const allKeys = [...new Set([...Object.keys(flatOurs), ...Object.keys(flatReal)])].sort()

  // Fields where a difference is EXPECTED and harmless, with the reason. These
  // are install-specific bookkeeping, NOT content identity. Steam recomputes
  // them during the verify pass that StateFlags=1026 requests.
  //
  // The fields that DO determine content identity — and would trigger a
  // re-download if wrong — are deliberately NOT on this list:
  //   InstalledDepots.*.manifest (64-bit GID), SizeOnDisk, buildid, installdir.
  const expectedDiff = new Map([
    ['StateFlags', 'by design — 1026 asks Steam to verify rather than trusting us'],
    ['lastupdated', 'timestamp of OUR install; differing is correct'],
    ['LastPlayed', 'we have never played it — Steam owns this field'],
    ['BytesToDownload', "Steam's value records the last DELTA patch, not the full install"],
    ['BytesDownloaded', "Steam's value records the last DELTA patch, not the full install"],
    ['BytesToStage', "Steam's value records the last DELTA patch, not the full install"],
    ['BytesStaged', "Steam's value records the last DELTA patch, not the full install"]
  ])

  const critical = []
  const benign = []
  const missing = []
  const extra = []

  // Content-identity fields: if any of these is wrong, Steam re-downloads or
  // corrupts the entry. These are the ONLY ones that can fail the spike.
  const identityFields = (k) =>
    k === 'SizeOnDisk' ||
    k === 'buildid' ||
    k === 'installdir' ||
    k === 'appid' ||
    k === 'LastOwner' ||
    k.startsWith('InstalledDepots.')

  for (const key of allKeys) {
    const o = flatOurs[key]
    const r = flatReal[key]
    const leaf = key.split('.').pop()
    if (o === undefined) {
      ;(expectedDiff.has(leaf) ? benign : missing).push([key, r, '(omitted)'])
    } else if (r === undefined) {
      extra.push([key, o])
    } else if (o !== r) {
      ;(expectedDiff.has(leaf) ? benign : critical).push([key, o, r])
    }
  }

  hr()
  log('CONTENT-IDENTITY FIELDS — the ones that trigger a re-download if wrong\n')
  for (const key of allKeys.filter(identityFields)) {
    const ok = flatOurs[key] === flatReal[key]
    log(`  ${ok ? '✓' : '✗'} ${key.padEnd(38)} ${flatOurs[key] ?? '(omitted)'}`)
  }
  log('')

  const matched = allKeys.length - critical.length - benign.length - missing.length - extra.length
  log(`  ✓ identical:        ${matched}`)
  log(`  ~ expected diff:    ${benign.length}`)
  log(`  ✗ UNEXPECTED diff:  ${critical.length}`)
  log(`  ? we omit:          ${missing.length}`)
  log(`  + we add:           ${extra.length}\n`)

  if (benign.length) {
    log('~ Expected differences (install-specific bookkeeping, not content identity):')
    for (const [k, o, r] of benign) {
      const leaf = k.split('.').pop()
      log(`    ${k}  ours=${o}  real=${r}`)
      log(`      → ${expectedDiff.get(leaf)}`)
    }
    log('')
  }
  if (critical.length) {
    log('✗ UNEXPECTED differences — these are the risk:')
    for (const [k, o, r] of critical) log(`    ${k}\n      ours: ${o}\n      real: ${r}`)
    log('')
  }
  if (missing.length) {
    log('? Fields Steam writes that we do NOT (may or may not matter):')
    for (const [k, r] of missing) log(`    ${k} = ${r}`)
    log('')
  }
  if (extra.length) {
    log('+ Fields we write that Steam does NOT:')
    for (const [k, o] of extra) log(`    ${k} = ${o}`)
    log('')
  }

  const outPath = new URL(`./generated_appmanifest_${APP_ID}.acf`, import.meta.url).pathname
  writeFileSync(outPath, renderManifest(ours))
  hr()
  log(`Generated manifest written to spike dir (NOT to Steam):`)
  log(`  ${outPath}\n`)

  const verdict =
    critical.length === 0
      ? 'PASS — every field we derive matches Steam. Live swap is low-risk.'
      : `RISK — ${critical.length} field(s) we cannot derive correctly. Review before any swap.`
  log(`VERDICT (Step 0): ${verdict}\n`)
}

main().catch((err) => {
  console.error('\n✗ Spike failed:', err.message)
  process.exit(1)
})
