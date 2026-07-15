// Phase 21 (21-04): Depot-download orchestrator — front half.
//
// Given an appId, an authenticated steam-user CM connection, and a target
// directory + os filter, resolves every OWNED depot (Plan 01 select.ts),
// fetches + parses each depot's raw manifest, decrypts filenames (steam-user
// truncates them — Plan 01 crypto.ts does this correctly), and computes the
// REAL total byte count summed across every depot (D-03) — replacing the
// pc_requirements-derived estimate `getSteamInstallSize` used previously.
//
// This is the enqueue-time contract the DownloadManager needs before a single
// chunk is fetched. The streaming download loop is Plan 05; recovery/finalize
// (writeAppManifest) is Plan 06 — this module only builds the plan.

import { logWarning, LogPrefix } from 'backend/logger'
import type SteamUserLib from 'steam-user'
import { SteamUser } from './user'
import {
  selectAllDepots,
  dlcAppIds,
  type SteamAppInfo,
  type OwnedSets,
  type DepotDescriptor,
  type DepotSelectOpts
} from './depot/select'
// decryptFilename is wired in by Task 2 (21-04) — fetchDepotPlanEntry is still
// a not-implemented stub at this point in the file's history.

/** Numeric-only guard for appId before any network/filesystem use (T-21-05). */
const NUMERIC_ID = /^\d+$/

export interface DownloadSteamDepotsOpts {
  targetSteamappsDir: string
  installdir: string
  /** Required — never defaulted to the host OS here (select.ts's own discipline). */
  os: string
  language?: string
  signal?: AbortSignal
}

/** One chunk within a depot manifest file, exactly as steam-user's raw manifest
 *  parser returns it (offset/sha/cb_original — consumed unmodified by Plan 05's
 *  streaming download loop). */
export interface DepotPlanChunk {
  sha: string | Buffer
  cb_original: number | string
  offset: number | string
  [key: string]: unknown
}

/** One file within a depot manifest, with its filename DECRYPTED — steam-user's
 *  own filename field is truncated at block boundaries and must never be used
 *  directly (RESEARCH.md "Don't Hand-Roll" / spike 002 finding). */
export interface DepotPlanFile {
  filename: string
  size: number
  sha_content: string | Buffer
  chunks: DepotPlanChunk[]
  flags?: number
}

/** One resolved + manifest-fetched depot, ready for Plan 05's chunk download. */
export interface DepotPlanEntry {
  /** Steam depot id. STRING — never coerced to Number (T-21-04). */
  depotId: string
  /** 64-bit manifest GID. STRING — never coerced to Number (T-21-04). */
  gid: string
  /** Per-depot decryption key from getDepotDecryptionKey. */
  key: Buffer
  files: DepotPlanFile[]
}

/**
 * The full enqueue-time contract the DownloadManager needs before a single
 * chunk is fetched: every owned depot, resolved + manifest-fetched + filename-
 * decrypted, plus the REAL total byte count summed across ALL depots (D-03).
 */
export interface DepotPlan {
  appId: string
  depots: DepotPlanEntry[]
  /** Real total bytes, summed across every depot's files (D-03). */
  totalBytes: number
}

/** Minimal surface of the raw-manifest parser this module depends on. steam-user's
 *  export path (`steam-user/components/content_manifest.js`) is undocumented and
 *  could move on a version bump (Pitfall 5, T-21-10) — every access to it goes
 *  through this shape, with a loud throw if the shape is ever missing. */
interface ContentManifestModule {
  parse(raw: Buffer): { files: RawManifestFile[] }
}

interface RawManifestFile {
  filename: string
  size: string | number
  sha_content: string | Buffer
  flags?: number
  chunks?: DepotPlanChunk[]
}

/** steam-user client surface this module depends on that @types/steam-user does
 *  NOT declare — getDepotDecryptionKey/getRawManifest are undocumented callback
 *  APIs (Pitfall 5). Isolated here so every untyped call is visible in one place;
 *  everything else (getProductInfo, licenses) uses the real published types. */
interface SteamUserDepotExtras {
  getDepotDecryptionKey(
    appId: number,
    depotId: number,
    callback: (err: Error | null, key: Buffer) => void
  ): void
  getRawManifest(
    appId: number,
    depotId: number,
    gid: string,
    branch: string,
    callback: (err: Error | null, raw: Buffer) => void
  ): void
}

type SteamUserDepotClient = InstanceType<typeof SteamUserLib> & SteamUserDepotExtras

