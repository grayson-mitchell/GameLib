/**
 * Phase 79 plan 33 (D-12, D-16): Refresh parity sweep. Runs the REAL `refresh()` in process twice
 * against the operator's account, with only the `cm` flag (GAMELIB_STEAMCM_CM) toggled, each time
 * from empty stores rooted in a fresh temp dir:
 *   - `ts`:   the library assembled by today's TS code over steam-user;
 *   - `rust`: the library `steamcm_refresh` returned, persisted unchanged by the thin TS caller.
 * Each side then runs the lazy per-game enrichment (fetchMetadataIfNeeded, concurrency 4) for every
 * owned app, and the finished libraries are diffed by app id.
 *
 * This sweep is the NAMED REAL-PROFILE ARM of the two-profile rule (gamelib-conventions): it reads
 * the operator's dev-vault refresh token (in memory only, never argv) so both sides can log on to
 * the real account. Everything else is isolated: after the token read the sweep process itself
 * switches to a fresh fake HOME (logger, install scans and store paths see an empty profile), the
 * Rust child is spawned under its own fresh fake HOME through `openSteamcmNdjsonSession`, and
 * `pgrep` runs under a fresh fake-HOME env. Only read-only ops run:
 * never a redeem and never a credential sign-in. Every store is rooted in a temp dir, so nothing is
 * written to the real stores (T-79-98).
 *
 * Exit: 0 every field equal or explained, 1 something unexplained, 3 no inputs or a precondition
 * failed. A vacuous run is a failure. Output is redacted (T-79-97): counts and classes only; no
 * names, ids, URLs, SteamIDs, tokens or home paths.
 */
import { spawnSync } from 'node:child_process'
import axios from 'axios'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { initHeadless } from '../src/backend/logger'
import { createFakeHomeProfile } from '../src/backend/testUtils/fakeHomeProfile'
import { openSteamcmNdjsonSession } from './gamelibSteamcmCli'

export type RefreshField =
  | 'ids'
  | 'name'
  | 'art'
  | 'metacritic'
  | 'playtime'
  | 'last-played'
  | 'demo'

export const FIELDS: readonly RefreshField[] = [
  'ids',
  'name',
  'art',
  'metacritic',
  'playtime',
  'last-played',
  'demo'
]

export type Stage = 'post-refresh' | 'at-rest'

export type RefreshDiffClass =
  | 'ordering'
  | 'numeric-coercion'
  | 'unset-vs-empty'
  | 'f2p-or-unvetted'
  | 'enriched-in-refresh'

type Json = unknown

const isEmpty = (v: Json): boolean =>
  v === undefined ||
  v === null ||
  v === '' ||
  v === 0 ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.keys(v).length === 0)

function canon(v: Json): Json {
  if (Array.isArray(v)) return v.map(canon)
  if (typeof v === 'object' && v !== null) {
    const o: Record<string, Json> = {}
    for (const k of Object.keys(v).sort()) {
      o[k] = canon((v as Record<string, Json>)[k])
    }
    return o
  }
  return v
}

function stringLeaves(v: Json): Json {
  if (Array.isArray(v)) return v.map(stringLeaves)
  if (typeof v === 'object' && v !== null) {
    const o: Record<string, Json> = {}
    for (const k of Object.keys(v).sort()) {
      o[k] = stringLeaves((v as Record<string, Json>)[k])
    }
    return o
  }
  return v === null || v === undefined ? null : String(v)
}

const same = (a: Json, b: Json): boolean =>
  JSON.stringify(canon(a)) === JSON.stringify(canon(b))

/** Any object value whose every leaf is empty counts as empty. */
function allEmpty(v: Json): boolean {
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    return Object.values(v as Record<string, Json>).every(allEmpty)
  }
  return isEmpty(v)
}

/**
 * Pure. The explanation class for a pair that is not strictly equal, or null when unexplained.
 * Closed class list; a new class needs a measured cause (63 D-07). `enriched-in-refresh` applies
 * only to the post-refresh snapshots: the Rust Refresh enriches up to its budget, the TS Refresh
 * seeds art from the cache only.
 */
