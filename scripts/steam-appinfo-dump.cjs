/**
 * steam-appinfo-dump.cjs — Phase 18 (MAC32-01) pre-work: PICS appinfo capture
 *
 * One-off developer harness (see .planning/todos/pending/steam-getproductinfo-appinfo-dump.md).
 * Research confirmed `config.launch[N].config.osarch` from community/tooling
 * sources only, NOT a canonical Valve schema doc — this script captures real
 * getProductInfo() payloads so Plan 02's osarch parser can be locked against
 * the actual key path, casing, and absent-vs-empty-string shape instead of
 * guessing.
 *
 * Self-contained: authenticates directly via steam-session's QR login flow
 * (no Electron / safeStorage — mirrors the connect shape in
 * src/backend/storeManagers/steam/user.ts, but standalone for a Node CLI).
 * Never accepts or persists credentials — the refresh token lives only in
 * this process's memory for the duration of the run.
 *
 * Usage:
 *   node scripts/steam-appinfo-dump.cjs <appId> [<appId> ...] --out <path>
 *
 * Steam-only V1 dev tooling — deliberately kept out of the app bundle
 * (scripts/ dir, .cjs extension already ignored by the ESLint flat config
 * per quick-task 260630-uod).
 */

'use strict'

const fs = require('fs')
const path = require('path')
const SteamUserLib = require('steam-user')
const { LoginSession, EAuthTokenPlatformType } = require('steam-session')

const CM_CONNECT_TIMEOUT_MS = 15000
const QR_LOGIN_TIMEOUT_MS = 120000

function parseArgs(argv) {
  const args = argv.slice(2)
  const outIndex = args.indexOf('--out')
  let outPath = null
  let rest = args
  if (outIndex !== -1) {
    outPath = args[outIndex + 1] ?? null
    rest = args.slice(0, outIndex).concat(args.slice(outIndex + 2))
  }
  return { appIdArgs: rest, outPath }
}

// T-18-01-01 mitigation: reuse the /^\d+$/ numeric-appid guard already
// established for buildSteamProtocolUrl (src/backend/storeManagers/steam/games.ts:50-62)
// before any argv value reaches the getProductInfo RPC call.
function validateAppIds(appIdArgs) {
  const validated = []
  for (const raw of appIdArgs) {
    if (!/^\d+$/.test(raw)) {
      console.error(`Rejected non-numeric AppID argument: "${raw}"`)
      continue
    }
    validated.push(parseInt(raw, 10))
  }
  return validated
}

// QR login via steam-session — mirrors user.ts's startQRLogin flow
// (LoginSession + EAuthTokenPlatformType.SteamClient), standalone.
function qrLogin() {
  return new Promise((resolve, reject) => {
    const session = new LoginSession(EAuthTokenPlatformType.SteamClient)
    session.loginTimeout = QR_LOGIN_TIMEOUT_MS

    session.once('authenticated', () => {
      resolve(session.refreshToken)
    })
    session.once('timeout', () => {
      reject(new Error('Steam QR login session timed out'))
    })
    session.once('error', (err) => {
      reject(err)
    })

    session
      .startWithQR()
      .then((response) => {
        console.log('\nScan this URL with the Steam mobile app to log in:')
        console.log(response.qrChallengeUrl)
        console.log('(waiting for approval, up to 2 minutes...)\n')
      })
      .catch(reject)
  })
}

