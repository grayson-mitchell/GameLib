/**
 * Phase 56 (56-11): DRM-mode launch setup (D-05, D-11, D-12, D-13).
 *
 * Called by `launchBridgeGame` (56-12) on every bridge launch after the
 * bottle-ready/exe-exists gate and before `placeShimForGame`.
 *
 * - The mode comes from `resolveBridgeMode` (D-12). Non-`.bind` and CEG exes
 *   return `not-applicable` before any work, so nothing is fetched for them
 *   (D-05).
 * - The fixed step order is: Mac Steam check, CrossOver allowlist, component,
 *   runner, Valve client, bottle staging. Cheap local checks come first, so a
 *   user without Mac Steam running or on an unlisted CrossOver downloads
 *   nothing. The component precedes the runner because the runner installs the
 *   component's builtins. The Valve client follows the runner, and staging
 *   comes last because it needs both.
 * - Every step returns a typed `DrmStepResult`. The first failure is returned
 *   unchanged, and nothing here falls back to the Phase 52 forwarder or to
 *   bottled Steam (D-13). This module writes no notice, anchor or trace line;
 *   56-12 is their single writer.
 * - Two-profile rule: the `pgrep` probe needs no user profile, so it runs under
 *   `createFakeHomeProfile()`. There is no real-profile arm here; the wine
 *   spawns happen in 56-09 and 56-12 under the DRM bottle settings.
 * - Sidecar exit contract: nothing runs at import; the probe child and its
 *   deadline are the process runner's (unref'd there); each long step is bounded by its own module's
 *   deadline and abort id.
 */
import type { StatusUpdateDeps } from 'backend/appRuntime'
import type { RunTool } from 'backend/engine/runTool'
import type { EngineRuntime } from 'backend/engine/engineRuntime'
import type { AppPaths } from 'backend/process/context'
import type { ProcessRunner } from 'backend/process/types'
import { dirname, isAbsolute, resolve } from 'path'
import type { GameSettings, GameStatus } from 'common/types'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import {
  drmStepError,
  resolveBridgeMode,
  type DrmStep,
  type DrmStepError,
  type DrmStepResult
} from './steamclientLayerMode'
import {
  detectAllowedCrossover,
  type CrossoverAllowed
} from './runnerCrossover'
import type { RunnerCloneFlights } from './runnerClone'
import type { BridgeRuntime } from '../bridgeRuntime'
import type { RunnerReady } from './runnerVerify'
import {
  createSteamclientLayerInstall,
  type SteamclientLayerReady
} from './steamclientLayerInstall'
import type { AbortRegistry } from 'backend/utils/aborthandler/aborthandler'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { createValveClient, type ValveClientReady } from './valveClient'
import { stageDrmBottle } from './stageDrmBottle'
import type {
  StageDrmBottleOk,
  StageDrmBottleInput,
  StageDrmBottleSlices
} from './stageDrmTypes'
import {
  DRM_LAUNCH_FORM,
  type DrmBridgeRunners,
  type DrmLaunchForm
} from '../../bridgeBottle'
import { buildDrmPaths } from './drmPaths'
import type { ManagerDeps } from 'backend/services/types'

/** Orchestrator stage names, used in logs; distinct from 56-04's DrmStep. */
export const DRM_SETUP_STEPS = [
  'steam-check',
  'crossover-allowlist',
  'component',
  'runner',
  'valve-client',
  'bottle-stage'
] as const

/**
 * The component download and the runner clone both report
 * `Compatibility runner` (the component is the runner's builtins); the Valve
 * download reports `Steam client files`. These are the only two contexts and
 * are constants with no game- or network-supplied text.
 */
export const DRM_PROGRESS_CONTEXT = {
  runner: 'Compatibility runner',
  valveClient: 'Steam client files'
} as const

export const MAC_STEAM_PROBE_TIMEOUT_MS = 5000
export const DRM_END_SESSION_TIMEOUT_MS = 15000

export type DrmLaunchSetupInput = {
  appId: string
  appFolder: string
  bottleName: string
  exePath: string
  installRoot: string
  installdir: string
  drmWrapper: 'steamstub' | 'none' | undefined
  cegMarkers?: readonly string[]
  /** The exe that carries .bind when it is not exePath (UE Shipping exe). */
  drmExe?: string
  signal?: AbortSignal
}

