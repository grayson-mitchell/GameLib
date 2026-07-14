/**
 * Spike 001 — Step 1: LIVE SWAP. The only script here that writes to Steam.
 *
 * Tests the load-bearing unknown: will the Steam client ADOPT an
 * appmanifest_{appId}.acf that GameLib wrote, rather than one Steam generated?
 *
 * SAFETY MODEL
 *   - The game's files are NEVER touched. Only the ~2KB .acf is replaced.
 *   - A full backup (game dir + original .acf) is taken first and verified.
 *   - `swap` REFUSES to run unless the backup exists and Steam is quit.
 *   - `restore` puts the original .acf back. Because the files were never
 *     touched, Steam sees a valid install again — NO RE-DOWNLOAD.
 *
 * Usage:
 *   node live.mjs backup  [appId]   # copy game dir + .acf to backup, verify
 *   node live.mjs swap    [appId]   # write OUR .acf (requires backup + Steam quit)
 *   node live.mjs observe [appId]   # after restarting Steam: what did it do?
 *   node live.mjs restore [appId]   # roll back to Steam's original .acf
 */

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  statSync
} from 'node:fs'
import { homedir } from 'node:os'
import SteamUser from 'steam-user'
import {
  buildManifest,
  selectDepots,
  readSteamId64,
  renderManifest,
  STATE_FLAGS_PENDING_VERIFY,
  StateFlags
} from './acf.mjs'
import { parseVdfStrings } from './vdf-strings.mjs'

const CMD = process.argv[2]
const APP_ID = Number(process.argv[3] ?? 264160)

const STEAM_ROOT = `${homedir()}/Library/Application Support/Steam`
const STEAMAPPS = `${STEAM_ROOT}/steamapps`
const ACF = `${STEAMAPPS}/appmanifest_${APP_ID}.acf`
const BACKUP_DIR = `${homedir()}/.gamelib-spike-backup/${APP_ID}`
const BACKUP_ACF = `${BACKUP_DIR}/appmanifest_${APP_ID}.acf`

