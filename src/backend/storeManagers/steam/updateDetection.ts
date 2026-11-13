/**
 * Steam update detection for both install kinds (STEAM-01, spikes 069/070).
 *
 * - bridge installs (an ACF in a bridge bottle): stale iff the ACF buildid differs from the anonymous
 *   PICS `depots.branches.<branch>.buildid`, branch = ACF BetaKey or public. A branch PICS cannot show
 *   anonymously, or that is password-gated, is 'unknown', never 'stale' (D-15).
 * - Steam-registered installs (an ACF in a native library root): stale from the ACF alone; PICS is
 *   consulted only when Steam is definitely not running.
 *
 * One batched anonymous PICS read per call; the timeout bounds the anonymous connect and the read together. State lives in the per-boot
 * steamInstallRuntime.updateStates cache (closure Map only, no module state, no timer). A PICS
 * failure never turns a known state into 'stale' or 'current', except that a registered game whose
 * ACF reached the known target build is 'current'; with no prior knowledge a registered game falls
 * back to its ACF.
 */
import { logInfo, LogPrefix } from 'backend/logger'
import type { SteamLibrariesDeps } from 'backend/utils'
import type { SteamLibraryStateDeps } from 'backend/services/types'
import type { AnonymousClientSlice } from './anonymousClient'
import { getBottleSteamappsDir, type BottleSettingsDeps } from './bottle'
import { findBridgeInstallBottle } from './bridgeBottle'
import { listSteamClientPids, type SteamProbeDeps } from './steamClientProcess'
import { withTimeout, isTimeoutError } from './withTimeout'
import {
  isAcfUpdatePending,
  readAcfUpdateFieldsFromDir,
  readAcfUpdateState,
  type AcfUpdateFields
} from './library/acfUpdateState'

export type SteamUpdateKind = 'bridge' | 'registered'
export type SteamUpdateStateValue = 'stale' | 'current' | 'unknown'

export interface SteamUpdateEstimate {
  targetBuild: string
  downloadBytes: number
  peakBytes: number
  oldManifestAvailable: boolean
  computedAt: number
}

export interface SteamUpdateState {
  appId: string
  kind: SteamUpdateKind
  state: SteamUpdateStateValue
  installedBuild: string
  targetBuild?: string
  branch: string
  reason?:
    | 'branch-unresolved'
    | 'pics-timeout'
    | 'pics-failed'
    | 'acf-unreadable'
  checkedAt: number
  pending?: {
    bytesToDownload: number
    bytesDownloaded: number
    scheduledAutoUpdate: number
  }
  estimate?: SteamUpdateEstimate
}

export interface SteamUpdateStateCache {
  get(appId: string): SteamUpdateState | undefined
  set(s: SteamUpdateState, picsAt?: number): void
  invalidate(appId: string): void
  setEstimate(appId: string, e: SteamUpdateEstimate): void
  picsFetchedAt(appId: string): number | undefined
}

export const STEAM_UPDATE_PICS_TTL_MS = 600_000
export const STEAM_UPDATE_REFRESH_TIMEOUT_MS = 20_000
export const STEAM_UPDATE_PRELAUNCH_TIMEOUT_MS = 3_000

/** Per-boot cache: closure Map only, no timers, no I/O. */
export function createSteamUpdateStateCache(): SteamUpdateStateCache {
  const states = new Map<string, SteamUpdateState>()
  const picsAt = new Map<string, number>()
  return {
    get: (appId) => states.get(appId),
    set(s, at) {
      states.set(s.appId, s)
      if (at !== undefined) picsAt.set(s.appId, at)
    },
    invalidate(appId) {
      states.delete(appId)
      picsAt.delete(appId)
    },
    setEstimate(appId, e) {
      const cur = states.get(appId)
      if (cur) states.set(appId, { ...cur, estimate: e })
    },
    picsFetchedAt: (appId) => picsAt.get(appId)
  }
}

export type SteamUpdateDeps = SteamLibraryStateDeps &
  SteamLibrariesDeps &
  BottleSettingsDeps &
  AnonymousClientSlice &
  SteamProbeDeps & {
    steamInstallRuntime: { updateStates: SteamUpdateStateCache }
  }

type PicsOutcome = 'ok' | 'timeout' | 'failed'

interface Candidate {
  appId: string
  kind: SteamUpdateKind
  fields: AcfUpdateFields
  branch: string
}

type PicsBuilds = Map<string, Record<string, unknown> | undefined>