/**
 * `anchor` holds the `crossover=` and `client=` values 56-12 passes to
 * `formatBridgeDrmAnchor`. `bottle.helperWinPath` is what 56-12 launches with
 * the game exe, and `bottle.steamDirHost` is the first WINEDLLPATH entry.
 * 56-12 must launch with `bottleSettings`, or with
 * `getBridgeBottleSettings(appId)` (the same variant now), never with settings
 * computed before this call.
 */
export type DrmLaunchReady = {
  mode: 'steamclient-layer'
  appId: string
  crossover: CrossoverAllowed
  component: SteamclientLayerReady
  runner: RunnerReady
  valveClient: ValveClientReady
  bottle: Omit<StageDrmBottleOk, 'status'>
  bottleSettings: GameSettings
  launchForm: DrmLaunchForm
  anchor: { crossover: string; client: string }
  progressSent: boolean
}

export type DrmLaunchSetupResult =
  | DrmStepResult<DrmLaunchReady>
  | { status: 'not-applicable'; mode: 'tcp' }

type SteamclientLayerEnsure = ReturnType<
  typeof createSteamclientLayerInstall
>['ensureSteamclientLayerComponent']
type ValveClientEnsure = ReturnType<
  typeof createValveClient
>['ensureValveClient']

/** The instance's own steps, used where a caller supplies no override. */
type DrmInstanceSteps = {
  isMacSteamRunning: (timeoutMs?: number) => Promise<boolean>
  ensureComponent: SteamclientLayerEnsure
  ensureValveClient: ValveClientEnsure
}

/** Overridable steps; every member defaults to the instance's implementation. */
export type DrmSetupOverrides = StatusUpdateDeps & {
  /** The caller's tool runner (66.2-03); the clone and allowlist steps spawn through it. */
  runTool: RunTool
  /** The runner behind `runTool`; the CrossOver bin-dir lookup (mdfind) runs through it (66.2-07). */
  runner: Pick<ProcessRunner, 'run'>
  /** The boot's CrossOver locator and the path roots the stage reads (66.4-05). */
  engineRuntime: Pick<EngineRuntime, 'crossover'>
  paths: Pick<AppPaths, 'userHome'>
  /** The boot's runner clone flights (66.4-08). */
  bridgeRuntime: Pick<BridgeRuntime, 'runnerClone'>
  isMacSteamRunning?: () => Promise<boolean>
  detectCrossover?: typeof detectAllowedCrossover
  ensureComponent?: SteamclientLayerEnsure
  ensureRunner?: RunnerCloneFlights['ensureRunnerClone']
  ensureValveClient?: ValveClientEnsure
  stageBottle?: typeof stageDrmBottle
  buildBottleSettings?: (
    appId: string,
    runner: RunnerReady,
    form: DrmLaunchForm
  ) => GameSettings
  registerRunner?: (
    appId: string,
    runner: RunnerReady,
    form: DrmLaunchForm
  ) => boolean
  clearRunner?: (appId: string) => void
  getRunner?: (appId: string) => { runner: { runnerDir: string } } | undefined
  endBottleSession?: (
    appId: string,
    bottleName: string,
    timeoutMs: number
  ) => Promise<boolean>
  sendStatus?: (payload: GameStatus) => void
  macSteamProbeTimeoutMs?: number
}

/** The overrides plus the slices the stage and session end need (66.1 R3). */
export type DrmLaunchSetupDeps = DrmSetupOverrides &
  StageDrmBottleSlices &
  Pick<
    ManagerDeps,
    'config' | 'steamBottle' | 'steamUser' | 'steamLaunchRuntime'
  >

const NUMERIC_APP_ID = /^[0-9]{1,10}$/

const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : String(err)

/**
 * `pgrep -x steam_osx` on the process runner: exit 0 running, exit 1 not
 * running, anything else (including a timeout or a spawn failure) is an error.
 * Isolated half of the two-profile rule: the env is
 * `createFakeHomeProfile().childEnv()`, never a hand-rolled literal. stdin is ''
 * so the probe never waits on an open pipe.
 */
