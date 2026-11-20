/**
 * Phase 81 D-01..D-03: what the game page asks the backend about a pending Steam adoption. The
 * frontend never derives adoption; it renders this module's answers.
 *
 * The three `answer*` functions are the sidecar handlers' bodies: the appId is renderer input
 * (T-81-27), so each re-validates it, and none of them throws.
 *
 * D-02 / D-04: "Restart Steam now" runs the same graceful quit and relaunch as restart-on-Play,
 * but relaunches Steam itself instead of a game; "Open Steam" brings Steam forward. Neither asks
 * for confirmation. Steam is never killed. With no pending record the press acts only at the GameLib
 * 1026 waiting edge (proved by the Rust install poll): it starts Steam when it is not running, or runs
 * the same graceful restart, and never launches a game.
 *
 * Exit contract: no timers or handles, no work at import.
 */
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { ManagerDeps } from 'backend/services/types'
import {
  RUST_STEAM_WINDOW_RAISE,
  RUST_STEAMPOLL_STATUS
} from 'common/types/sidecarTransport'
import { clearAndUnwatchPendingAdoption } from './adoptionWatch'
import {
  createRestartDeps,
  pendingAdoptionStoreFrom,
  readPendingAdoption,
  restartSteamForAdoption,
  type RestartDeps
} from './macSteamAdoption'
import type SteamGame from './games'
import type { SteamStoresDeps } from './library/installRoot'
import { hostPlatform, pushAdoptRestartRefusal } from './playAdoption'
import { invokeSteamPoll } from './pollRust/rustSteamPoll'
import type { PollStatus } from './pollRust/steamPollTypes'
import type { SteamInstallRuntime } from './steamInstallRuntime'
import type {
  SteamAdoptionRestartOutcome,
  SteamAdoptionStatus
} from 'common/types/steam'

/** What the page status reads: the record store plus the per-boot signed-in cache (81-09). */
export type AdoptionStatusDeps = SteamStoresDeps & {
  steamInstallRuntime: Pick<SteamInstallRuntime, 'adoption'>
}

/** What a status push needs on top of the read: the typed frontend push. */
export type AdoptionPushDeps = AdoptionStatusDeps &
  Pick<ManagerDeps, 'sendFrontendMessage'>

const NOT_PENDING: SteamAdoptionStatus = { pending: false, steamSignedIn: null }

/** A Steam appId argument from the renderer: one to ten digits, as the zod tuple requires. */
function isSteamAppIdArg(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,10}$/.test(value)
}

/**
 * Whether a stored, valid pending-adoption record exists for `appId`, and the last signed-in
 * reading the Rust watch reported for it (null until one arrives, D-03).
 */
export function getSteamAdoptionStatus(
  deps: AdoptionStatusDeps,
  appId: string
): SteamAdoptionStatus {
  return {
    pending:
      readPendingAdoption(appId, pendingAdoptionStoreFrom(deps)) !== undefined,
    steamSignedIn: deps.steamInstallRuntime.adoption.signedIn.get(appId) ?? null
  }
}

/**
 * D-07: pushes the page status for `appId` to the renderer, once, with a strictly increasing seq
 * (the renderer drops anything not newer). Called after every record write and clear and after
 * every signed-in change. Never throws: a failed push must not fail the install, launch or
 * uninstall path that wrote the record.
 */
export function pushSteamAdoptionStatus(
  deps: AdoptionPushDeps,
  appId: string
): void {
  try {
    const status = getSteamAdoptionStatus(deps, appId)
    const seq = ++deps.steamInstallRuntime.adoption.pushSeq.last
    deps.sendFrontendMessage('steamAdoptionStatusChanged', {
      appName: appId,
      pending: status.pending,
      steamSignedIn: status.steamSignedIn,
      seq
    })
  } catch (err) {
    logWarning(
      `[Steam] adoption status push failed for ${appId}: ${String(err)}`,
      LogPrefix.Steam
    )
  }
}

/** D-03: stores the Rust watch's signed-in reading for `appId` and pushes the page status once. */
export function noteAdoptionSignedIn(
  deps: AdoptionPushDeps,
  appId: string,
  signedIn: boolean | null
): void {
  deps.steamInstallRuntime.adoption.signedIn.set(appId, signedIn)
  pushSteamAdoptionStatus(deps, appId)
}

/** The `steamAdoptionStatus` handler body: a bad appId or any failure answers "not pending". */
export function answerSteamAdoptionStatus(
  deps: AdoptionStatusDeps,
  appId: unknown
): SteamAdoptionStatus {
  if (!isSteamAppIdArg(appId)) return { ...NOT_PENDING }
  try {
    return getSteamAdoptionStatus(deps, appId)
  } catch (err) {
    logWarning(
      [`steamAdoptionStatus failed appId=${appId}:`, err],
      LogPrefix.Steam
    )
    return { ...NOT_PENDING }
  }
}

