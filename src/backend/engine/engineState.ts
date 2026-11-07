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
import type { EngineState, OverlayNoticeStep } from 'common/types/engine'
import {
  preflightCrossover,
  resolveCrossoverBinDirForEngine
} from './engineDecision'
import type {
  CrossoverPreflight,
  EngineDecisionDeps,
  LaunchDecision
} from './engineDecision'
import { engineKeyFor } from './gameKey'
import type { EngineKey } from './gameKey'
import { engineIdOf, readEngineForGame } from './engineConfig'
import type { EffectiveEngine } from './engineConfig'
import { isBottleProvisioned } from './bottlePrimitives'
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

/** The game a state is about: the store runner plus its runner-local app name. */
export interface EngineIdentity {
  runner: string
  appName: string
}

const lastDecision = new Map<
  EngineKey,
  { selection: EngineSelection | null; preflight: CrossoverPreflight | null }
>()
/** IN-04: a cached non-healthy preflight is re-probed after this long. */
export const ENGINE_PREFLIGHT_UNHEALTHY_TTL_MS = 60_000

const preflightCache = new Map<
  string,
  { result: CrossoverPreflight; at: number }
>()
/** IN-03: the last crossoverInstalled value getEngineState computed. */
const lastCrossoverInstalled = new Map<EngineKey, boolean>()
let launchNoticeSeq = 0
/** Phase 60 G4: last state pushed per game, the base for publishOverlayNotice. */
const lastPublished = new Map<EngineKey, EngineState>()
const inflight = new Map<string, Promise<CrossoverPreflight>>()
let publisher: (state: EngineState) => void = () => {}

export function setEngineStatePublisher(
  fn: (state: EngineState) => void
): void {
  publisher = fn
}

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
  /** Defaults to the platform flag. */
  isMac?: boolean
  /** Notice dismissals; defaults to the shared `engineNoticeStore`. */
  store?: EngineNoticeStore
  /**
   * The bottle whose CrossOver preflight decides this game's badge, or null when the game has
   * no engine state (Steam: no bridge install). Null returns no state unless
   * `stateWithoutBottle` is true.
   */
  bottleFor: (identity: EngineIdentity) => string | null
  /** True for a game with no bottle that still shows state (plain prefix, Legacy); no preflight runs. */
  stateWithoutBottle?: boolean
  /** Whether an engine override has any effect for this game in this bottle. */
  overrideEligible: (identity: EngineIdentity, bottle: string | null) => boolean
  /** Whether the overlay toggle applies to this game. */
  overlayEligible: boolean
  /** The effective engine; defaults to `readEngineForGame`. */
  effective?: (identity: EngineIdentity) => EffectiveEngine
  prefixKind?: EngineState['prefixKind']
  perGameBottleName?: string | null
  isBottleReady?: (bottleName: string) => boolean
  preflight?: (bottleName: string) => Promise<CrossoverPreflight>
  now?: () => number
}

function lazyIsMac(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('backend/constants/environment') as { isMac: boolean }).isMac
}

function lazyNoticeStore(): EngineNoticeStore {
  return (
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./engineNoticeStore') as typeof import('./engineNoticeStore'))
      .engineNoticeStore
  )
}

function effectiveFor(
  identity: EngineIdentity,
  deps: EngineStateDeps
): EffectiveEngine {
  return deps.effective ? deps.effective(identity) : readEngineForGame(identity)
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
  identity: EngineIdentity,
  effective: EffectiveEngine,
  extras: Pick<EngineState, 'prefixKind' | 'perGameBottleName'>,
  override: EngineOverrideId,
  crossoverInstalled: boolean,
  preflight: CrossoverPreflight | null,
  engineLabel: string | null,
  store: EngineNoticeStore,
  overrideEligible: boolean,
  overlayEligible: boolean,
  launchNotice: EngineState['launchNotice']
): EngineState {
  let engine: EngineState['engine'] = null
  let reason: EngineState['reason'] = null
  let overrideWarning: EngineState['overrideWarning'] = null
  const legacy = effective.kind === 'legacy'
  if (legacy) {
    // D-15: a Legacy Wine is shown as unsupported and never waits on a preflight.
    engine = 'unsupported'
    reason = 'override'
  } else if (isUnsupportedOverride(override)) {
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
    runner: identity.runner,
    appName: identity.appName,
    engine,
    reason,
    engineLabel:
      effective.kind === 'legacy' ? `Legacy: ${effective.label}` : engineLabel,
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
    overlayNotice: null,
    exitNotice: null,
    effectiveEngineId: engineIdOf(effective),
    engineSource: effective.kind === 'override' ? effective.source : 'derived',
    prefixKind: extras.prefixKind ?? null,
    perGameBottleName: extras.perGameBottleName ?? null,
    legacyLabel: effective.kind === 'legacy' ? effective.label : null
  }
}

function labelFor(key: EngineKey): string | null {
  const sel = lastDecision.get(key)?.selection
  if (!sel) return null
  return sel.kind === 'crossover' ? 'CrossOver' : sel.label
}

function overrideOf(effective: EffectiveEngine): EngineOverrideId {
  return effective.kind === 'override' ? effective.id : 'automatic'
}

