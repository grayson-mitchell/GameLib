/**
 * Phase 61 (D-04..D-07, D-13, D-16): the engine step of every non-Steam launch on macOS,
 * generalised from Steam's `selectLaunchEngine` (steam/gameLaunch.ts).
 *
 * One call per launch runs Phase 59's sequence: offline refusal, the pre-flight with the G29
 * two-probe rule, fallback to the pinned engine when CrossOver is missing, expired or broken
 * (Automatic only), first-need download with progress, registration, the DXVK switch, and the
 * fallback toast. A forced CrossOver override on a broken CrossOver refuses with a dialog.
 *
 * The chosen engine reaches the store launch only through `getLaunchSettings` (launchSettings.ts);
 * nothing here writes the game's config (59 D-07, D-08).
 *
 * Deliberately NOT here: bridge failure marking and any reroute to bottled Steam (memory: bottled
 * Steam is a narrow fallback). A fired deadline stops the bottle and says so; it never retries.
 *
 * Sidecar exit contract: module state is empty maps; the only timers are the deadline's and the
 * watcher's, both unref'd and bounded; nothing runs at import.
 */
import { t } from 'i18next'
import type { GameSettings, Runner } from 'common/types'
import type { Game } from 'common/types/game_manager'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type LogWriter from 'backend/logger/log_writer'
import { sendGameStatusUpdate } from 'backend/utils'
import { isMac } from 'backend/constants/environment'
import { getBottleDir, isBottleProvisioned } from './bottlePrimitives'
import { markGameRunning, markGameStopped } from './bottleLedger'
import {
  LAUNCH_DEADLINE_MS,
  armLaunchDeadline,
  bindDeadlineToMonitor,
  cancelLaunchDeadline
} from './launchDeadline'
import { watchForGameProcess } from './gameProcessWatch'
import {
  clearEngineSelection,
  getEngineSelection,
  setEngineSelection
} from './engineRegistry'
import {
  decideLaunchEngine,
  isCrossoverMissing,
  killCrossoverWineserverWith
} from './engineDecision'
import type {
  EngineDecisionDeps,
  KillDeps,
  ReleasesDeps,
  RunnerDeps,
  LaunchDecision
} from './engineDecision'
import { readEngineForGame } from './engineConfig'
import type { EffectiveEngine } from './engineConfig'
import {
  notifyEngineFallback,
  showEngineDialog,
  showEngineNotice
} from './engineDialogs'
import {
  publishLaunchDeadlineNotice,
  recordLaunchDecision
} from './engineState'
import {
  prepareBottleForEngine,
  readBottleEngineMarkerKind,
  restoreNeedsAbsentPin,
  switchServicesFrom
} from './engineSwitch'
import type { EngineSwitchDeps } from './engineSwitch'
import { engineLogLabel, isNonCrossover } from './engineTypes'
import type { EngineSelection } from './engineTypes'
import { ENGINE_PINS } from './enginePins'
import { isPinnedEngineInstalled } from './fallbackEngine'
import { engineKeyIfEligible } from './engineEligibility'
import type { EngineKey } from './gameKey'
import { resolveGamePrefix } from './gamePrefix'
import type { GamePrefix } from './gamePrefix'
import {
  buildCrossoverGameSettings,
  clearLaunchOverlayContext,
  getLaunchOverlayContext,
  setLaunchOverlayContext
} from './launchSettings'
import { offlineLaunchCertainlyBlocked } from './offlineRefusal'
import { ensureGameBottle, perGameBottleName } from './perGameBottle'
import type { EngineServices } from './engineServices'
import { ensurePinnedEngineReportingStatus } from './pinnedEngineProgress'

export type LaunchEngineStep =
  | { kind: 'skip' }
  | { kind: 'legacy'; key: EngineKey }
  | {
      kind: 'use'
      key: EngineKey
      selection: EngineSelection
      prefix: GamePrefix
    }
  | { kind: 'refused'; key: EngineKey }

