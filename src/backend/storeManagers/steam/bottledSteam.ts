/**
 * Bottled-Steam raise-to-front loops and verb dispatch (Phase 17, 17-04),
 * split out of bottle.ts in Phase 65 (65-07). The raise-loop cancellation
 * state, its test seam and the timer `unref` live together here (D-10).
 */
import type { AppPaths } from 'backend/process/context'
import type { AppState } from 'backend/host/appState'
import type { Clock, TimerHandle } from 'backend/process/types'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import type {
  CommandRunner,
  SteamLibraryStateDeps
} from 'backend/services/types'
import type { RunsForMeDeps } from 'backend/runsForMe'
import type { SpawnDeps } from './provisionBottle'
import type { BottleProcessMonitors } from './bottleProcessMonitor'
import type { WineWindowRaiser } from 'backend/utils/wineWindowRaise'

/** SpawnDeps plus the window-yield the raise fallback uses (66.3-08). */
export type BottledRaiseDeps = SpawnDeps & {
  appState: Pick<AppState, 'hide'>
  /** The boot's raise-loop owner (66.4-06). */
  steamLaunchRuntime: { raiser: BottledSteamRaiser }
}
import { DEFAULT_STEAM_BOTTLE_NAME } from './constants'
import { getBottleDir } from 'backend/engine/bottlePrimitives'
import { NUMERIC_APP_ID } from './gameConstants'
import { getBottleSteamExePath, type SteamBottle } from './bottle'

// GAP 5: bottled-Steam installer process names to raise to the front. The
// guided provisioning installer is `SteamSetup.exe`; a per-game bottled install
// surfaces the bottled Windows Steam client `steam.exe`. Deliberately NOT the
// native macOS Steam client (`steam_osx`), which may also be running.
const INSTALLER_PROCESS_NAMES = ['SteamSetup.exe', 'steam.exe']

/**
 * GAP 5 fix (macOS-only, fire-and-forget): the installer window is owned by a
 * separate, UNBUNDLED CrossOver/Wine process that appears a few seconds AFTER
 * dispatch — diagnosed via GAP5-DIAG as `SteamSetup.exe` (provisioning) /
 * bottled `steam.exe` (per-game install), each its OWN foreground macOS app
 * with bundleId "missing value". Because it has no bundle id AND (in CrossOver
 * per-app mode) is a distinct app from the CrossOver host, we target the
 * process directly BY NAME and raise it via System Events `set frontmost` —
 * the scripted-user action that should defeat macOS focus-stealing protection.
 *
 * We poll (~1.5s cadence, ~18s window) because the process appears after the
 * wine launcher runs; once raised, we re-raise once to catch the splash->main
 * window transition. If the installer process never appears, we fall back to
 * app.hide() (the previous best-effort yield) so GameLib at least steps aside.
 *
 * GameLib's window + guided banner stay VISIBLE on the success path — we do NOT
 * touch GameLib's own window state. In particular, when GameLib is in native
 * fullscreen (its own macOS Space), `set frontmost` on the installer makes
 * macOS auto-switch Spaces to the installer (the "scroll" to its Space) rather
 * than us yanking GameLib out of fullscreen (17-UAT refinement). Every step is
 * guarded; failure never affects the install flow. No-op on Linux/Windows.
 */
// Steam's OWN client/helper processes running inside the bottle. When we raise
// a LAUNCHED game's window (GAP-17-LAUNCH-FOCUS) we must skip these — the game
// is a DIFFERENT unbundled `.exe`, and raising steam.exe/steamwebhelper would
// pull the client forward instead of the game.
const STEAM_CLIENT_PROCESS_NAMES = [
  'steam.exe',
  'steamwebhelper.exe',
  'SteamSetup.exe',
  'GameOverlayUI.exe'
]

/**
 * GAP C (17-16) leak-safe cancellation state. The raise poll loop is fired
 * `void` (fire-and-forget) from provisionBottle/dispatch, so under Jest its
 * real ~18s `sleep` retry survived teardown — keeping the worker alive ("A
 * worker process has failed to exit gracefully") and, worse, firing a dynamic
 * `import(...)` after the environment was torn down ("import a file after the
 * Jest environment has been torn down"). We (a) unref every retry timer so a
 * pending sleep never keeps the process alive, and (b) gate each iteration on a
 * cancellation flag so no `import`/spawn runs after teardown.
 */

/** The raise-loop owner: the cancel flag and the live retry timers of one boot (66.4-06, D-05). */
export interface BottledSteamRaiser {
  /** The shared raise-to-front core (macOS-only, fire-and-forget). */
  raiseFrontmostBottledProcess: (
    deps: BottledRaiseDeps,
    context: string,
    raiseScript: string
  ) => Promise<void>
  /**
   * Cancel any in-flight raise loop and clear every tracked retry timer so no loop survives
   * teardown. A fresh raise loop resets the flag, so a prior cancel never suppresses a later raise.
   */
  cancelRaiseLoops: () => void
}

