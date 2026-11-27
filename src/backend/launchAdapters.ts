import type {
  GameInfo,
  GameSettings,
  LaunchPreperationResult,
  WineInstallation
} from 'common/types'
import { asStoreGame } from 'common/gameInfoNarrowing'
import { isStore } from 'common/storeCapabilities'
import type { Game } from 'common/types/game_manager'
import type { LauncherDeps } from './launchrust/launcher'
import type { GlobalConfigSlice } from './config'
import type { GameConfigs } from './game_config'
import type { RustInvokeDeps } from './host/rustInvokeDeps'
import type { Stores } from './services/types'
import type LogWriter from './logger/targetWriter'
import { logInfo, LogPrefix } from './logger'
import {
  prepareLaunch as prepareLaunchShim,
  prepareWineLaunchBegin,
  prepareWineLaunchFinish
} from './launchrust/prepare'
import { checkWineBeforeLaunchRust } from './launchrust/launchUtils'
import { settleEnvMap } from './launchBuilderReply'

/**
 * Phase 88.1 interim glue (D-01, D-30): the Launcher's `prepareLaunch` and `prepareWineLaunch` members, now that the
 * prepare steps run in Rust (`gamelib-launch`). An adapter holds no builder logic. It gathers the facts only the
 * TypeScript has (the game's info and settings, the store's hooks), makes the call through `launchrust/prepare.ts`,
 * replays the log lines Rust returned into the caller's `LogWriter` in order (the writer stays the only writer and
 * rotator until 88.3), runs the TypeScript store-setup hook between the two wine halves, and maps the reply to the
 * return shape the managers read.
 *
 * Deleted when the managers' launch leaves TypeScript (91 and 92), or when 88.3's `ManagerHooks` takes the hook seam
 * (D-26). The schedule in `engineWineShimSchedule.test.ts` pins the shims these call.
 */

/** One line of a per-game log, as Rust returns it: the writer method and the parts it is called with. */
interface LogLine {
  level: 'info' | 'warning' | 'error' | 'debug'
  parts: unknown[]
}

/** A place in the log only the TypeScript can fill (the EOS overlay line), by name. */
interface LogSlot {
  slot: string
}

type LogEntry = LogLine | LogSlot

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Narrows one entry of a reply's `log`, or throws. */
function settleLogEntry(entry: unknown, builder: string): LogEntry {
  if (isRecord(entry)) {
    if (typeof entry.slot === 'string') return { slot: entry.slot }
    if (
      (entry.level === 'info' ||
        entry.level === 'warning' ||
        entry.level === 'error' ||
        entry.level === 'debug') &&
      Array.isArray(entry.parts)
    ) {
      return { level: entry.level, parts: entry.parts as unknown[] }
    }
  }
  throw new Error(`${builder}: a log entry was not a line or a slot`)
}

function settleLog(
  reply: Record<string, unknown>,
  builder: string
): LogEntry[] {
  const { log } = reply
  if (!Array.isArray(log)) {
    throw new Error(`${builder}: the reply had no log`)
  }
  return log.map((entry) => settleLogEntry(entry, builder))
}

/**
 * Writes each entry of a prepare step's log through the matching `LogWriter` method, in order, with the parts as
 * the TypeScript passed them. A `{ slot }` entry calls `fill(slot)` and writes nothing when it answers `undefined`;
 * a value it answers is written as an info line (the writer holds a Promise value in place, so a late answer keeps
 * its position).
 */
export function writeLaunchLog(
  logWriter: LogWriter,
  entries: readonly LogEntry[],
  fill?: (slot: string) => string | Promise<string> | undefined
): void {
  for (const entry of entries) {
    if ('slot' in entry) {
      const text = fill?.(entry.slot)
      if (text !== undefined) void logWriter.logInfo(text)
      continue
    }
    switch (entry.level) {
      case 'info':
        void logWriter.logInfo(...(entry.parts as [unknown]))
        break
      case 'warning':
        void logWriter.logWarning(...(entry.parts as [unknown]))
        break
      case 'error':
        void logWriter.logError(...(entry.parts as [unknown]))
        break
      case 'debug':
        void logWriter.logDebug(...(entry.parts as [unknown]))
        break
    }
  }
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  throw new Error(`prepareLaunch: ${field} was not a string`)
}

function optionalWords(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value) && value.every((word) => typeof word === 'string')) {
    return [...value]
  }
  throw new Error(`prepareLaunch: ${field} was not a list of words`)
}

/**
 * The prepare step of a launch for a store manager (the Launcher's `prepareLaunch`): the facts only the TypeScript
 * has go to Rust, the log it returns is replayed into `logWriter`, and the answer is the old
 * `LaunchPreperationResult` (without the Discord client, which is gone).
 */