export function classifyRefreshDiff(
  field: RefreshField,
  ts: Json,
  rust: Json,
  stage: Stage = 'at-rest'
): RefreshDiffClass | null {
  if (same(ts, rust)) return null
  if (Array.isArray(ts) && Array.isArray(rust)) {
    const key = (v: Json): string => JSON.stringify(canon(v))
    const byKey = (a: Json, b: Json): number => key(a).localeCompare(key(b))
    if (same([...ts].sort(byKey), [...rust].sort(byKey))) return 'ordering'
  }
  if (same(stringLeaves(ts), stringLeaves(rust))) return 'numeric-coercion'
  if (allEmpty(ts) && allEmpty(rust)) return 'unset-vs-empty'
  if (
    stage === 'post-refresh' &&
    field === 'art' &&
    allEmpty(ts) &&
    !allEmpty(rust)
  ) {
    return 'enriched-in-refresh'
  }
  if (
    field === 'ids' &&
    typeof ts === 'object' &&
    typeof rust === 'object' &&
    ts !== null &&
    rust !== null &&
    (ts as { onlyPlaytimeFree?: boolean }).onlyPlaytimeFree === true
  ) {
    return 'f2p-or-unvetted'
  }
  return null
}

export type Outcome =
  | { kind: 'equal' }
  | { kind: 'explained'; cls: RefreshDiffClass }
  | { kind: 'unexplained' }

export function compareField(
  field: RefreshField,
  ts: Json,
  rust: Json,
  stage: Stage
): Outcome {
  if (same(ts, rust)) return { kind: 'equal' }
  const cls = classifyRefreshDiff(field, ts, rust, stage)
  return cls ? { kind: 'explained', cls } : { kind: 'unexplained' }
}

export interface FieldTally {
  inputs: number
  equal: number
  explained: Partial<Record<RefreshDiffClass, number>>
  unexplained: number
}
export type StageReport = Record<RefreshField, FieldTally>
export interface RefreshReport {
  'post-refresh': StageReport
  'at-rest': StageReport
  /** Value-free shape histogram of every difference, keyed `stage field shape`. */
  shapes: Record<string, number>
}

export function newReport(): RefreshReport {
  const mk = (): StageReport => {
    const r = {} as StageReport
    for (const f of FIELDS) {
      r[f] = { inputs: 0, equal: 0, explained: {}, unexplained: 0 }
    }
    return r
  }
  return { 'post-refresh': mk(), 'at-rest': mk(), shapes: {} }
}

export function record(
  report: RefreshReport,
  stage: Stage,
  field: RefreshField,
  outcome: Outcome
): void {
  const t = report[stage][field]
  t.inputs += 1
  if (outcome.kind === 'equal') t.equal += 1
  else if (outcome.kind === 'explained') {
    t.explained[outcome.cls] = (t.explained[outcome.cls] ?? 0) + 1
  } else t.unexplained += 1
}

/** 0 clean, 1 unexplained, 3 vacuous (no owned apps on a side) or a precondition failure. */
export function decideExit(
  report: RefreshReport,
  opts: { preconditionFailed?: boolean; tsOwned: number; rustOwned: number }
): 0 | 1 | 3 {
  if (opts.preconditionFailed || opts.tsOwned === 0 || opts.rustOwned === 0) {
    return 3
  }
  for (const stage of ['post-refresh', 'at-rest'] as const) {
    for (const f of FIELDS) if (report[stage][f].unexplained > 0) return 1
  }
  return 0
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

/** Pure. The first failed precondition as a message, or null (same rules as 79-24). */
export function checkPreconditions(p: PreconditionInputs): string | null {
  if (p.sidecarRunning) {
    return 'GameLib is running (sidecar.js found): quit it first, the logon would kick its session'
  }
  if (!p.hasToken) return 'the dev vault holds no steam-refresh-token'
  if (p.wrapVerdict !== 'PASS' && p.macSteamRunning) {
    return 'Mac Steam is running and the wrap verdict is not PASS: quit Mac Steam'
  }
  return null
}

// ------------------------------------------------------------ per-game projection (pure)

export interface GameLike {
  app_name: string
  title?: string
  extra?: Record<string, unknown>
  [k: string]: unknown
}

export interface Projection {
  name: unknown
  art: Record<string, unknown>
  metacritic: Record<string, unknown>
  playtime: unknown
  lastPlayed: unknown
}

export function project(g: GameLike): Projection {
  const art: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(g)) {
    if (k.startsWith('art_')) art[k] = v
  }
  const metacritic: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(g.extra ?? {})) {
    if (/metacritic/i.test(k)) metacritic[k] = v
  }
  return {
    name: g.title,
    art,
    metacritic,
    playtime: g.extra?.steamPlaytimeMinutes,
    lastPlayed: g.extra?.steamLastPlayed
  }
}

