/**
 * Phase 61 (D-01, D-03): the per-game bottle every non-Steam game gets on macOS.
 *
 * Name scheme: `GameLib-<runner>-<encoded appName>`. The encoding keeps `[A-Za-z0-9-]` and writes
 * every other byte of the UTF-8 appName as `_xx` (lower-case hex; `_` itself becomes `_5f`), which
 * is injective. Spike 068 measured that dots are accepted, so `.` is kept literally (Amazon ids
 * carry them) except inside a run of dots, where each one is escaped so `..` can never appear.
 * The runner in the name makes it collision-free across stores. A name over the cap is cut and
 * suffixed `-<first 10 hex of sha256(runner:appName)>`.
 *
 * Spike 068 accepted names up to 120 characters; the cap is held at 64, the plan's ceiling,
 * because the true limit was never measured above 120 and 64 leaves every id real stores produce
 * (legendary 32, nile ~40, gog ~10) whole.
 *
 * createCrossoverBottle mirrors the CrossOver arm of Steam's provisionBridgeBottle but is built
 * only from the shared primitives. Steam's arm is left untouched; phase 65 should fold it onto
 * this one. Without CrossOver the shared createFallbackBottle runs (D-03), no second path.
 */
import { dirname, join } from 'path'
import { existsSync } from 'graceful-fs'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { EngineServices } from './engineServices'
import type { NonCrossoverEngine } from './engineTypes'
import {
  type BottleSpawnDeps,
  getBottleDir,
  isBottleProvisioned,
  sanitizeBottleName
} from './bottlePrimitives'
import {
  killBottleWineServerWith,
  removeCreatedBottleDir
} from 'backend/enginewine/bottles'
import { createFallbackBottleCancellable } from './fallbackBottleCall'
import type { EngineRuntime } from './engineRuntime'
import {
  CX_CREATE_CAP_MS,
  decideCreationEngine,
  resolveCrossoverBinDirForEngine
} from './engineDecision'
import { ENGINE_PINS } from './enginePins'
import type { EnginePin } from './enginePins'
import type { EngineKey } from './gameKey'
import { ensurePinnedEngineReportingStatus } from './pinnedEngineProgress'
import type { PinnedEngineResult } from './pinnedEngineProgress'
import type { Runner } from 'common/types'

const CROSSOVER_CREATE_TIMEOUT = 'crossover-create-timeout' as const
const CROSSOVER_CREATE_FAILED = 'crossover-create-failed' as const
const PROVISION_ABORTED = 'provision-aborted' as const
const ENGINE_DOWNLOAD_FAILED = 'engine-download-failed' as const

/**
 * The deterministic per-game bottle name lives in the TS twin `enginewine/twin.ts` (Phase 87, 87-28, D-24):
 * one copy, pinned to the Rust `game_engine::per_game_bottle_name` by shared vectors. Re-exported so the
 * engine TS that is alive until 87-56 keeps its import.
 */
export { perGameBottleName } from 'backend/enginewine/twin'

export type CreateBottleResult = {
  status: 'done' | 'error'
  error?: string
  errorCode?: string
  createdHere?: boolean
}

