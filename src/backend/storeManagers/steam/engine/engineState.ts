/**
 * Per-title engine display state (phase 59: D-04, D-06, D-13, D-15).
 *
 * Answers "which engine, which notice" for the game page. The page preflight
 * runs only when the renderer asks (never at boot), at most once per bottle
 * per session, with concurrent callers sharing one in-flight promise. A launch
 * replaces the cached preflight with its own fresh one (recordLaunchDecision).
 *
 * Sidecar exit contract: no timers, nothing runs at import.
 */
import { logError, LogPrefix } from 'backend/logger'
import type { SteamEngineState } from 'common/types/steam'
import {
  preflightCrossover,
  readStoredEngineOverride,
  resolveCrossoverBinDirForEngine
} from './engineDecision'
import type {
  CrossoverPreflight,
  EngineDecisionDeps,
  LaunchDecision
} from './engineDecision'
import { OVERLAY_STEPS } from '../bridge/overlay/overlayNotice'
import type { OverlayStep } from '../bridge/overlay/overlayNotice'
import { parseEngineOverride } from './engineIds'
import type { EngineOverrideId } from './engineIds'
import { isNonCrossover } from './engineTypes'
import type { EngineSelection } from './engineTypes'
import {
  dismissUntestedNotice,
  shouldShowUntestedNotice
} from './testedCrossoverVersions'
import type { EngineNoticeStore } from './testedCrossoverVersions'

/** D-13: show the trial notice at this many days remaining or fewer. */
export const TRIAL_NOTICE_DAYS = 7

const NO_CROSSOVER_KEY = 'noCrossoverNoteDismissed'
const BUILD_RE = /^\d+\.\d+\.\d+\.\d+$/

const lastDecision = new Map<
  string,
  { selection: EngineSelection | null; preflight: CrossoverPreflight | null }
>()
/** IN-04: a cached non-healthy preflight is re-probed after this long. */
export const ENGINE_PREFLIGHT_UNHEALTHY_TTL_MS = 60_000

const preflightCache = new Map<
  string,
  { result: CrossoverPreflight; at: number }
>()
/** IN-03: the last crossoverInstalled value getSteamEngineState computed. */
const lastCrossoverInstalled = new Map<string, boolean>()
let launchNoticeSeq = 0
/** Phase 60 G4: last state pushed per appId, the base for publishOverlayNotice. */
const lastPublished = new Map<string, SteamEngineState>()
const inflight = new Map<string, Promise<CrossoverPreflight>>()
let publisher: (state: SteamEngineState) => void = () => {}

export function setEngineStatePublisher(
  fn: (state: SteamEngineState) => void
): void {
  publisher = fn
}

// ts-prune-ignore-next
export function __resetEngineStateForTests(): void {
  lastDecision.clear()
  preflightCache.clear()
  lastCrossoverInstalled.clear()
  launchNoticeSeq = 0
  lastPublished.clear()
  inflight.clear()
  publisher = () => {}
}

export interface EngineStateDeps extends Partial<EngineDecisionDeps> {
  isMac: boolean
  store: EngineNoticeStore
  /** The bottle holding this title's bridge install, or null when it has none. */
  bridgeInstallBottleFor(appId: string): string | null
  /** The title's own per-game bottle name (never null). */
  ownBottleNameFor(appId: string): string
  /** True for a title whose persisted bridge mode is the DRM steamclient layer. */
  isDrmModeTitle(appId: string): boolean
  now(): number
  isBridgeBottleReady(bottleName: string): boolean
  preflight(bottleName: string): Promise<CrossoverPreflight>
}

const lazyBottle = () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../bottle') as typeof import('../bottle')

const lazyBridgeVerdict = () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../bridge/bridgeVerdict') as typeof import('../bridge/bridgeVerdict')

function stateDeps(deps?: Partial<EngineStateDeps>): EngineStateDeps {
  return {
    isMac:
      deps?.isMac ??
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('backend/constants/environment') as { isMac: boolean }).isMac,
    store:
      deps?.store ??
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('../electronStores') as typeof import('../electronStores'))
        .steamEngineNoticeStore,
    bridgeInstallBottleFor:
      deps?.bridgeInstallBottleFor ??
      ((id) => lazyBottle().findBridgeInstallBottle(id)),
    ownBottleNameFor:
      deps?.ownBottleNameFor ?? ((id) => lazyBottle().bridgeBottleNameFor(id)),
    isDrmModeTitle:
      deps?.isDrmModeTitle ??
      ((id) => isDrmModeFromVerdict(lazyBridgeVerdict().readBridgeVerdict(id))),
    now: deps?.now ?? Date.now,
    isBridgeBottleReady:
      deps?.isBridgeBottleReady ?? ((n) => lazyBottle().isBridgeBottleReady(n)),
    preflight:
      deps?.preflight ??
      ((n) => preflightCrossover(n, deps, { killOnTimeout: false })),
    ...deps
  } as EngineStateDeps
}

