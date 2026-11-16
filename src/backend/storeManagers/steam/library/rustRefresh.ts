/**
 * Phase 79 (D-12, D-13): Refresh on the Rust CM path. TS builds the inputs Rust cannot reach
 * (stores, in-memory library, ACF install maps, allowlist, known-fix catalogue), makes ONE
 * steamcm_refresh call, then persists and pushes what comes back.
 *
 * Exit contract: no timers, no handles, no work at import.
 * Logging: counts only. No ids, names or paths in the summary lines.
 */
import { isDeepStrictEqual } from 'util'
import type { ExecResult } from 'common/types'
import type { SteamGameInfo } from 'common/types/steam'
import { steamGameInfoSchema } from 'common/types/ipc/gameInfoSchema'
import { RUST_STEAMCM_REFRESH } from 'common/types/sidecarTransport'
import {
  invalidPaths,
  stripToSchema
} from 'backend/storeMigrations/schemaStrip'
import { logInfo, logError, logWarning, LogPrefix } from 'backend/logger'
import { isMac } from 'backend/constants/environment'
import { getFileSize } from 'backend/utils'
import type { ManagerDeps } from 'backend/services/types'
import { listReadyBridgeBottleNames } from '../bridgeBottle'
import { backfillBridgeLaunchTargets } from '../bridge/launchTarget'
import { bridgeAllowlist } from '../bridge/allowlist'
import { listKnownFixMac32AppIds } from '../macArchKnownFix'
import { leaseIdOf } from '../cm/RustCmClient'
import { invokeSteamCm } from '../cm/rustSteamCm'
import { withoutSteamRestartHolds } from '../pollRust/rustSteamPoll'
import type { RefreshResult } from '../cm/steamCmTypes'
import type { SteamMetadataCacheEntry } from '../stores'
import { restoreLocalSteamLibrary } from './localLibrary'
import {
  buildInstalledMap,
  buildIncompleteInstallSet,
  buildBottleInstalledMap,
  buildBridgeInstalledMap,
  installVersionField
} from './installedMap'
import {
  type AcfSource,
  installPlatformForSource,
  isBridgeAuthoritativeForInstallState
} from './installRoot'

type Client = NonNullable<ReturnType<ManagerDeps['steamUser']['getClient']>>

interface AcfInstallArg {
  installPath: string
  installSize: string
  buildid?: string
}

type InstalledMapLike = Map<
  number,
  { installPath: string; sizeOnDisk: string; buildid?: string }
>

function installArgs(map: InstalledMapLike): Record<string, AcfInstallArg> {
  const out: Record<string, AcfInstallArg> = {}
  for (const [appId, v] of map) {
    out[String(appId)] = {
      installPath: v.installPath,
      installSize: getFileSize(Number(v.sizeOnDisk)),
      ...(v.buildid !== undefined ? { buildid: v.buildid } : {})
    }
  }
  return out
}

export interface RustRefreshInputs {
  metadata: Record<string, SteamMetadataCacheEntry>
  previousGames: SteamGameInfo[]
  installState: {
    native: Record<string, AcfInstallArg>
    bottle?: Record<string, AcfInstallArg>
    bridge?: Record<string, AcfInstallArg>
    incomplete: number[]
  }
  bridgeAllowlist: string[]
  knownFixMac32: string[]
  isMac: boolean
}

type InstallStateArg = RustRefreshInputs['installState']

/** The ACF install maps the op takes, plus the bridge app ids the backfill runs over. */
async function readInstallState(
  deps: ManagerDeps
): Promise<{ installState: InstallStateArg; bridgeAppIds: string[] }> {
  // D-UAT-13: apps holding for a Steam restart are not installed yet as far as the UI goes.
  const installedMap = await withoutSteamRestartHolds(
    deps,
    await buildInstalledMap(deps)
  )
  const bottleMap =
    isMac && deps.steamBottle.isSteamBottleProvisioned()
      ? await buildBottleInstalledMap(deps)
      : null
  const bridgeMap =
    isMac && listReadyBridgeBottleNames(deps.paths).length > 0
      ? await buildBridgeInstalledMap(deps.paths, deps)
      : null
  const incomplete = await buildIncompleteInstallSet(deps)
  return {
    installState: {
      native: installArgs(installedMap),
      ...(bottleMap ? { bottle: installArgs(bottleMap) } : {}),
      ...(bridgeMap ? { bridge: installArgs(bridgeMap) } : {}),
      incomplete: [...incomplete]
    },
    bridgeAppIds: bridgeMap ? [...bridgeMap.keys()].map(String) : []
  }
}