export function createIsMacSteamRunning(deps: {
  runner: Pick<ProcessRunner, 'run'>
}) {
  return async function isMacSteamRunning(
    timeoutMs: number = MAC_STEAM_PROBE_TIMEOUT_MS
  ): Promise<boolean> {
    const profile = createFakeHomeProfile({
      prefix: 'gamelib-drm-steam-probe-'
    })
    try {
      const result = await deps.runner.run(
        '/usr/bin/pgrep',
        ['-x', 'steam_osx'],
        {
          env: profile.childEnv(),
          replaceEnv: true,
          stdin: '',
          timeoutMs
        }
      )
      if (result.timedOut)
        throw new Error(`pgrep timed out after ${timeoutMs} ms`)
      if (result.code === 0) return true
      if (result.code === 1) return false
      throw new Error(`pgrep exited ${result.code}`)
    } finally {
      profile.dispose()
    }
  }
}

type DrmDownloads = {
  status: 'ok'
  crossover: CrossoverAllowed
  component: SteamclientLayerReady
  runner: RunnerReady
  valveClient: ValveClientReady
}

/** The step's own error object, unchanged, with the stage it stopped at. */
type DrmDownloadsError = {
  status: 'error'
  stage: (typeof DRM_SETUP_STEPS)[number]
  error: DrmStepError
}

/**
 * Steps 2-5 (CrossOver allowlist, component, runner, Valve client), shared by
 * the launch setup and the install-time prefetch. Each `ensure*` is cached, so
 * a second run is a no-op that sends no progress.
 */
async function ensureDrmDownloads(
  appFolder: string,
  deps: DrmSetupOverrides,
  progress: (context: string) => void,
  steps: DrmInstanceSteps
): Promise<DrmDownloads | DrmDownloadsError> {
  const run = async <T extends { status: string }>(
    step: DrmStep,
    fn: () => Promise<T>
  ): Promise<T | ReturnType<typeof drmStepError>> => {
    try {
      return await fn()
    } catch (err) {
      return drmStepError(step, err)
    }
  }

  // 2. CrossOver allowlist
  const detect = deps.detectCrossover ?? detectAllowedCrossover
  const crossover = await run('unsupported-crossover', () =>
    detect(
      { appFolder },
      {
        runTool: deps.runTool,
        runner: deps.runner,
        engineRuntime: deps.engineRuntime
      }
    )
  )
  if (crossover.status === 'error')
    return { status: 'error', stage: 'crossover-allowlist', error: crossover }

  // 3. Component
  const ensureComponent = deps.ensureComponent ?? steps.ensureComponent
  const component = await run('component-missing', () =>
    ensureComponent(
      { appFolder, crossoverBuild: crossover.crossoverBuild },
      { onFetchStart: () => progress(DRM_PROGRESS_CONTEXT.runner) }
    )
  )
  if (component.status === 'error')
    return { status: 'error', stage: 'component', error: component }

  // 4. Runner
  const ensureRunner =
    deps.ensureRunner ?? deps.bridgeRuntime.runnerClone.ensureRunnerClone
  const runner = await run('runner-clone', () =>
    ensureRunner(
      { appFolder, crossover, component },
      {
        runTool: deps.runTool,
        onCloneStart: () => progress(DRM_PROGRESS_CONTEXT.runner)
      }
    )
  )
  if (runner.status === 'error')
    return { status: 'error', stage: 'runner', error: runner }

  // 5. Valve client
  const ensureValve = deps.ensureValveClient ?? steps.ensureValveClient
  const valveClient = await run('valve-fetch', () =>
    ensureValve(
      { appFolder },
      { onFetchStart: () => progress(DRM_PROGRESS_CONTEXT.valveClient) }
    )
  )
  if (valveClient.status === 'error')
    return { status: 'error', stage: 'valve-client', error: valveClient }

  return { status: 'ok', crossover, component, runner, valveClient }
}