export interface LaunchEngineDeps {
  isMac(): boolean
  readEffective(id: { runner: string; appName: string }): EffectiveEngine
  isProvisioned(bottleName: string): boolean
  ensureGameBottle: (
    args: Parameters<typeof ensureGameBottle>[1]
  ) => ReturnType<typeof ensureGameBottle>
  decisionDeps(): Partial<EngineDecisionDeps> &
    KillDeps &
    ReleasesDeps &
    RunnerDeps
  isCrossoverMissing(): Promise<boolean>
  currentPinInstalled(): boolean
  ensurePinned: typeof ensurePinnedEngineReportingStatus
  switchDeps(): Partial<EngineSwitchDeps> &
    Pick<
      EngineSwitchDeps,
      'killWith' | 'installRemove' | 'resolveCrossoverBinDir'
    >
  prepare: typeof prepareBottleForEngine
  sendStatus(update: {
    appName: string
    runner: Runner
    status: 'engine-download'
    context: string
  }): void
  recordDecision(
    id: { runner: string; appName: string },
    decision: LaunchDecision,
    bottleName: string,
    prefix: GamePrefix,
    effective: EffectiveEngine
  ): void
  showDialog: typeof showEngineDialog
  notifyFallback: typeof notifyEngineFallback
}

const defaultDeps: Omit<
  LaunchEngineDeps,
  | 'ensureGameBottle'
  | 'decisionDeps'
  | 'switchDeps'
  | 'readEffective'
  | 'isCrossoverMissing'
> = {
  isMac: () => isMac,
  isProvisioned: isBottleProvisioned,
  currentPinInstalled: () => isPinnedEngineInstalled(ENGINE_PINS.current),
  ensurePinned: ensurePinnedEngineReportingStatus,
  prepare: prepareBottleForEngine,
  sendStatus: (update) => sendGameStatusUpdate(update),
  recordDecision(id, decision, bottleName, prefix, effective) {
    recordLaunchDecision(id, decision, bottleName, {
      bottleFor: () => (bottleName === '' ? null : bottleName),
      stateWithoutBottle: true,
      overrideEligible: () => true,
      overlayEligible: false,
      effective: () => effective,
      prefixKind: prefix.kind === 'bottle' ? 'bottle' : 'plain',
      perGameBottleName: perGameBottleName(id.runner, id.appName)
    })
  },
  showDialog: showEngineDialog,
  notifyFallback: notifyEngineFallback
}

/** The bottle each key was marked running in, so endEngineLaunch can release it. */
const ledgerBottles = new Map<EngineKey, string>()

function writeLog(
  key: EngineKey,
  line: string,
  logWriter: LogWriter | undefined
): void {
  logInfo(`Engine: ${key} ${line}`, LogPrefix.Backend)
  void logWriter?.logInfo(line)
}

/**
 * Select and prepare the engine for one launch. `skip` means the engine layer does not apply
 * (native, browser, non-macOS, or a bottle-runtime store) and the launch runs exactly as before.
 */