export async function prepareLaunch(
  deps: LauncherDeps,
  gameSettings: GameSettings,
  logWriter: LogWriter,
  gameInfo: GameInfo
): Promise<LaunchPreperationResult> {
  const { runner } = gameInfo
  const installPath = isStore(gameInfo, 'sideload')
    ? gameInfo.folder_name
    : gameInfo.install?.install_path

  const reply: unknown = await prepareLaunchShim(deps, {
    settings: gameSettings,
    runner,
    appName: gameInfo.app_name,
    title: gameInfo.title,
    canRunOffline: Boolean(gameInfo.canRunOffline),
    thirdPartyManagedApp: gameInfo.thirdPartyManagedApp || undefined,
    installPath,
    isNative: deps.libraryManagers[runner]
      .getGame(gameInfo.app_name)
      .isNative(),
    storeExpired: deps.launchHooks[runner].storeExpired?.() ?? false,
    namespace: asStoreGame(gameInfo, 'legendary')?.namespace
  })

  if (!isRecord(reply) || typeof reply.success !== 'boolean') {
    throw new Error('prepareLaunch: the reply was not a prepare result')
  }
  writeLaunchLog(logWriter, settleLog(reply, 'prepareLaunch'))

  const result: LaunchPreperationResult = { success: reply.success }
  const failureReason = optionalString(reply.failureReason, 'failureReason')
  if (failureReason !== undefined) result.failureReason = failureReason
  const mangoHudCommand = optionalWords(
    reply.mangoHudCommand,
    'mangoHudCommand'
  )
  if (mangoHudCommand !== undefined) result.mangoHudCommand = mangoHudCommand
  const gameModeBin = optionalString(reply.gameModeBin, 'gameModeBin')
  if (gameModeBin !== undefined) result.gameModeBin = gameModeBin
  const gameScopeCommand = optionalWords(
    reply.gameScopeCommand,
    'gameScopeCommand'
  )
  if (gameScopeCommand !== undefined) result.gameScopeCommand = gameScopeCommand
  if (typeof reply.offlineMode === 'boolean') {
    result.offlineMode = reply.offlineMode
  }
  return result
}

/** What `prepareWineLaunch` answers: the environment of the wine launch, or why it did not go on. */
export interface PrepareWineLaunchResult {
  success: boolean
  failureReason?: string
  envVars?: Record<string, string>
  knownFixEnv?: Record<string, string>
}

/**
 * The wine prepare step of a launch (the Launcher's `prepareWineLaunch`): Rust's first half, then the store's own
 * setup hook where the TypeScript ran it (only when the prefix or bottle gained this game), then Rust's second half.
 * `opts.mergesTier1Env` is false for the callers that do not merge tier-1 `envVariables` (the sideload path).
 */
export async function prepareWineLaunch(
  deps: LauncherDeps,
  game: Game,
  logWriter: LogWriter,
  opts: { mergesTier1Env?: boolean } = {}
): Promise<PrepareWineLaunchResult> {
  const gameInfo = game.getGameInfo()
  const { runner } = gameInfo
  const storedSettings = await game.getSettings()
  const hooks = deps.launchHooks[runner]

  const beginReply: unknown = await prepareWineLaunchBegin(deps, {
    runner,
    appName: gameInfo.app_name,
    title: gameInfo.title,
    canRunOffline: Boolean(gameInfo.canRunOffline),
    folderName: gameInfo.folder_name,
    storedSettings
  })
  if (!isRecord(beginReply) || typeof beginReply.success !== 'boolean') {
    throw new Error('prepareWineLaunch: the begin reply was not a result')
  }
  // The overlay line is the runner's own check, answered here and written in place (unawaited, as before).
  writeLaunchLog(
    logWriter,
    settleLog(beginReply, 'prepareWineLaunch'),
    (slot) =>
      slot === 'eosOverlay'
        ? hooks
            .isOverlayEnabled?.(gameInfo.app_name)
            .then(
              (enabled) => `EOS Overlay: ${enabled ? 'Enabled' : 'Not enabled'}`
            )
        : undefined
  )

  if (!beginReply.success) {
    const failureReason = optionalString(
      beginReply.failureReason,
      'failureReason'
    )
    return failureReason === undefined
      ? { success: false }
      : { success: false, failureReason }
  }

  const settings = beginReply.settings
  if (!isRecord(settings)) {
    throw new Error('prepareWineLaunch: the begin reply had no settings')
  }
  // The crate checked the object; the adapter hands it back to the finish step unmodified (T-88.1-39).
  const launchSettings = settings as unknown as GameSettings
  const prefixUpdated = beginReply.prefixUpdated === true

  if (prefixUpdated) {
    logInfo(
      ['Created/Updated Wineprefix at', launchSettings.winePrefix],
      LogPrefix.Backend
    )
    await hooks.prepareLaunch?.(gameInfo.app_name, logWriter)
  }

  const finishReply: unknown = await prepareWineLaunchFinish(deps, {
    runner,
    appName: gameInfo.app_name,
    title: gameInfo.title,
    installPath: gameInfo.install?.install_path,
    folderName: gameInfo.folder_name,
    settings: launchSettings,
    storedSettings,
    prefixUpdated,
    mergesTier1Env: opts.mergesTier1Env !== false,
    isGog: isStore(gameInfo, 'gog'),
    cometSupport: deps.config.getSettings().experimentalFeatures?.cometSupport
  })
  if (!isRecord(finishReply) || typeof finishReply.success !== 'boolean') {
    throw new Error('prepareWineLaunch: the finish reply was not a result')
  }
  writeLaunchLog(logWriter, settleLog(finishReply, 'prepareWineLaunch'))

  if (!finishReply.success) return { success: false }
  return {
    success: true,
    envVars: settleEnvMap(finishReply.envVars, 'prepareWineLaunch envVars'),
    knownFixEnv: settleEnvMap(
      finishReply.knownFixEnv,
      'prepareWineLaunch knownFixEnv'
    )
  }
}