/**
 * WR-07: whether a persisted verdict means the engine override has no effect.
 * WR-01: a CEG verdict wins regardless of the persisted mode. The install
 * prefetch persists `tcp` for CEG titles (resolveBridgeMode), but a CEG launch
 * is refused, so the override has no effect there. Otherwise a persisted
 * `mode` decides; a title installed before the mode was persisted is resolved
 * from a steamstub scan. Read-only: a page view must not write the verdict
 * store.
 */
export function isDrmModeFromVerdict(
  verdict:
    | { mode?: string; drm?: string; scan?: { drmWrapper?: string } }
    | undefined
): boolean {
  if (!verdict) return false
  if (verdict.drm === 'ceg') return true
  if (verdict.mode !== undefined) return verdict.mode === 'steamclient-layer'
  return verdict.scan?.drmWrapper === 'steamstub'
}

function readOverride(appId: string, deps: EngineStateDeps): EngineOverrideId {
  const raw = deps.readOverride
    ? deps.readOverride(appId)
    : readStoredEngineOverride(appId)
  return parseEngineOverride(raw)
}

function cachedPreflight(
  bottle: string,
  now: number
): CrossoverPreflight | null {
  const e = preflightCache.get(bottle)
  if (!e) return null
  if (
    e.result.kind !== 'healthy' &&
    now - e.at > ENGINE_PREFLIGHT_UNHEALTHY_TTL_MS
  ) {
    preflightCache.delete(bottle)
    return null
  }
  return e.result
}

const isUnsupportedOverride = (o: EngineOverrideId) =>
  o.startsWith('pinned:') || o.startsWith('wine-manager:')

function compute(
  appId: string,
  override: EngineOverrideId,
  crossoverInstalled: boolean,
  preflight: CrossoverPreflight | null,
  engineLabel: string | null,
  store: EngineNoticeStore,
  overrideEligible: boolean,
  overlayEligible: boolean,
  launchNotice: SteamEngineState['launchNotice']
): SteamEngineState {
  let engine: SteamEngineState['engine'] = null
  let reason: SteamEngineState['reason'] = null
  let overrideWarning: SteamEngineState['overrideWarning'] = null
  if (isUnsupportedOverride(override)) {
    engine = 'unsupported'
    reason = 'override'
  } else if (override === 'crossover') {
    // G9: CrossOver is the supported engine however it was chosen.
    engine = 'crossover'
    reason = 'override'
    // WR-06: a forced CrossOver that will nag (expired) or may fail (broken).
    if (preflight?.kind === 'expired') overrideWarning = 'cx-expired'
    else if (preflight?.kind === 'broken' && preflight.inconclusive !== true)
      overrideWarning = 'cx-broken'
  } else if (preflight) {
    if (preflight.kind === 'healthy') {
      engine = 'crossover'
      reason = 'cx-healthy'
    } else {
      engine = 'builtin'
      reason =
        preflight.kind === 'missing'
          ? 'cx-missing'
          : preflight.kind === 'expired'
            ? 'cx-expired'
            : 'cx-broken'
    }
  }
  const trialDaysRemaining =
    preflight?.kind === 'healthy' ? preflight.trialDaysRemaining : null
  const build =
    preflight && preflight.kind !== 'missing' ? preflight.build : null
  const noteDismissed = store.get(NO_CROSSOVER_KEY, false) === true
  return {
    appId,
    engine,
    reason,
    engineLabel,
    trialDaysRemaining,
    showTrialNotice:
      trialDaysRemaining !== null && trialDaysRemaining <= TRIAL_NOTICE_DAYS,
    crossoverInstalled,
    showNoCrossoverNote: !crossoverInstalled && !noteDismissed,
    untestedCrossoverBuild:
      build !== null && shouldShowUntestedNotice(build, store) ? build : null,
    overrideEligible,
    overlayEligible,
    overrideWarning,
    launchNotice,
    overlayNotice: null
  }
}

function labelFor(appId: string): string | null {
  const sel = lastDecision.get(appId)?.selection
  if (!sel) return null
  return sel.kind === 'crossover' ? 'CrossOver' : sel.label
}

