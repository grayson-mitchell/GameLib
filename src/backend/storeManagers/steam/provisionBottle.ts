/**
 * Dedicated Steam CrossOver bottle provisioning (Phase 17, 17-04), split out of
 * bottle.ts in Phase 65 (65-07). Creates the bottle, fetches SteamSetup.exe
 * once and runs it non-silently so the user clicks through the real installer.
 */
import type { GlobalConfigSlice } from 'backend/config'
import type { AppPaths } from 'backend/process/context'
import type { EngineRuntime } from 'backend/engine/engineRuntime'
import type { GameConfigs } from 'backend/game_config'
import type { AppState } from 'backend/host/appState'
import type { Dialogs } from 'backend/host/dialogs'
import { join } from 'path'
import { existsSync, mkdirSync, rmSync } from 'graceful-fs'
import type { GameInfo, WineInstallation } from 'common/types'
import type { CommandRunner, Stores } from 'backend/services/types'
import {
  getRunnerLogWriter,
  logError,
  logInfo,
  logWarning,
  LogPrefix
} from 'backend/logger'
import type { SpawnAsync } from 'backend/spawnAsync'
import type { ProcessRunner } from 'backend/process/types'
import { checkWineBeforeLaunch } from 'backend/utils'
import { downloadSetupPayload } from './setupDownloads'
import {
  DEFAULT_STEAM_BOTTLE_NAME,
  STEAM_BOTTLE_RESERVED_APPNAME,
  STEAM_SETUP_EXE_URL
} from './constants'
import { sanitizeBottleName } from 'backend/engine/bottlePrimitives'
import {
  getBottleDir,
  isBottleProvisioned
} from 'backend/engine/bottlePrimitives'
import {
  CROSSOVER_CREATE_FAILED,
  CROSSOVER_CREATE_TIMEOUT,
  CROSSOVER_MISSING,
  CROSSOVER_REQUIRED_MESSAGE,
  PROVISION_ABORTED,
  bottleWineArch,
  cxRootFrom,
  cxbottleIn,
  getBottleSteamExePath,
  wineserverIn,
  type SteamBottle
} from './bottle'
import { raiseInstallerWindow } from './bottledSteam'
import type { SteamLaunchRuntime } from './steamLaunchRuntime'

// ── 17-04: bottle provisioning ──────────────────────────────────────────────

export type ProvisionBottleResult = {
  status: 'done' | 'error'
  error?: string
  errorCode?:
    | typeof CROSSOVER_MISSING
    | typeof CROSSOVER_CREATE_TIMEOUT
    | typeof CROSSOVER_CREATE_FAILED
    | typeof PROVISION_ABORTED
  /**
   * True only when this call created the bottle dir (absent at entry). False on the ready
   * short-circuit or when the dir pre-existed.
   */
  createdHere?: boolean
}

/**
 * GAP-17-CEF-RECREATE-RUNNING: stop the target bottle's OWN Wine processes so a
 * subsequent `cxbottle --delete` cannot abort with "There are still
 * applications running… Aborting" (the exact failure hit in the CEF grey-bar
 * scenario the win32->win64 recreate targets — the user reaches the grey bar
 * *because* the bottled Steam client is running, and that same running Steam
 * blocks the delete).
 *
 * SCOPE-FENCE (T-17-DoS): `WINEPREFIX` MUST be `getBottleDir(bottleName)` — the
 * dedicated Steam bottle's own prefix — and NOTHING else. Never the shared
 * `GameLib` GOG/Epic bottle dir, and never unset/empty (an unset WINEPREFIX
 * would let `wineserver -k` hit the default prefix and DoS unrelated bottles).
 * `bottleName` is already sanitized by provisionBottle (T-17-01) before reaching
 * here. `CX_ROOT` is required so the CrossOver-bundled wineserver resolves its
 * own libraries. Best-effort: a kill failure logs a warning and MUST NOT abort
 * provisioning (the rmSync fallback + recreate still run).
 */
/** The slice every spawning bottle helper receives (66.1 R5). */
export type SpawnDeps = {
  spawnAsync: SpawnAsync
  /** The CrossOver Spotlight lookup (mdfind) runs through it (66.2-07). */
  runner: Pick<ProcessRunner, 'run'>
}