function isGated(v: unknown): boolean {
  return (
    v !== undefined &&
    v !== null &&
    v !== false &&
    v !== 0 &&
    v !== '0' &&
    v !== ''
  )
}

/** The PICS buildid for the candidate's branch, or undefined when not resolvable anonymously. */
function resolveBuild(
  branches: Record<string, unknown> | undefined,
  branch: string
): string | undefined {
  const entry = branches?.[branch] as
    | { buildid?: unknown; pwdrequired?: unknown }
    | undefined
  if (!entry || isGated(entry.pwdrequired)) return undefined
  const b = entry.buildid
  if (b === undefined || b === null) return undefined
  const s = String(b)
  return /^\d{1,20}$/.test(s) && s !== '0' ? s : undefined
}

export function getLastKnownSteamUpdateState(
  deps: Pick<SteamUpdateDeps, 'steamInstallRuntime'>,
  appId: string
): SteamUpdateState | undefined {
  return deps.steamInstallRuntime.updateStates.get(appId)
}

export function invalidateSteamUpdateState(
  deps: Pick<SteamUpdateDeps, 'steamInstallRuntime'>,
  appId: string
): void {
  deps.steamInstallRuntime.updateStates.invalidate(appId)
}

async function classify(
  deps: SteamUpdateDeps,
  appId: string
): Promise<Candidate | null> {
  const bridgeBottle = findBridgeInstallBottle(deps.paths, appId)
  if (bridgeBottle !== null) {
    const fields = await readAcfUpdateFieldsFromDir(
      deps,
      getBottleSteamappsDir(deps.paths, bridgeBottle),
      appId
    )
    // Present at findBridgeInstallBottle time; unreadable now is reported as unknown by the caller.
    return fields
      ? { appId, kind: 'bridge', fields, branch: fields.betaKey ?? 'public' }
      : null
  }
  const fields = await readAcfUpdateState(deps, appId, 'native')
  return fields
    ? {
        appId,
        kind: 'registered',
        fields,
        branch: fields.betaKey ?? 'public'
      }
    : null
}