/** CrossOver `cxbottle --create`, capped; on any failure removes what this call created. */
export async function createCrossoverBottle(
  deps: BottleSpawnDeps & {
    engineRuntime: Pick<EngineRuntime, 'requestRustInvoke'>
  },
  bottleName: string,
  binDir: string,
  opts: { createTimeoutMs?: number; signal?: AbortSignal } = {}
): Promise<CreateBottleResult> {
  const createTimeoutMs = opts.createTimeoutMs ?? CX_CREATE_CAP_MS
  const safe = sanitizeBottleName(bottleName)
  if (safe === null || safe !== bottleName) {
    logError(
      `createCrossoverBottle: rejected unsafe bottle name "${bottleName}"`,
      LogPrefix.Backend
    )
    return { status: 'error', error: `Invalid bottle name: "${bottleName}"` }
  }
  const createdHere = !existsSync(getBottleDir(deps.paths, bottleName))
  const rust = { requestRustInvoke: deps.engineRuntime.requestRustInvoke }
  const cleanup = async () => {
    await killBottleWineServerWith(
      rust,
      bottleName,
      join(binDir, 'wineserver'),
      { CX_ROOT: dirname(binDir) },
      15_000
    )
    if (createdHere) await removeCreatedBottleDir(rust, bottleName)
  }
  const aborted = async (): Promise<CreateBottleResult> => {
    logInfo(
      `createCrossoverBottle: creation cancelled for "${bottleName}"`,
      LogPrefix.Backend
    )
    await cleanup()
    return {
      status: 'error',
      errorCode: PROVISION_ABORTED,
      error: 'bottle creation cancelled'
    }
  }
  if (opts.signal?.aborted) return aborted()
  try {
    const { code, stderr } = await deps.spawnAsync(
      join(binDir, 'cxbottle'),
      ['--create', '--bottle', bottleName, '--template', 'win10_64'],
      { timeout: createTimeoutMs, signal: opts.signal }
    )
    if (opts.signal?.aborted) return await aborted()
    if (code === null) {
      logError(
        `createCrossoverBottle: cxbottle create for "${bottleName}" hit its ${createTimeoutMs} ms cap`,
        LogPrefix.Backend
      )
      await cleanup()
      return {
        status: 'error',
        errorCode: CROSSOVER_CREATE_TIMEOUT,
        error: 'CrossOver did not finish creating the bottle'
      }
    }
    if (!isBottleProvisioned(deps.paths, bottleName)) {
      // log-secret-gate-exempt: stderr of cxbottle create (bottle provisioning), not an auth command
      logError(
        [
          'createCrossoverBottle: cxbottle create did not produce cxbottle.conf for',
          bottleName,
          `(code=${code}):`,
          stderr
        ],
        LogPrefix.Backend
      )
      await cleanup()
      return {
        status: 'error',
        errorCode: CROSSOVER_CREATE_FAILED,
        error: `Failed to create CrossOver bottle "${bottleName}"`
      }
    }
  } catch (error) {
    logError(
      ['createCrossoverBottle: cxbottle create threw', error],
      LogPrefix.Backend
    )
    if (opts.signal?.aborted) return await aborted()
    await cleanup()
    return {
      status: 'error',
      errorCode: CROSSOVER_CREATE_FAILED,
      error: `Failed to create CrossOver bottle "${bottleName}": ${String(error)}`
    }
  }
  // Best effort: a fresh bottle must not leave a wedged wineserver behind.
  await killBottleWineServerWith(
    rust,
    bottleName,
    join(binDir, 'wineserver'),
    { CX_ROOT: dirname(binDir) },
    15_000
  )
  return { status: 'done', createdHere }
}

type EnsureGameBottleResult =
  | {
      status: 'done'
      createdHere: boolean
      engine: 'crossover' | 'pinned' | 'existing'
    }
  | { status: 'error'; errorCode?: string; error: string }

export interface PerGameBottleDeps {
  decide: (args: { key: string }) => ReturnType<typeof decideCreationEngine>
  resolveBinDir: () => Promise<string | undefined>
  createCrossover: (
    ...args: Parameters<typeof createCrossoverBottle> extends [
      unknown,
      ...infer R
    ]
      ? R
      : never
  ) => ReturnType<typeof createCrossoverBottle>
  /** The built-in engine's creation, over Rust (87-42): the engine, then the signal that cancels it. */
  createFallback: (
    bottleName: string,
    engine: NonCrossoverEngine,
    signal?: AbortSignal
  ) => Promise<CreateBottleResult>
  ensurePin: (
    args: Omit<
      Parameters<typeof ensurePinnedEngineReportingStatus>[0],
      | 'processRunner'
      | 'onlineMonitor'
      | 'fallback'
      | 'sendFrontendMessage'
      | 'appRuntime'
    >
  ) => Promise<PinnedEngineResult>
  currentPin: () => EnginePin
  isProvisioned: (bottleName: string) => boolean
}

const defaultDeps = (
  services: Pick<EngineServices, 'paths'>
): Omit<
  PerGameBottleDeps,
  | 'createCrossover'
  | 'createFallback'
  | 'decide'
  | 'resolveBinDir'
  | 'ensurePin'
> => ({
  currentPin: () => ENGINE_PINS.current,
  isProvisioned: (bottleName) => isBottleProvisioned(services.paths, bottleName)
})