/** SpawnDeps plus the persisted wine-bin hint the CrossOver lookup reads (66.3-15). */
export type KillBottleDeps = SpawnDeps & {
  /** The path roots the bottle kill reads (66.4-05). */
  paths: Pick<AppPaths, 'userHome'>
  steamBottle: Pick<SteamBottle, 'persistedWineBins'>
  /** The boot's CrossOver locator (66.4-05). */
  engineRuntime: Pick<EngineRuntime, 'crossover'>
}

export async function killBottleWineServer(
  deps: KillBottleDeps,
  bottleName: string,
  knownBinDir?: string,
  timeoutMs?: number
): Promise<boolean> {
  const binDir =
    knownBinDir ??
    (await deps.engineRuntime.crossover.resolveCrossoverBinDirAsync(
      { runner: deps.runner },
      { hintWineBins: deps.steamBottle.persistedWineBins() }
    ))
  if (!binDir) {
    logWarning(
      `killBottleWineServer: no CrossOver install found, skipping wineserver -k for "${bottleName}"`,
      LogPrefix.Steam
    )
    return false
  }
  try {
    const result = await deps.spawnAsync(wineserverIn(binDir), ['-k'], {
      env: {
        ...process.env,
        WINEPREFIX: getBottleDir(deps.paths, bottleName),
        CX_ROOT: cxRootFrom(binDir)
      },
      ...(timeoutMs !== undefined ? { timeout: timeoutMs } : {})
    })
    if (result?.code === null) {
      logWarning(
        `killBottleWineServer: wineserver -k for bottle "${bottleName}" was killed by its timeout`,
        LogPrefix.Steam
      )
      return false
    }
    return true
  } catch (error) {
    logWarning(
      [
        `killBottleWineServer: wineserver -k for bottle "${bottleName}" failed (best-effort — provisioning continues)`,
        error
      ],
      LogPrefix.Steam
    )
    return false
  }
}

/**
 * Creates the dedicated Steam CrossOver bottle (via the 17-01 LOCKED
 * mechanism), fetches the official SteamSetup.exe once, and runs it
 * NON-SILENTLY inside the bottle so the user clicks through the real
 * installer window (guided click-through provisioning, D-02).
 *
 * Idempotent: if the bottle already exists (isBottleProvisioned() true),
 * short-circuits without re-creating or re-downloading anything.
 *
 * Never hangs silently on the documented steamwebhelper self-update issue
 * (Pitfall 4 / A3) — the installer is launched with `wait: false`, so this
 * function always returns promptly; it does not (and cannot) wait for the
 * user to finish clicking through the installer or for Steam to finish its
 * own first-run update.
 */