export async function detectSteamUpdates(
  deps: SteamUpdateDeps,
  opts: { appIds?: string[]; force?: boolean; timeoutMs?: number } = {}
): Promise<SteamUpdateState[]> {
  const cache = deps.steamInstallRuntime.updateStates
  const results: SteamUpdateState[] = []
  let outcome: PicsOutcome | 'skipped' = 'skipped'
  try {
    const wanted = opts.appIds ? new Set(opts.appIds) : undefined
    const candidates: Candidate[] = []
    for (const [appId, info] of deps.steamSession.libraryState.library) {
      if (!info.is_installed || (wanted && !wanted.has(appId))) continue
      const c = await classify(deps, appId)
      if (c) candidates.push(c)
    }

    const now = Date.now()
    const steamPids = candidates.some((c) => c.kind === 'registered')
      ? await listSteamClientPids(deps)
      : undefined
    const steamNotRunning = Array.isArray(steamPids) && steamPids.length === 0

    // Decide which candidates need the PICS answer.
    const needPics: Candidate[] = []
    const reusable = new Map<string, string>() // appId -> cached PICS build
    for (const c of candidates) {
      const wantsPics =
        c.kind === 'bridge' ||
        (steamNotRunning && !isAcfUpdatePending(c.fields))
      if (!wantsPics) continue
      const cached = cache.get(c.appId)
      const at = cache.picsFetchedAt(c.appId)
      if (
        !opts.force &&
        cached?.targetBuild &&
        cached.branch === c.branch &&
        cached.kind === c.kind &&
        at !== undefined &&
        now - at < STEAM_UPDATE_PICS_TTL_MS
      ) {
        reusable.set(c.appId, cached.targetBuild)
      } else {
        needPics.push(c)
      }
    }

    const builds: PicsBuilds = new Map()
    let picsErr: PicsOutcome = 'ok'
    if (needPics.length > 0) {
      const ids = needPics.map((c) => Number(c.appId))
      try {
        // One bound over connect AND read: the anonymous connect used to sit outside the timeout.
        const inner = (async () => {
          const client = await deps.anonymousClient.get('update-check')
          if (!client) return null
          return client.getProductInfo(ids, [], true)
        })()
        inner.catch(() => undefined) // a late rejection after the timeout must not be unhandled
        const res = await withTimeout(
          inner,
          opts.timeoutMs ?? STEAM_UPDATE_REFRESH_TIMEOUT_MS,
          'detectSteamUpdates PICS read'
        )
        if (!res) {
          picsErr = 'failed'
        } else {
          for (const c of needPics) {
            const appinfo = res.apps?.[Number(c.appId)]?.appinfo as
              | { depots?: { branches?: Record<string, unknown> } }
              | undefined
            builds.set(c.appId, appinfo?.depots?.branches)
          }
        }
      } catch (err) {
        picsErr = isTimeoutError(err) ? 'timeout' : 'failed'
      }
      outcome = picsErr
    } else if (reusable.size > 0) {
      outcome = 'ok'
    }

    for (const c of candidates) {
      const prior = cache.get(c.appId)
      const base = {
        appId: c.appId,
        kind: c.kind,
        installedBuild: c.fields.buildid,
        branch: c.branch,
        checkedAt: now
      }
      const pending = {
        bytesToDownload: c.fields.bytesToDownload,
        bytesDownloaded: c.fields.bytesDownloaded,
        scheduledAutoUpdate: c.fields.scheduledAutoUpdate
      }
      let next: SteamUpdateState
      let picsAt: number | undefined

      if (c.kind === 'registered' && isAcfUpdatePending(c.fields)) {
        next = {
          ...base,
          state: 'stale',
          targetBuild:
            c.fields.targetBuildId && c.fields.targetBuildId !== '0'
              ? c.fields.targetBuildId
              : undefined,
          pending
        }
      } else {
        const known = reusable.get(c.appId)
        const wasQueried = needPics.includes(c)
        let target: string | undefined = known
        let fail: SteamUpdateState['reason']
        if (known !== undefined) {
          picsAt = cache.picsFetchedAt(c.appId)
        } else if (wasQueried && picsErr === 'ok') {
          target = resolveBuild(builds.get(c.appId), c.branch)
          if (target === undefined) fail = 'branch-unresolved'
          else picsAt = now
        } else if (wasQueried) {
          fail = picsErr === 'timeout' ? 'pics-timeout' : 'pics-failed'
        }

        if (target !== undefined) {
          next = {
            ...base,
            state: target !== c.fields.buildid ? 'stale' : 'current',
            targetBuild: target
          }
        } else if (
          c.kind === 'registered' &&
          prior &&
          (fail === 'pics-timeout' || fail === 'pics-failed')
        ) {
          // PICS was asked and failed: compare the prior state with the ACF read this pass.
          const { pending: _drop, ...priorNoPending } = prior
          if (prior.installedBuild === c.fields.buildid) {
            // Nothing changed locally: keep the last known state, as the bridge arm does.
            next = { ...prior, reason: fail, checkedAt: now }
          } else if (
            prior.targetBuild !== undefined &&
            c.fields.buildid === prior.targetBuild
          ) {
            // The ACF shows the known target was reached: the one PICS-failure case that may write
            // 'current', because the ACF, not PICS, proves it.
            next = { ...base, state: 'current', targetBuild: prior.targetBuild }
          } else {
            // The ACF moved to some other build: keep prior's state and target, fix the build.
            next = {
              ...priorNoPending,
              installedBuild: c.fields.buildid,
              reason: fail,
              checkedAt: now
            }
          }
        } else if (c.kind === 'registered') {
          // Steam running (PICS not asked), or no prior knowledge to keep: the ACF alone says current.
          next = { ...base, state: 'current' }
        } else if (fail === 'pics-timeout' || fail === 'pics-failed') {
          // Last known state wins; never invent stale/current from a failure.
          next = prior
            ? { ...prior, reason: fail, checkedAt: now }
            : { ...base, state: 'unknown', reason: fail }
        } else {
          next = { ...base, state: 'unknown', reason: 'branch-unresolved' }
        }
      }
      if (
        prior?.estimate &&
        next.targetBuild !== undefined &&
        prior.estimate.targetBuild === next.targetBuild
      ) {
        next = { ...next, estimate: prior.estimate }
      }
      cache.set(next, picsAt)
      results.push(next)
    }
  } catch {
    outcome = outcome === 'skipped' ? 'failed' : outcome
  }

  logInfo(
    `Steam: update check apps=${results.length} stale=${results.filter((r) => r.state === 'stale').length} unknown=${results.filter((r) => r.state === 'unknown').length} pics=${outcome === 'skipped' ? 'ok' : outcome}`,
    LogPrefix.Steam
  )
  return results
}