/**
 * Construction allocates an empty timer set and arms nothing; retry sleeps run on the injected
 * clock (unref'd) only once a loop starts.
 */
export function createBottledSteamRaiser(deps: {
  clock: Pick<Clock, 'setTimeout' | 'clear'>
}): BottledSteamRaiser {
  let cancelled = false
  const activeTimers = new Set<TimerHandle>()

  const cancelRaiseLoops = (): void => {
    cancelled = true
    for (const handle of activeTimers) {
      deps.clock.clear(handle)
    }
    activeTimers.clear()
  }

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const handle = deps.clock.setTimeout(() => {
        activeTimers.delete(handle)
        resolve()
      }, ms)
      activeTimers.add(handle)
    })

  return {
    cancelRaiseLoops,
    raiseFrontmostBottledProcess: (d, context, raiseScript) =>
      raiseLoop(
        {
          sleep,
          isCancelled: () => cancelled,
          reset: () => {
            cancelled = false
          }
        },
        d,
        context,
        raiseScript
      )
  }
}

interface RaiseLoopState {
  sleep: (ms: number) => Promise<void>
  isCancelled: () => boolean
  reset: () => void
}

/**
 * Shared raise-to-front core (macOS-only, fire-and-forget). Polls (~1.5s
 * cadence, ~18s window) running a caller-supplied AppleScript that returns
 * either "<name> pid=<n>" for the raised process or "none". On a hit it
 * re-raises once (splash -> main-window settle); on a persistent miss it falls
 * back to app.hide() so GameLib at least steps aside. Every step is guarded —
 * failure never affects the install/launch flow. No-op on Linux/Windows.
 */
async function raiseLoop(
  loop: RaiseLoopState,
  deps: BottledRaiseDeps,
  context: string,
  raiseScript: string
): Promise<void> {
  try {
    // GAP C: a fresh loop clears any prior cancellation (teardown hook only
    // suppresses loops that are already in flight, never future ones).
    loop.reset()

    const { isMac } = await import('backend/constants/environment')
    if (!isMac || loop.isCancelled()) {
      return
    }

    const tryRaise = async (): Promise<string | null> => {
      try {
        const { stdout } = await deps.spawnAsync('osascript', [
          '-e',
          raiseScript
        ])
        const out = stdout.trim()
        return out && out !== 'none' ? out : null
      } catch (error) {
        logWarning(
          [
            `raiseFrontmostBottledProcess [${context}]: osascript raise failed`,
            error
          ],
          LogPrefix.Steam
        )
        return null
      }
    }

    let raised: string | null = null
    for (let attempt = 0; attempt < 12 && !raised; attempt++) {
      if (loop.isCancelled()) return
      await loop.sleep(1500)
      if (loop.isCancelled()) return
      raised = await tryRaise()
    }

    if (raised) {
      logInfo(
        `raiseFrontmostBottledProcess [${context}]: raised to front (${raised})`,
        LogPrefix.Steam
      )
      // Re-raise once after the window settles (splash -> main UI).
      if (loop.isCancelled()) return
      await loop.sleep(2500)
      if (loop.isCancelled()) return
      await tryRaise()
    } else if (loop.isCancelled()) {
      return
    } else {
      logWarning(
        `raiseFrontmostBottledProcess [${context}]: no matching process within ~18s — falling back to app.hide()`,
        LogPrefix.Steam
      )
      try {
        deps.appState.hide()
      } catch (error) {
        logWarning(
          [
            `raiseFrontmostBottledProcess [${context}]: app.hide fallback failed`,
            error
          ],
          LogPrefix.Steam
        )
      }
    }
  } catch (error) {
    logWarning(
      [`raiseFrontmostBottledProcess [${context}]: failed`, error],
      LogPrefix.Steam
    )
  }
}

export async function raiseInstallerWindow(
  deps: BottledRaiseDeps,
  context: string
): Promise<void> {
  const nameClause = INSTALLER_PROCESS_NAMES.map((n) => `name is "${n}"`).join(
    ' or '
  )
  // GAP C (17-16): conservative focus reliability — filter to `visible is true`
  // processes (mirroring the already-working raiseBottledGameWindow) and pick
  // the FIRST visible match, so we never target a hidden/background helper of
  // the same name (`item 1 of procs` could otherwise select one).
  const raiseScript = [
    'tell application "System Events"',
    `set procs to (every process whose visible is true and (${nameClause}))`,
    'if procs is {} then return "none"',
    'set p to item 1 of procs',
    'set frontmost of p to true',
    'return (name of p) & " pid=" & (unix id of p)',
    'end tell'
  ].join('\n')
  await deps.steamLaunchRuntime.raiser.raiseFrontmostBottledProcess(
    deps,
    context,
    raiseScript
  )
}