function assertNumericAppId(appId: string): void {
  if (!NUMERIC_ID.test(appId)) {
    throw new Error(`downloadSteamDepots: rejected non-numeric appId "${appId}"`)
  }
}

/** Never open a second logon (T-21-11) — reuse the same authenticated client
 *  library.ts's refresh() reaches via SteamUser.ensureConnected()/getClient(). */
function getDepotClient(): SteamUserDepotClient {
  const client = SteamUser.getClient()
  if (!client) {
    throw new Error(
      'downloadSteamDepots: no authenticated steam-user client available after ensureConnected()'
    )
  }
  return client as unknown as SteamUserDepotClient
}

/**
 * Owned appIds + depotIds derived from the authenticated user's package
 * licenses. Depot ownership is granted at the PACKAGE level (spike 001) — an
 * anonymous/PICS-only connection cannot supply this, which is why this must
 * run over the authenticated CM connection, never a second/anonymous one.
 */
async function getOwnedSets(client: SteamUserDepotClient): Promise<OwnedSets> {
  const packageIds = (client.licenses ?? [])
    .map((l) => (l as { package_id?: number }).package_id)
    .filter((id): id is number => typeof id === 'number')

  const { packages } = await client.getProductInfo([], packageIds, true)

  const apps = new Set<number>()
  const depots = new Set<number>()
  for (const pkg of Object.values(packages ?? {})) {
    const info = (pkg as { packageinfo?: { appids?: unknown[]; depotids?: unknown[] } })
      .packageinfo
    for (const a of info?.appids ?? []) apps.add(Number(a))
    for (const d of info?.depotids ?? []) depots.add(Number(d))
  }
  return { apps, depots }
}

async function fetchAppInfo(
  client: SteamUserDepotClient,
  numericAppId: number
): Promise<SteamAppInfo> {
  const { apps } = await client.getProductInfo([numericAppId], [], true)
  const entry = apps?.[numericAppId]
  if (!entry) {
    throw new Error(`downloadSteamDepots: no PICS appinfo returned for appId ${numericAppId}`)
  }
  return entry.appinfo as unknown as SteamAppInfo
}

async function fetchDlcInfos(
  client: SteamUserDepotClient,
  appinfo: SteamAppInfo
): Promise<Record<string, SteamAppInfo>> {
  const dlcIds = dlcAppIds(appinfo)
  if (!dlcIds.length) return {}

  const { apps } = await client.getProductInfo(dlcIds, [], true)
  const out: Record<string, SteamAppInfo> = {}
  for (const id of dlcIds) {
    const entry = apps?.[id]
    if (entry) out[String(id)] = entry.appinfo as unknown as SteamAppInfo
  }
  return out
}

/**
 * Dynamically loads steam-user's internal raw-manifest parser. The export path
 * is undocumented (Pitfall 5) — a loud throw here (not a silent failure) is
 * what surfaces a future steam-user version bump that moves/renames this file.
 */
async function loadContentManifestParser(): Promise<ContentManifestModule> {
  // Task 2 (21-04) implements this — Task 1 never reaches this call (its tests
  // mock selectAllDepots to return zero descriptors, so the early-return above
  // fires first).
  throw new Error('loadContentManifestParser: not implemented (Task 2)')
}

/**
 * Fetch, parse, and filename-decrypt a single depot's manifest. Filenames are
 * decrypted OURSELVES (steam-user truncates them at block boundaries — spike
 * 002 finding); every file size is coerced through Number() for the D-03 sum.
 */
async function fetchDepotPlanEntry(
  _client: SteamUserDepotClient,
  _numericAppId: number,
  _descriptor: DepotDescriptor,
  _parser: ContentManifestModule
): Promise<DepotPlanEntry> {
  // Task 2 (21-04) implements this.
  throw new Error('fetchDepotPlanEntry: not implemented (Task 2)')
}

/**
 * Resolve every owned depot for `appId`, fetch + parse + decrypt each depot's
 * manifest, and return the enqueue-time DepotPlan (real summed totalBytes,
 * D-03). Gates on an authenticated Steam CM connection before any network work
 * (T-21-11) and validates appId as numeric before touching it at all (T-21-05).
 */
export async function downloadSteamDepots(
  _appId: string,
  _opts: DownloadSteamDepotsOpts
): Promise<DepotPlan> {
  // RED marker (Task 1, 21-04) — implementation follows in the next commit.
  throw new Error('downloadSteamDepots: not implemented (Task 1)')
}