/** The op inputs plus the bridge app ids the backfill runs over. */
export async function buildRustRefreshInputs(
  deps: ManagerDeps
): Promise<RustRefreshInputs & { bridgeAppIds: string[] }> {
  const metadata: Record<string, SteamMetadataCacheEntry> = {}
  for (const [id, entry] of deps.stores.steam.steamMetadataStore.entries()) {
    // A deep copy: the store may hand out live objects and the stale check compares against this.
    metadata[id] = structuredClone(entry)
  }
  const previousGames = Array.from(
    deps.steamSession.libraryState.library.values()
  )
  const { installState, bridgeAppIds } = await readInstallState(deps)
  return {
    metadata,
    previousGames,
    installState,
    bridgeAllowlist: bridgeAllowlist.seedIds(),
    knownFixMac32: listKnownFixMac32AppIds(deps),
    isMac,
    bridgeAppIds
  }
}

type Breadcrumb = { dir: string; name: string }

/** Install-start breadcrumbs by app id: the same read as the Rust assembler's `breadcrumbs`. */
function breadcrumbsOf(
  games: Iterable<SteamGameInfo>
): Map<string, Breadcrumb> {
  const out = new Map<string, Breadcrumb>()
  for (const g of games) {
    const dir = g.install?.steamResumeTargetSteamappsDir
    const name = g.install?.steamResumeInstalldir
    if (dir && name) out.set(g.app_name, { dir, name })
  }
  return out
}

/** Everything one app's install fields are derived from, as a comparable key. */
function installInputsKey(
  appId: string,
  state: InstallStateArg,
  crumbs: Map<string, Breadcrumb>
): string {
  return JSON.stringify([
    state.native[appId] ?? null,
    state.bottle?.[appId] ?? null,
    state.bridge?.[appId] ?? null,
    state.incomplete.includes(Number(appId)),
    crumbs.get(appId) ?? null
  ])
}

/** The install half of the Rust assembler (refresh/assemble.rs `assemble_library`), for one app. */
function installFieldsFor(
  deps: ManagerDeps,
  appId: string,
  state: InstallStateArg,
  crumbs: Map<string, Breadcrumb>
): Pick<SteamGameInfo, 'is_installed' | 'install'> {
  const native = state.native[appId]
  const bottle = state.bottle?.[appId]
  const bridge = state.bridge?.[appId]
  let installed: AcfInstallArg | undefined
  let source: AcfSource
  if (isBridgeAuthoritativeForInstallState(deps, appId)) {
    installed = bridge
    source = 'bridge'
  } else if (native) {
    installed = native
    source = 'native'
  } else if (bottle) {
    installed = bottle
    source = 'bottle'
  } else {
    installed = bridge
    source = 'bridge'
  }
  const install: SteamGameInfo['install'] = {}
  if (installed) {
    install.install_path = installed.installPath
    install.install_size = installed.installSize
    install.platform = installPlatformForSource(source)
    Object.assign(install, installVersionField(installed.buildid))
  } else {
    if (state.incomplete.includes(Number(appId))) {
      install.steamResumePending = true
    }
    const crumb = crumbs.get(appId)
    if (crumb) {
      install.steamResumePending = true
      install.steamResumeTargetSteamappsDir = crumb.dir
      install.steamResumeInstalldir = crumb.name
    }
  }
  return { is_installed: installed !== undefined, install }
}

/**
 * C1/WR-01: the op's games were assembled from install state read before a call of up to 150 s.
 * An install, uninstall or install start that landed meanwhile must not be reverted, so every app
 * whose install inputs changed since the snapshot gets its install fields rebuilt from the live
 * state. Apps whose inputs did not change keep Rust's fields untouched.
 */
function overlayLiveInstallState(
  deps: ManagerDeps,
  games: SteamGameInfo[],
  sent: { state: InstallStateArg; crumbs: Map<string, Breadcrumb> },
  live: { state: InstallStateArg; crumbs: Map<string, Breadcrumb> }
): { games: SteamGameInfo[]; overlaid: number } {
  let overlaid = 0
  const out = games.map((game) => {
    const id = game.app_name
    if (
      installInputsKey(id, sent.state, sent.crumbs) ===
      installInputsKey(id, live.state, live.crumbs)
    ) {
      return game
    }
    overlaid++
    return { ...game, ...installFieldsFor(deps, id, live.state, live.crumbs) }
  })
  return { games: out, overlaid }
}

