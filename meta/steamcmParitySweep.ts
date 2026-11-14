/**
 * Phase 79 plan 24 (D-07, D-16): Tier 2 parity sweep for the CM ops on the operator's real account.
 *
 * This sweep is the NAMED REAL-PROFILE ARM of the two-profile rule (gamelib-conventions). It reads
 * the operator's dev-vault refresh token so it can compare live results from steam-user (in
 * process, random non-zero logonID) with the Rust CLI (logonId 0). Every Rust child is still
 * spawned under a fresh fake HOME through `runSteamcmNdjson`, and the token reaches it on stdin
 * only (T-79-78). `pgrep` also runs under a fresh fake-HOME env.
 *
 * Compared: licences (package ids and the app ids they carry after tokens-first PICS), owned apps
 * (ids, names, playtime, last played), PICS for a sample of owned apps, depot-key SHA-1 equality,
 * request-code presence, content-server counts and persona presence.
 *
 * Exit: 0 every category equal or explained, 1 something unexplained, 3 no inputs or a
 * precondition failed. A vacuous run is a failure.
 *
 * Output is redacted (T-79-76): counts, classes and sha1 prefixes. Never keys, request codes,
 * tokens, names, SteamIDs or home paths; every output line passes through `redact`.
 */
import { spawnSync } from 'node:child_process'
import { createHash, randomInt } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type SteamUserType from 'steam-user'

import { createFakeHomeProfile } from '../src/backend/testUtils/fakeHomeProfile'
import { runSteamcmNdjson, type SteamcmRequest } from './gamelibSteamcmCli'

export type SweepCategory =
  | 'licences'
  | 'licence-appids'
  | 'owned-set'
  | 'owned-field'
  | 'pics'
  | 'depot-key'
  | 'request-code'
  | 'content-servers'
  | 'persona'

export const CATEGORIES: readonly SweepCategory[] = [
  'licences',
  'licence-appids',
  'owned-set',
  'owned-field',
  'pics',
  'depot-key',
  'request-code',
  'content-servers',
  'persona'
]

export type DiffClass =
  | 'numeric-coercion'
  | 'ordering'
  | 'request-code-differs-by-design'
  | 'content-server-set-rotation'
  | 'persona-unsupported'
  | 'f2p-or-unvetted'
  | 'extra-rust-field'

export type Outcome =
  | { kind: 'equal' }
  | { kind: 'explained'; cls: DiffClass }
  | { kind: 'unexplained' }

type Json = unknown