/** Diffs two libraries by app id and records one outcome per (field, shared app). */
export function diffLibraries(
  report: RefreshReport,
  stage: Stage,
  ts: GameLike[],
  rust: GameLike[],
  demoIds: { ts: Set<string>; rust: Set<string> }
): void {
  const tsById = new Map(ts.map((g) => [g.app_name, g]))
  const rustById = new Map(rust.map((g) => [g.app_name, g]))
  const onlyTs = ts.filter((g) => !rustById.has(g.app_name))
  const onlyRust = rust.filter((g) => !tsById.has(g.app_name))
  const idsTs = { ids: [...tsById.keys()].sort() }
  const idsRust = { ids: [...rustById.keys()].sort() }
  const onlyPlaytimeFree =
    onlyTs.length + onlyRust.length > 0 &&
    [...onlyTs, ...onlyRust].every(
      (g) => Number(g.extra?.steamPlaytimeMinutes ?? 0) === 0
    )
  record(
    report,
    stage,
    'ids',
    compareField(
      'ids',
      { ...idsTs, onlyPlaytimeFree },
      { ...idsRust, onlyPlaytimeFree },
      stage
    )
  )
  // The ids compare above carries the flag on both sides, so an f2p-only difference classes.
  for (const [id, t] of tsById) {
    const r = rustById.get(id)
    if (!r) continue
    const pt = project(t)
    const pr = project(r)
    const rec = (field: RefreshField, x: Json, y: Json): void => {
      const o = compareField(field, x, y, stage)
      record(report, stage, field, o)
      if (o.kind !== 'equal') {
        const key = `${stage} ${field} ${o.kind === 'explained' ? o.cls : 'UNEXPLAINED'} ${describeDiff(x, y)}`
        report.shapes[key] = (report.shapes[key] ?? 0) + 1
      }
    }
    rec('name', pt.name, pr.name)
    rec('art', pt.art, pr.art)
    rec('metacritic', pt.metacritic, pr.metacritic)
    rec('playtime', pt.playtime, pr.playtime)
    rec('last-played', pt.lastPlayed, pr.lastPlayed)
    rec('demo', demoIds.ts.has(id), demoIds.rust.has(id))
  }
}

/** Pure. A value-free description of how two values differ: which keys, and which side is empty. */
export function describeDiff(ts: Json, rust: Json): string {
  const side = (a: Json, b: Json): string =>
    same(a, b)
      ? 'same'
      : allEmpty(a)
        ? 'ts-empty'
        : allEmpty(b)
          ? 'rust-empty'
          : 'differs'
  if (
    typeof ts === 'object' &&
    ts !== null &&
    typeof rust === 'object' &&
    rust !== null &&
    !Array.isArray(ts) &&
    !Array.isArray(rust)
  ) {
    const t = ts as Record<string, Json>
    const r = rust as Record<string, Json>
    const keys = [...new Set([...Object.keys(t), ...Object.keys(r)])].sort()
    return keys
      .map((k) => [k, side(t[k], r[k])] as const)
      .filter(([, d]) => d !== 'same')
      .map(([k, d]) => `${k}:${d}`)
      .join(',')
  }
  return side(ts, rust)
}