// Connects a steam-user client with a refresh token. enablePicsCache is left
// at false (matching user.ts:210's production client) — getProductInfo()
// works identically regardless of this flag; the flag only controls whether
// the response is ALSO cached in this.picsCache for getOwnedApps()/ownsApp()
// (18-RESEARCH.md Pitfall 2). This script does not reconfigure it.
function connectClient(refreshToken) {
  return new Promise((resolve, reject) => {
    const client = new SteamUserLib({ enablePicsCache: false })

    const timeout = setTimeout(() => {
      reject(new Error('Steam CM connection timed out after 15s'))
    }, CM_CONNECT_TIMEOUT_MS)

    client.once('loggedOn', () => {
      clearTimeout(timeout)
      resolve(client)
    })
    client.once('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    client.logOn({ refreshToken })
  })
}

// Logs the exact key path + casing observed for oslist/osarch, and whether
// the no-osarch case is an absent key vs an empty string — the finding this
// whole harness exists to produce (see the todo's "Do" list, item 2).
function logObservedShape(appIdNum, appinfo) {
  const launch = appinfo?.config?.launch
  const launchEntries = launch ? Object.values(launch) : []
  if (launchEntries.length === 0) {
    console.log(`AppID ${appIdNum}: no config.launch entries found`)
    return
  }
  for (const launchEntry of launchEntries) {
    const cfg = launchEntry?.config ?? {}
    const oslistKey = Object.keys(cfg).find((k) => k.toLowerCase() === 'oslist')
    const osarchKey = Object.keys(cfg).find((k) => k.toLowerCase() === 'osarch')
    const osarchPresent = osarchKey !== undefined
    const osarchValue = osarchKey ? cfg[osarchKey] : undefined
    console.log(
      `AppID ${appIdNum}: oslist key="${oslistKey ?? '(absent)'}" value=${JSON.stringify(
        oslistKey ? cfg[oslistKey] : undefined
      )}; osarch key="${osarchKey ?? '(absent)'}" value=${JSON.stringify(
        osarchValue
      )} — osarch is ${
        !osarchPresent
          ? 'ABSENT (missing key)'
          : osarchValue === ''
            ? 'an EMPTY STRING'
            : 'present'
      }`
    )
  }
}

// One call per AppID, matching the exact getProductInfo([appIdNum], []) call
// shape used by the real ensureMacArchHint() call site (Plan 02, mirrored
// from 18-RESEARCH.md Pattern 2 / games.ts:479-505 ensurePlatformsCaptured).
async function dumpAppInfo(client, appIds) {
  const results = {}
  for (const appIdNum of appIds) {
    const result = await client.getProductInfo([appIdNum], [])
    const entry = result.apps[appIdNum]
    if (!entry) {
      console.warn(`No appinfo returned for AppID ${appIdNum}`)
      continue
    }
    results[appIdNum] = entry.appinfo
    logObservedShape(appIdNum, entry.appinfo)
  }
  return results
}

async function main() {
  const { appIdArgs, outPath } = parseArgs(process.argv)
  if (!outPath) {
    console.error(
      'Usage: node scripts/steam-appinfo-dump.cjs <appId> [<appId> ...] --out <path>'
    )
    process.exitCode = 1
    return
  }

  const appIds = validateAppIds(appIdArgs)
  if (appIds.length === 0) {
    console.error('No valid numeric AppIDs supplied.')
    process.exitCode = 1
    return
  }

  console.log('Starting Steam QR login...')
  const refreshToken = await qrLogin()
  console.log('Authenticated. Connecting steam-user client...')
  const client = await connectClient(refreshToken)
  console.log(
    `Connected as SteamID ${client.steamID?.getSteamID64()}. Fetching product info for AppIDs: ${appIds.join(', ')}`
  )

  const dump = await dumpAppInfo(client, appIds)

  // Single-AppID runs (the expected usage per the checkpoint's how-to-verify
  // steps — one fixture file per title) write the raw appinfo object
  // unwrapped, so the fixture JSON matches the exact shape the parser
  // (Plan 02) will read at runtime. Multi-AppID runs write a map keyed by
  // AppID for convenience.
  const output = appIds.length === 1 ? (dump[appIds[0]] ?? null) : dump

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2))
  console.log(`\nWrote appinfo dump to ${outPath}`)

  client.logOff()
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error('steam-appinfo-dump failed:', err)
    process.exit(1)
  })