async function createWithPinned(
  a: {
    bottleName: string
    appName: string
    runner: Runner
    signal?: AbortSignal
  },
  pin: EnginePin,
  d: PerGameBottleDeps
): Promise<EnsureGameBottleResult> {
  const pinned = await d.ensurePin({
    pin,
    appName: a.appName,
    runner: a.runner,
    signal: a.signal
  })
  if (!pinned.ok) {
    return pinned.aborted
      ? {
          status: 'error',
          errorCode: PROVISION_ABORTED,
          error: 'bottle creation cancelled'
        }
      : {
          status: 'error',
          errorCode: ENGINE_DOWNLOAD_FAILED,
          error: pinned.error
        }
  }
  const made = await d.createFallback(a.bottleName, pinned.engine, a.signal)
  if (made.status === 'error') {
    return {
      status: 'error',
      errorCode: made.errorCode,
      error: made.error ?? 'bottle creation failed'
    }
  }
  return {
    status: 'done',
    createdHere: made.createdHere ?? false,
    engine: 'pinned'
  }
}

async function ensureOnce(
  a: {
    key: EngineKey
    bottleName: string
    appName: string
    runner: Runner
    signal?: AbortSignal
  },
  d: PerGameBottleDeps
): Promise<EnsureGameBottleResult> {
  if (d.isProvisioned(a.bottleName)) {
    return { status: 'done', createdHere: false, engine: 'existing' }
  }
  const decision = await d.decide({ key: a.key })
  if (decision.kind === 'pinned') return createWithPinned(a, decision.pin, d)
  const binDir = await d.resolveBinDir()
  if (binDir === undefined) return createWithPinned(a, d.currentPin(), d)
  const made = await d.createCrossover(a.bottleName, binDir, {
    createTimeoutMs: decision.createTimeoutMs,
    signal: a.signal
  })
  if (made.status === 'done') {
    return {
      status: 'done',
      createdHere: made.createdHere ?? false,
      engine: 'crossover'
    }
  }
  if (made.errorCode === PROVISION_ABORTED) {
    return {
      status: 'error',
      errorCode: PROVISION_ABORTED,
      error: made.error ?? 'cancelled'
    }
  }
  // 59 WR-02/WR-03: a CrossOver create failure routes to the built-in engine.
  logWarning(
    `ensureGameBottle: CrossOver create failed for "${a.bottleName}" (${made.errorCode ?? 'unknown'}); using the built-in engine`,
    LogPrefix.Backend
  )
  return createWithPinned(a, d.currentPin(), d)
}

export interface PerGameBottleFlights {
  ensureGameBottle: (
    services: EngineServices,
    args: {
      key: EngineKey
      bottleName: string
      appName: string
      runner: Runner
      signal?: AbortSignal
    },
    deps?: Partial<PerGameBottleDeps>
  ) => Promise<EnsureGameBottleResult>
}

/**
 * One flight map per boot (66.4-05): concurrent callers sharing this instance share one creation
 * per bottle name; after it settles a new call starts a new one.
 */
export function createPerGameBottleFlights(): PerGameBottleFlights {
  const inFlight = new Map<string, Promise<EnsureGameBottleResult>>()

  /** Create the game's bottle once (idempotent; concurrent callers share one creation). */
  function ensureGameBottle(
    services: EngineServices,
    args: {
      key: EngineKey
      bottleName: string
      appName: string
      runner: Runner
      signal?: AbortSignal
    },
    deps: Partial<PerGameBottleDeps> = {}
  ): Promise<EnsureGameBottleResult> {
    const d: PerGameBottleDeps = {
      ensurePin: (a) =>
        ensurePinnedEngineReportingStatus({
          ...a,
          processRunner: services.runner,
          onlineMonitor: services.onlineMonitor,
          fallback: services.engineRuntime.fallback,
          sendFrontendMessage: services.notices.sendFrontendMessage,
          appRuntime: services.notices.appRuntime
        }),
      createCrossover: (...a) => createCrossoverBottle(services, ...a),
      createFallback: (bottleName, engine, signal) =>
        createFallbackBottleCancellable(
          { requestRustInvoke: services.engineRuntime.requestRustInvoke },
          {
            bottleName,
            engine,
            fallbackSettings: services.globalGameSettings(),
            signal
          }
        ),
      decide: (a) => decideCreationEngine(a, services),
      resolveBinDir: () => resolveCrossoverBinDirForEngine(services),
      ...defaultDeps(services),
      ...deps
    }
    if (sanitizeBottleName(args.bottleName) !== args.bottleName) {
      return Promise.resolve({
        status: 'error',
        error: `Invalid bottle name: "${args.bottleName}"`
      })
    }
    const existing = inFlight.get(args.bottleName)
    if (existing) return existing
    const p = ensureOnce(args, d).finally(() => {
      inFlight.delete(args.bottleName)
    })
    inFlight.set(args.bottleName, p)
    return p
  }

  return { ensureGameBottle }
}