export async function applyRustRefreshResult(
  deps: ManagerDeps,
  sentMetadata: Record<string, SteamMetadataCacheEntry>,
  result: RefreshResult,
  /** The install snapshot the op was built from. When given, install changes since are kept. */
  sentInstall?: Pick<RustRefreshInputs, 'installState' | 'previousGames'>
): Promise<{ written: number; staleSkipped: number }> {
  const { steamLibraryStore, steamMetadataStore, steamSyncStore } =
    deps.stores.steam
  let written = 0
  let staleSkipped = 0
  await deps.steamLaunchRuntime.platformCapture.withPlatformCaptureLock(
    async () => {
      for (const [id, entry] of Object.entries(result.metadataUpdates)) {
        // T-79-127: a concurrent writer (lazy enrichment, per-game capture) wins.
        if (!isDeepStrictEqual(steamMetadataStore.get(id), sentMetadata[id])) {
          staleSkipped++
          continue
        }
        steamMetadataStore.set(id, entry)
        written++
      }
      return Promise.resolve()
    }
  )
  logInfo(
    `Steam Refresh metadata: written=${written} staleSkipped=${staleSkipped}`,
    LogPrefix.Steam
  )

  // C1/WR-01: re-read install state now, after the long op, as the pre-79 sync did. A failed read
  // keeps the op's snapshot rather than failing the Refresh.
  let liveState: InstallStateArg | null = null
  if (sentInstall) {
    try {
      liveState = (await readInstallState(deps)).installState
    } catch (err) {
      logWarning(
        [
          'Steam Refresh: install state re-read failed, keeping the snapshot:',
          err instanceof Error ? err.name : 'unknown'
        ],
        LogPrefix.Steam
      )
    }
  }

  const library = deps.steamSession.libraryState.library
  // No await from here to the store write: the breadcrumbs are read from the library as it stands.
  let games = result.games
  if (sentInstall && liveState) {
    const overlay = overlayLiveInstallState(
      deps,
      games,
      {
        state: sentInstall.installState,
        crumbs: breadcrumbsOf(sentInstall.previousGames)
      },
      { state: liveState, crumbs: breadcrumbsOf(library.values()) }
    )
    games = overlay.games
    if (overlay.overlaid > 0) {
      logInfo(
        `Steam Refresh: install state changed during the op, overlaid=${overlay.overlaid}`,
        LogPrefix.Steam
      )
    }
  }
  library.clear()
  for (const game of games) {
    // T-79-93: the same strip the TS path applies, before libraryState or the store sees it.
    const clean = stripToSchema(game, steamGameInfoSchema, {
      dropInvalidOptional: true
    }) as SteamGameInfo
    const stillInvalid = invalidPaths(clean, steamGameInfoSchema)
    if (stillInvalid.length > 0) {
      logWarning(
        `Steam library entry ${clean.app_name} is still schema-invalid after the strip at: ${stillInvalid.join(', ')}`,
        LogPrefix.Steam
      )
    }
    library.set(clean.app_name, clean)
    deps.sendFrontendMessage('pushGameToLibrary', clean)
  }
  steamLibraryStore.set('games', Array.from(library.values()))
  steamSyncStore.set('syncedAt', Date.now())
  return { written, staleSkipped }
}

function logSummary(result: RefreshResult): void {
  const p = result.capture.platforms
  logInfo(
    `Steam bulk platform capture: scoped=${p.scoped} captured=${p.captured} skipped=${p.skipped} failed=${p.failed} anon=${result.capture.anonCount} held=${result.capture.heldCount}`,
    LogPrefix.Steam
  )
  const e = result.enrich
  logInfo(
    `Steam Refresh enrichment: attempted=${e.attempted} enriched=${e.enriched} delisted=${e.delisted} failed=${e.failed} rateLimited=${e.rateLimited} budgetHit=${e.budgetHit} notReached=${e.notReached.length}`,
    LogPrefix.Steam
  )
}

async function failOwned(
  deps: ManagerDeps,
  reason: 'owned-apps-failed' | 'client-not-ready',
  detail: string
): Promise<ExecResult> {
  await restoreLocalSteamLibrary(deps, { pushAll: true })
  deps.sendFrontendMessage('steamSyncStatus', { status: 'failed', reason })
  return { stdout: '', stderr: detail }
}