async function runSetup(
  input: DrmLaunchSetupInput,
  deps: DrmLaunchSetupDeps,
  steps: DrmInstanceSteps
): Promise<DrmLaunchSetupResult> {
  const { appId, appFolder } = input
  const bottleLifecycle = await import('../../bridgeBottleLifecycle')
  const bridgeBottle = await import('../../bridgeBottle')
  // Bound at call time: a caller that overrides all three never reads the runtime.
  const clearRunner =
    deps.clearRunner ??
    ((id: string) =>
      deps.steamLaunchRuntime.drmRunners.clearDrmBridgeRunner(id))
  const getRunner =
    deps.getRunner ??
    ((id: string) => deps.steamLaunchRuntime.drmRunners.getDrmBridgeRunner(id))
  const registerRunner =
    deps.registerRunner ??
    ((...a: Parameters<DrmBridgeRunners['setDrmBridgeRunner']>) =>
      deps.steamLaunchRuntime.drmRunners.setDrmBridgeRunner(...a))
  const buildBottleSettings =
    deps.buildBottleSettings ??
    ((appId: string, runner: RunnerReady, form: DrmLaunchForm) =>
      bridgeBottle.getDrmBridgeBottleSettings(deps, appId, runner, form))
  const endBottleSession =
    deps.endBottleSession ??
    ((appId: string, bottleName: string, timeoutMs: number) =>
      bottleLifecycle.endPerGameBridgeBottleSession(
        deps,
        appId,
        bottleName,
        timeoutMs
      ))
  const { sendGameStatusUpdate } = await import('backend/utils')
  const sendStatus =
    deps.sendStatus ??
    ((payload: GameStatus) => sendGameStatusUpdate(deps, payload))

  let lastContext: string | undefined
  let progressSent = false
  const progress = (context: string) => {
    if (context === lastContext) return
    lastContext = context
    progressSent = true
    try {
      sendStatus({
        appName: appId,
        runner: 'steam',
        status: 'drm-setup',
        context
      })
    } catch (err) {
      logWarning(
        `drm setup: appId ${appId} progress send failed: ${messageOf(err)}`,
        LogPrefix.Steam
      )
    }
  }

  const fail = (
    stage: (typeof DRM_SETUP_STEPS)[number],
    result: Extract<DrmStepResult, { status: 'error' }>
  ) => {
    logWarning(
      `drm setup: appId ${appId} stopped at ${stage} (${result.step}): ${result.cause}`,
      LogPrefix.Steam
    )
    if (
      result.step === 'unsupported-crossover' ||
      result.step === 'runner-clone' ||
      result.step === 'runner-patch'
    ) {
      clearRunner(appId)
    }
    // 56-27 (IN-01): the Steam launch never reaches launcher.ts's 'done', so a
    // failure after progress must end the card's 'drm-setup' status itself.
    if (progressSent) {
      try {
        sendStatus({ appName: appId, runner: 'steam', status: 'done' })
        logInfo(
          `drm setup: appId ${appId} sent terminal status done after ${stage}`,
          LogPrefix.Steam
        )
      } catch (err) {
        logWarning(
          `drm setup: appId ${appId} terminal status send failed: ${messageOf(err)}`,
          LogPrefix.Steam
        )
      }
    }
    return result
  }

  const run = async <T extends { status: string }>(
    step: DrmStep,
    fn: () => Promise<T>
  ): Promise<T | ReturnType<typeof drmStepError>> => {
    try {
      return await fn()
    } catch (err) {
      return drmStepError(step, err)
    }
  }

  const body = async (): Promise<DrmLaunchSetupResult> => {
    // 1. Mac Steam
    let running: boolean | ReturnType<typeof drmStepError>
    try {
      running = await (deps.isMacSteamRunning
        ? deps.isMacSteamRunning()
        : steps.isMacSteamRunning(deps.macSteamProbeTimeoutMs))
    } catch (err) {
      running = drmStepError(
        'steam-not-running',
        'could not check Mac Steam: ' + messageOf(err)
      )
    }
    if (running !== true) {
      return fail(
        'steam-check',
        running === false
          ? drmStepError('steam-not-running', 'Mac Steam is not running')
          : running
      )
    }

    // 2-5. CrossOver allowlist, component, runner, Valve client
    const downloads = await ensureDrmDownloads(appFolder, deps, progress, steps)
    if (downloads.status === 'error') {
      return fail(downloads.stage, downloads.error)
    }
    const { crossover, component, runner, valveClient } = downloads

    // 6. Bottle staging
    let bottleSettings: GameSettings
    try {
      bottleSettings = buildBottleSettings(appId, runner, DRM_LAUNCH_FORM)
    } catch (err) {
      return fail('bottle-stage', drmStepError('bottle-stage', err))
    }
    try {
      if (getRunner(appId)?.runner.runnerDir !== runner.runnerDir) {
        // 56-01-SUMMARY.md, consequences for 56-11: "56-11 should stop a still-running
        // stock wineserver for the appId before the first clone launch (D-11)".
        // Required by 56-01; also cheap and bounded. It runs BEFORE registration
        // so the stop uses the previous runner's wineserver.
        await endBottleSession(
          appId,
          input.bottleName,
          DRM_END_SESSION_TIMEOUT_MS
        )
        if (!registerRunner(appId, runner, DRM_LAUNCH_FORM)) {
          return fail(
            'bottle-stage',
            drmStepError('bottle-stage', 'DRM runner registration refused')
          )
        }
      }
    } catch (err) {
      return fail('bottle-stage', drmStepError('bottle-stage', err))
    }
    const stage = deps.stageBottle ?? stageDrmBottle
    const stageLogDir = buildDrmPaths(appFolder)?.traceRoot
    const stageInput: StageDrmBottleInput = {
      appId,
      bottleName: input.bottleName,
      bottleSettings,
      exePath: input.exePath,
      installRoot: input.installRoot,
      installdir: input.installdir,
      valveClientDir: valveClient.clientDir,
      componentDir: component.componentDir,
      ...(input.drmExe && resolve(input.drmExe) !== resolve(input.exePath)
        ? { extraExeDirs: [dirname(input.drmExe)] }
        : {}),
      ...(stageLogDir ? { stageLogDir } : {}),
      signal: input.signal
    }
    const staged = await run('bottle-stage', () =>
      stage(stageInput, {
        commandRunner: deps.commandRunner,
        spawnAsync: deps.spawnAsync,
        runner: deps.runner,
        config: deps.config,
        steamBottle: deps.steamBottle,
        steamUser: deps.steamUser,
        paths: deps.paths,
        engineRuntime: deps.engineRuntime,
        steamLaunchRuntime: deps.steamLaunchRuntime,
        steamInstallRuntime: deps.steamInstallRuntime
      })
    )
    if (staged.status === 'error') return fail('bottle-stage', staged)
    const { status: _status, ...stagedBottle } = staged

    logInfo(
      `drm setup: appId ${appId} ready crossover=${crossover.crossoverBuild} client=${valveClient.manifestVersion} component=${component.source} runner=${runner.source} valve=${valveClient.source}`,
      LogPrefix.Steam
    )
    return {
      status: 'ok',
      mode: 'steamclient-layer',
      appId,
      crossover,
      component,
      runner,
      valveClient,
      bottle: stagedBottle,
      bottleSettings,
      launchForm: DRM_LAUNCH_FORM,
      anchor: {
        crossover: crossover.crossoverBuild,
        client: valveClient.manifestVersion
      },
      progressSent
    }
  }
  try {
    return await body()
  } catch (err) {
    return fail('bottle-stage', drmStepError('bottle-stage', err))
  }
}

