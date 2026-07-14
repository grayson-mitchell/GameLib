/**
 * Production-shaped appmanifest_{appId}.acf generator.
 *
 * This is deliberately written the way GameLib would write it for real: every
 * field is DERIVED from data we can obtain in production (PICS product info +
 * the local Steam config), never copied from an existing Steam-written manifest.
 * Copying Steam's file would make the spike prove nothing.
 *
 * Sources of truth:
 *   - buildid, depot manifest GIDs, depot sizes, installdir, name → PICS (getProductInfo)
 *   - LastOwner (SteamID64)                                        → local loginusers.vdf
 *                                                                    (in production: configStore userData.steamId)
 *   - SizeOnDisk                                                   → sum of installed depot sizes
 */

import { parse as vdfParse, stringify as vdfStringify } from '@node-steam/vdf'
import { readFileSync } from 'node:fs'
import { parseVdfStrings, renderVdf } from './vdf-strings.mjs'

/**
 * Render an AppState to Steam's VDF form.
 *
 * Uses our own string-preserving renderer rather than @node-steam/vdf.stringify
 * so that 64-bit manifest GIDs are emitted verbatim. See vdf-strings.mjs.
 */
export function renderManifest(manifest) {
  return renderVdf(manifest)
}

/** StateFlags bitmask (reverse-engineered — no Valve documentation exists). */
export const StateFlags = {
  Uninstalled: 1,
  UpdateRequired: 2,
  FullyInstalled: 4,
  Encrypted: 8,
  Locked: 16,
  FilesMissing: 32,
  AppRunning: 64,
  FilesCorrupt: 128,
  UpdateRunning: 256,
  UpdatePaused: 512,
  UpdateStarted: 1024,
  Uninstalling: 2048
}

/**
 * The value we write for an install Steam did not perform.
 *
 * UpdateRequired(2) + UpdateStarted(1024) = 1026.
 *
 * We deliberately do NOT claim FullyInstalled(4). Claiming 4 asserts our
 * download was byte-perfect; if it wasn't, Steam trusts the lie and the user
 * gets a broken game. Writing 1026 instead asks Steam to run its own verify
 * pass — it repairs anything we got wrong and flips the flag to 4 itself.
 * Steam becomes the safety net rather than the adversary.
 */
export const STATE_FLAGS_PENDING_VERIFY =
  StateFlags.UpdateRequired | StateFlags.UpdateStarted // 1026

/** PICS depot maps contain non-depot keys. Only numeric keys are real depots. */
function isDepotId(key) {
  return /^\d+$/.test(key)
}

/**
 * Pick the depots that actually get installed for a given platform.
 *
 * Depots carry an optional config.oslist. A depot with no oslist is
 * platform-agnostic (shared content) and is always installed. DLC depots
 * (dlcappid) and shared depots (depotfromapp) are excluded — Steam tracks
 * those separately in SharedDepots, not InstalledDepots.
 */
export function selectDepots(appinfo, { os = 'macos', arch = '64' } = {}) {
  const depots = appinfo?.depots ?? {}
  const selected = []

  for (const [id, depot] of Object.entries(depots)) {
    if (!isDepotId(id)) continue
    if (depot?.dlcappid) continue // DLC — not part of the base install
    if (depot?.depotfromapp) continue // shared redistributable — SharedDepots
    if (depot?.sharedinstall) continue

    const oslist = depot?.config?.oslist
    if (oslist && !oslist.split(',').includes(os)) continue

    const osarch = depot?.config?.osarch
    if (osarch && osarch !== arch) continue

    const manifest = readManifest(depot)
    if (!manifest) continue // depot has no public manifest — nothing to install

    // NOTE: manifest.gid stays a STRING. It is a 64-bit value and does not
    // survive a JS Number (see vdf-strings.mjs). size/download are safely small.
    selected.push({
      id,
      manifest: manifest.gid,
      size: Number(manifest.size ?? 0),
      download: Number(manifest.download ?? 0)
    })
  }

  return selected
}

/**
 * Depot manifest entries come in two shapes across PICS revisions:
 *   old: manifests: { public: "1234567890" }
 *   new: manifests: { public: { gid: "1234567890", size: "123", download: "45" } }
 */
function readManifest(depot, branch = 'public') {
  const entry = depot?.manifests?.[branch]
  if (!entry) return null
  if (typeof entry === 'string') return { gid: entry, size: 0, download: 0 }
  if (typeof entry === 'object' && entry.gid) {
    return { gid: String(entry.gid), size: entry.size, download: entry.download }
  }
  return null
}

/**
 * Read the logged-in user's SteamID64 from Steam's own config.
 *
 * Parsed with the string-preserving parser, NOT @node-steam/vdf — a SteamID64
 * exceeds Number.MAX_SAFE_INTEGER and that parser would silently round it.
 * (In production GameLib reads this from configStore userData.steamId, which is
 * already a string — but the same rule applies wherever it comes from.)
 */
export function readSteamId64(steamRoot) {
  const raw = readFileSync(`${steamRoot}/config/loginusers.vdf`, 'utf8')
  const parsed = parseVdfStrings(raw)
  const users = parsed?.users ?? {}
  const entries = Object.entries(users)
  const mostRecent = entries.find(
    ([, u]) => u.MostRecent === '1' || u.mostrecent === '1'
  )
  return (mostRecent ?? entries[0])?.[0] ?? '0'
}

/**
 * Build the AppState object. Field set mirrors what the Steam client itself
 * writes — anything we omit is a field Steam may treat as zero/absent.
 */
export function buildManifest({
  appId,
  appinfo,
  steamId64,
  depots,
  stateFlags = STATE_FLAGS_PENDING_VERIFY,
  now = Math.floor(Date.now() / 1000)
}) {
  const buildid = appinfo?.depots?.branches?.public?.buildid ?? '0'
  const installdir = appinfo?.config?.installdir ?? appinfo?.common?.name ?? String(appId)
  const name = appinfo?.common?.name ?? String(appId)
  const sizeOnDisk = depots.reduce((sum, d) => sum + d.size, 0)

  const InstalledDepots = {}
  for (const d of depots) {
    InstalledDepots[d.id] = { manifest: String(d.manifest), size: String(d.size) }
  }

  // Key casing is NOT free choice — it is copied from what the Steam client
  // itself writes (verified against a real appmanifest). Steam writes `universe`
  // and `lastupdated` in LOWERCASE while `SizeOnDisk`/`StateFlags` are cased.
  // Do not "tidy" these.
  const downloadBytes = depots.reduce((sum, d) => sum + d.download, 0)

  return {
    AppState: {
      appid: String(appId),
      universe: '1',
      name,
      StateFlags: String(stateFlags),
      installdir,
      lastupdated: String(now),
      SizeOnDisk: String(sizeOnDisk),
      StagingSize: '0',
      buildid: String(buildid),
      LastOwner: String(steamId64),
      DownloadType: '2',
      UpdateResult: '0',
      BytesToDownload: String(downloadBytes),
      BytesDownloaded: String(downloadBytes),
      BytesToStage: String(sizeOnDisk),
      BytesStaged: String(sizeOnDisk),
      // Steam writes 0 when no update is pending — NOT the current buildid.
      // Writing the buildid here reads as "an update to X is in progress".
      TargetBuildID: '0',
      AutoUpdateBehavior: '0',
      AllowOtherDownloadsWhileRunning: '0',
      ScheduledAutoUpdate: '0',
      InstalledDepots,
      UserConfig: { language: 'english' },
      MountedConfig: { language: 'english' }
    }
  }
}

export { vdfParse, vdfStringify }