export function formatReport(report: RefreshReport): string[] {
  const lines: string[] = []
  for (const stage of ['post-refresh', 'at-rest'] as const) {
    for (const f of FIELDS) {
      const t = report[stage][f]
      const ex = Object.entries(t.explained)
        .map(([k, n]) => `${k}=${n}`)
        .join(',')
      lines.push(
        `${stage} ${f}: inputs=${t.inputs} equal=${t.equal} explained=${ex || '0'} unexplained=${t.unexplained}`
      )
    }
  }
  for (const [k, n] of Object.entries(report.shapes).sort()) {
    lines.push(`shape ${k}: ${n}`)
  }
  return lines
}

/** Pure. Every nth app id (sorted) so a sample is deterministic; `limit` null or >= length is all. */
export function sampleIds(ids: string[], limit: number | null): string[] {
  const sorted = [...ids].sort()
  if (limit === null || limit >= sorted.length || limit <= 0) return sorted
  const step = sorted.length / limit
  return Array.from(
    { length: limit },
    (_, i) => sorted[Math.floor(i * step)] as string
  )
}

/** Pure. How many games carry a non-empty value for the field. */
export function populated(games: GameLike[]): {
  art: number
  metacritic: number
} {
  let art = 0
  let metacritic = 0
  for (const g of games) {
    const p = project(g)
    if (!allEmpty(p.art)) art += 1
    if (!allEmpty(p.metacritic)) metacritic += 1
  }
  return { art, metacritic }
}

/** Pure. null when the Steam store answered, else the reason the enrichment half is vacuous. */
export function storeBlocked(status: number | null): string | null {
  if (status === 200) return null
  return `the Steam store API answered ${status ?? 'nothing'} (Akamai block or rate limit): enrichment cannot be compared, retry later`
}

// ---------------------------------------------------------------- live sweep (not unit tested)

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

interface SideResult {
  postRefresh: GameLike[]
  atRest: GameLike[]
  demoIds: Set<string>
  enrich?: Record<string, unknown>
  owned: number
}

const CM_FLAG = 'GAMELIB_STEAMCM_CM'
const LAZY_CONCURRENCY = 4