/** What `checkWineBeforeLaunch` reads and writes: the Rust transport, the global settings and the per-game config. */
export type CheckWineBeforeLaunchDeps = RustInvokeDeps & {
  config: Pick<GlobalConfigSlice, 'getSettings' | 'setSetting'>
  gameConfigs: Pick<GameConfigs, 'get'>
  stores: Pick<Stores, 'kvs'>
}

/** Narrows the wine Rust chose: the object the crate built from its own validated discovery or download. */
function settleWine(value: unknown, field: string): WineInstallation {
  if (
    isRecord(value) &&
    typeof value.bin === 'string' &&
    typeof value.name === 'string' &&
    typeof value.type === 'string'
  ) {
    return value as unknown as WineInstallation
  }
  throw new Error(`checkWineBeforeLaunch: ${field} was not a wine installation`)
}

/**
 * The wine self-heal before a launch or a setup (`checkWineBeforeLaunch`, D-28): Rust checks the game's wine and, when it
 * is not valid, tries the default wine, the wines found on the machine and a default wine download, asking the user
 * where the old code did. Rust writes no config (Pitfall 7); the reply carries every write as data, which this applies as
 * the TypeScript did: the log lines into the caller's writer, `gameSettings.wineVersion` set in place (the recorded
 * quirk, D-20), the game's `wineVersion` setting when `persistGameWine`, and the global one (the default wine just
 * downloaded) when `globalWineVersion`. Only the `wineVersion` key is written, with the wine Rust chose (T-88.1-40).
 * Answers whether the launch goes on.
 */
export async function checkWineBeforeLaunch(
  deps: CheckWineBeforeLaunchDeps,
  gameInfo: GameInfo,
  gameSettings: GameSettings,
  logWriter: LogWriter
): Promise<boolean> {
  const { disableLogs } = deps.config.getSettings()
  const reply: unknown = await checkWineBeforeLaunchRust(deps, {
    appName: gameInfo.app_name,
    runner: gameInfo.runner,
    wineVersion: gameSettings.wineVersion,
    verboseLogs: gameSettings.verboseLogs,
    disableLogs
  })
  if (!isRecord(reply) || typeof reply.ok !== 'boolean') {
    throw new Error('checkWineBeforeLaunch: the reply was not a check result')
  }
  writeLaunchLog(logWriter, settleLog(reply, 'checkWineBeforeLaunch'))

  const wine =
    reply.wineVersion === undefined || reply.wineVersion === null
      ? undefined
      : settleWine(reply.wineVersion, 'wineVersion')
  const globalWine =
    reply.globalWineVersion === undefined || reply.globalWineVersion === null
      ? undefined
      : settleWine(reply.globalWineVersion, 'globalWineVersion')

  // The global write came first in the TypeScript: the default wine was set when it was downloaded.
  if (globalWine !== undefined) {
    deps.config.setSetting('wineVersion', globalWine, deps.stores.kvs)
  }
  if (wine !== undefined) {
    gameSettings.wineVersion = wine
    if (reply.persistGameWine === true) {
      deps.gameConfigs.get(gameInfo.app_name).setSetting('wineVersion', wine)
    }
  }
  return reply.ok
}