/**
 * GAP-17-LAUNCH-FOCUS (macOS-only, fire-and-forget): after a bottled game is
 * launched via `-applaunch`, the game window is a SEPARATE unbundled Wine
 * process (the game's own `.exe`) that macOS focus-stealing protection leaves
 * behind GameLib. Bottled Windows executables end in `.exe` (native macOS apps
 * do not), so we raise the frontmost visible `.exe` process that is NOT one of
 * Steam's own client/helper processes — i.e. the launched game itself.
 */
async function raiseBottledGameWindow(
  deps: BottledRaiseDeps,
  context: string
): Promise<void> {
  const excludeList = STEAM_CLIENT_PROCESS_NAMES.map((n) => `"${n}"`).join(', ')
  const raiseScript = [
    'tell application "System Events"',
    `set steamNames to {${excludeList}}`,
    'set procs to (every process whose visible is true and name ends with ".exe")',
    'repeat with p in procs',
    '  if (name of p) is not in steamNames then',
    '    set frontmost of p to true',
    '    return (name of p) & " pid=" & (unix id of p)',
    '  end if',
    'end repeat',
    'return "none"',
    'end tell'
  ].join('\n')
  await deps.steamLaunchRuntime.raiser.raiseFrontmostBottledProcess(
    deps,
    context,
    raiseScript
  )
}

// ── 17-04: bottled-Steam verb dispatch ──────────────────────────────────────

/** The slices the bottled-Steam dispatch reaches (66.1 R3, R5). */
export type BottledSteamDeps = BottledRaiseDeps &
  SteamLibraryStateDeps & {
    paths: Pick<AppPaths, 'userHome'>
    steamLaunchRuntime: { monitors: BottleProcessMonitors }
    windowRaiser: Pick<WineWindowRaiser, 'raise'>
    stores: RunsForMeDeps['stores']
    commandRunner: Pick<CommandRunner, 'runWineCommand'>
    steamBottle: Pick<
      SteamBottle,
      'configStore' | 'getSteamBottleSettings' | 'isBottleReady'
    >
  }

type BottledSteamVerb = 'install' | 'launch' | 'uninstall'
type BottledSteamResult = { status: 'done' | 'error'; error?: string }

/**
 * Numeric-guards appId (mirrors buildSteamProtocolUrl's /^\d+$/ rule,
 * T-17-04), pre-flights isBottleReady() (conf + steam.exe — belt-and-
 * suspenders even if a caller reaches dispatch on a half-provisioned
 * bottle), then dispatches the verb to the bottled Steam client via
 * runWineCommand. Fire-and-forget — never optimistically flips install
 * state (D-02); the bottle-scoped ACF poller (17-05) owns real status.
 */