/** Never rejects. */
async function drmLaunchSetupOn(
  input: DrmLaunchSetupInput,
  deps: DrmLaunchSetupDeps,
  steps: DrmInstanceSteps,
  inFlight: Map<string, Promise<DrmLaunchSetupResult>>
): Promise<DrmLaunchSetupResult> {
  try {
    // D-12 mode gate
    if (
      resolveBridgeMode(input.drmWrapper, input.cegMarkers) !==
      'steamclient-layer'
    ) {
      if (NUMERIC_APP_ID.test(String(input.appId))) {
        // A title whose exe lost `.bind` must not keep the clone.
        const clear =
          deps.clearRunner ??
          ((id: string) =>
            deps.steamLaunchRuntime.drmRunners.clearDrmBridgeRunner(id))
        clear(input.appId)
      }
      return { status: 'not-applicable', mode: 'tcp' }
    }

    const bad = !NUMERIC_APP_ID.test(String(input.appId))
      ? 'appId'
      : !input.bottleName
        ? 'bottleName'
        : !isAbsolute(String(input.appFolder))
          ? 'appFolder'
          : !isAbsolute(String(input.exePath))
            ? 'exePath'
            : undefined
    if (bad) {
      return drmStepError('bottle-stage', `invalid launch input: ${bad}`)
    }

    const existing = inFlight.get(input.appId)
    if (existing) return await existing
    const promise = runSetup(input, deps, steps)
      .catch((err) => drmStepError('bottle-stage', err))
      .finally(() => {
        inFlight.delete(input.appId)
      })
    inFlight.set(input.appId, promise)
    return await promise
  } catch (err) {
    return drmStepError('bottle-stage', err)
  }
}