const log = (...a) => console.log(...a)
const die = (msg) => {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

const steamRunning = () => {
  try {
    execFileSync('pgrep', ['-x', 'steam_osx'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

const readAcf = (p) => parseVdfStrings(readFileSync(p, 'utf8')).AppState

const decodeFlags = (n) =>
  Object.entries(StateFlags)
    .filter(([, bit]) => n & bit)
    .map(([name]) => name)
    .join(' | ') || '(none)'

function installDir(state) {
  return `${STEAMAPPS}/common/${state.installdir}`
}

// ── backup ───────────────────────────────────────────────────────────────────

function backup() {
  if (!existsSync(ACF)) die(`No manifest at ${ACF}`)
  const state = readAcf(ACF)
  const gameDir = installDir(state)
  if (!existsSync(gameDir)) die(`Game dir not found: ${gameDir}`)

  mkdirSync(BACKUP_DIR, { recursive: true })

  log(`\nBacking up "${state.name}" (${APP_ID})`)
  log(`  manifest : ${ACF}`)
  log(`  game dir : ${gameDir}`)
  log(`  → backup : ${BACKUP_DIR}\n`)

  copyFileSync(ACF, BACKUP_ACF)
  log('◆ Copying game files (no network — local copy)...')
  execFileSync('cp', ['-Rp', gameDir, `${BACKUP_DIR}/`], { stdio: 'inherit' })

  // Verify: byte-count the copy against the original.
  const du = (p) => execFileSync('du', ['-sk', p]).toString().split('\t')[0].trim()
  const origKb = du(gameDir)
  const copyKb = du(`${BACKUP_DIR}/${state.installdir}`)

  log(`\n  original : ${origKb} KB`)
  log(`  backup   : ${copyKb} KB`)
  if (origKb !== copyKb) die('Backup size mismatch — refusing to proceed.')
  if (readFileSync(ACF, 'utf8') !== readFileSync(BACKUP_ACF, 'utf8'))
    die('Backup .acf mismatch — refusing to proceed.')

  log('\n✓ Backup verified.')
  log(`\n  Roll back at any time with:`)
  log(`    node live.mjs restore ${APP_ID}\n`)
}

// ── swap ─────────────────────────────────────────────────────────────────────

async function swap() {
  if (!existsSync(BACKUP_ACF)) die(`No verified backup. Run: node live.mjs backup ${APP_ID}`)
  if (steamRunning())
    die('Steam is still running. Quit Steam completely, then re-run this command.')

  const original = readAcf(ACF)
  log(`\nGenerating our manifest for "${original.name}" (${APP_ID})...`)

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

  const realDepots = Object.keys(original.InstalledDepots ?? {})
  let os = 'macos'
  for (const cand of ['macos', 'windows', 'linux']) {
    const picked = selectDepots(appinfo, { os: cand }).map((d) => d.id)
    if (picked.length === realDepots.length && picked.every((d) => realDepots.includes(d))) {
      os = cand
      break
    }
  }
  const depots = selectDepots(appinfo, { os })

  // Guardrail: only swap when we reproduce Steam's depot set exactly. Spike 001
  // Finding 2 — our PICS-only selection is wrong for DLC-bearing games, and a
  // wrong InstalledDepots set is the one thing that WOULD provoke a re-download.
  const picked = depots.map((d) => d.id)
  const exact =
    picked.length === realDepots.length && picked.every((d) => realDepots.includes(d))
  if (!exact) {
    die(
      `Our depot selection [${picked.join(', ')}] does not match Steam's ` +
        `[${realDepots.join(', ')}]. Refusing to swap — this is the case that ` +
        `provokes a re-download. Use an app we reproduce exactly (e.g. 264160).`
    )
  }

  const ours = buildManifest({
    appId: APP_ID,
    appinfo,
    steamId64: readSteamId64(STEAM_ROOT),
    depots,
    stateFlags: STATE_FLAGS_PENDING_VERIFY
  })

  writeFileSync(ACF, renderManifest(ours))

  log(`\n✓ Swapped in our manifest.`)
  log(`  StateFlags: ${STATE_FLAGS_PENDING_VERIFY} (${decodeFlags(STATE_FLAGS_PENDING_VERIFY)})`)
  log(`  Depots    : [${picked.join(', ')}]`)
  log(`  Game files: UNTOUCHED\n`)
  log('  Now: start Steam, watch what it does to the game, then run:')
  log(`    node live.mjs observe ${APP_ID}\n`)
}

// ── observe ──────────────────────────────────────────────────────────────────

function observe() {
  if (!existsSync(ACF)) {
    log('\n✗ Steam DELETED the manifest — it rejected our file outright.\n')
    return
  }
  const now = readAcf(ACF)
  const flags = Number(now.StateFlags)
  const ourFlags = STATE_FLAGS_PENDING_VERIFY

  log(`\nManifest state after Steam restart — "${now.name}" (${APP_ID})\n`)
  log(`  StateFlags : ${now.StateFlags}  (${decodeFlags(flags)})`)
  log(`  we wrote   : ${ourFlags}  (${decodeFlags(ourFlags)})`)
  log(`  buildid    : ${now.buildid}`)
  log(`  SizeOnDisk : ${now.SizeOnDisk}`)
  log(`  BytesToDownload: ${now.BytesToDownload}   BytesDownloaded: ${now.BytesDownloaded}`)
  log(`  depots     : ${JSON.stringify(now.InstalledDepots)}`)

  const gameDir = installDir(now)
  const stillThere = existsSync(gameDir)
  log(`  game dir   : ${stillThere ? 'present' : 'GONE'}`)

  log('\n──────────────────────────────────────────────────────────────')
  if (flags & StateFlags.FullyInstalled && !(flags & StateFlags.UpdateRequired)) {
    log('✓ ADOPTED — Steam verified our manifest and flipped StateFlags to FullyInstalled.')
    log('  This is the outcome the architecture depends on.')
  } else if (flags === ourFlags) {
    log('⚠ UNCHANGED — Steam has not acted on it yet.')
    log('  Steam may only reconcile on library view / launch. Open the game in')
    log('  your library, then re-run observe.')
  } else if (flags & (StateFlags.UpdateRunning | StateFlags.UpdateStarted)) {
    log('⚠ Steam is UPDATING/DOWNLOADING. Check the download queue — if it is')
    log('  re-fetching the whole game, our manifest was not trusted.')
  } else {
    log(`? Steam rewrote StateFlags to ${flags}. Interpret via the decode above.`)
  }
  log('──────────────────────────────────────────────────────────────\n')
  log(`  Roll back: node live.mjs restore ${APP_ID}\n`)
}

// ── restore ──────────────────────────────────────────────────────────────────

function restore() {
  if (!existsSync(BACKUP_ACF)) die(`No backup at ${BACKUP_ACF}`)
  if (steamRunning()) die('Quit Steam first, then re-run restore.')

  copyFileSync(BACKUP_ACF, ACF)
  log(`\n✓ Restored Steam's original manifest for ${APP_ID}.`)

  const state = readAcf(ACF)
  const gameDir = installDir(state)
  log(`  StateFlags : ${state.StateFlags} (${decodeFlags(Number(state.StateFlags))})`)
  log(`  game dir   : ${existsSync(gameDir) ? 'present' : 'MISSING — restore from backup:'}`)
  if (!existsSync(gameDir)) {
    log(`    cp -Rp "${BACKUP_DIR}/${state.installdir}" "${STEAMAPPS}/common/"`)
  }
  log('\n  Start Steam — the game should show as installed again. No download.\n')
}

const cmds = { backup, swap, observe, restore }
if (!cmds[CMD]) die(`Usage: node live.mjs <backup|swap|observe|restore> [appId]`)
await cmds[CMD]()