export async function provisionBottle(
  deps: {
    stores: Pick<Stores, 'kvs' | 'wineManager'>
    spawnAsync: SpawnAsync
    commandRunner: Pick<CommandRunner, 'runWineCommand'>
    runner: Pick<ProcessRunner, 'run'>
    paths: Pick<
      AppPaths,
      'userHome' | 'steamSupportPath' | 'toolsPath' | 'configPath'
    >
    engineRuntime: Pick<EngineRuntime, 'crossover'>
    steamLaunchRuntime: Pick<SteamLaunchRuntime, 'raiser'>
    config: Pick<
      GlobalConfigSlice,
      'getSettings' | 'getAlternativeWine' | 'setSetting'
    >
    gameConfigs: Pick<GameConfigs, 'get'>
    dialogs: Pick<Dialogs, 'showMessageBox'>
    appState: Pick<AppState, 'hide'>
    steamBottle: Pick<
      SteamBottle,
      | 'configStore'
      | 'getSteamBottleSettings'
      | 'isBottleReady'
      | 'persistedWineBins'
    >
  },
  opts?: {
    bottleName?: string
    wineVersion?: WineInstallation
  }
): Promise<ProvisionBottleResult> {
  const rawName = opts?.bottleName ?? DEFAULT_STEAM_BOTTLE_NAME
  const bottleName = sanitizeBottleName(rawName)

  // (1) Reject unsafe names before any path/argv construction (T-17-01).
  if (!bottleName) {
    logError(
      `provisionBottle: rejected unsafe bottle name "${rawName}" (T-17-01)`,
      LogPrefix.Steam
    )
    return { status: 'error', error: `Invalid bottle name: "${rawName}"` }
  }

  // (1b) CR-01 (17-17) AUTHORITATIVE scope guard (D-01): refuse to provision
  // Steam into the shared GameLib GOG/Epic Wine bottle. This is the SINGLE
  // source of correctness — it MUST hold even if a future or renderer caller
  // passes the shared bottle name, precisely because the downstream
  // win32-recreate branch (step 2b) would otherwise `killBottleWineServer` +
  // `cxbottle --delete --force` + `rmSync(getBottleDir(...))` the shared bottle
  // (irrecoverable data loss), and the win64 path would install a multi-GB
  // Steam client into it. Placed AFTER sanitize (so `bottleName` is trimmed) and
  // BEFORE any store write / cxbottle delete-create / rmSync. Compared against
  // the TRIMMED shared value so a whitespace-padded config value cannot slip
  // past. An unset/empty shared value is inert — it never blocks provisioning.
  const sharedBottle = deps.config.getSettings().wineCrossoverBottle
  if (
    typeof sharedBottle === 'string' &&
    sharedBottle.trim() &&
    bottleName === sharedBottle.trim()
  ) {
    logError(
      `provisionBottle: refusing to provision Steam into the shared GameLib GOG/Epic Wine bottle "${bottleName}" (CR-01 / D-01) — the dedicated Steam bottle must stay distinct`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: 'Refusing to provision Steam into the shared Wine bottle.'
    }
  }

  // (1c) CrossOver-only, mirroring provisionBridgeBottle's D-08 guard: reject
  // a non-CrossOver engine before any side effect — do not silently persist a
  // broken GPTK/toolkit bottle (steam-bottle-gptk-engine-produces-broken-bottle.md).
  // Placed BEFORE the step (2) store write below, same as the bridge sibling.
  if (opts?.wineVersion && opts.wineVersion.type !== 'crossover') {
    logError(
      `provisionBottle: rejected non-CrossOver engine "${opts.wineVersion.type}" for bottle "${bottleName}" (steam-bottle-gptk-engine-produces-broken-bottle.md)`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: `The Steam bottle requires a CrossOver engine, got "${opts.wineVersion.type}"`
    }
  }

  // (1d) quick 261024-cjq: CrossOver precondition. Resolved right after the
  // engine guard and before any store write or spawn. A ready bottle with
  // CrossOver since uninstalled still short-circuits 'done' (step 3), so the
  // missing-CrossOver error is returned only when a recreate or a create is
  // actually needed.
  const binDir = await deps.engineRuntime.crossover.resolveCrossoverBinDirAsync(
    { runner: deps.runner },
    {
      wineVersion: opts?.wineVersion,
      hintWineBins: deps.steamBottle.persistedWineBins()
    }
  )
  const needsCxbottle =
    !deps.steamBottle.isBottleReady(bottleName) ||
    (isBottleProvisioned(deps.paths, bottleName) &&
      bottleWineArch(bottleName) === 'win32')
  if (!binDir && needsCxbottle) {
    logWarning(
      `provisionBottle: CrossOver not found, cannot provision bottle "${bottleName}"`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      errorCode: CROSSOVER_MISSING,
      error: CROSSOVER_REQUIRED_MESSAGE
    }
  }

  // (2) Persist the chosen wine/bottle identity before composing settings.
  deps.steamBottle.configStore().set('bottleName', bottleName)
  deps.steamBottle.configStore().set('wineCrossoverBottle', bottleName)
  if (opts?.wineVersion) {
    deps.steamBottle.configStore().set('wineVersion', opts.wineVersion)
  }

  // (2b) GAP-17-CEF-RENDER: a win32 bottle cannot be converted in place — it
  // must be detected and recreated as win10_64 BEFORE either idempotent guard
  // below (isBottleReady / isBottleProvisioned) gets a chance to reuse the
  // stale bottle forever. Only bottle STATE (`provisioned`) is reset here;
  // GameLib's Steam ACCOUNT auth (refreshToken/isLoggedIn/userData) is never
  // touched — bottled-client login lives inside the prefix, so re-login in
  // the fresh bottle is inherent and expected (MACSTEAM-02/MACSTEAM-04).
  if (
    isBottleProvisioned(deps.paths, bottleName) &&
    bottleWineArch(bottleName) === 'win32'
  ) {
    logInfo(
      `provisionBottle: bottle "${bottleName}" is a stale 32-bit (win32) prefix — recreating as win10_64 (GAP-17-CEF-RENDER)`,
      LogPrefix.Steam
    )
    // GAP-17-CEF-RECREATE-RUNNING: stop the bottle's OWN Wine processes first —
    // WINEPREFIX-scoped (T-17-DoS) — so `cxbottle --delete` does not abort while
    // the bottled Steam client/steamwebhelper is still running.
    await killBottleWineServer(deps, bottleName, binDir)
    try {
      await deps.spawnAsync(cxbottleIn(binDir as string), [
        '--bottle',
        bottleName,
        '--delete',
        '--force'
      ])
    } catch (error) {
      logWarning(
        [
          'provisionBottle: cxbottle --delete of the stale win32 bottle threw',
          error
        ],
        LogPrefix.Steam
      )
    }
    // Fallback: if cxbottle.conf lingered (delete failed/incomplete), remove
    // the bottle directory directly so the create-guard below rebuilds fresh.
    if (isBottleProvisioned(deps.paths, bottleName)) {
      try {
        rmSync(getBottleDir(deps.paths, bottleName), {
          recursive: true,
          force: true
        })
      } catch (error) {
        logWarning(
          [
            'provisionBottle: fallback rmSync of the stale win32 bottle dir threw',
            error
          ],
          LogPrefix.Steam
        )
      }
    }
    // Reset ONLY bottle state — never touch refreshToken/isLoggedIn/userData.
    deps.steamBottle.configStore().set('provisioned', false)
  }

  // (3) Idempotent short-circuit — bottle is FULLY ready (conf + steam.exe).
  // A half-provisioned bottle (conf only) must NOT short-circuit here — it
  // needs to resume (self-heal) via steps 4-7 below.
  if (deps.steamBottle.isBottleReady(bottleName)) {
    return { status: 'done' }
  }

  // (4) CREATE the bottle via the 17-01 LOCKED mechanism (win10_64 per
  // GAP-17-CEF-RENDER — win10 is CrossOver's 32-bit template and its win32
  // prefix breaks modern 64-bit Steam's CEF install-dialog UI (0x0 render);
  // MACSTEAM-02) — argv form only, arguments as discrete words, never a
  // shell-interpolated string. Skipped when cxbottle.conf already exists
  // (half-provisioned bottle being resumed) — re-running `cxbottle --create`
  // on an existing bottle is unnecessary and this resumes straight into the
  // download/install step.
  if (!isBottleProvisioned(deps.paths, bottleName)) {
    try {
      const { code, stderr } = await deps.spawnAsync(
        cxbottleIn(binDir as string),
        ['--create', '--bottle', bottleName, '--template', 'win10_64']
      )
      if (!isBottleProvisioned(deps.paths, bottleName)) {
        // log-secret-gate-exempt: stderr of cxbottle create (bottle provisioning), not an auth command
        logError(
          [
            'provisionBottle: cxbottle create did not produce cxbottle.conf for',
            bottleName,
            `(code=${code}):`,
            stderr
          ],
          LogPrefix.Steam
        )
        return {
          status: 'error',
          error: `Failed to create CrossOver bottle "${bottleName}"`
        }
      }
    } catch (error) {
      logError(
        ['provisionBottle: cxbottle create threw', error],
        LogPrefix.Steam
      )
      return {
        status: 'error',
        error: `Failed to create CrossOver bottle "${bottleName}": ${String(error)}`
      }
    }
  } else {
    logInfo(
      `provisionBottle: resuming half-provisioned bottle "${bottleName}" (cxbottle.conf exists, Steam.exe missing) — skipping cxbottle --create`,
      LogPrefix.Steam
    )
  }

  // (5) Download the official SteamSetup.exe (HTTPS only — T-17-02), reusing
  // a cached copy on re-provision. mkdirSync the redist dir first (recursive
  // is idempotent, no throw if it already exists) — closes the ENOENT that
  // caused "Failed to download SteamSetup.exe" per the debug root cause.
  const steamSetupDir = join(deps.paths.steamSupportPath, 'redist')
  const steamSetupExePath = join(steamSetupDir, 'SteamSetup.exe')
  mkdirSync(steamSetupDir, { recursive: true })
  if (!existsSync(steamSetupExePath)) {
    try {
      await downloadSetupPayload('steam-bottle', {
        url: STEAM_SETUP_EXE_URL,
        dest: steamSetupExePath
      })
    } catch (error) {
      logError(
        ['provisionBottle: failed to download SteamSetup.exe', error],
        LogPrefix.Steam
      )
      return {
        status: 'error',
        error: `Failed to download SteamSetup.exe: ${String(error)}`
      }
    }
  }

  // (6) Pitfall 6: checkWineBeforeLaunch writes recovery via
  // the per-game config's setSetting('wineVersion', ...) — use the
  // reserved synthetic appName so it never collides with a real game.
  const bottleSettings = deps.steamBottle.getSteamBottleSettings()
  try {
    const syntheticGameInfo: GameInfo = {
      runner: 'steam',
      app_name: STEAM_BOTTLE_RESERVED_APPNAME,
      art_cover: '',
      art_square: '',
      install: {},
      is_installed: false,
      title: 'GameLib Steam Bottle',
      canRunOffline: true
    }
    const logWriter = getRunnerLogWriter('steam', {
      disableLogs: deps.config.getSettings().disableLogs
    })
    const wineOk = await checkWineBeforeLaunch(
      deps,
      syntheticGameInfo,
      bottleSettings,
      logWriter
    )
    if (wineOk && bottleSettings.wineVersion) {
      deps.steamBottle
        .configStore()
        .set('wineVersion', bottleSettings.wineVersion)
    }
  } catch (error) {
    logWarning(
      ['provisionBottle: checkWineBeforeLaunch recovery step failed', error],
      LogPrefix.Steam
    )
  }

  // (7) Run the installer NON-SILENTLY (D-02) — no /S or /VERYSILENT flags,
  // the user sees and clicks through the real installer window.
  try {
    // GAP 5: raise the installer to the front once it appears (fire-and-forget).
    // Kicked off BEFORE awaiting runWineCommand — that await does not resolve
    // until the installer closes, so it must not gate the raise.
    void raiseInstallerWindow(deps, 'provision-SteamSetup')
    await deps.commandRunner.runWineCommand({
      commandParts: [steamSetupExePath],
      gameSettings: deps.steamBottle.getSteamBottleSettings(),
      wait: false,
      protonVerb: 'run',
      skipPrefixCheckIKnowWhatImDoing: true,
      startFolder: steamSetupDir
    })
  } catch (error) {
    logError(
      ['provisionBottle: failed to launch SteamSetup.exe', error],
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: `Failed to launch SteamSetup.exe inside the bottle: ${String(error)}`
    }
  }

  // (8) GAP-17-PROVISIONED-FLAG-STUCK: only ever persist `provisioned: true`
  // here, and only when the bottled Steam.exe is genuinely present. The
  // installer's non-silent run is fire-and-forget (wait:false), so right after
  // returning here steam.exe is almost always still absent — writing the flag
  // `false` in that window (as the old unconditional set did) clobbered a
  // possibly-correct value and never re-evaluated it once the user finished the
  // click-through. Leave the flag UNTOUCHED when steam.exe is absent; the lazy
  // reconcile inside isBottleReady() flips it true the first time a real
  // bottled steam.exe is observed.
  const steamExePath = getBottleSteamExePath(bottleName)
  const steamExeReady =
    isBottleProvisioned(deps.paths, bottleName) && existsSync(steamExePath)
  if (steamExeReady) {
    deps.steamBottle.configStore().set('provisioned', true)
  }

  logInfo(
    `provisionBottle: bottle "${bottleName}" created; SteamSetup.exe launched non-silently (steamExeReady=${steamExeReady}; provisioned flag left untouched while steam.exe is absent)`,
    LogPrefix.Steam
  )

  return { status: 'done' }
}