async function runSide(
  side: 'ts' | 'rust',
  token: string
): Promise<SideResult> {
  process.env[CM_FLAG] = side
  const root = mkdtempSync(join(tmpdir(), 'gamelib-refresh-sweep-'))
  const session = side === 'rust' ? openSteamcmNdjsonSession() : null
  try {
    // Loaded at run time: the stack imports steam-user, which reads files next to itself.
    const { createTestStoreRoot } =
      await import('../src/backend/testUtils/testStoreRoot')
    const { createTestManagerDeps, createTestStores } =
      await import('../src/backend/testUtils/testServices')
    const { createTestAppPaths } =
      await import('../src/backend/testUtils/testAppPaths')
    const { createTestSteamSession } =
      await import('../src/backend/testUtils/testSteamSession')
    const { createTestGlobalConfig } =
      await import('../src/backend/testUtils/testConfig')
    const { createTestSteamUser } =
      await import('../src/backend/testUtils/testSteamUser')
    const { createTestTokenStoreSlot } =
      await import('../src/backend/testUtils/testTokenStore')
    const { refresh } =
      await import('../src/backend/storeManagers/steam/library/refresh')
    const { fetchMetadataIfNeeded } =
      await import('../src/backend/storeManagers/steam/gameMetadata')
    const SteamGame = (await import('../src/backend/storeManagers/steam/games'))
      .default

    const storeRoot = createTestStoreRoot(join(root, 'userData'))
    const stores = createTestStores({}, storeRoot)
    const paths = createTestAppPaths(root)
    const config = createTestGlobalConfig({
      defaultSteamPath: join(root, 'steam')
    } as never)
    const base = createTestSteamSession()
    const steamSession = {
      ...base,
      authTrigger: {
        ...base.authTrigger,
        consumeSteamRefreshLogonGrant: () => 'user-refresh' as const
      }
    }

    let enrich: Record<string, unknown> | undefined
    const rustInvoke = {
      requestRustInvoke: async (channel: string, args: unknown[]) => {
        // An empty fake profile has no Steam install: scans answer "nothing there".
        if (channel === 'steamfiles_read_library_folders') {
          return { exists: false, parsed: false, paths: [] }
        }
        if (channel === 'steamfiles_scan_acfs') return { records: [] }
        if (!session) throw new Error(`no rust session for ${channel}`)
        if (!channel.startsWith('steamcm_')) {
          throw new Error(`channel ${channel} is outside the steamcm sweep`)
        }
        const r = await session.send({
          op: channel,
          args: (args[0] ?? {}) as Record<string, unknown>
        })
        if (!r.ok) throw new Error(`${channel} transport error`)
        const res = r.result as {
          ok?: boolean
          result?: { enrich?: Record<string, unknown> }
        }
        if (channel === 'steamcm_refresh' && res?.ok && res.result) {
          enrich = res.result.enrich
        }
        return r.result
      }
    }
    if (session) {
      const appFolder = join(root, 'cm-app')
      const r = await session.send({
        op: 'steamcm_configure',
        args: { appFolder }
      })
      if (!r.ok) throw new Error('steamcm_configure failed')
    }

    const realUser = createTestSteamUser({
      stores,
      config,
      steamSession,
      tokenStore: createTestTokenStoreSlot(),
      rustInvoke: rustInvoke as never
    })
    // acquireAuthenticated with the dev-vault token, so no sign-in state is needed.
    const steamUser = new Proxy(realUser, {
      get(target, prop) {
        if (prop === 'acquireAuthenticated') {
          return (opts: never) =>
            target.acquireAuthenticatedWithToken(opts, token)
        }
        const v = (target as never as Record<PropertyKey, unknown>)[prop]
        return typeof v === 'function'
          ? (v as (...a: unknown[]) => unknown).bind(target)
          : v
      }
    })

    const deps = createTestManagerDeps({
      stores,
      config,
      paths,
      steamSession: steamSession as never,
      steamUser: steamUser as never,
      requestRustInvoke: rustInvoke.requestRustInvoke as never,
      steamBottle: { isSteamBottleProvisioned: () => false } as never,
      sendFrontendMessage: (() => true) as never
    })

    const out = await refresh(deps)
    if (out && out.stderr)
      say(`${side} refresh stderr: ${out.stderr.length} chars`)
    const postRefresh = structuredClone(
      stores.steam.steamLibraryStore.get('games', [])
    ) as unknown as GameLike[]
    say(`${side} post-refresh games=${postRefresh.length}`)

    // Lazy enrichment of every owned app, concurrency 4.
    const lazyLimit =
      process.env.SWEEP_LAZY_SAMPLE && process.env.SWEEP_LAZY_SAMPLE !== 'all'
        ? Number(process.env.SWEEP_LAZY_SAMPLE)
        : null
    const ids = sampleIds(
      postRefresh.map((g) => g.app_name),
      lazyLimit
    )
    say(`${side} lazy enrichment apps=${ids.length}`)
    let next = 0
    const worker = async (): Promise<void> => {
      while (next < ids.length) {
        const id = ids[next++] as string
        const current = deps.steamSession.libraryState.library.get(id)
        if (!current) continue
        await fetchMetadataIfNeeded(
          new SteamGame(id, deps) as never,
          current as never
        ).catch(() => undefined)
      }
    }
    await Promise.all(Array.from({ length: LAZY_CONCURRENCY }, () => worker()))
    const atRest = structuredClone(
      Array.from(deps.steamSession.libraryState.library.values())
    ) as unknown as GameLike[]
    const popP = populated(postRefresh)
    const popR = populated(atRest)
    say(
      `${side} at-rest games=${atRest.length} populated: post-refresh art=${popP.art} metacritic=${popP.metacritic}; at-rest art=${popR.art} metacritic=${popR.metacritic}`
    )

    // Demo membership: library ids that getUserOwnedApps does not return (demos are the only
    // non-owned entries). Read on a fresh lease of the same side, never a new engine.
    const demoIds = new Set<string>()
    const lease = await deps.steamUser.acquireAuthenticated({
      reason: 'user-refresh'
    })
    if (lease.ok) {
      try {
        const c = lease.client as unknown as {
          steamID: unknown
          getUserOwnedApps: (
            id: unknown,
            o: unknown
          ) => Promise<{ apps: Array<{ appid: number }> }>
        }
        const owned = await c.getUserOwnedApps(c.steamID, {
          includePlayedFreeGames: true
        })
        const ownedIds = new Set(owned.apps.map((a) => String(a.appid)))
        for (const g of postRefresh) {
          if (!ownedIds.has(g.app_name)) demoIds.add(g.app_name)
        }
        say(`${side} owned=${ownedIds.size} demos=${demoIds.size}`)
      } finally {
        lease.release()
      }
    }
    await realUser.releaseForShutdown().catch(() => undefined)
    return {
      postRefresh,
      atRest,
      demoIds,
      enrich,
      owned: postRefresh.length
    }
  } finally {
    if (session) {
      await session
        .send({ op: 'steamcm_session_shutdown', args: { boundMs: 10000 } })
        .catch(() => undefined)
      await session.close().catch(() => undefined)
    }
    rmSync(root, { recursive: true, force: true })
  }
}