/** The restart deps shared by the record path and the 1026-edge path. */
function restartDepsFor(
  steamGame: SteamGame,
  platform: NodeJS.Platform
): RestartDeps {
  const { deps } = steamGame
  return createRestartDeps({
    platform,
    requestRustInvoke: deps.requestRustInvoke,
    runner: deps.runner,
    openExternal: deps.openExternal,
    clock: deps.clock,
    paths: deps.paths,
    macSteam: deps.steamProcesses.macSteam,
    sendFrontendMessage: deps.sendFrontendMessage,
    appRuntime: deps.appRuntime,
    gameSession: deps.steamSession.gameSession,
    // Steam itself, not a game: one URL on all three OSes. The user pressed the button, so Steam
    // comes up in front (no activate:false).
    relaunch: () => deps.openExternal.openExternal('steam://open/main')
  })
}

/**
 * Whether Rust's `steampoll_status` lists a GameLib-owned (non-delegated) install poll for `appId`.
 * The "waiting for restart" status context comes only from an active native-handoff install poll,
 * and the page shows "Restart Steam now" with no pending record only at that edge, so this is the
 * backend's own evidence that a press came from the 1026 edge. A delegated poll is Steam's own
 * install: restarting Steam there would interrupt its download. A rejected invoke or a malformed
 * answer is false (fail closed: do nothing).
 */
async function hasGameLibInstallPoll(
  deps: SteamGame['deps'],
  appId: string
): Promise<boolean> {
  try {
    const status = (await invokeSteamPoll(
      deps,
      RUST_STEAMPOLL_STATUS
    )) as PollStatus | null
    return (
      typeof status === 'object' &&
      status !== null &&
      Array.isArray(status.installs) &&
      status.installs.some(
        (i) => i?.appId === appId && i.delegatedToSteamClient !== true
      )
    )
  } catch (err) {
    logWarning(
      `SteamGame: could not read the install poll status for ${appId}: ${String(err)}`,
      LogPrefix.Steam
    )
    return false
  }
}

/**
 * The not-running counterpart of `restartSteamForAdoption`: no `steam://exit` (a URL sent to a
 * stopped Steam launches it, and the quit wait would only time out), the same D-05 refusals in the
 * same order, then the relaunch alone.
 */
async function startSteamForWaitingInstall(
  appId: string,
  deps: RestartDeps
): Promise<Awaited<ReturnType<typeof restartSteamForAdoption>>> {
  const runningAppId = await deps.readRunningAppId()
  if (runningAppId !== 0) {
    logWarning(
      `[Steam] not starting Steam for ${appId}: game ${runningAppId} is running`,
      LogPrefix.Steam
    )
    return { kind: 'game-running', runningAppId }
  }
  if (deps.isOfflineWrapOwed()) {
    logWarning(
      `[Steam] not starting Steam for ${appId}: a go-offline wrap is owed`,
      LogPrefix.Steam
    )
    return { kind: 'steam-busy' }
  }
  logInfo(
    `[Steam] Steam is not running; starting it for ${appId} at the 1026 handoff (no pending adoption record)`,
    LogPrefix.Steam
  )
  await deps.relaunch()
  return { kind: 'relaunched' }
}

/**
 * The no-record press: only at the GameLib 1026 waiting edge. Starts Steam when it is not running,
 * or runs the same graceful restart when it is. Anything else answers 'no-record'.
 */
async function runWaitingEdgeRestart(
  steamGame: SteamGame,
  platform: NodeJS.Platform
): Promise<SteamAdoptionRestartOutcome> {
  const { deps, appId } = steamGame
  if (!(await hasGameLibInstallPoll(deps, appId))) return 'no-record'
  // The Rust install poll owns this game's status and re-sends 'installing' with the waiting
  // context every tick. A 'steam-starting' here would be overwritten within a tick, and a closing
  // 'done' would drop the installing entry from the library status until the next tick.
  const restartDeps: RestartDeps = {
    ...restartDepsFor(steamGame, platform),
    emitStatus: () => undefined,
    emitDone: () => undefined
  }
  // A failed probe counts as running, the same rule the quit wait uses.
  const steamRunning = await restartDeps.isSteamRunning().catch(() => true)
  const outcome = steamRunning
    ? await restartSteamForAdoption(appId, restartDeps)
    : await startSteamForWaitingInstall(appId, restartDeps)
  if (outcome.kind === 'relaunched') {
    // No record and no adoption watch exist for this appId, so there is nothing to clear.
    logInfo(
      `SteamGame: Restart Steam now for ${appId} at the 1026 handoff: Steam relaunched (no pending adoption record)`,
      LogPrefix.Steam
    )
    return 'relaunched'
  }
  logWarning(
    `SteamGame: Restart Steam now for ${appId} at the 1026 handoff refused (${outcome.kind}); no pending adoption record`,
    LogPrefix.Steam
  )
  await pushAdoptRestartRefusal(steamGame, outcome.kind, false)
  return outcome.kind
}

/**
 * D-02: quits Steam gracefully, waits, and relaunches Steam itself; only a relaunch clears the
 * pending record. A refusal (a game running in Steam, a wrap owed, Steam not quitting in 30 s)
 * shows the 81-07 in-app notice, without the launch-without-Steam action, and keeps the record.
 * With no record, the press acts only at the GameLib 1026 edge (`runWaitingEdgeRestart`): it starts
 * Steam when it is not running, or runs the same graceful restart, and never launches a game (D-04:
 * no confirmation).
 */