export async function selectEngineForLaunch(
  services: EngineServices,
  game: Game,
  opts: {
    offline: boolean
    logWriter?: LogWriter
    purpose?: 'launch' | 'setup'
  },
  overrides: Partial<LaunchEngineDeps> = {}
): Promise<LaunchEngineStep> {
  const d: LaunchEngineDeps = {
    ...defaultDeps,
    ensureGameBottle: (a) => ensureGameBottle(services, a),
    switchDeps: () => switchServicesFrom(services),
    isCrossoverMissing: () => isCrossoverMissing({ runner: services.runner }),
    readEffective: (id) =>
      readEngineForGame(id, {
        wineManagerReleases: services.wineManagerReleases
      }),
    decisionDeps: () => ({
      killCrossoverWineserver: killCrossoverWineserverWith(services),
      wineManagerReleases: services.wineManagerReleases,
      runner: services.runner
    }),
    ...overrides
  }
  const key = engineKeyIfEligible(game, d.isMac())
  if (key === null) return { kind: 'skip' }
  const { runner, app_name: appName, title } = game.getGameInfo()
  const id = { runner, appName }

  const effective = d.readEffective(id)
  if (effective.kind === 'legacy') {
    // D-07: the engine step is skipped entirely; the launch is exactly as today.
    writeLog(
      key,
      `engine=legacy name="${effective.label}" reason=override`,
      opts.logWriter
    )
    return { kind: 'legacy', key }
  }

  const settings: GameSettings = await game.getSettings()
  const prefix = resolveGamePrefix({
    runner,
    appName,
    settings,
    effective
  })
  if (prefix.kind === 'legacy') return { kind: 'legacy', key }

  const refuse = (): LaunchEngineStep => {
    clearEngineSelection(key)
    clearLaunchOverlayContext(key)
    return { kind: 'refused', key }
  }
  const dialog = (body: string, ackId: string) =>
    d.showDialog({ key, title, body, ackId })

  if (prefix.kind === 'invalid') {
    logWarning(
      `Engine: ${key} has no valid prefix; not launching`,
      LogPrefix.Backend
    )
    dialog(
      t(
        'gamelib:engine.bottleCreateFailed',
        "GameLib couldn't set up this game's bottle ({{reason}}), so it did not start. Check the launch log (Settings > Logs).",
        { reason: 'invalid game identity' }
      ),
      'engine-invalid-prefix'
    )
    return refuse()
  }

  const bottleName = prefix.kind === 'bottle' ? prefix.bottleName : ''

  // D-02: the game's own bottle is created on first need; a legacy shared bottle is never created.
  if (
    prefix.kind === 'bottle' &&
    prefix.origin !== 'legacy-crossover' &&
    !d.isProvisioned(bottleName)
  ) {
    const made = await d.ensureGameBottle({
      key,
      bottleName,
      appName,
      runner: runner as Runner
    })
    if (made.status === 'error') {
      logWarning(
        `Engine: ${key} bottle "${bottleName}" could not be created: ${made.error}`,
        LogPrefix.Backend
      )
      dialog(
        t(
          'gamelib:engine.bottleCreateFailed',
          "GameLib couldn't set up this game's bottle ({{reason}}), so it did not start. Check the launch log (Settings > Logs).",
          { reason: made.error }
        ),
        'engine-bottle-create-failed'
      )
      return refuse()
    }
  }

  // G22/G25: refuse now when no branch of an offline launch can start.
  if (
    prefix.kind === 'bottle' &&
    opts.offline &&
    (effective.id === 'automatic' || effective.id === 'crossover')
  ) {
    const refusal = offlineLaunchCertainlyBlocked({
      offline: true,
      override: effective.id,
      crossoverMissing: await d.isCrossoverMissing(),
      markerKind: readBottleEngineMarkerKind(bottleName),
      currentPinInstalled: d.currentPinInstalled(),
      restoreNeedsAbsentPin: restoreNeedsAbsentPin(bottleName)
    })
    if (refusal.blocked) {
      logWarning(
        `Engine: ${key} launch blocked before pre-flight while offline (${refusal.arm})`,
        LogPrefix.Backend
      )
      dialog(
        t(
          'gamelib:steam.engine.downloadFailed',
          "GameLib couldn't download its built-in engine ({{reason}}). Check your connection and try again.",
          { reason: 'offline' }
        ),
        'engine-download-failed'
      )
      return refuse()
    }
  }

  const decision = await decideLaunchEngine(
    { key, bottleName },
    { ...d.decisionDeps(), readOverride: () => effective.id }
  )
  if (decision.kind === 'unavailable') {
    logWarning(
      `Engine: ${key} engine override ${decision.override} is unavailable: ${decision.detail}`,
      LogPrefix.Backend
    )
    dialog(
      t(
        'gamelib:steam.engine.overrideUnavailable',
        'The engine chosen for this game in Wine settings is not available ({{detail}}). Choose Automatic or install it.',
        { detail: decision.detail }
      ),
      'override-unavailable'
    )
    return refuse()
  }

  if (decision.needsDownload && decision.pin) {
    const got = await d.ensurePinned({
      pin: decision.pin,
      appName,
      runner: runner as Runner
    })
    if (!got.ok) {
      if (got.aborted) return refuse()
      dialog(
        t(
          'gamelib:steam.engine.downloadFailed',
          "GameLib couldn't download its built-in engine ({{reason}}). Check your connection and try again.",
          { reason: got.error }
        ),
        'engine-download-failed'
      )
      return refuse()
    }
  }

  const sel = decision.selection
  if (!setEngineSelection(key, sel)) {
    logWarning(
      `Engine: ${key} engine selection was rejected (${engineLogLabel(sel)}); not launching`,
      LogPrefix.Backend
    )
    dialog(
      t(
        'gamelib:steam.engine.selectionRejected',
        "GameLib couldn't set up {{engine}} for this game, so it did not start. Check the launch log (Settings > Logs).",
        { engine: sel.kind === 'crossover' ? 'CrossOver' : sel.label }
      ),
      'engine-selection-rejected'
    )
    return refuse()
  }

  const cxBinDir = sel.kind === 'crossover' ? sel.binDir : ''
  const cxBuild = sel.kind === 'crossover' ? sel.crossoverBuild : null
  setLaunchOverlayContext(
    key,
    prefix.kind === 'bottle'
      ? {
          prefix: { kind: 'bottle', bottleName },
          binDir: cxBinDir || undefined
        }
      : { prefix: { kind: 'plain' } }
  )

  if (prefix.kind === 'bottle') {
    const prep = await d.prepare({
      key,
      bottleName,
      next: sel,
      // 59-UAT G10: an override to CrossOver on an expired bottle must not run the DXVK restore
      // through CrossOver.
      crossoverHealthy: decision.preflight?.kind === 'healthy',
      deps: {
        ...d.switchDeps(),
        crossoverSettings: () =>
          buildCrossoverGameSettings(
            settings,
            bottleName,
            cxBinDir ||
              (decision.preflight && 'binDir' in decision.preflight
                ? (decision.preflight.binDir ?? '')
                : ''),
            cxBuild
          )
      },
      // IN-05 (59-22): a real engine switch is "setting up", not a stale "Downloading (100%)".
      onSwitching: () =>
        d.sendStatus({
          appName,
          runner: runner as Runner,
          status: 'engine-download',
          context: 'setting-up'
        })
    })
    if (!prep.ok) {
      if (prep.reason === 'dxvk-failed' && sel.kind === 'crossover') {
        // CR-03: never start on CrossOver over DXVK-macOS DLLs; retried on the next launch.
        logWarning(
          `Engine: ${key} could not switch back to CrossOver (${prep.detail}); not launching`,
          LogPrefix.Backend
        )
        dialog(
          t(
            'gamelib:steam.engine.restoreFailed',
            "GameLib couldn't finish switching {{title}} back to CrossOver, so it did not start. Check your connection and try again; GameLib retries the switch on the next launch.",
            { title }
          ),
          'engine-restore-failed'
        )
        return refuse()
      }
      if (prep.reason === 'dxvk-failed') {
        // The built-in engine is best-effort: missing DXVK degrades Direct3D, it does not block.
        logWarning(
          `Engine: ${key} DXVK setup failed (${prep.detail}); continuing`,
          LogPrefix.Backend
        )
      } else if (
        prep.reason === 'bottle-busy' ||
        prep.reason === 'game-running' ||
        prep.reason === 'shared-bottle'
      ) {
        // D-16: refuse, kill nothing, and say why.
        logWarning(
          `Engine: ${key} cannot switch engine (${prep.reason}: ${prep.detail}); not launching`,
          LogPrefix.Backend
        )
        dialog(
          t(
            'gamelib:engine.bottleBusy',
            "Another game is running in this game's bottle, so GameLib can't switch its engine now. Quit the other game, then try again."
          ),
          'engine-bottle-busy'
        )
        return refuse()
      } else {
        logWarning(
          `Engine: ${key} cannot switch engine (${prep.reason}: ${prep.detail}); not launching`,
          LogPrefix.Backend
        )
        return refuse()
      }
    }
    if (markGameRunning(bottleName, key)) ledgerBottles.set(key, bottleName)
  }

  d.recordDecision(id, decision, bottleName, prefix, effective)
  // D-13: engine and version on every launch, written from the decision so they cannot drift.
  for (const line of decision.logLines) writeLog(key, line, opts.logWriter)

  if (
    opts.purpose !== 'setup' &&
    isNonCrossover(sel) &&
    decision.override === 'automatic' &&
    sel.reason !== 'override' &&
    sel.reason !== 'cx-inconclusive'
  ) {
    d.notifyFallback(title, sel.reason)
  }

  return { kind: 'use', key, selection: sel, prefix }
}