export async function getSteamEngineState(
  appId: unknown,
  deps?: Partial<EngineStateDeps>
): Promise<SteamEngineState | null> {
  if (typeof appId !== 'string' || !/^\d+$/.test(appId)) return null
  const d = stateDeps(deps)
  if (!d.isMac) return null
  // WR-04: only a title with a bridge install has an engine choice.
  const bottle = d.bridgeInstallBottleFor(appId)
  if (bottle === null) return null
  const overrideEligible =
    bottle === d.ownBottleNameFor(appId) && !d.isDrmModeTitle(appId)
  const override = readOverride(appId, d)

  let preflight: CrossoverPreflight | null = cachedPreflight(bottle, d.now())
  let crossoverInstalled: boolean
  const resolveBin = d.resolveCrossoverBinDir ?? resolveCrossoverBinDirForEngine
  if (preflight) {
    crossoverInstalled = preflight.kind !== 'missing'
  } else {
    const binDir = await resolveBin()
    crossoverInstalled = binDir !== undefined
    if (isUnsupportedOverride(override)) {
      // G12a: a pinned/wine-manager override never waits on the preflight.
    } else if (!crossoverInstalled) {
      preflight = { kind: 'missing', detail: 'CrossOver is not installed' }
    } else if (d.isBridgeBottleReady(bottle)) {
      let p = inflight.get(bottle)
      if (!p) {
        p = d.preflight(bottle).then(
          (r) => {
            if (!(r.kind === 'broken' && r.inconclusive === true)) {
              preflightCache.set(bottle, { result: r, at: d.now() })
            }
            inflight.delete(bottle)
            return r
          },
          (e) => {
            inflight.delete(bottle)
            throw e
          }
        )
        inflight.set(bottle, p)
      }
      const probed = await p
      crossoverInstalled = probed.kind !== 'missing'
      // WR-02: an inconclusive probe is no evidence either way: no badge.
      preflight =
        probed.kind === 'broken' && probed.inconclusive === true ? null : probed
    }
  }
  lastCrossoverInstalled.set(appId, crossoverInstalled)
  return compute(
    appId,
    override,
    crossoverInstalled,
    preflight,
    labelFor(appId),
    d.store,
    overrideEligible,
    // Phase 60 D-02: a bridge bottle exists on macOS here, so the overlay toggle applies.
    true,
    null
  )
}

export function recordLaunchDecision(
  appId: string,
  decision: LaunchDecision,
  bottleName: string,
  deps?: Partial<EngineStateDeps>
): void {
  if (decision.kind !== 'use') return
  lastDecision.set(appId, {
    selection: decision.selection,
    preflight: decision.preflight
  })
  try {
    const d = stateDeps(deps)
    if (
      decision.preflight &&
      !(
        decision.preflight.kind === 'broken' &&
        decision.preflight.inconclusive === true
      )
    ) {
      preflightCache.set(bottleName, {
        result: decision.preflight,
        at: d.now()
      })
    }
    const preflight = decision.preflight ?? cachedPreflight(bottleName, d.now())
    const installed = preflight
      ? preflight.kind !== 'missing'
      : (lastCrossoverInstalled.get(appId) ?? true)
    lastCrossoverInstalled.set(appId, installed)
    const sel = decision.selection
    const launchNotice: SteamEngineState['launchNotice'] =
      isNonCrossover(sel) &&
      decision.override === 'automatic' &&
      sel.reason !== 'override'
        ? { reason: sel.reason, seq: ++launchNoticeSeq }
        : null
    const overrideEligible =
      bottleName === d.ownBottleNameFor(appId) && !d.isDrmModeTitle(appId)
    const state = compute(
      appId,
      decision.override,
      installed,
      preflight ?? null,
      labelFor(appId),
      d.store,
      overrideEligible,
      // Phase 60 D-02: only bridge launches reach here, so the overlay toggle applies.
      true,
      launchNotice
    )
    lastPublished.set(appId, state)
    publisher(state)
  } catch (e) {
    logError(
      `SteamEngine: engine state publisher failed: ${String(e)}`,
      LogPrefix.Steam
    )
  }
}

/**
 * Phase 60 G4 / D-09: push an in-app overlay-unavailable notice. Re-pushes the
 * last published state for the title with a fresh seq (shared counter), so the
 * renderer shows it once per failure, never deduplicated. Returns whether it
 * published. Never throws: the game launches regardless (D-08).
 */
export function publishOverlayNotice(
  appId: string,
  step: OverlayStep
): boolean {
  if (!/^\d+$/.test(appId)) return false
  if (!(OVERLAY_STEPS as readonly string[]).includes(step)) return false
  const base = lastPublished.get(appId)
  if (!base) return false
  try {
    const state: SteamEngineState = {
      ...base,
      overlayNotice: { step, seq: ++launchNoticeSeq }
    }
    publisher(state)
    return true
  } catch (e) {
    logError(
      `SteamEngine: overlay notice publisher failed: ${String(e)}`,
      LogPrefix.Steam
    )
    return false
  }
}

export async function dismissSteamEngineNotice(
  args: unknown,
  store?: EngineNoticeStore
): Promise<{ ok: boolean }> {
  const s =
    store ??
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('../electronStores') as typeof import('../electronStores'))
      .steamEngineNoticeStore
  if (typeof args !== 'object' || args === null) return { ok: false }
  const a = args as { kind?: unknown; build?: unknown }
  if (a.kind === 'no-crossover') {
    s.set(NO_CROSSOVER_KEY, true)
    return { ok: true }
  }
  if (
    a.kind === 'untested-crossover' &&
    typeof a.build === 'string' &&
    BUILD_RE.test(a.build)
  ) {
    return { ok: dismissUntestedNotice(a.build, s) }
  }
  return { ok: false }
}