async function runRestartNow(
  steamGame: SteamGame,
  platform: NodeJS.Platform
): Promise<SteamAdoptionRestartOutcome> {
  const { deps, appId } = steamGame
  if (!readPendingAdoption(appId, pendingAdoptionStoreFrom(deps))) {
    return runWaitingEdgeRestart(steamGame, platform)
  }
  const outcome = await restartSteamForAdoption(
    appId,
    restartDepsFor(steamGame, platform)
  )
  if (outcome.kind === 'relaunched') {
    clearAndUnwatchPendingAdoption(deps, appId)
    return 'relaunched'
  }
  logWarning(
    `SteamGame: Restart Steam now for ${appId} refused (${outcome.kind}); pending adoption kept`,
    LogPrefix.Steam
  )
  await pushAdoptRestartRefusal(steamGame, outcome.kind, false)
  return outcome.kind
}

/**
 * D-02: "Restart Steam now". Serialised with Play through the shared Steam single flight, so a
 * second click or a Play pressed meanwhile joins this one instead of starting another restart.
 * The flight resolves false (no game is launched), so a joining Play records no recent game.
 * Never rejects: a failure answers 'error'.
 */
export async function restartSteamNowForAdoption(
  steamGame: SteamGame,
  platform: NodeJS.Platform = hostPlatform()
): Promise<SteamAdoptionRestartOutcome> {
  const { appId, deps } = steamGame
  let joined = false
  let outcome: SteamAdoptionRestartOutcome = 'error'
  try {
    await deps.appRuntime.launchFlights.singleFlightLaunch(
      'steam',
      appId,
      () => {
        joined = true
      },
      async () => {
        outcome = await runRestartNow(steamGame, platform)
        return false
      }
    )
  } catch (err) {
    logWarning(
      `SteamGame: Restart Steam now for ${appId} failed: ${String(err)}`,
      LogPrefix.Steam
    )
    return joined ? 'in-progress' : 'error'
  }
  return joined ? 'in-progress' : outcome
}

/**
 * Windows and Linux (X11): asks the shell to raise Steam's own window. The note shows "Open Steam" only while
 * Steam is signed out, and a signed-out Steam holds `steam://open/main` until login finishes (its
 * console_log shows no `ExecCommandLine` for the presses made at the sign-in window, then one
 * deferred `steam://open/main` right after login), so the URL alone never brings the sign-in window
 * forward (Phase 81 live gate item 10 (e)). The shell is the foreground process at the click, so it
 * may raise the window. A failure or "no window" answer only logs: the URL still goes out after it.
 */
async function raiseSteamWindowForAdoption(
  deps: Pick<ManagerDeps, 'requestRustInvoke'>
): Promise<void> {
  try {
    const raised = await deps.requestRustInvoke(RUST_STEAM_WINDOW_RAISE, [])
    logInfo(
      `SteamGame: shell raised the Steam window: ${raised === true}`,
      LogPrefix.Steam
    )
  } catch (err) {
    logWarning(
      `SteamGame: raising the Steam window failed: ${String(err)}`,
      LogPrefix.Steam
    )
  }
}

/**
 * D-03: brings Steam forward (no activate:false, which would send the open to the background).
 * macOS: the URL alone does it. Windows and Linux (X11): the shell raises Steam's window first (see
 * `raiseSteamWindowForAdoption`), then the same URL goes out, which still starts Steam when it is
 * not running and shows the main window when it is hidden in the tray.
 */
export async function openSteamForAdoption(
  deps: Pick<ManagerDeps, 'openExternal' | 'requestRustInvoke'>,
  platform: NodeJS.Platform = hostPlatform()
): Promise<void> {
  logInfo('SteamGame: opening Steam from the adoption note', LogPrefix.Steam)
  if (platform === 'win32' || platform === 'linux')
    await raiseSteamWindowForAdoption(deps)
  await deps.openExternal.openExternal('steam://open/main')
}

/** The `steamAdoptionRestartNow` handler body: a bad appId does nothing; never rejects. */
export async function answerSteamAdoptionRestartNow(
  getGame: (appId: string) => SteamGame,
  appId: unknown
): Promise<SteamAdoptionRestartOutcome> {
  if (!isSteamAppIdArg(appId)) return 'error'
  try {
    return await restartSteamNowForAdoption(getGame(appId))
  } catch (err) {
    logWarning(
      [`steamAdoptionRestartNow failed appId=${appId}:`, err],
      LogPrefix.Steam
    )
    return 'error'
  }
}

/** The `steamAdoptionOpenSteam` handler body: a bad appId does nothing; never rejects. */
export async function answerSteamAdoptionOpenSteam(
  getGame: (appId: string) => SteamGame,
  appId: unknown
): Promise<void> {
  if (!isSteamAppIdArg(appId)) return
  try {
    await openSteamForAdoption(getGame(appId).deps)
  } catch (err) {
    logWarning(
      [`steamAdoptionOpenSteam failed appId=${appId}:`, err],
      LogPrefix.Steam
    )
  }
}