function isObj(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Key-sorted copy; arrays keep their order. */
function canonKeys(v: Json): Json {
  if (Array.isArray(v)) return v.map(canonKeys)
  if (isObj(v)) {
    const o: Record<string, Json> = {}
    for (const k of Object.keys(v).sort()) o[k] = canonKeys(v[k])
    return o
  }
  return v
}

/** Key-sorted copy, arrays sorted by their JSON text. */
function canonOrder(v: Json): Json {
  if (Array.isArray(v)) {
    return v.map(canonOrder).sort((a, b) => {
      const x = JSON.stringify(a)
      const y = JSON.stringify(b)
      return x < y ? -1 : x > y ? 1 : 0
    })
  }
  if (isObj(v)) {
    const o: Record<string, Json> = {}
    for (const k of Object.keys(v).sort()) o[k] = canonOrder(v[k])
    return o
  }
  return v
}

/** Every primitive leaf as a string. */
function stringLeaves(v: Json): Json {
  if (Array.isArray(v)) return v.map(stringLeaves)
  if (isObj(v)) {
    const o: Record<string, Json> = {}
    for (const k of Object.keys(v).sort()) o[k] = stringLeaves(v[k])
    return o
  }
  return v === null || v === undefined ? null : String(v)
}

const same = (a: Json, b: Json): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

function withoutDepotOrder(v: Json): Json {
  if (!isObj(v)) return v
  const { depotOrder: _depotOrder, ...rest } = v
  return rest
}

function ownedSymmetricDiffIsPlaytimeFree(ts: Json, rust: Json): boolean {
  if (!Array.isArray(ts) || !Array.isArray(rust)) return false
  const idOf = (e: Json): string =>
    isObj(e) ? String(e.appid ?? '') : String(e)
  const tsIds = new Set(ts.map(idOf))
  const rustIds = new Set(rust.map(idOf))
  const only = [
    ...ts.filter((e) => !rustIds.has(idOf(e))),
    ...rust.filter((e) => !tsIds.has(idOf(e)))
  ]
  if (only.length === 0) return false
  return only.every((e) => isObj(e) && Number(e.playtime_forever ?? 0) === 0)
}

/**
 * Pure. The explanation class for a pair of values that are not strictly equal, or null when the
 * difference is unexplained. Closed class list; a new class needs a measured cause (63 D-07).
 */
export function classifyDiff(
  category: SweepCategory,
  ts: Json,
  rust: Json
): DiffClass | null {
  if (same(canonKeys(ts), canonKeys(rust))) return null // not a diff; callers check equality first
  if (same(canonOrder(ts), canonOrder(rust))) return 'ordering'
  if (same(stringLeaves(canonKeys(ts)), stringLeaves(canonKeys(rust)))) {
    return 'numeric-coercion'
  }
  if (same(stringLeaves(canonOrder(ts)), stringLeaves(canonOrder(rust)))) {
    return 'ordering'
  }
  if (category === 'pics') {
    const stripped = withoutDepotOrder(rust)
    if (
      same(stringLeaves(canonOrder(ts)), stringLeaves(canonOrder(stripped)))
    ) {
      return 'extra-rust-field'
    }
  }
  if (
    category === 'request-code' &&
    typeof ts === 'string' &&
    typeof rust === 'string' &&
    ts !== '' &&
    rust !== ''
  ) {
    return 'request-code-differs-by-design'
  }
  if (
    category === 'content-servers' &&
    typeof ts === 'number' &&
    typeof rust === 'number' &&
    ts > 0 &&
    rust > 0
  ) {
    return 'content-server-set-rotation'
  }
  if (category === 'persona' && ts === true && rust === false) {
    return 'persona-unsupported'
  }
  if (category === 'owned-set' && ownedSymmetricDiffIsPlaytimeFree(ts, rust)) {
    return 'f2p-or-unvetted'
  }
  return null
}

export function compareValues(
  category: SweepCategory,
  ts: Json,
  rust: Json
): Outcome {
  if (same(canonKeys(ts), canonKeys(rust))) return { kind: 'equal' }
  const cls = classifyDiff(category, ts, rust)
  return cls ? { kind: 'explained', cls } : { kind: 'unexplained' }
}

export interface CategoryTally {
  inputs: number
  equal: number
  explained: Partial<Record<DiffClass, number>>
  unexplained: number
}

export type SweepReport = Record<SweepCategory, CategoryTally>

export function newReport(): SweepReport {
  const r = {} as SweepReport
  for (const c of CATEGORIES) {
    r[c] = { inputs: 0, equal: 0, explained: {}, unexplained: 0 }
  }
  return r
}

export function record(
  report: SweepReport,
  category: SweepCategory,
  outcome: Outcome
): void {
  const t = report[category]
  t.inputs += 1
  if (outcome.kind === 'equal') t.equal += 1
  else if (outcome.kind === 'explained') {
    t.explained[outcome.cls] = (t.explained[outcome.cls] ?? 0) + 1
  } else t.unexplained += 1
}

export function compareAndRecord(
  report: SweepReport,
  category: SweepCategory,
  ts: Json,
  rust: Json
): Outcome {
  const o = compareValues(category, ts, rust)
  record(report, category, o)
  return o
}

/** 0 clean, 1 unexplained, 3 vacuous or a precondition failure. */
export function decideExit(
  report: SweepReport,
  opts: { preconditionFailed?: boolean } = {}
): 0 | 1 | 3 {
  if (opts.preconditionFailed) return 3
  if (report.licences.inputs === 0 || report['owned-set'].inputs === 0) {
    return 3
  }
  for (const c of CATEGORIES) if (report[c].unexplained > 0) return 1
  return 0
}

export function sha1Prefix(data: Buffer | string, len = 8): string {
  return createHash('sha1').update(data).digest('hex').slice(0, len)
}

/** Strips SteamID64s, JWT-like and long token-like runs and absolute home paths from a line. */
export function redact(text: string): string {
  const home = homedir()
  let out = text
  if (home.length > 1) out = out.split(home).join('<home>')
  return out
    .replace(/7656119\d{10}/g, '<steamid>')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>')
    .replace(/\b[A-Za-z0-9+/_-]{40,}={0,2}/g, '<token>')
    .replace(/\/Users\/[^/\s]+/g, '/Users/<user>')
    .replace(/\/home\/[^/\s]+/g, '/home/<user>')
}

export interface PreconditionInputs {
  sidecarRunning: boolean
  hasToken: boolean
  wrapVerdict: 'PASS' | 'FAIL' | 'unknown'
  macSteamRunning: boolean
}

/** Pure. The first failed precondition as a message, or null. */
export function checkPreconditions(p: PreconditionInputs): string | null {
  if (p.sidecarRunning) {
    return 'GameLib is running (sidecar.js found): quit it first, logonId 0 would kick its session'
  }
  if (!p.hasToken) return 'the dev vault holds no steam-refresh-token'
  if (p.wrapVerdict !== 'PASS' && p.macSteamRunning) {
    return 'Mac Steam is running and the wrap verdict is not PASS: quit Mac Steam, the in-process logon is unwrapped'
  }
  return null
}

// ---------------------------------------------------------------- live sweep (not unit tested)

interface Reply {
  ok: boolean
  result?: { ok?: boolean; result?: unknown; leaseId?: number }
}

const OUT: string[] = []
function say(line: string): void {
  OUT.push(redact(line))
}

function fakeHomeSpawn(cmd: string, args: string[]): number | null {
  const profile = createFakeHomeProfile({ prefix: 'gamelib-steamcm-sweep-' })
  try {
    return spawnSync(cmd, args, {
      env: profile.childEnv(process.env),
      stdio: 'ignore'
    }).status
  } finally {
    try {
      profile.dispose()
    } catch {
      /* best effort */
    }
  }
}

function readToken(): string | null {
  const p = join(tmpdir(), 'gamelib-dev-secret-vault.json')
  if (!existsSync(p)) return null
  try {
    const v = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>
    const t = v['steam-refresh-token']
    return typeof t === 'string' && t !== '' ? t : null
  } catch {
    return null
  }
}

function readWrapVerdict(): 'PASS' | 'FAIL' | 'unknown' {
  const p = join(
    process.cwd(),
    '.planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-WRAP-RETEST.md'
  )
  if (!existsSync(p)) return 'unknown'
  const m = /^verdict:\s*(PASS|FAIL)/m.exec(readFileSync(p, 'utf-8'))
  return m ? (m[1] as 'PASS' | 'FAIL') : 'unknown'
}

interface TsSide {
  steamId: string
  licencePackages: number[]
  owned: Array<{
    appid: number
    name: string
    playtime_forever: number
    rtime_last_played?: number
  }>
  sampleApps: number[]
  picsApps: Record<string, unknown>
  packageAppIds: number[]
  depotTriples: Array<{
    appId: number
    depotId: number
    manifestId: string
    keySha1: string
    requestCode: string
  }>
  contentServers: number
  contentServerApp: number
  personaPresent: boolean
}

/** Methods steam-user has at runtime that its typings omit (the app's SteamCmClient types them). */
interface ExtraOps {
  getDepotDecryptionKey(
    appId: number,
    depotId: number,
    cb: (err: Error | null, key?: Buffer) => void
  ): void
  getManifestRequestCode(
    appId: number,
    depotId: number,
    manifestId: string,
    branch: string
  ): Promise<{ requestCode?: unknown }>
  getContentServers(
    appId: number,
    cb: (err: Error | null, servers?: unknown[]) => void
  ): void
}

const OWNED_OPTS = { includePlayedFreeGames: true }

function loadSteamUser(): typeof SteamUserType {
  // steam-user reads files relative to its own directory: load it at run time, never bundle it.
  return createRequire(join(process.cwd(), 'package.json'))(
    'steam-user'
  ) as typeof SteamUserType
}

function appIdsFromPackages(packages: Record<string, unknown>): number[] {
  const ids = new Set<number>()
  for (const p of Object.values(packages)) {
    const info = (p as { packageinfo?: { appids?: Record<string, unknown> } })
      ?.packageinfo
    for (const a of Object.values(info?.appids ?? {})) ids.add(Number(a))
  }
  return [...ids].sort((a, b) => a - b)
}

function publicManifestId(depot: unknown): string | null {
  const pub = (depot as { manifests?: { public?: unknown } })?.manifests?.public
  if (typeof pub === 'string' || typeof pub === 'number') return String(pub)
  const gid = (pub as { gid?: unknown } | undefined)?.gid
  return typeof gid === 'string' || typeof gid === 'number' ? String(gid) : null
}

async function runSteamUser(token: string): Promise<TsSide> {
  const SteamUser = loadSteamUser()
  const client = new SteamUser({
    dataDirectory: null,
    enablePicsCache: false,
    autoRelogin: false
  } as never) as SteamUserType & ExtraOps
  const logonID = randomInt(1, 2 ** 32)
  await new Promise<void>((resolve, reject) => {
    client.once('loggedOn', () => resolve())
    client.once('error', reject)
    client.logOn({ refreshToken: token, logonID } as never)
  })
  try {
    if (!client.licenses) {
      await new Promise<void>((r) => client.once('licenses', () => r()))
    }
    const steamID = client.steamID as { getSteamID64(): string }
    const steamId = steamID.getSteamID64()
    const licencePackages = [
      ...new Set((client.licenses ?? []).map((l) => Number(l.package_id)))
    ].sort((a, b) => a - b)

    const ownedRes = (await client.getUserOwnedApps(
      steamID as never,
      OWNED_OPTS as never
    )) as unknown as { apps: TsSide['owned'] }
    const owned = ownedRes.apps

    const sampleApps = owned.slice(0, 25).map((a) => a.appid)
    const pics = await client.getProductInfo(sampleApps, [], true)
    const picsApps: Record<string, unknown> = {}
    for (const id of sampleApps) {
      picsApps[String(id)] = (pics.apps as Record<number, unknown>)[id]
    }

    const pk = await client.getProductInfo([], licencePackages, true)
    const packageAppIds = appIdsFromPackages(
      pk.packages as unknown as Record<string, unknown>
    )

    // Up to 3 depot triples whose key the account can fetch.
    const depotTriples: TsSide['depotTriples'] = []
    for (const id of sampleApps) {
      if (depotTriples.length >= 3) break
      const info = (
        picsApps[String(id)] as
          | { appinfo?: { depots?: Record<string, unknown> } }
          | undefined
      )?.appinfo
      for (const [depotKey, depot] of Object.entries(info?.depots ?? {})) {
        if (depotTriples.length >= 3) break
        if (!/^\d+$/.test(depotKey)) continue
        const manifestId = publicManifestId(depot)
        if (!manifestId) continue
        const key = await new Promise<Buffer | null>((resolve) => {
          client.getDepotDecryptionKey(id, Number(depotKey), (err, k) =>
            resolve(err ? null : (k as Buffer))
          )
        })
        if (!key) continue
        let requestCode = ''
        try {
          const rc = await client.getManifestRequestCode(
            id,
            Number(depotKey),
            manifestId,
            'public'
          )
          requestCode = String(
            (rc as unknown as { requestCode?: unknown }).requestCode ?? ''
          )
        } catch {
          requestCode = ''
        }
        depotTriples.push({
          appId: id,
          depotId: Number(depotKey),
          manifestId,
          keySha1: sha1Prefix(key, 40),
          requestCode
        })
      }
    }

    const contentServerApp = sampleApps[0]
    if (contentServerApp === undefined) throw new Error('no owned apps')
    const servers = await new Promise<unknown[]>((resolve, reject) => {
      client.getContentServers(contentServerApp, (err, s) =>
        err ? reject(err) : resolve((s as unknown[]) ?? [])
      )
    })

    const personas = await client.getPersonas([steamID as never])
    const personaPresent = Object.keys(personas.personas ?? {}).length > 0

    return {
      steamId,
      licencePackages,
      owned,
      sampleApps,
      picsApps,
      packageAppIds,
      depotTriples,
      contentServers: servers.length,
      contentServerApp,
      personaPresent
    }
  } finally {
    client.logOff()
    await new Promise((r) => setTimeout(r, 500))
  }
}

function unwrap(r: Reply | undefined): unknown {
  if (!r || !r.ok || !r.result || r.result.ok === false) return undefined
  return r.result.result
}

async function runRust(
  token: string,
  ts: TsSide,
  report: SweepReport
): Promise<{ logonOk: boolean }> {
  const appFolder = mkdtempSync(join(tmpdir(), 'gamelib-steamcm-sweep-app-'))
  const lease = 1 // the first lease of a fresh CLI process
  const lines: SteamcmRequest[] = [
    { op: 'steamcm_configure', args: { appFolder } },
    {
      op: 'steamcm_session_acquire',
      args: { refreshToken: token, reason: 'user-refresh', logonId: 0 }
    },
    { op: 'steamcm_licenses', args: { leaseId: lease } },
    {
      op: 'steamcm_owned_apps',
      args: {
        leaseId: lease,
        steamId: ts.steamId,
        includeAppinfo: true,
        includePlayedFreeGames: true,
        includeFreeSub: false,
        skipUnvettedApps: true
      }
    },
    {
      op: 'steamcm_product_info',
      args: {
        leaseId: lease,
        apps: ts.sampleApps,
        packages: [],
        inclTokens: true
      }
    },
    {
      op: 'steamcm_product_info',
      args: {
        leaseId: lease,
        apps: [],
        packages: ts.licencePackages,
        inclTokens: true
      }
    },
    ...ts.depotTriples.flatMap((d): SteamcmRequest[] => [
      {
        op: 'steamcm_depot_key',
        args: { leaseId: lease, appId: d.appId, depotId: d.depotId }
      },
      {
        op: 'steamcm_manifest_request_code',
        args: {
          leaseId: lease,
          appId: d.appId,
          depotId: d.depotId,
          manifestId: d.manifestId,
          branch: 'public'
        }
      }
    ]),
    {
      op: 'steamcm_content_servers',
      args: { leaseId: lease, appId: ts.contentServerApp }
    },
    {
      op: 'steamcm_personas',
      args: { leaseId: lease, steamIds: [ts.steamId] }
    },
    { op: 'steamcm_session_release', args: { leaseId: lease } },
    { op: 'steamcm_session_shutdown', args: { boundMs: 10000 } }
  ]
  let replies: Reply[]
  try {
    replies = (await runSteamcmNdjson(lines)) as Reply[]
  } finally {
    rmSync(appFolder, { recursive: true, force: true })
  }
  const acquire = replies[1]?.result as { ok?: boolean; leaseId?: number }
  const logonOk = acquire?.ok === true && acquire.leaseId === lease
  say(`rust logon with the stored token, no account name: ${logonOk}`)
  if (!logonOk) return { logonOk }

  // licences
  const licences = unwrap(replies[2]) as Array<{ package_id?: number }>
  const rustPackages = [
    ...new Set((licences ?? []).map((l) => Number(l.package_id)))
  ].sort((a, b) => a - b)
  compareAndRecord(report, 'licences', ts.licencePackages, rustPackages)

  // owned
  const rustOwned =
    (unwrap(replies[3]) as { apps?: TsSide['owned'] })?.apps ?? []
  compareAndRecord(
    report,
    'owned-set',
    ts.owned.map((a) => ({
      appid: a.appid,
      playtime_forever: a.playtime_forever
    })),
    rustOwned.map((a) => ({
      appid: a.appid,
      playtime_forever: a.playtime_forever
    }))
  )
  const rustById = new Map(rustOwned.map((a) => [a.appid, a]))
  for (const a of ts.owned) {
    const r = rustById.get(a.appid)
    if (!r) continue
    compareAndRecord(
      report,
      'owned-field',
      {
        name: a.name,
        playtime: a.playtime_forever,
        last: a.rtime_last_played ?? 0
      },
      {
        name: r.name,
        playtime: r.playtime_forever,
        last: r.rtime_last_played ?? 0
      }
    )
  }

  // PICS sample
  const rustPics = (
    unwrap(replies[4]) as { apps?: Record<string, { appinfo?: unknown }> }
  )?.apps
  for (const id of ts.sampleApps) {
    const t = (ts.picsApps[String(id)] as { appinfo?: unknown } | undefined)
      ?.appinfo
    compareAndRecord(report, 'pics', t, rustPics?.[String(id)]?.appinfo)
  }

  // licence app ids after tokens-first PICS
  const rustPk = (unwrap(replies[5]) as { packages?: Record<string, unknown> })
    ?.packages
  const rustAppIds = appIdsFromPackages(rustPk ?? {})
  say(
    `counts: licences steam-user=${ts.licencePackages.length} rust=${rustPackages.length}; licence app ids steam-user=${ts.packageAppIds.length} rust=${rustAppIds.length}; owned steam-user=${ts.owned.length} rust=${rustOwned.length}`
  )
  compareAndRecord(report, 'licence-appids', ts.packageAppIds, rustAppIds)

  // depots
  let i = 6
  for (const d of ts.depotTriples) {
    const key = unwrap(replies[i++]) as { keyHex?: string } | undefined
    const code = unwrap(replies[i++]) as { requestCode?: string } | undefined
    compareAndRecord(
      report,
      'depot-key',
      d.keySha1,
      key?.keyHex ? sha1Prefix(Buffer.from(key.keyHex, 'hex'), 40) : null
    )
    compareAndRecord(
      report,
      'request-code',
      d.requestCode === '' ? '' : 'present',
      code?.requestCode ? 'present' : ''
    )
  }

  const servers = unwrap(replies[i++]) as unknown[] | undefined
  compareAndRecord(
    report,
    'content-servers',
    ts.contentServers,
    Array.isArray(servers) ? servers.length : -1
  )
  const personas = unwrap(replies[i++]) as
    | { personas?: Record<string, unknown> }
    | undefined
  compareAndRecord(
    report,
    'persona',
    ts.personaPresent,
    Object.keys(personas?.personas ?? {}).length > 0
  )
  return { logonOk }
}

export function formatReport(report: SweepReport): string[] {
  return CATEGORIES.map((c) => {
    const t = report[c]
    const ex = Object.entries(t.explained)
      .map(([k, n]) => `${k}=${n}`)
      .join(',')
    return `${c}: inputs=${t.inputs} equal=${t.equal} explained=${ex || '0'} unexplained=${t.unexplained}`
  })
}

async function main(): Promise<void> {
  const report = newReport()
  const token = readToken()
  const pre = checkPreconditions({
    sidecarRunning: fakeHomeSpawn('pgrep', ['-f', 'sidecar.js']) === 0,
    hasToken: token !== null,
    wrapVerdict: readWrapVerdict(),
    macSteamRunning: fakeHomeSpawn('pgrep', ['-x', 'steam_osx']) === 0
  })
  if (pre || !token) {
    console.log(redact(`precondition failed: ${pre}`))
    process.exit(3)
  }
  let exit: 0 | 1 | 3
  try {
    const ts = await runSteamUser(token)
    say(
      `steam-user: licences=${ts.licencePackages.length} owned=${ts.owned.length} licenceAppIds=${ts.packageAppIds.length} depotTriples=${ts.depotTriples.length} sampleApps=${ts.sampleApps.length}`
    )
    const { logonOk } = await runRust(token, ts, report)
    for (const l of formatReport(report)) say(l)
    exit = decideExit(report, { preconditionFailed: !logonOk })
  } catch (e) {
    say(`sweep error: ${e instanceof Error ? e.message : 'unknown'}`)
    exit = 3
  }
  say(`exit ${exit}`)
  console.log(OUT.join('\n'))
  process.exit(exit)
}

// `require.main === module` does not survive runTs.cjs bundling; JEST_WORKER_ID tells "imported
// under test" from "run as the entrypoint" (same idiom as depotParitySweep.ts).
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(
      redact(error instanceof Error ? error.message : 'sweep failed')
    )
    process.exit(1)
  })
}
