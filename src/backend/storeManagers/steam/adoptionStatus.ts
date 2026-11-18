/**
 * Phase 81 D-01..D-03: what the game page asks the backend about a pending Steam adoption. The
 * frontend never derives adoption; it renders this module's answers.
 *
 * The three `answer*` functions are the sidecar handlers' bodies: the appId is renderer input
 * (T-81-27), so each re-validates it, and none of them throws.
 *
 * D-02 / D-04: "Restart Steam now" runs the same graceful quit and relaunch as restart-on-Play,
 * but relaunches Steam itself instead of a game; "Open Steam" brings Steam forward. Neither asks
 * for confirmation. Steam is never killed.
 *
 * Exit contract: no timers or handles, no work at import.
 */
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { ManagerDeps } from 'backend/services/types'
import { RUST_STEAM_WINDOW_RAISE } from 'common/types/sidecarTransport'
import { clearAndUnwatchPendingAdoption } from './adoptionWatch'
import {
  createRestartDeps,
  pendingAdoptionStoreFrom,
  readPendingAdoption,
  restartSteamForAdoption
} from './macSteamAdoption'
import type SteamGame from './games'
import type { SteamStoresDeps } from './library/installRoot'
import { hostPlatform, pushAdoptRestartRefusal } from './playAdoption'
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

/**
 * D-02: quits Steam gracefully, waits, and relaunches Steam itself; only a relaunch clears the
 * pending record. A refusal (a game running in Steam, a wrap owed, Steam not quitting in 30 s)
 * shows the 81-07 in-app notice, without the launch-without-Steam action, and keeps the record.
 */
async function runRestartNow(
  steamGame: SteamGame,
  platform: NodeJS.Platform
): Promise<SteamAdoptionRestartOutcome> {
  const { deps, appId } = steamGame
  if (!readPendingAdoption(appId, pendingAdoptionStoreFrom(deps))) {
    return 'no-record'
  }
  const outcome = await restartSteamForAdoption(
    appId,
    createRestartDeps({
      platform,
      requestRustInvoke: deps.requestRustInvoke,
      runner: deps.runner,
      openExternal: deps.openExternal,
      clock: deps.clock,
      paths: deps.paths,
      macSteam: deps.steamProcesses.macSteam,
      sendFrontendMessage: deps.sendFrontendMessage,
      appRuntime: deps.appRuntime,
      // Steam itself, not a game: one URL on all three OSes. The user pressed the button, so Steam
      // comes up in front (no activate:false).
      relaunch: () => deps.openExternal.openExternal('steam://open/main')
    })
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
 * Windows only: asks the shell to raise Steam's own window. The note shows "Open Steam" only while
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
 * macOS and Linux: the URL alone does it. Windows: the shell raises Steam's window first (see
 * `raiseSteamWindowForAdoption`), then the same URL goes out, which still starts Steam when it is
 * not running and shows the main window when it is hidden in the tray.
 */
export async function openSteamForAdoption(
  deps: Pick<ManagerDeps, 'openExternal' | 'requestRustInvoke'>,
  platform: NodeJS.Platform = hostPlatform()
): Promise<void> {
  logInfo('SteamGame: opening Steam from the adoption note', LogPrefix.Steam)
  if (platform === 'win32') await raiseSteamWindowForAdoption(deps)
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