/** One steamcm_refresh call on the held lease, then persist and push (the cm=rust body of refresh()). */
export async function syncOwnedLibraryRust(
  deps: ManagerDeps,
  client: Client
): Promise<ExecResult | null> {
  const leaseId = leaseIdOf(client)
  const steamId = client.steamID?.toString()
  if (leaseId === undefined || !steamId) {
    logWarning(
      'Steam Refresh (rust): the held client is not a Rust lease, skipping',
      LogPrefix.Steam
    )
    return failOwned(deps, 'client-not-ready', 'not a rust lease')
  }

  let inputs: Awaited<ReturnType<typeof buildRustRefreshInputs>>
  let result: RefreshResult
  try {
    inputs = await buildRustRefreshInputs(deps)
  } catch (err) {
    return syncFailed(deps, err)
  }
  const { bridgeAppIds, ...args } = inputs
  try {
    const res = await invokeSteamCm(deps, RUST_STEAMCM_REFRESH, {
      source: { kind: 'cm', leaseId, steamId },
      ...args
    })
    if (!res.ok) {
      logError(`Steam Refresh failed: ${res.kind}`, LogPrefix.Steam)
      return await failOwned(deps, 'owned-apps-failed', res.kind)
    }
    result = res.result
  } catch (err) {
    logError(
      [
        'Steam Refresh transport failed:',
        err instanceof Error ? err.message : String(err)
      ],
      LogPrefix.Steam
    )
    return failOwned(deps, 'owned-apps-failed', String(err))
  }

  logSummary(result)
  // Phase 54: repair missing bridge launch targets on the lease this Refresh holds. Fail-soft.
  if (bridgeAppIds.length > 0) {
    await backfillBridgeLaunchTargets(
      deps,
      client as unknown as Parameters<typeof backfillBridgeLaunchTargets>[1],
      bridgeAppIds
    ).catch((err: unknown) => {
      logWarning(
        ['Steam bridge launch-target backfill failed:', err],
        LogPrefix.Steam
      )
    })
  }

  try {
    await applyRustRefreshResult(deps, args.metadata, result, args)
  } catch (err) {
    return syncFailed(deps, err)
  }
  logInfo(
    `Steam library sync complete: ${deps.steamSession.libraryState.library.size} games`,
    LogPrefix.Steam
  )
  deps.sendFrontendMessage('steamSyncStatus', { status: 'idle' })
  return {
    stdout: `${deps.steamSession.libraryState.library.size} games synced`,
    stderr: ''
  }
}

function syncFailed(deps: ManagerDeps, err: unknown): never {
  logError(
    ['Steam library sync failed during hydration:', err],
    LogPrefix.Steam
  )
  deps.sendFrontendMessage('steamSyncStatus', {
    status: 'failed',
    reason: 'sync-failed'
  })
  throw err
}

export type MacSteamRefreshOutcome =
  | { kind: 'done'; exec: ExecResult }
  | { kind: 'fallback'; reason: string }

/**
 * D-14/D-15: Refresh from the running Mac Steam client, inside the Rust orchestration, with NO
 * signed-in logon (so it cannot sign Friends out). Mac-path entries carry the previously stored
 * playtime, not Steam's (an expected divergence, 79-PARITY.md).
 *
 * Which failures fall back (79-REVIEW C1/IN-03):
 * - Getting no owned set is a fallback, and the caller continues down the CM path. That covers an
 *   inputs-read failure, a refused or failed op and a transport throw.
 * - An apply failure is NOT a fallback. Mac Steam's owned set arrived; the library write is what
 *   failed, and the CM path would fail on the same write after paying for a signed-in logon. It
 *   goes through `syncFailed`, exactly as on the CM path, and throws out of `refresh()`.
 *
 * The bridge launch-target backfill the CM path runs is skipped here on purpose. It needs a
 * token-bearing PICS read on a signed-in lease, and this path holds no lease by design. A missing
 * target is resolved at launch instead: `resolveBridgeLaunchExe` reads anonymous PICS, then the
 * open signed-in session, and persists what it finds.
 */
export async function tryMacSteamRefresh(
  deps: ManagerDeps,
  steamId: string
): Promise<MacSteamRefreshOutcome> {
  deps.sendFrontendMessage('steamSyncStatus', { status: 'syncing' })
  let inputs: Awaited<ReturnType<typeof buildRustRefreshInputs>>
  try {
    inputs = await buildRustRefreshInputs(deps)
  } catch (err) {
    return { kind: 'fallback', reason: `inputs: ${String(err)}` }
  }
  // No backfill on this path (see the doc above), so the bridge appIds are unused.
  const { bridgeAppIds: _bridgeAppIds, ...args } = inputs
  let result: RefreshResult
  try {
    const res = await invokeSteamCm(deps, RUST_STEAMCM_REFRESH, {
      source: {
        kind: 'macSteam',
        helperPath: deps.paths.steamBridgeHelperPath,
        steamId
      },
      ...args
    })
    if (!res.ok) {
      return {
        kind: 'fallback',
        reason: res.kind === 'macFallback' ? (res.reason ?? res.kind) : res.kind
      }
    }
    result = res.result
  } catch (err) {
    return {
      kind: 'fallback',
      reason: `transport: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  logSummary(result)
  try {
    await applyRustRefreshResult(deps, args.metadata, result, args)
  } catch (err) {
    return syncFailed(deps, err)
  }
  logInfo(
    `Steam Refresh: Mac Steam path ok games=${result.ownedCount} demos=${result.demoCount} (no CM logon)`,
    LogPrefix.Steam
  )
  logInfo(
    `Steam library sync complete: ${deps.steamSession.libraryState.library.size} games`,
    LogPrefix.Steam
  )
  deps.sendFrontendMessage('steamSyncStatus', { status: 'idle' })
  return {
    kind: 'done',
    exec: {
      stdout: `${deps.steamSession.libraryState.library.size} games synced`,
      stderr: ''
    }
  }
}