export async function getEngineState(
  identity: unknown,
  deps: EngineStateDeps
): Promise<EngineState | null> {
  const id = asIdentity(identity)
  if (id === null) return null
  const key = engineKeyFor(id.runner, id.appName)
  if (key === null) return null
  if (!(deps.isMac ?? lazyIsMac())) return null
  const bottle = deps.bottleFor(id)
  if (bottle === null && deps.stateWithoutBottle !== true) return null
  const effective = effectiveFor(id, deps)
  const override = overrideOf(effective)
  const store = deps.store ?? lazyNoticeStore()
  const now = deps.now ?? Date.now
  const extras = {
    prefixKind: deps.prefixKind ?? null,
    perGameBottleName: deps.perGameBottleName ?? null
  }
  const overrideEligible = deps.overrideEligible(id, bottle)

  let preflight: CrossoverPreflight | null =
    bottle === null ? null : cachedPreflight(bottle, now())
  let crossoverInstalled: boolean
  const resolveBin =
    deps.resolveCrossoverBinDir ?? (() => resolveCrossoverBinDirForEngine(deps))
  if (preflight) {
    crossoverInstalled = preflight.kind !== 'missing'
  } else {
    const binDir = await resolveBin()
    crossoverInstalled = binDir !== undefined
    if (effective.kind === 'legacy' || isUnsupportedOverride(override)) {
      // G12a / D-15: a pinned, wine-manager or Legacy engine never waits on the preflight.
    } else if (bottle === null) {
      // No bottle to probe: report only whether CrossOver is installed.
    } else if (!crossoverInstalled) {
      preflight = { kind: 'missing', detail: 'CrossOver is not installed' }
    } else if ((deps.isBottleReady ?? isBottleProvisioned)(bottle)) {
      let p = inflight.get(bottle)
      if (!p) {
        const run =
          deps.preflight ??
          ((n: string) => preflightCrossover(n, deps, { killOnTimeout: false }))
        p = run(bottle).then(
          (r) => {
            if (!(r.kind === 'broken' && r.inconclusive === true)) {
              preflightCache.set(bottle, { result: r, at: now() })
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
  lastCrossoverInstalled.set(key, crossoverInstalled)
  return compute(
    id,
    effective,
    extras,
    override,
    crossoverInstalled,
    preflight,
    labelFor(key),
    store,
    overrideEligible,
    deps.overlayEligible,
    null
  )
}

function asIdentity(identity: unknown): EngineIdentity | null {
  if (typeof identity !== 'object' || identity === null) return null
  const { runner, appName } = identity as Record<string, unknown>
  if (typeof runner !== 'string' || typeof appName !== 'string') return null
  return { runner, appName }
}

export function recordLaunchDecision(
  identity: EngineIdentity,
  decision: LaunchDecision,
  bottleName: string,
  deps: EngineStateDeps
): void {
  if (decision.kind !== 'use') return
  const key = engineKeyFor(identity.runner, identity.appName)
  if (key === null) return
  lastDecision.set(key, {
    selection: decision.selection,
    preflight: decision.preflight
  })
  try {
    const now = deps.now ?? Date.now
    if (
      decision.preflight &&
      !(
        decision.preflight.kind === 'broken' &&
        decision.preflight.inconclusive === true
      )
    ) {
      preflightCache.set(bottleName, {
        result: decision.preflight,
        at: now()
      })
    }
    const preflight = decision.preflight ?? cachedPreflight(bottleName, now())
    const installed = preflight
      ? preflight.kind !== 'missing'
      : (lastCrossoverInstalled.get(key) ?? true)
    lastCrossoverInstalled.set(key, installed)
    const sel = decision.selection
    const launchNotice: EngineState['launchNotice'] =
      isNonCrossover(sel) &&
      decision.override === 'automatic' &&
      sel.reason !== 'override'
        ? { reason: sel.reason, seq: ++launchNoticeSeq }
        : null
    const stored = effectiveFor(identity, deps)
    // The decision's override is authoritative for this launch.
    const effective: EffectiveEngine = {
      kind: 'override',
      id: decision.override,
      source: stored.kind === 'override' ? stored.source : 'derived'
    }
    const state = compute(
      identity,
      effective,
      {
        prefixKind: deps.prefixKind ?? null,
        perGameBottleName: deps.perGameBottleName ?? null
      },
      decision.override,
      installed,
      preflight ?? null,
      labelFor(key),
      deps.store ?? lazyNoticeStore(),
      deps.overrideEligible(identity, bottleName),
      deps.overlayEligible,
      launchNotice
    )
    lastPublished.set(key, state)
    publisher(state)
  } catch (e) {
    logError(
      `Engine: engine state publisher failed: ${String(e)}`,
      LogPrefix.Backend
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
  identity: EngineIdentity,
  step: OverlayNoticeStep
): boolean {
  const key = engineKeyFor(identity.runner, identity.appName)
  if (key === null) return false
  const base = lastPublished.get(key)
  if (!base) return false
  try {
    const state: EngineState = {
      ...base,
      overlayNotice: { step, seq: ++launchNoticeSeq }
    }
    publisher(state)
    return true
  } catch (e) {
    logError(
      `Engine: overlay notice publisher failed: ${String(e)}`,
      LogPrefix.Backend
    )
    return false
  }
}

/**
 * Quick 261105-ast: push an in-app "game closed soon after starting" notice
 * for an overlay launch that exited abnormally. Same shared seq counter as the
 * other notices. Never retries and never changes settings (D-10). Never throws.
 */
export function publishOverlayExitNotice(identity: EngineIdentity): boolean {
  const key = engineKeyFor(identity.runner, identity.appName)
  if (key === null) return false
  const base = lastPublished.get(key)
  if (!base) return false
  try {
    const state: EngineState = {
      ...base,
      exitNotice: { seq: ++launchNoticeSeq }
    }
    publisher(state)
    return true
  } catch (e) {
    logError(
      `Engine: overlay exit notice publisher failed: ${String(e)}`,
      LogPrefix.Backend
    )
    return false
  }
}

export async function dismissEngineNotice(
  args: unknown,
  store?: EngineNoticeStore
): Promise<{ ok: boolean }> {
  const s = store ?? lazyNoticeStore()
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