async function dispatchToBottledSteam(
  deps: BottledSteamDeps,
  verb: BottledSteamVerb,
  appId: string
): Promise<BottledSteamResult> {
  if (!NUMERIC_APP_ID.test(appId)) {
    logWarning(
      `tellBottledSteamTo${verb}: rejected non-numeric appId "${appId}" — not dispatching (T-17-04)`,
      LogPrefix.Steam
    )
    return { status: 'error', error: `Invalid appId: "${appId}"` }
  }

  if (!deps.steamBottle.isBottleReady()) {
    return {
      status: 'error',
      error: 'Steam bottle is not ready yet'
    }
  }

  const bottleName =
    deps.steamBottle.configStore().get_nodefault('bottleName') ??
    DEFAULT_STEAM_BOTTLE_NAME
  const steamExePath = getBottleSteamExePath(bottleName)

  // -silent: if this call is what starts the bottled client, it comes up in
  // the tray with no main window and no Special Offers popup. Login still
  // prompts when no session is cached, and the steam:// install/uninstall
  // dialogs still show. Ignored when the client is already running.
  let commandParts: string[]
  switch (verb) {
    case 'launch':
      commandParts = [steamExePath, '-silent', '-applaunch', appId]
      break
    case 'install':
      commandParts = [steamExePath, '-silent', `steam://install/${appId}`]
      break
    case 'uninstall':
      commandParts = [steamExePath, '-silent', `steam://uninstall/${appId}`]
      break
  }

  try {
    // Raise the relevant bottled window once it appears (fire-and-forget, before
    // the await so it runs concurrently — see provisionBottle note).
    //  - 'install': raise the guided installer UI (steam.exe/SteamSetup.exe).
    //  - 'launch' (GAP-17-LAUNCH-FOCUS): raise the launched game's own window.
    //  - 'uninstall' (debug/steam-bottle-uninstall-reverts): the bottled
    //    steam.exe pops its own uninstall CONFIRMATION dialog on receipt of
    //    steam://uninstall/<id> — reuse the same raise as 'install' (same
    //    INSTALLER_PROCESS_NAMES, steam.exe is the owning process) so that
    //    dialog isn't left behind GameLib's own window, unseen and
    //    unconfirmed. Previously this verb raised nothing at all, so the
    //    confirm dialog was invisible, the uninstall never proceeded, and
    //    the ACF poller's own grace-window fallback silently reverted the
    //    badge to installed ~60s later.
    if (verb === 'install' || verb === 'uninstall') {
      void raiseInstallerWindow(deps, verb)
    } else if (verb === 'launch') {
      void raiseBottledGameWindow(deps, 'launch')
      // quick/261016-t3e: give a bottled launch real started/stopped
      // feedback by polling for any process under the game's own bottle
      // install directory (Playnite's SteamPlayController pattern). Lazy
      // import — see the module-load note at the top of this file: a static
      // edge here would drag `backend/ipc` into every unit test that imports
      // bottle.ts for its pure helpers.
      const installPath =
        deps.steamSession.libraryState.library.get(appId)?.install?.install_path
      if (!installPath) {
        logWarning(
          `tellBottledSteamToLaunch: no install_path known for appId "${appId}" — no process monitor started`,
          LogPrefix.Steam
        )
      } else {
        // quick/261024-gvu: awaited so the monitor's `launching` push is sent
        // before runWineCommand and therefore before the launch IPC resolves.
        try {
          deps.steamLaunchRuntime.monitors.startBottleProcessMonitor(deps, {
            appId,
            installPath,
            bottleDir: getBottleDir(deps.paths, bottleName)
          })
        } catch (error) {
          logWarning(
            [
              `tellBottledSteamToLaunch: failed to start bottle process monitor for appId "${appId}"`,
              error
            ],
            LogPrefix.Steam
          )
        }
      }
    }
    await deps.commandRunner.runWineCommand({
      commandParts,
      gameSettings: deps.steamBottle.getSteamBottleSettings(),
      wait: false,
      protonVerb: 'run',
      skipPrefixCheckIKnowWhatImDoing: true
    })
    return { status: 'done' }
  } catch (error) {
    logError(
      [`tellBottledSteamTo${verb}: runWineCommand failed`, error],
      LogPrefix.Steam
    )
    if (verb === 'launch') {
      // quick/261024-gvu: a failed dispatch must not leave Launching held.
      try {
        deps.steamLaunchRuntime.monitors.stopBottleProcessMonitor(appId)
      } catch {
        // never throw from the error path
      }
    }
    return {
      status: 'error',
      error: `Failed to dispatch ${verb} to bottled Steam: ${String(error)}`
    }
  }
}

export function tellBottledSteamToLaunch(
  deps: BottledSteamDeps,
  appId: string
): Promise<BottledSteamResult> {
  return dispatchToBottledSteam(deps, 'launch', appId)
}

/**
 * debug/steam-bottle-uninstall-reverts (FINAL): kept, deliberately, as an
 * UNUSED-BUT-HARMLESS code path — games.ts's SteamGame.uninstall() no
 * longer calls this for ANY bottle-eligible title (see its own JSDoc).
 * Delegating uninstall to the bottled Steam client's own steam://uninstall
 * confirm dialog was proven architecturally unworkable in this CrossOver
 * bottle: CrossOver/Wine's resolution of Steam's CW_USEDEFAULT window-
 * position sentinel places the dialog off-screen, so it never becomes an
 * addressable window, for ANY title (Steam-authored or GameLib-authored,
 * warm or cold client) — not merely a readiness or ownership gap this
 * function could route around. This export (and the 'uninstall' case in
 * dispatchToBottledSteam's verb switch below) is left in place rather than
 * deleted because: (1) it is a small, shared, already-tested primitive —
 * removing it means deleting real, independently-correct regression
 * coverage in bottle.test.ts for behavior that itself works correctly
 * (the URI dispatch and window-raise both fire; it's Steam's own dialog
 * rendering that's broken); (2) it may become useful again if a future fix
 * to the underlying CrossOver rendering defect makes delegation viable; and
 * (3) no other caller in this codebase currently reaches it, so keeping it
 * costs nothing beyond the export itself. If this file is ever refactored
 * and this function still has zero callers, it is safe to delete then.
 */
export function tellBottledSteamToUninstall(
  deps: BottledSteamDeps,
  appId: string
): Promise<BottledSteamResult> {
  return dispatchToBottledSteam(deps, 'uninstall', appId)
}