export type DrmPrefetchInput = {
  appId: string
  appFolder: string
  drmWrapper: 'steamstub' | 'none' | undefined
  cegMarkers?: readonly string[]
}

export type DrmPrefetchResult =
  | { status: 'ok' }
  | { status: 'not-applicable' }
  | DrmStepError

/**
 * Quick 261029-e2t: steps 2-5 at the end of a bridge install, so the first
 * Play only stages the bottle. It skips the Mac Steam check (a download needs
 * no Steam), registers no runner and touches no bottle; the launch setup
 * still runs every step, and the cached ones are no-ops. Progress goes out as
 * the same 'drm-setup' status. Never rejects.
 */
async function prefetchDrmDownloadsOn(
  input: DrmPrefetchInput,
  deps: DrmSetupOverrides,
  steps: DrmInstanceSteps
): Promise<DrmPrefetchResult> {
  try {
    if (
      resolveBridgeMode(input.drmWrapper, input.cegMarkers) !==
      'steamclient-layer'
    ) {
      return { status: 'not-applicable' }
    }
    const { appId, appFolder } = input
    if (!NUMERIC_APP_ID.test(String(appId)) || !isAbsolute(String(appFolder))) {
      return drmStepError('component-missing', 'invalid prefetch input')
    }
    const { sendGameStatusUpdate } = await import('backend/utils')
    const sendStatus =
      deps.sendStatus ??
      ((payload: GameStatus) => sendGameStatusUpdate(deps, payload))
    let lastContext: string | undefined
    const progress = (context: string) => {
      if (context === lastContext) return
      lastContext = context
      try {
        sendStatus({
          appName: appId,
          runner: 'steam',
          status: 'drm-setup',
          context
        })
      } catch (err) {
        logWarning(
          `drm prefetch: appId ${appId} progress send failed: ${messageOf(err)}`,
          LogPrefix.Steam
        )
      }
    }
    const downloads = await ensureDrmDownloads(appFolder, deps, progress, steps)
    if (downloads.status === 'error') {
      const { stage, error } = downloads
      logWarning(
        `drm prefetch: appId ${appId} stopped at ${stage} (${error.step}): ${error.cause}; Play will retry`,
        LogPrefix.Steam
      )
      return error
    }
    logInfo(
      `drm prefetch: appId ${appId} ready crossover=${downloads.crossover.crossoverBuild} client=${downloads.valveClient.manifestVersion} component=${downloads.component.source} runner=${downloads.runner.source} valve=${downloads.valveClient.source}`,
      LogPrefix.Steam
    )
    return { status: 'ok' }
  } catch (err) {
    return drmStepError('component-missing', err)
  }
}

/**
 * The Steam DRM instance (66.2 D-05/D-15): one per process, built inside
 * createSteamProcesses. The three single-flight Maps (setup, component, Valve
 * client) are closure state of it, so a second instance shares no pending work.
 */
export function createSteamDrm(
  deps: RustInvokeDeps & {
    runner: Pick<ProcessRunner, 'run'>
    aborts: Pick<AbortRegistry, 'create' | 'delete'>
  }
) {
  const inFlight = new Map<string, Promise<DrmLaunchSetupResult>>()
  const steps: DrmInstanceSteps = {
    isMacSteamRunning: createIsMacSteamRunning(deps),
    ensureComponent:
      createSteamclientLayerInstall(deps).ensureSteamclientLayerComponent,
    ensureValveClient: createValveClient(deps).ensureValveClient
  }
  return {
    isMacSteamRunning: steps.isMacSteamRunning,
    ensureSteamclientLayerComponent: steps.ensureComponent,
    ensureValveClient: steps.ensureValveClient,
    drmLaunchSetup: (
      input: DrmLaunchSetupInput,
      setupDeps: DrmLaunchSetupDeps
    ) => drmLaunchSetupOn(input, setupDeps, steps, inFlight),
    prefetchDrmDownloads: (
      input: DrmPrefetchInput,
      prefetchDeps: DrmSetupOverrides
    ) => prefetchDrmDownloadsOn(input, prefetchDeps, steps)
  }
}

export type SteamDrm = ReturnType<typeof createSteamDrm>
