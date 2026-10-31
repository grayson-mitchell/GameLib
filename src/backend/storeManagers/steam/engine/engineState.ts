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
import { preflightCrossover } from './engineDecision'
import type {
  CrossoverPreflight,
  EngineDecisionDeps,
  LaunchDecision
} from './engineDecision'
import { parseEngineOverride } from './engineIds'
import type { EngineOverrideId } from './engineIds'
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
const preflightCache = new Map<string, CrossoverPreflight>()
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
  inflight.clear()
  publisher = () => {}
}

export interface EngineStateDeps extends Partial<EngineDecisionDeps> {
  isMac: boolean
  store: EngineNoticeStore
  bridgeBottleNameFor(appId: string): string | null
  isBridgeBottleReady(bottleName: string): boolean
  preflight(bottleName: string): Promise<CrossoverPreflight>
}

const lazyBottle = () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../bottle') as typeof import('../bottle')

type GameConfigShape = {
  GameConfig: {
    get(id: string): { config?: { steamEngineOverride?: unknown } }
  }
}
const lazyGameConfig = () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('backend/game_config') as GameConfigShape

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
    bridgeBottleNameFor:
      deps?.bridgeBottleNameFor ??
      ((id) => lazyBottle().bridgeBottleNameFor(id)),
    isBridgeBottleReady:
      deps?.isBridgeBottleReady ?? ((n) => lazyBottle().isBridgeBottleReady(n)),
    preflight: deps?.preflight ?? ((n) => preflightCrossover(n, deps)),
    ...deps
  } as EngineStateDeps
}

function readOverride(appId: string, deps: EngineStateDeps): EngineOverrideId {
  const raw = deps.readOverride
    ? deps.readOverride(appId)
    : lazyGameConfig().GameConfig.get(appId).config?.steamEngineOverride
  return parseEngineOverride(raw)
}

function compute(
  appId: string,
  override: EngineOverrideId,
  crossoverInstalled: boolean,
  preflight: CrossoverPreflight | null,
  engineLabel: string | null,
  store: EngineNoticeStore
): SteamEngineState {
  const unsupported = override !== 'automatic'
  let engine: SteamEngineState['engine'] = null
  let reason: SteamEngineState['reason'] = null
  if (unsupported) {
    engine = 'unsupported'
    reason = 'override'
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
      build !== null && shouldShowUntestedNotice(build, store) ? build : null
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
  const bottle = d.bridgeBottleNameFor(appId)
  if (bottle === null) return null
  const override = readOverride(appId, d)

  let preflight: CrossoverPreflight | null = preflightCache.get(bottle) ?? null
  let crossoverInstalled: boolean
  if (preflight) {
    crossoverInstalled = preflight.kind !== 'missing'
  } else {
    const binDir = d.resolveCrossoverBinDir
      ? await d.resolveCrossoverBinDir()
      : await (async () => {
          const { resolveCrossoverBinDirAsync } =
            await import('../crossoverLocation')
          const { persistedWineBins } = await import('../bottle')
          return resolveCrossoverBinDirAsync({
            hintWineBins: persistedWineBins()
          })
        })()
    crossoverInstalled = binDir !== undefined
    if (!crossoverInstalled) {
      preflight = { kind: 'missing', detail: 'CrossOver is not installed' }
    } else if (d.isBridgeBottleReady(bottle)) {
      let p = inflight.get(bottle)
      if (!p) {
        p = d.preflight(bottle).then(
          (r) => {
            preflightCache.set(bottle, r)
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
      preflight = await p
      crossoverInstalled = preflight.kind !== 'missing'
    }
  }
  return compute(
    appId,
    override,
    crossoverInstalled,
    preflight,
    labelFor(appId),
    d.store
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
  if (decision.preflight) preflightCache.set(bottleName, decision.preflight)
  try {
    const d = stateDeps(deps)
    const preflight = decision.preflight ?? preflightCache.get(bottleName)
    const state = compute(
      appId,
      decision.override,
      preflight ? preflight.kind !== 'missing' : true,
      preflight ?? null,
      labelFor(appId),
      d.store
    )
    publisher(state)
  } catch (e) {
    logError(
      `SteamEngine: engine state publisher failed: ${String(e)}`,
      LogPrefix.Steam
    )
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