async function storeStatus(): Promise<number | null> {
  try {
    const r = await axios.get(
      'https://store.steampowered.com/api/appdetails?appids=730&filters=basic',
      { timeout: 10_000, validateStatus: () => true }
    )
    return r.status
  } catch {
    return null
  }
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
  const blockedBefore = storeBlocked(await storeStatus())
  if (blockedBefore) {
    console.log(redact(`precondition failed: ${blockedBefore}`))
    process.exit(3)
  }
  // The token is the only real-profile input. The in-process stack (logger, install scans, store
  // paths) runs under a fresh fake HOME so nothing real is read or written (T-79-98).
  const profile = createFakeHomeProfile({ prefix: 'gamelib-refresh-sweep-' })
  Object.assign(process.env, profile.childEnv(process.env))
  initHeadless()
  let exit: 0 | 1 | 3
  try {
    const ts = await runSide('ts', token)
    const rust = await runSide('rust', token)
    say(`owned+demo: ts=${ts.owned} rust=${rust.owned}`)
    if (rust.enrich) {
      const e = rust.enrich
      say(
        `rust enrich summary: attempted=${String(e.attempted)} enriched=${String(e.enriched)} delisted=${String(e.delisted)} failed=${String(e.failed)} rateLimited=${String(e.rateLimited)} budgetHit=${String(e.budgetHit)} notReached=${Array.isArray(e.notReached) ? e.notReached.length : 0}`
      )
    }
    diffLibraries(report, 'post-refresh', ts.postRefresh, rust.postRefresh, {
      ts: ts.demoIds,
      rust: rust.demoIds
    })
    diffLibraries(report, 'at-rest', ts.atRest, rust.atRest, {
      ts: ts.demoIds,
      rust: rust.demoIds
    })
    for (const l of formatReport(report)) say(l)
    exit = decideExit(report, { tsOwned: ts.owned, rustOwned: rust.owned })
    const blockedAfter = storeBlocked(await storeStatus())
    const vacuous =
      populated(ts.atRest).art === 0 || populated(rust.atRest).art === 0
    if (exit === 0 && (blockedAfter || vacuous)) {
      say(
        `result not trusted: ${blockedAfter ?? 'a side enriched no art, so the at-rest comparison is vacuous'}`
      )
      exit = 3
    }
  } catch (e) {
    say(`sweep error: ${e instanceof Error ? e.message : 'unknown'}`)
    if (process.env.SWEEP_DEBUG && e instanceof Error) say(String(e.stack))
    exit = 3
  }
  try {
    profile.dispose()
  } catch {
    /* best effort */
  }
  say(`exit ${exit}`)
  console.log(OUT.join('\n'))
  process.exit(exit)
}

// `require.main === module` does not survive runTs.cjs bundling; JEST_WORKER_ID tells "imported
// under test" from "run as the entrypoint" (same idiom as steamcmParitySweep.ts).
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(
      redact(error instanceof Error ? error.message : 'sweep failed')
    )
    process.exit(1)
  })
}