/** The first-match watcher of each armed launch, so endEngineLaunch can stop it. */
const deadlineWatchers = new Map<EngineKey, { stop(): void }>()

export interface DeadlineDeps {
  watch: typeof watchForGameProcess
  showNotice: typeof showEngineNotice
  publishNotice: typeof publishLaunchDeadlineNotice
}

const defaultDeadlineDeps: DeadlineDeps = {
  watch: watchForGameProcess,
  showNotice: showEngineNotice,
  publishNotice: publishLaunchDeadlineNotice
}

function stopDeadlineWatcher(key: EngineKey): void {
  deadlineWatchers.get(key)?.stop()
  deadlineWatchers.delete(key)
}

/**
 * Plan 61-21 (D-18, D-16; CR-02, CR-03): the launch deadline fired with no game process seen.
 * This is a notice, never a kill: a missing `ps` match is not evidence the game is not running
 * (bare-basename and launcher-stub shapes are unmatchable), and a bottle can be shared with
 * another running game. So nothing is stopped: no wineserver -k, no game.stop, and the engine
 * registry, overlay context and ledger entry stay until the launcher exits (endEngineLaunch).
 * Plan 61-27 (WR-02): the notice never raises the main window or opens a modal, because the game
 * is very likely running and fullscreen. It is a system notification plus an in-app toast.
 */
