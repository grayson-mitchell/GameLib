import type {
  GameInfo,
  GameSettings,
  LaunchPreperationResult
} from 'common/types'
import { asStoreGame } from 'common/gameInfoNarrowing'
import { isStore } from 'common/storeCapabilities'
import type { LauncherDeps } from './launcher'
import type LogWriter from './logger/targetWriter'
import { prepareLaunch as prepareLaunchShim } from './launchrust/prepare'

/**
 * Phase 88.1 interim glue (D-01, D-30): the Launcher's `prepareLaunch` member, now that the
 * prepare step runs in Rust (`gamelib-launch`). An adapter holds no builder logic. It gathers the facts only the
 * TypeScript has (the game's info and settings, the store's hooks), makes the call through `launchrust/prepare.ts`,
 * replays the log lines Rust returned into the caller's `LogWriter` in order (the writer stays the only writer and
 * rotator until 88.3), and maps the reply to the return shape the managers read.
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