function onEngineLaunchDeadline(
  game: Game,
  key: EngineKey,
  armedSelection: EngineSelection | undefined,
  d: DeadlineDeps
): Promise<void> {
  // G5: the registry entry can be gone by now, so fall back to the selection seen at arm time.
  const sel = getEngineSelection(key) ?? armedSelection
  logWarning(
    `Engine: ${key} launch deadline fired (${sel ? engineLogLabel(sel) : 'engine unknown'}) with no game process seen; not stopping anything`,
    LogPrefix.Backend
  )
  stopDeadlineWatcher(key)
  const info = game.getGameInfo()
  const title = info.title
  const seconds = LAUNCH_DEADLINE_MS / 1000
  d.showNotice({
    key,
    title: t(
      'gamelib:steam.engine.notDetected.title',
      "Couldn't confirm the game started"
    ),
    body: t(
      'gamelib:steam.engine.notDetected.body',
      "GameLib couldn't confirm that {{title}} started within {{seconds}} seconds. It has not been stopped. If it is stuck, stop it from its game page and check the launch log (Settings > Logs).",
      { title, seconds }
    ),
    ackId: 'launch-deadline-unconfirmed'
  })
  const pushed = d.publishNotice(
    { runner: info.runner, appName: info.app_name },
    { title, seconds }
  )
  logInfo(
    `Engine: ${key} launch deadline notice surface=in-app pushed=${pushed} raise=false`,
    LogPrefix.Backend
  )
  return Promise.resolve()
}

/**
 * Plan 61-16 (D-18): arm the launch deadline for a bottle-backed launch, after prerequisite
 * installers (called at the end of prepareWineLaunch). Plain-prefix launches are not armed.
 * The deadline is bound to the first-match watcher; with no derivable signal (a watcher of
 * `null`) or a watcher that gives up (WR-01) it is stood down. When it does fire it only shows
 * a no-kill notice (CR-02/CR-03).
 */
export function armEngineLaunchDeadline(
  services: EngineServices,
  game: Game,
  key: EngineKey | null,
  overrides: Partial<DeadlineDeps> = {}
): void {
  if (key === null) return
  const d: DeadlineDeps = { ...defaultDeadlineDeps, ...overrides }
  const ctx = getLaunchOverlayContext(key)
  if (ctx === undefined || ctx.prefix.kind !== 'bottle') return
  const armedSelection = getEngineSelection(key)
  if (armedSelection === undefined) return
  const bottleName = ctx.prefix.bottleName
  const installPath = game.getGameInfo().install?.install_path ?? ''

  const deadline = armLaunchDeadline({
    key,
    onDeadline: () => onEngineLaunchDeadline(game, key, armedSelection, d)
  })
  stopDeadlineWatcher(key)
  const watcher = d.watch({
    services,
    installPath,
    bottleDir: getBottleDir(bottleName),
    onFirstMatch: () => {
      deadlineWatchers.delete(key)
      cancelLaunchDeadline(key, 'first-match')
    },
    onGiveUp: () => {
      // WR-01: a lost signal source must not leave a stale deadline armed.
      deadlineWatchers.delete(key)
      cancelLaunchDeadline(key, 'monitor-unavailable')
    }
  })
  if (watcher !== null) deadlineWatchers.set(key, watcher)
  bindDeadlineToMonitor(deadline, watcher, (msg) =>
    logInfo(`Engine: ${key} ${msg}`, LogPrefix.Backend)
  )
}

/** Release everything a launch held: registry, overlay context, ledger entry and deadline. */
export function endEngineLaunch(key: EngineKey): void {
  stopDeadlineWatcher(key)
  clearEngineSelection(key)
  clearLaunchOverlayContext(key)
  const bottle = ledgerBottles.get(key)
  if (bottle !== undefined) {
    markGameStopped(bottle, key)
    ledgerBottles.delete(key)
  }
  cancelLaunchDeadline(key, 'launcher-exited')
}

export function __resetLaunchEngineForTests(): void {
  ledgerBottles.clear()
  deadlineWatchers.clear()
}
